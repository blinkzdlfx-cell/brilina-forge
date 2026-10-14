import type { GithubService } from "../../github/service.js";
import type { ForgeTool, ToolExecutionContext } from "../types.js";

type RepositoryArgs = { owner: string; repo: string };
type BranchArgs = RepositoryArgs & { branchName: string; baseRef?: string };
type FileArgs = RepositoryArgs & { path: string; content: string; branch: string; message?: string };

function scopedToConversation(context: ToolExecutionContext, args: RepositoryArgs): boolean {
  const bound = context.principal.repositoryFullName?.trim();
  return Boolean(bound) && bound!.toLowerCase() === `${args.owner}/${args.repo}`.toLowerCase();
}

function validText(value: unknown, label: string, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function normalizedWriteResult(result: {
  content?: { path: string; sha: string; html_url: string } | null;
  commit: { sha: string; html_url: string; message: string };
}, branch: string, operation: string) {
  return {
    success: true,
    operation,
    branch,
    path: result.content?.path ?? null,
    fileUrl: result.content?.html_url ?? null,
    contentSha: result.content?.sha ?? null,
    commitSha: result.commit.sha,
    commitUrl: result.commit.html_url,
    commitMessage: result.commit.message
  };
}

export function createGithubCreateBranchTool(service: GithubService): ForgeTool<BranchArgs> {
  return {
    name: "github.create_work_branch",
    description: "Create a new working branch for this repository. Use this before editing files; never write directly to the default branch.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "branchName"],
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 100 },
        repo: { type: "string", minLength: 1, maxLength: 100 },
        branchName: { type: "string", minLength: 1, maxLength: 255, description: "A unique branch name, preferably under brilina/." },
        baseRef: { type: "string", description: "Optional existing branch to branch from; defaults to the repository default branch." }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      return scopedToConversation(context, args) && validText(args.branchName, "branch name", 255);
    },
    async execute(_context, args) {
      return await service.createBranch(args.owner, args.repo, args.branchName, args.baseRef);
    }
  };
}

export function createGithubCreateTool(service: GithubService): ForgeTool<FileArgs> {
  return {
    name: "github.create_file",
    description: "Create a new UTF-8 text file on an existing non-default working branch. Fails if the path already exists.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path", "content", "branch"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", minLength: 1, maxLength: 4096 },
        content: { type: "string", maxLength: 900000 },
        branch: { type: "string", minLength: 1, maxLength: 255 },
        message: { type: "string", maxLength: 200 }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      return scopedToConversation(context, args) &&
        validText(args.path, "path", 4096) &&
        validText(args.branch, "branch", 255) &&
        typeof args.content === "string" &&
        (args.message === undefined || typeof args.message === "string");
    },
    async execute(_context, args) {
      const result = await service.createFile(args.owner, args.repo, args.path, args.content, args.message ?? `Create ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "created");
    }
  };
}

export function createGithubUpdateTool(service: GithubService): ForgeTool<FileArgs> {
  return {
    name: "github.update_file",
    description: "Replace an existing UTF-8 text file on an existing non-default working branch using its current blob SHA.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path", "content", "branch"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", minLength: 1, maxLength: 4096 },
        content: { type: "string", maxLength: 900000 },
        branch: { type: "string", minLength: 1, maxLength: 255 },
        message: { type: "string", maxLength: 200 }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      return scopedToConversation(context, args) &&
        validText(args.path, "path", 4096) &&
        validText(args.branch, "branch", 255) &&
        typeof args.content === "string" &&
        (args.message === undefined || typeof args.message === "string");
    },
    async execute(_context, args) {
      const result = await service.updateFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "updated");
    }
  };
}

export function createGithubWriteTool(service: GithubService): ForgeTool<FileArgs> {
  return {
    name: "github.write_file",
    description: "Create or update a UTF-8 text file on an existing non-default working branch. Use this for an intentional file change; it commits the change to that branch.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path", "content", "branch"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string", minLength: 1, maxLength: 4096 },
        content: { type: "string", maxLength: 900000 },
        branch: { type: "string", minLength: 1, maxLength: 255 },
        message: { type: "string", maxLength: 200 }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      return scopedToConversation(context, args) &&
        validText(args.path, "path", 4096) &&
        validText(args.branch, "branch", 255) &&
        typeof args.content === "string" &&
        (args.message === undefined || typeof args.message === "string");
    },
    async execute(_context, args) {
      const result = await service.writeFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "written");
    }
  };
}

export function createGithubWriteTools(service: GithubService): ForgeTool[] {
  return [
    createGithubCreateBranchTool(service),
    createGithubCreateTool(service),
    createGithubUpdateTool(service),
    createGithubWriteTool(service)
  ];
}
