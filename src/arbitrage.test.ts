import assert from "node:assert/strict";
import test from "node:test";
import { quoteBinaryBasket } from "./arbitrage.js";
import type { Book } from "./domain.js";

const book = (bestAsk: number): Book => ({
  tokenId: String(bestAsk),
  bestBid: bestAsk - 0.01,
  bestAsk,
  bidSize: 100,
  askSize: 100,
  timestamp: Date.now(),
});

test("calculates a fee-inclusive locked profit for a discounted binary basket", () => {
  const quote = quoteBinaryBasket(book(0.45), book(0.45), "general", 10);

  assert.ok(quote);
  assert.ok((quote?.lockedProfitUsd ?? 0) > 0);
  assert.equal(quote?.guaranteedPayoutUsd, quote?.shares);
});

test("does not describe an overpriced basket as profitable", () => {
  const quote = quoteBinaryBasket(book(0.5), book(0.5), "crypto", 10);

  assert.ok((quote?.lockedProfitUsd ?? 0) < 0);
});
