import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const researchIds = [
  "btc-intraday-reversal",
  "btc-5m-time-series-momentum",
  "btc-range-breakout",
  "btc-moving-average-crossover",
  "btc-volatility-scaled-momentum",
];
const artifactsDirectory = "/state/artifacts";
const screenshotPath = process.env.SCREENSHOT_PATH ?? path.join(artifactsDirectory, "strategy-dashboard.png");
let temporaryDirectory;
let serverProcess;
let browser;
let dashboardUrl;
let statePath;

const reservePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve a local port");
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
};

const waitForDashboard = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${dashboardUrl}/api/status`);
      if (response.ok && !(await response.json()).runtime.busy) return;
    }
    catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Dashboard did not become ready");
};

before(async () => {
  temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "polygon-dashboard-e2e-"));
  await mkdir(path.dirname(screenshotPath), { recursive: true });
  const port = await reservePort();
  dashboardUrl = `http://127.0.0.1:${port}`;
  const now = Date.now();
  const position = (overrides) => ({
    id: "position",
    marketId: "market",
    question: "Bitcoin Up or Down?",
    outcome: "Up",
    tokenId: "up",
    shares: 2,
    entryPrice: 0.4,
    entryFeeUsd: 0.02,
    openedAt: new Date(now - 600_000).toISOString(),
    expiresAt: new Date(now - 300_000).toISOString(),
    status: "SETTLED",
    ...overrides,
  });
  statePath = path.join(temporaryDirectory, "paper-state.json");
  await writeFile(statePath, JSON.stringify({
    cash: 999,
    startingCash: 1000,
    positions: [
      position({ id: "settled-reversal", strategyId: "btc-intraday-reversal", realizedPnl: -0.35 }),
      position({ id: "unresolved-reversal", strategyId: "btc-intraday-reversal", status: "OPEN", expiresAt: new Date(now + 300_000).toISOString(), realizedPnl: 99 }),
      position({ id: "legacy-position", realizedPnl: 0.1 }),
    ],
    arbitragePositions: [],
    dailyRealizedPnl: { [new Date(now).toISOString().slice(0, 10)]: -0.35 },
    events: [],
  }), "utf8");
  serverProcess = spawn(process.execPath, [path.join(root, "dist/index.js"), "dashboard"], {
    cwd: root,
    env: {
      ...process.env,
      DASHBOARD_PORT: String(port),
      PAPER_STARTING_CASH: "1000",
      PAPER_STATE_PATH: statePath,
      ENABLED_STRATEGIES: "btc-5m-momentum,btc-paper-exploration",
    },
    stdio: "ignore",
  });
  await waitForDashboard();
  const resetState = JSON.parse(await readFile(statePath, "utf8"));
  assert.equal(resetState.cash, 1000);
  assert.deepEqual(resetState.positions, []);
  assert.deepEqual(resetState.arbitragePositions, []);
  assert.deepEqual(resetState.dailyRealizedPnl, {});

  const recentAt = new Date(now - 30 * 60_000).toISOString();
  const oldAt = new Date(now - 10 * 24 * 60 * 60_000).toISOString();
  await writeFile(statePath, JSON.stringify({
    cash: 999,
    startingCash: 1000,
    positions: [
      position({ id: "settled-reversal", strategyId: "btc-intraday-reversal", realizedPnl: -0.35, settledAt: recentAt }),
      position({ id: "unresolved-reversal", strategyId: "btc-intraday-reversal", status: "OPEN", expiresAt: new Date(now + 300_000).toISOString() }),
      position({ id: "legacy-position", realizedPnl: 0.1, settledAt: recentAt }),
      position({ id: "old-position", openedAt: oldAt, expiresAt: oldAt, settledAt: oldAt, realizedPnl: -0.25 }),
    ],
    arbitragePositions: [
      { id: "recent-redeemed", marketId: "recent", question: "Recent basket", firstOutcome: "Up", secondOutcome: "Down", sharesPerOutcome: 1, totalCostUsd: 0.6, totalFeeUsd: 0, guaranteedPayoutUsd: 1, lockedProfitUsd: 0.4, openedAt: recentAt, status: "REDEEMED" },
      { id: "old-redeemed", marketId: "old", question: "Old basket", firstOutcome: "Up", secondOutcome: "Down", sharesPerOutcome: 1, totalCostUsd: 0.8, totalFeeUsd: 0, guaranteedPayoutUsd: 1, lockedProfitUsd: 0.2, openedAt: oldAt, status: "REDEEMED" },
    ],
    dailyRealizedPnl: { [new Date(now).toISOString().slice(0, 10)]: -0.25 },
    events: [
      { at: recentAt, type: "PAPER_SETTLEMENT", message: "Recent reversal settled" },
      { at: recentAt, type: "PAPER_SETTLEMENT", message: "Recent legacy settled" },
      { at: recentAt, type: "PAPER_FILL", message: "Recent trade filled" },
      { at: recentAt, type: "PAPER_ARBITRAGE", message: "Recent basket redeemed" },
      { at: oldAt, type: "PAPER_SETTLEMENT", message: "Old settlement" },
      { at: oldAt, type: "PAPER_ARBITRAGE", message: "Old basket redeemed" },
    ],
  }), "utf8");
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
});

