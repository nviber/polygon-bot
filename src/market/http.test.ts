import assert from "node:assert/strict";
import test from "node:test";
import { describeNetworkError, fetchPublic } from "./http.js";

test("reports nested connection details from a failed fetch", () => {
  const connectionError = Object.assign(new Error("connect EACCES 104.18.36.178:443"), { code: "EACCES" });
  const aggregate = Object.assign(new AggregateError([connectionError]), { code: "EACCES" });
  const failure = new TypeError("fetch failed", { cause: aggregate });

  const detail = describeNetworkError(failure);

  assert.match(detail, /fetch failed/);
  assert.match(detail, /EACCES/);
  assert.match(detail, /104\.18\.36\.178:443/);
});

test("retries temporary network failures", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;

  globalThis.fetch = async () => {
    attempts += 1;

    if (attempts < 3) {
      throw Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(new Error("socket reset"), { code: "ECONNRESET" }),
      });
    }

    return new Response("{}", { status: 200 });
  };

  try {
    const response = await fetchPublic("https://example.test", "Test source");
    assert.equal(response.status, 200);
    assert.equal(attempts, 3);
  }
  finally {
    globalThis.fetch = originalFetch;
  }
});
