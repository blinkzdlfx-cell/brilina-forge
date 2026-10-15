import test from "node:test";
import assert from "node:assert/strict";
import { createGithubGetRepositoryTool } from "./github-read-repository.js";
import { createGithubGetRepositoryContextTool } from "./github-read-context.js";

test("GitHub repository tool is a real read-only Forge tool adapter", async () => {
  const service = {
    async getRepository(owner: string, repo: string) {
      return { full_name: owner + "/" + repo, private: true };
    }
  } as never;
  const tool = createGithubGetRepositoryTool(service);
  const result = await tool.execute({ principal: { userId: "u", workspaceId: "w" }, runId: "r" }, { owner: "owner", repo: "repo" });
  assert.deepEqual(result, { full_name: "owner/repo", private: true });
  assert.equal(tool.policy, "allowed");
  assert.equal(tool.name, "github.get_repository");
});


test("repository context tool uses the conversation-bound repository without model-supplied owner/repo", async () => {
  const service = {
    async getRepositoryContext(owner: string, repo: string) {
      return { repository: owner + "/" + repo, branches: ["main"] };
    }
  } as never;
  const tool = createGithubGetRepositoryContextTool(service);
  const context = {
    principal: { userId: "u", workspaceId: "w", repositoryFullName: "blinkzdlfx-cell/Brilina-Forge" },
    runId: "r"
  };
  assert.equal(await tool.authorize(context, {}), true);
  assert.deepEqual(await tool.execute(context, {}), {
    repository: "blinkzdlfx-cell/Brilina-Forge",
    branches: ["main"]
  });
  assert.deepEqual(tool.inputSchema, {
    type: "object",
    properties: {},
    additionalProperties: false
  });
  assert.equal(await tool.authorize({ principal: { userId: "u", workspaceId: "w" }, runId: "r" }, {}), false);
});
