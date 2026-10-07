import type { FastifyInstance } from "fastify";
import type { WebSocket } from "ws";
import type { ExecutionService } from "./types.js";

export type TerminalSocketDeps = {
  execution: ExecutionService;
  resolveIdentity(headers: Record<string, string | string[] | undefined>): Promise<{ userId: string; workspaceId: string }>;
  isOriginAllowed(origin: string): boolean;
};

type ClientMessage = { type?: string; command?: string };

/**
 * Bidirectional PTY transport for the interactive terminal (ADR-013). Chat and
 * run events stay on SSE; only the terminal needs a socket because input and
 * output are both live.
 *
 * The socket deliberately exposes no raw-stdin write path: every command the
 * browser can run goes through `exec`, which classifies it first. A raw write
 * would hand an authenticated browser a shell that bypasses command policy.
 */
export function registerTerminalSocket(app: FastifyInstance, deps: TerminalSocketDeps): void {
  app.get("/api/terminal/sessions/:sessionId/socket", { websocket: true }, (socket: WebSocket, request) => {
    void attach(socket, request.params as { sessionId: string }, request.headers, deps);
  });
}

async function attach(
  socket: WebSocket,
  params: { sessionId: string },
  headers: Record<string, string | string[] | undefined>,
  deps: TerminalSocketDeps
): Promise<void> {
  const { sessionId } = params;

  // A WebSocket handshake is not covered by the same-origin policy, so the
  // Origin header is checked explicitly before any session is resolved.
  const origin = headers.origin;
  const originValue = Array.isArray(origin) ? origin[0] : origin;
  if (originValue && !deps.isOriginAllowed(originValue)) {
    socket.close(4403, "origin not allowed");
    return;
  }

  let identity: { userId: string; workspaceId: string };
  try {
    identity = await deps.resolveIdentity(headers);
  } catch {
    socket.close(4401, "authentication required");
    return;
  }

  const session = await deps.execution.getSession(sessionId);
  if (!session || session.workspaceId !== identity.workspaceId) {
    socket.close(4404, "terminal session not found");
    return;
  }
  if (session.userId && session.userId !== identity.userId) {
    socket.close(4403, "terminal session belongs to another user");
    return;
  }

  const send = (payload: unknown) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
  };

  send({ type: "session.ready", sessionId, state: session.state });
  for (const entry of await deps.execution.read(sessionId, { limit: 200 })) {
    send({ type: "output", stream: entry.stream, chunk: entry.chunk, at: entry.at });
  }

  const unsubscribe = deps.execution.subscribe(sessionId, entry => {
    send({ type: "output", stream: entry.stream, chunk: entry.chunk, at: entry.at });
  });

  const heartbeat = setInterval(() => {
    if (socket.readyState === socket.OPEN) socket.ping();
  }, 20_000);
  heartbeat.unref?.();

  const handleMessage = async (raw: string) => {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw) as ClientMessage;
    } catch {
      send({ type: "error", error: "invalid_message" });
      return;
    }

    try {
      if (message.type === "exec" && typeof message.command === "string") {
        send({ type: "exec.completed", ...(await deps.execution.exec({ sessionId, command: message.command })) });
        return;
      }
      send({ type: "error", error: "unsupported_message" });
    } catch (error) {
      send({ type: "error", error: error instanceof Error ? error.message : "terminal_error" });
    }
  };

  socket.on("message", data => {
    void handleMessage(data.toString());
  });

  socket.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}