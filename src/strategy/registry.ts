import type { StrategyId } from "../config.js";
import { btcResearchStrategyIds } from "../config.js";
import {
  IntradayReversalStrategy,
  MovingAverageCrossoverStrategy,
  RangeBreakoutStrategy,
  TimeSeriesMomentumStrategy,
  VolatilityScaledMomentumStrategy,
} from "./btc-experiments.js";
import { MomentumStrategy } from "./momentum.js";
import type { Strategy } from "./types.js";

export const strategyOptions = [
  { id: "btc-5m-momentum", label: "BTC 5m momentum", category: "Crypto", description: "Follows a sustained 90-second BTC move." },
  { id: "btc-paper-exploration", label: "BTC paper exploration", category: "Paper baseline", description: "Opens a small, explicitly non-predictive paper position on the current eligible BTC 5m market, even when model edge or portfolio thresholds would reject it." },
  { id: "btc-intraday-reversal", label: "90s overreaction reversal", category: "BTC research", description: "Fades a large 90-second BTC move; an unproven, separately tracked paper hypothesis." },
  { id: "btc-5m-time-series-momentum", label: "4m time-series momentum", category: "BTC research", description: "Follows a BTC return over four minutes; an unproven short-horizon extrapolation." },
  { id: "btc-range-breakout", label: "5m trading-range breakout", category: "BTC research", description: "Follows a break beyond the recent five-minute BTC high or low; paper-only and unproven." },
  { id: "btc-moving-average-crossover", label: "1m / 5m average crossover", category: "BTC research", description: "Uses a fast/slow BTC price-average spread; paper-only and unproven." },
  { id: "btc-volatility-scaled-momentum", label: "Volatility-scaled momentum", category: "BTC research", description: "Scales a 90-second BTC move by recent realized volatility; paper-only and unproven." },
  { id: "weather-forecast-edge", label: "Weather forecast edge", category: "Weather", description: "Compares a mapped market with public forecast precipitation probability." },
  { id: "sports-odds-consensus", label: "Sports odds consensus", category: "Sports", description: "Uses no-vig consensus odds across bookmakers; requires an odds API key." },
  { id: "macro-release-edge", label: "Macro release edge", category: "Economics", description: "Converts a configured consensus distribution into threshold-event probabilities." },
  { id: "binary-basket-arbitrage", label: "Binary basket arbitrage", category: "Arbitrage", description: "Buys both reviewed outcomes only when live ask depth leaves a fee-inclusive locked paper profit." },
] as const satisfies readonly { id: StrategyId; label: string; category: string; description: string }[];

export const createBtcStrategies = (ids: readonly StrategyId[]): Strategy[] =>
  ids.includes("btc-5m-momentum") ? [new MomentumStrategy()] : [];

export const createBtcResearchStrategy = (id: (typeof btcResearchStrategyIds)[number]): Strategy => {
  switch (id) {
    case "btc-intraday-reversal":
      return new IntradayReversalStrategy();
    case "btc-5m-time-series-momentum":
      return new TimeSeriesMomentumStrategy();
    case "btc-range-breakout":
      return new RangeBreakoutStrategy();
    case "btc-moving-average-crossover":
      return new MovingAverageCrossoverStrategy();
    case "btc-volatility-scaled-momentum":
      return new VolatilityScaledMomentumStrategy();
  }
};
