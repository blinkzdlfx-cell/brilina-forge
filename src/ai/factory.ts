import { config } from "../config.js";
import { DeterministicDevelopmentProvider } from "./deterministic.js";
import { OpenAiCompatibleProvider } from "./openai-compatible.js";
import { ProviderModelRegistry } from "./registry.js";
import type { AiProvider, AiProviderId } from "./types.js";

export type ProviderRuntime = {
  registry: ProviderModelRegistry;
  activeProviderId: AiProviderId;
  activeModel: string;
  configuredProviders: AiProviderId[];
};

export function createProviderRuntime(): ProviderRuntime {
  const providers: AiProvider[] = [new DeterministicDevelopmentProvider()];
  let activeProviderId: AiProviderId = "deterministic-development";
  let activeModel = "forge-deterministic";

  const apiKey = process.env.AI_PROVIDER_API_KEY?.trim();
  if (apiKey) {
    const model = process.env.AI_PROVIDER_MODEL?.trim() || "gpt-4o-mini";
    providers.push(new OpenAiCompatibleProvider({
      apiKey,
      baseUrl: process.env.AI_PROVIDER_BASE_URL?.trim() || undefined,
      defaultModel: model,
      timeoutMs: config.aiProviderTimeoutMs
    }));
    activeProviderId = "openai-compatible";
    activeModel = model;
  }

  return {
    registry: new ProviderModelRegistry(providers),
    activeProviderId,
    activeModel,
    configuredProviders: providers.map(provider => provider.id)
  };
}