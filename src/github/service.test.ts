import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GithubService } from "./service.js";

describe("GithubService", () => {
  it("uses GraphQL for aggregated repository context", async () => {
    let capturedQuery = "";
    let capturedVariables: Record<string, unknown> | undefined;

    const fakeClient = {
      graphql: async <T>(query: string, variables: Record<string, unknown>) => {
        capturedQuery = query;
        capturedVariables = variables;
        return {
          repository: {
            id: "R_1",
            name: "brilina-forge",
            nameWithOwner: "blinkzdlfx-cell/brilina-forge",
            isPrivate: false,
            url: "https://github.com/blinkzdlfx-cell/brilina-forge",
            owner: { login: "blinkzdlfx-cell" },
            defaultBranchRef: { name: "main", target: { oid: "abc123" } }
          }
        } as T;
      }
    };

    const service = new GithubService(fakeClient as never);
    const result = await service.getRepositoryGraphQL("blinkzdlfx-cell", "brilina-forge");

    assert.equal(result.nameWithOwner, "blinkzdlfx-cell/brilina-forge");
    assert.equal(capturedVariables?.owner, "blinkzdlfx-cell");
    assert.equal(capturedVariables?.repo, "brilina-forge");
    assert.match(capturedQuery, /defaultBranchRef/);
    assert.match(capturedQuery, /target \{ oid \}/);

  it("writes multiple files in one commit and verifies every read-back", async () => {
    const requests: Array<{ path: string; method: string; body?: string }> = [];
    const contents: Record<string, string> = { "src/app.ts": "export {};", "src/app.css": "body {}" };
    let blobCount = 0;
    const fakeClient = {
      rest: async <T>(path: string, init?: RequestInit): Promise<T> => {
        const method = init?.method ?? "GET";
        requests.push({ path, method, body: typeof init?.body === "string" ? init.body : undefined });
        let value: unknown;
        if (path === "/repos/acme/site") {
          value = { default_branch: "main", full_name: "acme/site" };
        } else if (path.includes("/git/ref/heads/")) {
          value = { object: { sha: "base-commit" } };
        } else if (path.endsWith("/git/commits/base-commit")) {
          value = { tree: { sha: "base-tree" } };
        } else if (path.endsWith("/git/blobs") && method === "POST") {
          blobCount += 1;
          value = { sha: `blob-${blobCount}` };
        } else if (path.endsWith("/git/trees") && method === "POST") {
          const body = JSON.parse(String(init?.body)) as { base_tree: string; tree: unknown[] };
          assert.equal(body.base_tree, "base-tree");
          assert.equal(body.tree.length, 2);
          value = { sha: "new-tree" };
        } else if (path.endsWith("/git/commits") && method === "POST") {
          const body = JSON.parse(String(init?.body)) as { tree: string; parents: string[]; message: string };
          assert.equal(body.tree, "new-tree");
          assert.deepEqual(body.parents, ["base-commit"]);
          assert.equal(body.message, "Update app files");
          value = { sha: "new-commit", html_url: "https://github.com/acme/site/commit/new-commit", message: body.message };
        } else if (path.includes("/git/refs/heads/") && method === "PATCH") {
          value = { ref: "refs/heads/brilina/feature" };
        } else if (path.includes("/contents/") && path.includes("?ref=")) {
          const pathName = path.split("/contents/")[1].split("?")[0];
          const decodedPath = decodeURIComponent(pathName);
          const text = contents[decodedPath];
          const binary = btoa(text);
          value = { path: decodedPath, sha: `readback-${decodedPath}`, encoding: "base64", content: binary, name: decodedPath.split("/").pop(), size: text.length, html_url: `https://github.com/acme/site/blob/brilina/feature/${decodedPath}` };
        } else {
          throw new Error(`Unexpected GitHub API request: ${method} ${path}`);
        }
        return value as T;
      }
    };
    const service = new GithubService(fakeClient as never);
    const result = await service.writeFiles("acme", "site", [
      { path: "src/app.ts", content: contents["src/app.ts"] },
      { path: "src/app.css", content: contents["src/app.css"] }
    ], "Update app files", "brilina/feature");
    assert.equal(result.commit.sha, "new-commit");
    assert.equal(result.files.length, 2);
    assert.equal(result.readBackVerified, true);
    assert.equal(requests.filter(item => item.path.endsWith("/git/commits") && item.method === "POST").length, 1);
    assert.equal(requests.filter(item => item.path.endsWith("/git/refs/heads/brilina/feature") && item.method === "PATCH").length, 1);
  });
  });
});
