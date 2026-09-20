import { GithubClient } from "./client.js";
import type {
  GithubBranch,
  GithubFile,
  GithubGraphQLRepository,
  GithubRepository,
  GithubTreeEntry,
  GithubTreeResult,
  GithubUser
} from "./types.js";

const MAX_TREE_ENTRIES = 20_000;
const MAX_BRANCHES = 100;
const MAX_PAGE_SIZE = 100;
const MAX_NAME_LENGTH = 100;

function assertName(value: string, label: string): void {
  if (!value || value.length > MAX_NAME_LENGTH || /[\u0000-\u001f\u007f]/.test(value)) {
    throw Object.assign(new Error(`Invalid GitHub ${label}`), { statusCode: 400 });
  }
}

function assertRepo(owner: string, repo: string): void {
  assertName(owner, "owner");
  assertName(repo, "repository");
}

function assertRef(ref: string): void {
  if (!ref || ref.length > 512 || /[\u0000-\u001f\u007f]/.test(ref)) {
    throw Object.assign(new Error("Invalid GitHub ref"), { statusCode: 400 });
  }
}

function assertPath(path: string): void {
  if (!path || path.length > 4096 || path.split("/").some(part => part === "..") || /[\u0000]/.test(path)) {
    throw Object.assign(new Error("Invalid GitHub file path"), { statusCode: 400 });
  }
}

export class GithubService {
  constructor(private readonly client: GithubClient) {}

  getAuthenticatedUser(): Promise<GithubUser> {
    return this.client.rest("/user");
  }

  listRepositories(page = 1, perPage = 100): Promise<GithubRepository[]> {
    const safePage = Number.isInteger(page) && page >= 1 && page <= 100 ? page : 1;
    const safePerPage = Number.isInteger(perPage) && perPage >= 1 && perPage <= MAX_PAGE_SIZE ? perPage : 100;
    return this.client.rest(`/user/repos?visibility=all&affiliation=owner,collaborator,organization_member&sort=updated&direction=desc&page=${safePage}&per_page=${safePerPage}`);
  }

  getRepository(owner: string, repo: string): Promise<GithubRepository> {
    assertRepo(owner, repo);
    return this.client.rest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
  }

  async getRepositoryGraphQL(owner: string, repo: string): Promise<GithubGraphQLRepository> {
    assertRepo(owner, repo);
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
    if (!data.repository) throw Object.assign(new Error("GitHub repository was not found"), { statusCode: 404 });
    return data.repository;
  }

  listBranches(owner: string, repo: string): Promise<GithubBranch[]> {
    assertRepo(owner, repo);
    return this.client.rest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${MAX_BRANCHES}`);
  }

  async getRepositoryContext(owner: string, repo: string) {
    const graph = await this.getRepositoryGraphQL(owner, repo);
    const defaultBranch = graph.defaultBranchRef?.name;
    if (!defaultBranch) {
      return { repository: graph, branches: await this.listBranches(owner, repo), tree: null };
    }

    const [branches, tree] = await Promise.all([
      this.listBranches(owner, repo),
      this.getTree(owner, repo, defaultBranch, true)
    ]);

    return {
      repository: graph,
      defaultBranch,
      defaultCommitSha: graph.defaultBranchRef?.target.oid ?? null,
      branches,
      tree
    };
  }

  async getTree(owner: string, repo: string, ref: string, recursive = true): Promise<GithubTreeResult> {
    assertRepo(owner, repo);
    assertRef(ref);
    const result = await this.client.rest<GithubTreeResult>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=${recursive ? "1" : "0"}`
    );
    if (result.tree.length <= MAX_TREE_ENTRIES) return { ...result, limited: false };
    return { ...result, tree: result.tree.slice(0, MAX_TREE_ENTRIES), limited: true };
  }

  async getFile(owner: string, repo: string, path: string, ref?: string): Promise<GithubFile> {
    assertRepo(owner, repo);
    assertPath(path);
    if (ref) assertRef(ref);

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const result = await this.client.rest< GithubFile | GithubFile[] >(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`
    );

    if (Array.isArray(result)) {
      throw Object.assign(new Error("Requested path is a directory, not a file"), { statusCode: 400 });
    }
    return result;
  }
}
