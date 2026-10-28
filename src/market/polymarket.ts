import type { BinaryMarket, Book, Outcome, SportsMarketCandidate } from "../domain.js";
import { fetchPublic } from "./http.js";

const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

type GammaMarket = {
  id: string;
  question: string;
  slug: string;
  active: boolean;
  closed: boolean;
  endDate?: string;
  outcomePrices?: string;
  outcomes?: string;
  clobTokenIds?: string;
  resolutionStatus?: string;
  umaResolutionStatus?: string;
  acceptingOrders?: boolean;
  eventStartTime?: string;
  cryptoMarketConfig?: {
    asset?: string;
    duration?: string;
  };
  sportsMarketType?: string;
  gameStartTime?: string;
};

type GammaEvent = {
  title?: string;
  tags?: { slug?: string }[];
  markets?: GammaMarket[];
};

function jsonArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  }
  catch {
    return [];
  }
}

function inferAsset(question: string): "BTC" | "ETH" | undefined {
  const normalized = question.toUpperCase();

  if (normalized.includes("BITCOIN") || /\bBTC\b/.test(normalized)) {
    return "BTC";
  }

  if (normalized.includes("ETHEREUM") || /\bETH\b/.test(normalized)) {
    return "ETH";
  }

  return undefined;
}

export class PolymarketPublicClient {
  async findActiveShortHorizon(
    asset: "BTC" | "ETH" = "BTC",
    now = new Date(),
  ): Promise<BinaryMarket | undefined> {
    const windowSeconds = Math.floor(now.getTime() / 300_000) * 300;
    const slug = `${asset.toLocaleLowerCase()}-updown-5m-${windowSeconds}`;
    const response = await fetchPublic(
      `${GAMMA}/events?slug=${encodeURIComponent(slug)}`,
      "Polymarket 5-minute market discovery",
    );

    if (!response.ok) {
      throw new Error(`Gamma event request failed: ${response.status}`);
    }

    const events = await response.json() as GammaEvent[];
    const nowMs = now.getTime();
    const candidates = events.flatMap((event) => event.markets ?? []).flatMap((raw): BinaryMarket[] => {
      const startsAtMs = raw.eventStartTime ? new Date(raw.eventStartTime).getTime() : Number.NaN;
      const closesAtMs = raw.endDate ? new Date(raw.endDate).getTime() : Number.NaN;
      const configuredAsset = raw.cryptoMarketConfig?.asset?.toLocaleUpperCase();
      const market = this.toBinaryMarket(raw);

      if (
        !market
        || market.asset !== asset
        || !market.active
        || raw.acceptingOrders === false
        || configuredAsset !== asset
        || raw.cryptoMarketConfig?.duration !== "5m"
        || !Number.isFinite(startsAtMs)
        || !Number.isFinite(closesAtMs)
        || startsAtMs > nowMs
        || closesAtMs - nowMs <= 45_000
        || closesAtMs - nowMs > 5 * 60_000
      ) {
        return [];
      }

      return [market];
    });

    return candidates.sort((a, b) => new Date(a.closesAt).getTime() - new Date(b.closesAt).getTime())[0];
  }

  async findBySlug(slug: string): Promise<BinaryMarket | undefined> {
    const response = await fetchPublic(`${GAMMA}/markets?slug=${encodeURIComponent(slug)}&limit=1`, "Polymarket market lookup");

    if (!response.ok) {
      throw new Error(`Gamma market request failed: ${response.status}`);
    }

    const markets = await response.json() as GammaMarket[];
    return markets.map((market) => this.toBinaryMarket(market)).find((market) => market !== undefined);
  }

  async findResolvedOutcomeById(marketId: string): Promise<Outcome | undefined> {
    const response = await fetchPublic(
      `${GAMMA}/markets/${encodeURIComponent(marketId)}`,
      "Polymarket market resolution lookup",
    );

    if (!response.ok) {
      throw new Error(`Gamma market resolution request failed: ${response.status}`);
    }

    const market = await response.json() as GammaMarket;
    const hasResolutionStatus = market.resolutionStatus === "resolved"
      || market.umaResolutionStatus === "resolved"
      || market.umaResolutionStatus === "settled";

    if (!market.closed || !hasResolutionStatus) {
      return undefined;
    }

    const outcomes = jsonArray(market.outcomes);
    const prices = jsonArray(market.outcomePrices).map(Number);

    if (outcomes.length !== 2 || prices.length !== 2 || prices.some((price) => !Number.isFinite(price))) {
      return undefined;
    }

    if (prices[0] === 1 && prices[1] === 0) {
      return outcomes[0];
    }

    if (prices[0] === 0 && prices[1] === 1) {
      return outcomes[1];
    }

    return undefined;
  }

