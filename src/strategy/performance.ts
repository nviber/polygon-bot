import type { Position } from "../domain.js";
import { strategyOptions } from "./registry.js";

export interface StrategyPerformance {
  strategyId: string | null;
  label: string;
  resolvedPositionCount: number;
  realizedNetPnl: number;
  openPositionCount: number;
}

export const summarizeStrategyPerformance = (positions: readonly Position[]): StrategyPerformance[] => {
  const knownIds = new Set<string>(strategyOptions.map((strategy) => strategy.id));
  const summaries = new Map<string | null, StrategyPerformance>(
    strategyOptions.map((strategy) => [strategy.id, {
      strategyId: strategy.id,
      label: strategy.label,
      resolvedPositionCount: 0,
      realizedNetPnl: 0,
      openPositionCount: 0,
    }]),
  );

  for (const position of positions) {
    const strategyId = position.strategyId && knownIds.has(position.strategyId) ? position.strategyId : null;
    let summary = summaries.get(strategyId);

    if (!summary) {
      summary = {
        strategyId: null,
        label: "Unattributed / legacy",
        resolvedPositionCount: 0,
        realizedNetPnl: 0,
        openPositionCount: 0,
      };
      summaries.set(null, summary);
    }

    if (position.status === "OPEN") {
      summary.openPositionCount += 1;
    }
    else if (position.status === "SETTLED" && Number.isFinite(position.realizedPnl)) {
      summary.resolvedPositionCount += 1;
      summary.realizedNetPnl += position.realizedPnl!;
    }
  }

  return [...summaries.values()]
    .map((summary) => ({ ...summary, realizedNetPnl: Math.round(summary.realizedNetPnl * 100_000) / 100_000 }));
};
