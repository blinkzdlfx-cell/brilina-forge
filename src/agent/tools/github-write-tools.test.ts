import test from "node:test";
import assert from "node:assert/strict";
import { createGithubWriteTools } from "./github-write-tools.js";
import type { GithubService } from "../../github/service.js";
import type { ToolExecutionContext } from "../types.js";

const context: ToolExecutionContext = {
  principal: {
    userId: "user-1",
    workspaceId: "workspace-1",
    repositoryFullName: "acme/site"
  },
  runId: "run-1"
};

test("write tool factory exposes branch creation and create/update/upsert operations", () => {
  const service = {} as unknown as GithubService;
  const names = createGithubWriteTools(service).map(tool => tool.name);
  assert.deepEqual(names, [
    "github.create_work_branch",
    "github.create_file",
    "github.update_file",
    "github.write_file"
  ]);
});

test("write tools are scoped to the repository selected for the conversation", async () => {
  const service = {} as unknown as GithubService;
  const tools = createGithubWriteTools(service);
  const write = tools.find(tool => tool.name === "github.write_file");
  assert.ok(write);

  assert.equal(await write.authorize(context, {
    owner: "other",
    repo: "repo",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/feature"
  }), false);

  assert.equal(await write.authorize(context, {
    owner: "ACME",
    repo: "SITE",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/feature"
  }), true);
});

test("write_file delegates the full file update and returns a reviewable commit reference", async () => {
  let call: unknown[] | undefined;
  const service = {
    writeFile: async (...args: unknown[]) => {
      call = args;
      return {
        content: { path: "src/app.ts", sha: "blob-2", html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts" },
        commit: { sha: "commit-2", html_url: "https://github.com/acme/site/commit/commit-2", message: "Update app" }
      };
    }
  } as unknown as GithubService;

  const write = createGithubWriteTools(service).find(tool => tool.name === "github.write_file");
  assert.ok(write);
  const result = await write.execute(context, {
    owner: "acme",
    repo: "site",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/feature",
    message: "Update app"
  }) as Record<string, unknown>;

  assert.deepEqual(call, ["acme", "site", "src/app.ts", "new", "Update app", "brilina/feature"]);
  assert.equal(result.success, true);
  assert.equal(result.branch, "brilina/feature");
  assert.equal(result.commitSha, "commit-2");
  assert.equal(result.commitUrl, "https://github.com/acme/site/commit/commit-2");
});

test("branch creation tool is scoped to the selected repository", async () => {
  const service = {} as unknown as GithubService;
  const branch = createGithubWriteTools(service).find(tool => tool.name === "github.create_work_branch");
  assert.ok(branch);

  assert.equal(await branch.authorize(context, {
    owner: "acme",
    repo: "site",
    branchName: "brilina/feature"
  }), true);

  assert.equal(await branch.authorize(context, {
    owner: "acme",
    repo: "another",
    branchName: "brilina/feature"
  }), false);
});
