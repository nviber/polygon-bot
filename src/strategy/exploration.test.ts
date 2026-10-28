import assert from "node:assert/strict";
import test from "node:test";
import type { BinaryMarket } from "../domain.js";
import { PaperExplorationStrategy } from "./exploration.js";

const market: BinaryMarket = {
  id: "market-1",
  question: "Bitcoin Up or Down?",
  slug: "btc-updown-5m-123",
  asset: "BTC",
  closesAt: new Date(Date.now() + 180_000).toISOString(),
  active: true,
  outcomes: [{ outcome: "Up", tokenId: "up", price: 0.5 }, { outcome: "Down", tokenId: "down", price: 0.5 }],
};

test("paper exploration emits an immediate, explicitly neutral signal", () => {
  const strategy = new PaperExplorationStrategy();
  const signal = strategy.evaluate(market);

  assert.equal(signal.probability, 0.5);
  assert.equal(signal.confidence, 0);
  assert.equal(signal.sources[0].strategy, "btc-paper-exploration");
  assert.match(signal.reasons[0], /non-predictive/);
  assert.equal(strategy.evaluate(market).direction, signal.direction);
});
