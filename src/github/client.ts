import type { GithubApiErrorDetails, GithubRateLimit } from "./types.js";

const API_VERSION = "2022-11-28";
const REST_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown,
    public readonly rateLimit: GithubRateLimit = {}
  ) {
    super(message);
    this.name = "GithubApiError";
  }
}

export class GithubClient {
  constructor(private readonly accessToken: string) {}

  async rest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${REST_BASE}${path}`, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-GitHub-Api-Version": API_VERSION,
        ...(init.headers ?? {})
      }
    });

    return this.parseResponse<T>(response);
  }

  async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-GitHub-Api-Version": API_VERSION,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query, variables })
    });

    const body = await response.json().catch(() => undefined) as { data?: T; errors?: unknown };
    if (!response.ok || body.errors) {
      const rateLimit = readRateLimit(response.headers);
      throw new GithubApiError(
        "GitHub GraphQL request failed",
        response.status,
        sanitizeGithubBody(body),
        rateLimit
      );
    }
    return body.data as T;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      const rateLimit = readRateLimit(response.headers);
      throw new GithubApiError(
        `GitHub REST request failed with status ${response.status}`,
        response.status,
        sanitizeGithubBody(body),
        rateLimit
      );
    }
    return body as T;
  }
}

function readRateLimit(headers: Headers): GithubRateLimit {
  const numberHeader = (name: string): number | undefined => {
    const value = headers.get(name);
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const retry = numberHeader("retry-after");
  const reset = numberHeader("x-ratelimit-reset");
  return {
    limit: numberHeader("x-ratelimit-limit"),
    remaining: numberHeader("x-ratelimit-remaining"),
    resetAt: reset,
    retryAfterSeconds: retry
  };
}

function sanitizeGithubBody(body: unknown): GithubApiErrorDetails {
  const value = body && typeof body === "object" ? body as Record<string, unknown> : {};
  return {
    message: typeof value.message === "string" ? value.message : undefined,
    documentation_url: typeof value.documentation_url === "string" ? value.documentation_url : undefined,
    status: 0,
    rateLimit: {}
  };
}
