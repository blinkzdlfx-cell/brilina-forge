import { createHash } from "node:crypto";
import { configureRuntimeEnv, config } from "../src/config.js";
import {
  createGithubAuthorization,
  exchangeGithubCode,
  refreshGithubAccessToken,
  OAUTH_STATE_COOKIE,
  verifyStateBinding,
  verifierFromStateCookie
} from "../src/auth/github.js";
import {
  configureSessionStore,
  createSession,
  deleteSession,
  getSession,
  parseSessionCookie,
  updateSessionCredentials,
  type Session
} from "../src/auth/session.js";
import {
  createNeonSessionStore,
  linkGithubIdentityToSession,
  listGithubConnectionsForUser,
  switchActiveGithubConnection,
  getGithubConnectionForUser,
  updateGithubConnectionCredentialsForUser
} from "../src/db/repositories.js";
import {
  createGithubAppInstallationState,
  consumeGithubAppInstallationState,
  verifyGithubAppInstallationCallback,
  listGithubAppInstallationsForUser,
  listGithubAppRepositoriesForUser,
  getGithubAppInstallationForUser,
  processGithubAppWebhook,
  saveGithubAppInstallation
} from "../src/db/github-app-repositories.js";
import {
  getGithubAppInstallation,
  createGithubInstallationToken,
  listGithubInstallationRepositories,
  verifyGithubAppWebhookSignature
} from "../src/github/app.js";
import { GithubApiError, GithubClient } from "../src/github/client.js";
import { GithubService } from "../src/github/service.js";
import {
  addConversationMessage,
  createConversation,
  getConversationForUser,
  getForgeUserContext,
  getOwnedRunConversation,
  listConversationMessages,
  listConversations,
  syncRepository,
  updateConversationContext,
  userOwnsRun
} from "../src/db/conversation-repositories.js";
import { getRunAudit, listRunsForConversation } from "../src/db/audit-repositories.js";
import { getRunContextSnapshot, neonAgentAuditStore } from "../src/db/agent-repositories.js";
import { recordUsage } from "../src/db/usage-repositories.js";
import { AgentController } from "../src/agent/controller.js";
import { ToolRegistry } from "../src/agent/registry.js";
import { listGithubToolDefinitions, type GithubToolCategory } from "../src/agent/tool-catalog.js";
import { getGithubToolPreferences, saveGithubToolPreferences } from "../src/db/github-tool-preferences.js";
import { createGithubReadTools } from "../src/agent/tools/github-read-context.js";
import { createCompanionExecTool } from "../src/agent/tools/companion-exec.js";
import { createProviderRuntime } from "../src/ai/factory.js";
import { ProviderAgentModel } from "../src/ai/provider-model.js";
import { wrapWithCooldownRetry } from "../src/ai/retry-model.js";
import { AiProviderError } from "../src/ai/types.js";
import { Phase4DeterministicModel } from "../src/phase4/model.js";
import { getSql } from "../src/db/client.js";
import {
  createCompanionWork,
  completeCompanionWork,
  getCompanionWork,
  listPendingCompanionWork,
  timeoutStaleCompanionWork
} from "../src/db/companion-repositories.js";
import { classifyCommand } from "../src/execution/command-policy.js";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const DELTA_CHUNK_SIZE = 80;
const MAX_RUN_MESSAGE_LENGTH = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

type Env = Record<string, unknown>;

export function initializeWorker(env: Env): void {
  const runtimeEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") runtimeEnv[key] = value;
  }
  configureRuntimeEnv(runtimeEnv);
  configureSessionStore(createNeonSessionStore());
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...(headers ?? {}) }
  });
}

function safeAuthErrorDetails(error: unknown): Record<string, string> {
  const value = error && typeof error === "object"
    ? error as { name?: unknown; message?: unknown; code?: unknown; constraint?: unknown; table?: unknown; column?: unknown }
    : {};
  const field = (input: unknown, max = 300): string | undefined =>
    typeof input === "string" && input.length ? input.slice(0, max) : undefined;
  return {
    ...(field(value.name) ? { errorName: field(value.name)! } : {}),
    ...(field(value.message) ? { errorMessage: field(value.message)! } : {}),
    ...(field(value.code, 80) ? { databaseCode: field(value.code, 80)! } : {}),
    ...(field(value.constraint, 160) ? { databaseConstraint: field(value.constraint, 160)! } : {}),
    ...(field(value.table, 160) ? { databaseTable: field(value.table, 160)! } : {}),
    ...(field(value.column, 160) ? { databaseColumn: field(value.column, 160)! } : {})
  };
}

function errorResponse(error: unknown): Response {
  if (error instanceof GithubApiError) {
    return json({ error: "github_api_error", message: error.message }, error.status || 502);
  }
  if (error instanceof Error && typeof (error as Error & { statusCode?: number }).statusCode === "number") {
    const status = (error as Error & { statusCode: number }).statusCode;
    return json({ error: status >= 500 ? "internal_error" : "request_error", message: status >= 500 ? "Internal server error" : error.message }, status);
  }
  console.error(error);
  return json({ error: "internal_error", message: "Internal server error" }, 500);
}

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const prefix = name + "=";
  const pair = header.split(";").map(v => v.trim()).find(v => v.startsWith(prefix));
  return pair?.slice(prefix.length);
}

function cookie(name: string, value: string, maxAge: number, sameSite: "Strict" | "Lax"): string {
  const secure = config.cookieSecure ? " Secure;" : "";
  return `${name}=${value}; HttpOnly; Path=/; SameSite=${sameSite}; Max-Age=${maxAge};${secure}`;
}

function sessionCookie(id: string): string {
  return cookie("brilina_session", id, 86400, "Strict");
}

function clearCookie(name: string): string {
  return `${name}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0;`;
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (!origin) return;
  if (origin !== config.publicBaseUrl && origin !== config.callbackOrigin) {
    throw Object.assign(new Error("Cross-origin request rejected"), { statusCode: 403 });
  }
}

