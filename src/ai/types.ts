export type AiProviderId = "openai-compatible" | "deterministic-development";

export type AiModelDescriptor = {
  id: string;
  provider: AiProviderId;
  contextWindow: number;
  supportsTools: boolean;
};

export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type AiModelRequest = {
  messages: AiMessage[];
  tools: AiToolDefinition[];
  signal?: AbortSignal;
};

export type AiMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: AiToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type AiToolCall = { id: string; name: string; arguments: unknown };

export type AiToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AiStreamEvent =
  | { type: "text_delta"; content: string }
  | { type: "tool_call"; call: AiToolCall }
  | { type: "usage"; usage: AiUsage }
  | { type: "done"; usage?: AiUsage };

export type AiModelResult = {
  content: string;
  toolCalls: AiToolCall[];
  usage: AiUsage;
  provider: AiProviderId;
  model: string;
};

export type AiProviderErrorKind =
  | "authentication"
  | "rate_limited"
  | "overloaded"
  | "timeout"
  | "invalid_request"
  | "server_error"
  | "transport";

export type AiProviderErrorDetails = {
  provider: AiProviderId;
  model: string;
  kind: AiProviderErrorKind;
  retryable: boolean;
  retryAfterMs?: number;
  message: string;
};

export class AiProviderError extends Error {
  constructor(public readonly details: AiProviderErrorDetails) {
    super(details.message);
    this.name = "AiProviderError";
  }
}

export type AiProvider = {
  readonly id: AiProviderId;
  readonly models: AiModelDescriptor[];
  complete(request: AiModelRequest, model: string): Promise<AiModelResult>;
  stream(request: AiModelRequest, model: string): AsyncIterable<AiStreamEvent>;
};