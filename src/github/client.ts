const API_VERSION = "2022-11-28";
const REST_BASE = "https://api.github.com";
const GRAPHQL_URL = "https://api.github.com/graphql";

export class GithubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody?: unknown
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
      throw new GithubApiError("GitHub GraphQL request failed", response.status, body);
    }
    return body.data as T;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const body = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new GithubApiError(
        `GitHub REST request failed with status ${response.status}`,
        response.status,
        body
      );
    }
    return body as T;
  }
}
