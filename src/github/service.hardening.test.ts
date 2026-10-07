import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { GithubService } from "./service.js";

describe("GithubService hardening", () => {
  it("rejects unsafe file paths before calling GitHub", async () => {
    const fakeClient = {
      rest: async () => { throw new Error("GitHub should not be called"); },
      graphql: async () => { throw new Error("GitHub should not be called"); }
    };
    const service = new GithubService(fakeClient as never);
    await assert.rejects(
      () => service.getFile("owner", "repo", "../secret", "main"),
      /Invalid GitHub file path/
    );
  });

  it("rejects invalid refs before calling GitHub", async () => {
    const fakeClient = {
      rest: async () => { throw new Error("GitHub should not be called"); },
      graphql: async () => { throw new Error("GitHub should not be called"); }
    };
    const service = new GithubService(fakeClient as never);
    await assert.rejects(
      () => service.getTree("owner", "repo", "", true),
      /Invalid GitHub ref/
    );
  });

  it("rejects an empty branch comparison base before calling GitHub", async () => {
    const fakeClient = {
      rest: async () => { throw new Error("GitHub should not be called"); },
      graphql: async () => { throw new Error("GitHub should not be called"); }
    };
    const service = new GithubService(fakeClient as never);
    await assert.rejects(
      () => service.compareBranches("owner", "repo", "", "main"),
      /Invalid GitHub ref/
    );
  });

  it("builds the GitHub compare URL for two refs", async () => {
    let capturedPath = "";
    const fakeClient = {
      rest: async (path: string) => {
        capturedPath = path;
        return { status: "ahead", ahead_by: 1, behind_by: 0, total_commits: 1, files: [] };
      },
      graphql: async () => { throw new Error("GraphQL should not be called"); }
    };
    const service = new GithubService(fakeClient as never);
    const result = await service.compareBranches("owner name", "repo", "main", "feature/a b");

    assert.match(capturedPath, /^\/repos\/owner%20name\/repo\/compare\/main\.\.\.feature%2Fa%20b$/);
    assert.equal(result.ahead_by, 1);
  });
});
