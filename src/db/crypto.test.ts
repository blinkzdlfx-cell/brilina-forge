import test from "node:test";
import assert from "node:assert/strict";
import { encryptSecret, decryptSecret } from "./crypto.js";

process.env.GITHUB_TOKEN_ENCRYPTION_KEY = process.env.GITHUB_TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");

test("GitHub token encryption round-trips without storing plaintext", () => {
  const plaintext = "github-access-token-example";
  const encrypted = encryptSecret(plaintext);

  assert.notEqual(encrypted.ciphertext, plaintext);
  assert.notEqual(encrypted.iv, "");
  assert.notEqual(encrypted.tag, "");
  assert.equal(decryptSecret(encrypted), plaintext);
});
