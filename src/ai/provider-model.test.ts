import assert from "node:assert/strict";
import test from "node:test";
import { DeterministicDevelopmentProvider } from "./deterministic.js";
import { ProviderAgentModel, toAiMessages } from "./provider-model.js";
import { ProviderModelRegistry } from "./registry.js";
import type { AiModelRequest } from "./types.js";

const tools = [{ name: "github.get_repository", description: "Read metadata.", inputSchema: { type: "object" } }];

function request(messages: AiModelRequest["messages"]): AiModelRequest {
  return { messages, tools };
}

test("registry resolves a model to the adapter that owns it", () => {
  const registry = new ProviderModelRegistry([new DeterministicDevelopmentProvider()]);

  assert.deepEqual(registry.list().map(model => model.id), ["forge-deterministic"]);
  assert.equal(registry.has("forge-deterministic"), true);
  assert.equal(registry.has("missing"), false);
  assert.equal(registry.providerFor("forge-deterministic").id, "deterministic-development");
  assert.throws(() => registry.resolve("missing-model"), /Unknown AI model/);
});

test("deterministic provider requests the registered read tool and then summarizes", async () => {
  const provider = new DeterministicDevelopmentProvider();
  const system = { role: "system" as const, content: "Active development context for this conversation:\n- repository: owner/repo\n- branch: main" };

  const first = await provider.complete(request([system, { role: "user", content: "inspect the repository" }]), "forge-deterministic");
  assert.equal(first.toolCalls.length, 1);
  assert.equal(first.toolCalls[0].name, "github.get_repository");
  assert.equal(first.content, "");

  const second = await provider.complete(request([
    system,
    { role: "user", content: "inspect the repository" },
    { role: "assistant", content: "", toolCalls: first.toolCalls },
    { role: "tool", toolCallId: first.toolCalls[0].id, name: "github.get_repository", content: "{\"full_name\":\"owner/repo\"}" }
  ]), "forge-deterministic");

  assert.equal(second.toolCalls.length, 0);
  assert.match(second.content, /Repository: owner\/repo/);
});

test("deterministic provider never calls tools that are not offered", async () => {
  const provider = new DeterministicDevelopmentProvider();
  const result = await provider.complete({
    messages: [
      { role: "system", content: "- repository: owner/repo" },
      { role: "user", content: "inspect the repository" }
    ],
    tools: []
  }, "forge-deterministic");

  assert.equal(result.toolCalls.length, 0);
});

test("provider agent model converts a tool call into a controller decision", async () => {
  const model = new ProviderAgentModel({
    provider: new DeterministicDevelopmentProvider(),
    model: "forge-deterministic"
  });

  const decision = await model.next({
    messages: [
      { role: "system", content: "- repository: owner/repo" },
      { role: "user", content: "inspect the repository" }
    ],
    tools
  });

  assert.equal(decision.type, "tool_call");
  assert.equal(decision.type === "tool_call" && decision.call.name, "github.get_repository");
  assert.ok(model.lastUsage);
});

test("controller context maps to a valid provider conversation", () => {
  const messages = toAiMessages([
    { role: "system", content: "system" },
    { role: "user", content: "user" },
    { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "github.get_repository", arguments: { owner: "o", repo: "r" } }] },
    { role: "tool", content: "{}", toolCallId: "call_1" }
  ]);

  assert.deepEqual(messages, [
    { role: "system", content: "system" },
    { role: "user", content: "user" },
    { role: "assistant", content: "", toolCalls: [{ id: "call_1", name: "github.get_repository", arguments: { owner: "o", repo: "r" } }] },
    { role: "tool", toolCallId: "call_1", name: "call_1", content: "{}" }
  ]);
});

test("deterministic provider streams text before signalling completion", async () => {
  const provider = new DeterministicDevelopmentProvider();
  const events = [];

  for await (const event of provider.stream(request([{ role: "user", content: "hello" }]), "forge-deterministic")) {
    events.push(event.type);
  }

  assert.equal(events.at(-1), "done");
  assert.ok(events.includes("text_delta"));
});