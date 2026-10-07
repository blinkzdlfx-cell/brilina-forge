import { randomUUID } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { classifyCommand } from "./command-policy.js";
import type {
  ExecResult,
  ExecutionService,
  TerminalLogEntry,
  TerminalSession
} from "./types.js";

type SessionRecord = {
  session: TerminalSession;
  child: ChildProcessWithoutNullStreams | null;
  exited: Promise<void>;
  log: TerminalLogEntry[];
  listeners: Set<(entry: TerminalLogEntry) => void>;
  buffer: Buffer;
  pendingCommand: { startedAt: number; command: string; classification: ExecResult["classification"]; timer: NodeJS.Timeout } | null;
};

export type LocalExecutionOptions = {
  shell?: string;
  rootDir?: string;
  maxLogBytes?: number;
  maxOutputChars?: number;
  defaultTimeoutMs?: number;
  maxTimeoutMs?: number;
  maxSessions?: number;
  env?: NodeJS.ProcessEnv;
};

const DEFAULT_MAX_LOG_BYTES = 256 * 1024;
const DEFAULT_MAX_OUTPUT_CHARS = 32_000;
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_TIMEOUT_MS = 600_000;
const DEFAULT_MAX_SESSIONS = 8;
const DEFAULT_SHELL = process.platform === "win32" ? "powershell.exe" : "/bin/bash";
const DRAIN_QUIET_MS = 150;

/**
 * Environment variables a worker session may see. The worker never inherits the
 * Forge process environment: DATABASE_URL, GitHub secrets and the token
 * encryption key must not be reachable from a terminal session.
 */
const ENV_ALLOW_LIST = [
  "PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "TERM", "SHELL",
  "SystemRoot", "SystemDrive", "windir", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA",
  "HOMEDRIVE", "HOMEPATH", "USERNAME", "PROGRAMFILES", "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE"
];

export function buildWorkerEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_ALLOW_LIST) {
    const value = base[key];
    if (value !== undefined) env[key] = value;
  }
  env.TERM = "xterm-256color";
  return env;
}

/**
 * Disposable local execution worker.
 *
 * This worker exists so the Phase 6 ExecutionService contract, command policy,
 * session lifecycle and terminal transport can be exercised without Google
 * Cloud E2. It is intentionally a development/local worker: it runs on the
 * Forge host, has no isolation boundary beyond the policy layer, and must not
 * be treated as a substitute for a disposable remote E2 in production. The
 * worker never stores source: the repository is hydrated per session from
 * whatever the caller places in the session directory.
 */
export class LocalExecutionWorker implements ExecutionService {
  readonly provider = "local-disposable";

