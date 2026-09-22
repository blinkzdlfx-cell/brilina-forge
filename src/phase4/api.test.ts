import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../server.js";

test("health endpoint exposes the Forge service contract", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    ok: true,
    service: "brilina-forge",
    phase: 4
  });
});

test("conversation APIs require an authenticated Forge session", async () => {
  const endpoints = [
    { method: "GET", url: "/api/conversations" },
    { method: "POST", url: "/api/conversations", payload: {} },
    { method: "GET", url: "/api/conversations/not-a-real-id/messages" },
    { method: "POST", url: "/api/conversations/not-a-real-id/runs", payload: { message: "inspect repo" } },
    { method: "GET", url: "/api/runs/not-a-real-id/events" }
  ] as const;

  for (const endpoint of endpoints) {
    const response = await app.inject(endpoint);
    assert.equal(response.statusCode, 401, endpoint.url);
    assert.match(response.body, /GitHub authentication required/);
  }
});
