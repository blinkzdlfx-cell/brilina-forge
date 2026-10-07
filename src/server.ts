import Fastify from "fastify";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import { config } from "./config.js";
import { createGithubAuthorizationUrl, exchangeGithubCode, refreshGithubAccessToken, OAUTH_STATE_COOKIE, verifyStateBinding } from "./auth/github.js";
import { createSession, deleteSession, getSession, parseSessionCookie, updateSessionCredentials, type Session } from "./auth/session.js";
import { GithubApiError, GithubClient } from "./github/client.js";
import { GithubService } from "./github/service.js";
import { getForgeUserContext, listConversations, createConversation, updateConversationContext, syncRepository, getConversationForUser, userOwnsRun, getOwnedRunConversation, addConversationMessage, listConversationMessages } from "./db/conversation-repositories.js";
import { getRunAudit, listRunsForConversation } from "./db/audit-repositories.js";
import { neonAgentAuditStore } from "./db/agent-repositories.js";
import { AgentController } from "./agent/controller.js";
import { ToolRegistry } from "./agent/registry.js";
import { createGithubReadTools } from "./agent/tools/github-read-context.js";
import { createProviderRuntime } from "./ai/factory.js";
import { ProviderAgentModel } from "./ai/provider-model.js";
import { wrapWithCooldownRetry } from "./ai/retry-model.js";
import { AiProviderError } from "./ai/types.js";
import { createTerminalTools } from "./agent/tools/terminal.js";
import { recordUsage } from "./db/usage-repositories.js";
import { registerTerminalSocket } from "./execution/socket.js";
import { LocalExecutionWorker } from "./execution/local-worker.js";
import { Phase4DeterministicModel } from "./phase4/model.js";
import { runEventBus } from "./phase4/events.js";
import { registerWebApp } from "./web-serving.js";

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 256 * 1024
});
const TOKEN_REFRESH_SKEW_MS = 60_000;
const DELTA_CHUNK_SIZE = 80;
const MAX_RUN_MESSAGE_LENGTH = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_SESSION_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

// The WebSocket plugin must be loaded before any route is registered so its
// onRoute hook applies to the terminal socket route below.
await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
await app.register(rateLimit, {
  max: 120,
  timeWindow: "1 minute",
  keyGenerator: request => parseSessionCookie(request.headers.cookie as string | undefined) ?? request.ip,
  allowList: request => request.url === "/health"
});
await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://avatars.githubusercontent.com"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'", "https://github.com"]
    }
  },
  frameguard: { action: "deny" },
  referrerPolicy: { policy: "same-origin" }
});

export const executionService = new LocalExecutionWorker({
  rootDir: process.env.EXECUTION_ROOT_DIR ?? undefined
});

app.addHook("onClose", async () => {
  await executionService.dispose();
});

// Periodic sweep so abandoned run event histories cannot accumulate.
const eventSweep = setInterval(() => {
  const released = runEventBus.sweep();
  if (released > 0) app.log.debug({ released }, "Released stale run event histories");
}, 5 * 60_000);
eventSweep.unref?.();

app.addHook("onClose", async () => {
  clearInterval(eventSweep);
});

/**
 * Rejects browser-initiated requests that do not come from Forge's own origin.
 * SameSite cookies already withhold the session on cross-site navigations, but
 * a WebSocket handshake is not covered by same-origin policy, so both the
 * socket and the SSE stream are origin-checked explicitly.
 */
function assertSameOrigin(request: { headers: Record<string, string | string[] | undefined> }): void {
  const origin = request.headers.origin;
  if (!origin) return;
  const allowed = new Set([config.publicBaseUrl, config.callbackOrigin]);
  for (const value of Array.isArray(origin) ? origin : [origin]) {
    if (!allowed.has(value)) {
      throw Object.assign(new Error("Cross-origin request rejected"), { statusCode: 403 });
    }
  }
}

function assertUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) {
    throw Object.assign(new Error(`Invalid ${label}`), { statusCode: 400 });
  }
  return value;
}

/**
 * Branch names and conversation titles are interpolated into the model's system
 * context, so they are restricted to ref-safe characters. Without this a stored
 * branch name is a durable prompt-injection vector against every later run.
 */
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

/**
 * Conversations with an in-flight run. One active run per conversation bounds
 * provider spend and keeps the run event stream meaningful.
 */
const activeRuns = new Set<string>();

