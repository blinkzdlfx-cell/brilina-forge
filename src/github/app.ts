import { config } from "../config.js";

export type GithubAppInstallation = {
  id: number;
  account: { id: number; login: string; type: string } | null;
  repository_selection: "all" | "selected";
  permissions: Record<string, unknown>;
  suspended_at?: string | null;
};

export type GithubAppRepository = {
  id: number;
  node_id?: string;
  name: string;
  full_name: string;
  private: boolean;
  archived: boolean;
  default_branch: string;
  owner: { login: string };
};

function base64Url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemBytes(pem: string): Uint8Array {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "").replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function createAppJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: now - 30, exp: now + 8 * 60, iss: config.githubApp.appId() }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(config.githubApp.privateKey()),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function githubRequest<T>(path: string, token: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Brilina-Forge",
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) {
    // Do not echo GitHub response bodies or authorization material into logs/errors.
    throw Object.assign(new Error(`GitHub App API request failed (HTTP ${response.status})`), {
      statusCode: response.status >= 500 ? 502 : response.status === 404 ? 404 : 403
    });
  }
  return await response.json() as T;
}

export async function getGithubAppInstallation(installationId: number): Promise<GithubAppInstallation> {
  if (!Number.isSafeInteger(installationId) || installationId <= 0) {
    throw Object.assign(new Error("Invalid GitHub App installation ID"), { statusCode: 400 });
  }
  return githubRequest<GithubAppInstallation>(`/app/installations/${installationId}`, await createAppJwt());
}

export async function createGithubInstallationToken(installationId: number): Promise<string> {
  const result = await githubRequest<{ token: string }>(
    `/app/installations/${installationId}/access_tokens`,
    await createAppJwt(),
    { method: "POST", body: JSON.stringify({}) , headers: { "Content-Type": "application/json" } }
  );
  if (!result.token) throw new Error("GitHub did not return an installation token");
  return result.token;
}

export async function listGithubInstallationRepositories(installationId: number): Promise<GithubAppRepository[]> {
  const token = await createGithubInstallationToken(installationId);
  const repositories: GithubAppRepository[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await githubRequest<{ repositories?: GithubAppRepository[]; total_count?: number }>(
      `/installation/repositories?per_page=100&page=${page}`, token
    );
    const batch = result.repositories ?? [];
    repositories.push(...batch);
    if (batch.length < 100 || repositories.length >= (result.total_count ?? repositories.length)) return repositories;
  }
  throw Object.assign(new Error("GitHub App repository listing exceeded the safety page limit"), { statusCode: 413 });
}

export async function verifyGithubAppWebhookSignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature || !/^sha256=[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.githubApp.webhookSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
  const supplied = signature.slice("sha256=".length).toLowerCase();
  if (expected.length !== supplied.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}
