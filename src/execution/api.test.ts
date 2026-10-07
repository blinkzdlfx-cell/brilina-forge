import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../server.js";

process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "test-client-id";
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "test-client-secret";

test("terminal routes require an authenticated session before touching the worker", async () => {
  const endpoints = [
    { method: "GET", url: "/api/terminal/sessions" },
    { method: "POST", url: "/api/terminal/sessions", payload: { conversationId: "c" } },
    { method: "GET", url: "/api/terminal/sessions/abc" },
    { method: "GET", url: "/api/terminal/sessions/abc/output" },
    { method: "POST", url: "/api/terminal/sessions/abc/exec", payload: { command: "ls" } },
    { method: "DELETE", url: "/api/terminal/sessions/abc" }
  ] as const;

  for (const endpoint of endpoints) {
    const response = await app.inject(endpoint);
    assert.equal(response.statusCode, 401, endpoint.url);
    assert.match(response.body, /GitHub authentication required/);
  }
});

test("terminal exec parameters are validated only after authentication", async () => {
  const response = await app.inject({
    method: "POST",
    url: "/api/terminal/sessions/abc/exec",
    payload: { command: "ls" }
  });

  assert.equal(response.statusCode, 401);
});