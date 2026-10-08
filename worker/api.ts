import { configureRuntimeEnv, config } from "../src/config.js";
import {
  createGithubAuthorizationUrl,
  exchangeGithubCode,
  refreshGithubAccessToken,
  OAUTH_STATE_COOKIE,
  verifyStateBinding
} from "../src/auth/github.js";
import {
  createSession,
  deleteSession,
  getSession,
  parseSessionCookie,
  updateSessionCredentials,
  type Session
} from "../src/auth/session.js";
import { createNeonSessionStore } from "../src/db/repositories.js";
import { GithubApiError, GithubClient } from "../src/github/client.js";
import { GithubService } from "../src/github/service.js";
import {
  addConversationMessage,
  createConversation,
  getConversationForUser,
  getForgeUserContext,
  getOwnedRunConversation,
  listConversationMessages,
  listConversations,
  syncRepository,
  updateConversationContext,
  userOwnsRun
} from "../src/db/conversation-repositories.js";
import { getRunAudit, listRunsForConversation } from "../src/db/audit-repositories.js";
import { neonAgentAuditStore } from "../src/db/agent-repositories.js";
import { recordUsage } from "../src/db/usage-repositories.js";
import { AgentController } from "../src/agent/controller.js";
import { ToolRegistry } from "../src/agent/registry.js";
import { createGithubReadTools } from "../src/agent/tools/github-read-context.js";
import { createProviderRuntime } from "../src/ai/factory.js";
import { ProviderAgentModel } from "../src/ai/provider-model.js";
import { wrapWithCooldownRetry } from "../src/ai/retry-model.js";
import { AiProviderError } from "../src/ai/types.js";
import { Phase4DeterministicModel } from "../src/phase4/model.js";
import { getSql } from "../src/db/client.js";

const TOKEN_REFRESH_SKEW_MS = 60_000;
const DELTA_CHUNK_SIZE = 80;
const MAX_RUN_MESSAGE_LENGTH = 8_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BRANCH_NAME_PATTERN = /^[A-Za-z0-9._/-]{1,255}$/;

let initialized = false;

type Env = Record<string, string | undefined>;

export function initializeWorker(env: Env): void {
  configureRuntimeEnv(env);
  if (!initialized) {
    configureSessionStore(createNeonSessionStore());
    initialized = true;
  }
}

