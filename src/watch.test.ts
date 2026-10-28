import assert from "node:assert/strict";
import test from "node:test";
import { runWatchLoop } from "./watch.js";

test("watch waits for each asynchronous tick before starting the next", async () => {
  const controller = new AbortController();
  let activeTicks = 0;
  let maximumActiveTicks = 0;
  let tickCount = 0;

  await runWatchLoop(async () => {
    activeTicks += 1;
    maximumActiveTicks = Math.max(maximumActiveTicks, activeTicks);
    tickCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    activeTicks -= 1;

    if (tickCount === 3) {
      controller.abort();
    }
  }, 0, controller.signal);

  assert.equal(tickCount, 3);
  assert.equal(maximumActiveTicks, 1);
  assert.equal(activeTicks, 0);
});
