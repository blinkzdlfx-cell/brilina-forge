import test from "node:test";
import assert from "node:assert/strict";
import {
  createGithubAuthorization,
  verifierFromStateCookie,
  verifyStateBinding
} from "../src/auth/github.js";

test("OAuth state binding is self-contained and does not require Worker memory", () => {
  process.env.GITHUB_CLIENT_ID = "test-client";
  process.env.PUBLIC_BASE_URL = "https://forge.example";
  const authorization = createGithubAuthorization();
  const url = new URL(authorization.url);
  const state = url.searchParams.get("state");

  assert.ok(state);
  assert.equal(verifyStateBinding(authorization.stateCookieValue, state), true);
  assert.ok(verifierFromStateCookie(authorization.stateCookieValue));
  assert.equal(
    verifyStateBinding(authorization.stateCookieValue, "attacker-state"),
    false
  );
});

test("OAuth verifier cannot be recovered from malformed state cookies", () => {
  assert.equal(verifierFromStateCookie(undefined), undefined);
  assert.equal(verifierFromStateCookie(""), undefined);
  assert.equal(verifierFromStateCookie("state-only"), undefined);
  assert.equal(verifierFromStateCookie("state."), undefined);
});
