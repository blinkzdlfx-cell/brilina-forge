import assert from "node:assert/strict";
import test from "node:test";
import { AgentController } from "../agent/controller.js";
import { FakeModel, InMemoryAgentAuditStore } from "../agent/fakes.js";
import { ToolRegistry } from "../agent/registry.js";
import type { AgentObserverEvent, ForgeTool } from "../agent/types.js";

function makeTool(policy: ForgeTool["policy"]): ForgeTool<{ path: string }> {
  return {
    name: "github.read_file",
    description: "Read a repository file.",
    inputSchema: { type: "object", required: ["path"], properties: { path: { type: "string" } } },
    policy,
    async authorize() { return true; },
    async execute(_context, args) { return { content: "contents:" + args.path }; }
  };
}

function collectEvents(): { events: AgentObserverEvent[]; observer: { emit(event: AgentObserverEvent): void } } {
  const events: AgentObserverEvent[] = [];
  return { events, observer: { emit: event => events.push(event) } };
}

test("controller reports the full tool lifecycle to its observer", async () => {
  const tool = makeTool("allowed");
  const registry = new ToolRegistry();
  registry.register(tool);
  const { events, observer } = collectEvents();

  const controller = new AgentController(
    new FakeModel([
      { type: "tool_call", call: { id: "call-1", name: tool.name, arguments: { path: "README.md" } } },
      { type: "final", content: "done" }
    ]),
    registry,
    new InMemoryAgentAuditStore(),
    observer
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read the readme"
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(events.map(event => event.type), ["tool.requested", "tool.started", "tool.completed"]);
  assert.deepEqual(new Set(events.map(event => "callId" in event ? event.callId : "")), new Set(["call-1"]));
});

test("controller reports approval-required tools before rejecting them", async () => {
  const tool = makeTool("approval-required");
  const registry = new ToolRegistry();
  registry.register(tool);
  const { events, observer } = collectEvents();

  const controller = new AgentController(
    new FakeModel([{ type: "tool_call", call: { id: "call-2", name: tool.name, arguments: { path: "README.md" } } }]),
    registry,
    new InMemoryAgentAuditStore(),
    observer
  );

  const result = await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w" },
    message: "read the readme"
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(events.map(event => event.type), ["tool.requested", "approval.required", "tool.rejected"]);
});

test("controller reports blocked tools without requesting approval", async () => {
  const tool = makeTool("blocked");
  const registry = new ToolRegistry();
  registry.register(tool);
  const { events, observer } = collectEvents();

  const controller = new AgentController(
    new FakeModel([{ type: "tool_call", call: { id: "call-3", name: tool.name, arguments: { path: "README.md" } } }]),
    registry,
    new InMemoryAgentAuditStore(),
    observer
  );

  await controller.run({ conversationId: "c", principal: { userId: "u", workspaceId: "w" }, message: "go" });

  assert.deepEqual(events.map(event => event.type), ["tool.requested", "tool.rejected"]);
  assert.equal(events.some(event => event.type === "approval.required"), false);
});

test("controller passes the active repository and branch to the model as system context", async () => {
  const tool = makeTool("allowed");
  const registry = new ToolRegistry();
  registry.register(tool);
  let seenContext = "";

  const capturingModel = {
    async next(input: { messages: Array<{ role: string; content: string }> }) {
      const system = input.messages.find(message => message.role === "system");
      if (!seenContext) seenContext = system?.content ?? "";
      return { type: "final" as const, content: "ok" };
    }
  };

  const controller = new AgentController(capturingModel, registry, new InMemoryAgentAuditStore());
  await controller.run({
    conversationId: "c",
    principal: { userId: "u", workspaceId: "w", repositoryFullName: "owner/repo", branchName: "feature/x" },
    message: "inspect"
  });

  assert.match(seenContext, /repository: owner\/repo/);
  assert.match(seenContext, /branch: feature\/x/);
});