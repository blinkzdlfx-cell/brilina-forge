import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSession, getSession, updateSessionCredentials } from "./session.js";

describe("session hardening", () => {
  it("stores and updates expiring GitHub credentials", () => {
    const session = createSession("access-1", { id: 1, login: "tester", name: null, avatar_url: "", html_url: "" }, {
      refreshToken: "refresh-1",
      expiresAt: Date.now() + 60_000,
      refreshTokenExpiresAt: Date.now() + 3600_000
    });
    assert.equal(getSession(session.id)?.refreshToken, "refresh-1");
    updateSessionCredentials(session.id, {
      accessToken: "access-2",
      refreshToken: "refresh-2",
      expiresAt: Date.now() + 120_000,
      refreshTokenExpiresAt: Date.now() + 3600_000
    });
    assert.equal(getSession(session.id)?.accessToken, "access-2");
    assert.equal(getSession(session.id)?.refreshToken, "refresh-2");
  });
});
