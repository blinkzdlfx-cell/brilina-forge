import test from "node:test";
import assert from "node:assert/strict";
import { app } from "./server.js";
import { createSession, deleteSession } from "./auth/session.js";

process.env.GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "test-client-id";
process.env.GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "test-client-secret";

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("runtime session refreshes an expiring GitHub token before serving /api/github/me", async () => {
  const session = await createSession(
    "old-access-token",
    {
      login: "test-user",
      id: 123,
      name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      html_url: "https://github.com/test-user"
    },
    {
      refreshToken: "old-refresh-token",
      expiresAt: Date.now() + 30_000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60_000
    }
  );

  const calls: Array<{ url: string; authorization?: string }> = [];

  globalThis.fetch = async (input, init) => {
    const url = String(input);
    calls.push({
      url,
      authorization: new Headers(init?.headers).get("authorization") ?? undefined
    });

    if (url === "https://github.com/login/oauth/access_token") {
      return jsonResponse({
        access_token: "refreshed-access-token",
        refresh_token: "refreshed-refresh-token",
        expires_in: 28800,
        refresh_token_expires_in: 15811200
      });
    }

    if (url === "https://api.github.com/user") {
      return jsonResponse({
        login: "test-user",
        id: 123,
        name: "Test User",
        avatar_url: "https://example.com/avatar.png",
        html_url: "https://github.com/test-user"
      });
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/github/me",
      headers: { cookie: `brilina_session=${session.id}` }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().login, "test-user");

    const refreshCall = calls.find(call => call.url === "https://github.com/login/oauth/access_token");
    assert.ok(refreshCall);
    assert.equal(refreshCall.authorization, undefined);

    const userCall = calls.find(call => call.url === "https://api.github.com/user");
    assert.ok(userCall);
    assert.equal(userCall.authorization, "Bearer refreshed-access-token");
  } finally {
    await deleteSession(session.id);
    globalThis.fetch = originalFetch;
  }
});

test("runtime session is rejected when refresh credentials are unavailable", async () => {
  const session = await createSession(
    "expired-access-token",
    {
      login: "test-user",
      id: 123,
      name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      html_url: "https://github.com/test-user"
    },
    { expiresAt: Date.now() + 30_000 }
  );

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/github/me",
      headers: { cookie: `brilina_session=${session.id}` }
    });

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.json(), {
      error: "GitHub authorization expired; sign in again"
    });
  } finally {
    await deleteSession(session.id);
  }
});

test("runtime session does not refresh a token with more than 60 seconds remaining", async () => {
  const session = await createSession(
    "valid-access-token",
    {
      login: "test-user",
      id: 123,
      name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      html_url: "https://github.com/test-user"
    },
    {
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 5 * 60_000,
      refreshTokenExpiresAt: Date.now() + 30 * 24 * 60 * 60_000
    }
  );

  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return jsonResponse({
      login: "test-user",
      id: 123,
      name: "Test User",
      avatar_url: "https://example.com/avatar.png",
      html_url: "https://github.com/test-user"
    });
  };

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/github/me",
      headers: { cookie: `brilina_session=${session.id}` }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(fetchCalls, 1);
  } finally {
    await deleteSession(session.id);
    globalThis.fetch = originalFetch;
  }
});
