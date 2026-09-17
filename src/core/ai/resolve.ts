import type { AIProvider } from "@/core/ai/gateway";
import { AnthropicProvider } from "@/core/ai/providers/anthropic";
import { MockProvider } from "@/core/ai/providers/mock";
import { store } from "@/core/store";

/**
 * Single place where a provider is chosen. Features call this, never a
 * constructor. Changing the approved provider is a change here plus one
 * adapter file.
 */
export function resolveProvider(): AIProvider {
  if (store.settings.simulateCompromisedModel) {
    return new MockProvider({ naive: true });
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (store.settings.provider === "anthropic" && key) {
    return new AnthropicProvider({ apiKey: key });
  }
  return new MockProvider();
}
