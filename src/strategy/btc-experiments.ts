import type { Direction, SignalSource, SpotTick } from "../domain.js";
import { clamp, returns, standardDeviation, tickAtLeastAgo, ticksWithin, timeWeightedAverage } from "./math.js";
import type { Strategy } from "./types.js";

abstract class BtcResearchStrategy implements Strategy {
  abstract readonly id: string;
  abstract readonly label: string;

  abstract evaluate(history: readonly SpotTick[]): SignalSource | undefined;

  protected signal(signedStrength: number, reason: string): SignalSource | undefined {
    if (!Number.isFinite(signedStrength) || Math.abs(signedStrength) < 0.08) {
      return undefined;
    }

    const strength = clamp(signedStrength, -1, 1);
    const direction: Direction = strength >= 0 ? "UP" : "DOWN";
    const probability = 0.5 + Math.abs(strength) * 0.12;

    return {
      strategy: this.id,
      direction,
      probability,
      confidence: 0.25 + Math.abs(strength) * 0.35,
      reason: `${reason}; heuristic score, not a calibrated probability`,
    };
  }
}

export class IntradayReversalStrategy extends BtcResearchStrategy {
  readonly id = "btc-intraday-reversal";
  readonly label = "90-second overreaction reversal";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const latest = history.at(-1);
    const baseline = tickAtLeastAgo(history, 90_000);

    if (!latest || !baseline || baseline.price <= 0) {
      return undefined;
    }

    const move = (latest.price - baseline.price) / baseline.price;
    return this.signal(-move / 0.0015, `fades the 90s BTC move ${(move * 100).toFixed(3)}%`);
  }
}

export class TimeSeriesMomentumStrategy extends BtcResearchStrategy {
  readonly id = "btc-5m-time-series-momentum";
  readonly label = "4-minute time-series momentum";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const latest = history.at(-1);
    const baseline = tickAtLeastAgo(history, 4 * 60_000);

    if (!latest || !baseline || baseline.price <= 0) {
      return undefined;
    }

    const move = (latest.price - baseline.price) / baseline.price;
    return this.signal(move / 0.002, `follows the 4m BTC return ${(move * 100).toFixed(3)}%`);
  }
}

export class RangeBreakoutStrategy extends BtcResearchStrategy {
  readonly id = "btc-range-breakout";
  readonly label = "5-minute trading-range breakout";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const window = ticksWithin(history, 5 * 60_000);
    const latest = window.at(-1);
    const prior = window.slice(0, -1);

    if (!latest || prior.length < 8 || latest.price <= 0) {
      return undefined;
    }

    const high = Math.max(...prior.map((tick) => tick.price));
    const low = Math.min(...prior.map((tick) => tick.price));
    const breakout = latest.price > high
      ? (latest.price - high) / latest.price
      : latest.price < low
        ? -(low - latest.price) / latest.price
        : 0;

    return this.signal(breakout / 0.0005, `5m range breakout distance ${(breakout * 100).toFixed(3)}%`);
  }
}

export class MovingAverageCrossoverStrategy extends BtcResearchStrategy {
  readonly id = "btc-moving-average-crossover";
  readonly label = "1m / 5m moving-average crossover";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const latest = history.at(-1);

    if (!latest || latest.price <= 0) {
      return undefined;
    }

    const fastAverage = timeWeightedAverage(history, 60_000);
    const slowAverage = timeWeightedAverage(history, 5 * 60_000);

    if (fastAverage === undefined || slowAverage === undefined) {
      return undefined;
    }

    const spread = (fastAverage - slowAverage) / latest.price;

    return this.signal(spread / 0.0008, `time-weighted 1m vs 5m average spread ${(spread * 100).toFixed(3)}%`);
  }
}

export class VolatilityScaledMomentumStrategy extends BtcResearchStrategy {
  readonly id = "btc-volatility-scaled-momentum";
  readonly label = "90-second volatility-scaled momentum";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const latest = history.at(-1);
    const baseline = tickAtLeastAgo(history, 90_000);
    const recentReturns = returns(ticksWithin(history, 5 * 60_000));

    if (!latest || !baseline || baseline.price <= 0 || recentReturns.length < 8) {
      return undefined;
    }

    const move = (latest.price - baseline.price) / baseline.price;
    const realizedVolatility = standardDeviation(recentReturns) * Math.sqrt(recentReturns.length);

    if (realizedVolatility <= 0) {
      return undefined;
    }

    const scaledMove = move / realizedVolatility;
    return this.signal(scaledMove / 3, `90s return / 5m realized volatility = ${scaledMove.toFixed(2)}`);
  }
}
