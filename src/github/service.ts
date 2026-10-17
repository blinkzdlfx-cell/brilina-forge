import { GithubApiError, GithubClient } from "./client.js";
import type {
  GithubBranch,
  GithubCommit,
  GithubCompareResult,
  GithubFile,
  GithubGraphQLRepository,
  GithubRepository,
  GithubTreeResult,
  GithubUser
} from "./types.js";

const MAX_TREE_ENTRIES = 20_000;
const MAX_BRANCHES = 100;
const MAX_PAGE_SIZE = 100;
const MAX_NAME_LENGTH = 100;
const MAX_FILE_BYTES = 900_000;

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

function assertBranchName(branch: string): void {
  if (
    !branch ||
    branch.length > 255 ||
    branch.startsWith("/") ||
    branch.startsWith("-") ||
    branch.endsWith("/") ||
    branch.endsWith(".") ||
    branch.includes("..") ||
    branch.includes("//") ||
    branch.includes("@{") ||
    [" ", "\t", "\n", "~", "^", ":", "?", "*", "[", "]", "\\"].some(character => branch.includes(character)) || /[\u0000-\u001f\u007f]/.test(branch) ||
    branch.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".lock"))
  ) {
    throw Object.assign(new Error("Invalid Git branch name"), { statusCode: 400 });
  }
}

