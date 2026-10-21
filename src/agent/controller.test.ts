import test from "node:test";
import assert from "node:assert/strict";
import { AgentController } from "./controller.js";
import { FakeModel, InMemoryAgentAuditStore } from "./fakes.js";
import { ToolRegistry } from "./registry.js";
import type { AgentModel, ForgeTool } from "./types.js";

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

test("controller emits deltas before the model finishes", async () => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const model: AgentModel = { async next(_input, onTextDelta) { onTextDelta?.("first"); await gate; return { type: "final", content: "first answer" }; } };
  const events: Array<{ type: string; content?: string }> = [];
  const controller = new AgentController(model, new ToolRegistry(), new InMemoryAgentAuditStore(), { emit(event) { events.push(event); } });
  let settled = false;
  const pending = controller.run({ conversationId: "conversation-streaming", principal: { userId: "user-1", workspaceId: "workspace-1" }, message: "Stream the answer." }).then(result => { settled = true; return result; });
  while (!events.some(event => event.type === "assistant.delta")) await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(events.filter(event => event.type === "assistant.delta").map(event => event.content), ["first"]);
  assert.equal(settled, false);
  finish();
  const result = await pending;
  assert.equal(result.status, "completed");
  assert.equal(result.response, "first answer");
});

test("controller includes prior conversation turns before the current message", async () => {
  const registry = new ToolRegistry();
  let received: Array<{ role: string; content: string }> = [];
  const model = { async next(input: { messages: Array<{ role: string; content: string }> }) { received = input.messages; return { type: "final" as const, content: "I remember the earlier request." }; } };
  const controller = new AgentController(model, registry, new InMemoryAgentAuditStore());
  const result = await controller.run({ conversationId: "conversation-memory", principal: { userId: "user-1", workspaceId: "workspace-1" }, history: [
    { role: "user", content: "We are working on the checkout page." },
    { role: "assistant", content: "Understood. I will keep the checkout page in context." }
  ], message: "What page are we working on?" });
  assert.equal(result.status, "completed");
  assert.deepEqual(received.map(item => [item.role, item.content]), [
    ["user", "We are working on the checkout page."],
    ["assistant", "Understood. I will keep the checkout page in context."],
    ["user", "What page are we working on?"]
  ]);
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


test("controller rejects tool arguments with invalid property types before execution", async () => {
  let executed = false;
  const typedTool: ForgeTool<{ path: string }> = {
    ...readTool,
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string", minLength: 1, maxLength: 100 } },
      additionalProperties: false
    },
    async execute() { executed = true; return { content: "should not run" }; }
  };
  const registry = new ToolRegistry();
  registry.register(typedTool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(
    new FakeModel([{ type: "tool_call", call: { id: "call-invalid-type", name: typedTool.name, arguments: { path: 42 } } }]),
    registry,
    audit
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read"
  });

  assert.equal(result.status, "failed");
  assert.equal(executed, false);
  assert.equal(audit.toolCalls[0].status, "failed");
});

test("controller rejects unexpected tool properties when schema disallows them", async () => {
  let executed = false;
  const strictTool: ForgeTool<{ path: string }> = {
    ...readTool,
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: { path: { type: "string" } },
      additionalProperties: false
    },
    async execute() { executed = true; return { content: "should not run" }; }
  };
  const registry = new ToolRegistry();
  registry.register(strictTool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(
    new FakeModel([{ type: "tool_call", call: { id: "call-extra-property", name: strictTool.name, arguments: { path: "README.md", unexpected: true } } }]),
    registry,
    audit
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read"
  });

  assert.equal(result.status, "failed");
  assert.equal(executed, false);
  assert.equal(audit.toolCalls[0].status, "failed");
});

