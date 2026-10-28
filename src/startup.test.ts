import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const availablePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
};

test("application startup clears persisted paper-trading session data", { timeout: 15_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "paper-startup-"));
  const statePath = join(directory, "paper-state.json");
  const port = await availablePort();
  const previousSession = {
    cash: 1,
    startingCash: 1_000,
    positions: [{ id: "prior", status: "SETTLED", realizedPnl: 99 }],
    arbitragePositions: [{ id: "prior-basket", status: "REDEEMED", lockedProfitUsd: 1 }],
    dailyRealizedPnl: { "2026-10-01": 99 },
    events: [{ at: "2026-10-01T00:00:00.000Z", type: "PAPER_FILL", message: "prior session" }],
  };
  await writeFile(statePath, JSON.stringify(previousSession));

  const application = spawn(process.execPath, [fileURLToPath(new URL("./index.js", import.meta.url)), "dashboard"], {
    env: {
      ...process.env,
      PAPER_STATE_PATH: statePath,
      PAPER_STARTING_CASH: "250",
      DASHBOARD_PORT: String(port),
      ENABLED_STRATEGIES: "weather-forecast-edge",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  application.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  application.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });

  try {
    const endpoint = `http://127.0.0.1:${port}/api/status`;
    const deadline = Date.now() + 10_000;
    let response: Response | undefined;

    while (Date.now() < deadline) {
      if (application.exitCode !== null) {
        throw new Error(`Dashboard exited before becoming ready: ${output}`);
      }

      try {
        const result = await fetch(endpoint, { signal: AbortSignal.timeout(1_000) });
        if (result.ok) {
          response = result;
          break;
        }
      }
      catch {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    assert.ok(response, `Dashboard did not become ready: ${output}`);
    const status = await response.json() as { account: { cash: number }; positions: unknown[]; arbitrages: unknown[] };
    const persisted = JSON.parse(await readFile(statePath, "utf8")) as {
      cash: number;
      startingCash: number;
      positions: unknown[];
      arbitragePositions: unknown[];
      dailyRealizedPnl: Record<string, number>;
      events: unknown[];
    };

    assert.equal(status.account.cash, 250);
    assert.equal(persisted.cash, 250);
    assert.equal(persisted.startingCash, 250);
    assert.deepEqual(persisted.positions, []);
    assert.deepEqual(persisted.arbitragePositions, []);
    assert.deepEqual(persisted.dailyRealizedPnl, {});
    assert.deepEqual(persisted.events, []);
  }
  finally {
    if (application.exitCode === null && application.signalCode === null) {
      const exited = once(application, "exit");
      application.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
