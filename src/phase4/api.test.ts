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

test("session endpoint reports an unauthenticated visitor without erroring", async () => {
  const response = await app.inject({ method: "GET", url: "/api/session" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { authenticated: false });
});

test("session endpoint reports an authenticated visitor", async () => {
  const { createSession, deleteSession } = await import("../auth/session.js");
  const session = await createSession(
    "access-token",
    { id: 7, login: "session-user", name: null, avatar_url: "", html_url: "" },
    {}
  );

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/session",
      headers: { cookie: `brilina_session=${session.id}` }
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().authenticated, true);
    assert.equal(response.json().githubUser.login, "session-user");
  } finally {
    await deleteSession(session.id);
  }
});

test("branch comparison requires both refs", async () => {
  const { createSession, deleteSession } = await import("../auth/session.js");
  const session = await createSession(
    "access-token",
    { id: 8, login: "session-user", name: null, avatar_url: "", html_url: "" },
    {}
  );

  try {
    const response = await app.inject({
      method: "GET",
      url: "/api/github/repos/owner/repo/compare?base=main",
      headers: { cookie: `brilina_session=${session.id}` }
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "missing_compare_refs" });
  } finally {
    await deleteSession(session.id);
  }
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

test("GitHub read routes authenticate before validating request parameters", async () => {
  const endpoints = [
    "/api/github/repos/owner/repo/compare?base=main",
    "/api/github/repos/owner/repo/commits?per_page=999",
    "/api/github/repos/owner/repo/tree",
    "/api/github/repos?page=0"
  ];

  for (const url of endpoints) {
    const response = await app.inject({ method: "GET", url });
    assert.equal(response.statusCode, 401, url);
  }
});
