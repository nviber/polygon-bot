import type { Direction, SignalSource, SpotTick } from "../domain.js";
import { clamp, tickAtLeastAgo } from "./math.js";
import type { Strategy } from "./types.js";

/** Conservative short-horizon model: it requires history and shrinks every estimate toward 50%. */
export class MomentumStrategy implements Strategy {
  readonly id = "btc-5m-momentum";
  readonly label = "90-second momentum";

  evaluate(history: readonly SpotTick[]): SignalSource | undefined {
    const latest = history.at(-1);

    if (!latest || history.length < 4) {
      return undefined;
    }

    const baseline = tickAtLeastAgo(history, 90_000);

    if (!baseline) {
      return undefined;
    }

    const move = (latest.price - baseline.price) / baseline.price;
    const adjustment = clamp(move * 30, -0.12, 0.12);
    const direction: Direction = adjustment >= 0 ? "UP" : "DOWN";
    const probability = 0.5 + Math.abs(adjustment);
    const confidence = clamp(0.2 + Math.abs(adjustment) * 3, 0, 0.65);

    return {
      strategy: this.id,
      direction,
      probability,
      confidence,
      reason: `90s spot move ${(move * 100).toFixed(3)}%`,
    };
  }
}
