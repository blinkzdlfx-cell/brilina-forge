import test from "node:test";
import assert from "node:assert/strict";
import { handleApi } from "./api.js";

test("native Worker exposes a health endpoint", async () => {
  const response = await handleApi(
    new Request("https://forge.example/health"),
    { PUBLIC_BASE_URL: "https://forge.example" }
  );

  assert.ok(response);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    service: "brilina-forge",
    runtime: "cloudflare-worker",
    phase: "native-worker"
  });
});

test("unknown application routes fall through to static assets", async () => {
  const response = await handleApi(
    new Request("https://forge.example/unknown"),
    { PUBLIC_BASE_URL: "https://forge.example" }
  );

  assert.equal(response, undefined);
});
