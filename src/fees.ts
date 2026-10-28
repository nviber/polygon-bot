export type MarketCategory = "crypto" | "sports" | "weather" | "economics" | "general";

const takerFeeRates: Record<MarketCategory, number> = {
  crypto: 0.07,
  sports: 0.05,
  weather: 0.05,
  economics: 0.05,
  general: 0.05,
};

export const roundUsd = (value: number): number => Math.round(value * 100_000) / 100_000;

export const takerFeeRate = (category: MarketCategory): number => takerFeeRates[category];

export const estimatedTakerFee = (
  category: MarketCategory,
  shares: number,
  price: number,
): number => {
  const rawFee = shares * takerFeeRate(category) * price * (1 - price);
  return roundUsd(rawFee);
};
