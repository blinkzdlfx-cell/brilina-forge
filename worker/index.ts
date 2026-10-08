type AssetBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type Env = {
  ASSETS: AssetBinding;
  FORGE_API_ORIGIN?: string;
};

const PROXIED_PREFIXES = ["/api/", "/auth/"];

function isBackendRequest(pathname: string): boolean {
  return pathname === "/health" || PROXIED_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

function backendUnavailable(): Response {
  return Response.json(
    {
      error: "backend_not_configured",
      message: "Forge frontend is deployed, but the Forge API origin is not configured on this Worker."
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

function proxyRequest(request: Request, origin: string): Promise<Response> {
  const incoming = new URL(request.url);
  const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
  const target = new URL(base + incoming.pathname + incoming.search);

  const headers = new Headers(request.headers);
  headers.set("X-Forge-Edge-Proxy", "brilina-forge");

  return fetch(new Request(target.toString(), {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
    redirect: "manual"
  }));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (isBackendRequest(url.pathname)) {
      const origin = env.FORGE_API_ORIGIN?.trim();
      if (!origin) return backendUnavailable();

      try {
        return await proxyRequest(request, origin);
      } catch {
        return Response.json(
          {
            error: "backend_unreachable",
            message: "The Forge API could not be reached."
          },
          {
            status: 502,
            headers: { "Cache-Control": "no-store" }
          }
        );
      }
    }

    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
