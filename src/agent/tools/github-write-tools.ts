import type { GithubService } from "../../github/service.js";
import type { ForgeTool, ToolExecutionContext } from "../types.js";

type RepositoryArgs = { owner: string; repo: string };
type BranchArgs = RepositoryArgs & { branchName: string; baseRef?: string };
type FileArgs = RepositoryArgs & { path: string; content: string; branch: string; message?: string };
type PushFilesArgs = RepositoryArgs & { files: Array<{ path: string; content: string }>; branch: string; message?: string };

function scopedToConversation(context: ToolExecutionContext, args: RepositoryArgs): boolean {
  const bound = context.principal.repositoryFullName?.trim();
  return Boolean(bound) && bound!.toLowerCase() === `${args.owner}/${args.repo}`.toLowerCase();
}

function validText(value: unknown, _label: string, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

async function authorizedWorkBranch(
  service: GithubService,
  context: ToolExecutionContext,
  args: FileArgs,
  branchesCreatedDuringRun: Set<string>
): Promise<boolean> {
  const branch = args.branch.trim();
  if (!branch) return false;

  // Enforce this against GitHub's current repository metadata, not a UI flag
  // or model-supplied claim. Even if the selected context is the default
  // branch, writes must first create/select a separate working branch.
  const repository = await service.getRepository(args.owner, args.repo);
  const defaultBranch = repository.default_branch?.trim().toLowerCase();
  if (!defaultBranch || branch.toLowerCase() === defaultBranch) return false;

  const selectedBranch = context.principal.branchName?.trim();
  return (
    (Boolean(selectedBranch) &&
      selectedBranch!.toLowerCase() === branch.toLowerCase() &&
      selectedBranch!.toLowerCase() !== defaultBranch) ||
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

function decodeGithubFileContent(file: { encoding: string; content: string }): string {
  if (file.encoding === "utf-8" || file.encoding === "utf8") return file.content;
  if (file.encoding !== "base64") throw new Error("GitHub returned an unsupported file encoding during write verification");
  const binary = atob(file.content.replace(/\\s/g, ""));
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function verifyWriteResult(
  service: GithubService,
  args: FileArgs,
  writeResult: {
    content?: { path: string; sha: string; html_url: string } | null;
    commit: { sha: string; html_url: string; message: string };
  },
  operation: string
) {
  const readBack = await service.getFile(args.owner, args.repo, args.path, args.branch);
  if (decodeGithubFileContent(readBack) !== args.content) {
    throw new Error("GitHub write verification failed: read-back content did not match the requested content");
  }

  return {
    ...normalizedWriteResult(writeResult, args.branch, operation),
    readBackVerified: true,
    readBackSha: readBack.sha
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
        await authorizedWorkBranch(service, context, args, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.createFile(args.owner, args.repo, args.path, args.content, args.message ?? `Create ${args.path}`, args.branch);
      return verifyWriteResult(service, args, result, "created");
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
        await authorizedWorkBranch(service, context, args, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.updateFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return verifyWriteResult(service, args, result, "updated");
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
        await authorizedWorkBranch(service, context, args, branchesCreatedDuringRun) &&
        typeof args.content === "string" &&
        new TextEncoder().encode(args.content).byteLength <= 900000 &&
        (args.message === undefined || (validText(args.message, "message", 200) && !/[\u0000-\u001f\u007f]/.test(args.message)));
    },
    async execute(_context, args) {
      const result = await service.writeFile(args.owner, args.repo, args.path, args.content, args.message ?? `Update ${args.path}`, args.branch);
      return verifyWriteResult(service, args, result, "written");
    }
  };
}

export function createGithubPushFilesTool(
  service: GithubService,
  branchesCreatedDuringRun: Set<string>
): ForgeTool<PushFilesArgs> {
  return {
    name: "github.push_files",
    description: "Create or update up to 25 UTF-8 text files on one authorized working branch and commit the batch atomically. Forge reads every file back before reporting success.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "files", "branch"],
      properties: {
        owner: { type: "string", minLength: 1, maxLength: 100 },
        repo: { type: "string", minLength: 1, maxLength: 100 },
        files: {
          type: "array",
          minItems: 1,
          maxItems: 25,
          items: {
            type: "object",
            required: ["path", "content"],
            properties: {
              path: { type: "string", minLength: 1, maxLength: 4096 },
              content: { type: "string", maxLength: 900000 }
            },
            additionalProperties: false
          }
        },
        branch: { type: "string", minLength: 1, maxLength: 255 },
        message: { type: "string", maxLength: 200 }
      },
      additionalProperties: false
    },
    policy: "allowed",
    async authorize(context, args) {
      if (!scopedToConversation(context, args) ||
          !validText(args.branch, "branch", 255) ||
          !Array.isArray(args.files) ||
          args.files.length < 1 || args.files.length > 25) return false;
      const paths = new Set<string>();
      let totalBytes = 0;
      for (const file of args.files) {
        if (!file || !validText(file.path, "path", 4096) || typeof file.content !== "string") return false;
        if (paths.has(file.path)) return false;
        paths.add(file.path);
        const size = new TextEncoder().encode(file.content).byteLength;
        if (size > 900000) return false;
        totalBytes += size;
      }
      if (totalBytes > 2_000_000) return false;
      if (args.message !== undefined && (!validText(args.message, "message", 200) || /[\\u0000-\\u001f\\u007f]/.test(args.message))) return false;
      const first = args.files[0];
      return await authorizedWorkBranch(service, context, {
        owner: args.owner, repo: args.repo, path: first.path, content: first.content, branch: args.branch
      }, branchesCreatedDuringRun);
    },
    async execute(_context, args) {
      const result = await service.writeFiles(args.owner, args.repo, args.files, args.message ?? `Update ${args.files.length} files`, args.branch);
      return {
        success: true,
        operation: "batch_written",
        branch: result.branch,
        path: null,
        files: result.files,
        commitSha: result.commit.sha,
        commitUrl: result.commit.html_url,
        commitMessage: result.commit.message,
        readBackVerified: result.readBackVerified
      };
    }
  };
}

export function createGithubWriteTools(service: GithubService): ForgeTool[] {
  const branchesCreatedDuringRun = new Set<string>();
  return [
    createGithubCreateBranchTool(service, branchesCreatedDuringRun),
    createGithubCreateTool(service, branchesCreatedDuringRun),
    createGithubUpdateTool(service, branchesCreatedDuringRun),
    createGithubWriteTool(service, branchesCreatedDuringRun),
    createGithubPushFilesTool(service, branchesCreatedDuringRun)
  ];
}
