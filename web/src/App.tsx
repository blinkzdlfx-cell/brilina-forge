import { useEffect, useMemo, useState } from "react";
import {
  createConversation,
  listConversations,
  listConversationMessages,
  listGithubBranches,
  listGithubRepositories,
  startRun,
  streamRun,
  syncGithubRepository,
  updateConversationContext
} from "./api";
import type { ChatMessage, Conversation, ForgeEvent, GithubBranch, GithubRepository } from "./types";

const demoMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "What are you building today?",
    createdAt: new Date().toISOString()
  }
];

type ToolActivity = {
  toolName: string;
  status: "requested" | "running" | "completed" | "approval";
};

export function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [repositories, setRepositories] = useState<GithubRepository[]>([]);
  const [branches, setBranches] = useState<GithubBranch[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [composer, setComposer] = useState("");
  const [running, setRunning] = useState(false);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [selectedForgeRepoId, setSelectedForgeRepoId] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listConversations(), listGithubRepositories()])
      .then(([items, repoItems]) => {
        setConversations(items);
        setRepositories(repoItems);
        if (items[0]) setActive(items[0]);
      })
      .catch(() => setError("Sign in with GitHub to use Forge."))
      .finally(() => setLoadingRepos(false));
  }, []);

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
      setLoadingBranches(true);
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
      setLoadingBranches(false);
    }
  }

  async function handleBranchChange(value: string) {
    setSelectedBranch(value);
    if (active && selectedForgeRepoId) {
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
    setError(null);
  }

  function newChat() {
    if (running) return;
    setActive(null);
    setMessages(demoMessages);
    setToolActivities([]);
    setError(null);
  }

  async function send() {
    const message = composer.trim();
    if (!message || running) return;

    setError(null);
    setComposer("");
    const conversation = await ensureConversation();

    setMessages(items => [
      ...items.filter(item => item.id !== "welcome"),
      { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() }
    ]);
    setRunning(true);
    setToolActivities([]);

    try {
      const { runId } = await startRun(conversation.id, message);
      const close = streamRun(runId, (event: ForgeEvent) => {
        if (event.type === "run.started") setToolActivities([]);
        if (event.type === "tool.requested") {
          setToolActivities(items => [...items.filter(item => item.toolName !== event.toolName), { toolName: event.toolName, status: "requested" }]);
        }
        if (event.type === "tool.started") {
          setToolActivities(items => items.map(item => item.toolName === event.toolName ? { ...item, status: "running" } : item));
        }
        if (event.type === "tool.completed") {
          setToolActivities(items => items.map(item => item.toolName === event.toolName ? { ...item, status: "completed" } : item));
        }
        if (event.type === "approval.required") {
          setToolActivities(items => [...items.filter(item => item.toolName !== event.toolName), { toolName: event.toolName, status: "approval" }]);
        }
        if (event.type === "assistant.completed") {
          setMessages(items => [
            ...items,
            { id: crypto.randomUUID(), role: "assistant", content: event.content, createdAt: new Date().toISOString() }
          ]);
        }
        if (event.type === "run.completed" || event.type === "run.failed") {
          setRunning(false);
          close();
        }
      }, () => {
        setRunning(false);
        setError("The run event stream disconnected.");
      });
    } catch (err) {
      setRunning(false);
      setError(err instanceof Error ? err.message : "Run failed");
    }
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
                <strong>Personal workspace</strong>
                <span>GitHub connected</span>
              </div>
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
                <option value="">{loadingBranches ? "Loading…" : "Select branch"}</option>
                {branches.map(branch => (
                  <option key={branch.name} value={branch.name}>{branch.name}{branch.protected ? " · protected" : ""}</option>
                ))}
              </select>
            </label>
            <button className="avatar" aria-label="Forge workspace">F</button>
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
                    <div className="tool-activity-row" key={item.toolName}>
                      <span className={`tool-state ${item.status}`} />
                      <span>{item.toolName}</span>
                      <span className="tool-status">
                        {item.status === "requested" && "Requested"}
                        {item.status === "running" && "Running"}
                        {item.status === "completed" && "Completed"}
                        {item.status === "approval" && "Approval required"}
                      </span>
                    </div>
                  ))}
                  {toolActivities.some(item => item.status === "approval") && (
                    <div className="approval-note">
                      This action requires human approval. Interactive approval/resume is reserved for the next controller UI iteration.
                    </div>
                  )}
                </div>
              )}
            </div>

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
                <span>Provider-neutral development mode</span>
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
