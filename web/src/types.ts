export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";

export type Conversation = {
  id: string;
  title: string | null;
  repositoryId: string | null;
  branchName: string | null;
  updatedAt: string;
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
  | { type: "tool.requested"; toolName: string }
  | { type: "tool.started"; toolName: string }
  | { type: "tool.completed"; toolName: string }
  | { type: "approval.required"; toolName: string }
  | { type: "assistant.completed"; content: string }
  | { type: "run.completed"; runId: string; status: RunStatus }
  | { type: "run.failed"; runId: string; message: string };
