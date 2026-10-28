import assert from "node:assert/strict";
import test from "node:test";
import type { SportsMarketCandidate } from "../domain.js";
import { SportsOddsClient } from "./sports.js";

const candidate = (overrides?: Partial<SportsMarketCandidate>): SportsMarketCandidate => ({
  market: {
    id: "nhl-game",
    question: "Maple Leafs vs. Senators",
    slug: "nhl-tor-ott-2026-09-23",
    asset: "OTHER",
    closesAt: "2026-09-23T23:00:00Z",
    active: true,
    outcomes: [
      { outcome: "Maple Leafs", tokenId: "tor", price: 0.5 },
      { outcome: "Senators", tokenId: "ott", price: 0.5 },
    ],
  },
  participants: ["Maple Leafs", "Senators"],
  startsAt: "2026-09-23T23:00:00Z",
  tags: ["sports", "nhl", "hockey"],
  ...overrides,
});

test("automatically matches abbreviated Polymarket teams to sportsbook events", async () => {
  const originalFetch = globalThis.fetch;
  const urls: URL[] = [];

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    urls.push(url);

    if (url.pathname.endsWith("/sports/")) {
      return Response.json([{ key: "icehockey_nhl", title: "NHL", active: true }]);
    }

    return Response.json([{
      id: "game-1",
      commence_time: "2026-09-23T23:00:00Z",
      home_team: "Ottawa Senators",
      away_team: "Toronto Maple Leafs",
      bookmakers: [
        { markets: [{ key: "h2h", outcomes: [{ name: "Toronto Maple Leafs", price: 2 }, { name: "Ottawa Senators", price: 2 }] }] },
        { markets: [{ key: "h2h", outcomes: [{ name: "Toronto Maple Leafs", price: 1.8 }, { name: "Ottawa Senators", price: 2.1 }] }] },
      ],
    }]);
  };

  try {
    const match = await new SportsOddsClient("secret", 60_000).findConsensus([candidate()]);

    assert.ok(match);
    assert.equal(match.referenceOutcome, "Maple Leafs");
    assert.equal(match.bookmakerCount, 2);
    assert.ok(Math.abs(match.probability - 0.5192307692) < 0.000001);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => url.searchParams.get("apiKey") === "secret"));
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes a three-way soccer draw into a binary Yes market", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));

    if (url.pathname.endsWith("/sports/")) {
      return Response.json([{
        key: "soccer_concacaf_nations_league",
        title: "CONCACAF Nations League",
        active: true,
      }]);
    }

    return Response.json([{
      id: "game-2",
      commence_time: "2026-09-23T23:00:00Z",
      home_team: "Aruba",
      away_team: "Antigua and Barbuda",
      bookmakers: [
        { markets: [{ key: "h2h", outcomes: [{ name: "Aruba", price: 2 }, { name: "Antigua and Barbuda", price: 3 }, { name: "Draw", price: 4 }] }] },
        { markets: [{ key: "h2h", outcomes: [{ name: "Aruba", price: 2.1 }, { name: "Antigua and Barbuda", price: 2.9 }, { name: "Draw", price: 3.8 }] }] },
      ],
    }]);
  };

  const drawCandidate = candidate({
    market: {
      id: "soccer-draw",
      question: "Will Aruba vs. Antigua and Barbuda end in a draw?",
      slug: "conl-aru-atg-2026-09-23-draw",
      asset: "OTHER",
      closesAt: "2026-09-23T23:00:00Z",
      active: true,
      outcomes: [
        { outcome: "Yes", tokenId: "yes", price: 0.25 },
        { outcome: "No", tokenId: "no", price: 0.75 },
      ],
    },
    participants: ["Aruba", "Antigua and Barbuda"],
    selection: "Draw",
    tags: ["sports", "soccer", "concacaf-nations-league"],
  });

  try {
    const match = await new SportsOddsClient("secret", 60_000).findConsensus([drawCandidate]);

    assert.ok(match);
    assert.equal(match.referenceOutcome, "Yes");
    assert.equal(match.bookmakerCount, 2);
    assert.ok(match.probability > 0.22 && match.probability < 0.26);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});
