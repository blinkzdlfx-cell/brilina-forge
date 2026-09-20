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
});
