import Fastify from "fastify";
import { config } from "./config.js";
import { createGithubAuthorizationUrl, exchangeGithubCode } from "./auth/github.js";
import { createSession, deleteSession, getSession, parseSessionCookie } from "./auth/session.js";
import { GithubApiError, GithubClient } from "./github/client.js";
import { GithubService } from "./github/service.js";

const app = Fastify({ logger: true });

function setSessionCookie(reply: { header(name: string, value: string): void }, id: string) {
  const secure = config.cookieSecure ? " Secure;" : "";
  reply.header(
    "Set-Cookie",
    `brilina_session=${id}; HttpOnly; Path=/; SameSite=Lax; Max-Age=86400;${secure}`
  );
}

function clearSessionCookie(reply: { header(name: string, value: string): void }) {
  reply.header(
    "Set-Cookie",
    "brilina_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0;"
  );
}

function serviceForRequest(request: { headers: Record<string, string | string[] | undefined> }): GithubService {
  const cookie = request.headers.cookie as string | undefined;
  const session = getSession(parseSessionCookie(cookie));
  if (!session) throw Object.assign(new Error("GitHub authentication required"), { statusCode: 401 });
  return new GithubService(new GithubClient(session.accessToken));
}

app.get("/health", async () => ({ ok: true, service: "brilina-forge", phase: 1 }));

app.get("/auth/github/start", async (_request, reply) => {
  reply.redirect(createGithubAuthorizationUrl());
});

app.get("/auth/github/callback", async (request, reply) => {
  const query = request.query as { code?: string; state?: string; error?: string; error_description?: string };
  if (query.error) return reply.code(400).send({ error: query.error, message: query.error_description });
  if (!query.code || !query.state) return reply.code(400).send({ error: "missing_oauth_parameters" });

  try {
    const result = await exchangeGithubCode(query.code, query.state);
    const session = createSession(result.accessToken, result.user);
    setSessionCookie(reply, session.id);
    return reply.send({
      authenticated: true,
      githubUser: result.user,
      note: "Phase 1 development session. Durable persistence is implemented in Phase 2."
    });
  } catch (error) {
    request.log.error(error);
    return reply.code(401).send({ error: "github_auth_failed" });
  }
});

app.get("/auth/github/logout", async (request, reply) => {
  const sessionId = parseSessionCookie(request.headers.cookie as string | undefined);
  deleteSession(sessionId);
  clearSessionCookie(reply);
  return reply.send({ authenticated: false });
});

app.get("/api/github/me", async (request, reply) => {
  try {
    return await serviceForRequest(request).getAuthenticatedUser();
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error ? Number((error as { statusCode?: number }).statusCode) : 500;
    return reply.code(status).send({ error: error instanceof Error ? error.message : "request_failed" });
  }
});

app.get("/api/github/repos", async (request, reply) => {
  try {
    const query = request.query as { page?: string; per_page?: string };
    return await serviceForRequest(request).listRepositories(
      Number(query.page ?? 1),
      Math.min(Number(query.per_page ?? 100), 100)
    );
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).getRepositoryGraphQL(owner, repo);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/rest", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).getRepository(owner, repo);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/branches", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    return await serviceForRequest(request).listBranches(owner, repo);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/tree", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    const query = request.query as { ref?: string; recursive?: string };
    if (!query.ref) return reply.code(400).send({ error: "missing_ref" });
    return await serviceForRequest(request).getTree(owner, repo, query.ref, query.recursive !== "false");
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

app.get("/api/github/repos/:owner/:repo/file/*", async (request, reply) => {
  try {
    const { owner, repo } = request.params as { owner: string; repo: string };
    const wildcard = (request.params as Record<string, string>)["*"];
    const query = request.query as { ref?: string };
    return await serviceForRequest(request).getFile(owner, repo, wildcard, query.ref);
  } catch (error) {
    return handleGithubError(reply, error);
  }
});

function handleGithubError(reply: any, error: unknown) {
  if (error instanceof GithubApiError) {
    return reply.code(error.status).send({ error: "github_api_error", message: error.message, details: error.responseBody });
  }
  if (error instanceof Error && "statusCode" in error) {
    return reply.code(Number((error as { statusCode?: number }).statusCode)).send({ error: error.message });
  }
  return reply.code(500).send({ error: "request_failed" });
}

if (process.env.NODE_ENV !== "test") {
  app.listen({ host: config.host, port: config.port }).catch(error => {
    app.log.error(error);
    process.exit(1);
  });
}

export { app };
