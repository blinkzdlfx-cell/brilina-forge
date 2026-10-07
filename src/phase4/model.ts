import type { AgentModel, ModelInput, ModelDecision } from "../agent/types.js";

const REPOSITORY_INTENT = /\b(inspect|repository|repo|branch|readme|documentation|context|overview)\b/i;

type ParsedContext = { repository?: string; branch?: string };

function parseContext(messages: ModelInput["messages"]): ParsedContext {
  const context: ParsedContext = {};
  for (const item of messages) {
    if (item.role !== "system") continue;
    const repository = /- repository: (\S+)/.exec(item.content);
    const branch = /- branch: (.+)/.exec(item.content);
    if (repository) context.repository = repository[1];
    if (branch) context.branch = branch[1]!.trim();
  }
  return context;
}

function lastUserMessage(input: ModelInput): string {
  for (let index = input.messages.length - 1; index >= 0; index--) {
    const item = input.messages[index];
    if (item?.role === "user") return item.content;
  }
  return "";
}

function toolResults(input: ModelInput): string[] {
  return input.messages.filter(item => item.role === "tool").map(item => item.content);
}

export class Phase4DeterministicModel implements AgentModel {
  private requestedRepository = false;

  async next(input: ModelInput): Promise<ModelDecision> {
    const message = lastUserMessage(input);
    const context = parseContext(input.messages);
    const canReadRepository = input.tools.some(tool => tool.name === "github.get_repository");

    if (!this.requestedRepository && canReadRepository && context.repository && REPOSITORY_INTENT.test(message)) {
      const [owner, repo] = context.repository.split("/");
      if (owner && repo) {
        this.requestedRepository = true;
        return {
          type: "tool_call",
          call: { id: "phase4-read-repository", name: "github.get_repository", arguments: { owner, repo } }
        };
      }
    }

    if (this.requestedRepository || toolResults(input).length > 0) {
      const results = toolResults(input);
      const summary = results.length
        ? "Read the selected repository through the GitHub read tool and report what it contains."
        : "No repository read result was returned in this run.";
      return {
        type: "final",
        content: [
          "Phase 4 development mode completed the request through the Agent Controller.",
          context.repository ? `Repository: ${context.repository}${context.branch ? ` (branch ${context.branch})` : ""}.` : "No repository is attached to this conversation, so no repository tool was requested.",
          summary,
          "Real model reasoning is deferred to Phase 5; the provider-neutral controller contract is unchanged."
        ].join("\n")
      };
    }

    if (!context.repository) {
      return {
        type: "final",
        content: "Select a repository and branch in the Forge header, then describe the change you want. Without an active repository this deterministic Phase 4 adapter has no repository context to inspect."
      };
    }

    return {
      type: "final",
      content: "Phase 4 development mode received your request for " + context.repository + ". Ask me to inspect the repository or its documentation and I will read it through the registered read-only GitHub tool."
    };
  }
}