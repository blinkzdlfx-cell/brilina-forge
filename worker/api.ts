import { configureRuntimeEnv, config } from "../src/config.js";
import {
  createGithubAuthorizationUrl,
  exchangeGithubCode,
  refreshGithubAccessToken,
  OAUTH_STATE_COOKIE,
  verifyStateBinding
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
import { createNeonSessionStore } from "../src/db/repositories.js";
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
import { neonAgentAuditStore } from "../src/db/agent-repositories.js";
import { recordUsage } from "../src/db/usage-repositories.js";
import { AgentController } from "../src/agent/controller.js";
import { ToolRegistry } from "../src/agent/registry.js";
import { createGithubReadTools } from "../src/agent/tools/github-read-context.js";
import { createProviderRuntime } from "../src/ai/factory.js";
import { ProviderAgentModel } from "../src/ai/provider-model.js";
import { wrapWithCooldownRetry } from "../src/ai/retry-model.js";
import { AiProviderError } from "../src/ai/types.js";
import { Phase4DeterministicModel } from "../src/phase4/model.js";
import { getSql } from "../src/db/client.js";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const DELTA_CHUNK_SIZE = 80;
const MAX_RUN_MESSAGE_LENGTH = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

let initialized = false;

type Env = Record<string, unknown>;

export function initializeWorker(env: Env): void {
  const runtimeEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") runtimeEnv[key] = value;
  }
  configureRuntimeEnv(runtimeEnv);
  if (!initialized) {
    configureSessionStore(createNeonSessionStore());
    initialized = true;
  }
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store", ...(headers ?? {}) }
  });
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
  return { session, ...(await getForgeUserContext(session.githubUser.id)) };
}

async function githubService(request: Request): Promise<GithubService> {
  const session = await sessionForRequest(request);
  return new GithubService(new GithubClient(session.accessToken));
}

function publicRunFailure(error: unknown): string {
  if (error instanceof AiProviderError) return `The AI provider request failed (${error.details.kind}).`;
  if (error instanceof Error && /blocked by policy|authorization denied|approval is required|Unknown tool|step limit/i.test(error.message)) {
    return error.message;
  }
  return "The run failed before it produced a response.";
}

type RunEvent = { type: string; [key: string]: unknown };

function sseLine(event: RunEvent): string {
  return `event: ${event.type}\\ndata: ${JSON.stringify(event)}\\n\\n`;
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
  repositoryFullName: string | null,
  branchName: string | null,
  message: string,
  emit: (event: RunEvent) => void
): Promise<void> {
  const startedAt = Date.now();
  let retries = 0;

  try {
    const service = await githubService(request);
    const providerRuntime = createProviderRuntime();
    const registry = new ToolRegistry();
    for (const tool of createGithubReadTools(service)) registry.register(tool);

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

    const result = await controller.run({
      runId,
      conversationId,
      principal: {
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
      emit({ type: "run.failed", runId, message: "Agent run did not complete" });
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
      const authorizationUrl = createGithubAuthorizationUrl();
      const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
      return new Response(null, {
        status: 302,
        headers: {
          Location: authorizationUrl,
          "Set-Cookie": cookie(OAUTH_STATE_COOKIE, state, 600, "Lax"),
          "Cache-Control": "no-store"
        }
      });
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

      try {
        const result = await exchangeGithubCode(code, state);
        const session = await createSession(result.accessToken, result.user, {
          refreshToken: result.refreshToken,
          expiresAt: result.expiresAt,
          refreshTokenExpiresAt: result.refreshTokenExpiresAt
        });
        const headers = new Headers({
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        });
        headers.append("Set-Cookie", clearCookie(OAUTH_STATE_COOKIE));
        headers.append("Set-Cookie", sessionCookie(session.id));
        return new Response(JSON.stringify({
          authenticated: true,
          githubUser: result.user,
          tokenExpiresAt: result.expiresAt ?? null
        }), { headers });
      } catch (error) {
        console.error(error);
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

    if (path === "/api/session" && method === "GET") {
      try {
        const session = await sessionForRequest(request);
        return json({ authenticated: true, githubUser: session.githubUser, tokenExpiresAt: session.expiresAt ?? null });
      } catch {
        return json({ authenticated: false });
      }
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
      const { userId, workspaceId } = await forgeContext(request);
      const body = await request.json() as { nodeId?: string; owner?: string; name?: string; fullName?: string; defaultBranch?: string };
      if (!body.nodeId || !body.owner || !body.name || !body.fullName || !body.defaultBranch) return json({ error: "invalid_repository" }, 400);
      const repository = await (await githubService(request)).getRepository(body.owner, body.name);
      if (repository.full_name !== body.fullName) return json({ error: "repository_context_mismatch" }, 409);
      return json(await syncRepository({
        userId, workspaceId, githubNodeId: body.nodeId, owner: repository.owner.login,
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
      const body = await request.json() as { title?: string; repositoryId?: string; branchName?: string };
      if (body.title !== undefined) assertSafeTitle(String(body.title));
      if (body.branchName !== undefined && body.branchName !== null) assertSafeBranchName(String(body.branchName).trim());
      return json(await createConversation({ userId, workspaceId, title: body.title, repositoryId: body.repositoryId, branchName: body.branchName }), 201);
    }

    const conversationMatch = path.match(/^\/api\/conversations\/([^/]+)$/);
    if (conversationMatch && method === "PATCH") {
      assertSameOrigin(request);
      const { userId, workspaceId } = await forgeContext(request);
      const conversationId = assertUuid(conversationMatch[1], "conversation id");
      const body = await request.json() as { repositoryId?: string | null; branchName?: string | null };
      const branchName = body.branchName == null ? null : String(body.branchName).trim();
      if (branchName !== null && (!branchName || branchName.length > 255 || !BRANCH_NAME_PATTERN.test(branchName))) return json({ error: "invalid_branch_name" }, 400);
      const result = await updateConversationContext({ conversationId, userId, workspaceId, repositoryId: body.repositoryId ?? null, branchName });
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
      const claimed = await claimRun(runId);
      const encoder = new TextEncoder();

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
                  (await getConversationForUser(audit.conversationId, userId, workspaceId))?.repositoryFullName ?? null,
                  (await getConversationForUser(audit.conversationId, userId, workspaceId))?.branchName ?? null,
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

              const finalAudit = await getRunAudit(runId, audit.conversationId);
              if (finalAudit?.status === "completed") {
                send({ type: "run.completed", runId, status: finalAudit.status });
              } else if (finalAudit?.status === "cancelled") {
                send({ type: "run.failed", runId, message: "Run cancelled" });
              } else if (finalAudit && ["failed","interrupted"].includes(finalAudit.status)) {
                send({ type: "run.failed", runId, message: finalAudit.errorMessage ?? "Run failed" });
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
        "UPDATE runs SET status = 'cancelled', finished_at = now(), error_message = 'Run cancelled by user' WHERE id = $1 AND status IN ('queued','running') RETURNING id",
        [runId]
      ) as Record<string, unknown>[];
      if (!rows[0]) return json({ error: "run_not_cancellable" }, 409);
      return json({ cancelled: true });
    }

    return undefined;
  } catch (error) {
    return errorResponse(error);
  }
}
