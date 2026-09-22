import type { GithubService } from "../../github/service.js";
import type { ForgeTool } from "../types.js";

export function createGithubGetRepositoryTool(service: GithubService): ForgeTool<{ owner: string; repo: string }> {
  return {
    name: "github.get_repository",
    description: "Read metadata for a GitHub repository.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo"],
      properties: { owner: { type: "string" }, repo: { type: "string" } }
    },
    policy: "allowed",
    async authorize(context, args) {
      return !context.principal.repositoryFullName || context.principal.repositoryFullName === args.owner + "/" + args.repo;
    },
    async execute(_context, args) { return service.getRepository(args.owner, args.repo); }
  };
}
