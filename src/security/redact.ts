const REDACTION_PLACEHOLDER = "[redacted]";

/**
 * Patterns for credentials that must never reach persisted audit records, model
 * context, or client-visible errors (docs/SECURITY.md "Secret redaction").
 */
const SECRET_PATTERNS: RegExp[] = [
  /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\b(AIAccessToken|sk-[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,})\b/g,
  /\b(postgresql|postgres|mysql|mongodb):\/\/[^\s"']+/gi,
  // Header-style credentials are redacted to end of line: the value of an
  // Authorization header legitimately contains spaces.
  /\b((proxy-)?authorization)\s*:\s*[^\n"']+/gi,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b[A-Za-z0-9._-]*(SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|ENCRYPTION_KEY|DATABASE_URL)\b(\s*[=:]\s*)[^\s"',}]+/gi
];

const MAX_REDACTED_LENGTH = 20_000;

/**
 * Removes credential-shaped substrings from text destined for logs, model
 * context, persisted tool results or client-visible errors. Length is bounded so
 * a large tool result cannot inflate an audit row.
 */
export function redactSecrets(value: unknown, maxLength = MAX_REDACTED_LENGTH): string {
  let text = typeof value === "string" ? value : safeStringify(value);
  for (const pattern of SECRET_PATTERNS) {
    text = text.replace(pattern, REDACTION_PLACEHOLDER);
  }
  return text.length > maxLength ? text.slice(0, maxLength) + "…[truncated]" : text;
}

/**
 * Redacts in place for structured values. Objects keep their shape so the audit
 * record still explains what happened, but every leaf string is redacted.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTION_PLACEHOLDER;
  if (typeof value === "string") return redactSecrets(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactValue(item, depth + 1));

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
    output[key] = SECRET_KEYS.test(key) ? REDACTION_PLACEHOLDER : redactValue(item, depth + 1);
  }
  return output;
}

const SECRET_KEYS = /(secret|token|password|passwd|api[_-]?key|authorization|cookie|private[_-]?key|encryption[_-]?key)/i;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}