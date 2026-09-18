import type { AIProvider } from "@/core/ai/gateway";
import { readProviderConfig } from "@/core/ai/config";
import { AnthropicProvider } from "@/core/ai/providers/anthropic";
import { OpenAIProvider } from "@/core/ai/providers/openai";
import { MockProvider } from "@/core/ai/providers/mock";
import { store } from "@/core/store";

/** Environment configuration alone controls whether content leaves the server. */
export function resolveProvider(): AIProvider {
  const config = readProviderConfig();
  if (config.provider === "mock") return new MockProvider({ naive: store.settings.simulateCompromisedModel });
  return config.provider === "openai" ? new OpenAIProvider(config) : new AnthropicProvider(config);
}
