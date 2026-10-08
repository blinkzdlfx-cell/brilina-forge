import process from "node:process";

type RuntimeEnv = Record<string, string | undefined>;

let runtimeEnv: RuntimeEnv = process.env;

export function configureRuntimeEnv(env: RuntimeEnv): void {
  runtimeEnv = env;
}

function value(name: string): string | undefined {
  return runtimeEnv[name]?.trim() || undefined;
}

function required(name: string): string {
  const result = value(name);
  if (!result) throw new Error(`Missing required environment variable: ${name}`);
  return result;
}

export const config = {
  get nodeEnv() { return value("NODE_ENV") ?? "development"; },
  get host() { return value("HOST") ?? "0.0.0.0"; },
  get port() { return Number(value("PORT") ?? 3000); },
  get publicBaseUrl() { return value("PUBLIC_BASE_URL") ?? "http://localhost:3000"; },
  github: {
    clientId: () => required("GITHUB_CLIENT_ID"),
    clientSecret: () => required("GITHUB_CLIENT_SECRET"),
    callbackUrl: () => value("GITHUB_CALLBACK_URL") ?? `${config.publicBaseUrl}/auth/github/callback`
  },
  get callbackOrigin() {
    try { return new URL(config.github.callbackUrl()).origin; }
    catch { return config.publicBaseUrl; }
  },
  get cookieSecure() {
    return value("COOKIE_SECURE") === "true" || config.publicBaseUrl.startsWith("https://");
  },
  databaseUrl: () => required("DATABASE_URL"),
  githubTokenEncryptionKey: () => required("GITHUB_TOKEN_ENCRYPTION_KEY"),
  get aiProviderApiKey() { return value("AI_PROVIDER_API_KEY"); },
  get aiProviderModel() { return value("AI_PROVIDER_MODEL") ?? "gpt-4o-mini"; },
  get aiProviderBaseUrl() { return value("AI_PROVIDER_BASE_URL"); },
  get aiProviderTimeoutMs() { return Number(value("AI_PROVIDER_TIMEOUT_MS") ?? 120_000); }
};
