import type { AgentModel, ModelInput, ModelDecision } from "../agent/types.js";

export class Phase4DeterministicModel implements AgentModel {
  private used = false;

  async next(input: ModelInput): Promise<ModelDecision> {
    if (this.used) return { type: "final", content: "The development run is complete." };
    this.used = true;

    const message = input.messages.findLast(item => item.role === "user")?.content ?? "";
    if (/inspect|repository|repo|branch/i.test(message)) {
      return {
        type: "final",
        content: "Phase 4 development mode received your request. Repository-aware execution is wired through the Agent Controller; the real AI provider is intentionally deferred to Phase 5."
      };
    }

    return {
      type: "final",
      content: "Forge received your request. This is the deterministic Phase 4 development adapter. Real model responses are intentionally deferred to Phase 5."
    };
  }
}
