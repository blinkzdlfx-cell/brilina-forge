import type { RunStatus } from "../agent/types.js";

export type ForgeRunEvent =
  | { type: "run.started"; runId: string }
  | { type: "assistant.delta"; content: string }
  | { type: "tool.requested"; toolName: string }
  | { type: "tool.started"; toolName: string }
  | { type: "tool.completed"; toolName: string }
  | { type: "approval.required"; toolName: string }
  | { type: "assistant.completed"; content: string }
  | { type: "run.completed"; runId: string; status: RunStatus }
  | { type: "run.failed"; runId: string; message: string };

type Subscriber = (event: ForgeRunEvent) => void;

class RunEventBus {
  private readonly events = new Map<string, ForgeRunEvent[]>();
  private readonly subscribers = new Map<string, Set<Subscriber>>();

  publish(runId: string, event: ForgeRunEvent): void {
    const history = this.events.get(runId) ?? [];
    history.push(event);
    this.events.set(runId, history);
    for (const subscriber of this.subscribers.get(runId) ?? []) subscriber(event);
  }

  history(runId: string): ForgeRunEvent[] {
    return [...(this.events.get(runId) ?? [])];
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