  async findActiveSportsMoneylines(now = new Date()): Promise<SportsMarketCandidate[]> {
    const events: GammaEvent[] = [];

    for (let offset = 0; offset < 500; offset += 100) {
      const params = new URLSearchParams({
        tag_slug: "sports",
        active: "true",
        closed: "false",
        limit: "100",
        offset: String(offset),
        order: "endDate",
        ascending: "true",
        end_date_min: now.toISOString(),
      });
      const response = await fetchPublic(`${GAMMA}/events?${params}`, "Polymarket sports discovery");

      if (!response.ok) {
        throw new Error(`Gamma sports request failed: ${response.status}`);
      }

      const page = await response.json() as GammaEvent[];
      events.push(...page);

      if (page.length < 100) {
        break;
      }
    }
    const earliestStart = now.getTime() + 5 * 60_000;
    const latestStart = now.getTime() + 3 * 24 * 60 * 60_000;
    const candidates = events.flatMap((event) => {
      const tags = event.tags?.flatMap((tag) => tag.slug ? [tag.slug] : []) ?? [];

      return (event.markets ?? []).flatMap((raw): SportsMarketCandidate[] => {
        const startsAt = raw.gameStartTime;
        const startsAtMs = startsAt ? new Date(startsAt).getTime() : Number.NaN;

        if (
          raw.sportsMarketType !== "moneyline"
          || !raw.active
          || raw.closed
          || raw.acceptingOrders === false
          || !startsAt
          || !Number.isFinite(startsAtMs)
          || startsAtMs < earliestStart
          || startsAtMs > latestStart
        ) {
          return [];
        }

        const market = this.toBinaryMarket(raw);

        if (!market) {
          return [];
        }

        const outcomes = market.outcomes.map((outcome) => outcome.outcome);
        const [firstOutcome, secondOutcome] = outcomes;

        if (!firstOutcome || !secondOutcome) {
          return [];
        }

        const yesNo = outcomes.map(normalizeName).sort().join("|") === "no|yes";

        if (!yesNo) {
          return [{ market, participants: [firstOutcome, secondOutcome], startsAt, tags }];
        }

        const participants = event.title ? participantsFromTitle(event.title) : undefined;
        const selection = participants ? selectionFromQuestion(raw.question, participants) : undefined;

        return participants && selection
          ? [{ market, participants, selection, startsAt, tags }]
          : [];
      });
    });

    return candidates.sort((left, right) =>
      new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
  }

  async getBook(tokenId: string): Promise<Book | undefined> {
    const response = await fetchPublic(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`, "Polymarket order book");

    if (!response.ok) {
      throw new Error(`CLOB book request failed: ${response.status}`);
    }

    const raw = await response.json() as { bids?: { price: string; size: string }[]; asks?: { price: string; size: string }[]; timestamp?: string };
    const bids = (raw.bids ?? []).filter(({ price, size }) =>
      Number.isFinite(Number(price)) && Number(price) > 0 && Number(price) < 1
      && Number.isFinite(Number(size)) && Number(size) > 0);
    const asks = (raw.asks ?? []).filter(({ price, size }) =>
      Number.isFinite(Number(price)) && Number(price) > 0 && Number(price) < 1
      && Number.isFinite(Number(size)) && Number(size) > 0);

    if (!bids.length || !asks.length) {
      return undefined;
    }

    const bestBid = Math.max(...bids.map((order) => Number(order.price)));
    const bestAsk = Math.min(...asks.map((order) => Number(order.price)));

    return {
      tokenId,
      bestBid,
      bestAsk,
      bidSize: Number(bids.find((order) => Number(order.price) === bestBid)?.size ?? 0),
      askSize: Number(asks.find((order) => Number(order.price) === bestAsk)?.size ?? 0),
      timestamp: Number(raw.timestamp ?? Date.now()),
    };
  }

  private toBinaryMarket(raw: GammaMarket): BinaryMarket | undefined {
    const asset = inferAsset(raw.question) ?? "OTHER";
    const outcomes = jsonArray(raw.outcomes).map((name) => name as Outcome);
    const tokenIds = jsonArray(raw.clobTokenIds);
    const prices = jsonArray(raw.outcomePrices).map(Number);
    if (outcomes.length !== 2 || !tokenIds[0] || !tokenIds[1] || !raw.endDate) {
      return undefined;
    }

    return {
      id: raw.id,
      question: raw.question,
      slug: raw.slug,
      asset,
      closesAt: raw.endDate,
      active: raw.active && !raw.closed,
      outcomes: [
        { outcome: outcomes[0], tokenId: tokenIds[0], price: prices[0] ?? 0.5 },
        { outcome: outcomes[1], tokenId: tokenIds[1], price: prices[1] ?? 0.5 },
      ],
    };
  }
}

const normalizeName = (value: string): string => value.trim().toLocaleLowerCase();

const participantsFromTitle = (title: string): [string, string] | undefined => {
  const match = title.match(/^(.+?)\s+(?:vs\.?|v\.?)\s+(.+)$/i);

  if (!match) {
    return undefined;
  }

  const first = match[1].trim();
  const second = match[2].trim();
  return first && second ? [first, second] : undefined;
};

const selectionFromQuestion = (question: string, participants: [string, string]): string | undefined => {
  const normalized = normalizeName(question);

  if (/\bdraw\b/.test(normalized)) {
    return "Draw";
  }

  return participants.find((participant) => normalized.includes(normalizeName(participant)));
};
