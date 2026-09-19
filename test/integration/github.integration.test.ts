import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GithubClient } from "../../src/github/client.js";
import { GithubService } from "../../src/github/service.js";

describe("GitHub integration", () => {
  it("discovers the authenticated account and selected repository", async (t) => {
    const token = process.env.GITHUB_ACCESS_TOKEN;
    if (!token) {
      t.skip("Set GITHUB_ACCESS_TOKEN to run the real GitHub integration test.");
      return;
    }

    const service = new GithubService(new GithubClient(token));
    const user = await service.getAuthenticatedUser();
    const repository = await service.getRepository("blinkzdlfx-cell", "brilina-forge");
    const graph = await service.getRepositoryGraphQL("blinkzdlfx-cell", "brilina-forge");
    const branches = await service.listBranches("blinkzdlfx-cell", "brilina-forge");
    const context = await service.getRepositoryContext("blinkzdlfx-cell", "brilina-forge");
    const readme = await service.getFile("blinkzdlfx-cell", "brilina-forge", "README.md", "main");

    assert.ok(user.login);
    assert.equal(repository.full_name, "blinkzdlfx-cell/brilina-forge");
    assert.equal(graph.nameWithOwner, "blinkzdlfx-cell/brilina-forge");
    assert.ok(branches.some(branch => branch.name === "main"));
    assert.equal(context.defaultBranch, "main");
    assert.ok(context.tree?.tree.some(entry => entry.path === "README.md"));
    assert.match(Buffer.from(readme.content, "base64").toString("utf8"), /Brilina Forge/);
  });
});
