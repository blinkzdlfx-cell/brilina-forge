import test from "node:test";
import assert from "node:assert/strict";
import { RunStateMachine } from "./run-state.js";

test("run state machine rejects invalid transitions", () => {
  const state = new RunStateMachine();
  state.transition("running"); state.transition("completed");
  assert.throws(() => state.transition("failed"), /Invalid run transition/);
});
