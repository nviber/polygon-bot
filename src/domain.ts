export type Direction = "UP" | "DOWN";
export type Outcome = string;

export interface BinaryMarket {
  id: string;
  question: string;
  slug: string;
  asset: "BTC" | "ETH" | "OTHER";
  closesAt: string;
  active: boolean;
  outcomes: { outcome: Outcome; tokenId: string; price: number }[];
}

export interface Book {
  tokenId: string;
  bestBid: number;
  bestAsk: number;
  bidSize: number;
  askSize: number;
  timestamp: number;
}

export interface SpotTick {
  price: number;
  timestamp: number;
}

export interface SportsMarketCandidate {
  market: BinaryMarket;
  participants: [string, string];
  selection?: string;
  startsAt: string;
  tags: string[];
}

export interface SignalSource {
  strategy: string;
  direction: Direction;
  probability: number;
  confidence: number;
  reason: string;
}

export interface Signal {
  direction: Direction;
  probability: number;
  confidence: number;
  reasons: string[];
  sources: SignalSource[];
}

export interface TradeIntent {
  market: BinaryMarket;
  outcome: Outcome;
  tokenId: string;
  limitPrice: number;
  shares: number;
  estimatedEdge: number;
  estimatedFeeUsd: number;
  signal: Signal;
}

export interface Position {
  id: string;
  marketId: string;
  question: string;
  outcome: Outcome;
  tokenId: string;
  strategyId?: string;
  shares: number;
  entryPrice: number;
  entryFeeUsd: number;
  openedAt: string;
  expiresAt: string;
  status: "OPEN" | "SETTLED";
  realizedPnl?: number;
  settledAt?: string;
}

export interface ArbitragePosition {
  id: string;
  marketId: string;
  question: string;
  firstOutcome: Outcome;
  secondOutcome: Outcome;
  sharesPerOutcome: number;
  totalCostUsd: number;
  totalFeeUsd: number;
  guaranteedPayoutUsd: number;
  lockedProfitUsd: number;
  openedAt: string;
  status: "OPEN" | "REDEEMED";
}

export interface PaperState {
  cash: number;
  startingCash: number;
  positions: Position[];
  arbitragePositions: ArbitragePosition[];
  dailyRealizedPnl: Record<string, number>;
  events: { at: string; type: string; message: string }[];
}
