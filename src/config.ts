const numberFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const parsed = raw === undefined ? fallback : Number(raw);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }

  return parsed;
};

const fractionFromEnv = (key: string, fallback: number): number => {
  const value = numberFromEnv(key, fallback);

  if (value > 1) {
    throw new Error(`${key} must be between 0 and 1`);
  }

  return value;
};

export const strategyIds = [
  "btc-5m-momentum",
  "btc-paper-exploration",
  "btc-intraday-reversal",
  "btc-5m-time-series-momentum",
  "btc-range-breakout",
  "btc-moving-average-crossover",
  "btc-volatility-scaled-momentum",
  "weather-forecast-edge",
  "sports-odds-consensus",
  "macro-release-edge",
  "binary-basket-arbitrage",
] as const;

export type StrategyId = (typeof strategyIds)[number];

export const btcResearchStrategyIds = [
  "btc-intraday-reversal",
  "btc-5m-time-series-momentum",
  "btc-range-breakout",
  "btc-moving-average-crossover",
  "btc-volatility-scaled-momentum",
] as const satisfies readonly StrategyId[];

export const validateStrategySelection = (ids: readonly StrategyId[]): void => {
  const selectedResearch = ids.filter((id) => btcResearchStrategyIds.includes(id as typeof btcResearchStrategyIds[number]));

  if (selectedResearch.length > 1) {
    throw new Error("Select only one BTC research candidate at a time so its paper results remain independently attributable");
  }

  if (
    selectedResearch.length > 0
    && ids.some((id) => id === "btc-5m-momentum" || id === "btc-paper-exploration")
  ) {
    throw new Error("BTC research candidates must run without BTC momentum or paper exploration");
  }
};

export interface WeatherInstrumentConfig {
  id: string;
  slug: string;
  latitude: number;
  longitude: number;
  targetDate: string;
  yesOutcome?: string;
}

export interface SportsInstrumentConfig {
  id: string;
  slug: string;
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  yesTeam: string;
}

export interface MacroInstrumentConfig {
  id: string;
  slug: string;
  threshold: number;
  consensus: number;
  standardDeviation: number;
  comparison: "above" | "below";
  yesOutcome?: string;
}

const jsonArrayFromEnv = <T>(key: string): T[] => {
  const raw = process.env[key];

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("must be a JSON array");
    }

    return parsed as T[];
  }
  catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${key} must be valid JSON: ${detail}`);
  }
};

const strategiesFromEnv = (): StrategyId[] => {
  const configuredDefaults: StrategyId[] = ["btc-5m-momentum", "btc-paper-exploration"];

  if (process.env.ODDS_API_KEY) {
    configuredDefaults.push("sports-odds-consensus");
  }

  if (jsonArrayFromEnv<unknown>("WEATHER_INSTRUMENTS_JSON").length > 0) {
    configuredDefaults.push("weather-forecast-edge");
  }

  if (jsonArrayFromEnv<unknown>("MACRO_INSTRUMENTS_JSON").length > 0) {
    configuredDefaults.push("macro-release-edge");
  }

  if (stringsFromEnv("ARBITRAGE_MARKET_SLUGS").length > 0) {
    configuredDefaults.push("binary-basket-arbitrage");
  }

  const raw = process.env.ENABLED_STRATEGIES ?? configuredDefaults.join(",");
  const requested = [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
  const invalid = requested.filter((value) => !strategyIds.includes(value as StrategyId));

  if (invalid.length > 0) {
    throw new Error(`Unknown strategies: ${invalid.join(", ")}. Available: ${strategyIds.join(", ")}`);
  }

  if (requested.length === 0) {
    throw new Error("ENABLED_STRATEGIES must contain at least one strategy");
  }

  validateStrategySelection(requested as StrategyId[]);
  return requested as StrategyId[];
};

const stringsFromEnv = (key: string): string[] => {
  const raw = process.env[key] ?? "";
  return [...new Set(raw.split(",").map((value) => value.trim()).filter(Boolean))];
};

export const config = {
  startingCash: numberFromEnv("PAPER_STARTING_CASH", 1000),
  statePath: process.env.PAPER_STATE_PATH ?? "data/paper-state.json",
  pollIntervalMs: numberFromEnv("POLL_INTERVAL_MS", 15_000),
  dashboardPort: numberFromEnv("DASHBOARD_PORT", 3107),
  minExpectedEdge: numberFromEnv("MIN_EXPECTED_EDGE", 0.055),
  maxTradeUsd: numberFromEnv("MAX_TRADE_USD", 10),
  maxDailyLossUsd: numberFromEnv("MAX_DAILY_LOSS_USD", 25),
  maxOpenExposureUsd: numberFromEnv("MAX_OPEN_EXPOSURE_USD", 30),
  maxSpread: numberFromEnv("MAX_SPREAD", 0.06),
  minStrategyAgreement: fractionFromEnv("MIN_STRATEGY_AGREEMENT", 0.35),
  enabledStrategies: strategiesFromEnv(),
  okxInstrument: process.env.OKX_INSTRUMENT ?? "BTC-USDT",
  oddsApiKey: process.env.ODDS_API_KEY,
  sportsOddsRefreshMs: numberFromEnv("SPORTS_ODDS_REFRESH_MS", 30 * 60_000),
  weatherInstruments: jsonArrayFromEnv<WeatherInstrumentConfig>("WEATHER_INSTRUMENTS_JSON"),
  sportsInstruments: jsonArrayFromEnv<SportsInstrumentConfig>("SPORTS_INSTRUMENTS_JSON"),
  macroInstruments: jsonArrayFromEnv<MacroInstrumentConfig>("MACRO_INSTRUMENTS_JSON"),
  arbitrageMarketSlugs: stringsFromEnv("ARBITRAGE_MARKET_SLUGS"),
  arbitrageMinProfitUsd: numberFromEnv("ARBITRAGE_MIN_PROFIT_USD", 0.25),
} as const;
