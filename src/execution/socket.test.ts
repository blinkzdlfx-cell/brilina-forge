import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import { WebSocket } from "ws";
import { registerTerminalSocket } from "./socket.js";
import type { ExecutionService, TerminalLogEntry, TerminalSession } from "./types.js";

function fakeExecution(session?: TerminalSession): ExecutionService & { emit(chunk: string): void; execCalls: string[] } {
  const listeners = new Set<(entry: TerminalLogEntry) => void>();
  const record: TerminalSession = session ?? {
    id: "session-1",
    conversationId: "c1",
    workspaceId: "w1",
    shell: "/bin/bash",
    cwd: "/tmp/c1",
    state: "running",
    createdAt: Date.now(),
    exitCode: null,
    logBytes: 0
  };

  return {
    provider: "fake",
    execCalls: [],
    async createSession() { return record; },
    async listSessions() { return [record]; },
    async getSession(id) { return id === record.id ? record : undefined; },
    async exec(input) {
      this.execCalls.push(input.command);
      return { sessionId: record.id, command: input.command, classification: "safe" as const, exitCode: 0, output: "ran:" + input.command, durationMs: 1, truncated: false };
    },
    async write() { },
    async read() { return [{ sessionId: record.id, stream: "stdout" as const, chunk: "backlog", at: Date.now() }]; },
    async kill() { return { ...record, state: "killed" as const }; },
    subscribe(_id, listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(chunk: string) {
      for (const listener of listeners) listener({ sessionId: record.id, stream: "stdout", chunk, at: Date.now() });
    }
  };
}

async function withServer<T>(
  execution: ExecutionService,
  authorize: (headers: Record<string, string | string[] | undefined>) => Promise<{ userId: string; workspaceId: string }>,
  run: (url: string) => Promise<T>,
  isOriginAllowed: (origin: string) => boolean = () => true
): Promise<T> {
  const app = Fastify();
  await app.register(websocket);
  registerTerminalSocket(app, { execution, resolveIdentity: authorize, isOriginAllowed });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    return await run(`ws://127.0.0.1:${port}`);
  } finally {
    await app.close();
  }
}

type TestSocket = WebSocket & { buffered: Record<string, unknown>[] };

function open(url: string): Promise<TestSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url) as TestSocket;
    socket.buffered = [];
    socket.on("message", data => socket.buffered.push(JSON.parse(data.toString()) as Record<string, unknown>));
    socket.once("open", () => resolve(socket));
    socket.once("error", reject);
  });
}

function nextMessage(socket: TestSocket, predicate: (message: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  const existing = socket.buffered.find(predicate);
  if (existing) {
    socket.buffered = socket.buffered.filter(message => message !== existing);
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("timed out waiting for a terminal socket message"));
    }, 8000);

    function onMessage(data: WebSocket.RawData) {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      socket.buffered = socket.buffered.filter(item => item !== message);
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }

    socket.on("message", onMessage);
  });
}

test("terminal socket replays backlog and streams live output", async () => {
  const execution = fakeExecution();
  await withServer(execution, async () => ({ userId: "u1", workspaceId: "w1" }), async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    try {
      const ready = await nextMessage(socket, m => m.type === "session.ready");
      assert.equal(ready.sessionId, "session-1");
      assert.equal(ready.state, "running");

      const backlog = await nextMessage(socket, m => m.type === "output" && m.chunk === "backlog");
      assert.equal(backlog.stream, "stdout");
    } finally {
      socket.close();
    }
  });
});

test("terminal socket forwards exec requests to the worker", async () => {
  const execution = fakeExecution();
  await withServer(execution, async () => ({ userId: "u1", workspaceId: "w1" }), async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    try {
      await nextMessage(socket, m => m.type === "session.ready");
      socket.send(JSON.stringify({ type: "exec", command: "npm test" }));
      const result = await nextMessage(socket, m => m.type === "exec.completed");
      assert.equal(result.command, "npm test");
      assert.deepEqual(execution.execCalls, ["npm test"]);
    } finally {
      socket.close();
    }
  });
});

test("terminal socket rejects malformed and unsupported messages without closing", async () => {
  const execution = fakeExecution();
  await withServer(execution, async () => ({ userId: "u1", workspaceId: "w1" }), async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    try {
      await nextMessage(socket, m => m.type === "session.ready");
      socket.send("not json");
      assert.deepEqual(await nextMessage(socket, m => m.error === "invalid_message"), { type: "error", error: "invalid_message" });

      socket.send(JSON.stringify({ type: "resize" }));
      assert.deepEqual(await nextMessage(socket, m => m.error === "unsupported_message"), { type: "error", error: "unsupported_message" });

      socket.send(JSON.stringify({ type: "exec", command: "ls" }));
      assert.equal((await nextMessage(socket, m => m.type === "exec.completed")).command, "ls");
    } finally {
      socket.close();
    }
  });
});

test("terminal socket closes unauthenticated and cross-workspace connections", async () => {
  const execution = fakeExecution();

  await withServer(execution, async () => { throw new Error("no session"); }, async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    const code = await new Promise<number>(resolve => socket.once("close", resolve));
    assert.equal(code, 4401);
  });

  await withServer(execution, async () => ({ userId: "u2", workspaceId: "other-workspace" }), async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    const code = await new Promise<number>(resolve => socket.once("close", resolve));
    assert.equal(code, 4404);
  });
});

test("terminal socket streams worker output pushed after connection", async () => {
  const execution = fakeExecution();
  await withServer(execution, async () => ({ userId: "u1", workspaceId: "w1" }), async url => {
    const socket = await open(url + "/api/terminal/sessions/session-1/socket");
    try {
      await nextMessage(socket, m => m.type === "session.ready");
      await nextMessage(socket, m => m.chunk === "backlog");
      setTimeout(() => execution.emit("live-output"), 10);
      const live = await nextMessage(socket, m => m.chunk === "live-output");
      assert.equal(live.stream, "stdout");
    } finally {
      socket.close();
    }
  });
});