import assert from "node:assert/strict";
import test from "node:test";
import type { BinaryMarket, Book, PaperState, Position } from "./domain.js";
import { PaperTradingEngine } from "./engine.js";
import { OkxSpotClient } from "./market/okx.js";
import { PolymarketPublicClient } from "./market/polymarket.js";

const market: BinaryMarket = {
  id: "btc-market",
  question: "Bitcoin Up or Down?",
  slug: "btc-updown-5m-test",
  asset: "BTC",
  closesAt: new Date(Date.now() + 180_000).toISOString(),
  active: true,
  outcomes: [{ outcome: "Up", tokenId: "up", price: 0.5 }, { outcome: "Down", tokenId: "down", price: 0.5 }],
};

const book: Book = { tokenId: "", bestBid: 0.2, bestAsk: 0.75, bidSize: 100, askSize: 100, timestamp: Date.now() };

const spotTicks = [
  { price: 80_000, timestamp: Date.now() - 180_000 },
  { price: 80_100, timestamp: Date.now() - 120_000 },
  { price: 80_200, timestamp: Date.now() - 60_000 },
  { price: 82_000, timestamp: Date.now() },
];

class FakeMarkets extends PolymarketPublicClient {
  override async findActiveShortHorizon(): Promise<BinaryMarket> {
    return market;
  }

  override async getBook(tokenId: string): Promise<Book> {
    return { ...book, tokenId };
  }
}

class UnavailableBookMarkets extends PolymarketPublicClient {
  bookRequests = 0;

  override async findActiveShortHorizon(): Promise<BinaryMarket> {
    return market;
  }

  override async getBook(): Promise<undefined> {
    this.bookRequests += 1;
    return undefined;
  }
}

class FailedBookMarkets extends FakeMarkets {
  override async getBook(): Promise<Book> {
    throw new Error("CLOB book request failed: 503");
  }
}

class ResolutionMarkets extends PolymarketPublicClient {
  readonly lookups: string[] = [];

  constructor(private readonly winningOutcome: string | undefined) {
    super();
  }

  override async findResolvedOutcomeById(marketId: string): Promise<string | undefined> {
    this.lookups.push(marketId);
    return this.winningOutcome;
  }
}

class FakeSpot extends OkxSpotClient {
  constructor() {
    super("BTC-USDT");
  }

  override async latest() {
    return { price: 80_000, timestamp: Date.now() };
  }
}


class RisingResearchSpot extends FakeSpot {
  private index = 0;
  private readonly start = Date.now() - 255_000;

  override async latest(): Promise<{ price: number; timestamp: number }> {
    const index = Math.min(this.index++, 17);
    return { price: 80_000 + index * 40, timestamp: this.start + index * 15_000 };
  }
}

class TradableResearchMarkets extends FakeMarkets {
  override async getBook(tokenId: string): Promise<Book> {
    return { tokenId, bestBid: 0.49, bestAsk: 0.5, bidSize: 100, askSize: 100, timestamp: Date.now() };
  }
}

class UnavailableSpot extends FakeSpot {
  override async latest(): Promise<never> {
    throw new Error("spot feed unavailable");
  }
}

class SequencedSpot extends FakeSpot {
  private index = 0;

  override async latest() {
    return spotTicks[this.index++] ?? spotTicks.at(-1)!;
  }
}

const freshState = (): PaperState => ({
  cash: 100,
  startingCash: 100,
  positions: [],
  arbitragePositions: [],
  dailyRealizedPnl: {},
  events: [],
});

const expiredPosition = (overrides: Partial<Position> = {}): Position => ({
  id: "position",
  marketId: "btc-market",
  question: "Bitcoin Up or Down?",
  outcome: "Up",
  tokenId: "up",
  shares: 2,
  entryPrice: 0.4,
  entryFeeUsd: 0.05,
  openedAt: new Date(Date.now() - 600_000).toISOString(),
  expiresAt: new Date(Date.now() - 300_000).toISOString(),
  status: "OPEN",
  ...overrides,
});

test("settles expired BTC positions from the provider outcome and records win/loss accounting", async () => {
  const markets = new ResolutionMarkets("Up");
  const engine = new PaperTradingEngine(markets);
  const state = freshState();
  state.cash = 50;
  state.positions.push(
    expiredPosition({ strategyId: "btc-intraday-reversal" }),
    expiredPosition({ id: "loser", outcome: "Down", shares: 3, entryPrice: 0.25, entryFeeUsd: 0.02 }),
  );
  engine.setStrategies([]);

  const decision = await engine.tick(state);

  assert.match(decision, /settled 2 expired positions/);
  assert.deepEqual(markets.lookups, ["btc-market"]);
  assert.deepEqual(state.positions.map(({ status }) => status), ["SETTLED", "SETTLED"]);
  assert.equal(state.positions[0].realizedPnl, 1.15);
  assert.equal(state.positions[0].strategyId, "btc-intraday-reversal");
  assert.equal(state.positions[1].realizedPnl, -0.77);
  assert.equal(state.cash, 52);
  assert.equal(state.dailyRealizedPnl[new Date().toISOString().slice(0, 10)], 0.38);
  assert.equal(state.events.filter(({ type }) => type === "PAPER_SETTLEMENT").length, 2);
});

