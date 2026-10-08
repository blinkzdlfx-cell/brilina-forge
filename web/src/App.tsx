import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compareBranches,
  createConversation,
  listConversations,
  listConversationMessages,
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
import type { ChatMessage, Conversation, ForgeDiff, ForgeEvent, GithubBranch, GithubRepository, SessionInfo } from "./types";

const demoMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "What are you building today?",
    createdAt: new Date().toISOString()
  }
];

type ToolActivity = {
  callId: string;
  toolName: string;
  status: "requested" | "running" | "completed" | "approval" | "rejected";
  detail?: string;
};

export function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [streaming, setStreaming] = useState("");
  const [composer, setComposer] = useState("");
  const [running, setRunning] = useState(false);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [selectedForgeRepoId, setSelectedForgeRepoId] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [diff, setDiff] = useState<ForgeDiff | null>(null);
  const [diffBase, setDiffBase] = useState("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);

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

    setSelectedForgeRepoId(active.repositoryId);
    setSelectedBranch(active.branchName ?? "");
    const githubRepo = repositories.find(item => item.full_name === active.repositoryFullName);
    setSelectedRepoId(githubRepo?.id ?? null);
    setError(null);

    void listConversationMessages(active.id)
      .then(history => setMessages(history.length ? history : demoMessages))
      .catch(err => setError(err instanceof Error ? err.message : "Unable to load conversation history"));
  }, [active, repositories]);

  const title = useMemo(() => active?.title ?? "New Forge conversation", [active]);
  const selectedGithubRepo = repositories.find(item => item.id === selectedRepoId) ?? null;

  async function loadDiff(base: string, head: string) {
    if (!selectedGithubRepo || !base || !head) {
      setDiff(null);
      return;
    }
    setLoadingDiff(true);
    try {
      setDiff(await compareBranches(selectedGithubRepo.owner.login, selectedGithubRepo.name, base, head));
    } catch (err) {
      setDiff(null);
      setError(err instanceof Error ? err.message : "Unable to load the branch comparison");
    } finally {
      setLoadingDiff(false);
    }
  }

  async function applyConversationContext(repositoryId: string | null, branchName: string | null) {
    if (!active) return;
    const updated = await updateConversationContext(active.id, { repositoryId, branchName });
    setActive(updated);
    setConversations(items => items.map(item => item.id === updated.id ? updated : item));
  }

  async function handleRepositoryChange(value: string) {
    const githubId = value ? Number(value) : null;
    setError(null);
    setSelectedRepoId(githubId);
    setBranches([]);
    setSelectedForgeRepoId(null);
    setSelectedBranch("");

    if (githubId === null) {
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
      setSelectedForgeRepoId(forgeRepo.id);
      setBranches(branchItems);
      const defaultBranch = branchItems.some(item => item.name === repository.default_branch)
        ? repository.default_branch
        : branchItems[0]?.name ?? "";
      setSelectedBranch(defaultBranch);
      if (active) await applyConversationContext(forgeRepo.id, defaultBranch || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to select repository");
    } finally {
      setLoadingRepos(false);
    }
  }

  async function handleBranchChange(value: string) {
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
    setToolActivities([]);
    setStreaming("");
    setError(null);
  }

  function newChat() {
    if (running) return;
    setActive(null);
    setMessages(demoMessages);
    setToolActivities([]);
    setStreaming("");
    setError(null);
  }

  const upsertTool = useCallback((callId: string, toolName: string, patch: Partial<ToolActivity>) => {
    setToolActivities(items => {
      const existing = items.find(item => item.callId === callId);
      if (existing) return items.map(item => item.callId === callId ? { ...item, ...patch } : item);
      return [...items, { callId, toolName, status: "requested", ...patch }];
    });
  }, []);

  const handleRunEvent = useCallback((event: ForgeEvent) => {
    switch (event.type) {
      case "run.started":
        setToolActivities([]);
        setStreaming("");
        break;
      case "tool.requested":
        upsertTool(event.callId, event.toolName, { status: "requested" });
        break;
      case "tool.started":
        upsertTool(event.callId, event.toolName, { status: "running" });
        break;
      case "tool.completed":
        upsertTool(event.callId, event.toolName, { status: "completed" });
        break;
      case "approval.required":
        upsertTool(event.callId, event.toolName, { status: "approval" });
        break;
      case "tool.rejected":
        upsertTool(event.callId, event.toolName, { status: "rejected", detail: event.reason });
        break;
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
        setStreaming("");
        setError(event.message);
        closeStream.current?.();
        break;
      case "run.completed":
        setRunning(false);
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
    setToolActivities([]);

    try {
      const conversation = await ensureConversation();
      setMessages(items => [
        ...items.filter(item => item.id !== "welcome"),
        { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() }
      ]);

      const { runId } = await startRun(conversation.id, message);
      closeStream.current = streamRun(runId, handleRunEvent, () => {
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
                  disabled={!selectedForgeRepoId || running}
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
                disabled={!selectedForgeRepoId || running}
              >
                <option value="">Select branch</option>
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

              {toolActivities.length > 0 && (
                <div className="tool-activity">
                  <div className="tool-activity-title">Run activity</div>
                  {toolActivities.map(item => (
                    <div className="tool-activity-row" key={item.callId}>
                      <span className={`tool-state ${item.status}`} />
                      <span>{item.toolName}</span>
                      <span className="tool-status">
                        {item.status === "requested" && "Requested"}
                        {item.status === "running" && "Running"}
                        {item.status === "completed" && "Completed"}
                        {item.status === "approval" && "Approval required"}
                        {item.status === "rejected" && (item.detail ?? "Rejected")}
                      </span>
                    </div>
                  ))}
                  {toolActivities.some(item => item.status === "approval") && (
                    <div className="approval-note">
                      This action requires human approval. Interactive approval/resume is reserved for a later controller iteration.
                    </div>
                  )}
                </div>
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