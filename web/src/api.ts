import type { Conversation, ForgeEvent, ForgeRepository, GithubBranch, GithubRepository } from "./types";

async function readError(response: Response, fallback: string): Promise<never> {
  try {
    const body = await response.json() as { message?: string; error?: string };
    throw new Error(body.message ?? body.error ?? fallback);
  } catch (error) {
    if (error instanceof Error && error.message !== fallback) throw error;
    throw new Error(fallback);
  }
}

export async function listConversations(): Promise<Conversation[]> {
  const response = await fetch("/api/conversations", { credentials: "include" });
  if (!response.ok) await readError(response, "Unable to load conversations");
  return response.json();
}

export async function listGithubRepositories(): Promise<GithubRepository[]> {
  const response = await fetch("/api/github/repos?per_page=100", { credentials: "include" });
  if (!response.ok) await readError(response, "Unable to load GitHub repositories");
  return response.json();
}

export async function listGithubBranches(owner: string, repo: string): Promise<GithubBranch[]> {
  const response = await fetch(
    `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
    { credentials: "include" }
  );
  if (!response.ok) await readError(response, "Unable to load repository branches");
  return response.json();
}

export async function syncGithubRepository(repository: GithubRepository): Promise<ForgeRepository> {
  const response = await fetch("/api/github/repositories/sync", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nodeId: repository.node_id,
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      defaultBranch: repository.default_branch
    })
  });
  if (!response.ok) await readError(response, "Unable to save repository context");
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
  if (!response.ok) await readError(response, "Unable to create conversation");
  return response.json();
}

export async function updateConversationContext(
  conversationId: string,
  input: { repositoryId: string | null; branchName: string | null }
): Promise<Conversation> {
  const response = await fetch(`/api/conversations/${conversationId}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  if (!response.ok) await readError(response, "Unable to update conversation context");
  return response.json();
}

export async function startRun(conversationId: string, message: string): Promise<{ runId: string }> {
  const response = await fetch(`/api/conversations/${conversationId}/runs`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!response.ok) await readError(response, "Unable to start run");
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
