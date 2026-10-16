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
