import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { GithubApiError, GithubClient } from "./client.js";

describe("GithubClient hardening", () => {
  it("captures rate-limit metadata without exposing the authorization header", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () => new Response(JSON.stringify({
      message: "API rate limit exceeded",
      documentation_url: "https://docs.github.com/rest"
    }), {
      status: 429,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-limit": "60",
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "12345",
        "retry-after": "30"
      }
    }));

    try {
      await assert.rejects(
        () => new GithubClient("secret-token").rest("/user"),
        (error: unknown) => {
          assert.ok(error instanceof GithubApiError);
          assert.equal(error.status, 429);
          assert.equal(error.rateLimit.remaining, 0);
          assert.equal(error.rateLimit.retryAfterSeconds, 30);
          assert.equal(JSON.stringify(error.responseBody).includes("secret-token"), false);
          return true;
        }
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
