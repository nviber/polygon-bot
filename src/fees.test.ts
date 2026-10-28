import assert from "node:assert/strict";
import test from "node:test";
import { estimatedTakerFee } from "./fees.js";

test("applies the documented crypto taker-fee curve", () => {
  assert.equal(estimatedTakerFee("crypto", 100, 0.5), 1.75);
});

test("uses the category-specific sports fee rate", () => {
  assert.equal(estimatedTakerFee("sports", 100, 0.5), 1.25);
});
