import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaperStore } from "./store.js";

test("resetSession clears persisted activity and P&L while restoring configured cash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-store-"));
  const store = new PaperStore(join(directory, "state.json"), 250);

  try {
    const previous = await store.resetSession();
    previous.cash = 100;
    previous.positions.push({ id: "old", marketId: "old", question: "Old", outcome: "Up", tokenId: "1", shares: 1, entryPrice: 1, entryFeeUsd: 0, openedAt: new Date().toISOString(), expiresAt: new Date().toISOString(), status: "SETTLED", realizedPnl: 20, settledAt: new Date().toISOString() });
    previous.arbitragePositions.push({ id: "old-basket", marketId: "old", question: "Old", firstOutcome: "Up", secondOutcome: "Down", sharesPerOutcome: 1, totalCostUsd: 0.9, totalFeeUsd: 0, guaranteedPayoutUsd: 1, lockedProfitUsd: 0.1, openedAt: new Date().toISOString(), status: "OPEN" });
    previous.dailyRealizedPnl["2026-10-24"] = 20;
    previous.events.push({ at: new Date().toISOString(), type: "PAPER_SETTLEMENT", message: "old activity" });
    await store.save(previous);

    const current = await store.resetSession();
    const persisted = await store.load();

    assert.equal(current.cash, 250);
    assert.equal(current.startingCash, 250);
    assert.equal(persisted.cash, 250);
    assert.deepEqual(persisted.positions, []);
    assert.deepEqual(persisted.arbitragePositions, []);
    assert.deepEqual(persisted.dailyRealizedPnl, {});
    assert.deepEqual(persisted.events, []);
  }
  finally {
    await rm(directory, { recursive: true, force: true });
  }
});
