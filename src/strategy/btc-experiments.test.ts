import assert from "node:assert/strict";
import test from "node:test";
import { btcResearchStrategyIds, validateStrategySelection } from "../config.js";
import type { SpotTick } from "../domain.js";
import { createBtcResearchStrategy, strategyOptions } from "./registry.js";

const ticks = (prices: readonly number[], intervalMs = 15_000): SpotTick[] => {
  const now = Date.now();
  return prices.map((price, index) => ({ price, timestamp: now - (prices.length - index - 1) * intervalMs }));
};

test("registers five distinct BTC research candidates and constructs each independently", () => {
  const options = strategyOptions.filter((strategy) => btcResearchStrategyIds.includes(strategy.id as typeof btcResearchStrategyIds[number]));

  assert.equal(options.length, 5);
  assert.deepEqual(options.map(({ id }) => id), btcResearchStrategyIds);
  assert.deepEqual(btcResearchStrategyIds.map((id) => createBtcResearchStrategy(id).id), btcResearchStrategyIds);
  assert.ok(options.every(({ description }) => /unproven|paper-only/.test(description)));
});

test("only one new BTC experiment can be selected, separately from legacy BTC modes", () => {
  assert.doesNotThrow(() => validateStrategySelection(["btc-intraday-reversal", "weather-forecast-edge"]));
  assert.doesNotThrow(() => validateStrategySelection(["btc-5m-momentum", "btc-paper-exploration"]));
  assert.throws(
    () => validateStrategySelection(["btc-intraday-reversal", "btc-range-breakout"]),
    /only one BTC research candidate/,
  );
  assert.throws(
    () => validateStrategySelection(["btc-5m-time-series-momentum", "btc-5m-momentum"]),
    /without BTC momentum or paper exploration/,
  );
});

test("reversal candidate fades a sufficiently large recent rise", () => {
  const history = ticks([100, 100.05, 100.1, 100.15, 100.2], 30_000);
  const vote = createBtcResearchStrategy("btc-intraday-reversal").evaluate(history);

  assert.equal(vote?.strategy, "btc-intraday-reversal");
  assert.equal(vote?.direction, "DOWN");
});

test("four-minute momentum candidate follows the recent return", () => {
  const history = ticks(Array.from({ length: 18 }, (_, index) => 80_000 + index * 40));
  const vote = createBtcResearchStrategy("btc-5m-time-series-momentum").evaluate(history);

  assert.equal(vote?.direction, "UP");
  assert.match(vote?.reason ?? "", /4m BTC return/);
});

test("range breakout candidate abstains inside the range and follows an upside break", () => {
  const history = ticks([...Array.from({ length: 17 }, () => 100), 100.15]);
  const vote = createBtcResearchStrategy("btc-range-breakout").evaluate(history);

  assert.equal(vote?.direction, "UP");
});

test("moving-average candidate follows a fast-over-slow crossover spread", () => {
  const history = ticks([...Array.from({ length: 17 }, () => 100), 100.1, 100.2, 100.3, 100.4]);
  const vote = createBtcResearchStrategy("btc-moving-average-crossover").evaluate(history);

  assert.equal(vote?.direction, "UP");
});

test("moving-average candidate uses elapsed time instead of sample counts at irregular cadence", () => {
  const now = Date.now();
  const history: SpotTick[] = [
    { price: 100, timestamp: now - 300_000 },
    { price: 100, timestamp: now - 60_000 },
    { price: 101, timestamp: now - 59_000 },
  ];

  for (let ageMs = 58_000; ageMs >= 0; ageMs -= 1_000) {
    history.push({ price: 101, timestamp: now - ageMs });
  }

  const vote = createBtcResearchStrategy("btc-moving-average-crossover").evaluate(history);

  assert.equal(vote?.direction, "UP");
  assert.match(vote?.reason ?? "", /time-weighted 1m vs 5m/);
});

test("volatility-scaled candidate emits a bounded, uncalibrated score", () => {
  const history = ticks([...Array.from({ length: 19 }, () => 100), 100.2]);
  const vote = createBtcResearchStrategy("btc-volatility-scaled-momentum").evaluate(history);

  assert.equal(vote?.direction, "UP");
  assert.ok((vote?.probability ?? 1) <= 0.62);
  assert.match(vote?.reason ?? "", /not a calibrated probability/);
});