  private readonly sessions = new Map<string, SessionRecord>();
  private readonly shell: string;
  readonly rootDir: string;
  private readonly maxLogBytes: number;
  private readonly maxOutputChars: number;
  private readonly defaultTimeoutMs: number;
  private readonly maxTimeoutMs: number;
  private readonly maxSessions: number;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: LocalExecutionOptions = {}) {
    this.shell = options.shell ?? DEFAULT_SHELL;
    this.rootDir = path.resolve(options.rootDir ?? path.join(os.tmpdir(), "brilina-forge-worker"));
    this.maxLogBytes = options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES;
    this.maxOutputChars = options.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxTimeoutMs = options.maxTimeoutMs ?? DEFAULT_MAX_TIMEOUT_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.env = buildWorkerEnv(options.env ?? process.env);
  }

  /**
   * Resolves a session directory and refuses to leave the worker root, so a
   * model- or request-supplied identifier cannot escape into an arbitrary path.
   */
  resolveCwd(workspaceId: string, conversationId: string): string {
    const candidate = path.resolve(this.rootDir, sanitizeSegment(workspaceId), sanitizeSegment(conversationId));
    if (candidate !== this.rootDir && !candidate.startsWith(this.rootDir + path.sep)) {
      throw Object.assign(new Error("Terminal session directory is outside the execution root"), { statusCode: 400 });
    }
    return candidate;
  }

  async createSession(input: { conversationId: string; workspaceId: string; userId?: string; cwd?: string }): Promise<TerminalSession> {
    if (this.sessions.size >= this.maxSessions) {
      await this.evictOldest();
    }

    const cwd = input.cwd ? path.resolve(input.cwd) : this.resolveCwd(input.workspaceId, input.conversationId);
    await mkdir(cwd, { recursive: true });

    const record: SessionRecord = {
      session: {
        id: randomUUID(),
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
        userId: input.userId,
        shell: this.shell,
        cwd,
        state: "starting",
        createdAt: Date.now(),
        exitCode: null,
        logBytes: 0
      },
      child: null,
      exited: Promise.resolve(),
      log: [],
      listeners: new Set(),
      buffer: Buffer.alloc(0),
      pendingCommand: null
    };

    this.sessions.set(record.session.id, record);
    try {
      const child = spawn(this.shell, this.shellArgs(), {
        cwd,
        env: this.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
      record.child = child;
      record.session.state = "running";
      this.append(record, "system", `session ${record.session.id} started with ${this.shell} in ${cwd}`);

      child.stdout.on("data", chunk => this.append(record, "stdout", String(chunk)));
      child.stderr.on("data", chunk => this.append(record, "stderr", String(chunk)));

      // The worker is a managed resource: the Forge process owns its lifetime
      // and kills sessions on shutdown, so a live session must not keep the
      // event loop alive on its own.
      child.unref();
      unrefStream(child.stdout);
      unrefStream(child.stderr);
      unrefStream(child.stdin);

      record.exited = this.trackExit(record, child);
      void record.exited;
    } catch (error) {
      record.session.state = "failed";
      this.append(record, "system", `session could not start: ${error instanceof Error ? error.message : String(error)}`);
    }

    return { ...record.session };
  }

  private async trackExit(record: SessionRecord, child: ChildProcessWithoutNullStreams): Promise<void> {
    child.on("error", error => {
      this.append(record, "system", `session error: ${error.message}`);
      record.session.state = "failed";
    });

    await new Promise<void>(resolve => {
      child.on("exit", code => {
        record.session.exitCode = code;
        if (record.session.state !== "killed") record.session.state = "exited";
        this.append(record, "system", `session exited with code ${code ?? "unknown"}`);
        resolve();
      });
    });
  }

  private async evictOldest(): Promise<void> {
    const oldest = [...this.sessions.values()].sort((a, b) => a.session.createdAt - b.session.createdAt)[0];
    if (!oldest) return;
    await this.kill(oldest.session.id);
    this.sessions.delete(oldest.session.id);
  }

  /**
   * Terminates every session owned by this worker and waits for the worker
   * processes to exit. Callers must invoke this on process shutdown so no
   * worker process outlives the Forge control plane.
   */
  async dispose(): Promise<void> {
    const records = [...this.sessions.values()];
    for (const id of this.sessions.keys()) await this.kill(id);
    await Promise.race([
      Promise.allSettled(records.map(record => record.exited)),
      new Promise<void>(resolve => { setTimeout(resolve, 5000).unref?.(); })
    ]);
    this.sessions.clear();
  }

  private shellArgs(): string[] {
    if (process.platform === "win32") {
      return ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"];
    }
    return ["-i"];
  }

  private append(record: SessionRecord, stream: TerminalLogEntry["stream"], chunk: string): void {
    const entry: TerminalLogEntry = { sessionId: record.session.id, stream, chunk, at: Date.now() };
    record.log.push(entry);
    record.session.logBytes += chunk.length;
    while (record.session.logBytes > this.maxLogBytes && record.log.length > 1) {
      const dropped = record.log.shift();
      record.session.logBytes -= dropped?.chunk.length ?? 0;
    }
    for (const listener of record.listeners) listener(entry);
  }

  async listSessions(workspaceId: string, conversationId?: string): Promise<TerminalSession[]> {
    return [...this.sessions.values()]
      .filter(record => record.session.workspaceId === workspaceId)
      .filter(record => !conversationId || record.session.conversationId === conversationId)
      .map(record => ({ ...record.session }));
  }

  async getSession(id: string): Promise<TerminalSession | undefined> {
    const record = this.sessions.get(id);
    return record ? { ...record.session } : undefined;
  }

  async exec(input: { sessionId: string; command: string; timeoutMs?: number }): Promise<ExecResult> {
    const record = this.sessions.get(input.sessionId);
    if (!record) throw Object.assign(new Error("Terminal session not found"), { statusCode: 404 });
    if (!record.child || record.child.exitCode !== null || record.session.state !== "running") {
      throw Object.assign(new Error("Terminal session is not running"), { statusCode: 409 });
    }
    if (record.pendingCommand) {
      throw Object.assign(new Error("A command is already running in this terminal session"), { statusCode: 409 });
    }

    const decision = classifyCommand(input.command);
    if (decision.classification === "blocked") {
      throw Object.assign(new Error("Command blocked by execution policy: " + decision.reason), { statusCode: 403 });
    }

    const timeoutMs = Math.min(input.timeoutMs ?? this.defaultTimeoutMs, this.maxTimeoutMs);
    const startedAt = Date.now();
    const child = record.child;
    const sentinel = `__forge_exec_${randomUUID().replace(/-/g, "")}__`;

    const result = await new Promise<ExecResult>((resolve, reject) => {
      let captured = "";
      let settled = false;
      let markerSeen = false;
      let drainTimer: NodeJS.Timeout | null = null;

      const finish = (outcome: { exitCode: number | null; truncated: boolean }) => {
        if (settled) return;
        settled = true;
        record.listeners.delete(listener);
        clearPending();
        if (drainTimer) clearTimeout(drainTimer);
        const stripped = stripSentinels(captured, sentinel);
        resolve({
          sessionId: record.session.id,
          command: decision.normalized,
          classification: decision.classification,
          exitCode: outcome.exitCode,
          output: stripped.text.length > this.maxOutputChars ? stripped.text.slice(0, this.maxOutputChars) : stripped.text,
          durationMs: Date.now() - startedAt,
          truncated: outcome.truncated || stripped.truncated
        });
      };

      const fail = (error: Error & { statusCode?: number }) => {
        if (settled) return;
        settled = true;
        record.listeners.delete(listener);
        clearPending();
        if (drainTimer) clearTimeout(drainTimer);
        reject(error);
      };

      // A shell may flush buffered output after the completion marker, so the
      // marker starts a short quiet period instead of resolving immediately.
      const armDrain = (exitCode: number | null) => {
        markerSeen = true;
        if (drainTimer) clearTimeout(drainTimer);
        drainTimer = setTimeout(() => finish({ exitCode, truncated: false }), DRAIN_QUIET_MS);
        drainTimer.unref?.();
      };

      const listener = (entry: TerminalLogEntry) => {
        captured += entry.chunk;
        if (captured.length > this.maxOutputChars) {
          finish({ exitCode: null, truncated: true });
          return;
        }
        if (!markerSeen && captured.includes(sentinel)) {
          armDrain(record.session.exitCode ?? 0);
          return;
        }
        if (markerSeen && drainTimer) {
          if (drainTimer) clearTimeout(drainTimer);
          armDrain(record.session.exitCode ?? 0);
        }
      };

      const timer = setTimeout(() => finish({ exitCode: null, truncated: true }), timeoutMs);

      record.pendingCommand = {
        startedAt,
        command: decision.normalized,
        classification: decision.classification,
        timer
      };

      const clearPending = () => {
        if (record.pendingCommand?.timer === timer) {
          clearTimeout(timer);
          record.pendingCommand = null;
        }
      };

      child.on("exit", () => finish({ exitCode: record.session.exitCode, truncated: false }));
      record.listeners.add(listener);

      child.stdin?.on("error", error => fail(Object.assign(new Error("Terminal input failed: " + error.message), { statusCode: 500 })));

      try {
        child.stdin?.write(`${decision.normalized}; echo ${sentinel}\n`);
      } catch (error) {
        fail(Object.assign(new Error("Terminal input failed: " + (error instanceof Error ? error.message : String(error))), { statusCode: 500 }));
      }
    });

    return result;
  }

  /**
 * Writes raw input to a session's shell. Callers must not expose this to a
 * model or an untrusted client: it deliberately bypasses command classification,
 * so it is reserved for interactive input typed by the session owner.
 */
async write(sessionId: string, input: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record?.child || record.session.state !== "running") {
      throw Object.assign(new Error("Terminal session is not running"), { statusCode: 409 });
    }
    if (CONTROL_INPUT.test(input)) {
      throw Object.assign(new Error("Terminal input must not contain escape sequences"), { statusCode: 400 });
    }
    record.child.stdin.write(input);
  }

  async read(sessionId: string, options: { since?: number; limit?: number } = {}): Promise<TerminalLogEntry[]> {
    const record = this.sessions.get(sessionId);
    if (!record) throw Object.assign(new Error("Terminal session not found"), { statusCode: 404 });
    const since = options.since ?? 0;
    const filtered = record.log.filter(entry => entry.at >= since);
    const limit = options.limit ?? 1000;
    return filtered.slice(Math.max(0, filtered.length - limit));
  }

  async kill(sessionId: string): Promise<TerminalSession | undefined> {
    const record = this.sessions.get(sessionId);
    if (!record) return undefined;
    if (record.child && record.child.exitCode === null) {
      record.session.state = "killed";
      record.child.kill("SIGTERM");
      const escalation = setTimeout(() => {
        if (record.child && record.child.exitCode === null) record.child.kill("SIGKILL");
      }, 2000);
      escalation.unref?.();
    }
    return { ...record.session };
  }

  subscribe(sessionId: string, listener: (entry: TerminalLogEntry) => void): () => void {
    const record = this.sessions.get(sessionId);
    if (!record) return () => undefined;
    record.listeners.add(listener);
    return () => {
      record.listeners.delete(listener);
    };
  }
}

const CONTROL_INPUT = /\u001b/;

function sanitizeSegment(segment: string): string {
  // Only characters that cannot express a path are preserved, so a crafted
  // identifier cannot introduce a separator, a parent reference or a drive.
  const cleaned = (segment ?? "").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 128);
  return cleaned.length ? cleaned : "_";
}

function unrefStream(stream: NodeJS.ReadableStream | NodeJS.WritableStream | null): void {
  (stream as { unref?: () => void } | null)?.unref?.();
}

/**
 * Removes the completion marker and any echoed input from captured output.
 * `truncated` reports whether the shell produced output after the marker, which
 * means the captured slice was incomplete.
 */
function stripSentinels(text: string, sentinel: string): { text: string; truncated: boolean } {
  const lines = text.split(/\r?\n/);
  const body = (lines[0] ?? "").includes(sentinel) ? lines.slice(1) : lines;
  const joined = body.join("\n");
  const markerIndex = joined.indexOf(sentinel);
  const output = markerIndex === -1 ? joined : joined.slice(0, markerIndex);
  const after = markerIndex === -1 ? "" : joined.slice(markerIndex + sentinel.length);
  return { text: output.trim(), truncated: after.trim().length > 0 };
}