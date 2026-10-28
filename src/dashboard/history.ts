import type { PaperState } from "../domain.js";

export const historyPeriods = ["all", "24h", "7d", "30d"] as const;

export type HistoryPeriod = (typeof historyPeriods)[number];

export interface HistorySummary {
  period: HistoryPeriod;
  realizedProfit: number;
  lockedProfit: number;
  totalProfit: number;
  tradeCount: number;
  events: PaperState["events"];
}

const periodMilliseconds: Partial<Record<HistoryPeriod, number>> = {
  "24h": 24 * 60 * 60 * 1_000,
  "7d": 7 * 24 * 60 * 60 * 1_000,
  "30d": 30 * 24 * 60 * 60 * 1_000,
};

const isInPeriod = (timestamp: string, period: HistoryPeriod, now: number): boolean => {
  const time = new Date(timestamp).getTime();
  const duration = periodMilliseconds[period];
  return Number.isFinite(time) && (duration === undefined || time >= now - duration && time <= now);
};

export const summarizeHistory = (
  state: PaperState,
  period: HistoryPeriod = "all",
  now = Date.now(),
): HistorySummary => {
  const events = state.events.filter((event) => isInPeriod(event.at, period, now));
  const realizedProfit = state.positions.reduce((sum, position) => (
    position.status === "SETTLED"
      && position.realizedPnl !== undefined
      && position.settledAt
      && isInPeriod(position.settledAt, period, now)
      ? sum + position.realizedPnl
      : sum
  ), 0);
  const lockedProfit = state.arbitragePositions.reduce((sum, position) => (
    (position.status === "OPEN" || position.status === "REDEEMED")
      && isInPeriod(position.openedAt, period, now)
      ? sum + position.lockedProfitUsd
      : sum
  ), 0);
  const tradeCount = events.filter((event) => event.type === "PAPER_FILL" || event.type === "PAPER_ARBITRAGE").length;
  const roundedRealizedProfit = Math.round(realizedProfit * 100) / 100;
  const roundedLockedProfit = Math.round(lockedProfit * 100) / 100;

  return {
    period,
    realizedProfit: roundedRealizedProfit,
    lockedProfit: roundedLockedProfit,
    totalProfit: Math.round((roundedRealizedProfit + roundedLockedProfit) * 100) / 100,
    tradeCount,
    events: [...events].sort((first, second) => second.at.localeCompare(first.at)),
  };
};
