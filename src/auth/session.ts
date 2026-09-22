import { randomBytes } from "node:crypto";
import type { GithubUser } from "../github/types.js";

export type Session = {
  id: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  githubUser: GithubUser;
  createdAt: number;
};

export type SessionStore = {
  create(
    accessToken: string,
    githubUser: GithubUser,
    credentials: Pick<Session, "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
  ): Promise<Session>;
  get(id: string | undefined): Promise<Session | undefined>;
  update(
    id: string,
    credentials: Pick<Session, "accessToken" | "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
  ): Promise<Session | undefined>;
  delete(id: string | undefined): Promise<void>;
};

const SESSION_TTL_MS = 24 * 60 * 60_000;
const sessions = new Map<string, Session>();

const memoryStore: SessionStore = {
  async create(accessToken, githubUser, credentials) {
    const id = randomBytes(32).toString("hex");
    const session: Session = {
      id,
      accessToken,
      githubUser,
      createdAt: Date.now(),
      ...credentials
    };
    sessions.set(id, session);
    return session;
  },

  async get(id) {
    if (!id) return undefined;
    const session = sessions.get(id);
    if (!session) return undefined;
    if (Date.now() - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      return undefined;
    }
    return session;
  },

  async update(id, credentials) {
    const session = await this.get(id);
    if (!session) return undefined;
    Object.assign(session, credentials);
    return session;
  },

  async delete(id) {
    if (id) sessions.delete(id);
  }
};

let store: SessionStore = memoryStore;

export function configureSessionStore(next: SessionStore): void {
  store = next;
}

export function resetSessionStore(): void {
  store = memoryStore;
}

export function createSession(
  accessToken: string,
  githubUser: GithubUser,
  credentials: Pick<Session, "refreshToken" | "expiresAt" | "refreshTokenExpiresAt"> = {}
): Promise<Session> {
  return store.create(accessToken, githubUser, credentials);
}

export function getSession(id: string | undefined): Promise<Session | undefined> {
  return store.get(id);
}

export function updateSessionCredentials(
  id: string,
  credentials: Pick<Session, "accessToken" | "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<Session | undefined> {
  return store.update(id, credentials);
}

export function deleteSession(id: string | undefined): Promise<void> {
  return store.delete(id);
}

export function parseSessionCookie(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const pair = header.split(";").map(v => v.trim()).find(v => v.startsWith("brilina_session="));
  return pair?.slice("brilina_session=".length);
}
