import { randomBytes } from "node:crypto";
import type { GithubUser } from "../github/types.js";

export type Session = {
  id: string;
  accessToken: string;
  githubUser: GithubUser;
  createdAt: number;
};

const sessions = new Map<string, Session>();

export function createSession(accessToken: string, githubUser: GithubUser): Session {
  const id = randomBytes(32).toString("hex");
  const session: Session = { id, accessToken, githubUser, createdAt: Date.now() };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string | undefined): Session | undefined {
  if (!id) return undefined;
  return sessions.get(id);
}

export function deleteSession(id: string | undefined): void {
  if (id) sessions.delete(id);
}

export function parseSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const pair = header.split(";").map(v => v.trim()).find(v => v.startsWith("brilina_session="));
  return pair?.slice("brilina_session=".length);
}
