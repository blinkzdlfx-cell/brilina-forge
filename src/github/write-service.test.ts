import test from "node:test";
import assert from "node:assert/strict";
import { GithubService } from "./service.js";

type RequestCall = { path: string; init?: RequestInit };

function fakeClient(handler: (path: string, init?: RequestInit) => unknown) {
  const calls: RequestCall[] = [];
  return {
    calls,
    client: {
      async rest<T>(path: string, init?: RequestInit): Promise<T> {
        calls.push({ path, init });
        return handler(path, init) as T;
      },
      async graphql<T>(): Promise<T> {
        throw new Error("GraphQL should not be called in this test");
      }
    }
  };
}

test("createBranch creates a new ref from the selected base branch SHA", async () => {
  const fake = fakeClient((path, init) => {
    if (path.endsWith("/repos/acme/site")) return { default_branch: "main" };
    if (path.endsWith("/git/ref/heads/main")) return { object: { sha: "base-sha" } };
    if (path.endsWith("/git/refs") && init?.method === "POST") {
      const body = JSON.parse(String(init.body)) as { ref: string; sha: string };
      assert.equal(body.ref, "refs/heads/brilina/feature-test");
      assert.equal(body.sha, "base-sha");
      return { ref: body.ref, object: { sha: "base-sha" }, url: "https://api.github.com/ref/123" };
    }
    throw new Error("Unexpected request: " + path);
  });

  const service = new GithubService(fake.client as never);
  const result = await service.createBranch("acme", "site", "brilina/feature-test");
  assert.equal(result.branch, "brilina/feature-test");
  assert.equal(result.sha, "base-sha");
  assert.ok(fake.calls.some(call => call.init?.method === "POST"));
});

test("writeFile refuses to modify the default branch", async () => {
  const fake = fakeClient((path, init) => {
    if (path.includes("/contents/src/app.ts")) {
      return { name: "app.ts", path: "src/app.ts", sha: "blob-sha", size: 4, encoding: "base64", content: "b2xk", html_url: "https://github.com/acme/site/blob/main/src/app.ts" };
    }
    if (path.endsWith("/repos/acme/site")) return { default_branch: "main" };
    throw new Error("Unexpected request: " + path + " " + String(init?.method));
  });

  const service = new GithubService(fake.client as never);
  await assert.rejects(
    () => service.writeFile("acme", "site", "src/app.ts", "new", "Update app", "main"),
    (error: unknown) => error instanceof Error && /default branch/i.test(error.message)
  );
  assert.equal(fake.calls.some(call => call.init?.method === "PUT"), false);
});

test("writeFile updates an existing file with its current blob SHA and UTF-8 base64 content", async () => {
  let putBody: Record<string, unknown> | undefined;
  const fake = fakeClient((path, init) => {
    if (path.includes("/contents/src/app.ts") && !init?.method) {
      return { name: "app.ts", path: "src/app.ts", sha: "current-blob-sha", size: 3, encoding: "base64", content: "b2xk", html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts" };
    }
    if (path.endsWith("/repos/acme/site")) return { default_branch: "main" };
    if (path.includes("/git/ref/heads/brilina/feature")) return { object: { sha: "branch-sha" } };
    if (path.includes("/contents/src/app.ts") && init?.method === "PUT") {
      putBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return {
        content: { path: "src/app.ts", sha: "new-blob-sha", html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts" },
        commit: { sha: "commit-sha", html_url: "https://github.com/acme/site/commit/commit-sha", message: "Update app" }
      };
    }
    throw new Error("Unexpected request: " + path + " " + String(init?.method));
  });

  const service = new GithubService(fake.client as never);
  const result = await service.writeFile("acme", "site", "src/app.ts", "héllo", "Update app", "brilina/feature");
  assert.equal(putBody?.sha, "current-blob-sha");
  assert.equal(putBody?.branch, "brilina/feature");
  assert.equal(putBody?.message, "Update app");
  assert.equal(putBody?.content, "aMOpbGxv");
  assert.equal(result.commit.sha, "commit-sha");
});

test("branch and file paths reject unsafe values before API calls", async () => {
  const fake = fakeClient(() => { throw new Error("API must not be called"); });
  const service = new GithubService(fake.client as never);
  await assert.rejects(() => service.createBranch("acme", "site", "main..evil"));
  await assert.rejects(() => service.writeFile("acme", "site", "../secret", "x", "Update", "brilina/feature"));
  assert.equal(fake.calls.length, 0);
});
