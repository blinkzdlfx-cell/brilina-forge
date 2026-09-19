import { randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";
import type { GithubTokenResponse, GithubUser } from "../github/types.js";

type OAuthState = { value: string; expiresAt: number };

const states = new Map<string, OAuthState>();

export function createGithubAuthorizationUrl(): string {
  const state = randomBytes(32).toString("hex");
  states.set(state, { value: state, expiresAt: Date.now() + 10 * 60_000 });

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.github.clientId());
  url.searchParams.set("redirect_uri", config.github.callbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export async function exchangeGithubCode(code: string, state: string): Promise<{ accessToken: string; user: GithubUser }> {
  const saved = states.get(state);
  states.delete(state);
  if (!saved || saved.expiresAt < Date.now()) throw new Error("Invalid or expired GitHub OAuth state");

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.github.clientId(),
      client_secret: config.github.clientSecret(),
      code,
      redirect_uri: config.github.callbackUrl(),
      state
    })
  });

  const token = await response.json() as GithubTokenResponse;
  if (!response.ok || !token.access_token) {
    throw new Error(token.error_description ?? token.error ?? "GitHub OAuth token exchange failed");
  }

  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });

  if (!userResponse.ok) throw new Error("GitHub identity lookup failed");
  return { accessToken: token.access_token, user: await userResponse.json() as GithubUser };
}

export function createSessionId(): string {
  return randomBytes(32).toString("hex");
}

export function safeStateCompare(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
