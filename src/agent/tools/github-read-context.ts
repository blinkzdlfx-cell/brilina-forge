import type { GithubService } from "../../github/service.js";
import type { ForgeTool } from "../types.js";
import { createGithubGetRepositoryTool } from "./github-read-repository.js";

/**
 * Repository-scoped authorization.
 *
 * A conversation must have a repository bound before any repository read tool
 * may run. An unbound conversation would otherwise let the model read anything
 * the user's GitHub token can reach, which breaks the
 * identity -> workspace -> repository chain. Comparison is case-insensitive
 * because GitHub owner/repo casing is not significant.
 */
export function scopedToConversation(
  context: { principal: { repositoryFullName?: string } },
  args: { owner: string; repo: string }
): boolean {
  const bound = context.principal.repositoryFullName?.trim();
  if (!bound) return false;
  return bound.toLowerCase() === `${args.owner}/${args.repo}`.toLowerCase();
}

export function createGithubListBranchesTool(service: GithubService): ForgeTool<{ owner: string; repo: string }> {
  return {
    name: "github.list_branches",
    description: "List the branches of a GitHub repository.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo"],
      properties: { owner: { type: "string" }, repo: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) { return service.listBranches(args.owner, args.repo); }
  };
}

export function createGithubGetTreeTool(service: GithubService): ForgeTool<{ owner: string; repo: string; ref: string }> {
  return {
    name: "github.get_tree",
    description: "Read the file tree of a GitHub repository at a ref.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "ref"],
      properties: { owner: { type: "string" }, repo: { type: "string" }, ref: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) { return service.getTree(args.owner, args.repo, args.ref, true); }
  };
}

export function createGithubReadFileTool(service: GithubService): ForgeTool<{ owner: string; repo: string; path: string; ref?: string }> {
  return {
    name: "github.read_file",
    description: "Read one file from a GitHub repository. Prefer progressive reads over reading the whole repository.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        ref: { type: "string" }
      }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) { return service.getFile(args.owner, args.repo, args.path, args.ref); }
  };
}

export function createGithubGetRepositoryContextTool(service: GithubService): ForgeTool<{ owner: string; repo: string }> {
  return {
    name: "github.get_repository_context",
    description: "Read aggregated repository context: identity, default branch, branches and file tree.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo"],
      properties: { owner: { type: "string" }, repo: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) { return service.getRepositoryContext(args.owner, args.repo); }
  };
}

export function createGithubGetDiffTool(service: GithubService): ForgeTool<{ owner: string; repo: string; base: string; head: string }> {
  return {
    name: "github.get_diff",
    description: "Compare two refs in a GitHub repository and read the changed files.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "base", "head"],
      properties: { owner: { type: "string" }, repo: { type: "string" }, base: { type: "string" }, head: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) { return service.compareBranches(args.owner, args.repo, args.base, args.head); }
  };
}

export function createGithubReadTools(service: GithubService): ForgeTool[] {
  return [
    createGithubGetRepositoryTool(service),
    createGithubGetRepositoryContextTool(service),
    createGithubListBranchesTool(service),
    createGithubGetTreeTool(service),
    createGithubReadFileTool(service),
    createGithubGetDiffTool(service)
  ];
}