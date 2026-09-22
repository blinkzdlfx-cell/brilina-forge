import { readFile } from "node:fs/promises";
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

export function registerWebApp(app: FastifyInstance): void {
  const webRoot = path.resolve(process.cwd(), "web", "dist");

  app.get("/*", async (request, reply) => {
    const pathname = (request.url.split("?")[0] ?? "/").replace(/^\/+/, "");
    const candidate = path.resolve(webRoot, pathname || "index.html");

    if (!candidate.startsWith(webRoot + path.sep) && candidate !== webRoot) {
      return reply.code(400).send({ error: "invalid_path" });
    }

    try {
      const file = await readFile(candidate);
      const extension = path.extname(candidate).toLowerCase();
      reply.type(CONTENT_TYPES[extension] ?? "application/octet-stream");
      return reply.send(file);
    } catch {
      if (path.extname(pathname)) {
        return reply.code(404).send({ error: "asset_not_found" });
      }

      try {
        const index = await readFile(path.join(webRoot, "index.html"));
        return reply.type("text/html; charset=utf-8").send(index);
      } catch {
        return reply.code(404).send({
          error: "frontend_not_built",
          message: "Build the React frontend with npm --prefix web run build."
        });
      }
    }
  });
}
