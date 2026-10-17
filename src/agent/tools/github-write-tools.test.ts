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
  const service = { getRepository: async () => ({ default_branch: "main" }) } as unknown as GithubService;
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

  const selectedContext: ToolExecutionContext = {
    ...context,
    principal: { ...context.principal, branchName: "brilina/selected" }
  };

  assert.equal(await write.authorize(selectedContext, {
    owner: "ACME",
    repo: "SITE",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/selected"
  }), true);

  assert.equal(await write.authorize(selectedContext, {
    owner: "ACME",
    repo: "SITE",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/unselected"
  }), false);
});

test("write tools always reject the repository default branch even when selected in context", async () => {
  const service = { getRepository: async () => ({ default_branch: "main" }) } as unknown as GithubService;
  const tools = createGithubWriteTools(service);
  const write = tools.find(tool => tool.name === "github.write_file");
  assert.ok(write);
  const defaultBranchContext: ToolExecutionContext = {
    ...context,
    principal: { ...context.principal, branchName: "main" }
  };
  assert.equal(await write.authorize(defaultBranchContext, {
    owner: "acme", repo: "site", path: "src/app.ts", content: "new", branch: "main"
  }), false);
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
    },
    getFile: async () => ({
      path: "src/app.ts", sha: "readback-blob-2", encoding: "base64", content: btoa("new"),
      name: "app.ts", size: 3, html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts"
    })
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
  assert.equal(result.readBackVerified, true);
  assert.equal(result.readBackSha, "readback-blob-2");
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

test("a branch created during the current run becomes an authorized work branch", async () => {
  const service = {
    getRepository: async () => ({ default_branch: "main" }),
    createBranch: async (_owner: string, _repo: string, branchName: string) => ({
      branch: branchName,
      sha: "base-sha",
      url: "https://api.github.com/repos/acme/site/git/refs/heads/brilina/feature"
    })
  } as unknown as GithubService;
  const tools = createGithubWriteTools(service);
  const branchTool = tools.find(tool => tool.name === "github.create_work_branch");
  const writeTool = tools.find(tool => tool.name === "github.write_file");
  assert.ok(branchTool);
  assert.ok(writeTool);

  const branchArgs = { owner: "acme", repo: "site", branchName: "brilina/feature" };
  assert.equal(await branchTool.authorize(context, branchArgs), true);
  await branchTool.execute(context, branchArgs);

  assert.equal(await writeTool.authorize(context, {
    owner: "acme",
    repo: "site",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/feature"
  }), true);
});


test("write_file fails verification when GitHub read-back differs from requested content", async () => {
  const service = {
    writeFile: async () => ({
      content: { path: "src/app.ts", sha: "blob-2", html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts" },
      commit: { sha: "commit-2", html_url: "https://github.com/acme/site/commit/commit-2", message: "Update app" }
    }),
    getFile: async () => ({
      path: "src/app.ts", sha: "readback-blob-3", encoding: "base64", content: btoa("different"),
      name: "app.ts", size: 9, html_url: "https://github.com/acme/site/blob/brilina/feature/src/app.ts"
    })
  } as unknown as GithubService;

  const write = createGithubWriteTools(service).find(tool => tool.name === "github.write_file");
  assert.ok(write);
  await assert.rejects(
    () => write.execute(context, {
      owner: "acme", repo: "site", path: "src/app.ts", content: "expected", branch: "brilina/feature"
    }),
    /GitHub write verification failed/
  );
});

test("branches created by one run are not authorized in another run", async () => {
  const service = {
    getRepository: async () => ({ default_branch: "main" }),
    createBranch: async (_owner: string, _repo: string, branchName: string) => ({
      branch: branchName,
      sha: "base-sha",
      url: "https://api.github.com/repos/acme/site/git/refs/heads/brilina/isolated"
    })
  } as unknown as GithubService;
  const firstRunTools = createGithubWriteTools(service);
  const secondRunTools = createGithubWriteTools(service);
  const createBranch = firstRunTools.find(tool => tool.name === "github.create_work_branch");
  const secondRunWrite = secondRunTools.find(tool => tool.name === "github.write_file");
  assert.ok(createBranch);
  assert.ok(secondRunWrite);

  await createBranch.execute(context, {
    owner: "acme",
    repo: "site",
    branchName: "brilina/isolated"
  });

  assert.equal(await secondRunWrite.authorize(context, {
    owner: "acme",
    repo: "site",
    path: "src/app.ts",
    content: "new",
    branch: "brilina/isolated"
  }), false);
});

test("GitHub tool registry includes each read/write tool exactly once", async () => {
  const { createGithubReadTools } = await import("./github-read-context.js");
  const tools = createGithubReadTools({} as GithubService);
  const names = tools.map(tool => tool.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("github.read_file"));
  assert.ok(names.includes("github.get_diff"));
  assert.ok(names.includes("github.create_work_branch"));
  assert.ok(names.includes("github.create_file"));
  assert.ok(names.includes("github.update_file"));
  assert.ok(names.includes("github.write_file"));
});

