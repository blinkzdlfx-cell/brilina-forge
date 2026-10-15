import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compareBranches,
  createConversation,
  listConversations,
  listConversationMessages,
  listConversationRuns,
  getRunAudit,
  listGithubBranches,
  listGithubRepositories,
  loadSession,
  signOut,
  startGithubSignIn,
  startRun,
  streamRun,
  syncGithubRepository,
  updateConversationContext
} from "./api";
import type { ChatMessage, Conversation, ForgeDiff, ForgeEvent, GithubBranch, GithubRepository, RunAudit, RunStatus, SessionInfo } from "./types";

const demoMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "What are you building today?",
    createdAt: new Date().toISOString()
  }
];

type ToolActivity = { callId: string; toolName: string; status: "requested" | "running" | "completed" | "approval" | "rejected" | "failed"; detail?: string; resultSummary?: { operation?: string; branch?: string; path?: string | null; commitUrl?: string; readBackVerified?: boolean } };
type RunActivity = { runId: string; status: RunStatus; createdAt: string; tools: ToolActivity[]; errorMessage?: string | null; provider?: string | null; model?: string | null };
function summarizeWriteResult(result: unknown): ToolActivity["resultSummary"] {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const value = result as Record<string, unknown>;
  if (value.success !== true || typeof value.commitUrl !== "string") return undefined;
  return {
    ...(typeof value.operation === "string" ? { operation: value.operation } : {}),
    ...(typeof value.branch === "string" ? { branch: value.branch } : {}),
    ...(typeof value.path === "string" || value.path === null ? { path: value.path as string | null } : {}),
    commitUrl: value.commitUrl,
    ...(typeof value.readBackVerified === "boolean" ? { readBackVerified: value.readBackVerified } : {})
  };
}

