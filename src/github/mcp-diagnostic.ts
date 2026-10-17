const MCP_ENDPOINT = "https://api.githubcopilot.com/mcp/";
const MCP_PROTOCOL_VERSION = "2025-03-26";

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number;
  result?: Record<string, unknown>;
  error?: { code?: number; message?: string };
};

type McpRequestResult = {
  status: number;
  sessionId?: string;
  message?: JsonRpcMessage;
};

function parseMcpBody(body: string): JsonRpcMessage | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === "object") return parsed as JsonRpcMessage;
  } catch {
    // Streamable HTTP servers may return Server-Sent Events.
  }

  for (const block of trimmed.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      const parsed = JSON.parse(data) as unknown;
      if (parsed && typeof parsed === "object") return parsed as JsonRpcMessage;
    } catch {
      // Ignore non-JSON SSE frames and keep looking.
    }
  }
  return undefined;
}

async function mcpPost(
  accessToken: string,
  payload: Record<string, unknown>,
  sessionId?: string
): Promise<McpRequestResult> {
  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream"
  });
  if (sessionId) headers.set("MCP-Session-Id", sessionId);

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await response.text();
  return {
    status: response.status,
    sessionId: response.headers.get("MCP-Session-Id") ?? sessionId,
    message: parseMcpBody(body)
  };
}

export type GithubMcpDiagnostic = {
  endpoint: string;
  authenticated: boolean;
  initialize: { status: number; protocolVersion?: string; sessionEstablished: boolean };
  initializedNotification: { status: number };
  toolsList: { status: number; count: number; tools: Array<{ name: string; description?: string; argumentNames: string[] }> };
};

export async function probeGithubMcp(accessToken: string): Promise<GithubMcpDiagnostic> {
  const initialized = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "brilina-forge-diagnostic", version: "0.1.0" }
    }
  });

  if (initialized.status < 200 || initialized.status >= 300 || initialized.message?.error) {
    throw Object.assign(new Error("GitHub MCP initialize failed"), {
      statusCode: initialized.status === 401 || initialized.status === 403 ? initialized.status : 502,
      diagnostic: { initializeStatus: initialized.status, protocolError: initialized.message?.error?.message ?? null }
    });
  }

  const protocolVersion = typeof initialized.message?.result?.protocolVersion === "string"
    ? initialized.message.result.protocolVersion
    : undefined;

  const notification = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }, initialized.sessionId);

  if (notification.status < 200 || notification.status >= 300) {
    throw Object.assign(new Error("GitHub MCP initialized notification failed"), {
      statusCode: notification.status === 401 || notification.status === 403 ? notification.status : 502,
      diagnostic: { initializeStatus: initialized.status, initializedNotificationStatus: notification.status }
    });
  }

  const listed = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }, notification.sessionId ?? initialized.sessionId);

  if (listed.status < 200 || listed.status >= 300 || listed.message?.error) {
    throw Object.assign(new Error("GitHub MCP tools/list failed"), {
      statusCode: listed.status === 401 || listed.status === 403 ? listed.status : 502,
      diagnostic: {
        initializeStatus: initialized.status,
        initializedNotificationStatus: notification.status,
        toolsListStatus: listed.status,
        protocolError: listed.message?.error?.message ?? null
      }
    });
  }

  const rawTools = listed.message?.result?.tools;
  const tools = Array.isArray(rawTools) ? rawTools.flatMap((item): Array<{ name: string; description?: string; argumentNames: string[] }> => {
    if (!item || typeof item !== "object" || typeof (item as { name?: unknown }).name !== "string") return [];
    const tool = item as { name: string; description?: unknown; inputSchema?: { properties?: unknown } };
    const properties = tool.inputSchema?.properties;
    return [{
      name: tool.name,
      ...(typeof tool.description === "string" ? { description: tool.description.slice(0, 240) } : {}),
      argumentNames: properties && typeof properties === "object" && !Array.isArray(properties)
        ? Object.keys(properties as Record<string, unknown>).slice(0, 80)
        : []
    }];
  }) : [];

  return {
    endpoint: MCP_ENDPOINT,
    authenticated: true,
    initialize: {
      status: initialized.status,
      ...(protocolVersion ? { protocolVersion } : {}),
      sessionEstablished: Boolean(initialized.sessionId)
    },
    initializedNotification: { status: notification.status },
    toolsList: { status: listed.status, count: tools.length, tools }
  };
}

export type GithubMcpReadToolName = "get_me" | "list_branches" | "get_file_contents";

