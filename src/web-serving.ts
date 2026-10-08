import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function resolveWebRoot(): string {
  // Prefer the self-contained production artifact next to the compiled server.
  // Fall back to the repository's web/dist path for source/local development.
  const packaged = path.resolve(import.meta.dirname, "web");
  const workspace = path.resolve(process.cwd(), "web", "dist");
  return existsSync(path.join(packaged, "index.html")) ? packaged : workspace;
}

function decodePathname(url: string): string | undefined {
  const raw = (url.split("?")[0] ?? "/").replace(/^\/+/, "");
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  return decoded.includes("\\") ? undefined : decoded;
}

async function isInsideWebRoot(candidate: string, webRoot: string): Promise<boolean> {
  if (candidate !== webRoot && !candidate.startsWith(webRoot + path.sep)) return false;
  try {
    const resolved = await realpath(candidate);
    return resolved === webRoot || resolved.startsWith(webRoot + path.sep);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    return false;
  }
}

export function registerWebApp(app: FastifyInstance): void {
  const webRoot = resolveWebRoot();

  app.get("/*", async (request, reply) => {
    const pathname = decodePathname(request.url);
    if (pathname === undefined) return reply.code(400).send({ error: "invalid_path" });

    const candidate = path.resolve(webRoot, pathname || "index.html");
    if (candidate !== webRoot && !candidate.startsWith(webRoot + path.sep)) {
      return reply.code(400).send({ error: "invalid_path" });
    }

    if (pathname.split("/").some(segment => segment.startsWith("."))) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    if (!(await isInsideWebRoot(candidate, webRoot))) {
      return reply.code(400).send({ error: "invalid_path" });
    }

    try {
      const file = await readFile(candidate);
      const extension = path.extname(candidate).toLowerCase();
      reply.type(CONTENT_TYPES[extension] ?? "application/octet-stream");
      if (path.basename(candidate) === "index.html") {
        reply.header("Cache-Control", "no-cache");
      } else {
        reply.header("Cache-Control", "public, max-age=3600");
      }
      return reply.send(file);
    } catch {
      // Never turn a missing JavaScript/CSS/image/font into the SPA shell.
      // Doing so produces browser MIME errors and a white screen.
      if (path.extname(pathname)) {
        return reply.code(404).send({ error: "asset_not_found" });
      }

      try {
        const index = await readFile(path.join(webRoot, "index.html"));
        return reply.type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(index);
      } catch {
        return reply.code(404).send({
          error: "frontend_not_built",
          message: "Build the React frontend before starting Forge."
        });
      }
    }
  });
}
