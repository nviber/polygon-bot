import assert from "node:assert/strict";
import test from "node:test";
import type { Position } from "../domain.js";
import { summarizeStrategyPerformance } from "./performance.js";

const position = (overrides: Partial<Position>): Position => ({
  id: "position",
  marketId: "market",
  question: "BTC Up or Down?",
  outcome: "Up",
  tokenId: "up",
  shares: 2,
  entryPrice: 0.4,
  entryFeeUsd: 0.02,
  openedAt: "2026-10-01T00:00:00.000Z",
  expiresAt: "2026-10-01T00:05:00.000Z",
  status: "OPEN",
  ...overrides,
});

test("strategy results count only settled net P&L and report open and legacy positions separately", () => {
  const summaries = summarizeStrategyPerformance([
    position({ id: "resolved", strategyId: "btc-intraday-reversal", status: "SETTLED", realizedPnl: -0.82 }),
    position({ id: "unresolved", strategyId: "btc-intraday-reversal", status: "OPEN" }),
    position({ id: "legacy", status: "SETTLED", realizedPnl: 0.5 }),
    position({ id: "unattributed-open", status: "OPEN" }),
  ]);
  const reversal = summaries.find(({ strategyId }) => strategyId === "btc-intraday-reversal");
  const legacy = summaries.find(({ strategyId }) => strategyId === null);

  assert.deepEqual(reversal, {
    strategyId: "btc-intraday-reversal",
    label: "90s overreaction reversal",
    resolvedPositionCount: 1,
    realizedNetPnl: -0.82,
    openPositionCount: 1,
  });
  assert.deepEqual(legacy, {
    strategyId: null,
    label: "Unattributed / legacy",
    resolvedPositionCount: 1,
    realizedNetPnl: 0.5,
    openPositionCount: 1,
  });
});

test("a settled record without a realized value is not counted as profitability evidence", () => {
  const summaries = summarizeStrategyPerformance([
    position({ strategyId: "btc-range-breakout", status: "SETTLED" }),
  ]);

  assert.deepEqual(summaries.find(({ strategyId }) => strategyId === "btc-range-breakout"), {
    strategyId: "btc-range-breakout",
    label: "5m trading-range breakout",
    resolvedPositionCount: 0,
    realizedNetPnl: 0,
    openPositionCount: 0,
  });
});