after(async () => {
  await browser?.close();
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill("SIGTERM");
    await once(serverProcess, "exit");
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
});

test("dashboard isolates all five BTC candidates and excludes unresolved positions from realized results", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });

  const checkboxes = page.locator('input[name="strategy"]');
  for (const id of researchIds) {
    const checkbox = page.locator(`input[name="strategy"][value="${id}"]`);
    assert.equal(await checkbox.count(), 1, `${id} selector exists`);
    assert.equal(await checkbox.isVisible(), true, `${id} selector is visible`);
    await checkbox.check();
    await page.getByRole("button", { name: "Apply selection" }).click();
    const status = await (await page.request.get(`${dashboardUrl}/api/status`)).json();
    assert.deepEqual(status.runtime.enabledStrategies, [id]);
    assert.equal(status.strategies.find((strategy) => strategy.id === id)?.enabled, true);
    assert.equal(await page.locator('input[name="strategy"]:checked').count(), 1, "exactly one BTC strategy remains selected");
  }

  const status = await (await page.request.get(`${dashboardUrl}/api/status`)).json();
  const reversal = status.strategyPerformance.find((entry) => entry.strategyId === "btc-intraday-reversal");
  assert.deepEqual({
    resolvedPositionCount: reversal.resolvedPositionCount,
    realizedNetPnl: reversal.realizedNetPnl,
    openPositionCount: reversal.openPositionCount,
  }, { resolvedPositionCount: 1, realizedNetPnl: -0.35, openPositionCount: 1 });
  const resultsRow = page.locator("#strategy-performance tr").filter({ hasText: "90s overreaction reversal" });
  assert.equal(await resultsRow.count(), 1);
  assert.deepEqual(await resultsRow.locator("td").allTextContents(), ["90s overreaction reversal", "1", "-$0.35", "1"]);
  assert.equal(await page.locator("#strategy-performance tr").count(), status.strategies.length + 1);
  assert.equal(await page.locator("#strategy-performance").innerText().then((text) => text.includes("Unattributed / legacy")), true);

  const invalidSelection = await page.request.post(`${dashboardUrl}/api/strategies`, {
    data: { ids: ["btc-intraday-reversal", "btc-range-breakout"] },
  });
  assert.equal(invalidSelection.status(), 400);
  assert.deepEqual(pageErrors, []);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  assert.ok((await stat(screenshotPath)).size > 10_000, "dashboard screenshot was captured");
  await page.close();
});


test("history page defaults to all time and filters activity and redeemed profits", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByRole("link", { name: "History" }).click();
  await page.waitForFunction(() => document.querySelector("#history-status")?.textContent === "");

  assert.equal(await page.locator("#period").inputValue(), "all");
  assert.equal(await page.locator("#period-title").innerText(), "All time");
  assert.equal(await page.locator("#realized-profit").innerText(), "-$0.50");
  assert.equal(await page.locator("#locked-profit").innerText(), "$0.60");
  assert.equal(await page.locator("#total-profit").innerText(), "$0.10");
  assert.equal(await page.locator("#activity-count").innerText(), "6 entries");

  await page.locator("#period").selectOption("7d");
  await page.waitForFunction(() => document.querySelector("#total-profit")?.textContent === "$0.15");
  assert.equal(await page.locator("#period-title").innerText(), "Last 7 days");
  assert.equal(await page.locator("#realized-profit").innerText(), "-$0.25");
  assert.equal(await page.locator("#locked-profit").innerText(), "$0.40");
  assert.equal(await page.locator("#trade-count").innerText(), "2");
  assert.equal(await page.locator("#activity-count").innerText(), "4 entries");
  assert.equal(await page.locator("#events").innerText().then((text) => text.includes("Old settlement")), false);

  await page.request.post(dashboardUrl + "/api/runtime/start");
  await page.request.post(dashboardUrl + "/api/runtime/stop");
  const retainedHistoryResponse = await page.request.get(dashboardUrl + "/api/history?period=7d");
  assert.equal(retainedHistoryResponse.status(), 200);
  const retainedHistory = await retainedHistoryResponse.json();
  assert.equal(retainedHistory.lockedProfit >= 0.4, true);
  assert.equal(retainedHistory.events.some((event) => event.message === "Recent basket redeemed"), true);

  await page.getByRole("link", { name: "Dashboard" }).click();
  assert.equal(await page.locator("h1").innerText(), "Strategy control room");
  assert.equal(await page.locator("#period").count(), 0);
  assert.equal(await page.locator("#events").count(), 0);
  assert.deepEqual(pageErrors, []);
  await page.close();
});
