import "dotenv/config";
import { config } from "./config.js";
import { startDashboardServer } from "./dashboard/server.js";
import { PaperTradingEngine } from "./engine.js";
import { PaperStore } from "./store.js";

const mode = process.argv[2] ?? "once";

if (mode !== "once" && mode !== "watch" && mode !== "dashboard") {
  throw new Error("Usage: polygon-bot [dashboard|once|watch]");
}

const store = new PaperStore(config.statePath, config.startingCash);
const engine = new PaperTradingEngine();

async function run(): Promise<void> {
  const state = await store.load();
  try {
    console.log(`${new Date().toISOString()} ${await engine.tick(state)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.events.push({ at: new Date().toISOString(), type: "ERROR", message });
    console.error(`${new Date().toISOString()} tick failed: ${message}`);
  }

  await store.save(state);
}

await store.resetSession();

if (mode === "dashboard") {
  await startDashboardServer(store);
}
else {
  await run();
}

if (mode === "watch") {
  setInterval(() => {
    void run();
  }, config.pollIntervalMs);
}