/**
 * Cancellation registry for in-flight runs. The controller polls the signal
 * between steps, so a cancelled run stops at the next step boundary instead of
 * running to completion.
 */
const runControllers = new Map<string, AbortController>();

function cancelRun(runId: string): boolean {
  const controller = runControllers.get(runId);
  if (!controller) return false;
  controller.abort();
  return true;
}

/**
 * Failure text safe to show a user and stream over SSE. Internal error messages
 * can contain database or provider internals, so only Forge's own policy
 * messages are forwarded verbatim.
 */
function publicRunFailure(error: unknown): string {
  if (error instanceof Error && error instanceof AiProviderError) {
    return `The AI provider request failed (${error.details.kind}).`;
  }
  if (error instanceof Error && typeof error.message === "string") {
    if (/blocked by policy|authorization denied|approval is required|Unknown tool|step limit|not a running/i.test(error.message)) {
      return error.message;
    }
  }
  return "The run failed before it produced a response.";
}

function setSessionCookie(reply: { header(name: string, value: string): void }, id: string) {
  const secure = config.cookieSecure ? " Secure;" : "";
  reply.header("Set-Cookie", `brilina_session=${id}; HttpOnly; Path=/; SameSite=Strict; Max-Age=86400;${secure}`);
}

function clearSessionCookie(reply: { header(name: string, value: string): void }) {
  reply.header("Set-Cookie", "brilina_session=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0;");
}

function parseOAuthStateCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const pair = header.split(";").map(value => value.trim()).find(value => value.startsWith(OAUTH_STATE_COOKIE + "="));
  return pair?.slice(OAUTH_STATE_COOKIE.length + 1);
}

function clearOAuthStateCookie(reply: { header(name: string, value: string): void }) {
  reply.header("Set-Cookie", `${OAUTH_STATE_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;`);
}

async function sessionForRequest(request: { headers: Record<string, string | string[] | undefined> }): Promise<Session> {
  const cookie = request.headers.cookie as string | undefined;
  const id = parseSessionCookie(cookie);
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

  return (await getSession(id)) as Session;
}

async function serviceForRequest(request: { headers: Record<string, string | string[] | undefined> }): Promise<GithubService> {
  const session = await sessionForRequest(request);
  return new GithubService(new GithubClient(session.accessToken));
}

async function forgeContextForRequest(request: { headers: Record<string, string | string[] | undefined> }) {
  const session = await sessionForRequest(request);
  return { session, ...(await getForgeUserContext(session.githubUser.id)) };
}

app.get("/health", async () => ({ ok: true, service: "brilina-forge", phase: 4 }));

