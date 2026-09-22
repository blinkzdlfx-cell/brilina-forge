import type { AgentContextItem, ModelInput } from "./types.js";
import type { ToolRegistry } from "./registry.js";
export class ModelContext {
  private readonly messages: AgentContextItem[] = [];
  constructor(private readonly registry: ToolRegistry) {}
  add(item: AgentContextItem): void { this.messages.push(item); }
  input(): ModelInput {
    return { messages: [...this.messages], tools: this.registry.list().map(tool => ({
      name: tool.name, description: tool.description, inputSchema: tool.inputSchema
    })) };
  }
}
