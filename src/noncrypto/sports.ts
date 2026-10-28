import type { SportsMarketCandidate } from "../domain.js";
import { fetchPublic } from "../market/http.js";

interface SportsCatalogEntry {
  key: string;
  title: string;
  active: boolean;
}

interface SportsEvent {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: { markets: { key: string; outcomes: { name: string; price: number }[] }[] }[];
}

export interface SportsConsensusMatch {
  candidate: SportsMarketCandidate;
  referenceOutcome: string;
  probability: number;
  bookmakerCount: number;
  eventLabel: string;
  sportKey: string;
}

interface CachedEvents {
  expiresAt: number;
  events: SportsEvent[];
}

const ignoredTags = new Set([
  "sports",
  "games",
  "soccer",
  "football",
  "basketball",
  "baseball",
  "hockey",
  "esports",
]);

const leagueAliases: Record<string, string[]> = {
  epl: ["soccer_epl"],
  "english-premier-league": ["soccer_epl"],
  mls: ["soccer_usa_mls"],
  nba: ["basketball_nba"],
  ncaab: ["basketball_ncaab"],
  nfl: ["americanfootball_nfl"],
  ncaaf: ["americanfootball_ncaaf"],
  nhl: ["icehockey_nhl", "icehockey_nhl_preseason"],
  mlb: ["baseball_mlb"],
  wnba: ["basketball_wnba"],
  "uefa-champions-league": ["soccer_uefa_champs_league"],
};

export class SportsOddsClient {
  private catalog?: Promise<SportsCatalogEntry[]>;
  private readonly eventsCache = new Map<string, CachedEvents>();

  constructor(
    private readonly apiKey: string,
    private readonly cacheMs = 30 * 60_000,
  ) {}

  async consensusProbability(
    sportKey: string,
    homeTeam: string,
    awayTeam: string,
    team: string,
  ): Promise<number> {
    const events = await this.eventsFor(sportKey);
    const event = events.find((candidate) =>
      sameTeam(candidate.home_team, homeTeam) && sameTeam(candidate.away_team, awayTeam));

    if (!event) {
      throw new Error(`No odds event matches ${awayTeam} at ${homeTeam}`);
    }

    const consensus = consensusFor(event, team);

    if (!consensus) {
      throw new Error("Fewer than two usable sportsbook prices are available");
    }

    return consensus.probability;
  }

  async findConsensus(candidates: readonly SportsMarketCandidate[]): Promise<SportsConsensusMatch | undefined> {
    const catalog = await this.sportsCatalog();
    const queried = new Set<string>();

    for (const candidate of candidates) {
      const sportKeys = sportKeysFor(candidate.tags, catalog);

      for (const sportKey of sportKeys) {
        if (!queried.has(sportKey) && queried.size >= 4) {
          continue;
        }

        queried.add(sportKey);
        const events = await this.eventsFor(sportKey);
        const matches = events.filter((event) => eventMatches(candidate, event));

        if (matches.length !== 1) {
          continue;
        }

        const event = matches[0];
        const selectedTeam = candidate.selection ?? candidate.market.outcomes[0].outcome;
        const consensus = consensusFor(event, selectedTeam);

        if (!consensus) {
          continue;
        }

        return {
          candidate,
          referenceOutcome: candidate.selection ? "Yes" : selectedTeam,
          probability: consensus.probability,
          bookmakerCount: consensus.bookmakerCount,
          eventLabel: `${event.away_team} at ${event.home_team}`,
          sportKey,
        };
      }
    }

    return undefined;
  }

  private async sportsCatalog(): Promise<SportsCatalogEntry[]> {
    this.catalog ??= this.fetchSportsCatalog();
    return this.catalog;
  }

