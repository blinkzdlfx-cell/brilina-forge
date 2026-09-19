import { GithubClient } from "./client.js";
import type {
  GithubBranch,
  GithubFile,
  GithubGraphQLRepository,
  GithubRepository,
  GithubTreeEntry,
  GithubUser
} from "./types.js";

export class GithubService {
  constructor(private readonly client: GithubClient) {}

  getAuthenticatedUser(): Promise<GithubUser> {
    return this.client.rest("/user");
  }

  listRepositories(page = 1, perPage = 100): Promise<GithubRepository[]> {
    return this.client.rest(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&page=${page}&per_page=${perPage}`);
  }

  getRepository(owner: string, repo: string): Promise<GithubRepository> {
    return this.client.rest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async getRepositoryGraphQL(owner: string, repo: string): Promise<GithubGraphQLRepository> {
    const query = `
      query RepositoryContext($owner: String!, $repo: String!) {
        repository(owner: $owner, name: $repo) {
          id
          name
          nameWithOwner
          isPrivate
          url
          owner { login }
          defaultBranchRef {
            name
            target { oid }
          }
        }
      }
    `;

    const data = await this.client.graphql<{ repository: GithubGraphQLRepository }>(
      query,
      { owner, repo }
    );
    if (!data.repository) throw new Error("GitHub repository was not found");
    return data.repository;
  }

  listBranches(owner: string, repo: string): Promise<GithubBranch[]> {
    return this.client.rest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100`);
  }

  getTree(owner: string, repo: string, ref: string, recursive = true): Promise<{ sha: string; tree: GithubTreeEntry[]; truncated: boolean }> {
    return this.client.rest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=${recursive ? "1" : "0"}`
    );
  }

  getFile(owner: string, repo: string, path: string, ref?: string): Promise<GithubFile> {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return this.client.rest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`
    );
  }
}
