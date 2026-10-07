export type TerminalSessionState = "starting" | "running" | "exited" | "failed" | "killed";
export type TerminalCommandClass = "safe" | "approval-required" | "blocked";

export type TerminalSession = {
  id: string;
  conversationId: string;
  workspaceId: string;
  userId?: string;
  shell: string;
  cwd: string;
  state: TerminalSessionState;
  createdAt: number;
  exitCode: number | null;
  logBytes: number;
};

export type TerminalLogEntry = {
  sessionId: string;
  stream: "stdout" | "stderr" | "system";
  chunk: string;
  at: number;
};

export type CommandDecision = {
  classification: TerminalCommandClass;
  reason: string;
  normalized: string;
};

export type ExecResult = {
  sessionId: string;
  command: string;
  classification: TerminalCommandClass;
  exitCode: number | null;
  output: string;
  durationMs: number;
  truncated: boolean;
};

export type ExecutionService = {
  readonly provider: string;
  createSession(input: { conversationId: string; workspaceId: string; userId?: string; cwd?: string }): Promise<TerminalSession>;
  listSessions(workspaceId: string, conversationId?: string): Promise<TerminalSession[]>;
  getSession(id: string): Promise<TerminalSession | undefined>;
  exec(input: { sessionId: string; command: string; timeoutMs?: number }): Promise<ExecResult>;
  write(sessionId: string, input: string): Promise<void>;
  read(sessionId: string, options?: { since?: number; limit?: number }): Promise<TerminalLogEntry[]>;
  kill(sessionId: string): Promise<TerminalSession | undefined>;
  subscribe(sessionId: string, listener: (entry: TerminalLogEntry) => void): () => void;
};