function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  return value;
}

function assertSafeBranchName(value: string): string {
  if (!BRANCH_NAME_PATTERN.test(value) || value.includes("..")) {
    throw Object.assign(new Error("Invalid branch name"), { statusCode: 400 });
  }
  return value;
}

function assertSafeTitle(value: string): string {
  if (value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw Object.assign(new Error("Invalid conversation title"), { statusCode: 400 });
  }
  return value;
}

function chunkResponse(response: string): string[] {
  const chunks = response.match(new RegExp(`.{1,${DELTA_CHUNK_SIZE}}(?:\\s+|$)`, "g")) ?? [];
  return chunks.length ? chunks : [response];
}

async function sessionForRequest(request: Request): Promise<Session> {
  const id = parseSessionCookie(request.headers.get("Cookie"), "brilina_session");
  const session = await getSession(id);
  if (!session) throw Object.assign(new Error("GitHub authentication required"), { statusCode: 401 });

  if (session.expiresAt && session.expiresAt - Date.now() <= TOKEN_REFRESH_SKEW_MS) {
    if (!session.refreshToken || (session.refreshTokenExpiresAt && session.refreshTokenExpiresAt <= Date.now())) {
      await deleteSession(id);
      throw Object.assign(new Error("GitHub authorization expired; sign in again"), { statusCode: 401 });
    }
    try {
      const refreshed = await refreshGithubAccessToken(session.refreshToken);
      await updateSessionCredentials(id as string, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? session.refreshToken,
        expiresAt: refreshed.expiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? session.refreshTokenExpiresAt
      });
    } catch {
      await deleteSession(id);
      throw Object.assign(new Error("GitHub authorization expired; sign in again"), { statusCode: 401 });
    }
  }

  const current = await getSession(id);
  if (!current) throw Object.assign(new Error("GitHub authentication required"), { statusCode: 401 });
  return current;
}

async function forgeContext(request: Request) {
  const session = await sessionForRequest(request);
  if (!session.forgeUserId) throw Object.assign(new Error("Forge identity is unavailable; sign in again"), { statusCode: 401 });
  return { session, ...(await getForgeUserContext(session.forgeUserId)) };
}

async function githubService(request: Request): Promise<GithubService> {
  const session = await sessionForRequest(request);
  return new GithubService(new GithubClient(session.accessToken));
}

async function githubServiceForRun(
  request: Request,
  userId: string,
  context: { githubConnectionId: string | null; installationRecordId: string | null; contextType: "oauth" | "installation" | null },
  repositoryFullName: string | null
): Promise<GithubService> {
  if (context.contextType === "installation") {
    if (!context.installationRecordId) throw Object.assign(new Error("Run has no installation snapshot"), { statusCode: 403 });
    const installation = await getGithubAppInstallationForUser(userId, context.installationRecordId);
    if (!installation) throw Object.assign(new Error("The selected GitHub App installation is no longer authorized"), { statusCode: 403 });
    const authorizedRepositories = await listGithubAppRepositoriesForUser(userId, context.installationRecordId);
    if (!repositoryFullName || !authorizedRepositories.some(repository => repository.fullName.toLowerCase() === repositoryFullName.toLowerCase())) {
      throw Object.assign(new Error("The repository captured by this run is no longer authorized by the selected installation"), { statusCode: 403 });
    }
    return new GithubService(new GithubClient(await createGithubInstallationToken(installation.installationId)));
  }
  if (context.contextType === "oauth" && context.githubConnectionId) {
    let connection = await getGithubConnectionForUser(userId, context.githubConnectionId);
    if (!connection) throw Object.assign(new Error("The GitHub connection captured by this run is no longer available"), { statusCode: 403 });
    if (connection.expiresAt && connection.expiresAt - Date.now() <= TOKEN_REFRESH_SKEW_MS) {
      if (!connection.refreshToken || (connection.refreshTokenExpiresAt && connection.refreshTokenExpiresAt <= Date.now())) {
        throw Object.assign(new Error("The GitHub connection captured by this run has expired; reconnect that account"), { statusCode: 401 });
      }
      const refreshed = await refreshGithubAccessToken(connection.refreshToken);
      await updateGithubConnectionCredentialsForUser(userId, connection.id, {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? connection.refreshToken,
        expiresAt: refreshed.expiresAt,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? connection.refreshTokenExpiresAt
      });
      connection = await getGithubConnectionForUser(userId, context.githubConnectionId);
      if (!connection) throw Object.assign(new Error("Could not reload the GitHub connection captured by this run"), { statusCode: 401 });
    }
    return new GithubService(new GithubClient(connection.accessToken));
  }
  // Chat-only runs with no repository snapshot cannot authorize repository tools;
  // this fallback only allows the controller to return a normal no-context response.
  return githubService(request);
}

function publicRunFailure(error: unknown): string {
  if (error instanceof AiProviderError) return `The AI provider request failed (${error.details.kind}).`;

  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const providerStatus = /AI provider request failed with status \d+ \((authentication|rate_limited|overloaded|timeout|invalid_request|server_error|transport)\)/i.exec(message);
  if (providerStatus) return `The AI provider request failed (${providerStatus[1].toLowerCase()}).`;
  if (/AI provider request exceeded \d+ms/i.test(message)) return "The AI provider request timed out.";
  const githubStatus = /GitHub (?:REST|GraphQL) request failed(?: with status (\d+))?/i.exec(message);
  if (githubStatus) {
    return githubStatus[1]
      ? `GitHub rejected the request (HTTP ${githubStatus[1]}). Check repository permissions and branch access.`
      : "The GitHub API request failed. Check repository access and try again.";
  }
  if (/^(?:Tool is blocked by policy|Tool authorization denied|Human approval is required)(?:: [a-z0-9_.-]+)?$/i.test(message) ||
      /^Unknown tool: [a-z0-9_.-]+$/i.test(message) ||
      /^Invalid or duplicate tool call id$/i.test(message) ||
      /^Missing required tool argument: [a-zA-Z0-9_]+$/i.test(message) ||
      /^(?:Tool arguments must be an object|Invalid type for tool argument|Unexpected tool argument|Tool argument is not an allowed value|Tool argument is below its minimum(?: length)?|Tool argument exceeds its maximum(?: length)?|Tool argument has too few items|Tool argument has too many items|Agent step limit exceeded)$/i.test(message)) {
    return message;
  }
  return "The agent run failed. The underlying error was recorded in the run audit.";
}