app.get("/auth/github/start", async (_request, reply) => {
  const authorizationUrl = createGithubAuthorizationUrl();
  const state = new URL(authorizationUrl).searchParams.get("state") ?? "";
  reply.header(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Path=/; SameSite=Lax; Max-Age=600;${config.cookieSecure ? " Secure;" : ""}`
  );
  reply.redirect(authorizationUrl);
});

app.get("/auth/github/callback", async (request, reply) => {
  const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
  if (query.error) return reply.code(400).send({ error: query.error, message: query.error_description });
  if (!query.code || !query.state) return reply.code(400).send({ error: "missing_oauth_parameters" });

  const boundState = parseOAuthStateCookie(request.headers.cookie as string | undefined);
  if (!verifyStateBinding(boundState, query.state)) {
    clearOAuthStateCookie(reply);
    return reply.code(400).send({ error: "oauth_state_binding_mismatch" });
  }
  clearOAuthStateCookie(reply);

  try {
    const result = await exchangeGithubCode(query.code, query.state);
    const session = await createSession(result.accessToken, result.user, {
      refreshToken: result.refreshToken,
      expiresAt: result.expiresAt,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt
    });
    setSessionCookie(reply, session.id);
    return reply.send({
      authenticated: true,
      githubUser: result.user,
      tokenExpiresAt: result.expiresAt ?? null,
      note: "GitHub authorization is persisted in Neon; GitHub tokens remain server-side and encrypted at rest."
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(401).send({ error: "github_auth_failed" });
  }
});

app.post("/auth/github/logout", async (request, reply) => {
  assertSameOrigin(request);
  const sessionId = parseSessionCookie(request.headers.cookie as string | undefined);
  await deleteSession(sessionId);
  clearSessionCookie(reply);
  return reply.send({ authenticated: false });
});

// Retained so an existing browser session is not stranded on an older client.
app.get("/auth/github/logout", async (request, reply) => {
  const sessionId = parseSessionCookie(request.headers.cookie as string | undefined);
  await deleteSession(sessionId);
  clearSessionCookie(reply);
  return reply.send({ authenticated: false });
});

app.get("/api/session", async (request, reply) => {
  try {
    const session = await sessionForRequest(request);
    return reply.send({
      authenticated: true,
      githubUser: session.githubUser,
      tokenExpiresAt: session.expiresAt ?? null
    });
  } catch {
    return reply.send({ authenticated: false });
  }
});

app.get("/api/github/me", async (request, reply) => {
  try {
    return await serviceForRequest(request).then(service => service.getAuthenticatedUser());
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos", async (request, reply) => {
  try {
    const service = await serviceForRequest(request);
    const query = request.query as { page?: string; per_page?: string };
    const page = query.page === undefined ? 1 : Number(query.page);
    const perPage = query.per_page === undefined ? 100 : Number(query.per_page);
    if (!Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
      return reply.code(400).send({ error: "invalid_pagination" });
    }
    return await service.listRepositories(page, perPage);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.post("/api/github/repositories/sync", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const body = request.body as { nodeId?: string; owner?: string; name?: string; fullName?: string; defaultBranch?: string };
    if (!body?.nodeId || !body.owner || !body.name || !body.fullName || !body.defaultBranch) {
      return reply.code(400).send({ error: "invalid_repository" });
    }

    const repository = await serviceForRequest(request).then(service => service.getRepository(body.owner!, body.name!));
    if (repository.full_name !== body.fullName) {
      return reply.code(409).send({ error: "repository_context_mismatch" });
    }

    return reply.send(await syncRepository({
      userId,
      workspaceId,
      githubNodeId: body.nodeId,
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.full_name,
      defaultBranch: repository.default_branch
    }));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).then(service => service.getRepositoryGraphQL(owner, repo));
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/context", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).then(service => service.getRepositoryContext(owner, repo));
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/rest", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).then(service => service.getRepository(owner, repo));
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/compare", async (request, reply) => {
  try {
    const service = await serviceForRequest(request);
    const { owner, repo } = request.params as { owner: string; repo: string };
    const query = request.query as { base?: string; head?: string };
    if (!query.base || !query.head) return reply.code(400).send({ error: "missing_compare_refs" });
    return await service.compareBranches(owner, repo, query.base!, query.head!);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/commits", async (request, reply) => {
  try {
    const service = await serviceForRequest(request);
    const { owner, repo } = request.params as { owner: string; repo: string };
    const query = request.query as { ref?: string; per_page?: string };
    const perPage = query.per_page === undefined ? 20 : Number(query.per_page);
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > 100) return reply.code(400).send({ error: "invalid_per_page" });
    return await service.listCommits(owner, repo, query.ref, perPage);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/branches", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).then(service => service.listBranches(owner, repo));
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/tree", async (request, reply) => {
  try {
    const service = await serviceForRequest(request);
    const { owner, repo } = request.params as { owner: string; repo: string };
    const query = request.query as { ref?: string; recursive?: string };
    if (!query.ref) return reply.code(400).send({ error: "missing_ref" });
    return await service.getTree(owner, repo, query.ref!, query.recursive !== "false");
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/file/*", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    const wildcard = (request.params as Record<string, string>)["*"];
    const query = request.query as { ref?: string };
    return await serviceForRequest(request).then(service => service.getFile(owner, repo, wildcard, query.ref));
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/conversations", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    return await listConversations(userId, workspaceId);
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.post("/api/conversations", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const body = (request.body ?? {}) as { title?: string; repositoryId?: string; branchName?: string };
    if (body.title !== undefined) assertSafeTitle(String(body.title));
    if (body.branchName !== undefined && body.branchName !== null) {
      assertSafeBranchName(String(body.branchName).trim());
    }
    return reply.code(201).send(await createConversation({
      userId,
      workspaceId,
      title: body.title,
      repositoryId: body.repositoryId,
      branchName: body.branchName
    }));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.patch("/api/conversations/:conversationId", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { conversationId } = request.params as { conversationId: string };
    assertUuid(conversationId, "conversation id");
    const body = request.body as { repositoryId?: string | null; branchName?: string | null };
    const branchName = body.branchName === undefined || body.branchName === null ? null : body.branchName.trim();
    if (branchName !== null && (!branchName || branchName.length > 512)) {
      return reply.code(400).send({ error: "invalid_branch_name" });
    }
    if (branchName !== null && !BRANCH_NAME_PATTERN.test(branchName)) {
      return reply.code(400).send({ error: "invalid_branch_name" });
    }

    const conversation = await updateConversationContext({
      conversationId,
      userId,
      workspaceId,
      repositoryId: body.repositoryId ?? null,
      branchName
    });
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });
    return reply.send(conversation);
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/conversations/:conversationId/messages", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { conversationId } = request.params as { conversationId: string };
    assertUuid(conversationId, "conversation id");
    const conversation = await getConversationForUser(conversationId, userId, workspaceId);
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });
    return reply.send(await listConversationMessages(conversationId, userId, workspaceId));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.post("/api/conversations/:conversationId/runs", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
const { conversationId } = request.params as { conversationId: string };
    assertUuid(conversationId, "conversation id");
    const body = request.body as { message?: string };
    const message = body?.message?.trim();
    if (!message) return reply.code(400).send({ error: "missing_message" });
    if (message.length > MAX_RUN_MESSAGE_LENGTH) {
      return reply.code(413).send({ error: "message_too_long", maxLength: MAX_RUN_MESSAGE_LENGTH });
    }

    const conversation = await getConversationForUser(conversationId, userId, workspaceId);
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });

    if (activeRuns.has(conversationId)) {
      return reply.code(409).send({ error: "run_already_active" });
    }
    activeRuns.add(conversationId);

    const run = await neonAgentAuditStore.createRun({ conversationId, userId });
    await addConversationMessage({
      conversationId,
      userId,
      workspaceId,
      runId: run.id,
      role: "user",
      content: message
    });
    runEventBus.publish(run.id, { type: "run.started", runId: run.id });

    // Everything the background run needs is captured before the response is
    // sent: re-reading the request afterwards would hold the request context for
    // the life of the run and could fail on an already-sent response.
    let service: GithubService;
    let providerRuntime: ReturnType<typeof createProviderRuntime>;
    try {
      service = await serviceForRequest(request);
      providerRuntime = createProviderRuntime();
    } catch (error) {
      activeRuns.delete(conversationId);
      runEventBus.release(run.id);
      throw error;
    }
    const runLogger = request.log.child({ runId: run.id, conversationId });
    const runAbort = new AbortController();
    runControllers.set(run.id, runAbort);

    void (async () => {
      const startedAt = Date.now();
      let retries = 0;
      try {
        const registry = new ToolRegistry();
        for (const tool of createGithubReadTools(service)) registry.register(tool);
        for (const tool of createTerminalTools(executionService)) registry.register(tool);

        const provider = providerRuntime.registry.providerFor(providerRuntime.activeModel);
        const agentModel = provider.id === "deterministic-development"
          ? new Phase4DeterministicModel()
          : new ProviderAgentModel({ provider, model: providerRuntime.activeModel, signal: runAbort.signal });

        await neonAgentAuditStore.updateRunProvider(run.id, providerRuntime.activeProviderId, providerRuntime.activeModel);

        const controller = new AgentController(
          wrapWithCooldownRetry(agentModel),
          registry,
          neonAgentAuditStore,
          {
            emit: event => runEventBus.publish(run.id, event),
            onRetry: attempt => {
              retries += 1;
              runLogger.warn({ attempt: attempt.attempt, kind: attempt.kind, delayMs: attempt.delayMs }, "AI provider retry scheduled");
            }
          },
          { shouldStop: () => runAbort.signal.aborted }
        );
        const result = await controller.run({
          runId: run.id,
          conversationId,
          principal: {
            userId,
            workspaceId,
            repositoryId: conversation.repositoryId ?? undefined,
            repositoryFullName: conversation.repositoryFullName ?? undefined,
            branchName: conversation.branchName ?? undefined
          },
          message
        });

        await recordUsage({
          runId: run.id,
          provider: providerRuntime.activeProviderId,
          model: providerRuntime.activeModel,
          usage: agentModel instanceof ProviderAgentModel && agentModel.lastUsage
            ? agentModel.lastUsage
            : { inputTokens: message.length, outputTokens: result.response?.length ?? 0 },
          durationMs: Date.now() - startedAt,
          retryCount: retries,
          status: result.status === "completed" ? "success" : "failed"
        }).catch(error => runLogger.error(error, "Failed to record AI usage"));

        if (result.response) {
          for (const chunk of chunkResponse(result.response)) {
            runEventBus.publish(run.id, { type: "assistant.delta", content: chunk });
          }
          await addConversationMessage({
            conversationId,
            userId,
            workspaceId,
            runId: run.id,
            role: "assistant",
            content: result.response
          });
          runEventBus.publish(run.id, { type: "assistant.completed", content: result.response });
        }
        if (result.status !== "completed") {
          runEventBus.publish(run.id, { type: "run.failed", runId: run.id, message: "Agent run did not complete" });
        } else {
          runEventBus.publish(run.id, { type: "run.completed", runId: run.id, status: result.status });
        }
      } catch (error) {
        runLogger.error(error, "Agent run failed");
        const failure = error instanceof Error ? error.message : "Run failed";
        await neonAgentAuditStore.updateRun(run.id, "failed", failure);
        await recordUsage({
          runId: run.id,
          provider: providerRuntime.activeProviderId,
          model: providerRuntime.activeModel,
          usage: { inputTokens: 0, outputTokens: 0 },
          durationMs: Date.now() - startedAt,
          retryCount: retries,
          status: "failed"
        }).catch(() => undefined);
        runEventBus.publish(run.id, { type: "run.failed", runId: run.id, message: publicRunFailure(error) });
} finally {
        activeRuns.delete(conversationId);
        runControllers.delete(run.id);
        runEventBus.release(run.id);
      }
    })();

    return reply.code(202).send({ runId: run.id, status: run.status });
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/terminal/sessions", async (request, reply) => {
  try {
    const { workspaceId } = await forgeContextForRequest(request);
    const query = request.query as { conversationId?: string };
    return await executionService.listSessions(workspaceId, query.conversationId);
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.post("/api/terminal/sessions", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const body = (request.body ?? {}) as { conversationId?: string };
    const conversationId = body.conversationId?.trim();
    if (!conversationId) return reply.code(400).send({ error: "missing_conversation_id" });
    assertUuid(conversationId, "conversation id");
    if (!(await getConversationForUser(conversationId, userId, workspaceId))) {
      return reply.code(404).send({ error: "conversation_not_found" });
    }
    return reply.code(201).send(await executionService.createSession({ conversationId, workspaceId, userId }));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

/**
 * A terminal session is scoped to the user who opened it as well as to its
 * workspace, so a future workspace member cannot read or drive another user's
 * terminal.
 */
async function ownedTerminalSession(request: { headers: Record<string, string | string[] | undefined> }, sessionId: string) {
  const { userId, workspaceId } = await forgeContextForRequest(request);
  if (!TERMINAL_SESSION_ID_PATTERN.test(sessionId)) {
    throw Object.assign(new Error("Invalid terminal session id"), { statusCode: 400 });
  }
  const session = await executionService.getSession(sessionId);
  if (!session || session.workspaceId !== workspaceId || (session.userId && session.userId !== userId)) return undefined;
  return session;
}

app.get("/api/terminal/sessions/:sessionId", async (request, reply) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    const session = await ownedTerminalSession(request, sessionId);
    if (!session) return reply.code(404).send({ error: "terminal_session_not_found" });
    return reply.send(session);
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/terminal/sessions/:sessionId/output", async (request, reply) => {
  try {
    const { sessionId } = request.params as { sessionId: string };
    if (!(await ownedTerminalSession(request, sessionId))) return reply.code(404).send({ error: "terminal_session_not_found" });
    const query = request.query as { since?: string; limit?: string };
    const since = query.since === undefined ? 0 : Number(query.since);
    const limit = query.limit === undefined ? 500 : Number(query.limit);
    if (!Number.isFinite(since) || since < 0 || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
      return reply.code(400).send({ error: "invalid_output_window" });
    }
    return reply.send(await executionService.read(sessionId, { since, limit }));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.post("/api/terminal/sessions/:sessionId/exec", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { sessionId } = request.params as { sessionId: string };
    if (!(await ownedTerminalSession(request, sessionId))) return reply.code(404).send({ error: "terminal_session_not_found" });
    const body = (request.body ?? {}) as { command?: string; timeoutMs?: number };
    const command = body.command?.trim();
    if (!command) return reply.code(400).send({ error: "missing_command" });
    if (body.timeoutMs !== undefined && (!Number.isInteger(body.timeoutMs) || body.timeoutMs < 1000 || body.timeoutMs > 600_000)) {
      return reply.code(400).send({ error: "invalid_timeout" });
    }
    return reply.send(await executionService.exec({ sessionId, command, timeoutMs: body.timeoutMs }));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.delete("/api/terminal/sessions/:sessionId", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { sessionId } = request.params as { sessionId: string };
    if (!(await ownedTerminalSession(request, sessionId))) return reply.code(404).send({ error: "terminal_session_not_found" });
    return reply.send(await executionService.kill(sessionId));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/conversations/:conversationId/runs", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { conversationId } = request.params as { conversationId: string };
    assertUuid(conversationId, "conversation id");
    const conversation = await getConversationForUser(conversationId, userId, workspaceId);
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });
    return reply.send(await listRunsForConversation(conversationId));
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/runs/:runId/audit", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { runId } = request.params as { runId: string };
    assertUuid(runId, "run id");
    const conversationId = await getOwnedRunConversation(runId, userId, workspaceId);
    if (!conversationId) return reply.code(404).send({ error: "run_not_found" });
    const audit = await getRunAudit(runId, conversationId);
    if (!audit) return reply.code(404).send({ error: "run_not_found" });
    return reply.send(audit);
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.post("/api/runs/:runId/cancel", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { runId } = request.params as { runId: string };
    assertUuid(runId, "run id");
    if (!(await userOwnsRun(runId, userId, workspaceId))) return reply.code(404).send({ error: "run_not_found" });
    if (!cancelRun(runId)) return reply.code(409).send({ error: "run_not_cancellable" });
    await neonAgentAuditStore.updateRun(runId, "cancelled", "Cancelled by the conversation owner");
    runEventBus.publish(runId, { type: "run.failed", runId, message: "Run cancelled" });
    return reply.send({ runId, status: "cancelled" });
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/runs/:runId/events", async (request, reply) => {
  try {
    assertSameOrigin(request);
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { runId } = request.params as { runId: string };
    assertUuid(runId, "run id");
    if (!(await userOwnsRun(runId, userId, workspaceId))) return reply.code(404).send({ error: "run_not_found" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    const write = (event: { type: string; [key: string]: unknown }) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const history = runEventBus.history(runId);
    for (const event of history) write(event);
    if (history.some(event => event.type === "run.completed" || event.type === "run.failed")) {
      reply.raw.end();
      return;
    }

    const unsubscribe = runEventBus.subscribe(runId, event => {
      write(event);
      if (event.type === "run.completed" || event.type === "run.failed") {
        unsubscribe();
        reply.raw.end();
      }
    });

    const heartbeat = setInterval(() => reply.raw.write(": keep-alive\n\n"), 15000);
    reply.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

function handleGithubError(reply: any, error: unknown) {
  if (error instanceof GithubApiError) {
    const status = error.status === 0 ? 502 : error.status;
    const payload = { error: "github_api_error", message: error.message, rateLimit: error.rateLimit };
    if (error.rateLimit.retryAfterSeconds !== undefined) reply.header("Retry-After", String(error.rateLimit.retryAfterSeconds));
    return reply.code(status).send(payload);
  }
  if (error instanceof Error && "statusCode" in error) {
    return reply.code(Number((error as { statusCode?: number }).statusCode)).send({ error: error.message });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "request_failed" });
}

/**
 * Application errors carrying an explicit statusCode are safe to surface: they
 * are raised by Forge's own validation and policy layers. Anything else is an
 * internal failure (database, provider or programming error) and must not leak
 * its message to the client.
 */
function handleForgeError(reply: any, error: unknown) {
  if (error instanceof Error && "statusCode" in error) {
    return reply.code(Number((error as { statusCode?: number }).statusCode)).send({ error: error.message });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "internal_error" });
}

registerWebApp(app);
registerTerminalSocket(app, {
  execution: executionService,
  resolveIdentity: async headers => {
    const { userId, workspaceId } = await forgeContextForRequest({ headers });
    return { userId, workspaceId };
  },
  isOriginAllowed: origin => !origin || origin === config.publicBaseUrl || origin === config.callbackOrigin
});

export { app };
