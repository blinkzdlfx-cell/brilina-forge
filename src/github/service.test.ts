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
  });
});
