export type GithubUser = {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
};

export type GithubRepository = {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  html_url: string;
  owner: { login: string };
};

export type GithubBranch = {
  name: string;
  protected: boolean;
  commit: { sha: string };
};

export type GithubTreeEntry = {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url?: string;
};

export type GithubFile = {
  name: string;
  path: string;
  sha: string;
  size: number;
  encoding: string;
  content: string;
  html_url: string;
};

export type GithubGraphQLRepository = {
  id: string;
  name: string;
  nameWithOwner: string;
  isPrivate: boolean;
  url: string;
  defaultBranchRef: { name: string; target: { oid: string } } | null;
  owner: { login: string };
};

export type GithubTokenResponse = {
  access_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
};

export type GithubRateLimit = {
  limit?: number;
  remaining?: number;
  resetAt?: number;
  retryAfterSeconds?: number;
};

export type GithubApiErrorDetails = {
  message?: string;
  documentation_url?: string;
  status: number;
  rateLimit: GithubRateLimit;
};

export type GithubTreeResult = {
  sha: string;
  tree: GithubTreeEntry[];
  truncated: boolean;
  limited: boolean;
};
