import assert from "node:assert/strict";
import test from "node:test";
import { redactSecrets, redactValue } from "./redact.js";

test("redacts GitHub, provider and database credentials", () => {
  assert.equal(redactSecrets("token ghp_abcdefghijklmnopqrstuvwxyz0123 rest"), "token [redacted] rest");
  assert.equal(redactSecrets("github_pat_11ABCDEFG0aaaaaaaaaa_bbbbbbbbbbbbbbbb"), "[redacted]");
  assert.equal(redactSecrets("sk-ant-api03-abcdefghijklmnopqrstuvwxyz"), "[redacted]");
  assert.equal(
    redactSecrets("postgres://neondb_owner:secret@ep-pooler.example/db"),
    "[redacted]"
  );
});

test("redacts authorization headers and private key blocks", () => {
  assert.equal(redactSecrets("Authorization: Bearer sometokenvalue"), "[redacted]");
  assert.equal(
    redactSecrets("-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----"),
    "[redacted]"
  );
});

test("redacts secret-shaped environment assignments", () => {
  const line = "GITHUB_CLIENT_SECRET=abc123 DATABASE_URL=postgres://u:p@h/db";
  const redacted = redactSecrets(line);
  assert.equal(redacted.includes("abc123"), false);
  assert.equal(redacted.includes("u:p@h"), false);
});

test("leaves ordinary text untouched", () => {
  const message = "The build finished in 12s with 3 files changed.";
  assert.equal(redactSecrets(message), message);
});

test("redactValue walks structures and masks secret-named keys", () => {
  const redacted = redactValue({
    command: "npm test",
    authorization: "Bearer abc",
    nested: { apiKey: "abc123", output: "ok" }
  }) as Record<string, unknown>;

  assert.equal(redacted.command, "npm test");
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal((redacted.nested as Record<string, unknown>).apiKey, "[redacted]");
  assert.equal((redacted.nested as Record<string, unknown>).output, "ok");
});

test("redactValue bounds depth and breadth", () => {
  let deep: Record<string, unknown> = { value: "leaf" };
  for (let index = 0; index < 12; index++) deep = { nested: deep };
  assert.doesNotThrow(() => redactValue(deep));

  const wide = redactValue(Array.from({ length: 500 }, (_, index) => index));
  assert.equal((wide as unknown[]).length, 100);
});

test("redactSecrets bounds very long tool output", () => {
  const redacted = redactSecrets("x".repeat(50_000));
  assert.ok(redacted.length < 21_000);
  assert.match(redacted, /\[truncated\]$/);
});