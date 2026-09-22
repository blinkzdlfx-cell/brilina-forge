import { useEffect, useMemo, useState } from "react";
import { createConversation, listConversations, startRun, streamRun } from "./api";
import type { ChatMessage, Conversation, ForgeEvent } from "./types";

const demoMessages: ChatMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    content: "What are you building today?",
    createdAt: new Date().toISOString()
  }
];

export function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [composer, setComposer] = useState("");
  const [running, setRunning] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listConversations()
      .then(items => {
        setConversations(items);
        if (items[0]) setActive(items[0]);
      })
      .catch(() => setError("Sign in with GitHub to use Forge."));
  }, []);

  const title = useMemo(() => active?.title ?? "New Forge conversation", [active]);

  async function ensureConversation() {
    if (active) return active;
    const conversation = await createConversation({ title: "New conversation" });
    setConversations(items => [conversation, ...items]);
    setActive(conversation);
    return conversation;
  }

  async function send() {
    const message = composer.trim();
    if (!message || running) return;

    setError(null);
    setComposer("");
    const conversation = await ensureConversation();

    setMessages(items => [
      ...items,
      { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() }
    ]);
    setRunning(true);

    try {
      const { runId } = await startRun(conversation.id, message);
      const close = streamRun(runId, (event: ForgeEvent) => {
        if (event.type === "run.started") setToolActivity("Thinking…");
        if (event.type === "tool.requested" || event.type === "tool.started") setToolActivity(`Working with ${event.toolName}`);
        if (event.type === "tool.completed") setToolActivity(`Completed ${event.toolName}`);
        if (event.type === "assistant.completed") {
          setMessages(items => [
            ...items,
            { id: crypto.randomUUID(), role: "assistant", content: event.content, createdAt: new Date().toISOString() }
          ]);
        }
        if (event.type === "run.completed" || event.type === "run.failed") {
          setRunning(false);
          setToolActivity(null);
          close();
        }
      }, () => {
        setRunning(false);
        setToolActivity(null);
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

        <button className="new-chat" onClick={() => { setActive(null); setMessages(demoMessages); }}>
          <span>＋</span>{!collapsed && "New chat"}
        </button>

        {!collapsed && (
          <>
            <div className="section-label">Conversations</div>
            <div className="conversation-list">
              {conversations.map(item => (
                <button key={item.id} className={`conversation-item ${active?.id === item.id ? "active" : ""}`} onClick={() => setActive(item)}>
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
            <span>{active?.branchName ?? "No repository selected"}</span>
          </div>
          <div className="top-actions">
            <button className="ghost-button">Repository</button>
            <button className="avatar">F</button>
          </div>
        </header>

        <section className="chat">
          <div className="chat-inner">
            <div className="welcome">
              <img src="/brand/brilina-forge-mark.svg" alt="" />
              <h1>Turn ideas into working software.</h1>
              <p>Describe the change. Forge will work from your repository context.</p>
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
              {toolActivity && <div className="run-status"><span className="pulse" />{toolActivity}</div>}
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
