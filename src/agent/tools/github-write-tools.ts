import type { GithubService } from "../../github/service.js";
import type { ForgeTool, ToolExecutionContext } from "../types.js";

type RepositoryArgs = { owner: string; repo: string };
type BranchArgs = RepositoryArgs & { branchName: string; baseRef?: string };
type FileArgs = RepositoryArgs & { path: string; content: string; branch: string; message?: string };

function scopedToConversation(context: ToolExecutionContext, args: RepositoryArgs): boolean {
  const bound = context.principal.repositoryFullName?.trim();
  return Boolean(bound) && bound!.toLowerCase() === `${args.owner}/${args.repo}`.toLowerCase();
}

function validText(value: unknown, _label: string, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function authorizedWorkBranch(
  context: ToolExecutionContext,
  branch: string,
  branchesCreatedDuringRun: Set<string>
): boolean {
  const selectedBranch = context.principal.branchName?.trim();
  return Boolean(branch) && (
    (Boolean(selectedBranch) && selectedBranch!.toLowerCase() === branch.toLowerCase()) ||
    branchesCreatedDuringRun.has(branch.toLowerCase())
  );
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

export function createGithubCreateBranchTool(
  service: GithubService,
  branchesCreatedDuringRun: Set<string> = new Set()
): ForgeTool<BranchArgs> {
  return {
    name: "github.create_work_branch",
    description: "Create a new working branch for this conversation's selected repository. The branch is authorized for writes during this run; never write directly to the default branch.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "branchName"],
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 100 },
        repo: { type: "string", minLength: 1, maxLength: 100 },
        branchName: { type: "string", minLength: 1, maxLength: 255, description: "A unique branch name, preferably under brilina/." },
        baseRef: { type: "string", minLength: 1, maxLength: 255, description: "Optional base branch; defaults to the branch selected for this conversation, or the repository default branch when no branch is selected." }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      const selectedBranch = context.principal.branchName?.trim();
      const baseRefAllowed = args.baseRef === undefined
        ? true
        : validText(args.baseRef, "base ref", 255) &&
          Boolean(selectedBranch) &&
          args.baseRef.toLowerCase() === selectedBranch!.toLowerCase();
      return scopedToConversation(context, args) &&
        validText(args.branchName, "branch name", 255) &&
        baseRefAllowed;
    },
    async execute(context, args) {
      const result = await service.createBranch(
        args.owner,
        args.repo,
        args.branchName,
        args.baseRef ?? context.principal.branchName
      );
      branchesCreatedDuringRun.add(result.branch.toLowerCase());
      return result;
    }
  };
}

export function createGithubCreateTool(
  service: GithubService,
  branchesCreatedDuringRun: Set<string>
): ForgeTool<FileArgs> {
  return {
    name: "github.create_file",
    description: "Create a new UTF-8 text file on the selected working branch or a working branch created during this run. Fails if the path already exists.",
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
        authorizedWorkBranch(context, args.branch, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.createFile(args.owner, args.repo, args.path, args.content, args.message ?? `Create ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "created");
    }
  };
}

export function createGithubUpdateTool(
  service: GithubService,
  branchesCreatedDuringRun: Set<string>
): ForgeTool<FileArgs> {
  return {
    name: "github.update_file",
    description: "Replace an existing UTF-8 text file on the selected working branch or a working branch created during this run, using its current blob SHA.",
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
        authorizedWorkBranch(context, args.branch, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.updateFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "updated");
    }
  };
}

export function createGithubWriteTool(
  service: GithubService,
  branchesCreatedDuringRun: Set<string>
): ForgeTool<FileArgs> {
  return {
    name: "github.write_file",
    description: "Create or update a UTF-8 text file on the selected working branch or a working branch created during this run. It commits the change to that branch.",
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
        authorizedWorkBranch(context, args.branch, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.writeFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return normalizedWriteResult(result, args.branch, "written");
    }
  };
}

export function createGithubWriteTools(service: GithubService): ForgeTool[] {
  const branchesCreatedDuringRun = new Set<string>();
  return [
    createGithubCreateBranchTool(service, branchesCreatedDuringRun),
    createGithubCreateTool(service, branchesCreatedDuringRun),
    createGithubUpdateTool(service, branchesCreatedDuringRun),
    createGithubWriteTool(service, branchesCreatedDuringRun)
  ];
}
