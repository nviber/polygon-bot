import assert from "node:assert/strict";
import test from "node:test";
import { thresholdProbability } from "./macro.js";

test("macro threshold model estimates a high probability above a lower threshold", () => {
  const probability = thresholdProbability({
    id: "cpi-above",
    slug: "example",
    threshold: 2.5,
    consensus: 3.2,
    standardDeviation: 0.2,
    comparison: "above",
  });

  assert.ok(probability > 0.99);
});

test("macro threshold model rejects an invalid dispersion", () => {
  assert.throws(() => thresholdProbability({
    id: "invalid",
    slug: "example",
    threshold: 3,
    consensus: 3,
    standardDeviation: 0,
    comparison: "below",
  }));
});
