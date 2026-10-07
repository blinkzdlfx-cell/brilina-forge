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

function decodePathname(url: string): string | undefined {
  const raw = (url.split("?")[0] ?? "/").replace(/^\/+/, "");
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  // Backslashes are path separators on Windows and must never reach the resolver.
  return decoded.includes("\\") ? undefined : decoded;
}

/**
 * Confirms the resolved path is inside the web root. The realpath check closes
 * the symlink escape that a prefix comparison alone would allow. A missing file
 * is not a containment failure, so it is left for the caller to report as 404.
 */
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
  const webRoot = path.resolve(process.cwd(), "web", "dist");

  app.get("/*", async (request, reply) => {
    const pathname = decodePathname(request.url);
    if (pathname === undefined) return reply.code(400).send({ error: "invalid_path" });

    const candidate = path.resolve(webRoot, pathname || "index.html");
    // Prefix check first so an escape attempt is reported as such rather than
    // being masked by the dotfile or not-found rules below.
    if (candidate !== webRoot && !candidate.startsWith(webRoot + path.sep)) {
      return reply.code(400).send({ error: "invalid_path" });
    }

    // Dotfile requests never map to the SPA shell: `/.env` has no extension, so
    // without this it would fall through to the index.html fallback and return
    // 200 for a path that should not exist.
    if (pathname.split("/").some(segment => segment.startsWith("."))) {
      return reply.code(404).send({ error: "asset_not_found" });
    }

    // realpath closes the symlink escape the prefix check cannot see.
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
      if (path.extname(pathname)) {
        return reply.code(404).send({ error: "asset_not_found" });
      }

      try {
        const index = await readFile(path.join(webRoot, "index.html"));
        return reply.type("text/html; charset=utf-8").header("Cache-Control", "no-cache").send(index);
      } catch {
        return reply.code(404).send({
          error: "frontend_not_built",
          message: "Build the React frontend with npm --prefix web run build."
        });
      }
    }
  });
}