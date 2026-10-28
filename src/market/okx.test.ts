import assert from "node:assert/strict";
import test from "node:test";
import { OkxSpotClient } from "./okx.js";

test("reads the latest price and timestamp from an OKX public ticker", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      code: "0",
      msg: "",
      data: [{ last: "84321.7", ts: "1790193600123" }],
    }), { status: 200 });
  };

  try {
    const tick = await new OkxSpotClient("BTC-USDT").latest();

    assert.equal(requestedUrl, "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT");
    assert.deepEqual(tick, { price: 84321.7, timestamp: 1_790_193_600_123 });
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects an unsuccessful OKX response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: "51001",
    msg: "Instrument ID does not exist",
    data: [],
  }), { status: 200 });

  try {
    await assert.rejects(
      new OkxSpotClient("NOT-A-MARKET").latest(),
      /OKX ticker returned code 51001: Instrument ID does not exist/,
    );
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});
