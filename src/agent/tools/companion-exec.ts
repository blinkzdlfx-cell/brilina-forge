import type { ForgeTool } from "../types.js";

export type CompanionExecOptions = {
  deviceId: string;
  workerUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

type WorkItem = {
  id: string;
  command: string;
  classification: "safe" | "approval-required";
};

type WorkResult = { exitCode: number | null; output: string; truncated: boolean; error?: string };

/**
 * Dispatches a command to the user's machine through the companion. The tool
 * enqueues the work, waits for the result, and returns it. Light commands run
 * automatically; risky commands are classified as `approval-required` so the
 * controller asks the user first.
 */
export function createCompanionExecTool(options: CompanionExecOptions): ForgeTool<{ command: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 120_000;

  return {
    name: "terminal.exec",
    description: "Run one shell command on the user's machine through the local companion.",
    inputSchema: {
      type: "object",
      required: ["command"],
      properties: { command: { type: "string", minLength: 1, maxLength: 12000 } }, additionalProperties: false
    },
    policy: "approval-required",
    async authorize(context, args) {
      return context.principal.workspaceId.length > 0 && typeof args.command === "string" && args.command.length > 0;
    },
    async execute(context, args) {
      const response = await fetchImpl(
        `${options.workerUrl}/api/companion/${encodeURIComponent(options.deviceId)}/work`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: context.runId,
            conversationId: context.runId,
            command: args.command,
            timeoutMs
          })
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? "Companion is not available");
      }

      const item = (await response.json()) as WorkItem | null;
      if (!item) throw new Error("Companion rejected the command");

      const result = await new Promise<WorkResult>(resolve => {
        const timer = setTimeout(() => resolve({ exitCode: null, output: "", truncated: false, error: "command timed out" }), timeoutMs);
        timer.unref?.();

        const poll = async () => {
          const status = await fetchImpl(
            `${options.workerUrl}/api/companion/${encodeURIComponent(options.deviceId)}/work/${encodeURIComponent(item.id)}`,
            { method: "GET" }
          );
          if (!status.ok) { setTimeout(poll, 500); return; }
          const body = await status.json() as {
            pending?: boolean;
            status?: string;
            exitCode?: number | null;
            output?: string;
            truncated?: boolean;
            errorMessage?: string;
          };
          if (body.pending) { setTimeout(poll, 500); return; }
          clearTimeout(timer);
          resolve({
            exitCode: body.exitCode ?? null,
            output: body.output ?? "",
            truncated: Boolean(body.truncated),
            error: body.errorMessage
          });
        };
        void poll();
      });

      return {
        command: item.command,
        classification: item.classification,
        exitCode: result.exitCode,
        output: result.output.slice(0, 8000),
        truncated: result.truncated,
        error: result.error
      };
    }
  };
}