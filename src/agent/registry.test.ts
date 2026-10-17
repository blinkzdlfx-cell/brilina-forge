import test from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "./registry.js";
import type { ForgeTool } from "./types.js";

function tool(name: string): ForgeTool {
  return {
    name,
    description: name,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    policy: "allowed",
    async authorize() { return true; },
    async execute() { return { ok: true }; }
  };
}

test("registry exposes catalogued core GitHub tools by default and keeps non-GitHub tools independent", () => {
  const registry = new ToolRegistry();
  registry.register(tool("github.read_file"));
  registry.register(tool("companion.execute"));
  assert.ok(registry.get("github.read_file"));
  assert.ok(registry.get("companion.execute"));
  assert.equal(registry.list().length, 2);
});

test("user availability preferences can disable a GitHub category", () => {
  const registry = new ToolRegistry();
  registry.register(tool("github.read_file"));
  registry.register(tool("github.get_diff"));
  registry.setAvailabilityPreferences({
    enabledCategories: new Set(["repository-read"])
  });
  assert.equal(registry.get("github.read_file"), undefined);
  assert.equal(registry.get("github.get_diff"), undefined);
  assert.equal(registry.list().length, 0);
});

test("uncatalogued GitHub tools fail closed while non-GitHub tools remain separate", () => {
  const registry = new ToolRegistry();
  registry.register(tool("github.unreviewed_future_tool"));
  registry.register(tool("companion.execute"));
  assert.equal(registry.get("github.unreviewed_future_tool"), undefined);
  assert.ok(registry.get("companion.execute"));
});

test("availability preferences cannot enable a tool excluded by the server default", () => {
  const registry = new ToolRegistry();
  registry.register(tool("github.unreviewed_future_tool"));
  registry.setAvailabilityPreferences({
    enabledNames: new Set(["github.unreviewed_future_tool"]),
    enabledCategories: new Set(["repository-read", "branch-read", "file-read", "diff-review", "branch-write", "file-write"])
  });
  assert.equal(registry.get("github.unreviewed_future_tool"), undefined);
});
