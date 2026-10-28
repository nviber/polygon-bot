import assert from "node:assert/strict";
import test from "node:test";
import type { BinaryMarket, PaperState } from "../domain.js";
import { PaperBroker } from "./broker.js";

const market: BinaryMarket = {
  id: "market-1",
  question: "Will a reviewed event happen?",
  slug: "reviewed-event",
  asset: "OTHER",
  closesAt: new Date(Date.now() + 300_000).toISOString(),
  active: true,
  outcomes: [
    { outcome: "Yes", tokenId: "yes", price: 0.45 },
    { outcome: "No", tokenId: "no", price: 0.45 },
  ],
};

const state: PaperState = {
  cash: 100,
  startingCash: 100,
  positions: [],
  arbitragePositions: [],
  dailyRealizedPnl: {},
  events: [],
};

test("records both legs and locked profit for a paper binary basket", () => {
  const basket = new PaperBroker().buyBinaryBasket(
    market,
    { outcome: "Yes", tokenId: "yes", price: 0.45 },
    { outcome: "No", tokenId: "no", price: 0.45 },
    10,
    0.1,
    0.1,
    state,
  );

  assert.equal(state.positions.length, 2);
  assert.deepEqual(state.positions.map((position) => position.strategyId), ["binary-basket-arbitrage", "binary-basket-arbitrage"]);
  assert.equal(state.arbitragePositions.length, 1);
  assert.equal(basket.guaranteedPayoutUsd, 10);
  assert.equal(basket.lockedProfitUsd, 0.8);
  assert.equal(state.cash, 90.8);
});
