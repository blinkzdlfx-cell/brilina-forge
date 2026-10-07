import assert from "node:assert/strict";
import test from "node:test";
import { cooldownFor, withCooldownRetry } from "./retry.js";
import { wrapWithCooldownRetry } from "./retry-model.js";
import { AiProviderError, type AiProviderErrorDetails } from "./types.js";

function providerError(overrides: Partial<AiProviderErrorDetails> = {}): AiProviderError {
  return new AiProviderError({
    provider: "openai-compatible",
    model: "test-model",
    kind: "rate_limited",
    retryable: true,
    retryAfterMs: 100,
    message: "rate limited",
    ...overrides
  });
}

test("withCooldownRetry retries retryable provider errors and returns the eventual value", async () => {
  const waits: number[] = [];
  let attempts = 0;

  const { value, retries } = await withCooldownRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) throw providerError();
      return "ok";
    },
    { maxAttempts: 5, sleep: async ms => { waits.push(ms); } }
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 3);
  assert.equal(retries, 2);
  assert.deepEqual(waits, [100, 100]);
});

test("withCooldownRetry respects a provider supplied cooldown instead of a fixed delay", async () => {
  const waits: number[] = [];
  let attempts = 0;

  await withCooldownRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw providerError({ retryAfterMs: 2500 });
      return "ok";
    },
    { maxAttempts: 3, baseDelayMs: 10, sleep: async ms => { waits.push(ms); } }
  );

  assert.deepEqual(waits, [2500]);
});

test("withCooldownRetry caps the cooldown at the configured maximum", async () => {
  const waits: number[] = [];
  let attempts = 0;

  await withCooldownRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) throw providerError({ retryAfterMs: 10 * 60_000 });
      return "ok";
    },
    { maxAttempts: 3, maxCooldownMs: 30_000, sleep: async ms => { waits.push(ms); } }
  );

  assert.deepEqual(waits, [30_000]);
});

test("withCooldownRetry does not retry terminal provider errors", async () => {
  let attempts = 0;

  await assert.rejects(
    () => withCooldownRetry(
      async () => {
        attempts += 1;
        throw providerError({ kind: "authentication", retryable: false, retryAfterMs: undefined });
      },
      { maxAttempts: 5, sleep: async () => undefined }
    ),
    /rate limited/
  );

  assert.equal(attempts, 1);
});

test("withCooldownRetry gives up after the attempt budget", async () => {
  let attempts = 0;

  await assert.rejects(
    () => withCooldownRetry(
      async () => {
        attempts += 1;
        throw providerError();
      },
      { maxAttempts: 3, sleep: async () => undefined }
    ),
    /rate limited/
  );

  assert.equal(attempts, 3);
});

test("withCooldownRetry does not retry non-provider failures", async () => {
  let attempts = 0;

  await assert.rejects(
    () => withCooldownRetry(
      async () => {
        attempts += 1;
        throw new Error("programming bug");
      },
      { maxAttempts: 4, sleep: async () => undefined }
    ),
    /programming bug/
  );

  assert.equal(attempts, 1);
});

test("cooldownFor falls back to exponential backoff without a retry-after value", () => {
  const options = { maxAttempts: 3, maxCooldownMs: 30_000, baseDelayMs: 500 };
  assert.equal(cooldownFor(providerError({ retryAfterMs: undefined }), 1, options), 500);
  assert.equal(cooldownFor(providerError({ retryAfterMs: undefined }), 2, options), 1000);
  assert.equal(cooldownFor(providerError({ retryAfterMs: undefined }), 10, options), 30_000);
  assert.equal(cooldownFor(providerError({ retryAfterMs: -5 }), 1, options), 0);
});

test("wrapped provider model reports retries without leaking provider internals", async () => {
  const retries: Array<{ attempt: number; kind: string; delayMs: number }> = [];
  let attempts = 0;

  const model = wrapWithCooldownRetry(
    {
      async next() {
        attempts += 1;
        if (attempts < 2) throw providerError();
        return { type: "final" as const, content: "done" };
      }
    },
    { maxAttempts: 3, sleep: async () => undefined },
    attempt => retries.push(attempt)
  );

  const decision = await model.next({ messages: [], tools: [] });

  assert.deepEqual(decision, { type: "final", content: "done" });
  assert.equal(attempts, 2);
  assert.deepEqual(retries, [{ attempt: 1, kind: "rate_limited", delayMs: 100 }]);
});