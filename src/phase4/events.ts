import type { RunStatus } from "../agent/types.js";

export type ForgeRunEvent =
  | { type: "run.started"; runId: string }
  | { type: "assistant.delta"; content: string }
  | { type: "tool.requested"; toolName: string; callId: string }
  | { type: "tool.started"; toolName: string; callId: string }
  | { type: "tool.completed"; toolName: string; callId: string }
  | { type: "approval.required"; toolName: string; callId: string }
  | { type: "tool.rejected"; toolName: string; callId: string; reason: string }
  | { type: "assistant.completed"; content: string }
  | { type: "run.completed"; runId: string; status: RunStatus }
  | { type: "run.failed"; runId: string; message: string };

type Subscriber = (event: ForgeRunEvent) => void;

const MAX_HISTORY_PER_RUN = 500;
const RUN_EVENT_TTL_MS = 15 * 60_000;

class RunEventBus {
  private readonly events = new Map<string, ForgeRunEvent[]>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private readonly lastActivity = new Map<string, number>();

  publish(runId: string, event: ForgeRunEvent): void {
    const history = this.events.get(runId) ?? [];
    history.push(event);
    if (history.length > MAX_HISTORY_PER_RUN) history.splice(0, history.length - MAX_HISTORY_PER_RUN);
    this.events.set(runId, history);
    this.lastActivity.set(runId, Date.now());
    for (const subscriber of this.subscribers.get(runId) ?? []) subscriber(event);
  }

  history(runId: string): ForgeRunEvent[] {
    return [...(this.events.get(runId) ?? [])];
  }

  release(runId: string): void {
    this.events.delete(runId);
    this.subscribers.delete(runId);
    this.lastActivity.delete(runId);
  }

  /** Bounded TTL sweep so an abandoned run cannot retain history forever. */
  sweep(maxAgeMs = RUN_EVENT_TTL_MS): number {
    const cutoff = Date.now() - maxAgeMs;
    let released = 0;
    for (const [runId, lastActivity] of this.lastActivity) {
      if (lastActivity < cutoff) {
        this.release(runId);
        released += 1;
      }
    }
    return released;
  }

  subscribe(runId: string, subscriber: Subscriber): () => void {
    const subscribers = this.subscribers.get(runId) ?? new Set<Subscriber>();
    subscribers.add(subscriber);
    this.subscribers.set(runId, subscribers);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) this.subscribers.delete(runId);
    };
  }
}

export const runEventBus = new RunEventBus();
