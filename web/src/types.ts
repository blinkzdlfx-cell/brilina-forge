export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export type Conversation = {
  id: string;
  title: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
  branchName: string | null;
  updatedAt: string;
};

export type GithubRepository = {
  id: number;
  node_id: string;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  owner: { login: string };
};

export type GithubBranch = {
  name: string;
  protected: boolean;
  commit: { sha: string };
};

export type ForgeRepository = {
  id: string;
  githubNodeId: string;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type ForgeEvent =
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

export type SessionInfo = {
  authenticated: boolean;
  githubUser?: { login: string; name: string | null; avatar_url: string };
};

export type ForgeDiffFile = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

export type ForgeDiff = {
  status: string;
  ahead_by: number;
  behind_by: number;
  total_commits: number;
  files: ForgeDiffFile[];
};
