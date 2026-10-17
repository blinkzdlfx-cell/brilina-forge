import test from "node:test";
import assert from "node:assert/strict";
import { probeGithubMcp } from "./mcp-diagnostic.js";

test("GitHub MCP diagnostic initializes, lists tools, and only returns tool schema names", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    requests.push({ url: String(input), headers, body });
    const method = body.method;
    if (method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { protocolVersion: "2025-03-26", capabilities: {}, serverInfo: { name: "github", version: "test" } }
      }), { status: 200, headers: { "Content-Type": "application/json", "MCP-Session-Id": "test-session" } });
    }
    if (method === "notifications/initialized") return new Response(null, { status: 202 });
    if (method === "tools/list") {
      return new Response([
        "event: message",
        'data: {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"get_file_contents","description":"Read a file","inputSchema":{"type":"object","properties":{"owner":{"type":"string"},"path":{"type":"string"}}}},{"name":"create_branch","inputSchema":{"type":"object","properties":{"branch":{"type":"string"}}}}]}}',
        ""
      ].join("\n"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error("Unexpected MCP method");
  }) as typeof fetch;

  try {
    const result = await probeGithubMcp("secret-test-token");
    assert.equal(result.authenticated, true);
    assert.equal(result.initialize.protocolVersion, "2025-03-26");
    assert.equal(result.initialize.sessionEstablished, true);
    assert.equal(result.toolsList.count, 2);
    assert.deepEqual(result.toolsList.tools[0].argumentNames, ["owner", "path"]);
    assert.equal(JSON.stringify(result).includes("secret-test-token"), false);
    assert.equal(requests.length, 3);
    assert.equal(requests[0].headers.get("Authorization"), "Bearer secret-test-token");
    assert.equal(requests[1].headers.get("MCP-Session-Id"), "test-session");
    assert.equal(requests[2].body.method, "tools/list");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub MCP diagnostic reports authentication rejection without leaking token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(
      probeGithubMcp("secret-test-token"),
      (error: Error & { statusCode?: number }) => {
        assert.equal(error.statusCode, 401);
        assert.equal(error.message, "GitHub MCP initialize failed");
        assert.equal(error.message.includes("secret-test-token"), false);
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("read-only MCP tool probe calls get_me and returns bounded tool output", async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { method: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    methods.push(body.method);
    if (body.method === "initialize") {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26" } }), {
        status: 200, headers: { "MCP-Session-Id": "probe-session" }
      });
    }
    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
    if (body.method === "tools/call") {
      assert.equal(body.params?.name, "get_me");
      return new Response(JSON.stringify({
        jsonrpc: "2.0", id: 3,
        result: { content: [{ type: "text", text: "authenticated user" }], isError: false }
      }), { status: 200 });
    }
    throw new Error("Unexpected MCP method");
  }) as typeof fetch;

  try {
    const { callGithubMcpReadTool } = await import("./mcp-diagnostic.js");
    const result = await callGithubMcpReadTool("secret-test-token", "get_me", {});
    assert.equal(result.toolName, "get_me");
    assert.equal(result.isError, false);
    assert.equal(result.content[0].text, "authenticated user");
    assert.deepEqual(methods, ["initialize", "notifications/initialized", "tools/call"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("read-only MCP tool probe rejects write tools and invalid repository paths", async () => {
  const { callGithubMcpReadTool } = await import("./mcp-diagnostic.js");
  await assert.rejects(
    callGithubMcpReadTool("token", "push_files", {}),
    /only permits read-only/
  );
  await assert.rejects(
    callGithubMcpReadTool("token", "get_file_contents", { owner: "blinkzdlfx-cell", repo: "brilina-forge", path: "../secret" }),
    /valid repository file path/
  );
});