test("controller bounds oversized tool results before adding them to run history", async () => {
  const oversizedTool: ForgeTool<{ path: string }, { content: string }> = {
    ...readTool,
    async execute() { return { content: "x".repeat(40_000) }; }
  };
  const registry = new ToolRegistry();
  registry.register(oversizedTool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([
    { type: "tool_call", call: { id: "call-large-result", name: oversizedTool.name, arguments: { path: "large.txt" } } },
    { type: "final", content: "The result was bounded." }
  ]), registry, audit);

  const result = await controller.run({
    conversationId: "conversation-large-result",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Read the large file."
  });

  assert.equal(result.status, "completed");
  const saved = audit.toolCalls[0].result as { truncated?: boolean; originalCharacters?: number; preview?: string };
  assert.equal(saved.truncated, true);
  assert.equal(saved.originalCharacters, 40_014);
  assert.ok((saved.preview?.length ?? 0) < 32_000);
});

test("controller caps the number of tool steps even when a caller requests more", async () => {
  const registry = new ToolRegistry();
  registry.register(readTool);
  const audit = new InMemoryAgentAuditStore();
  const decisions = Array.from({ length: 10 }, (_, index) => ({
    type: "tool_call" as const,
    call: { id: "bounded-step-" + index, name: readTool.name, arguments: { path: "README.md" } }
  }));
  const controller = new AgentController(new FakeModel(decisions), registry, audit);

  const result = await controller.run({
    conversationId: "conversation-step-limit",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Keep working.",
    maxSteps: 999
  });

  assert.equal(result.status, "failed");
  assert.equal(result.errorMessage, "Agent step limit exceeded");
  assert.equal(audit.toolCalls.length, 8);
});

test("controller enforces a total tool-result context budget across a run", async () => {
  const largeTool: ForgeTool<{ path: string }, { content: string }> = {
    ...readTool,
    async execute() { return { content: "x".repeat(40_000) }; }
  };
  const registry = new ToolRegistry();
  registry.register(largeTool);
  const audit = new InMemoryAgentAuditStore();
  const decisions = [
    { type: "tool_call" as const, call: { id: "large-1", name: largeTool.name, arguments: { path: "one.txt" } } },
    { type: "tool_call" as const, call: { id: "large-2", name: largeTool.name, arguments: { path: "two.txt" } } },
    { type: "tool_call" as const, call: { id: "large-3", name: largeTool.name, arguments: { path: "three.txt" } } },
    { type: "final" as const, content: "Finished with bounded context." }
  ];
  const controller = new AgentController(new FakeModel(decisions), registry, audit);

  const result = await controller.run({
    conversationId: "conversation-total-context",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Read the files."
  });

  assert.equal(result.status, "completed");
  const totalCharacters = audit.toolCalls.reduce((total, call) => total + JSON.stringify(call.result).length, 0);
  assert.ok(totalCharacters <= 66_000);
  assert.ok(audit.toolCalls.some(call => (call.result as { truncated?: boolean }).truncated));
});

test("controller rejects duplicate model tool-call identifiers", async () => {
  let executions = 0;
  const tool: ForgeTool<{ path: string }, { ok: boolean }> = {
    ...readTool,
    async execute() { executions += 1; return { ok: true }; }
  };
  const registry = new ToolRegistry();
  registry.register(tool);
  const audit = new InMemoryAgentAuditStore();
  const controller = new AgentController(new FakeModel([
    { type: "tool_call", call: { id: "reused-call-id", name: tool.name, arguments: { path: "one.txt" } } },
    { type: "tool_call", call: { id: "reused-call-id", name: tool.name, arguments: { path: "two.txt" } } }
  ]), registry, audit);

  const result = await controller.run({
    conversationId: "conversation-duplicate-call-id",
    principal: { userId: "user-1", workspaceId: "workspace-1" },
    message: "Read both files."
  });

  assert.equal(result.status, "failed");
  assert.equal(result.errorMessage, "Invalid or duplicate tool call id");
  assert.equal(executions, 1);
  assert.equal(audit.toolCalls.length, 1);
});

