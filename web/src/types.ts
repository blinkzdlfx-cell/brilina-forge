export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export type ConversationRun = { id: string; status: RunStatus; provider: string | null; model: string | null; createdAt: string };
export type RunAudit = ConversationRun & {
  conversationId: string; startedAt: string | null; finishedAt: string | null; errorMessage: string | null;
  toolCalls: Array<{ id: string; toolName: string; status: "requested" | "authorized" | "running" | "completed" | "failed" | "rejected"; arguments: unknown; result: unknown; errorMessage: string | null; startedAt: string | null; finishedAt: string | null }>;
};

export type Conversation = {
  id: string;
  title: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
  branchName: string | null;
  githubContextType?: "oauth" | "installation";
  installationRecordId?: string | null;
  installationRepositoryId?: string | null;
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
  | { type: "tool.completed"; toolName: string; callId: string; resultSummary?: { operation?: string; branch?: string; path?: string | null; commitUrl?: string; readBackVerified?: boolean } }
  | { type: "approval.required"; toolName: string; callId: string }
  | { type: "tool.rejected"; toolName: string; callId: string; reason: string }
  | { type: "assistant.completed"; content: string }
  | { type: "run.completed"; runId: string; status: RunStatus }
  | { type: "run.failed"; runId: string; message: string };

export type GithubConnection = { id: string; login: string; name: string | null; avatarUrl: string | null; active: boolean };
export type GithubAppInstallation = {
  id: string; installationId: number; accountId: number; accountLogin: string; accountType: string;
  repositorySelection: string; permissions: Record<string, unknown>; suspended: boolean; repositoryCount: number;
};
export type GithubAppRepository = {
  id: string; githubRepositoryId: number; fullName: string; owner: string; name: string;
  defaultBranch: string; private: boolean; archived: boolean;
};

export type SessionInfo = {
  authenticated: boolean;
  forgeUserId?: string;
  activeGithubConnectionId?: string | null;
  githubConnections?: GithubConnection[];
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


export type GithubToolCategory =
  | "repository-read" | "branch-read" | "file-read" | "diff-review"
  | "branch-write" | "file-write" | "issue-management"
  | "pull-request-management" | "actions-and-checks"
  | "releases-and-deployments" | "security-administration";

export type GithubToolDefinition = {
  name: string;
  category: GithubToolCategory;
  risk: "read" | "write" | "high";
  defaultEnabled: boolean;
  description: string;
};

export type GithubToolPreferences = {
  enabledToolNames: string[];
  enabledCategories: GithubToolCategory[];
};

export type GithubToolSettings = {
  definitions: GithubToolDefinition[];
  preferences: GithubToolPreferences;
};
