import { useCallback, useEffect, useRef, useState } from "react";
import { createTerminalSession, killTerminalSession, openTerminalSocket, type TerminalSocketEvent } from "./api";
import type { TerminalSession } from "./types";

const MAX_LINES = 500;

export function TerminalPanel({ conversationId, disabled }: { conversationId: string | null; disabled: boolean }) {
  const [session, setSession] = useState<TerminalSession | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeSocket = useRef<(() => void) | null>(null);

  const append = useCallback((chunk: string) => {
    setLines(current => {
      const next = [...current];
      for (const line of chunk.split(/\r?\n/)) {
        if (line.length) next.push(line);
      }
      return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
    });
  }, []);

  const teardown = useCallback(() => {
    closeSocket.current?.();
    closeSocket.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    teardown();
    setSession(null);
    setLines([]);
    setError(null);
  }, [conversationId, teardown]);

  const onEvent = useCallback((event: TerminalSocketEvent) => {
    if (event.type === "output") append(event.chunk);
    else if (event.type === "session.ready") setSession(current => current ? { ...current, state: event.state } : current);
    else if (event.type === "error") setError(event.error);
  }, [append]);

  async function start() {
    if (!conversationId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const created = await createTerminalSession(conversationId);
      setSession(created);
      closeSocket.current = openTerminalSocket(created.id, onEvent, () => {
        setError("The terminal connection closed.");
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open a terminal session");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    teardown();
    if (session) {
      await killTerminalSession(session.id).catch(() => undefined);
      setSession(null);
    }
  }

  async function run() {
    const value = command.trim();
    if (!value || !session) return;
    setCommand("");
    setError(null);
    append(`> ${value}`);
    try {
      const response = await fetch(`/api/terminal/sessions/${session.id}/exec`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: value })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        setError(body.error ?? "The command was rejected");
        return;
      }
      const result = await response.json() as { output: string; truncated: boolean };
      if (result.output) append(result.output);
      if (result.truncated) append("[output truncated]");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The command failed");
    }
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="terminal-title">Terminal</span>
        {session
          ? <span className="terminal-state">{session.state} · {session.shell}</span>
          : <span className="terminal-state">no session</span>}
        <span className="terminal-actions">
          {session
            ? <button className="icon-button" onClick={() => void stop()} aria-label="Close terminal session">✕</button>
            : <button className="icon-button" onClick={() => void start()} disabled={!conversationId || busy} aria-label="Open terminal session">▶</button>}
        </span>
      </div>

      <div className="terminal-output" onClick={() => undefined}>
        {lines.length === 0 && <div className="terminal-empty">Disposable worker output appears here. Sessions hold no source of record.</div>}
        {lines.map((line, index) => <div className="terminal-line" key={index}>{line}</div>)}
      </div>

      {error && <div className="terminal-error">{error}</div>}

      <div className="terminal-input">
        <input
          value={command}
          onChange={event => setCommand(event.target.value)}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void run();
            }
          }}
          placeholder={session ? "npm test" : "Open a session to run commands"}
          disabled={!session || disabled}
        />
        <button className="send-button" onClick={() => void run()} disabled={!session || !command.trim() || disabled}>Run</button>
      </div>
    </div>
  );
}