  private async fetchSportsCatalog(): Promise<SportsCatalogEntry[]> {
    const params = new URLSearchParams({ apiKey: this.apiKey });
    const response = await fetchPublic(`https://api.the-odds-api.com/v4/sports/?${params}`, "Sports catalog");

    if (!response.ok) {
      throw new Error(`Sports catalog request failed: ${response.status}`);
    }

    return response.json() as Promise<SportsCatalogEntry[]>;
  }

  private async eventsFor(sportKey: string): Promise<SportsEvent[]> {
    const cached = this.eventsCache.get(sportKey);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.events;
    }

    const params = new URLSearchParams({
      apiKey: this.apiKey,
      regions: "us",
      markets: "h2h",
      oddsFormat: "decimal",
    });
    const response = await fetchPublic(
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds?${params}`,
      "Sports odds",
    );

    if (!response.ok) {
      throw new Error(`Sports odds request failed for ${sportKey}: ${response.status}`);
    }

    const events = await response.json() as SportsEvent[];
    this.eventsCache.set(sportKey, { expiresAt: Date.now() + this.cacheMs, events });
    return events;
  }
}

const sportKeysFor = (
  tags: readonly string[],
  catalog: readonly SportsCatalogEntry[],
): string[] => {
  const requested = new Set<string>();

  for (const tag of tags) {
    for (const alias of leagueAliases[tag] ?? []) {
      requested.add(alias);
    }

    if (ignoredTags.has(tag)) {
      continue;
    }

    const normalizedTag = normalizeName(tag);

    for (const sport of catalog) {
      const normalizedTitle = normalizeName(sport.title);
      const normalizedKey = normalizeName(sport.key);

      if (normalizedTitle === normalizedTag || normalizedKey.endsWith(normalizedTag)) {
        requested.add(sport.key);
      }
    }
  }

  return catalog
    .filter((sport) => sport.active && requested.has(sport.key) && !/(winner|outright)/i.test(sport.key))
    .map((sport) => sport.key);
};

const eventMatches = (candidate: SportsMarketCandidate, event: SportsEvent): boolean => {
  const startDifference = Math.abs(
    new Date(candidate.startsAt).getTime() - new Date(event.commence_time).getTime(),
  );

  if (!Number.isFinite(startDifference) || startDifference > 8 * 60 * 60_000) {
    return false;
  }

  const [first, second] = candidate.participants;
  return (
    teamNamesMatch(first, event.home_team) && teamNamesMatch(second, event.away_team)
  ) || (
    teamNamesMatch(first, event.away_team) && teamNamesMatch(second, event.home_team)
  );
};

const consensusFor = (
  event: SportsEvent,
  selectedTeam: string,
): { probability: number; bookmakerCount: number } | undefined => {
  const probabilities = event.bookmakers.flatMap((bookmaker) => {
    const market = bookmaker.markets.find((candidate) => candidate.key === "h2h");

    if (!market) {
      return [];
    }

    const valid = market.outcomes.filter((outcome) => Number.isFinite(outcome.price) && outcome.price > 1);
    const selected = valid.find((outcome) => teamNamesMatch(outcome.name, selectedTeam));
    const rawTotal = valid.reduce((sum, outcome) => sum + 1 / outcome.price, 0);

    if (!selected || valid.length < 2 || rawTotal <= 0) {
      return [];
    }

    return [(1 / selected.price) / rawTotal];
  });

  if (probabilities.length < 2) {
    return undefined;
  }

  return {
    probability: probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length,
    bookmakerCount: probabilities.length,
  };
};

const normalizeName = (value: string): string => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const teamNamesMatch = (left: string, right: string): boolean => {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft === "draw" || normalizedRight === "draw") {
    return false;
  }

  const shorter = normalizedLeft.length < normalizedRight.length ? normalizedLeft : normalizedRight;
  const longer = normalizedLeft.length < normalizedRight.length ? normalizedRight : normalizedLeft;
  return shorter.length >= 5 && (` ${longer} `).includes(` ${shorter} `);
};

const sameTeam = (left: string, right: string): boolean => normalizeName(left) === normalizeName(right);
