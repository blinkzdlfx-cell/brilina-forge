import assert from "node:assert/strict";
import test from "node:test";
import { AgentController } from "../agent/controller.js";
import { FakeModel, InMemoryAgentAuditStore } from "../agent/fakes.js";
import { ToolRegistry } from "../agent/registry.js";
import type { ForgeTool } from "../agent/types.js";

const readTool: ForgeTool<{ path: string }, { content: string }> = {
  name: "github.read_file",
  description: "Read a repository file.",
  inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
  policy: "allowed",
  async authorize() { return true; },
  async execute(_context, args) { return { content: "contents:" + args.path }; }
};

test("a cancelled run stops at the next step boundary and is recorded as cancelled", async () => {
  const registry = new ToolRegistry();
  registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();
  let steps = 0;

  const controller = new AgentController(
    {
      async next() {
        steps += 1;
        return { type: "tool_call", call: { id: "call-" + steps, name: readTool.name, arguments: { path: "a.md" } } };
      }
    },
    registry,
    audit,
    undefined,
    { shouldStop: () => steps >= 1 }
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read"
  });

  assert.equal(result.status, "cancelled");
  assert.equal(audit.runs[0].status, "cancelled");
  assert.equal(steps, 1);
});

test("a run that is not cancelled still completes", async () => {
  const registry = new ToolRegistry();
  registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();

  const controller = new AgentController(
    new FakeModel([{ type: "final", content: "done" }]),
    registry,
    audit,
    undefined,
    { shouldStop: () => false }
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read"
  });

  assert.equal(result.status, "completed");
});

test("a cancelled run never starts a tool call", async () => {
  const registry = new ToolRegistry();
  registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();
  let executed = false;

  const controller = new AgentController(
    new FakeModel([
      { type: "tool_call", call: { id: "call-1", name: readTool.name, arguments: { path: "a.md" } } },
      { type: "final", content: "done" }
    ]),
    registry,
    audit,
    undefined,
    { shouldStop: () => true }
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read"
  });

  assert.equal(result.status, "cancelled");
  assert.equal(executed, false);
  assert.equal(audit.toolCalls.length, 0);
});