import type { Conversation, ForgeEvent } from "./types";

export async function listConversations(): Promise<Conversation[]> {
  const response = await fetch("/api/conversations", { credentials: "include" });
  if (!response.ok) throw new Error("Unable to load conversations");
  return response.json();
}

export async function createConversation(input?: {
  title?: string;
  repositoryId?: string;
  branchName?: string;
}): Promise<Conversation> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input ?? {})
  });
  if (!response.ok) throw new Error("Unable to create conversation");
  return response.json();
}

export async function startRun(conversationId: string, message: string): Promise<{ runId: string }> {
  const response = await fetch(`/api/conversations/${conversationId}/runs`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!response.ok) throw new Error("Unable to start run");
  return response.json();
}

export function streamRun(runId: string, onEvent: (event: ForgeEvent) => void, onError: (error: Event) => void) {
  const source = new EventSource(`/api/runs/${runId}/events`, { withCredentials: true });
  const eventTypes = [
    "run.started", "assistant.delta", "tool.requested", "tool.started",
    "tool.completed", "approval.required", "assistant.completed",
    "run.completed", "run.failed"
  ] as const;

  for (const type of eventTypes) {
    source.addEventListener(type, event => {
      onEvent(JSON.parse((event as MessageEvent).data) as ForgeEvent);
    });
  }

  source.onerror = onError;
  return () => source.close();
}