test("keeps expired BTC positions open while provider resolution is unavailable", async () => {
  const markets = new ResolutionMarkets(undefined);
  const engine = new PaperTradingEngine(markets);
  const state = freshState();
  const position = expiredPosition();
  state.positions.push(position);
  engine.setStrategies([]);

  const decision = await engine.tick(state);

  assert.match(decision, /awaiting provider resolution/);
  assert.deepEqual(markets.lookups, ["btc-market"]);
  assert.equal(position.status, "OPEN");
  assert.equal(position.realizedPnl, undefined);
  assert.equal(state.cash, 100);
  assert.deepEqual(state.dailyRealizedPnl, {});
});

test("does not query or settle a position before its market expires", async () => {
  const markets = new ResolutionMarkets("Up");
  const engine = new PaperTradingEngine(markets);
  const state = freshState();
  const position = expiredPosition({ expiresAt: new Date(Date.now() + 60_000).toISOString() });
  state.positions.push(position);
  engine.setStrategies([]);

  await engine.tick(state);

  assert.deepEqual(markets.lookups, []);
  assert.equal(position.status, "OPEN");
});

test("first default BTC tick records a paper fill despite negative edge and wide spread", async () => {
  const engine = new PaperTradingEngine(new FakeMarkets(), new FakeSpot());
  engine.setStrategies(["btc-5m-momentum", "btc-paper-exploration"]);
  const state = freshState();
  const decision = await engine.tick(state);

  assert.match(decision, /BTC momentum: observing/);
  assert.match(decision, /btc-paper-exploration: PAPER BUY/);
  assert.match(decision, /non-predictive paper exploration/);
  assert.equal(state.positions.length, 1);
  assert.equal(state.events[0].type, "PAPER_FILL");
  assert.match(state.events[0].message, /btc-paper-exploration/);
});

test("tick skips unavailable books and continues other enabled BTC strategies", async () => {
  const markets = new UnavailableBookMarkets();
  const engine = new PaperTradingEngine(markets, new SequencedSpot());
  const state = freshState();
  engine.setStrategies(["btc-5m-momentum"]);

  await engine.tick(state);
  await engine.tick(state);
  await engine.tick(state);
  engine.setStrategies(["btc-5m-momentum", "btc-paper-exploration"]);
  const decision = await engine.tick(state);

  assert.match(decision, /btc-5m-momentum: no trade; order book has no executable two-sided liquidity/);
  assert.match(decision, /btc-paper-exploration: no trade; order book has no executable two-sided liquidity/);
  assert.equal(markets.bookRequests, 2);
  assert.equal(state.positions.length, 0);
  assert.equal(state.events.length, 0);
});

test("tick still surfaces genuine order-book request failures", async () => {
  const engine = new PaperTradingEngine(new FailedBookMarkets());
  engine.setStrategies(["btc-paper-exploration"]);

  await assert.rejects(engine.tick(freshState()), /CLOB book request failed: 503/);
});

test("paper exploration runs when the BTC spot feed is unavailable", async () => {
  const engine = new PaperTradingEngine(new FakeMarkets(), new UnavailableSpot());
  engine.setStrategies(["btc-5m-momentum", "btc-paper-exploration"]);
  const state = freshState();
  const decision = await engine.tick(state);

  assert.match(decision, /BTC momentum unavailable: spot feed unavailable/);
  assert.match(decision, /btc-paper-exploration: PAPER BUY/);
  assert.equal(state.positions.length, 1);
});

test("research candidate fills are tagged with the isolated strategy ID", async () => {
  const engine = new PaperTradingEngine(new TradableResearchMarkets(), new RisingResearchSpot());
  engine.setStrategies(["btc-5m-time-series-momentum"]);
  const state = freshState();
  let decision = "";

  for (let tick = 0; tick < 18; tick += 1) {
    decision = await engine.tick(state);

    if (state.positions.length > 0) {
      break;
    }
  }

  assert.match(decision, /btc-5m-time-series-momentum: PAPER BUY/);
  assert.equal(state.positions.length, 1);
  assert.equal(state.positions[0].strategyId, "btc-5m-time-series-momentum");
});

test("exploration does not reopen a market with an existing position", async () => {
  const engine = new PaperTradingEngine(new FakeMarkets());
  engine.setStrategies(["btc-paper-exploration"]);
  const state = freshState();

  await engine.tick(state);
  const decision = await engine.tick(state);

  assert.match(decision, /position already open/);
  assert.equal(state.positions.length, 1);
});
