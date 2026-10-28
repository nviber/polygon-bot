import { config } from "./config.js";
import type { BinaryMarket, Book, PaperState, TradeIntent } from "./domain.js";
import { takerFeeRate, type MarketCategory } from "./fees.js";

export function sizeTradeAtBestAsk(
  maximumCostUsd: number,
  askPrice: number,
  askSize: number,
  category: MarketCategory,
): number {
  if (
    !Number.isFinite(maximumCostUsd)
    || !Number.isFinite(askPrice)
    || !Number.isFinite(askSize)
    || maximumCostUsd <= 0
    || askPrice <= 0
    || askPrice >= 1
    || askSize <= 0
  ) {
    return 0;
  }

  const costPerShare = askPrice + takerFeeRate(category) * askPrice * (1 - askPrice);
  return Math.floor(Math.min(maximumCostUsd / costPerShare, askSize) * 100) / 100;
}

export function allowTrade(intent: TradeIntent, book: Book, state: PaperState, now = new Date()): string | undefined {
  const cost = intent.limitPrice * intent.shares + intent.estimatedFeeUsd;
  const spread = book.bestAsk - book.bestBid;
  const day = now.toISOString().slice(0, 10);
  const openExposure = state.positions
    .filter((position) => position.status === "OPEN")
    .reduce((sum, position) => sum + position.entryPrice * position.shares + (position.entryFeeUsd ?? 0), 0);

  if (Date.now() - book.timestamp > 20_000) {
    return "stale order book";
  }

  if (new Date(intent.market.closesAt).getTime() - now.getTime() < 45_000) {
    return "market too close to expiry";
  }

  if (spread > config.maxSpread) {
    return `spread ${spread.toFixed(3)} exceeds maximum`;
  }

  if (intent.estimatedEdge < config.minExpectedEdge) {
    return "estimated edge below threshold";
  }

  if (book.askSize < intent.shares) {
    return `insufficient displayed ask liquidity (${book.askSize.toFixed(2)} available, ${intent.shares.toFixed(2)} requested)`;
  }

  if (cost > config.maxTradeUsd) {
    return "trade exceeds per-trade limit";
  }

  if (openExposure + cost > config.maxOpenExposureUsd) {
    return "open-exposure limit reached";
  }

  if ((state.dailyRealizedPnl[day] ?? 0) <= -config.maxDailyLossUsd) {
    return "daily-loss circuit breaker is active";
  }

  if (state.cash < cost) {
    return "insufficient paper cash";
  }

  if (state.positions.some((position) => position.status === "OPEN" && position.marketId === intent.market.id)) {
    return "position already open in this market";
  }

  return undefined;
}

export function allowPaperExplorationTrade(
  intent: TradeIntent,
  book: Book,
  state: PaperState,
  now = new Date(),
): string | undefined {
  const cost = intent.limitPrice * intent.shares + intent.estimatedFeeUsd;
  const ageMs = now.getTime() - book.timestamp;

  if (!intent.market.active) {
    return "market is not active";
  }

  if (
    !Number.isFinite(book.timestamp)
    || !Number.isFinite(book.bestBid)
    || !Number.isFinite(book.bestAsk)
    || book.bestBid < 0
    || book.bestAsk <= 0
    || book.bestAsk >= 1
    || book.bestBid >= book.bestAsk
    || !Number.isFinite(book.askSize)
    || book.askSize <= 0
    || book.tokenId !== intent.tokenId
    || intent.limitPrice !== book.bestAsk
  ) {
    return "invalid executable order book";
  }

  if (ageMs < -20_000 || ageMs > 20_000) {
    return "stale order book";
  }

  const closesAt = new Date(intent.market.closesAt).getTime();

  if (!Number.isFinite(closesAt) || closesAt - now.getTime() < 45_000) {
    return "market too close to expiry";
  }

  if (!Number.isFinite(intent.shares) || intent.shares <= 0 || book.askSize < intent.shares) {
    return "insufficient displayed ask liquidity";
  }

  if (!Number.isFinite(cost) || cost <= 0 || cost > config.maxTradeUsd) {
    return "trade exceeds per-trade limit";
  }

  if (!Number.isFinite(intent.estimatedFeeUsd) || intent.estimatedFeeUsd < 0) {
    return "invalid estimated fee";
  }

  if (!Number.isFinite(state.cash) || state.cash < cost) {
    return "insufficient paper cash";
  }

  if (state.positions.some((position) => position.status === "OPEN" && position.marketId === intent.market.id)) {
    return "position already open in this market";
  }

  return undefined;
}

export function allowArbitrage(
  market: BinaryMarket,
  firstBook: Book,
  secondBook: Book,
  totalCostUsd: number,
  lockedProfitUsd: number,
  state: PaperState,
  now = new Date(),
): string | undefined {
  const day = now.toISOString().slice(0, 10);
  const openExposure = state.positions
    .filter((position) => position.status === "OPEN")
    .reduce((sum, position) => sum + position.entryPrice * position.shares + (position.entryFeeUsd ?? 0), 0);

  if (Date.now() - firstBook.timestamp > 20_000 || Date.now() - secondBook.timestamp > 20_000) {
    return "stale order book";
  }

  if (new Date(market.closesAt).getTime() - now.getTime() < 45_000) {
    return "market too close to expiry";
  }

  if (lockedProfitUsd < config.arbitrageMinProfitUsd) {
    return `locked profit $${lockedProfitUsd.toFixed(4)} is below the minimum`;
  }

  if (totalCostUsd > config.maxTradeUsd) {
    return "basket exceeds per-trade limit";
  }

  if (openExposure + totalCostUsd > config.maxOpenExposureUsd) {
    return "open-exposure limit reached";
  }

  if ((state.dailyRealizedPnl[day] ?? 0) <= -config.maxDailyLossUsd) {
    return "daily-loss circuit breaker is active";
  }

  if (state.cash < totalCostUsd) {
    return "insufficient paper cash";
  }

  if (state.arbitragePositions.some((position) => position.status === "OPEN" && position.marketId === market.id)) {
    return "arbitrage basket already open in this market";
  }

  return undefined;
}
