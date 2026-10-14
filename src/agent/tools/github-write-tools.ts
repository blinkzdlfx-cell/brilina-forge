import type { GithubService } from "../../github/service.js";
import type { ForgeTool } from "../types.js";
import { scopedToConversation } from "./github-read-context.js";

export function createGithubWriteTools(service: GithubService): ForgeTool<{
  owner: string;
  repo: string;
  path: string;
  sha: string;
}> {
  return {
    name: "github.write_file",
    description: "Create or update a file in a GitHub repository using the current blob SHA.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        sha: { type: "string" },
      }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) {
      // In a real implementation, this would:
      // 1. Fetch the current blob SHA for the file path
      // 2. Send a PATCH request to update the file with the new content
      // 3. Handle stale SHA conflicts
      // 4. Return the updated file info
      throw new Error("Write tool not implemented yet - placeholder");
    },
  };
}

export function createGithubCreateTool(service: GithubService): ForgeTool<{
  owner: string;
  repo: string;
  path: string;
  content: string;
}> {
  return {
    name: "github.create_file",
    description: "Create a new file in a GitHub repository using the current blob SHA.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path", "content"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
      }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) {
      // In a real implementation, this would:
      // 1. Generate a new blob SHA for the new file
      // 2. Send a PUT request to create the file with the new SHA
      // 3. Return the created file info
      throw new Error("Create tool not implemented yet - placeholder");
    },
  };
}

export function createGithubUpdateTool(service: GithubService): ForgeTool<{
  owner: string;
  repo: string;
  path: string;
  content: string;
}> {
  return {
    name: "github.update_file",
    description: "Update an existing file in a GitHub repository using the current blob SHA.",
    inputSchema: {
      type: "object",
      required: ["owner", "repo", "path", "content"],
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
        content: { type: "string" },
      }
    },
    policy: "allowed",
    async authorize(context, args) { return scopedToConversation(context, args); },
    async execute(_context, args) {
      // In a real implementation, this would:
      // 1. Fetch the current blob SHA for the file path
      // 2. Send a PATCH request to update the file with new content
      // 3. Handle stale SHA conflicts
      // 4. Return the updated file info
      throw new Error("Update tool not implemented yet - placeholder");
    },
  };
}

export function createGithubWriteTools(service: GithubService): ForgeTool[] {
  return [
    createGithubCreateTool(service),
    createGithubUpdateTool(service),
    createGithubWriteTool(service),
  ];
}
