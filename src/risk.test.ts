import assert from "node:assert/strict";
import test from "node:test";
import { allowPaperExplorationTrade, allowTrade, sizeTradeAtBestAsk } from "./risk.js";
import type { BinaryMarket, Book, PaperState, TradeIntent } from "./domain.js";

const market: BinaryMarket = { id: "m1", question: "Bitcoin Up?", slug: "btc", asset: "BTC", active: true, closesAt: new Date(Date.now() + 300_000).toISOString(), outcomes: [{ outcome: "YES", tokenId: "yes", price: .5 }, { outcome: "NO", tokenId: "no", price: .5 }] };
const state: PaperState = { cash: 1000, startingCash: 1000, positions: [], arbitragePositions: [], dailyRealizedPnl: {}, events: [] };
const book: Book = { tokenId: "yes", bestBid: .49, bestAsk: .50, bidSize: 100, askSize: 100, timestamp: Date.now() };
const intent: TradeIntent = { market, outcome: "YES", tokenId: "yes", limitPrice: .5, shares: 10, estimatedEdge: .1, estimatedFeeUsd: .1, signal: { direction: "UP", probability: .6, confidence: .4, reasons: [], sources: [] } };

test("allows a liquid, bounded paper trade with adequate edge", () => assert.equal(allowTrade(intent, book, state), undefined));
test("caps a sports order at displayed best-ask shares", () => {
  assert.equal(sizeTradeAtBestAsk(10, .6, 4.123, "sports"), 4.12);
  assert.equal(sizeTradeAtBestAsk(10, .6, .009, "sports"), 0);
});
test("reports inadequate net edge before any liquidity objection", () => {
  const rejected = allowTrade({ ...intent, estimatedEdge: -.002 }, { ...book, askSize: 1 }, state);
  assert.equal(rejected, "estimated edge below threshold");
});
test("blocks stale market data", () => assert.match(allowTrade(intent, { ...book, timestamp: Date.now() - 21_000 }, state) ?? "", /stale/));
test("blocks duplicate market exposure", () => {
  state.positions.push({ id: "p", marketId: "m1", question: "", outcome: "YES", tokenId: "yes", shares: 1, entryPrice: .5, entryFeeUsd: 0, openedAt: "", expiresAt: "", status: "OPEN" });
  assert.match(allowTrade(intent, book, state) ?? "", /already open/);
});


test("paper exploration bypasses edge and portfolio gates but uses a valid live ask", () => {
  const now = new Date();
  const marketState: PaperState = {
    cash: 100,
    startingCash: 100,
    positions: [{ id: "other", marketId: "other-market", question: "", outcome: "YES", tokenId: "other", shares: 100, entryPrice: 0.9, entryFeeUsd: 0, openedAt: "", expiresAt: "", status: "OPEN" }],
    arbitragePositions: [],
    dailyRealizedPnl: { [now.toISOString().slice(0, 10)]: -100 },
    events: [],
  };
  const wideBook: Book = { ...book, bestBid: 0.2, bestAsk: 0.9, timestamp: now.getTime() };
  const exploratoryIntent: TradeIntent = { ...intent, limitPrice: 0.9, shares: 10, estimatedEdge: -0.5 };

  assert.equal(allowPaperExplorationTrade(exploratoryIntent, wideBook, marketState, now), undefined);
});

test("paper exploration retains cash, executable-depth, and duplicate-market checks", () => {
  const now = new Date();
  const freshBook = { ...book, timestamp: now.getTime() };
  const exploratoryIntent = { ...intent, estimatedEdge: -0.5 };
  const emptyState: PaperState = { cash: 0, startingCash: 100, positions: [], arbitragePositions: [], dailyRealizedPnl: {}, events: [] };

  assert.match(allowPaperExplorationTrade(exploratoryIntent, freshBook, emptyState, now) ?? "", /cash/);
  assert.match(allowPaperExplorationTrade(exploratoryIntent, { ...freshBook, askSize: 1 }, state, now) ?? "", /liquidity/);
  const duplicateState: PaperState = { ...state, positions: [{ id: "p", marketId: "m1", question: "", outcome: "YES", tokenId: "yes", shares: 1, entryPrice: 0.5, entryFeeUsd: 0, openedAt: "", expiresAt: "", status: "OPEN" }] };
  assert.match(allowPaperExplorationTrade(exploratoryIntent, freshBook, duplicateState, now) ?? "", /already open/);
});
