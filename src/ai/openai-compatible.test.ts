import assert from "node:assert/strict";
import test from "node:test";
import { classifyHttpStatus, parseRetryAfterMs, transportError } from "./errors.js";
import { OpenAiCompatibleProvider, safeParseArguments } from "./openai-compatible.js";
import { AiProviderError, type AiModelRequest } from "./types.js";

function request(): AiModelRequest {
  return {
    messages: [
      { role: "system", content: "Active development context for this conversation:\n- repository: owner/repo" },
      { role: "user", content: "inspect the repository" }
    ],
    tools: [
      {
        name: "github.get_repository",
        description: "Read metadata for a GitHub repository.",
        inputSchema: { type: "object", required: ["owner", "repo"], properties: { owner: { type: "string" }, repo: { type: "string" } } }
      }
    ]
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function sseResponse(lines: string[]): Response {
  const body = lines.map(line => `data: ${line}\n\n`).join("") + "data: [DONE]\n\n";
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function provider(fetchImpl: typeof fetch, apiKey = "test-key") {
  return new OpenAiCompatibleProvider({ apiKey, defaultModel: "test-model", fetchImpl });
}

test("OpenAI-compatible adapter normalizes a tool call and usage", async () => {
  let capturedBody: Record<string, unknown> | undefined;
  const adapter = provider(async (_url, init) => {
    capturedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return jsonResponse({
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "call_1", type: "function", function: { name: "github.get_repository", arguments: '{"owner":"owner","repo":"repo"}' } }]
        },
        finish_reason: "tool_calls"
      }],
      usage: { prompt_tokens: 42, completion_tokens: 7 }
    });
  });

  const result = await adapter.complete(request(), "test-model");

  assert.equal(result.toolCalls.length, 1);
  assert.deepEqual(result.toolCalls[0], { id: "call_1", name: "github.get_repository", arguments: { owner: "owner", repo: "repo" } });
  assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 7 });
  assert.equal(result.provider, "openai-compatible");
  assert.equal(capturedBody?.model, "test-model");
  assert.deepEqual(capturedBody?.stream, false);
  assert.deepEqual((capturedBody?.tools as Array<{ type: string }>)[0]?.type, "function");
});

test("OpenAI-compatible adapter reconstructs streamed tool calls split across chunks", async () => {
  const adapter = provider(async () => sseResponse([
    JSON.stringify({ choices: [{ delta: { role: "assistant" } }] }),
    JSON.stringify({ choices: [{ delta: { content: "Reading " } }] }),
    JSON.stringify({ choices: [{ delta: { content: "the repository." } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_9", function: { name: "github.get_repository", arguments: '{"owner":"ow' } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ner","repo":"repo"}' } }] } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 11, completion_tokens: 3 } })
  ]));

  const events = [];
  for await (const event of adapter.stream(request(), "test-model")) events.push(event);

  assert.deepEqual(
    events.filter(event => event.type === "text_delta").map(event => event.type === "text_delta" ? event.content : ""),
    ["Reading ", "the repository."]
  );
  const toolCalls = events.filter(event => event.type === "tool_call");
  assert.equal(toolCalls.length, 1);
  assert.deepEqual(
    toolCalls[0].type === "tool_call" ? toolCalls[0].call : undefined,
    { id: "call_9", name: "github.get_repository", arguments: { owner: "owner", repo: "repo" } }
  );
  const usageEvent = events.find(event => event.type === "usage");
  assert.deepEqual(usageEvent?.type === "usage" ? usageEvent.usage : undefined, { inputTokens: 11, outputTokens: 3 });
  assert.equal(events.at(-1)?.type, "done");
});

test("OpenAI-compatible adapter never forwards the API key in a thrown error", async () => {
  const adapter = provider(async () => jsonResponse({ error: { message: "invalid api key" } }, 401));

  await assert.rejects(
    () => adapter.complete(request(), "test-model"),
    (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.details.kind, "authentication");
      assert.equal(error.details.retryable, false);
      assert.equal(JSON.stringify(error).includes("test-key"), false);
      assert.equal(error.message.includes("test-key"), false);
      return true;
    }
  );
});

test("rate limit errors carry the provider supplied cooldown", async () => {
  const adapter = provider(async () => jsonResponse({}, 429, {
    "retry-after": "12",
    "x-ratelimit-remaining": "0"
  }));

  await assert.rejects(
    () => adapter.complete(request(), "test-model"),
    (error: unknown) => {
      assert.ok(error instanceof AiProviderError);
      assert.equal(error.details.kind, "rate_limited");
      assert.equal(error.details.retryable, true);
      assert.equal(error.details.retryAfterMs, 12_000);
      return true;
    }
  );
});

test("parseRetryAfterMs understands Retry-After seconds, HTTP dates and rate-limit durations", () => {
  const now = 1_700_000_000_000;
  assert.equal(parseRetryAfterMs(new Headers({ "retry-after": "5" }), now), 5000);
  assert.equal(parseRetryAfterMs(new Headers({ "retry-after": new Date(now + 20_000).toUTCString() }), now), 20_000);
  assert.equal(parseRetryAfterMs(new Headers({ "x-ratelimit-reset-requests": "250ms" }), now), 250);
  assert.equal(parseRetryAfterMs(new Headers({ "x-ratelimit-reset-requests": "2s" }), now), 2000);
  assert.equal(parseRetryAfterMs(new Headers({ "x-ratelimit-reset-requests": "1m" }), now), 60_000);
  assert.equal(parseRetryAfterMs(new Headers({ "x-ratelimit-reset": String(now / 1000 + 30) }), now), 30_000);
  assert.equal(parseRetryAfterMs(new Headers(), now), undefined);
});

test("classifyHttpStatus separates retryable from terminal provider failures", () => {
  assert.equal(classifyHttpStatus("openai-compatible", "m", 429, undefined).retryable, true);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 503, undefined).retryable, true);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 500, undefined).retryable, true);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 408, undefined).retryable, true);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 401, undefined).retryable, false);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 400, undefined).retryable, false);
  assert.equal(classifyHttpStatus("openai-compatible", "m", 529, undefined).kind, "overloaded");
});

test("transport failures are normalized and retryable", () => {
  const error = transportError("openai-compatible", "m", new Error("socket hang up"));
  assert.equal(error.details.kind, "transport");
  assert.equal(error.details.retryable, true);
  assert.match(error.message, /socket hang up/);
});

test("malformed streamed tool arguments degrade to an empty object", () => {
  assert.deepEqual(safeParseArguments("{not json"), {});
  assert.deepEqual(safeParseArguments(""), {});
  assert.deepEqual(safeParseArguments('{"a":1}'), { a: 1 });
});