import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "./controller.js";
import { FakeModel, InMemoryAgentAuditStore } from "./fakes.js";
import { ToolRegistry } from "./registry.js";
import type { AgentModel, ModelInput, ForgeTool } from "./types.js";

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


test("controller returns a normal assistant answer without calling any tools", async () => {
  const registry = new ToolRegistry();
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(
    new FakeModel([{ type: "final", content: "Here is the explanation. No repository changes were made." }]),
    registry,
    audit
  );

  const result = await controller.run({
    conversationId: "conversation-chat-only",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Explain this concept without changing any files."
  });

  assert.equal(result.status, "completed");
  assert.equal(result.response, "Here is the explanation. No repository changes were made.");
  assert.equal(audit.toolCalls.length, 0);
  assert.equal(audit.runs[0].status, "completed");
});


test("controller preserves the underlying failure message for safe reporting", async () => {
  const registry = new ToolRegistry();
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([]), registry, audit);

  const result = await controller.run({
    conversationId: "conversation-failure",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Test a failing model request."
  });

  assert.equal(result.status, "failed");
  assert.equal(result.errorMessage, "Fake model has no more decisions");
  assert.equal(audit.runs[0].status, "failed");
  assert.equal(audit.runs[0].errorMessage, "Fake model has no more decisions");
});


test("controller gives the model explicit repository-first tool-selection instructions", async () => {
  let captured: ModelInput | undefined;
  const model: AgentModel = {
    async next(input) {
      captured = input;
      return { type: "final", content: "Done." };
    }
  };
  const controller = new AgentController(model, new ToolRegistry(), new InMemoryAgentAuditStore());
  const result = await controller.run({
    conversationId: "conversation-tool-guidance",
    principal: { userId: "user-1", workspaceId: "workspace-1", repositoryFullName: "owner/repo" },
    message: "Inspect the repository."
  });

  assert.equal(result.status, "completed");
  const systemMessages = captured?.messages.filter(message => message.role === "system") ?? [];
  assert.ok(systemMessages.some(message => message.content.includes("Never use terminal.exec to read or inspect repository files")));
  assert.ok(systemMessages.some(message => message.content.includes("use the appropriate github.* tool")));
});
