import { ModelContext } from "./context.js";
import { authorizeTool, evaluateToolPolicy } from "./policy.js";
import { RunStateMachine } from "./run-state.js";
import type { AgentAuditStore, AgentModel, AgentObserver, AgentPrincipal, AgentRunInput, AgentRunLifecycle, AgentRunResult } from "./types.js";
import { ToolRegistry } from "./registry.js";

function validateObjectArguments(schema: Record<string, unknown>, value: unknown): asserts value is Record<string, unknown> {
  if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("Tool arguments must be an object");
  const object = value as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) if (!(String(key) in object)) throw new Error("Missing required tool argument: " + String(key));
}

function describeActiveContext(principal: AgentPrincipal): string | undefined {
  if (!principal.repositoryFullName && !principal.branchName) return undefined;
  const parts = ["Active development context for this conversation:"];
  if (principal.repositoryFullName) parts.push("- repository: " + principal.repositoryFullName);
  if (principal.branchName) parts.push("- branch: " + principal.branchName);
  return parts.join("\n");
}

export class AgentController {
  constructor(
    private readonly model: AgentModel,
    private readonly registry: ToolRegistry,
    private readonly audit: AgentAuditStore,
    private readonly observer?: AgentObserver,
    private readonly lifecycle?: AgentRunLifecycle
  ) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const run = input.runId
      ? { id: input.runId, status: "queued" as const }
      : await this.audit.createRun({ conversationId: input.conversationId, userId: input.principal.userId });

    const state = new RunStateMachine(run.status);
    state.transition("running");
    await this.audit.updateRun(run.id, "running");
    const context = new ModelContext(this.registry);
    const activeContext = describeActiveContext(input.principal);
    if (activeContext) context.add({ role: "system", content: activeContext });
    context.add({ role: "user", content: input.message });
    const maxSteps = input.maxSteps ?? 8;

    try {
      for (let step = 0; step < maxSteps; step++) {
        if (this.lifecycle?.shouldStop()) {
          state.transition("cancelled");
          await this.audit.updateRun(run.id, "cancelled", "Run cancelled");
          return { runId: run.id, status: "cancelled" };
        }

        const decision = await this.model.next(context.input());
        if (decision.type === "final") {
          state.transition("completed");
          await this.audit.updateRun(run.id, "completed");
          return { runId: run.id, status: "completed", response: decision.content };
        }

        const tool = this.registry.get(decision.call.name);
        if (!tool) throw new Error("Unknown tool: " + decision.call.name);
        const toolCallId = await this.audit.createToolCall({ runId: run.id, toolName: tool.name, arguments: decision.call.arguments });
        const callId = decision.call.id;
        try {
          validateObjectArguments(tool.inputSchema, decision.call.arguments);
          const policy = evaluateToolPolicy(tool, { principal: input.principal, runId: run.id });
          this.observer?.emit({ type: "tool.requested", toolName: tool.name, callId });
          context.add({ role: "assistant", content: "", toolCalls: [decision.call] });
          if (policy !== "allowed") {
            const message = policy === "blocked" ? "Tool is blocked by policy" : "Human approval is required";
            if (policy === "approval-required") {
              this.observer?.emit({ type: "approval.required", toolName: tool.name, callId });
            }
            await this.audit.updateToolCall(toolCallId, "rejected", undefined, message);
            this.observer?.emit({ type: "tool.rejected", toolName: tool.name, callId, reason: message });
            throw new Error(message + ": " + tool.name);
          }
          if (!(await authorizeTool(tool, { principal: input.principal, runId: run.id }, decision.call.arguments))) {
            const message = "Tool authorization denied";
            await this.audit.updateToolCall(toolCallId, "rejected", undefined, message);
            this.observer?.emit({ type: "tool.rejected", toolName: tool.name, callId, reason: message });
            throw new Error(message + ": " + tool.name);
          }
          await this.audit.updateToolCall(toolCallId, "authorized");
          this.observer?.emit({ type: "tool.started", toolName: tool.name, callId });
          await this.audit.updateToolCall(toolCallId, "running");
          const result = await tool.execute({ principal: input.principal, runId: run.id }, decision.call.arguments);
          await this.audit.updateToolCall(toolCallId, "completed", result);
          this.observer?.emit({ type: "tool.completed", toolName: tool.name, callId });
          context.add({ role: "tool", toolCallId: decision.call.id, content: JSON.stringify(result) });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed";
          const alreadyRejected = message.startsWith("Tool is blocked") || message.startsWith("Human approval") || message.startsWith("Tool authorization denied");
          if (!alreadyRejected) {
            await this.audit.updateToolCall(toolCallId, "failed", undefined, message);
            this.observer?.emit({ type: "tool.rejected", toolName: tool.name, callId, reason: message });
          }
          throw error;
        }
      }
      throw new Error("Agent step limit exceeded");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent run failed";
      state.transition("failed");
      await this.audit.updateRun(run.id, "failed", message);
      return { runId: run.id, status: "failed" };
    }
  }
}
