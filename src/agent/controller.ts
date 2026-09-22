import { ModelContext } from "./context.js";
import { authorizeTool, evaluateToolPolicy } from "./policy.js";
import { RunStateMachine } from "./run-state.js";
import type { AgentAuditStore, AgentModel, AgentRunInput, AgentRunResult } from "./types.js";
import { ToolRegistry } from "./registry.js";

function validateObjectArguments(schema: Record<string, unknown>, value: unknown): asserts value is Record<string, unknown> {
  if (schema.type === "object" && (!value || typeof value !== "object" || Array.isArray(value))) throw new Error("Tool arguments must be an object");
  const object = value as Record<string, unknown>;
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) if (!(String(key) in object)) throw new Error("Missing required tool argument: " + String(key));
}

export class AgentController {
  constructor(private readonly model: AgentModel, private readonly registry: ToolRegistry, private readonly audit: AgentAuditStore) {}

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const run = input.runId
      ? { id: input.runId, status: "queued" as const }
      : await this.audit.createRun({ conversationId: input.conversationId, userId: input.principal.userId });

    const state = new RunStateMachine(run.status);
    state.transition("running");
    await this.audit.updateRun(run.id, "running");
    const context = new ModelContext(this.registry);
    context.add({ role: "user", content: input.message });
    const maxSteps = input.maxSteps ?? 8;

    try {
      for (let step = 0; step < maxSteps; step++) {
        const decision = await this.model.next(context.input());
        if (decision.type === "final") {
          state.transition("completed");
          await this.audit.updateRun(run.id, "completed");
          return { runId: run.id, status: "completed", response: decision.content };
        }

        const tool = this.registry.get(decision.call.name);
        if (!tool) throw new Error("Unknown tool: " + decision.call.name);
        const toolCallId = await this.audit.createToolCall({ runId: run.id, toolName: tool.name, arguments: decision.call.arguments });
        try {
          validateObjectArguments(tool.inputSchema, decision.call.arguments);
          const policy = evaluateToolPolicy(tool, { principal: input.principal, runId: run.id });
          if (policy !== "allowed") {
            const message = policy === "blocked" ? "Tool is blocked by policy" : "Human approval is required";
            await this.audit.updateToolCall(toolCallId, "rejected", undefined, message);
            throw new Error(message + ": " + tool.name);
          }
          if (!(await authorizeTool(tool, { principal: input.principal, runId: run.id }, decision.call.arguments))) {
            await this.audit.updateToolCall(toolCallId, "rejected", undefined, "Tool authorization denied");
            throw new Error("Tool authorization denied: " + tool.name);
          }
          await this.audit.updateToolCall(toolCallId, "authorized");
          await this.audit.updateToolCall(toolCallId, "running");
          const result = await tool.execute({ principal: input.principal, runId: run.id }, decision.call.arguments);
          await this.audit.updateToolCall(toolCallId, "completed", result);
          context.add({ role: "tool", toolCallId: decision.call.id, content: JSON.stringify(result) });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool execution failed";
          const alreadyRejected = message.startsWith("Tool is blocked") || message.startsWith("Human approval") || message.startsWith("Tool authorization denied");
          if (!alreadyRejected) await this.audit.updateToolCall(toolCallId, "failed", undefined, message);
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
