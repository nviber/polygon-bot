import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { config, strategyIds, type StrategyId, validateStrategySelection } from "../config.js";
import { PaperTradingEngine } from "../engine.js";
import { PaperStore } from "../store.js";
import { strategyOptions } from "../strategy/registry.js";
import { summarizeStrategyPerformance } from "../strategy/performance.js";
import { summarizeHistory, historyPeriods, type HistoryPeriod } from "./history.js";
import { dashboardPage, dashboardStyles, historyPage } from "./page.js";import { BotRuntime } from "./runtime.js";

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
};

const text = (response: ServerResponse, status: number, body: string, contentType: string): void => {
  response.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
};

const readJson = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;

    if (size > 32_768) {
      throw new Error("Request body is too large");
    }

    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
};

const isStrategyId = (value: unknown): value is StrategyId =>
  typeof value === "string" && strategyIds.includes(value as StrategyId);

export const startDashboardServer = async (store = new PaperStore(config.statePath, config.startingCash)): Promise<void> => {
  const engine = new PaperTradingEngine();
  const runtime = new BotRuntime(engine, store);
  const clientScript = await readFile(new URL("./client.js", import.meta.url), "utf8");
  const historyClientScript = await readFile(new URL("./history-client.js", import.meta.url), "utf8");

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (request.method === "GET" && url.pathname === "/") {
        text(response, 200, dashboardPage, "text/html");
        return;
      }

      if (request.method === "GET" && url.pathname === "/history") {
        text(response, 200, historyPage, "text/html");
        return;
      }

      if (request.method === "GET" && url.pathname === "/styles.css") {
        text(response, 200, dashboardStyles, "text/css");
        return;
      }

      if (request.method === "GET" && url.pathname === "/app.js") {
        text(response, 200, clientScript, "text/javascript");
        return;
      }

      if (request.method === "GET" && url.pathname === "/history.js") {
        text(response, 200, historyClientScript, "text/javascript");
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/history") {
        const requestedPeriod = url.searchParams.get("period") ?? "all";
        if (!historyPeriods.includes(requestedPeriod as HistoryPeriod)) {
          json(response, 400, { error: `Invalid history period: ${requestedPeriod}` });
          return;
        }
        json(response, 200, summarizeHistory(await runtime.state(), requestedPeriod as HistoryPeriod));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/status") {
        const state = await runtime.state();
        const openPositions = state.positions.filter((position) => position.status === "OPEN");
        const openExposure = openPositions.reduce(
          (sum, position) => sum + position.entryPrice * position.shares + (position.entryFeeUsd ?? 0),
          0,
        );
        const realizedPnl = Object.values(state.dailyRealizedPnl).reduce((sum, value) => sum + value, 0);
        const openArbitrages = state.arbitragePositions.filter((position) => position.status === "OPEN");
        const lockedArbitrageProfit = openArbitrages.reduce(
          (sum, position) => sum + position.lockedProfitUsd,
          0,
        );
        const enabled = new Set(runtime.status().enabledStrategies);

        json(response, 200, {
          runtime: runtime.status(),
          account: {
            cash: state.cash,
            openExposure,
            realizedPnl,
            lockedArbitrageProfit,
            openPositions: openPositions.length,
            openArbitrages: openArbitrages.length,
          },
          strategyPerformance: summarizeStrategyPerformance(state.positions),
          positions: [...state.positions].reverse(),
          arbitrages: [...state.arbitragePositions].reverse(),
          events: [...state.events].reverse().slice(0, 30),
          strategies: strategyOptions.map((strategy) => ({ ...strategy, enabled: enabled.has(strategy.id) })),
          risk: {
            maxTradeUsd: config.maxTradeUsd,
            maxDailyLossUsd: config.maxDailyLossUsd,
            maxOpenExposureUsd: config.maxOpenExposureUsd,
            maxSpread: config.maxSpread,
            minExpectedEdge: config.minExpectedEdge,
            minStrategyAgreement: config.minStrategyAgreement,
          },
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runtime/start") {
        runtime.start();
        json(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runtime/stop") {
        runtime.stop();
        json(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/runtime/tick") {
        await runtime.tick();
        json(response, 200, { ok: true });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/strategies") {
        const body = await readJson(request) as { ids?: unknown };

        if (!Array.isArray(body.ids) || body.ids.length === 0 || !body.ids.every(isStrategyId)) {
          json(response, 400, { error: "Select one or more valid strategies" });
          return;
        }

        const ids = [...new Set(body.ids)] as StrategyId[];

        try {
          validateStrategySelection(ids);
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          json(response, 400, { error: message });
          return;
        }

        runtime.setStrategies(ids);
        json(response, 200, { ok: true });
        return;
      }

      json(response, 404, { error: "Not found" });
    }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      json(response, 500, { error: message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.dashboardPort, "127.0.0.1", () => resolve());
  });

  console.log(`Dashboard ready at http://127.0.0.1:${config.dashboardPort}`);
};
