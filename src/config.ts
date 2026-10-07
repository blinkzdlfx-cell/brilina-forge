import process from "node:process";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  github: {
    clientId: () => required("GITHUB_CLIENT_ID"),
    clientSecret: () => required("GITHUB_CLIENT_SECRET"),
    callbackUrl: () => process.env.GITHUB_CALLBACK_URL ?? "http://localhost:3000/auth/github/callback"
  },
  callbackOrigin: (() => {
    try {
      return new URL(process.env.GITHUB_CALLBACK_URL ?? "http://localhost:3000/auth/github/callback").origin;
    } catch {
      return process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
    }
  })(),
  cookieSecure: process.env.COOKIE_SECURE === "true",
  databaseUrl: () => required("DATABASE_URL"),
  githubTokenEncryptionKey: () => required("GITHUB_TOKEN_ENCRYPTION_KEY"),
  aiProviderTimeoutMs: Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 120_000)
};
