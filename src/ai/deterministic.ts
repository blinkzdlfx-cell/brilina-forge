import type { AiModelDescriptor, AiModelRequest, AiModelResult, AiProvider, AiStreamEvent, AiToolCall } from "./types.js";

export type DeterministicModelOptions = {
  model?: string;
  toolCall?: (request: AiModelRequest) => AiToolCall | undefined;
  reply?: (request: AiModelRequest) => string;
};

const REPOSITORY_INTENT = /\b(inspect|repository|repo|branch|readme|documentation|context|overview)\b/i;

function repositoryFromContext(request: AiModelRequest): string | undefined {
  for (const message of request.messages) {
    if (message.role !== "system") continue;
    const match = /- repository: (\S+)/.exec(message.content);
    if (match) return match[1];
  }
  return undefined;
}

function lastUserContent(request: AiModelRequest): string {
  for (let index = request.messages.length - 1; index >= 0; index--) {
    const message = request.messages[index];
    if (message?.role === "user") return message.content;
  }
  return "";
}

function defaultToolCall(request: AiModelRequest): AiToolCall | undefined {
  const repository = repositoryFromContext(request);
  const hasToolResult = request.messages.some(message => message.role === "tool");
  const readToolRegistered = request.tools.some(tool => tool.name === "github.get_repository");
  if (!repository || hasToolResult || !readToolRegistered || !REPOSITORY_INTENT.test(lastUserContent(request))) return undefined;

  const [owner, repo] = repository.split("/");
  if (!owner || !repo) return undefined;
  return { id: "deterministic-read-repository", name: "github.get_repository", arguments: { owner, repo } };
}

function defaultReply(request: AiModelRequest): string {
  const repository = repositoryFromContext(request);
  const toolResults = request.messages.filter(message => message.role === "tool");

  if (!repository) {
    return "Select a repository and branch in the Forge header, then describe the change you want. The deterministic development adapter has no repository context to inspect.";
  }

  if (toolResults.length === 0) {
    return "Development mode received your request for " + repository + ". Ask me to inspect the repository or its documentation and I will read it through the registered read-only GitHub tool.";
  }

  return [
    "Development mode completed the request through the Agent Controller.",
    "Repository: " + repository + ".",
    "The registered read-only GitHub tool returned a structured result that was appended to the model context.",
    "Live model reasoning is deferred until an AI provider key is configured."
  ].join("\n");
}

/**
 * Development/test adapter only. It is never a production AI implementation
 * (ADR-010/ADR-011); it exists so the controller and UI lifecycle can be
 * exercised without a provider key.
 */
export class DeterministicDevelopmentProvider implements AiProvider {
  readonly id = "deterministic-development" as const;
  readonly models: AiModelDescriptor[];

  constructor(private readonly options: DeterministicModelOptions = {}) {
    this.models = [{
      id: options.model ?? "forge-deterministic",
      provider: this.id,
      contextWindow: 32_000,
      supportsTools: true
    }];
  }

  async complete(request: AiModelRequest, model: string): Promise<AiModelResult> {
    const toolCall = (this.options.toolCall ?? defaultToolCall)(request);
    const content = toolCall ? "" : (this.options.reply ?? defaultReply)(request);
    return {
      content,
      toolCalls: toolCall ? [toolCall] : [],
      usage: { inputTokens: countInput(request), outputTokens: content.length },
      provider: this.id,
      model
    };
  }

  async *stream(request: AiModelRequest, model: string): AsyncIterable<AiStreamEvent> {
    const result = await this.complete(request, model);
    for (const word of result.content.split(/(\s+)/)) {
      if (word) yield { type: "text_delta", content: word };
    }
    if (result.toolCalls.length) {
      for (const call of result.toolCalls) yield { type: "tool_call", call };
    }
    yield { type: "usage", usage: result.usage };
    yield { type: "done", usage: result.usage };
  }
}

function countInput(request: AiModelRequest): number {
  return request.messages.reduce((total, message) => total + message.content.length, 0);
}