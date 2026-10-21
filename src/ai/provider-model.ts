import type { AgentModel, AgentContextItem, ModelDecision, ModelInput } from "../agent/types.js";
import type { AiMessage, AiModelRequest, AiProvider, AiToolCall, AiUsage } from "./types.js";

export type ProviderModelOptions = {
  provider: AiProvider;
  model: string;
  signal?: AbortSignal;
};

export class ProviderAgentModel implements AgentModel {
  constructor(private readonly options: ProviderModelOptions) {}

  async next(input: ModelInput, onTextDelta?: (content: string) => void): Promise<ModelDecision> {
    const messages = toAiMessages(input.messages);
    const request: AiModelRequest = {
      messages,
      tools: input.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema
      })),
      ...(this.options.signal ? { signal: this.options.signal } : {})
    };

    let content = "";
    let toolCall: AiToolCall | undefined;
    let usage: AiUsage | undefined;

    for await (const event of this.options.provider.stream(request, this.options.model)) {
      if (event.type === "text_delta") {
        content += event.content;
        onTextDelta?.(event.content);
      } else if (event.type === "tool_call") {
        toolCall ??= event.call;
      } else if (event.type === "usage" || event.type === "done") {
        if (event.usage) usage = event.usage;
      }
    }

    this.lastUsage = usage;
    return toDecision(toolCall, content);
  }

  lastUsage?: AiUsage;
}

export function toAiMessages(items: AgentContextItem[]): AiMessage[] {
  return items.map(item => {
    if (item.role === "tool") {
      return { role: "tool", toolCallId: item.toolCallId, name: item.toolCallId, content: item.content };
    }
    if (item.role === "assistant") {
      return {
        role: "assistant",
        content: item.content,
        ...(item.toolCalls?.length
          ? {
              toolCalls: item.toolCalls.map(call => ({
                id: call.id,
                name: call.name,
                arguments: call.arguments
              }))
            }
          : {})
      };
    }
    return { role: item.role, content: item.content };
  });
}

export function toDecision(toolCall: AiToolCall | undefined, content: string): ModelDecision {
  if (toolCall) {
    return { type: "tool_call", call: { id: toolCall.id, name: toolCall.name, arguments: toolCall.arguments } };
  }
  return { type: "final", content };
}