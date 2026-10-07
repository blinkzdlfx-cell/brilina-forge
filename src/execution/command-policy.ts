import type { CommandDecision } from "./types.js";

const MAX_COMMAND_LENGTH = 2000;

/**
 * Shell metacharacters that allow one command to smuggle in another. A single
 * classified command must not be able to chain, substitute, redirect or spawn.
 */
const CHAINING = /[;&|`>]|\$\(|<<|\n|\r/;

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/**
 * Blocked regardless of platform. These either destroy state, escalate
 * privilege, reach the network into a shell, or publish packages.
 */
const BLOCKED_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+(-[a-zA-Z]*\s+)*-?[rR]?[fF]?[a-zA-Z]*\s+\/(\s|$)/, reason: "Recursive delete of the filesystem root" },
  { pattern: /\brm\s+(-[a-zA-Z]+\s+)*-?[rRf]{1,2}[a-zA-Z]*\s+(~|\$HOME)(\s|$|\/)/, reason: "Recursive delete of the home directory" },
  { pattern: /\brm\s+-[a-zA-Z]*[rR][a-zA-Z]*f?[a-zA-Z]*\s+[^\s]*\*/, reason: "Recursive delete with a glob target" },
  { pattern: /\bmkfs(\.|\s)/, reason: "Filesystem format" },
  { pattern: /\bdd\s+[^|]*\bof=\/dev\//, reason: "Raw write to a block device" },
  { pattern: />\s*\/dev\/(sd|nvme|hd)[a-z0-9]*/, reason: "Raw write to a disk device" },
  { pattern: /\b(shutdown|reboot|halt|poweroff)\b/, reason: "Host power state change" },
  { pattern: /\bgit\b[^|]*\bpush\b/, reason: "Remote repository mutation" },
  { pattern: /\bgit\b[^|]*\breset\s+--hard\b/, reason: "Destructive git history operation" },
  { pattern: /\bgit\b[^|]*\bclean\b[^|]*-[a-zA-Z]*[fdx]/, reason: "Destructive git worktree clean" },
  { pattern: /\bchmod\s+(-[a-zA-Z]+\s+)*(777|a\+rwx)\s+\//, reason: "World-writable permission change on a system path" },
  { pattern: /\bchown\b[^|]*\s+\/(\s|$)/, reason: "Recursive ownership change on a system path" },
  { pattern: /\bsudo\b/, reason: "Privilege escalation" },
  { pattern: /\bsu\s+-\b/, reason: "Privilege escalation" },
  { pattern: /\bnpm\s+publish\b/, reason: "Package publication" },
  { pattern: /\b(history\s+-c|shred\b|>\s*\/etc\/)/, reason: "History or system-state tampering" },

  // Windows equivalents of the same destructive and escalation shapes. A flag is
  // preceded by whitespace, so no word boundary is used before the dash.
  { pattern: /\bRemove-Item\b[^|]*\s(-Recurse|-Force)\b/i, reason: "Recursive or forced delete on Windows" },
  { pattern: /\b(rmdir|del|erase)\b[^|]*\s\/s\b/i, reason: "Recursive delete on Windows" },
  { pattern: /\bformat\s+[a-z]:/i, reason: "Windows volume format" },
  { pattern: /\bStop-Computer\b|\bRestart-Computer\b/i, reason: "Host power state change" },
  { pattern: /\bpowershell(\.exe)?\b[^|]*\s-(e|en|enc|encodedcommand)\b/i, reason: "Encoded PowerShell command" },
  { pattern: /\bInvoke-Expression\b|\biex\b/i, reason: "Dynamic command evaluation" },
  { pattern: /\bSet-ExecutionPolicy\b/i, reason: "Execution policy change" },
  { pattern: /\breg(\.exe)?\s+add\b/i, reason: "Registry modification" }
];

/**
 * Network fetch, install, repository mutation and interactive programs. These
 * require an explicit human decision rather than running unattended.
 */
const APPROVAL_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(npm|pnpm|yarn|bun)\s+(install|ci|i|add)\b/, reason: "Dependency installation reaches the network and runs package scripts" },
  { pattern: /\b(pip|pip3|poetry)\s+install\b/, reason: "Dependency installation reaches the network" },
  { pattern: /\bgit\b[^|]*\bcommit\b/, reason: "Repository mutation" },
  { pattern: /\b(gh\s+(pr|issue|release)\s+create)/i, reason: "Outbound mutation" },
  { pattern: /\b(curl|wget|Invoke-WebRequest|iwr)\b/i, reason: "Outbound network request" },
  { pattern: /\b(docker|docker-compose|podman)\b/i, reason: "Container execution" },
  { pattern: /\b(kill|pkill|taskkill|Stop-Process)\b/, reason: "Process termination" },
  { pattern: /\b(npm\s+run\s+dev|vite\s+dev|npm\s+start|python.*-m\s+http\.server)\b/, reason: "Long-running development server" },
  { pattern: /\b(vim|nano|emacs|top|htop|less|more|man)\b/, reason: "Interactive terminal program" },
  { pattern: /\b(ssh|scp|sftp|rsync|telnet)\b/, reason: "Remote host access" },
  { pattern: /\b(env|printenv|set)\b\s*$/, reason: "Environment inspection can disclose host secrets" },
  { pattern: /\b(set|Get-ChildItem\s+env:)\b\s*$/i, reason: "Environment inspection can disclose host secrets" }
];

/**
 * Read-only inspection verbs allowed without approval. Anything not matched by
 * the blocked list, the approval list, or this allow-list is treated as
 * approval-required, so an unknown command never runs unattended.
 */
const SAFE_EXECUTABLES = new Set([
  "ls", "dir", "pwd", "cd", "cat", "head", "tail", "wc", "stat", "file", "find", "tree",
  "grep", "rg", "ag", "diff", "echo", "printf", "basename", "dirname", "realpath", "du", "df",
  "node", "npm", "npx", "python", "python3", "tsc", "jest", "vitest", "eslint", "prettier",
  "git", "go", "cargo", "java", "mvn", "gradle", "make", "dotnet", "php", "ruby", "rake",
  "uname", "whoami", "id", "date", "which", "where", "type", "sleep", "sort", "uniq", "cut",
  "jq", "sed", "awk", "true", "false", "test", "seq", "yes", "man", "curl", "wget"
]);

function firstToken(command: string): string {
  const token = command.split(" ")[0] ?? "";
  return token.replace(/^.*[\\/]/, "").toLowerCase();
}

export function classifyCommand(command: string): CommandDecision {
  const raw = command ?? "";
  const normalized = raw.trim().replace(/\s+/g, " ");

  if (!normalized) {
    return { classification: "blocked", reason: "Empty command", normalized };
  }
  if (normalized.length > MAX_COMMAND_LENGTH) {
    return { classification: "blocked", reason: `Command exceeds ${MAX_COMMAND_LENGTH} characters`, normalized };
  }
  if (CONTROL_CHARACTERS.test(raw)) {
    return { classification: "blocked", reason: "Command must not contain control characters", normalized };
  }
  if (CHAINING.test(raw)) {
    return {
      classification: "blocked",
      reason: "Command chaining, substitution and redirection are not allowed; submit one command at a time",
      normalized
    };
  }

  for (const { pattern, reason } of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      return { classification: "blocked", reason, normalized };
    }
  }

  const executable = firstToken(normalized);
  for (const { pattern, reason } of APPROVAL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { classification: "approval-required", reason, normalized };
    }
  }

  if (!SAFE_EXECUTABLES.has(executable)) {
    return {
      classification: "approval-required",
      reason: `Executable "${executable || "(none)"}" is not on the read-only inspection allow-list`,
      normalized
    };
  }

  return { classification: "safe", reason: "Read-only inspection command on the allow-list", normalized };
}

export function isExecutableClass(decision: CommandDecision): boolean {
  return decision.classification !== "blocked";
}