function activityFromAudit(audit: RunAudit): RunActivity {
  return { runId: audit.id, status: audit.status, createdAt: audit.createdAt, errorMessage: audit.errorMessage, provider: audit.provider, model: audit.model, tools: audit.toolCalls.map(call => ({
    callId: call.id, toolName: call.toolName,
    status: call.status === "authorized" || call.status === "running" ? "running" : call.status === "completed" ? "completed" : call.status === "failed" ? "failed" : call.status === "rejected" ? "rejected" : "requested",
    detail: call.errorMessage ?? undefined,
    resultSummary: summarizeWriteResult(call.result)
  })) };
}

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [streaming, setStreaming] = useState("");
  const [composer, setComposer] = useState("");
  const [running, setRunning] = useState(false);
  const [runActivities, setRunActivities] = useState<RunActivity[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [selectedForgeRepoId, setSelectedForgeRepoId] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [diff, setDiff] = useState<ForgeDiff | null>(null);
  const [diffBase, setDiffBase] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);
  const branchRequestId = useRef(0);
  const diffRequestId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadSession()
      .then(info => {
        if (cancelled) return;
        setSession(info);
      })
      .catch(() => {
        if (!cancelled) setError("Unable to reach the Forge backend.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRepos(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { closeStream.current?.(); }, []);

  useEffect(() => {
    if (!session?.authenticated) {
      setConversations([]);
      setRepositories([]);
      setActive(null);
      setMessages(demoMessages);
      return;
    }

    void Promise.all([listConversations(), listGithubRepositories()])
      .then(([items, repoItems]) => {
        setConversations(items);
        setRepositories(repoItems);
        if (items[0]) setActive(items[0]);
      })
      .catch(err => setError(err instanceof Error ? err.message : "Unable to load Forge workspace data."));
  }, [session?.authenticated]);

  useEffect(() => {
    if (!active) {
      setMessages(demoMessages);
      return;
    }

    let cancelled = false;
    setSelectedForgeRepoId(active.repositoryId);
    setSelectedBranch(active.branchName ?? "");
    const githubRepo = repositories.find(item => item.full_name === active.repositoryFullName);
    setSelectedRepoId(githubRepo?.id ?? null);
    setError(null);

    // A restored conversation must restore its branch choices as well as its selected branch.
    // Otherwise the controlled select has a value but no matching options.
    setBranches([]);
    if (githubRepo) {
      setLoadingBranches(true);
      void listGithubBranches(githubRepo.owner.login, githubRepo.name)
        .then(items => {
          if (!cancelled && requestId === branchRequestId.current) setBranches(items);
        })
        .catch(err => {
          if (!cancelled) {
            setBranches([]);
            setError(err instanceof Error ? err.message : "Unable to load repository branches");
          }
        })
        .finally(() => {
          if (!cancelled && requestId === branchRequestId.current) setLoadingBranches(false);
        });
    } else {
      setLoadingBranches(false);
    }

    void Promise.all([listConversationMessages(active.id), listConversationRuns(active.id)])
      .then(async ([history, runs]) => {
        const audits = await Promise.all(runs.map(run => getRunAudit(run.id).catch(() => null)));
        if (cancelled) return;
        setMessages(history.length ? history : demoMessages);
        setRunActivities(audits.filter((audit): audit is RunAudit => audit !== null).map(activityFromAudit));
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load conversation history and run activity");
      });

    return () => { cancelled = true; };
  }, [active, repositories]);

  const title = useMemo(() => active?.title ?? "New Forge conversation", [active]);
  const selectedGithubRepo = repositories.find(item => item.id === selectedRepoId) ?? null;

  async function loadDiff(base: string, head: string) {
    const requestId = ++diffRequestId.current;
    if (!selectedGithubRepo || !base || !head || base === head) {
      setDiff(null);
      setLoadingDiff(false);
      return;
    }
    setLoadingDiff(true);
    setError(null);
    try {
      const result = await compareBranches(selectedGithubRepo.owner.login, selectedGithubRepo.name, base, head);
      if (requestId === diffRequestId.current) setDiff(result);
    } catch (err) {
      if (requestId === diffRequestId.current) {
        setDiff(null);
        setError(err instanceof Error ? err.message : "Unable to load the branch comparison");
      }
    } finally {
      if (requestId === diffRequestId.current) setLoadingDiff(false);
    }
  }

  async function applyConversationContext(repositoryId: string | null, branchName: string | null) {
    if (!active) return;
    const updated = await updateConversationContext(active.id, { repositoryId, branchName });
    setActive(updated);
    setConversations(items => items.map(item => item.id === updated.id ? updated : item));
  }

  async function handleRepositoryChange(value: string) {
    const requestId = ++branchRequestId.current;
    diffRequestId.current += 1;
    setDiff(null);
    setDiffBase("");
    setLoadingDiff(false);
    const githubId = value ? Number(value) : null;
    setError(null);
    setSelectedRepoId(githubId);
    setBranches([]);
    setSelectedForgeRepoId(null);
    setSelectedBranch("");
    setLoadingBranches(githubId !== null);

    if (githubId === null) {
      setLoadingBranches(false);
      await applyConversationContext(null, null);
      return;
    }

    const repository = repositories.find(item => item.id === githubId);
    if (!repository) return;

    try {
      setLoadingRepos(true);
      const [forgeRepo, branchItems] = await Promise.all([
        syncGithubRepository(repository),
        listGithubBranches(repository.owner.login, repository.name)
      ]);
      if (requestId !== branchRequestId.current) return;
      setSelectedForgeRepoId(forgeRepo.id);
      setBranches(branchItems);
      const defaultBranch = branchItems.some(item => item.name === repository.default_branch)
        ? repository.default_branch
        : branchItems[0]?.name ?? "";
      setSelectedBranch(defaultBranch);
      if (active) await applyConversationContext(forgeRepo.id, defaultBranch || null);
    } catch (err) {
      if (requestId === branchRequestId.current) setError(err instanceof Error ? err.message : "Unable to select repository");
    } finally {
      if (requestId === branchRequestId.current) {
        setLoadingRepos(false);
        setLoadingBranches(false);
      }
    }
  }

  async function handleBranchChange(value: string) {
    diffRequestId.current += 1;
    setDiff(null);
    setLoadingDiff(false);
    setSelectedBranch(value);
    if (!active || !selectedForgeRepoId) return;
    try {
      const updated = await updateConversationContext(active.id, {
        repositoryId: selectedForgeRepoId,
        branchName: value || null
      });
      setActive(updated);
      setConversations(items => items.map(item => item.id === updated.id ? updated : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to select branch");
    }
  }

  async function ensureConversation() {
    if (active) return active;
    const conversation = await createConversation({
      title: "New conversation",
      repositoryId: selectedForgeRepoId ?? undefined,
      branchName: selectedBranch || undefined
    });
    setConversations(items => [conversation, ...items]);
    setActive(conversation);
    return conversation;
  }

  function selectConversation(conversation: Conversation) {
    if (running) return;
    setActive(conversation);
    setMessages(demoMessages);
    setRunActivities([]);
    setStreaming("");
    setError(null);
  }

  function newChat() {
    if (running) return;
    setActive(null);
    setMessages(demoMessages);
    setRunActivities([]);
    setStreaming("");
    setError(null);
  }

  const upsertTool = useCallback((runId: string, callId: string, toolName: string, patch: Partial<ToolActivity>) => {
    setRunActivities(items => {
      const run = items.find(item => item.runId === runId);
      const tools = run?.tools ?? [];
      const existing = tools.find(item => item.callId === callId);
      const nextTools = existing ? tools.map(item => item.callId === callId ? { ...item, ...patch } : item) : [...tools, { callId, toolName, status: "requested" as const, ...patch }];
      if (run) return items.map(item => item.runId === runId ? { ...item, tools: nextTools } : item);
      return [{ runId, status: "running", createdAt: new Date().toISOString(), tools: nextTools }, ...items];
    });
  }, []);

  const handleRunEvent = useCallback((runId: string, event: ForgeEvent) => {
    switch (event.type) {
      case "run.started":
        setRunActivities(items => {
          const run = items.find(item => item.runId === runId);
          if (run) return items.map(item => item.runId === runId ? { ...item, status: "running" } : item);
          return [{ runId, status: "running", createdAt: new Date().toISOString(), tools: [] }, ...items];
        });
        setStreaming("");
        break;
      case "tool.requested": upsertTool(runId, event.callId, event.toolName, { status: "requested" }); break;
      case "tool.started": upsertTool(runId, event.callId, event.toolName, { status: "running" }); break;
      case "tool.completed": upsertTool(runId, event.callId, event.toolName, { status: "completed", resultSummary: event.resultSummary }); break;
      case "approval.required": upsertTool(runId, event.callId, event.toolName, { status: "approval" }); break;
      case "tool.rejected": upsertTool(runId, event.callId, event.toolName, { status: "rejected", detail: event.reason }); break;
      case "assistant.delta":
        setStreaming(value => value + event.content);
        break;
      case "assistant.completed":
        setMessages(items => [
          ...items,
          { id: crypto.randomUUID(), role: "assistant", content: event.content, createdAt: new Date().toISOString() }
        ]);
        setStreaming("");
        break;
      case "run.failed":
        setRunning(false);
        setRunActivities(items => items.map(item => item.runId === runId ? { ...item, status: "failed", errorMessage: event.message } : item));
        setStreaming("");
        setError(event.message);
        closeStream.current?.();
        break;
      case "run.completed":
        setRunning(false);
        setRunActivities(items => items.map(item => item.runId === runId ? { ...item, status: "completed" } : item));
        setStreaming("");
        closeStream.current?.();
        break;
    }
  }, [upsertTool]);

  async function send() {
    const message = composer.trim();
    if (!message || running) return;

    setError(null);
    setComposer("");
    setRunning(true);
    setStreaming("");

    try {
      const conversation = await ensureConversation();
      setMessages(items => [
        ...items.filter(item => item.id !== "welcome"),
        { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() }
      ]);

      const { runId } = await startRun(conversation.id, message);
      setRunActivities(items => [{ runId, status: "queued", createdAt: new Date().toISOString(), tools: [] }, ...items.filter(item => item.runId !== runId)]);
      closeStream.current = streamRun(runId, event => handleRunEvent(runId, event), () => {
        setRunning(false);
        setError("The run event stream disconnected.");
      });
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Run failed");
    }
  }

  if (!loadingRepos && session && !session.authenticated) {
    return (
      <div className="forge-app sign-in">
        <div className="sign-in-card">
          <img src="/brand/brilina-forge-logo.svg" alt="Brilina Forge" />
          <h1>Sign in to Brilina Forge</h1>
          <p>Forge authorizes with GitHub. Your GitHub credentials stay server-side and are encrypted at rest.</p>
          <button className="sign-in-button" onClick={startGithubSignIn}>Continue with GitHub</button>
          {error && <div className="error-banner">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="forge-app">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="brand-row">
          <img src="/brand/brilina-forge-mark.svg" className="brand-mark" alt="Brilina Forge" />
          {!collapsed && <img src="/brand/brilina-forge-logo.svg" className="brand-logo" alt="Brilina Forge" />}
          <button className="icon-button sidebar-toggle" onClick={() => setCollapsed(value => !value)} aria-label="Toggle sidebar">
            {collapsed ? "›" : "‹"}
          </button>
        </div>

        <button className="new-chat" onClick={newChat} disabled={running}>
          <span>＋</span>{!collapsed && "New chat"}
        </button>

        {!collapsed && (
          <>
            <div className="section-label">Conversations</div>
            <div className="conversation-list">
              {conversations.map(item => (
                <button key={item.id} className={`conversation-item ${active?.id === item.id ? "active" : ""}`} onClick={() => selectConversation(item)}>
                  <span>{item.title ?? "Untitled conversation"}</span>
                </button>
              ))}
              {!conversations.length && <div className="empty-list">No conversations yet.</div>}
            </div>
            <div className="sidebar-spacer" />
            <div className="workspace-card">
              <div className="workspace-dot" />
              <div>
                <strong>{session?.githubUser?.login ? session.githubUser.login : "Personal workspace"}</strong>
                <span>GitHub connected</span>
              </div>
              <button className="icon-button sign-out" onClick={() => void signOut()} aria-label="Sign out">⏻</button>
            </div>
          </>
        )}
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="context">
            <strong>{title}</strong>
            <span>{(active?.branchName ?? selectedBranch) || "No branch selected"}</span>
          </div>
<div className="top-actions">
              <label className="context-select">
                <span>Compare base</span>
                <select
                  value={diffBase}
                  onChange={event => setDiffBase(event.target.value)}
                  disabled={!selectedRepoId || loadingBranches || running}
                >
                  <option value="">Select base</option>
                  {branches.map(branch => (
                    <option key={branch.name} value={branch.name}>{branch.name}</option>
                  ))}
                </select>
              </label>
              <button
                className="icon-button diff-button"
                disabled={!diffBase || !selectedBranch || loadingDiff}
                onClick={() => void loadDiff(diffBase, selectedBranch)}
                aria-label="Compare branches"
              >
                ⇄
              </button>
              <label className="context-select">
              <span>Repository</span>
              <select
                value={selectedRepoId ?? ""}
                onChange={event => void handleRepositoryChange(event.target.value)}
                disabled={loadingRepos || running}
              >
                <option value="">{loadingRepos ? "Loading…" : "Select repository"}</option>
                {repositories.map(repository => (
                  <option key={repository.id} value={repository.id}>{repository.full_name}</option>
                ))}
              </select>
            </label>
            <label className="context-select">
              <span>Branch</span>
              <select
                value={selectedBranch}
                onChange={event => void handleBranchChange(event.target.value)}
                disabled={!selectedForgeRepoId || loadingBranches || running}
              >
                <option value="">{loadingBranches ? "Loading branches…" : branches.length ? "Select branch" : "No branches loaded"}</option>
                {branches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>
                ))}
              </select>
            </label>
            {session?.githubUser?.avatar_url
              ? <img className="avatar" src={session.githubUser.avatar_url} alt="" />
              : <button className="avatar" aria-label="Forge workspace">F</button>}
          </div>
        </header>

        <section className="chat">
          <div className="chat-inner">
            <div className="welcome">
              <img src="/brand/brilina-forge-mark.svg" alt="" />
              <h1>Turn ideas into working software.</h1>
              <p>{selectedGithubRepo ? `Working from ${selectedGithubRepo.full_name}.` : "Select a repository and branch, then describe the change."}</p>
            </div>

            <div className="messages">
              {messages.map(message => (
                <article key={message.id} className={`message ${message.role}`}>
                  {message.role === "assistant" && <img src="/brand/brilina-forge-mark.svg" alt="" />}
                  <div className="message-body">
                    <div className="message-role">{message.role === "assistant" ? "Brilina Forge" : "You"}</div>
                    <div className="message-content">{message.content}</div>
                  </div>
                </article>
              ))}

              {runActivities.length > 0 && (
                <section className="run-history" aria-label="Run activity history">
                  <div className="run-history-heading">Run activity</div>
                  {runActivities.map(run => (
                    <details className="tool-activity" key={run.runId} open={run.status === "running" || run.status === "queued"}>
                      <summary className="run-history-summary">
                        <span className={`tool-state ${run.status === "completed" ? "completed" : run.status === "failed" || run.status === "interrupted" ? "failed" : run.status === "running" ? "running" : "requested"}`} />
                        <span>Run · {new Date(run.createdAt).toLocaleString()}</span>{run.provider && run.model && <span className="tool-status">{run.provider} · {run.model}</span>}<span className="tool-status">{run.status}</span>
                      </summary>
                      {run.tools.length === 0 && <div className="diff-empty">No tool activity recorded for this run.</div>}
                      {run.tools.map(item => <div className="tool-activity-row" key={item.callId}>
                        <span className={`tool-state ${item.status}`} /><span>{item.toolName}</span>
                        <span className="tool-status">{item.status === "approval" ? "Approval required" : item.detail ?? item.status}</span>
                        {item.resultSummary && <span className="tool-result-summary">
                          {item.resultSummary.operation && <span>{item.resultSummary.operation}</span>}
                          {item.resultSummary.path && <code>{item.resultSummary.path}</code>}
                          {item.resultSummary.branch && <span>on {item.resultSummary.branch}</span>}
                          {item.resultSummary.readBackVerified && <span>GitHub read-back verified</span>}
                          {item.resultSummary.commitUrl && <a href={item.resultSummary.commitUrl} target="_blank" rel="noreferrer">View commit</a>}
                        </span>}
                      </div>)}
                      {run.errorMessage && <div className="approval-note">{run.errorMessage}</div>}
                    </details>
                  ))}
                </section>
              )}

              {streaming && (
                <article className="message assistant">
                  <img src="/brand/brilina-forge-mark.svg" alt="" />
                  <div className="message-body">
                    <div className="message-role">Brilina Forge</div>
                    <div className="message-content streaming">{streaming}</div>
                  </div>
                </article>
              )}
            </div>

{diff && (
              <div className="diff-panel">
                <div className="diff-panel-title">
                  {diffBase} → {selectedBranch} · {diff.ahead_by} ahead, {diff.behind_by} behind · {diff.total_commits} commits
                </div>
                {diff.files.length === 0 && <div className="diff-empty">No file differences between these refs.</div>}
                {diff.files.map(file => (
                  <details className="diff-file" key={file.filename}>
                    <summary>
                      <span className={`diff-status ${file.status}`} />
                      <span>{file.filename}</span>
                      <span className="diff-counts">+{file.additions} −{file.deletions}</span>
                    </summary>
                    {file.patch
                      ? <pre className="diff-patch">{file.patch}</pre>
                      : <div className="diff-empty">GitHub did not return a patch for this file.</div>}
                  </details>
                ))}
              </div>
            )}

{error && <div className="error-banner">{error}</div>}

            <div className="composer-wrap">
              <textarea
                value={composer}
                onChange={event => setComposer(event.target.value)}
                onKeyDown={event => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder="Ask Forge to inspect, plan, or change your code…"
                rows={3}
                disabled={running}
              />
               <div className="composer-footer">
                 <button className="send-button" disabled={!composer.trim() || running} onClick={() => void send()}>
                   {running ? "Running…" : "Send"}
                 </button>
               </div>
            </div>

            <p className="disclaimer">Forge can make mistakes. Review proposed changes before implementation.</p>
          </div>
        </section>
      </main>
    </div>
  );
}