type RunEvent = { type: string; [key: string]: unknown };

function sseLine(event: RunEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

async function runStatus(runId: string): Promise<string | undefined> {
  const rows = await getSql().query("SELECT status FROM runs WHERE id = $1 LIMIT 1", [runId]) as Record<string, unknown>[];
  return rows[0] ? String(rows[0].status) : undefined;
}

async function claimRun(runId: string): Promise<boolean> {
  const rows = await getSql().query(
    "UPDATE runs SET status = 'running', started_at = COALESCE(started_at, now()) WHERE id = $1 AND status = 'queued' RETURNING id",
    [runId]
  ) as Record<string, unknown>[];
  return Boolean(rows[0]);
}

async function executeRun(
  request: Request,
  runId: string,
  conversationId: string,
  userId: string,
  workspaceId: string,
  sessionId: string,
  githubConnectionId: string | null,
  installationRecordId: string | null,
  contextType: "oauth" | "installation" | null,
  repositoryFullName: string | null,
  branchName: string | null,
  message: string,
  emit: (event: RunEvent) => void
): Promise<void> {
  const startedAt = Date.now();
  let retries = 0;

  try {
    const service = await githubServiceForRun(request, userId, { githubConnectionId, installationRecordId, contextType }, repositoryFullName);
    const providerRuntime = createProviderRuntime();
    const registry = new ToolRegistry();
    for (const tool of createGithubReadTools(service)) registry.register(tool);
    const toolPreferences = await getGithubToolPreferences(userId);
    registry.setAvailabilityPreferences({
      enabledNames: new Set(toolPreferences.enabledToolNames),
      enabledCategories: new Set(toolPreferences.enabledCategories)
    });

    const deviceId = deviceForSession(sessionId);
    registry.register(createCompanionExecTool({
      deviceId,
      workerUrl: companionWorkerUrl()
    }));

    const provider = providerRuntime.registry.providerFor(providerRuntime.activeModel);
    const agentModel = provider.id === "deterministic-development"
      ? new Phase4DeterministicModel()
      : new ProviderAgentModel({ provider, model: providerRuntime.activeModel, signal: request.signal });

    await neonAgentAuditStore.updateRunProvider(runId, providerRuntime.activeProviderId, providerRuntime.activeModel);

    const controller = new AgentController(
      wrapWithCooldownRetry(agentModel),
      registry,
      neonAgentAuditStore,
      {
        emit: event => emit(event as RunEvent),
        onRetry: attempt => { retries += 1; console.warn("AI provider retry scheduled", attempt.attempt); }
      },
      { shouldStop: () => request.signal.aborted }
    );

    const persistedMessages = await listConversationMessages(conversationId, userId, workspaceId);
    let historyBudget = 16_000;
    const history = persistedMessages
      .filter(item => item.runId !== runId && (item.role === "user" || item.role === "assistant"))
      .slice(-20)
      .map(item => ({ role: item.role as "user" | "assistant", content: item.content.slice(0, 4_000) }))
      .reverse()
      .filter(item => {
        if (historyBudget <= 0) return false;
        const content = item.content.slice(0, historyBudget);
        historyBudget -= content.length;
        item.content = content;
        return Boolean(content.trim());
      })
      .reverse();

    const result = await controller.run({ runId, conversationId, history, principal: {
        userId,
        workspaceId,
        repositoryFullName: repositoryFullName ?? undefined,
        branchName: branchName ?? undefined
      },
      message
    });

    await recordUsage({
      runId,
      provider: providerRuntime.activeProviderId,
      model: providerRuntime.activeModel,
      usage: agentModel instanceof ProviderAgentModel && agentModel.lastUsage
        ? agentModel.lastUsage
        : { inputTokens: message.length, outputTokens: result.response?.length ?? 0 },
      durationMs: Date.now() - startedAt,
      retryCount: retries,
      status: result.status === "completed" ? "success" : result.status === "cancelled" ? "cancelled" : "failed"
    }).catch(error => console.error("Failed to record AI usage", error));

    if (result.response) {
      for (const chunk of chunkResponse(result.response)) emit({ type: "assistant.delta", content: chunk });
      await addConversationMessage({
        conversationId,
        userId,
        workspaceId,
        runId,
        role: "assistant",
        content: result.response
      });
      emit({ type: "assistant.completed", content: result.response });
    }

    if (result.status === "completed") {
      emit({ type: "run.completed", runId, status: result.status });
    } else if (result.status === "cancelled") {
      emit({ type: "run.failed", runId, message: "Run cancelled" });
    } else {
      emit({ type: "run.failed", runId, message: publicRunFailure(result.errorMessage) });
    }
  } catch (error) {
    console.error("Agent run failed", error);
    await neonAgentAuditStore.updateRun(runId, "failed", publicRunFailure(error));
    emit({ type: "run.failed", runId, message: publicRunFailure(error) });
  }
}

function eventFromTool(tool: { id: string; toolName: string; status: string }): RunEvent[] {
  const callId = tool.id;
  if (tool.status === "requested") return [{ type: "tool.requested", toolName: tool.toolName, callId }];
  if (tool.status === "running") return [
    { type: "tool.requested", toolName: tool.toolName, callId },
    { type: "tool.started", toolName: tool.toolName, callId }
  ];
  if (tool.status === "completed") return [
    { type: "tool.requested", toolName: tool.toolName, callId },
    { type: "tool.started", toolName: tool.toolName, callId },
    { type: "tool.completed", toolName: tool.toolName, callId }
  ];
  if (tool.status === "rejected") return [
    { type: "tool.requested", toolName: tool.toolName, callId },
    { type: "tool.rejected", toolName: tool.toolName, callId, reason: tool.errorMessage ?? "Tool rejected" }
  ];
  return [{ type: "tool.requested", toolName: tool.toolName, callId }];
}

function recordCompanionDecision(deviceId: string, command: string, approved: boolean): { recorded: boolean; command: string; approved: boolean } {
  return { recorded: true, command, approved };
}

// --- Work results ------------------------------------------------------
//
// Durable in Neon, not in-isolate. Cloudflare Workers are short-lived
// isolates: the isolate that receives the companion's result POST is rarely
// the same one the browser polls from, so an in-isolate Map would drop
// results across requests. Commands longer than the Worker request budget
// (~30s) still need async delivery through a Durable Object; this table
// handles the synchronous case.

// --- Device assignment -------------------------------------------------
//
// The browser needs to know which device id to give the companion. One id is
// issued per session; the companion registers against it on first use.

const sessionDevices = new Map<string, string>();

function companionWorkerUrl(): string {
  return config.publicBaseUrl;
}

function deviceForSession(sessionId: string): string {
  let deviceId = sessionDevices.get(sessionId);
  if (!deviceId) {
    deviceId = "device-" + crypto.randomUUID();
    sessionDevices.set(sessionId, deviceId);
  }
  return deviceId;
}

export async function handleApi(request: Request, env: Env): Promise<Response | undefined> {
  initializeWorker(env);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  try {
    if (path === "/health" && method === "GET") {
      return json({ ok: true, service: "brilina-forge", runtime: "cloudflare-worker", phase: "native-worker" });
    }

    if (path === "/auth/github/start" && method === "GET") {
      const intent = url.searchParams.get("intent") === "link" ? "link" : "login";
      if (intent === "link" && !config.githubMultiAccountEnabled) {
        return json({ error: "multi_account_migration_pending", message: "Connecting another GitHub account will be available after the database migration is enabled." }, 503);
      }
      if (intent === "link") await sessionForRequest(request);
      const authorization = createGithubAuthorization();
      const headers = new Headers({
        Location: authorization.url,
        "Set-Cookie": cookie(OAUTH_STATE_COOKIE, authorization.stateCookieValue, 600, "Lax"),
        "Cache-Control": "no-store"
      });
      headers.append("Set-Cookie", intent === "link" ? cookie("brilina_oauth_intent", "link", 600, "Lax") : clearCookie("brilina_oauth_intent"));
      return new Response(null, { status: 302, headers });
    }

    if (path === "/auth/github/callback" && method === "GET") {
      const query = url.searchParams;
      if (query.get("error")) return json({ error: query.get("error"), message: query.get("error_description") }, 400);
      const code = query.get("code");
      const state = query.get("state");
      if (!code || !state) return json({ error: "missing_oauth_parameters" }, 400);

      const boundState = parseCookie(request.headers.get("Cookie"), OAUTH_STATE_COOKIE);
      if (!verifyStateBinding(boundState, state)) {
        return new Response(JSON.stringify({ error: "oauth_state_binding_mismatch" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie(OAUTH_STATE_COOKIE), "Cache-Control": "no-store" }
        });
      }
      const verifier = verifierFromStateCookie(boundState);
      if (!verifier) return json({ error: "oauth_verifier_missing" }, 400);

      let authStage = "github_code_exchange";
      try {
        const result = await exchangeGithubCode(code, state, verifier);
        authStage = "session_persistence";
        const intent = parseCookie(request.headers.get("Cookie"), "brilina_oauth_intent");
        const credentials = {
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
          refreshTokenExpiresAt: result.refreshTokenExpiresAt
        };
        let session: Session | undefined;
        let redirect = "/";
        if (intent === "link") {
          authStage = "github_identity_link";
          const existingToken = parseCookie(request.headers.get("Cookie"), "brilina_session");
          if (!existingToken) throw Object.assign(new Error("Sign in before linking another GitHub account"), { statusCode: 401 });
          session = await linkGithubIdentityToSession(existingToken, result.accessToken, result.user, credentials);
          if (!session) throw new Error("Could not restore the Forge session after linking GitHub");
          redirect = "/?github_account=linked";
        } else {
          session = await createSession(result.accessToken, result.user, credentials);
        }
        const headers = new Headers({
          Location: new URL(redirect, config.publicBaseUrl).toString(),
          "Cache-Control": "no-store"
        });
        headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
        headers.append("Set-Cookie", clearCookie("brilina_oauth_intent"));
        if (intent !== "link") headers.append("Set-Cookie", sessionCookie(session.id));
        return new Response(null, { status: 302, headers });
      } catch (error) {
        console.error(JSON.stringify({
          event: "github_oauth_callback_failed",
          stage: authStage,
          ...safeAuthErrorDetails(error)
        }));
        return json({ error: "github_auth_failed" }, 401);
      }
    }

    if (path === "/auth/github/logout" && (method === "POST" || method === "GET")) {
      if (method === "POST") assertSameOrigin(request);
      await deleteSession(parseCookie(request.headers.get("Cookie"), "brilina_session"));
      return new Response(JSON.stringify({ authenticated: false }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie("brilina_session"), "Cache-Control": "no-store" }
      });
    }

    // Official GitHub MCP diagnostic/probe endpoints are intentionally not exposed by the production Worker. Forge uses its native, catalogued tools.

    if (path === "/api/settings/github-tools" && method === "GET") {
      const { userId } = await forgeContext(request);
      return json({ definitions: listGithubToolDefinitions(), preferences: await getGithubToolPreferences(userId) });
    }

    if (path === "/api/settings/github-tools" && method === "PUT") {
      assertSameOrigin(request);
      const { userId } = await forgeContext(request);
      const body = await request.json() as { enabledToolNames?: unknown; enabledCategories?: unknown };
      if (!Array.isArray(body.enabledToolNames) || !body.enabledToolNames.every((item): item is string => typeof item === "string") ||
          !Array.isArray(body.enabledCategories) || !body.enabledCategories.every((item): item is string => typeof item === "string")) {
        return json({ error: "invalid_tool_preferences" }, 400);
      }
      const preferences = await saveGithubToolPreferences(userId, {
        enabledToolNames: body.enabledToolNames,
        enabledCategories: body.enabledCategories as GithubToolCategory[]
      });
      return json({ definitions: listGithubToolDefinitions(), preferences });
    }

    if (path === "/api/session" && method === "GET") {
      try {
        const session = await sessionForRequest(request);
        return json({
          authenticated: true,
          forgeUserId: session.forgeUserId,
          githubUser: session.githubUser,
          activeGithubConnectionId: session.githubConnectionId,
          multiAccountEnabled: config.githubMultiAccountEnabled,
          githubAppConfigured: config.githubAppConfigured,
          githubConnections: session.forgeUserId ? await listGithubConnectionsForUser(session.forgeUserId, session.githubConnectionId) : [],
          tokenExpiresAt: session.expiresAt ?? null
        });
      } catch {
        return json({ authenticated: false });
      }
    }

    if (path === "/api/auth/connections" && method === "GET") {
      const { session, userId } = await forgeContext(request);
      return json({ activeConnectionId: session.githubConnectionId ?? null, connections: await listGithubConnectionsForUser(userId, session.githubConnectionId) });
    }

    if (path === "/api/auth/connections/active" && method === "POST") {
      assertSameOrigin(request);
      const { session } = await forgeContext(request);
      const body = await request.json() as { connectionId?: string };
      if (!body.connectionId || !UUID_PATTERN.test(body.connectionId)) return json({ error: "invalid_connection_id" }, 400);
      const updated = await switchActiveGithubConnection(session.id, body.connectionId);
      if (!updated) return json({ error: "session_expired" }, 401);
      return json({ activeConnectionId: updated.githubConnectionId, githubUser: updated.githubUser });
    }

    if (path === "/auth/github-app/install" && method === "GET") {
      const session = await sessionForRequest(request);
      const state = await createGithubAppInstallationState(session);
      const target = new URL(`https://github.com/apps/${config.githubApp.slug()}/installations/new`);
      target.searchParams.set("state", state);
      return new Response(null, { status: 302, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
    }

    if (path === "/auth/github-app/callback" && method === "GET") {
      const sessionToken = parseCookie(request.headers.get("Cookie"), "brilina_session");
      const state = url.searchParams.get("state");
      const installationId = Number(url.searchParams.get("installation_id"));
      const setupAction = url.searchParams.get("setup_action");
      if (!sessionToken || !state || !Number.isSafeInteger(installationId) || installationId <= 0 || !["install", "update"].includes(setupAction ?? "")) {
        return json({ error: "invalid_github_app_callback" }, 400);
      }
      const session = await sessionForRequest(request);
      const verifiedOwner = await verifyGithubAppInstallationCallback({
        state, sessionToken, installationId, setupAction: setupAction as "install" | "update"
      });
      if (!verifiedOwner) {
        return json({
          error: "github_app_installation_not_confirmed",
          message: "GitHub has not yet confirmed this installation for the connected account. Wait a few seconds and refresh this page; if it still fails, restart installation from Forge."
        }, 409);
      }
      const stateOwner = await consumeGithubAppInstallationState(state, sessionToken);
      if (!stateOwner || stateOwner.userId !== session.forgeUserId || stateOwner.authIdentityId !== session.authIdentityId ||
          stateOwner.userId !== verifiedOwner.userId || stateOwner.authIdentityId !== verifiedOwner.authIdentityId) {
        return json({ error: "github_app_state_invalid_or_expired" }, 400);
      }
      const installation = await getGithubAppInstallation(installationId);
      const repositories = await listGithubInstallationRepositories(installationId);
      await saveGithubAppInstallation(stateOwner.userId, stateOwner.authIdentityId, installation, repositories);
      return new Response(null, { status: 302, headers: { Location: new URL("/?github_app=installed", config.publicBaseUrl).toString(), "Cache-Control": "no-store" } });
    }

    if (path === "/api/github-app/installations" && method === "GET") {
      const { userId } = await forgeContext(request);
      return json({ installations: await listGithubAppInstallationsForUser(userId) });
    }

    if (path === "/api/github-app/installations/refresh" && method === "POST") {
      assertSameOrigin(request);
      const { userId } = await forgeContext(request);
      const body = await request.json() as { installationRecordId?: string };
      if (!body.installationRecordId || !UUID_PATTERN.test(body.installationRecordId)) return json({ error: "invalid_installation_id" }, 400);
      const selected = await getGithubAppInstallationForUser(userId, body.installationRecordId);
      if (!selected) return json({ error: "installation_not_authorized" }, 403);
      const installation = await getGithubAppInstallation(selected.installationId);
      const repositories = await listGithubInstallationRepositories(selected.installationId);
      await saveGithubAppInstallation(userId, selected.authIdentityId, installation, repositories);
      return json({ installation: (await listGithubAppInstallationsForUser(userId)).find(item => item.id === body.installationRecordId) ?? null });
    }

    if (path === "/api/github-app/repositories" && method === "GET") {
      const { userId } = await forgeContext(request);
      const installationRecordId = url.searchParams.get("installationId") ?? "";
      if (!UUID_PATTERN.test(installationRecordId)) return json({ error: "invalid_installation_id" }, 400);
      return json({ repositories: await listGithubAppRepositoriesForUser(userId, installationRecordId) });
    }

    if (path === "/api/github-app/branches" && method === "GET") {
      const { userId } = await forgeContext(request);
      const installationRecordId = url.searchParams.get("installationId") ?? "";
      const fullName = url.searchParams.get("repository") ?? "";
      if (!UUID_PATTERN.test(installationRecordId) || !/^[^/]+\/[^/]+$/.test(fullName)) return json({ error: "invalid_installation_repository" }, 400);
      const installation = await getGithubAppInstallationForUser(userId, installationRecordId);
      if (!installation) return json({ error: "installation_not_authorized" }, 403);
      const allowedRepositories = await listGithubAppRepositoriesForUser(userId, installationRecordId);
      if (!allowedRepositories.some(repository => repository.fullName.toLowerCase() === fullName.toLowerCase())) {
        return json({ error: "repository_not_authorized_by_installation" }, 403);
      }
      const service = new GithubService(new GithubClient(await createGithubInstallationToken(installation.installationId)));
      const [owner, name] = fullName.split("/");
      return json(await service.listBranches(owner, name));
    }

    if (path === "/api/github-app/webhook" && method === "POST") {
      const rawBody = await request.text();
      if (!(await verifyGithubAppWebhookSignature(rawBody, request.headers.get("X-Hub-Signature-256")))) {
        return json({ error: "invalid_webhook_signature" }, 401);
      }
      const deliveryId = request.headers.get("X-GitHub-Delivery");
      const eventName = request.headers.get("X-GitHub-Event");
      if (!deliveryId || !eventName) return json({ error: "missing_webhook_headers" }, 400);
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(rawBody) as Record<string, unknown>; }
      catch { return json({ error: "invalid_webhook_json" }, 400); }
      const outcome = await processGithubAppWebhook({
        deliveryId, eventName, action: typeof payload.action === "string" ? payload.action : undefined, payload
      });
      return json({ received: true, outcome });
    }

    if (path === "/api/devices/for-session" && method === "GET") {
      const session = await sessionForRequest(request);
      return json({ deviceId: deviceForSession(session.id) });
    }

    if (path === "/api/devices/status" && method === "GET") {
      const session = await sessionForRequest(request);
      const deviceId = deviceForSession(session.id);
      const device = await getCompanionDevice(deviceId);
      return json({ deviceId, registered: Boolean(device), state: device ? "online" : "offline" });
    }

    if (path === "/api/github/me" && method === "GET") return json(await (await githubService(request)).getAuthenticatedUser());

    const reposMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)(?:\/(rest|context|branches|tree|compare|commits))?$/);
    if (reposMatch && method === "GET") {
      const service = await githubService(request);
      const owner = decodeURIComponent(reposMatch[1]);
      const repo = decodeURIComponent(reposMatch[2]);
      const action = reposMatch[3];

      if (!action) return json(await service.getRepositoryGraphQL(owner, repo));
      if (action === "rest") return json(await service.getRepository(owner, repo));
      if (action === "context") return json(await service.getRepositoryContext(owner, repo));
      if (action === "branches") return json(await service.listBranches(owner, repo));
      if (action === "tree") {
        const ref = url.searchParams.get("ref");
        if (!ref) return json({ error: "missing_ref" }, 400);
        return json(await service.getTree(owner, repo, ref, url.searchParams.get("recursive") !== "false"));
      }
      if (action === "compare") {
        const base = url.searchParams.get("base");
        const head = url.searchParams.get("head");
        if (!base || !head) return json({ error: "missing_compare_refs" }, 400);
        return json(await service.compareBranches(owner, repo, base, head));
      }
      if (action === "commits") {
        const perPage = Number(url.searchParams.get("per_page") ?? 20);
        if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) return json({ error: "invalid_per_page" }, 400);
        return json(await service.listCommits(owner, repo, url.searchParams.get("ref") ?? undefined, perPage));
      }
    }

    const fileMatch = path.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)\/file\/(.+)$/);
    if (fileMatch && method === "GET") {
      return json(await (await githubService(request)).getFile(decodeURIComponent(fileMatch[1]), decodeURIComponent(fileMatch[2]), decodeURIComponent(fileMatch[3]), url.searchParams.get("ref") ?? undefined));
    }

    if (path === "/api/github/repos" && method === "GET") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const perPage = Number(url.searchParams.get("per_page") ?? 100);
      if (!Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) return json({ error: "invalid_pagination" }, 400);
      return json(await (await githubService(request)).listRepositories(page, perPage));
    }

    if (path === "/api/github/repositories/sync" && method === "POST") {
      assertSameOrigin(request);
      const { session, userId, workspaceId } = await forgeContext(request);
      const body = await request.json() as { nodeId?: string; owner?: string; name?: string; fullName?: string; defaultBranch?: string };
      if (!body.nodeId || !body.owner || !body.name || !body.fullName || !body.defaultBranch) return json({ error: "invalid_repository" }, 400);
      const repository = await (await githubService(request)).getRepository(body.owner, body.name);
      if (repository.full_name !== body.fullName) return json({ error: "repository_context_mismatch" }, 409);
      return json(await syncRepository({
        userId, workspaceId, githubConnectionId: session.githubConnectionId ?? "", githubNodeId: body.nodeId, owner: repository.owner.login,
        name: repository.name, fullName: repository.full_name, defaultBranch: repository.default_branch
      }));
    }

    if (path === "/api/conversations" && method === "GET") {
      const { userId, workspaceId } = await forgeContext(request);
      return json(await listConversations(userId, workspaceId));
    }

    if (path === "/api/conversations" && method === "POST") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const body = await request.json() as {
        title?: string; repositoryId?: string; branchName?: string; contextType?: "oauth" | "installation";
        installationRecordId?: string | null; installationRepositoryId?: string | null;
      };
      if (body.title !== undefined) assertSafeTitle(String(body.title));
      if (body.branchName !== undefined && body.branchName !== null) assertSafeBranchName(String(body.branchName).trim());
      if (body.contextType !== undefined && body.contextType !== "oauth" && body.contextType !== "installation") return json({ error: "invalid_context_type" }, 400);
      return json(await createConversation({
        userId, workspaceId, title: body.title, repositoryId: body.repositoryId, branchName: body.branchName,
        contextType: body.contextType, installationRecordId: body.installationRecordId ?? null,
        installationRepositoryId: body.installationRepositoryId ?? null
      }), 201);
    }

    const conversationMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationMatch && method === "PATCH") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const conversationId = assertUuid(conversationMatch[1], "conversation id");
      const body = await request.json() as {
        repositoryId?: string | null; branchName?: string | null; contextType?: "oauth" | "installation";
        installationRecordId?: string | null; installationRepositoryId?: string | null;
      };
      const branchName = body.branchName == null ? null : String(body.branchName).trim();
      if (branchName !== null && (!branchName || branchName.length > 255 || !BRANCH_NAME_PATTERN.test(branchName))) return json({ error: "invalid_branch_name" }, 400);
      if (body.contextType !== undefined && body.contextType !== "oauth" && body.contextType !== "installation") return json({ error: "invalid_context_type" }, 400);
      const result = await updateConversationContext({
        conversationId, userId, workspaceId, repositoryId: body.repositoryId ?? null, branchName,
        contextType: body.contextType, installationRecordId: body.installationRecordId ?? null,
        installationRepositoryId: body.installationRepositoryId ?? null
      });
      if (!result) return json({ error: "conversation_not_found" }, 404);
      return json(result);
    }

    const messagesMatch = path.match(/^\/api\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === "GET") {
      const { userId, workspaceId } = await forgeContext(request);
      return json(await listConversationMessages(assertUuid(messagesMatch[1], "conversation id"), userId, workspaceId));
    }

    const runsForConversationMatch = path.match(/^\/api\/conversations\/([^/]+)\/runs$/);
    if (runsForConversationMatch && method === "GET") {
      const { userId, workspaceId } = await forgeContext(request);
      const conversationId = assertUuid(runsForConversationMatch[1], "conversation id");
      const conversation = await getConversationForUser(conversationId, userId, workspaceId);
      if (!conversation) return json({ error: "conversation_not_found" }, 404);
      return json(await listRunsForConversation(conversationId));
    }

    if (runsForConversationMatch && method === "POST") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const conversationId = assertUuid(runsForConversationMatch[1], "conversation id");
      const body = await request.json() as { message?: string };
      const message = body.message?.trim();
      if (!message) return json({ error: "missing_message" }, 400);
      if (message.length > MAX_RUN_MESSAGE_LENGTH) return json({ error: "message_too_long", maxLength: MAX_RUN_MESSAGE_LENGTH }, 413);

      const conversation = await getConversationForUser(conversationId, userId, workspaceId);
      if (!conversation) return json({ error: "conversation_not_found" }, 404);

      const existing = await getSql().query(
        "SELECT id FROM runs WHERE conversation_id = $1 AND status IN ('queued','running') LIMIT 1",
        [conversationId]
      ) as Record<string, unknown>[];
      if (existing[0]) return json({ error: "run_already_active" }, 409);

      const run = await neonAgentAuditStore.createRun({ conversationId, userId });
      await addConversationMessage({ conversationId, userId, workspaceId, runId: run.id, role: "user", content: message });
      return json({ runId: run.id, status: run.status }, 202);
    }

    const eventsMatch = path.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (eventsMatch && method === "GET") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const runId = assertUuid(eventsMatch[1], "run id");
      if (!(await userOwnsRun(runId, userId, workspaceId))) return json({ error: "run_not_found" }, 404);

      const audit = await getRunAudit(runId, await getOwnedRunConversation(runId, userId, workspaceId) as string);
      if (!audit) return json({ error: "run_not_found" }, 404);
      const runContext = await getRunContextSnapshot(runId, audit.conversationId);
      const claimed = await claimRun(runId);
      const encoder = new TextEncoder();
      const sessionId = parseSessionCookie(request.headers.get("Cookie"), "brilina_session") ?? "";

      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          let closed = false;
          const send = (event: RunEvent) => {
            if (!closed) streamController.enqueue(encoder.encode(sseLine(event)));
          };

          (async () => {
            try {
              send({ type: "run.started", runId });
              if (claimed) {
                await executeRun(
                  request,
                  runId,
                  audit.conversationId,
                  userId,
                  workspaceId,
                  sessionId,
                  runContext?.githubConnectionId ?? null,
                  runContext?.installationRecordId ?? null,
                  runContext?.contextType ?? null,
                  runContext?.repositoryFullName ?? null,
                  runContext?.branchName ?? null,
                  (await listConversationMessages(audit.conversationId, userId, workspaceId)).find(m => m.runId === runId && m.role === "user")?.content ?? "",
                  send
                );
              } else {
                let lastStatus = audit.status;
                while (!closed && !["completed","failed","cancelled","interrupted"].includes(lastStatus)) {
                  if (request.signal.aborted) break;
                  await new Promise(resolve => setTimeout(resolve, 750));
                  const latest = await getRunAudit(runId, audit.conversationId);
                  if (!latest) break;
                  lastStatus = latest.status;
                }
              }

              if (!claimed) {
                const finalAudit = await getRunAudit(runId, audit.conversationId);
                if (finalAudit?.status === "completed") {
                  send({ type: "run.completed", runId, status: finalAudit.status });
                } else if (finalAudit?.status === "cancelled") {
                  send({ type: "run.failed", runId, message: "Run cancelled" });
                } else if (finalAudit && ["failed","interrupted"].includes(finalAudit.status)) {
                  send({ type: "run.failed", runId, message: finalAudit.errorMessage ?? "Run failed" });
                }
              }
            } catch (error) {
              console.error(error);
              send({ type: "run.failed", runId, message: "Run failed" });
            } finally {
              closed = true;
              streamController.close();
            }
          })();
        },
        cancel() { closed = true; }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no"
        }
      });
    }

    const auditMatch = path.match(/^\/api\/runs\/([^/]+)\/audit$/);
    if (auditMatch && method === "GET") {
      const { userId, workspaceId } = await forgeContext(request);
      const runId = assertUuid(auditMatch[1], "run id");
      const conversationId = await getOwnedRunConversation(runId, userId, workspaceId);
      if (!conversationId) return json({ error: "run_not_found" }, 404);
      const audit = await getRunAudit(runId, conversationId);
      if (!audit) return json({ error: "run_not_found" }, 404);
      return json(audit);
    }

    const cancelMatch = path.match(/^\/api\/runs\/([^/]+)\/cancel$/);
    if (cancelMatch && method === "POST") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const runId = assertUuid(cancelMatch[1], "run id");
      const conversationId = await getOwnedRunConversation(runId, userId, workspaceId);
      if (!conversationId) return json({ error: "run_not_found" }, 404);
      const rows = await getSql().query(
        "UPDATE runs SET status = 'cancelled', finished_at = now(), error_message = 'Run cancelled by user' WHERE id = $1 AND status = 'queued' RETURNING id",
        [runId]
      ) as Record<string, unknown>[];
      if (!rows[0]) return json({ error: "run_not_cancellable" }, 409);
      return json({ cancelled: true });
    }

    // --- Companion endpoints --------------------------------------------
    //
    // These are not same-origin browser routes. They are authenticated with
    // the companion device token and are reachable only from localhost, so
    // the origin check is intentionally not applied.

    const companionMatch = path.match(/^\/api\/companion\/([^/]+)(\/.*)?$/);
    if (companionMatch) {
      const deviceId = companionMatch[1];
      const sub = companionMatch[2] ?? "";

      if (sub === "/register" && method === "POST") {
        const { userId, workspaceId } = await forgeContext(request);
        const device = await registerCompanionDevice(deviceId, userId, workspaceId);
        return json(device, 201);
      }

      // The companion long-polls here for pending work. Workers are
      // short-lived isolates, so this polls the durable store in a loop up to
      // 30s rather than holding a waiter in-isolate.
      if (sub === "/work" && method === "GET") {
        const device = await getCompanionDevice(deviceId);
        if (!device) return json({ error: "companion_not_registered" }, 404);
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          const pending = await listPendingCompanionWork(deviceId, 1);
          if (pending[0]) return json({ work: pending[0] });
          await new Promise(resolve => setTimeout(resolve, 750));
        }
        return json({ work: null });
      }

      // The browser enqueues a command and gets back the work id to poll.
      if (sub === "/work" && method === "POST") {
        const device = await getCompanionDevice(deviceId);
        if (!device) return json({ error: "companion_not_registered" }, 404);
        const body = await request.json() as { runId?: string; conversationId?: string; command?: string; timeoutMs?: number };
        if (!body.command || !body.runId || !body.conversationId) return json({ error: "missing_work_fields" }, 400);
        const timeoutMs = Number(body.timeoutMs ?? 120_000);
        if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) return json({ error: "invalid_timeout" }, 400);
        const classification = classifyCommand(body.command);
        if (classification.classification === "blocked") return json({ error: "command_blocked" }, 403);
        const item = await createCompanionWork({
          id: "work-" + crypto.randomUUID(),
          deviceId,
          runId: body.runId,
          conversationId: body.conversationId,
          command: classification.normalized,
          timeoutMs
        });
        return json({ id: item.id, command: item.command, classification: classification.classification === "safe" ? "safe" : "approval-required" });
      }

      // The companion posts a work result. The browser polls for it.
      const workIdMatch = sub.match(/^\/work\/([^/]+)$/);
      if (workIdMatch && method === "POST") {
        const device = await getCompanionDevice(deviceId);
        if (!device) return json({ error: "companion_not_registered" }, 404);
        const body = await request.json() as { id?: string; exitCode?: number; output?: string; truncated?: boolean; error?: string };
        if (!body.id) return json({ error: "missing_work_id" }, 400);
        const completed = await completeCompanionWork(body.id, {
          exitCode: body.exitCode ?? null,
          output: body.output ?? "",
          truncated: Boolean(body.truncated),
          errorMessage: body.error
        });
        return json({ acknowledged: Boolean(completed) });
      }

      // The browser polls a work result. Durable across isolates.
      if (workIdMatch && method === "GET") {
        const device = await getCompanionDevice(deviceId);
        if (!device) return json({ error: "companion_not_registered" }, 404);
        const result = await getCompanionWork(workIdMatch[1]);
        if (!result || result.status === "pending") return json({ pending: true });
        return json({
          pending: false,
          status: result.status,
          exitCode: result.exitCode,
          output: result.output,
          truncated: result.truncated,
          errorMessage: result.errorMessage
        });
      }

      if (sub === "/approve" && method === "POST") {
        const device = await getCompanionDevice(deviceId);
        if (!device) return json({ error: "companion_not_registered" }, 404);
        const body = await request.json() as { command?: string; approved?: boolean };
        if (!body.command) return json({ error: "missing_command" }, 400);
        return json(recordCompanionDecision(deviceId, body.command, Boolean(body.approved)));
      }
    }

    if (path === "/api/devices/for-session" && method === "GET") {
      const session = await sessionForRequest(request);
      return json({ deviceId: deviceForSession(session.id) });
    }

    if (path === "/api/devices/status" && method === "GET") {
      const session = await sessionForRequest(request);
      const deviceId = deviceForSession(session.id);
      const device = await getCompanionDevice(deviceId);
      return json({ deviceId, registered: Boolean(device), state: device ? "online" : "offline" });
    }

    return undefined;
  } catch (error) {
    return errorResponse(error);
  }
}
