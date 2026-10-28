import type { MacroInstrumentConfig } from "../config.js";

export const thresholdProbability = (instrument: MacroInstrumentConfig): number => {
  if (instrument.standardDeviation <= 0) {
    throw new Error(`${instrument.id} must have a positive standardDeviation`);
  }

  const zScore = (instrument.threshold - instrument.consensus) / instrument.standardDeviation;
  const probabilityBelow = normalCdf(zScore);
  return instrument.comparison === "above" ? 1 - probabilityBelow : probabilityBelow;
};

// Abramowitz and Stegun 7.1.26 approximation; sufficient for a paper-trading probability model.
const normalCdf = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * absolute);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-absolute * absolute);
  return 0.5 * (1 + sign * erf);
};
