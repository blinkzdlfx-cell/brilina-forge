import type { ForgeTool } from "./types.js";

/**
 * Forge-owned metadata for native GitHub tools. This catalog controls what the
 * model can discover; it is not an authorization boundary. Mandatory policy
 * checks still run in the controller and each tool's authorize implementation.
 */
export type GithubToolCategory =
  | "repository-read"
  | "branch-read"
  | "file-read"
  | "diff-review"
  | "branch-write"
  | "file-write"
  | "issue-management"
  | "pull-request-management"
  | "actions-and-checks"
  | "releases-and-deployments"
  | "security-administration";

export type GithubToolRisk = "read" | "write" | "high";

export type GithubToolDefinition = {
  name: string;
  category: GithubToolCategory;
  risk: GithubToolRisk;
  defaultEnabled: boolean;
  description: string;
};

const DEFINITIONS: GithubToolDefinition[] = [
  { name: "github.get_repository", category: "repository-read", risk: "read", defaultEnabled: true, description: "Read metadata for the conversation's selected repository." },
  { name: "github.get_repository_context", category: "repository-read", risk: "read", defaultEnabled: true, description: "Read the selected repository's identity, default branch, branches, and tree." },
  { name: "github.list_branches", category: "branch-read", risk: "read", defaultEnabled: true, description: "List branches in the selected repository." },
  { name: "github.get_tree", category: "file-read", risk: "read", defaultEnabled: true, description: "Read the file tree at a selected ref." },
  { name: "github.read_file", category: "file-read", risk: "read", defaultEnabled: true, description: "Read a file at a selected ref." },
  { name: "github.get_diff", category: "diff-review", risk: "read", defaultEnabled: true, description: "Compare refs and inspect changed-file metadata." },
  { name: "github.create_work_branch", category: "branch-write", risk: "write", defaultEnabled: true, description: "Create a work branch in the selected repository." },
  { name: "github.create_file", category: "file-write", risk: "write", defaultEnabled: true, description: "Create a file on an authorized work branch and verify it by reading it back." },
  { name: "github.update_file", category: "file-write", risk: "write", defaultEnabled: true, description: "Replace a file on an authorized work branch and verify it by reading it back." },
  { name: "github.write_file", category: "file-write", risk: "write", defaultEnabled: true, description: "Create or update a file on an authorized work branch and verify it by reading it back." }
];

const DEFINITION_BY_NAME = new Map(DEFINITIONS.map(definition => [definition.name, definition]));

export function listGithubToolDefinitions(): GithubToolDefinition[] {
  return DEFINITIONS.map(definition => ({ ...definition }));
}

export function getGithubToolDefinition(name: string): GithubToolDefinition | undefined {
  const definition = DEFINITION_BY_NAME.get(name);
  return definition ? { ...definition } : undefined;
}

/**
 * Availability preferences may only narrow the tool list. Unknown tools are
 * omitted until they are explicitly catalogued. The controller must also
 * reject calls to disabled tools so model-side hallucinations cannot bypass
 * this filter.
 */
export function filterAvailableGithubTools<T extends Pick<ForgeTool, "name">>(
  tools: T[],
  enabledNames?: ReadonlySet<string>,
  enabledCategories?: ReadonlySet<GithubToolCategory>
): T[] {
  return tools.filter(tool => {
    const definition = DEFINITION_BY_NAME.get(tool.name);
    if (!definition) return true; // Non-GitHub tools have their own policy.
    if (!definition.defaultEnabled) return false;
    if (enabledNames && !enabledNames.has(tool.name)) return false;
    if (enabledCategories && !enabledCategories.has(definition.category)) return false;
    return true;
  });
}

/** Safe default preferences: only catalogued core coding tools are available. */
export function defaultEnabledGithubToolNames(): Set<string> {
  return new Set(DEFINITIONS.filter(definition => definition.defaultEnabled).map(definition => definition.name));
}

export function defaultEnabledGithubToolCategories(): Set<GithubToolCategory> {
  return new Set([
    "repository-read",
    "branch-read",
    "file-read",
    "diff-review",
    "branch-write",
    "file-write"
  ]);
}
