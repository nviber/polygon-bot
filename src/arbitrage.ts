import type { Book } from "./domain.js";
import { estimatedTakerFee, roundUsd, type MarketCategory, takerFeeRate } from "./fees.js";

export interface BinaryBasketQuote {
  shares: number;
  firstFeeUsd: number;
  secondFeeUsd: number;
  totalCostUsd: number;
  guaranteedPayoutUsd: number;
  lockedProfitUsd: number;
}

export const quoteBinaryBasket = (
  first: Book,
  second: Book,
  category: MarketCategory,
  maximumCostUsd: number,
): BinaryBasketQuote | undefined => {
  const firstCostPerShare = first.bestAsk + takerFeeRate(category) * first.bestAsk * (1 - first.bestAsk);
  const secondCostPerShare = second.bestAsk + takerFeeRate(category) * second.bestAsk * (1 - second.bestAsk);
  const maximumShares = Math.min(first.askSize, second.askSize, maximumCostUsd / (firstCostPerShare + secondCostPerShare));
  const shares = Math.floor(maximumShares * 100) / 100;

  if (shares <= 0) {
    return undefined;
  }

  const firstFeeUsd = estimatedTakerFee(category, shares, first.bestAsk);
  const secondFeeUsd = estimatedTakerFee(category, shares, second.bestAsk);
  const totalCostUsd = roundUsd(shares * (first.bestAsk + second.bestAsk) + firstFeeUsd + secondFeeUsd);
  const guaranteedPayoutUsd = shares;
  const lockedProfitUsd = roundUsd(guaranteedPayoutUsd - totalCostUsd);

  return { shares, firstFeeUsd, secondFeeUsd, totalCostUsd, guaranteedPayoutUsd, lockedProfitUsd };
};
