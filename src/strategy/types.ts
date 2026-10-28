import type { SignalSource, SpotTick } from "../domain.js";

export interface Strategy {
  readonly id: string;
  readonly label: string;
  evaluate(history: readonly SpotTick[]): SignalSource | undefined;
}
