import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";
import type { GithubTokenResponse, GithubUser } from "../github/types.js";

type OAuthState = {
  value: string;
  verifier: string;
  expiresAt: number;
};

const states = new Map<string, OAuthState>();
const STATE_TTL_MS = 10 * 60_000;
const MAX_PENDING_STATES = 500;
export const OAUTH_STATE_COOKIE = "brilina_oauth_state";

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function purgeExpiredStates(): void {
  const now = Date.now();
  for (const [key, state] of states) {
    if (state.expiresAt <= now) states.delete(key);
  }
  // Bound the pending-authorization map so repeated auth starts cannot grow it
  // without limit.
  while (states.size > MAX_PENDING_STATES) {
    const oldest = states.keys().next();
    if (oldest.done) break;
    states.delete(oldest.value);
  }
}

/**
 * Binds the OAuth `state` to the browser that started the flow. Without this,
 * an attacker can complete their own authorization and hand the victim a
 * callback URL, logging the victim into the attacker's GitHub account.
 */
export function verifyStateBinding(cookieValue: string | undefined, presented: string): boolean {
  if (!cookieValue) return false;
  return timingSafeEqualText(cookieValue, presented);
}

function timingSafeEqualText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export function createGithubAuthorizationUrl(): string {
  purgeExpiredStates();
  const state = randomBytes(32).toString("hex");
  const { verifier, challenge } = createPkcePair();
  states.set(state, { value: state, verifier, expiresAt: Date.now() + STATE_TTL_MS });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId());
  url.searchParams.set("redirect_uri", config.github.callbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export async function exchangeGithubCode(code: string, state: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  user: GithubUser;
}> {
  purgeExpiredStates();
  const saved = states.get(state);
  states.delete(state);
  if (!saved || saved.expiresAt < Date.now() || saved.value !== state) {
    throw new Error("Invalid or expired GitHub OAuth state");
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId(),
      client_secret: config.github.clientSecret(),
      code,
      redirect_uri: config.github.callbackUrl(),
      state,
      code_verifier: saved.verifier
    })
  });

  const token = await response.json() as GithubTokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description ?? token.error ?? "GitHub OAuth token exchange failed");
  }

  const user = await fetchGithubUser(token.access_token);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? Date.now() + token.refresh_token_expires_in * 1000
      : undefined,
    user
  };
}

export async function refreshGithubAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
}> {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId(),
      client_secret: config.github.clientSecret(),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const token = await response.json() as GithubTokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description ?? token.error ?? "GitHub token refresh failed");
  }

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    refreshTokenExpiresAt: token.refresh_token_expires_in
      ? Date.now() + token.refresh_token_expires_in * 1000
      : undefined
  };
}

async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!response.ok) throw new Error("GitHub identity lookup failed");
  return await response.json() as GithubUser;
}
