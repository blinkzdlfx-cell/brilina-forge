import { AiProviderError, type AiProvider, type AiProviderId, type AiModelDescriptor } from "./types.js";

export type ModelRegistry = {
  list(): AiModelDescriptor[];
  has(model: string): boolean;
  resolve(model: string): AiModelDescriptor;
};

export class ProviderModelRegistry implements ModelRegistry {
  private readonly descriptors = new Map<string, AiModelDescriptor>();

  constructor(private readonly registered: AiProvider[]) {
    for (const provider of registered) {
      for (const model of provider.models) this.descriptors.set(model.id, model);
    }
  }

  list(): AiModelDescriptor[] {
    return [...this.descriptors.values()];
  }

  has(model: string): boolean {
    return this.descriptors.has(model);
  }

  resolve(model: string): AiModelDescriptor {
    const descriptor = this.descriptors.get(model);
    if (!descriptor) throw new Error("Unknown AI model: " + model);
    return descriptor;
  }

  providerFor(model: string): AiProvider {
    const descriptor = this.resolve(model);
    const provider = this.registered.find(item => item.id === descriptor.provider);
    if (!provider) throw new AiProviderError({
      provider: descriptor.provider,
      model,
      kind: "server_error",
      retryable: false,
      message: `No adapter is registered for provider ${descriptor.provider}`
    });
    return provider;
  }

  providers(): AiProviderId[] {
    return this.registered.map(provider => provider.id);
  }
}