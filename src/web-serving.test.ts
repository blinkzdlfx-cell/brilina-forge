import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { app } from "./server.js";

const webRoot = path.resolve(process.cwd(), "web", "dist");
const builtFrontendAvailable = existsSync(path.join(webRoot, "index.html"));

test("production frontend serves generated module assets with JavaScript MIME types", {
  skip: !builtFrontendAvailable
}, async () => {
  const index = readFileSync(path.join(webRoot, "index.html"), "utf8");
  const script = index.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1];
  assert.ok(script, "built index.html must contain a module script");

  const response = await app.inject({ method: "GET", url: script });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^text\/(javascript|ecmascript)/i);
  assert.doesNotMatch(response.body.slice(0, 200), /<html|<!doctype/i);
});

test("production frontend serves favicon as SVG instead of SPA fallback", {
  skip: !builtFrontendAvailable
}, async () => {
  const response = await app.inject({ method: "GET", url: "/favicon.svg" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /^image\/svg\+xml/i);
  assert.match(response.body, /<svg/i);
});
