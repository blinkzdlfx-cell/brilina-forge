import { classifyHttpStatus, emptyUsage, parseRetryAfterMs, transportError } from "./errors.js";
import {
  AiProviderError,
  type AiModelDescriptor,
  type AiModelRequest,
  type AiModelResult,
  type AiProvider,
  type AiStreamEvent,
  type AiToolCall,
  type AiUsage
} from "./types.js";

type ChatCompletionMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{ id: string; type?: string; function?: { name?: string; arguments?: string } }>;
  tool_call_id?: string;
  name?: string;
};

type ChatCompletionChunk = {
  choices?: Array<{
    delta?: { role?: string; content?: string | null; tool_calls?: Array<{ index?: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
};

export type OpenAiCompatibleOptions = {
  apiKey: string;
  baseUrl?: string;
  defaultModel: string;
  models?: AiModelDescriptor[];
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TIMEOUT_MS = 120_000;

export class OpenAiCompatibleProvider implements AiProvider {
  readonly id = "openai-compatible" as const;
  readonly models: AiModelDescriptor[];

  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiCompatibleOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.defaultModel = options.defaultModel;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.models = options.models ?? [{
      id: options.defaultModel,
      provider: this.id,
      contextWindow: 128_000,
      supportsTools: true
    }];
  }

  private resolveModel(model: string): string {
    return model || this.defaultModel;
  }

  private buildBody(request: AiModelRequest, model: string, stream: boolean): Record<string, unknown> {
    const messages: ChatCompletionMessage[] = request.messages.map(message => {
      if (message.role === "tool") {
        return { role: "tool", tool_call_id: message.toolCallId, name: message.name, content: message.content };
      }
      if (message.role === "assistant") {
        return {
          role: "assistant",
          content: message.content,
          ...(message.toolCalls?.length
            ? {
                tool_calls: message.toolCalls.map(call => ({
                  id: call.id,
                  type: "function",
                  function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) }
                }))
              }
            : {})
        };
      }
      return { role: message.role, content: message.content };
    });

    return {
      model,
      messages,
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(request.tools.length
        ? {
            tools: request.tools.map(tool => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: tool.inputSchema }
            })),
            tool_choice: "auto"
          }
        : {})
    };
  }

  private async send(request: AiModelRequest, model: string, stream: boolean): Promise<Response> {
    const resolved = this.resolveModel(model);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
          accept: stream ? "text/event-stream" : "application/json"
        },
        body: JSON.stringify(this.buildBody(request, resolved, stream)),
        signal
      });
    } catch (error) {
      if (timeout.aborted) {
        throw new AiProviderError({
          provider: this.id,
          model: resolved,
          kind: "timeout",
          retryable: true,
          message: `AI provider request exceeded ${this.timeoutMs}ms`
        });
      }
      throw transportError(this.id, resolved, error);
    }

    if (!response.ok) {
      throw new AiProviderError(classifyHttpStatus(
        this.id,
        resolved,
        response.status,
        parseRetryAfterMs(response.headers, Date.now())
      ));
    }

    return response;
  }

  async complete(request: AiModelRequest, model: string): Promise<AiModelResult> {
    const resolved = this.resolveModel(model);
    const response = await this.send(request, resolved, false);
    const body = await response.json().catch(() => undefined) as {
      choices?: Array<{ message?: ChatCompletionMessage; finish_reason?: string | null }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | undefined;

    const message = body?.choices?.[0]?.message;
    if (!message) {
      throw new AiProviderError({
        provider: this.id,
        model: resolved,
        kind: "server_error",
        retryable: true,
        message: "AI provider response did not contain a completion message"
      });
    }

    return {
      content: message.content ?? "",
      toolCalls: normalizeToolCalls(message.tool_calls),
      usage: normalizeUsage(body?.usage),
      provider: this.id,
      model: resolved
    };
  }

  async *stream(request: AiModelRequest, model: string): AsyncIterable<AiStreamEvent> {
    const resolved = this.resolveModel(model);
    const response = await this.send(request, resolved, true);
    if (!response.body) {
      throw new AiProviderError({
        provider: this.id,
        model: resolved,
        kind: "transport",
        retryable: true,
        message: "AI provider stream response had no body"
      });
    }

    const pending = new Map<number, { id: string; name: string; args: string }>();
    let usage: AiUsage | undefined;

    for await (const line of readLines(response.body)) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;

      let chunk: ChatCompletionChunk;
      try {
        chunk = JSON.parse(payload) as ChatCompletionChunk;
      } catch {
        continue;
      }

      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) yield { type: "text_delta", content: delta.content };

      for (const call of delta?.tool_calls ?? []) {
        const index = call.index ?? 0;
        const current = pending.get(index) ?? { id: "", name: "", args: "" };
        if (call.id) current.id = call.id;
        if (call.function?.name) current.name += call.function.name;
        if (call.function?.arguments) current.args += call.function.arguments;
        pending.set(index, current);
      }

      if (chunk.usage) usage = normalizeUsage(chunk.usage);
    }

    for (const call of pending.values()) {
      if (!call.name) continue;
      yield { type: "tool_call", call: { id: call.id || call.name, name: call.name, arguments: safeParseArguments(call.args) } };
    }

    if (usage) yield { type: "usage", usage };
    yield { type: "done", usage };
  }
}

function normalizeUsage(usage?: { prompt_tokens?: number; completion_tokens?: number }): AiUsage {
  if (!usage) return emptyUsage();
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0
  };
}

function normalizeToolCalls(calls?: ChatCompletionMessage["tool_calls"]): AiToolCall[] {
  const normalized: AiToolCall[] = [];
  for (const call of calls ?? []) {
    const name = call.function?.name;
    if (!name) continue;
    normalized.push({
      id: call.id || name,
      name,
      arguments: safeParseArguments(call.function?.arguments ?? "{}")
    });
  }
  return normalized;
}

export function safeParseArguments(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return {};
  }
}

async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        yield line;
        newline = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}