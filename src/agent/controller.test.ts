import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "./controller.js";
import { FakeModel, InMemoryAgentAuditStore } from "./fakes.js";
import { ToolRegistry } from "./registry.js";
import type { ForgeTool } from "./types.js";

const readTool: ForgeTool<{ path: string }, { content: string }> = {
  name: "github.read_file", description: "Read a selected repository file.",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } }, policy: "allowed",
  async authorize() { return true; },
  async execute(_context, args) { return { content: "contents:" + args.path }; }
};

test("controller validates, authorizes, executes and records a read-only tool", async () => {
  const registry = new ToolRegistry(); registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([
    { type: "tool_call", call: { id: "call-1", name: "github.read_file", arguments: { path: "README.md" } } },
    { type: "final", content: "Read complete." }
  ]), registry, audit);
  const result = await controller.run({ conversationId: "conversation-1", principal: { userId: "user-1", workspaceId: "workspace-1" }, message: "Read README.md" });
  assert.equal(result.status, "completed"); assert.equal(result.response, "Read complete.");
  assert.equal(audit.runs[0].status, "completed"); assert.equal(audit.toolCalls[0].status, "completed");
  assert.deepEqual(audit.toolCalls[0].result, { content: "contents:README.md" });
});

test("controller rejects blocked tools before execution", async () => {
  let executed = false;
  const blocked: ForgeTool = { ...readTool, name: "dangerous.tool", policy: "blocked", async execute() { executed = true; return {}; } };
  const registry = new ToolRegistry(); registry.register(blocked);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([{ type: "tool_call", call: { id: "call-2", name: blocked.name, arguments: { path: "x" } } }]), registry, audit);
  const result = await controller.run({ conversationId: "c", principal: { userId: "u", workspaceId: "w" }, message: "run" });
  assert.equal(result.status, "failed"); assert.equal(executed, false); assert.equal(audit.toolCalls[0].status, "rejected");
});

test("controller rejects invalid tool arguments", async () => {
  const registry = new ToolRegistry(); registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([{ type: "tool_call", call: { id: "call-3", name: readTool.name, arguments: {} } }]), registry, audit);
  const result = await controller.run({ conversationId: "c", principal: { userId: "u", workspaceId: "w" }, message: "run" });
  assert.equal(result.status, "failed"); assert.equal(audit.toolCalls[0].status, "failed");
});
