import { ModelContext } from "./context.js";
import { authorizeTool, evaluateToolPolicy } from "./policy.js";
import { RunStateMachine } from "./run-state.js";
import type { AgentAuditStore, AgentModel, AgentObserver, AgentPrincipal, AgentRunInput, AgentRunLifecycle, AgentRunResult, ToolResultSummary } from "./types.js";
import { ToolRegistry } from "./registry.js";

function validateSchemaValue(schema: Record<string, unknown>, value: unknown, path: string): void {
  const type = schema.type;

  if (type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(path === "arguments" ? "Tool arguments must be an object" : "Invalid type for tool argument");
    }
    const object = value as Record<string, unknown>;
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? schema.properties as Record<string, unknown>
      : {};
    const required = Array.isArray(schema.required) ? schema.required : [];

    for (const key of required) {
      if (typeof key === "string" && !Object.prototype.hasOwnProperty.call(object, key)) {
        throw new Error("Missing required tool argument: " + key);
      }
    }

    if (schema.additionalProperties === false && Object.keys(object).some(key => !Object.prototype.hasOwnProperty.call(properties, key))) {
      throw new Error("Unexpected tool argument");
    }

    for (const [key, propertySchema] of Object.entries(properties)) {
      if (!Object.prototype.hasOwnProperty.call(object, key) || !propertySchema || typeof propertySchema !== "object" || Array.isArray(propertySchema)) continue;
      validateSchemaValue(propertySchema as Record<string, unknown>, object[key], key);
    }
    return;
  }

  if (type === "string") {
    if (typeof value !== "string") throw new Error("Invalid type for tool argument");
    if (typeof schema.minLength === "number" && value.length < schema.minLength) throw new Error("Tool argument is below its minimum length");
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) throw new Error("Tool argument exceeds its maximum length");
  } else if (type === "integer") {
    if (typeof value !== "number" || !Number.isInteger(value)) throw new Error("Invalid type for tool argument");
  } else if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid type for tool argument");
  } else if (type === "boolean") {
    if (typeof value !== "boolean") throw new Error("Invalid type for tool argument");
  } else if (type === "array") {
    if (!Array.isArray(value)) throw new Error("Invalid type for tool argument");
    if (typeof schema.minItems === "number" && value.length < schema.minItems) throw new Error("Tool argument has too few items");
    if (typeof schema.maxItems === "number" && value.length > schema.maxItems) throw new Error("Tool argument has too many items");
    if (schema.items && typeof schema.items === "object" && !Array.isArray(schema.items)) {
      for (const item of value) validateSchemaValue(schema.items as Record<string, unknown>, item, path);
    }
  } else if (type === "null" && value !== null) {
    throw new Error("Invalid type for tool argument");
  }

  if (Array.isArray(schema.enum) && !schema.enum.some(option => Object.is(option, value))) {
    throw new Error("Tool argument is not an allowed value");
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) throw new Error("Tool argument is below its minimum");
    if (typeof schema.maximum === "number" && value > schema.maximum) throw new Error("Tool argument exceeds its maximum");
  }
}

function validateObjectArguments(schema: Record<string, unknown>, value: unknown): asserts value is Record<string, unknown> {
  validateSchemaValue(schema, value, "arguments");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Tool arguments must be an object");
}

function summarizeToolResult(result: unknown): ToolResultSummary | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const value = result as Record<string, unknown>;
  if (value.success !== true || typeof value.commitUrl !== "string") return undefined;
  return {
    ...(typeof value.operation === "string" ? { operation: value.operation } : {}),
    ...(typeof value.branch === "string" ? { branch: value.branch } : {}),
    ...(typeof value.path === "string" || value.path === null ? { path: value.path as string | null } : {}),
    commitUrl: value.commitUrl,
    ...(typeof value.readBackVerified === "boolean" ? { readBackVerified: value.readBackVerified } : {})
  };
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
    for (const item of input.history ?? []) {
      if (item.content.trim()) context.add({ role: item.role, content: item.content });
    }
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
          this.observer?.emit({ type: "tool.completed", toolName: tool.name, callId, resultSummary: summarizeToolResult(result) });
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
      return { runId: run.id, status: "failed", errorMessage: message };
    }
  }
}
