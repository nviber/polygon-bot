import assert from "node:assert/strict";
import test from "node:test";
import type { Direction, SignalSource, SpotTick } from "../domain.js";
import { StrategyEnsemble } from "./ensemble.js";
import type { Strategy } from "./types.js";

class FixedStrategy implements Strategy {
  constructor(
    readonly id: string,
    readonly label: string,
    private readonly direction: Direction,
    private readonly probability = 0.6,
    private readonly confidence = 0.5,
  ) {}

  evaluate(): SignalSource {
    return {
      strategy: this.id,
      direction: this.direction,
      probability: this.probability,
      confidence: this.confidence,
      reason: "fixed test vote",
    };
  }
}

const tick: SpotTick = { price: 100, timestamp: Date.now() };

test("combines agreeing strategy votes", () => {
  const ensemble = new StrategyEnsemble([
    new FixedStrategy("a", "A", "UP", 0.62, 0.6),
    new FixedStrategy("b", "B", "UP", 0.56, 0.4),
  ], 0.35);
  ensemble.observe(tick);
  const signal = ensemble.signal();

  assert.equal(signal?.direction, "UP");
  assert.equal(signal?.sources.length, 2);
  assert.ok((signal?.probability ?? 0) > 0.5);
});

test("abstains when strategy votes conflict evenly", () => {
  const ensemble = new StrategyEnsemble([
    new FixedStrategy("a", "A", "UP"),
    new FixedStrategy("b", "B", "DOWN"),
  ], 0.35);
  ensemble.observe(tick);

  assert.equal(ensemble.signal(), undefined);
  assert.match(ensemble.status(), /disagreement/);
});

test("reports only explicitly enabled strategies", () => {
  const ensemble = new StrategyEnsemble([
    new FixedStrategy("breakout", "Breakout", "UP"),
  ], 0.35);

  assert.deepEqual(ensemble.enabledIds(), ["breakout"]);
});
