import type { ExecutionService } from "../../execution/types.js";
import type { ForgeTool } from "../types.js";

const SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

function isSessionId(value: string): boolean {
  return SESSION_ID_PATTERN.test(value);
}

async function ownsSession(service: ExecutionService, sessionId: string, principal: { userId: string; workspaceId: string }): Promise<boolean> {
  if (!isSessionId(sessionId)) return false;
  const session = await service.getSession(sessionId);
  if (!session) return false;
  if (session.workspaceId !== principal.workspaceId) return false;
  // Sessions created before user scoping have no owner recorded; they are only
  // reachable from the workspace that owns them.
  return !session.userId || session.userId === principal.userId;
}

export function createTerminalCreateSessionTool(service: ExecutionService): ForgeTool<{ conversationId: string }> {
  return {
    name: "terminal.create_session",
    description: "Open a disposable terminal session for a conversation. The session holds no source of record.",
    inputSchema: {
      type: "object",
      required: ["conversationId"],
      properties: { conversationId: { type: "string" } }
    },
    policy: "approval-required",
    async authorize(context, args) {
      return isSessionId(args.conversationId) && context.principal.workspaceId.length > 0;
    },
    async execute(context, args) {
      return service.createSession({
        conversationId: args.conversationId,
        workspaceId: context.principal.workspaceId,
        userId: context.principal.userId
      });
    }
  };
}

export function createTerminalExecTool(service: ExecutionService): ForgeTool<{ sessionId: string; command: string }> {
  return {
    name: "terminal.exec",
    description: "Run one command in an existing terminal session. Commands are classified before execution.",
    inputSchema: {
      type: "object",
      required: ["sessionId", "command"],
      properties: { sessionId: { type: "string" }, command: { type: "string" } }
    },
    policy: "approval-required",
    async authorize(context, args) { return ownsSession(service, args.sessionId, context.principal); },
    async execute(_context, args) {
      const result = await service.exec({ sessionId: args.sessionId, command: args.command });
      return { ...result, output: result.output.slice(0, 8000) };
    }
  };
}

export function createTerminalReadTool(service: ExecutionService): ForgeTool<{ sessionId: string }> {
  return {
    name: "terminal.read",
    description: "Read the buffered terminal output of a session.",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: { sessionId: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) { return ownsSession(service, args.sessionId, context.principal); },
    async execute(_context, args) {
      const entries = await service.read(args.sessionId, { limit: 200 });
      return {
        sessionId: args.sessionId,
        output: entries.map(entry => entry.chunk).join("").slice(-8000)
      };
    }
  };
}

export function createTerminalKillTool(service: ExecutionService): ForgeTool<{ sessionId: string }> {
  return {
    name: "terminal.kill",
    description: "Terminate a terminal session. The session's contents are disposable.",
    inputSchema: {
      type: "object",
      required: ["sessionId"],
      properties: { sessionId: { type: "string" } }
    },
    policy: "approval-required",
    async authorize(context, args) { return ownsSession(service, args.sessionId, context.principal); },
    async execute(_context, args) {
      const session = await service.kill(args.sessionId);
      return { sessionId: args.sessionId, state: session?.state ?? "unknown" };
    }
  };
}

export function createTerminalTools(service: ExecutionService): ForgeTool[] {
  return [
    createTerminalCreateSessionTool(service),
    createTerminalExecTool(service),
    createTerminalReadTool(service),
    createTerminalKillTool(service)
  ];
}