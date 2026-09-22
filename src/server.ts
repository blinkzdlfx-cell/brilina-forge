import Fastify from "fastify";
import { config } from "./config.js";
import { createGithubAuthorizationUrl, exchangeGithubCode, refreshGithubAccessToken } from "./auth/github.js";
import { createSession, deleteSession, getSession, parseSessionCookie, updateSessionCredentials, type Session } from "./auth/session.js";
import { GithubApiError, GithubClient } from "./github/client.js";
import { GithubService } from "./github/service.js";
import { getForgeUserContext, listConversations, createConversation, getConversationForUser } from "./db/conversation-repositories.js";
import { neonAgentAuditStore } from "./db/agent-repositories.js";
import { AgentController } from "./agent/controller.js";
import { ToolRegistry } from "./agent/registry.js";
import { createGithubGetRepositoryTool } from "./agent/tools/github-read-repository.js";
import { Phase4DeterministicModel } from "./phase4/model.js";
import { runEventBus } from "./phase4/events.js";

const app = Fastify({ logger: true });
const TOKEN_REFRESH_SKEW_MS = 60_000;

function setSessionCookie(reply: { header(name: string, value: string): void }, id: string) {
  const secure = config.cookieSecure ? " Secure;" : "";
  reply.header("Set-Cookie", `brilina_session=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400;${secure}`);
}

function clearSessionCookie(reply: { header(name: string, value: string): void }) {
  reply.header("Set-Cookie", "brilina_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;");
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
  reply.redirect(createGithubAuthorizationUrl());
});

app.get("/auth/github/callback", async (request, reply) => {
  const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
  if (query.error) return reply.code(400).send({ error: query.error, message: query.error_description });
  if (!query.code || !query.state) return reply.code(400).send({ error: "missing_oauth_parameters" });

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

app.get("/auth/github/logout", async (request, reply) => {
  const sessionId = parseSessionCookie(request.headers.cookie as string | undefined);
  await deleteSession(sessionId);
  clearSessionCookie(reply);
  return reply.send({ authenticated: false });
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
    const query = request.query as { page?: string; per_page?: string };
    const page = query.page === undefined ? 1 : Number(query.page);
    const perPage = query.per_page === undefined ? 100 : Number(query.per_page);
    if (!Number.isInteger(page) || page < 1 || page > 100 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
      return reply.code(400).send({ error: "invalid_pagination" });
    }
    return await serviceForRequest(request).then(service => service.listRepositories(page, perPage));
  } catch (error) {
    return handleGithubError(reply, error);
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
    const { owner, repo } = request.params as { owner: string; repo: string };
    const query = request.query as { ref?: string; recursive?: string };
    if (!query.ref) return reply.code(400).send({ error: "missing_ref" });
    return await serviceForRequest(request).then(service => service.getTree(owner, repo, query.ref!, query.recursive !== "false"));
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
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const body = (request.body ?? {}) as { title?: string; repositoryId?: string; branchName?: string };
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

app.post("/api/conversations/:conversationId/runs", async (request, reply) => {
  try {
    const { userId, workspaceId } = await forgeContextForRequest(request);
    const { conversationId } = request.params as { conversationId: string };
    const body = request.body as { message?: string };
    const message = body?.message?.trim();
    if (!message) return reply.code(400).send({ error: "missing_message" });

    const conversation = await getConversationForUser(conversationId, userId, workspaceId);
    if (!conversation) return reply.code(404).send({ error: "conversation_not_found" });

    const run = await neonAgentAuditStore.createRun({ conversationId, userId });
    runEventBus.publish(run.id, { type: "run.started", runId: run.id });

    void (async () => {
      try {
        const service = await serviceForRequest(request);
        const registry = new ToolRegistry();
        registry.register(createGithubGetRepositoryTool(service));
        const controller = new AgentController(new Phase4DeterministicModel(), registry, neonAgentAuditStore);
        const result = await controller.run({
          runId: run.id,
          conversationId,
          principal: {
            userId,
            workspaceId,
            repositoryId: conversation.repositoryId ?? undefined,
            branchName: conversation.branchName ?? undefined
          },
          message
        });

        if (result.response) {
          for (const chunk of result.response.match(/.{1,80}(?:\s+|$)/g) ?? [result.response]) {
            runEventBus.publish(run.id, { type: "assistant.delta", content: chunk });
          }
          runEventBus.publish(run.id, { type: "assistant.completed", content: result.response });
        }
        runEventBus.publish(run.id, { type: "run.completed", runId: run.id, status: result.status });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Run failed";
        await neonAgentAuditStore.updateRun(run.id, "failed", message);
        runEventBus.publish(run.id, { type: "run.failed", runId: run.id, message });
      }
    })();

    return reply.code(202).send({ runId: run.id, status: run.status });
  } catch (error) {
    return handleForgeError(reply, error);
  }
});

app.get("/api/runs/:runId/events", async (request, reply) => {
  try {
    await sessionForRequest(request);
    const { runId } = request.params as { runId: string };
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
  return reply.code(500).send({ error: "request_failed" });
}

function handleForgeError(reply: any, error: unknown) {
  if (error instanceof Error && "statusCode" in error) {
    return reply.code(Number((error as { statusCode?: number }).statusCode)).send({ error: error.message });
  }
  requestLog(error);
  return reply.code(500).send({ error: error instanceof Error ? error.message : "request_failed" });
}

function requestLog(error: unknown) {
  app.log.error(error);
}

export { app };
