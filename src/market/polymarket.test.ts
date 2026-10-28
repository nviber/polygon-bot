import assert from "node:assert/strict";
import test from "node:test";
import { PolymarketPublicClient } from "./polymarket.js";

const rawMarket = (overrides: Record<string, unknown>) => ({
  id: "market",
  question: "Maple Leafs vs. Senators",
  slug: "nhl-tor-ott-2026-09-23",
  active: true,
  closed: false,
  acceptingOrders: true,
  endDate: "2026-09-23T23:00:00Z",
  gameStartTime: "2026-09-23T23:00:00Z",
  sportsMarketType: "moneyline",
  outcomes: '["Maple Leafs","Senators"]',
  outcomePrices: '["0.5","0.5"]',
  clobTokenIds: '["tor","ott"]',
  ...overrides,
});

test("discovers the current recurring BTC 5-minute event and its Up/Down market", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json([{
      slug: "btc-updown-5m-1790197200",
      markets: [rawMarket({
        id: "btc-5m",
        question: "Bitcoin Up or Down - September 23, 5:00PM-5:05PM ET",
        slug: "btc-updown-5m-1790197200",
        endDate: "2026-09-23T21:05:00Z",
        eventStartTime: "2026-09-23T21:00:00Z",
        outcomes: '["Up","Down"]',
        clobTokenIds: '["up","down"]',
        cryptoMarketConfig: { asset: "btc", duration: "5m" },
      })],
    }]);
  };

  try {
    const market = await new PolymarketPublicClient().findActiveShortHorizon(
      "BTC",
      new Date("2026-09-23T21:01:00Z"),
    );

    assert.match(requestedUrl, /events\?slug=btc-updown-5m-1790197200$/);
    assert.equal(market?.slug, "btc-updown-5m-1790197200");
    assert.deepEqual(market?.outcomes.map(({ outcome }) => outcome), ["Up", "Down"]);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not select the next BTC window before it starts", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([{
    markets: [rawMarket({
      question: "Bitcoin Up or Down",
      endDate: "2026-09-23T21:10:00Z",
      eventStartTime: "2026-09-23T21:05:00Z",
      outcomes: '["Up","Down"]',
      clobTokenIds: '["up","down"]',
      cryptoMarketConfig: { asset: "btc", duration: "5m" },
    })],
  }]);

  try {
    const market = await new PolymarketPublicClient().findActiveShortHorizon(
      "BTC",
      new Date("2026-09-23T21:04:00Z"),
    );

    assert.equal(market, undefined);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns only provider-confirmed terminal market outcomes", async () => {
  const originalFetch = globalThis.fetch;
  const client = new PolymarketPublicClient();
  let requestedUrl = "";

  try {
    globalThis.fetch = async (input) => {
      requestedUrl = String(input);
      return Response.json(rawMarket({
        id: "btc-5m-id",
        closed: true,
        outcomes: '["Up","Down"]',
        outcomePrices: '["1","0"]',
        resolutionStatus: "resolved",
      }));
    };

    assert.equal(await client.findResolvedOutcomeById("btc-5m-id"), "Up");
    assert.match(requestedUrl, /markets\/btc-5m-id$/);

    globalThis.fetch = async () => Response.json(rawMarket({
      closed: true,
      outcomes: '["Up","Down"]',
      outcomePrices: '["0","1"]',
      umaResolutionStatus: "settled",
    }));
    assert.equal(await client.findResolvedOutcomeById("legacy-uma"), "Down");

    globalThis.fetch = async () => Response.json(rawMarket({
      closed: true,
      outcomes: '["Up","Down"]',
      outcomePrices: '["1","0"]',
      umaResolutionStatus: "proposed",
    }));
    assert.equal(await client.findResolvedOutcomeById("pending"), undefined);

    globalThis.fetch = async () => Response.json(rawMarket({
      closed: true,
      outcomes: '["Up","Down"]',
      outcomePrices: '["0.98","0.02"]',
      umaResolutionStatus: "resolved",
    }));
    assert.equal(await client.findResolvedOutcomeById("nonterminal"), undefined);

    globalThis.fetch = async () => Response.json(rawMarket({
      closed: false,
      outcomes: '["Up","Down"]',
      outcomePrices: '["1","0"]',
      resolutionStatus: "resolved",
    }));
    assert.equal(await client.findResolvedOutcomeById("still-open"), undefined);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("treats empty and one-sided order books as unavailable liquidity", async () => {
  const originalFetch = globalThis.fetch;
  const client = new PolymarketPublicClient();
  const books = [
    {},
    { bids: [{ price: "0.4", size: "10" }] },
    { asks: [{ price: "0.6", size: "10" }] },
    { bids: [{ price: "0.4", size: "10" }], asks: [] },
  ];
  let currentBook = 0;
  globalThis.fetch = async () => Response.json(books[currentBook++]);

  try {
    for (let index = 0; index < books.length; index += 1) {
      assert.equal(await client.getBook("token"), undefined);
    }
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps valid two-sided books and reports order-book request failures", async () => {
  const originalFetch = globalThis.fetch;
  const client = new PolymarketPublicClient();

  try {
    globalThis.fetch = async () => Response.json({
      bids: [{ price: "0.4", size: "10" }],
      asks: [{ price: "0.6", size: "5" }],
      timestamp: "1760000000000",
    });

    assert.deepEqual(await client.getBook("token"), {
      tokenId: "token",
      bestBid: 0.4,
      bestAsk: 0.6,
      bidSize: 10,
      askSize: 5,
      timestamp: 1760000000000,
    });

    globalThis.fetch = async () => new Response("unavailable", { status: 503 });
    await assert.rejects(client.getBook("token"), /CLOB book request failed: 503/);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("discovers team and draw moneylines from Polymarket sports metadata", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([
    {
      title: "Maple Leafs vs. Senators",
      tags: [{ slug: "sports" }, { slug: "nhl" }],
      markets: [rawMarket({})],
    },
    {
      title: "Aruba vs. Antigua and Barbuda",
      tags: [{ slug: "sports" }, { slug: "concacaf-nations-league" }],
      markets: [rawMarket({
        id: "draw",
        question: "Will Aruba vs. Antigua and Barbuda end in a draw?",
        slug: "conl-aru-atg-2026-09-23-draw",
        outcomes: '["Yes","No"]',
        clobTokenIds: '["yes","no"]',
      })],
    },
  ]);

  try {
    const candidates = await new PolymarketPublicClient().findActiveSportsMoneylines(
      new Date("2026-09-23T20:00:00Z"),
    );

    assert.equal(candidates.length, 2);
    assert.deepEqual(candidates[0].participants, ["Maple Leafs", "Senators"]);
    assert.equal(candidates[0].selection, undefined);
    assert.deepEqual(candidates[1].participants, ["Aruba", "Antigua and Barbuda"]);
    assert.equal(candidates[1].selection, "Draw");
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});
