import { handleApi } from "./api.js";

type AssetBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

type Env = Record<string, string | undefined> & {
  ASSETS: AssetBinding;
};

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://github.com");
  return new Response(response.body, response);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const apiResponse = await handleApi(request, env);
    if (apiResponse) return securityHeaders(apiResponse);
    const pathname = new URL(request.url).pathname;
    if (pathname.startsWith("/api/") || pathname.startsWith("/auth/") || pathname === "/health") {
      return securityHeaders(Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } }));
    }
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
