import test from "node:test";
import assert from "node:assert/strict";
import { createGithubGetRepositoryTool } from "./github-read-repository.js";

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