function validateReadToolArguments(toolName: string, args: unknown): asserts args is Record<string, unknown> {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw Object.assign(new Error("Tool arguments must be an object"), { statusCode: 400 });
  }
  const input = args as Record<string, unknown>;
  const validRepoPart = (value: unknown): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(value) && value !== "." && value !== "..";

  if (toolName === "get_me") {
    if (Object.keys(input).length !== 0) {
      throw Object.assign(new Error("get_me does not accept arguments"), { statusCode: 400 });
    }
    return;
  }

  if (!validRepoPart(input.owner) || !validRepoPart(input.repo)) {
    throw Object.assign(new Error("A valid repository owner and name are required"), { statusCode: 400 });
  }

  if (toolName === "list_branches") {
    if (Object.keys(input).some(key => !["owner", "repo", "page", "perPage"].includes(key))) {
      throw Object.assign(new Error("Unsupported list_branches argument"), { statusCode: 400 });
    }
    for (const key of ["page", "perPage"]) {
      if (input[key] !== undefined && (!Number.isInteger(input[key]) || Number(input[key]) < 1 || Number(input[key]) > 10)) {
        throw Object.assign(new Error(`Invalid ${key}; use an integer from 1 to 10`), { statusCode: 400 });
      }
    }
    return;
  }

  if (toolName === "get_file_contents") {
    if (Object.keys(input).some(key => !["owner", "repo", "path", "ref"].includes(key))) {
      throw Object.assign(new Error("Unsupported get_file_contents argument"), { statusCode: 400 });
    }
    if (typeof input.path !== "string" || input.path.length < 1 || input.path.length > 500 ||
        /[\\u0000-\\u001f\\u007f]/.test(input.path) || input.path.split("/").includes("..")) {
      throw Object.assign(new Error("A valid repository file path is required"), { statusCode: 400 });
    }
    if (input.ref !== undefined && (typeof input.ref !== "string" || input.ref.length < 1 || input.ref.length > 255 ||
        /[\\u0000-\\u001f\\u007f]/.test(input.ref))) {
      throw Object.assign(new Error("Invalid repository ref"), { statusCode: 400 });
    }
    return;
  }

  throw Object.assign(new Error("This diagnostic only permits read-only GitHub MCP tools"), { statusCode: 400 });
}

/**
 * Executes only a small, explicit allowlist of read-only GitHub MCP tools.
 * This is a temporary diagnostic path, not the agent's production tool router.
 */
export async function callGithubMcpReadTool(
  accessToken: string,
  toolName: string,
  args: unknown
): Promise<{ toolName: GithubMcpReadToolName; isError: boolean; content: Array<{ type: string; text?: string }>; structuredContentPreview?: string }> {
  if (toolName !== "get_me" && toolName !== "list_branches" && toolName !== "get_file_contents") {
    throw Object.assign(new Error("This diagnostic only permits read-only GitHub MCP tools"), { statusCode: 400 });
  }
  validateReadToolArguments(toolName, args);

  const initialized = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "brilina-forge-diagnostic", version: "0.1.0" }
    }
  });
  if (initialized.status < 200 || initialized.status >= 300 || initialized.message?.error) {
    throw Object.assign(new Error("GitHub MCP initialize failed"), {
      statusCode: initialized.status === 401 || initialized.status === 403 ? initialized.status : 502
    });
  }

  const notification = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    method: "notifications/initialized"
  }, initialized.sessionId);
  if (notification.status < 200 || notification.status >= 300) {
    throw Object.assign(new Error("GitHub MCP initialized notification failed"), {
      statusCode: notification.status === 401 || notification.status === 403 ? notification.status : 502
    });
  }

  const called = await mcpPost(accessToken, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: toolName, arguments: args }
  }, notification.sessionId ?? initialized.sessionId);
  if (called.status < 200 || called.status >= 300 || called.message?.error) {
    throw Object.assign(new Error("GitHub MCP tool call failed"), {
      statusCode: called.status === 401 || called.status === 403 ? called.status : 502,
      diagnostic: { toolName, status: called.status, protocolError: called.message?.error?.message ?? null }
    });
  }

  const result = called.message?.result;
  if (!result || typeof result !== "object") {
    throw Object.assign(new Error("GitHub MCP returned an invalid tool result"), { statusCode: 502 });
  }
  const rawContent = Array.isArray(result.content) ? result.content : [];
  const content = rawContent.flatMap((item): Array<{ type: string; text?: string }> => {
    if (!item || typeof item !== "object") return [];
    const entry = item as { type?: unknown; text?: unknown; name?: unknown; title?: unknown; resource?: { text?: unknown } };
    if (typeof entry.type !== "string") return [];
    const textValue = typeof entry.text === "string" ? entry.text
      : typeof entry.resource?.text === "string" ? entry.resource.text
        : typeof entry.title === "string" ? entry.title
          : typeof entry.name === "string" ? entry.name : undefined;
    return [{ type: entry.type, ...(textValue !== undefined ? { text: textValue.slice(0, 20_000) } : {}) }];
  }).slice(0, 20);
  return {
    toolName,
    isError: result.isError === true,
    content,
    ...(result.structuredContent && typeof result.structuredContent === "object"
      ? { structuredContentPreview: JSON.stringify(result.structuredContent).slice(0, 20_000) }
      : {})
  };
}
