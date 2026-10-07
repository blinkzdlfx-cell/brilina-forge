import assert from "node:assert/strict";
import test from "node:test";
import { Phase4DeterministicModel } from "./model.js";
import { runEventBus } from "./events.js";
import type { ModelInput } from "../agent/types.js";

const tools = [
  { name: "github.get_repository", description: "Read metadata for a GitHub repository.", inputSchema: { type: "object" } }
];

function input(messages: ModelInput["messages"], availableTools = tools): ModelInput {
  return { messages, tools: availableTools };
}

const systemContext = {
  role: "system" as const,
  content: "Active development context for this conversation:\n- repository: owner/repo\n- branch: main"
};

test("deterministic adapter requests the repository read tool for inspection intent", async () => {
  const model = new Phase4DeterministicModel();
  const decision = await model.next(input([systemContext, { role: "user", content: "inspect the repository" }]));

  assert.equal(decision.type, "tool_call");
  assert.equal(decision.type === "tool_call" && decision.call.name, "github.get_repository");
  assert.deepEqual(decision.type === "tool_call" && decision.call.arguments, { owner: "owner", repo: "repo" });
});

test("deterministic adapter does not request tools without an active repository", async () => {
  const model = new Phase4DeterministicModel();
  const decision = await model.next(input([{ role: "user", content: "inspect the repository" }]));

  assert.equal(decision.type, "final");
  assert.match(decision.type === "final" ? decision.content : "", /Select a repository/);
});

test("deterministic adapter summarizes the tool result instead of looping", async () => {
  const model = new Phase4DeterministicModel();
  await model.next(input([systemContext, { role: "user", content: "inspect the repository" }]));
  const decision = await model.next(input([
    systemContext,
    { role: "user", content: "inspect the repository" },
    { role: "tool", toolCallId: "phase4-read-repository", content: "{\"full_name\":\"owner/repo\"}" }
  ]));

  assert.equal(decision.type, "final");
  assert.match(decision.type === "final" ? decision.content : "", /Repository: owner\/repo \(branch main\)/);
});

test("deterministic adapter never requests tools that are not registered", async () => {
  const model = new Phase4DeterministicModel();
  const decision = await model.next(input(
    [systemContext, { role: "user", content: "inspect the repository" }],
    []
  ));

  assert.equal(decision.type, "final");
});

test("run event bus caps retained history for long runs", () => {
  const runId = "phase4-bounded-run";
  for (let index = 0; index < 600; index++) {
    runEventBus.publish(runId, { type: "assistant.delta", content: String(index) });
  }

  const history = runEventBus.history(runId);
  assert.equal(history.length, 500);
  assert.deepEqual(history[0], { type: "assistant.delta", content: "100" });
  runEventBus.release(runId);
  assert.deepEqual(runEventBus.history(runId), []);
});

test("run event bus releases histories that exceed the retention window", () => {
  const runId = "phase4-stale-run";
  runEventBus.publish(runId, { type: "run.started", runId });

  assert.equal(runEventBus.sweep(60_000), 0);
  assert.equal(runEventBus.history(runId).length, 1);

  assert.equal(runEventBus.sweep(-1), 1);
  assert.deepEqual(runEventBus.history(runId), []);
});