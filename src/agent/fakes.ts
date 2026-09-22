import { randomUUID } from "node:crypto";
import type { AgentAuditStore, AgentContextItem, AgentModel, ModelDecision, RunRecord, RunStatus, ToolStatus } from "./types.js";

export class FakeModel implements AgentModel {
  private index = 0;
  constructor(private readonly decisions: ModelDecision[]) {}
  async next(_input: { messages: AgentContextItem[]; tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> }): Promise<ModelDecision> {
    const decision = this.decisions[this.index++];
    if (!decision) throw new Error("Fake model has no more decisions");
    return decision;
  }
}

export class InMemoryAgentAuditStore implements AgentAuditStore {
  readonly runs: Array<RunRecord & { conversationId: string; userId: string; errorMessage?: string }> = [];
  readonly toolCalls: Array<{ id: string; runId: string; toolName: string; status: ToolStatus; arguments: unknown; result?: unknown; errorMessage?: string }> = [];
  async createRun(input: { conversationId: string; userId: string }): Promise<RunRecord> {
    const run = { id: randomUUID(), status: "queued" as RunStatus, ...input };
    this.runs.push(run); return { id: run.id, status: run.status };
  }
  async updateRun(id: string, status: RunStatus, errorMessage?: string): Promise<void> {
    const run = this.runs.find(item => item.id === id); if (!run) throw new Error("Run not found");
    run.status = status; run.errorMessage = errorMessage;
  }
  async createToolCall(input: { runId: string; toolName: string; arguments: unknown }): Promise<string> {
    const id = randomUUID(); this.toolCalls.push({ id, ...input, status: "requested" }); return id;
  }
  async updateToolCall(id: string, status: ToolStatus, result?: unknown, errorMessage?: string): Promise<void> {
    const call = this.toolCalls.find(item => item.id === id); if (!call) throw new Error("Tool call not found");
    call.status = status; call.result = result; call.errorMessage = errorMessage;
  }
}
