import assert from "node:assert/strict";
import test from "node:test";
import { runEventBus } from "./events.js";

test("run event bus replays history to later SSE subscribers", () => {
  const runId = "phase4-test-run";
  runEventBus.publish(runId, { type: "run.started", runId });
  const received: string[] = [];
  const unsubscribe = runEventBus.subscribe(runId, event => received.push(event.type));
  runEventBus.publish(runId, { type: "assistant.completed", content: "ok" });
  unsubscribe();

  assert.deepEqual(runEventBus.history(runId).map(event => event.type), ["run.started", "assistant.completed"]);
  assert.deepEqual(received, ["assistant.completed"]);
});