function assertPath(path: string): void {
  if (!path || path.length > 4096 || path.startsWith("/") || path.split("/").some(part => part === ".." || part === "." || part === "") || /[\u0000-\u001f\u007f]/.test(path)) {
    throw Object.assign(new Error("Invalid GitHub file path"), { statusCode: 400 });
  }
}

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value.replace(/\\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeRefPath(ref: string): string {
  return ref.split("/").map(encodeURIComponent).join("/");
}

type GithubWriteResponse = {
  content?: { path: string; sha: string; html_url: string } | null;
  commit: { sha: string; html_url: string; message: string };
};

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
    const result = await this.client.rest<GithubFile | GithubFile[]>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}${query}`
    );

    if (Array.isArray(result)) {
      throw Object.assign(new Error("Requested path is a directory, not a file"), { statusCode: 400 });
    }
    return result;
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<GithubCompareResult> {
    assertRepo(owner, repo);
    assertRef(base);
    assertRef(head);
    return this.client.rest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`
    );
  }

  async listCommits(owner: string, repo: string, ref?: string, perPage = 20): Promise<GithubCommit[]> {
    assertRepo(owner, repo);
    if (ref) assertRef(ref);
    const safePerPage = Number.isInteger(perPage) && perPage >= 1 && perPage <= 100 ? perPage : 20;
    const query = ref ? `?sha=${encodeURIComponent(ref)}&per_page=${safePerPage}` : `?per_page=${safePerPage}`;
    return this.client.rest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits${query}`
    );
  }

  /**
   * Create an isolated working branch. By default it branches from the repository's
   * default branch; callers may supply another existing base branch explicitly.
   */
  async createBranch(owner: string, repo: string, branchName: string, baseRef?: string): Promise<{ branch: string; sha: string; url: string }> {
    assertRepo(owner, repo);
    assertBranchName(branchName);
    const repository = await this.getRepository(owner, repo);
    const base = baseRef ?? repository.default_branch;
    assertBranchName(base);

    const ref = await this.client.rest<{ object: { sha: string } }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeRefPath(base)}`
    );
    const created = await this.client.rest<{ ref: string; object: { sha: string }; url: string }>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: ref.object.sha })
      }
    );
    return { branch: branchName, sha: created.object.sha, url: created.url };
  }

  private async assertWritableBranch(owner: string, repo: string, branch: string): Promise<void> {
    assertBranchName(branch);
    const repository = await this.getRepository(owner, repo);
    if (branch.toLowerCase() === repository.default_branch.toLowerCase()) {
      throw Object.assign(new Error("Refusing to write directly to the repository default branch. Create or select a working branch first."), { statusCode: 409 });
    }
    await this.client.rest(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeRefPath(branch)}`
    );
  }

  private async putFile(owner: string, repo: string, path: string, content: string, message: string, branch: string, sha?: string): Promise<GithubWriteResponse> {
    assertRepo(owner, repo);
    assertPath(path);
    await this.assertWritableBranch(owner, repo, branch);
    if (new TextEncoder().encode(content).byteLength > MAX_FILE_BYTES) {
      throw Object.assign(new Error(`File exceeds the ${MAX_FILE_BYTES}-byte write limit`), { statusCode: 413 });
    }
    const commitMessage = message.trim() || `Update ${path}`;
    if (commitMessage.length > 200 || /[\u0000-\u001f\u007f]/.test(commitMessage)) {
      throw Object.assign(new Error("Invalid commit message"), { statusCode: 400 });
    }

    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    return this.client.rest<GithubWriteResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: commitMessage,
          content: encodeBase64Utf8(content),
          branch,
          ...(sha ? { sha } : {})
        })
      }
    );
  }

  async writeFiles(
    owner: string,
    repo: string,
    files: Array<{ path: string; content: string }>,
    message: string,
    branch: string
  ): Promise<{ branch: string; files: Array<{ path: string; sha: string; htmlUrl: string }>; commit: { sha: string; html_url: string; message: string }; readBackVerified: true }> {
    assertRepo(owner, repo);
    await this.assertWritableBranch(owner, repo, branch);
    if (!Array.isArray(files) || files.length < 1 || files.length > 25) {
      throw Object.assign(new Error("Batch writes require between 1 and 25 files"), { statusCode: 400 });
    }
    const seenPaths = new Set<string>();
    let totalBytes = 0;
    for (const file of files) {
      assertPath(file.path);
      if (seenPaths.has(file.path)) throw Object.assign(new Error("Duplicate path in batch: " + file.path), { statusCode: 400 });
      seenPaths.add(file.path);
      if (typeof file.content !== "string") throw Object.assign(new Error("Each batch file must contain UTF-8 text"), { statusCode: 400 });
      const size = new TextEncoder().encode(file.content).byteLength;
      if (size > MAX_FILE_BYTES) throw Object.assign(new Error("File exceeds the per-file write limit: " + file.path), { statusCode: 413 });
      totalBytes += size;
    }
    if (totalBytes > 2_000_000) throw Object.assign(new Error("Batch exceeds the 2 MB total write limit"), { statusCode: 413 });
    const commitMessage = message.trim() || "Update " + files.length + " files";
    if (commitMessage.length > 200 || /[\u0000-\u001f\u007f]/.test(commitMessage)) {
      throw Object.assign(new Error("Invalid commit message"), { statusCode: 400 });
    }

    const prefix = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git`;
    const ref = await this.client.rest<{ object: { sha: string } }>(`${prefix}/ref/heads/${encodeRefPath(branch)}`);
    const parent = await this.client.rest<{ tree: { sha: string } }>(`${prefix}/commits/${ref.object.sha}`);
    const blobs = await Promise.all(files.map(async file => {
      const blob = await this.client.rest<{ sha: string }>(`${prefix}/blobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: encodeBase64Utf8(file.content), encoding: "base64" })
      });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    }));
    const tree = await this.client.rest<{ sha: string }>(`${prefix}/trees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_tree: parent.tree.sha, tree: blobs })
    });
    const commit = await this.client.rest<{ sha: string; html_url: string; message: string }>(`${prefix}/commits`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: commitMessage, tree: tree.sha, parents: [ref.object.sha] })
    });
    await this.client.rest(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs/heads/${encodeRefPath(branch)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false })
    });

    const verifiedFiles = await Promise.all(files.map(async file => {
      const readBack = await this.getFile(owner, repo, file.path, branch);
      if (decodeBase64Utf8(readBack.content) !== file.content) {
        throw new Error("GitHub batch write verification failed for " + file.path);
      }
      return { path: file.path, sha: readBack.sha, htmlUrl: readBack.html_url };
    }));
    return { branch, files: verifiedFiles, commit, readBackVerified: true };
  }

  async createFile(owner: string, repo: string, path: string, content: string, message: string, branch: string): Promise<GithubWriteResponse> {
    try {
      await this.getFile(owner, repo, path, branch);
      throw Object.assign(new Error(`File already exists at ${path}; use github.update_file or github.write_file`), { statusCode: 409 });
    } catch (error) {
      if (!(error instanceof GithubApiError) || error.status !== 404) throw error;
    }
    return this.putFile(owner, repo, path, content, message, branch);
  }

  async updateFile(owner: string, repo: string, path: string, content: string, message: string, branch: string): Promise<GithubWriteResponse> {
    const current = await this.getFile(owner, repo, path, branch);
    return this.putFile(owner, repo, path, content, message, branch, current.sha);
  }

  async writeFile(owner: string, repo: string, path: string, content: string, message: string, branch: string): Promise<GithubWriteResponse> {
    let current: GithubFile | undefined;
    try {
      current = await this.getFile(owner, repo, path, branch);
    } catch (error) {
      if (!(error instanceof GithubApiError) || error.status !== 404) throw error;
    }
    return this.putFile(owner, repo, path, content, message, branch, current?.sha);
  }
}
