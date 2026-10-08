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

  const apiKey = config.aiProviderApiKey;
  if (apiKey) {
    providers.push(new OpenAiCompatibleProvider({
      apiKey,
      baseUrl: config.aiProviderBaseUrl,
      defaultModel: config.aiProviderModel,
      timeoutMs: config.aiProviderTimeoutMs
    }));
    activeProviderId = "openai-compatible";
    activeModel = config.aiProviderModel;
  }

  return {
    registry: new ProviderModelRegistry(providers),
    activeProviderId,
    activeModel,
    configuredProviders: providers.map(provider => provider.id)
  };
}
