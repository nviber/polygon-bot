import assert from "node:assert/strict";
import test from "node:test";
import type { PaperState } from "../domain.js";
import { summarizeHistory } from "./history.js";

const now = Date.parse("2026-10-24T12:00:00.000Z");
const state: PaperState = {
  cash: 1_000,
  startingCash: 1_000,
  positions: [
    { id: "recent-win", marketId: "recent", question: "Recent", outcome: "Up", tokenId: "1", shares: 1, entryPrice: 0.5, entryFeeUsd: 0, openedAt: "2026-10-20T12:00:00.000Z", expiresAt: "2026-10-20T12:05:00.000Z", status: "SETTLED", realizedPnl: 0.5, settledAt: "2026-10-23T12:00:00.000Z" },
    { id: "old-loss", marketId: "old", question: "Old", outcome: "Down", tokenId: "2", shares: 1, entryPrice: 0.5, entryFeeUsd: 0, openedAt: "2026-09-01T12:00:00.000Z", expiresAt: "2026-09-01T12:05:00.000Z", status: "SETTLED", realizedPnl: -0.25, settledAt: "2026-09-01T12:05:00.000Z" },
  ],
  arbitragePositions: [
    { id: "recent-arbitrage", marketId: "basket", question: "Basket", firstOutcome: "Up", secondOutcome: "Down", sharesPerOutcome: 1, totalCostUsd: 0.9, totalFeeUsd: 0, guaranteedPayoutUsd: 1, lockedProfitUsd: 0.1, openedAt: "2026-10-22T12:00:00.000Z", status: "OPEN" },
    { id: "old-arbitrage", marketId: "old-basket", question: "Old basket", firstOutcome: "Up", secondOutcome: "Down", sharesPerOutcome: 1, totalCostUsd: 0.9, totalFeeUsd: 0, guaranteedPayoutUsd: 1, lockedProfitUsd: 0.2, openedAt: "2026-09-01T12:00:00.000Z", status: "REDEEMED" },
  ],
  dailyRealizedPnl: {},
  events: [
    { at: "2026-10-23T12:00:00.000Z", type: "PAPER_SETTLEMENT", message: "recent settlement" },
    { at: "2026-10-22T12:00:00.000Z", type: "PAPER_ARBITRAGE", message: "recent basket" },
    { at: "2026-09-01T12:05:00.000Z", type: "PAPER_SETTLEMENT", message: "old settlement" },
  ],
};

test("history defaults to all time and retains redeemed basket profit", () => {
  const summary = summarizeHistory(state, undefined, now);

  assert.equal(summary.period, "all");
  assert.equal(summary.realizedProfit, 0.25);
  assert.equal(summary.lockedProfit, 0.3);
  assert.equal(summary.totalProfit, 0.55);
  assert.equal(summary.events.length, 3);
});

test("selected periods filter activity and attribute realized profit to settlement time", () => {
  const summary = summarizeHistory(state, "7d", now);

  assert.equal(summary.realizedProfit, 0.5);
  assert.equal(summary.lockedProfit, 0.1);
  assert.equal(summary.totalProfit, 0.6);
  assert.equal(summary.tradeCount, 1);
  assert.deepEqual(summary.events.map(({ message }) => message), ["recent settlement", "recent basket"]);
});
