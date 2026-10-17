import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  compareBranches,
  getGithubToolSettings,
  saveGithubToolSettings,
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
import type { ChatMessage, Conversation, ForgeDiff, ForgeEvent, GithubBranch, GithubRepository, RunAudit, RunStatus, SessionInfo, GithubToolCategory, GithubToolDefinition, GithubToolPreferences } from "./types";
import { SelectField } from "./components/ui/SelectField";
import { Button } from "./components/ui/button";
import { Dialog } from "./components/ui/dialog";
import { GitBranch, GitCompare, LogIn, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, Settings, Settings2, X } from "lucide-react";

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
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.localStorage.getItem("brilina-forge:sidebar-collapsed") === "true"; }
    catch { return false; }
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [loadingConversation, setLoadingConversation] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [diff, setDiff] = useState<ForgeDiff | null>(null);
  const [diffBase, setDiffBase] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [toolSettingsOpen, setToolSettingsOpen] = useState(false);
  const [toolSettingsLoading, setToolSettingsLoading] = useState(false);
  const [toolSettingsSaving, setToolSettingsSaving] = useState(false);
  const [toolSettingsError, setToolSettingsError] = useState<string | null>(null);
  const [toolDefinitions, setToolDefinitions] = useState<GithubToolDefinition[]>([]);
  const [toolPreferences, setToolPreferences] = useState<GithubToolPreferences | null>(null);
  const [savedToolPreferences, setSavedToolPreferences] = useState<GithubToolPreferences | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeStream = useRef<(() => void) | null>(null);
  const branchRequestId = useRef(0);
  const diffRequestId = useRef(0);
  const chatScrollRef = useRef<HTMLElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement | null>(null);
  const shouldStickToBottomRef = useRef(true);

  const openToolSettings = async () => {
    setToolSettingsOpen(true);
    setToolSettingsLoading(true);
    setToolSettingsError(null);
    try {
      const result = await getGithubToolSettings();
      setToolDefinitions(result.definitions);
      setToolPreferences({ enabledToolNames: [...result.preferences.enabledToolNames], enabledCategories: [...result.preferences.enabledCategories] });
      setSavedToolPreferences({ enabledToolNames: [...result.preferences.enabledToolNames], enabledCategories: [...result.preferences.enabledCategories] });
    } catch (settingsError) {
      setToolSettingsError(settingsError instanceof Error ? settingsError.message : "Unable to load GitHub tool settings.");
    } finally {
      setToolSettingsLoading(false);
    }
  };

  const updateToolCategory = (category: GithubToolCategory, enabled: boolean) => {
    setToolPreferences(current => {
      if (!current) return current;
      const categoryNames = toolDefinitions.filter(tool => tool.category === category && tool.defaultEnabled).map(tool => tool.name);
      return {
        enabledToolNames: [...new Set(enabled ? [...current.enabledToolNames, ...categoryNames] : current.enabledToolNames.filter(name => !categoryNames.includes(name)))],
        enabledCategories: [...new Set(enabled ? [...current.enabledCategories, category] : current.enabledCategories.filter(item => item !== category))]
      };
    });
  };

  const updateToolEnabled = (name: string, category: GithubToolCategory, enabled: boolean) => {
    setToolPreferences(current => {
      if (!current) return current;
      return {
        enabledToolNames: enabled ? [...new Set([...current.enabledToolNames, name])] : current.enabledToolNames.filter(item => item !== name),
        enabledCategories: enabled ? [...new Set([...current.enabledCategories, category])] : current.enabledCategories
      };
    });
  };

  const persistToolSettings = async () => {
    if (!toolPreferences) return;
    setToolSettingsSaving(true);
    setToolSettingsError(null);
    try {
      const result = await saveGithubToolSettings(toolPreferences);
      setToolPreferences(result.preferences);
      setSavedToolPreferences({ enabledToolNames: [...result.preferences.enabledToolNames], enabledCategories: [...result.preferences.enabledCategories] });
    } catch (settingsError) {
      setToolSettingsError(settingsError instanceof Error ? settingsError.message : "Unable to save GitHub tool settings.");
    } finally {
      setToolSettingsSaving(false);
    }
  };

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
        if (!cancelled) setSessionLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session?.authenticated) return;
    if (window.location.pathname === "/login") window.location.replace("/");
    try {
      const pendingDraft = window.sessionStorage.getItem("brilina-forge:pending-message");
      if (pendingDraft) {
        setComposer(current => current || pendingDraft);
        window.sessionStorage.removeItem("brilina-forge:pending-message");
      }
    } catch { /* session storage may be unavailable */ }
  }, [session?.authenticated]);

  useEffect(() => () => { closeStream.current?.(); }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileSidebarOpen(false);
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    try { window.localStorage.setItem("brilina-forge:sidebar-collapsed", String(collapsed)); } catch { /* storage may be unavailable */ }
  }, [collapsed, isMobile]);

  useEffect(() => {
    if (!active?.id) return;
    try { window.localStorage.setItem("brilina-forge:last-conversation", active.id); } catch { /* storage may be unavailable */ }
  }, [active?.id]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    sidebarToggleRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const sidebar = document.getElementById("forge-sidebar");
      const focusable = sidebar?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (window.matchMedia("(max-width: 760px)").matches) mobileMenuButtonRef.current?.focus();
    };
  }, [mobileSidebarOpen]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [composer]);

  useEffect(() => {
    if (!session?.authenticated) {
      setConversations([]);
      setRepositories([]);
      setActive(null);
      setMessages(demoMessages);
      setLoadingRepos(false);
      return;
    }

    setLoadingRepos(true);
    void Promise.all([listConversations(), listGithubRepositories()])
      .then(([items, repoItems]) => {
        setConversations(items);
        setRepositories(repoItems);
        let lastConversationId: string | null = null;
        try { lastConversationId = window.localStorage.getItem("brilina-forge:last-conversation"); } catch { /* storage may be unavailable */ }
        if (lastConversationId === "__new__") {
          setActive(null);
        } else {
          setActive(items.find(item => item.id === lastConversationId) ?? items[0] ?? null);
        }
      })
      .catch(err => setError(err instanceof Error ? err.message : "Unable to load Forge workspace data."))
      .finally(() => setLoadingRepos(false));
  }, [session?.authenticated]);

  useEffect(() => {
    if (!active) {
      setLoadingConversation(false);
      setMessages(demoMessages);
      return;
    }

    let cancelled = false;
    setLoadingConversation(true);
    const requestId = ++branchRequestId.current;
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
        setMessages(current => current.some(message => message.id !== "welcome")
          ? current
          : history.length ? history : demoMessages);
        setRunActivities(current => current.length
          ? current
          : audits.filter((audit): audit is RunAudit => audit !== null).map(activityFromAudit));
        setLoadingConversation(false);
      })
      .catch(err => {
        if (!cancelled) {
          setLoadingConversation(false);
          setError(err instanceof Error ? err.message : "Unable to load conversation history and run activity");
        }
      });

    return () => { cancelled = true; };
  }, [active, repositories]);

  const title = useMemo(() => active?.title ?? "New Forge conversation", [active]);
  // Render persisted messages and run activity in one chronological transcript.
  // Run activity uses its persisted run creation timestamp, so it appears between
  // the user's prompt and the assistant's later response instead of after all messages.
  const timeline = useMemo(() => [
    ...messages.filter(message => message.id !== "welcome").map(message => ({
      kind: "message" as const,
      timestamp: message.createdAt,
      message
    })),
    ...runActivities.map(run => ({
      kind: "run" as const,
      timestamp: run.createdAt,
      run
    }))
  ].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)), [messages, runActivities]);
  const selectedGithubRepo = repositories.find(item => item.id === selectedRepoId) ?? null;
  const sidebarCompact = collapsed && !isMobile;
  const contextPending = sessionLoading || loadingRepos || loadingBranches || Boolean(session?.authenticated && (!selectedRepoId || !selectedForgeRepoId || !selectedBranch));

  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    const element = chatScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, streaming, diff, runActivities]);

  function toggleSidebar() {
    if (isMobile) setMobileSidebarOpen(open => !open);
    else setCollapsed(value => !value);
  }

  function closeMobileSidebar() {
    setMobileSidebarOpen(false);
  }

  function jumpToLatest() {
    shouldStickToBottomRef.current = true;
    setShowJumpToLatest(false);
    const element = chatScrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }

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
    setCompareOpen(false);
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
    if (diffBase === value) setDiffBase("");
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
    setMobileSidebarOpen(false);
    setComposer("");
    shouldStickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setActive(conversation);
    setMessages(demoMessages);
    setRunActivities([]);
    setStreaming("");
    setError(null);
  }

  function newChat() {
    if (running) return;
    setMobileSidebarOpen(false);
    setComposer("");
    shouldStickToBottomRef.current = true;
    setShowJumpToLatest(false);
    try { window.localStorage.setItem("brilina-forge:last-conversation", "__new__"); } catch { /* storage may be unavailable */ }
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
    if (!session?.authenticated) {
      try { window.sessionStorage.setItem("brilina-forge:pending-message", message); } catch { /* storage may be unavailable */ }
      window.location.assign("/login");
      return;
    }
    if (contextPending) {
      setError("Wait for the selected repository and working branch to finish loading before sending.");
      return;
    }

    setError(null);
    shouldStickToBottomRef.current = true;
    setShowJumpToLatest(false);
    setComposer("");
    setRunning(true);
    setStreaming("");

    let requestStage: "creating conversation" | "starting the run" = "creating conversation";
    try {
      const conversation = await ensureConversation();
      setMessages(items => [
        ...items.filter(item => item.id !== "welcome"),
        { id: crypto.randomUUID(), role: "user", content: message, createdAt: new Date().toISOString() }
      ]);

      requestStage = "starting the run";
      const { runId } = await startRun(conversation.id, message);
      setRunActivities(items => [{ runId, status: "queued", createdAt: new Date().toISOString(), tools: [] }, ...items.filter(item => item.runId !== runId)]);
      closeStream.current = streamRun(runId, event => handleRunEvent(runId, event), () => {
        setRunning(false);
        setError("The run event stream disconnected. The run may still be processing; check the conversation activity before retrying.");
      });
    } catch (err) {
      setRunning(false);
      setComposer(message);
      const detail = err instanceof Error ? err.message : "Unknown request error";
      setError(detail === "Failed to fetch"
        ? `Could not reach the Forge backend while ${requestStage}. No HTTP response was received; check the connection and Worker request logs.`
        : detail);
    }
  }

  if (sessionLoading || (window.location.pathname === "/login" && session?.authenticated)) {
    return (
      <div className="forge-app boot-state" role="status" aria-live="polite">
        <img src="/brand/brilina-forge-mark.svg" alt="" />
        <strong>Loading Brilina Forge</strong>
        <span>Checking your GitHub session…</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="forge-app sign-in">
        <div className="sign-in-card">
          <img src="/brand/brilina-forge-logo.svg" alt="Brilina Forge" />
          <h1>Forge is temporarily unavailable</h1>
          <p>{error ?? "Unable to connect to the Forge backend."}</p>
          <button className="sign-in-button" onClick={() => window.location.reload()}>Retry connection</button>
        </div>
      </div>
    );
  }

  if (!session.authenticated && window.location.pathname === "/login") {
    return (
      <div className="forge-app sign-in">
        <div className="sign-in-card">
          <img src="/brand/brilina-forge-logo.svg" alt="Brilina Forge" />
          <h1>Sign in to Brilina Forge</h1>
          <p>Continue with GitHub to connect your repositories and access your Forge workspace. Your GitHub credentials stay server-side and are encrypted at rest.</p>
          <button className="sign-in-button" onClick={startGithubSignIn}>Continue with GitHub</button>
          {error && <div className="error-banner">{error}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="forge-app">
      {isMobile && mobileSidebarOpen && (
        <button className="sidebar-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileSidebar} />
      )}
      <aside
        id="forge-sidebar"
        aria-label="Workspace navigation"
        aria-hidden={isMobile && !mobileSidebarOpen}
        className={`sidebar ${sidebarCompact ? "collapsed" : ""} ${isMobile && mobileSidebarOpen ? "mobile-open" : ""}`
      }>
        <div className="brand-row">
          <img src="/brand/brilina-forge-mark.svg" className="brand-mark" alt="Brilina Forge" />
          {!sidebarCompact && <img src="/brand/brilina-forge-logo.svg" className="brand-logo" alt="Brilina Forge" />}
          <button
            ref={sidebarToggleRef}
            className="icon-button sidebar-toggle"
            type="button"
            onClick={toggleSidebar}
            aria-label={isMobile ? "Close sidebar" : sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={isMobile ? mobileSidebarOpen : !sidebarCompact}
            title={isMobile ? "Close sidebar" : sidebarCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isMobile ? <X className="size-4" /> : sidebarCompact ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {session?.authenticated ? (
          <>
            <button className="new-chat" onClick={newChat} disabled={running} aria-label={sidebarCompact ? "New chat" : undefined} title={sidebarCompact ? "New chat" : undefined}>
              <Plus className="size-4" />{!sidebarCompact && "New chat"}
            </button>
            <button className="sidebar-settings" type="button" onClick={() => void openToolSettings()} aria-label={sidebarCompact ? "Settings" : undefined} title={sidebarCompact ? "Settings" : undefined}>
              <Settings className="size-4" />{!sidebarCompact && "Settings"}
            </button>

            {!sidebarCompact && (
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
                  <button className="icon-button sign-out" onClick={() => void signOut()} aria-label="Sign out" title="Sign out"><LogOut className="size-4" /></button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="sidebar-spacer" />
            <a className="sidebar-settings sidebar-login" href="/login" aria-label={sidebarCompact ? "Log in" : undefined} title={sidebarCompact ? "Log in" : undefined}>
              <LogIn className="size-4" />{!sidebarCompact && "Log in"}
            </a>
          </>
        )}
      </aside>

      <main className="main">
        <header className="topbar workspace-topbar">
          <button ref={mobileMenuButtonRef} className="icon-button mobile-menu-button" type="button" onClick={toggleSidebar} aria-label={mobileSidebarOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileSidebarOpen} aria-controls="forge-sidebar" title={mobileSidebarOpen ? "Close navigation" : "Open navigation"}>
            <Menu aria-hidden="true" />
          </button>
          <div className="context">
            <strong>{title}</strong>
            <span>{selectedGithubRepo ? `${selectedGithubRepo.full_name} · ${(active?.branchName ?? selectedBranch) || "No branch"}` : session?.authenticated ? "Select a repository to begin" : "Sign in to connect GitHub"}</span>
          </div>
          <div className="top-actions workspace-top-actions">
            {session?.authenticated ? (
              <>
                <Button variant="outline" size="sm" className="context-panel-trigger" type="button" onClick={() => setContextPanelOpen(true)} disabled={running} aria-haspopup="dialog">
                  <GitBranch aria-hidden="true" />
                  <span className="context-trigger-repo">{selectedGithubRepo?.full_name ?? "Choose repository"}</span>
                  <span className="context-trigger-branch">{selectedBranch || "No branch"}</span>
                  <Settings2 aria-hidden="true" />
                </Button>
                {session.githubUser?.avatar_url ? <img className="avatar" src={session.githubUser.avatar_url} alt="" /> : <button className="avatar" aria-label="Forge workspace">F</button>}
              </>
            ) : isMobile ? (
              <a className="icon-button guest-login-trigger" href="/login" aria-label="Log in" title="Log in"><LogIn aria-hidden="true" /></a>
            ) : null}
          </div>
        </header>
        <Dialog open={toolSettingsOpen} onOpenChange={setToolSettingsOpen} title="Settings" description="Manage which native GitHub tools Forge may offer to the AI. Mandatory server-side security rules cannot be disabled." className="tool-settings-dialog">
          <div className="grid gap-4 p-4 sm:p-5">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              These preferences control tool availability, not GitHub permissions. They can restrict what the AI can call, but cannot bypass repository scope, branch protection, or authorization checks.
            </div>
            {toolSettingsLoading && <p role="status" className="text-sm text-muted-foreground">Loading saved settings…</p>}
            {toolSettingsError && <p role="alert" className="text-sm text-destructive">{toolSettingsError}</p>}
            {!toolSettingsLoading && toolPreferences && (
              <div className="grid gap-4">
                {Array.from(new Set(toolDefinitions.filter(tool => tool.defaultEnabled).map(tool => tool.category))).map(category => {
                  const categoryTools = toolDefinitions.filter(tool => tool.category === category && tool.defaultEnabled);
                  const categoryEnabled = toolPreferences.enabledCategories.includes(category);
                  const label = ({
                    "repository-read": "Repository information",
                    "branch-read": "Branches",
                    "file-read": "Files and source",
                    "diff-review": "Diff and review",
                    "branch-write": "Working branches",
                    "file-write": "File changes"
                  } as Partial<Record<GithubToolCategory, string>>)[category] ?? category;
                  return (
                    <section key={category} className="grid gap-2 rounded-lg border border-border p-3">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input type="checkbox" className="mt-1 size-4 accent-primary" checked={categoryEnabled} onChange={event => updateToolCategory(category, event.target.checked)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">{label}</span>
                          <span className="block text-xs text-muted-foreground">Enable or disable this group of tools.</span>
                        </span>
                      </label>
                      <div className="ml-7 grid gap-3 border-l border-border pl-3">
                        {categoryTools.map(tool => (
                          <label key={tool.name} className="flex cursor-pointer items-start gap-3">
                            <input type="checkbox" className="mt-1 size-4 accent-primary" checked={categoryEnabled && toolPreferences.enabledToolNames.includes(tool.name)} disabled={!categoryEnabled} onChange={event => updateToolEnabled(tool.name, category, event.target.checked)} />
                            <span className="min-w-0 flex-1">
                              <span className="block break-all text-sm font-medium text-foreground">{tool.name}</span>
                              <span className="block text-xs text-muted-foreground">{tool.description}</span>
                              <span className="mt-1 inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{tool.risk === "read" ? "Read-only" : "Writes to repository"}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
              <Button variant="outline" type="button" onClick={() => {
                if (savedToolPreferences) setToolPreferences({ enabledToolNames: [...savedToolPreferences.enabledToolNames], enabledCategories: [...savedToolPreferences.enabledCategories] });
              }} disabled={toolSettingsSaving || toolSettingsLoading || !savedToolPreferences}>Discard changes</Button>
              <Button type="button" onClick={() => void persistToolSettings()} disabled={toolSettingsSaving || toolSettingsLoading || !toolPreferences}>
                {toolSettingsSaving ? "Saving…" : "Save settings"}
              </Button>
            </div>
          </div>
        </Dialog>

        <Dialog open={contextPanelOpen} onOpenChange={setContextPanelOpen} title="Repository & branch" description="Choose the repository and working branch for this conversation." className="context-dialog">
          <div className="context-panel-content">
            <div className="context-panel-section">
              <SelectField id="repository-select" label="Repository" value={selectedRepoId === null ? "" : String(selectedRepoId)} onChange={value => void handleRepositoryChange(value)} placeholder={loadingRepos ? "Loading…" : "Select repository"} disabled={loadingRepos || running} options={repositories.map(repository => ({ value: String(repository.id), label: repository.full_name }))} />
            </div>
            <div className="context-panel-section">
              <SelectField
                id="branch-select" label="Working branch" value={selectedBranch} onChange={value => void handleBranchChange(value)}
                placeholder={loadingBranches ? "Loading branches…" : branches.length ? "Select branch" : "No branches loaded"}
                disabled={!selectedForgeRepoId || loadingBranches || running || branches.length === 0}
                helperText={loadingBranches ? "Loading branches…" : !selectedRepoId ? "Choose a repository first." : !selectedForgeRepoId ? "Connecting repository…" : branches.length === 0 ? "No branches loaded. Check the error message." : `${branches.length} branches available`}
                options={branches.map(branch => ({ value: branch.name, label: `${branch.name}${branch.protected ? " · protected" : ""}` }))}
              />
            </div>
            <div className="context-panel-section context-panel-compare">
              <div className="context-panel-section-heading">
                <div><h3>Compare branches</h3><p>Review actual GitHub changes against another branch.</p></div>
                <Button variant="outline" size="sm" type="button" onClick={() => setCompareOpen(value => !value)} aria-expanded={compareOpen}><GitCompare aria-hidden="true" />{compareOpen ? "Hide" : "Compare"}</Button>
              </div>
              {compareOpen && <div className="context-panel-compare-controls">
                <SelectField id="compare-base" label="Base branch" value={diffBase} onChange={setDiffBase} placeholder="Choose base" disabled={!selectedForgeRepoId || loadingBranches || running || branches.length === 0} options={branches.filter(branch => branch.name !== selectedBranch).map(branch => ({ value: branch.name, label: branch.name }))} />
                <Button type="button" className="context-panel-compare-submit" disabled={!diffBase || !selectedBranch || diffBase === selectedBranch || loadingDiff} onClick={() => { void loadDiff(diffBase, selectedBranch); setContextPanelOpen(false); }}><GitCompare aria-hidden="true" />{loadingDiff ? "Comparing…" : "Compare changes"}</Button>
              </div>}
            </div>
            <p className="context-panel-note">The selected context is used for new runs. Existing run activity remains attached to its original run.</p>
          </div>
        </Dialog>

        <section
          className="chat"
          ref={chatScrollRef}
          onScroll={() => {
            const element = chatScrollRef.current;
            if (element) {
              const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
              const nearBottom = distance < 120;
              shouldStickToBottomRef.current = nearBottom;
              setShowJumpToLatest(!nearBottom);
            }
          }}
        >
          <div className="chat-inner">
            {messages.every(message => message.id === "welcome") && !streaming && runActivities.length === 0 && (
              <div className="welcome">
                <img src="/brand/brilina-forge-mark.svg" alt="" />
                <h1>Turn ideas into working software.</h1>
                <p>{selectedGithubRepo ? `Working from ${selectedGithubRepo.full_name}.` : session?.authenticated ? "Select a repository and branch, then describe the change." : "Sign in to connect GitHub, choose a repository, and start building."}</p>
              </div>
            )}

            {loadingConversation && <div className="conversation-loading" role="status">Loading conversation…</div>}
            <div className="messages">
              {timeline.map(entry => entry.kind === "message" ? (
                <article key={entry.message.id} className={`message ${entry.message.role}`}>
                  {entry.message.role === "assistant" && <img src="/brand/brilina-forge-mark.svg" alt="" />}
                  <div className="message-body">
                    <div className="message-role">{entry.message.role === "assistant" ? "Brilina Forge" : "You"}</div>
                    <div className="message-content">{entry.message.content}</div>
                  </div>
                </article>
              ) : (
                <details className="tool-activity run-history-item" key={entry.run.runId} aria-label="Run activity" open={entry.run.status === "running" || entry.run.status === "queued"}>
                  <summary className="run-history-summary">
                    <span className={`tool-state ${entry.run.status === "completed" ? "completed" : entry.run.status === "failed" || entry.run.status === "interrupted" ? "failed" : entry.run.status === "running" ? "running" : "requested"}`} />
                    <span>Run activity · {new Date(entry.run.createdAt).toLocaleString()}</span>{entry.run.provider && entry.run.model && <span className="tool-status">{entry.run.provider} · {entry.run.model}</span>}<span className="tool-status">{entry.run.status}</span>
                  </summary>
                  {entry.run.tools.length === 0 && <div className="diff-empty">No tool activity recorded for this run.</div>}
                  {entry.run.tools.map(item => <div className="tool-activity-row" key={item.callId}>
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
                  {entry.run.errorMessage && <div className="approval-note">{entry.run.errorMessage}</div>}
                </details>
              ))}

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
                  <span>{diffBase} → {selectedBranch} · {diff.ahead_by} ahead, {diff.behind_by} behind · {diff.total_commits} commits</span>
                  <button className="icon-button diff-close-button" type="button" onClick={() => setDiff(null)} aria-label="Close comparison results" title="Close comparison results">
                    <X className="size-4" aria-hidden="true" />
                  </button>
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

            <div className="scroll-anchor" />
          </div>
          {showJumpToLatest && (
            <button className="jump-to-latest" type="button" onClick={jumpToLatest}>
              ↓ Jump to latest
            </button>
          )}
        </section>

        <footer className="composer-dock">
          <div className="composer-shell">
            {error && <div className="error-banner composer-error" role="alert">{error}</div>}
            <div className="composer-wrap">
              <textarea
                ref={composerRef}
                value={composer}
                onChange={event => setComposer(event.target.value)}
                onKeyDown={event => {
                  // On phones, Enter is the keyboard's newline key. Only desktop
                  // uses Enter to send; Shift+Enter remains a desktop newline.
                  if (!isMobile && event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={!session?.authenticated ? "Message Brilina Forge…" : contextPending ? (!selectedRepoId ? "Select a repository above to begin…" : "Preparing repository context…") : "Message Brilina Forge…"}
                rows={1}
                disabled={running || Boolean(session?.authenticated && contextPending)}
                aria-label="Message Brilina Forge"
              />
              <div className="composer-footer">
                <span className="composer-status">
                  {!session?.authenticated
                    ? "Sign in with GitHub to send your message."
                    : contextPending
                      ? (!selectedRepoId ? "Select a repository and working branch to start." : "Preparing repository context…")
                      : isMobile ? "Enter for a new line" : "Enter to send · Shift + Enter for a new line"}
                </span>
                <button
                  className="send-button icon-send-button"
                  type="button"
                  aria-label={running ? "Forge is working" : "Send message"}
                  title={running ? "Forge is working" : "Send message"}
                  disabled={!composer.trim() || running || contextPending}
                  onClick={() => void send()}
                >
                  {running ? (
                    <svg className="send-spinner" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="36 18" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 19V5M6.5 10.5 12 5l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            <p className="disclaimer">{session?.authenticated ? "Forge can make mistakes. Review proposed changes before implementation." : "Sign in to start a conversation. Forge can make mistakes; review proposed changes before implementation."}</p>
          </div>
        </footer>
      </main>
    </div>
  );
}