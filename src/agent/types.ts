export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "interrupted";
export type ToolStatus = "requested" | "authorized" | "running" | "completed" | "failed" | "rejected";
export type ToolPolicy = "allowed" | "approval-required" | "blocked";

export type AgentPrincipal = { userId: string; workspaceId: string; repositoryId?: string; repositoryFullName?: string; branchName?: string };
export type AgentContextItem =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCallRequest[] }
  | { role: "tool"; content: string; toolCallId: string };
export type ToolCallRequest = { id: string; name: string; arguments: unknown };
export type ModelDecision = { type: "tool_call"; call: ToolCallRequest } | { type: "final"; content: string };
export type ModelInput = { messages: AgentContextItem[]; tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> };
export type AgentModel = { next(input: ModelInput): Promise<ModelDecision> };
export type ToolExecutionContext = { principal: AgentPrincipal; runId: string };
export type ForgeTool<TArgs = unknown, TResult = unknown> = {
  name: string; description: string; inputSchema: Record<string, unknown>; policy: ToolPolicy;
  authorize(context: ToolExecutionContext, args: TArgs): Promise<boolean>;
  execute(context: ToolExecutionContext, args: TArgs): Promise<TResult>;
};
export type RunRecord = { id: string; status: RunStatus };
export type AgentObserverEvent =
  | { type: "tool.requested"; toolName: string; callId: string }
  | { type: "tool.started"; toolName: string; callId: string }
  | { type: "tool.completed"; toolName: string; callId: string }
  | { type: "approval.required"; toolName: string; callId: string }
  | { type: "tool.rejected"; toolName: string; callId: string; reason: string };
export type AgentObserver = {
  emit(event: AgentObserverEvent): void;
  onRetry?(attempt: { attempt: number; kind: string; delayMs: number }): void;
};

/**
 * Cooperative cancellation. The controller checks `shouldStop` at each step
 * boundary so a cancelled run halts without leaving the run state machine in an
 * inconsistent status.
 */
export type AgentRunLifecycle = { shouldStop(): boolean };
export type AgentAuditStore = {
  createRun(input: { conversationId: string; userId: string }): Promise<RunRecord>;
  updateRun(id: string, status: RunStatus, errorMessage?: string): Promise<void>;
  createToolCall(input: { runId: string; toolName: string; arguments: unknown }): Promise<string>;
  updateToolCall(id: string, status: ToolStatus, result?: unknown, errorMessage?: string): Promise<void>;
};
export type AgentRunInput = { conversationId: string; principal: AgentPrincipal; message: string; maxSteps?: number; runId?: string };
export type AgentRunResult = { runId: string; status: RunStatus; response?: string };
