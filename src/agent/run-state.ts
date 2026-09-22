import type { RunStatus } from "./types.js";
const transitions: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled", "interrupted"],
  running: ["completed", "failed", "cancelled", "interrupted"],
  completed: [], failed: [], cancelled: [], interrupted: []
};
export class RunStateMachine {
  constructor(public status: RunStatus = "queued") {}
  transition(next: RunStatus): void {
    if (!transitions[this.status].includes(next)) throw new Error("Invalid run transition: " + this.status + " -> " + next);
    this.status = next;
  }
}
