import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../server.js";

process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "test-client-id";
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "test-client-secret";

const EVIL_ORIGIN = "https://evil.example";

test("responses carry the expected security headers", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.headers["x-frame-options"], "DENY");
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.match(String(response.headers["content-security-policy"] ?? ""), /frame-ancestors 'none'/);
});

test("the session cookie is HttpOnly and SameSite=Strict", async () => {
  const response = await app.inject({ method: "GET", url: "/auth/github/start" });
  const cookie = String(response.headers["set-cookie"]);

  assert.match(cookie, /brilina_oauth_state=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});

test("cross-origin requests are rejected on state-changing routes", async () => {
  const routes = [
    { method: "POST", url: "/api/conversations", payload: {} },
    { method: "POST", url: "/api/terminal/sessions", payload: {} },
    { method: "POST", url: "/auth/github/logout" }
  ] as const;

  for (const route of routes) {
    const response = await app.inject({ ...route, headers: { origin: EVIL_ORIGIN } });
    assert.equal(response.statusCode, 403, route.url);
    assert.match(response.body, /Cross-origin request rejected/);
  }
});

test("cross-origin run event streams are rejected before authentication", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/runs/6f1f0e5a-1f2a-4c3b-9d8e-0a1b2c3d4e5f/events",
    headers: { origin: EVIL_ORIGIN }
  });

  assert.equal(response.statusCode, 403);
});

test("the GitHub OAuth callback rejects a state that does not match the browser binding", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/auth/github/callback?code=abc&state=attacker-state"
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "oauth_state_binding_mismatch" });
});

test("a mismatched OAuth state binding is rejected even when the cookie is present", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/auth/github/callback?code=abc&state=attacker-state",
    headers: { cookie: "brilina_oauth_state=victim-state" }
  });

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json(), { error: "oauth_state_binding_mismatch" });
});

test("malformed identifiers are rejected as bad requests instead of reaching the database", async () => {
  const routes = [
    "/api/conversations/not-a-uuid/messages",
    "/api/runs/not-a-uuid/events",
    "/api/terminal/sessions/!!/output"
  ];

  for (const url of routes) {
    const session = await (await import("../auth/session.js")).createSession(
      "token",
      { id: 1, login: "tester", name: null, avatar_url: "", html_url: "" },
      {}
    );
    const response = await app.inject({
      method: "GET",
      url,
      headers: { cookie: `brilina_session=${session.id}` }
    });
    assert.ok([400, 401, 404, 500].includes(response.statusCode), `${url} -> ${response.statusCode}`);
  }
});

test("static serving never exposes secrets through any path traversal form", async () => {
  // Node normalizes literal "../" before routing, so the raw form arrives as
  // "/.env"; the encoded forms must be rejected outright.
  for (const url of [
    "/../../../../.env",
    "/..%2f..%2f..%2f.env",
    "/%2e%2e/%2e%2e/.env",
    "/%2e%2e%2f%2e%2e%2f.env",
    "/assets/../../../../.env"
  ]) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.body.includes("GITHUB_CLIENT_SECRET"), false, url);
    assert.equal(response.body.includes("DATABASE_URL"), false, url);
    assert.notEqual(response.statusCode, 200, `${url} must not serve a file`);
  }
});

test("dotfile requests are not answered with the SPA shell", async () => {
  const response = await app.inject({ method: "GET", url: "/.env" });
  assert.equal(response.statusCode, 404);
});

test("static serving returns 404 for a missing asset and 400 for an encoded escape", async () => {
  const missing = await app.inject({ method: "GET", url: "/assets/does-not-exist-12345.js" });
  assert.equal(missing.statusCode, 404);

  const escaping = await app.inject({ method: "GET", url: "/%2e%2e%2f%2e%2e%2f%2e%2e%2fetc/passwd" });
  assert.equal(escaping.statusCode, 400);
});

test("static serving does not expose the repository .env through encoded traversal", async () => {
  const response = await app.inject({ method: "GET", url: "/%2e%2e%2f%2e%2e%2f.env" });
  assert.ok(response.statusCode >= 400);
  assert.equal(response.body.includes("DATABASE_URL"), false);
});