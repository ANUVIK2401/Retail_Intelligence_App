export type ProviderConfig = { provider: "mock" } | { provider: "openai" | "anthropic"; apiKey: string; model: string };

/** Keys alone never enable network processing of mailbox content. */
export function readProviderConfig(env: Readonly<Record<string, string | undefined>> = process.env): ProviderConfig {
  const provider = env.AI_PROVIDER?.trim() || "mock";
  if (provider === "mock") return { provider };
  if (provider !== "openai" && provider !== "anthropic") throw new Error("Invalid AI provider configuration");
  const prefix = provider.toUpperCase();
  const apiKey = env[`${prefix}_API_KEY`]?.trim();
  const model = env[`${prefix}_MODEL`]?.trim();
  if (!apiKey || !model) throw new Error(`Incomplete ${provider} configuration: set ${prefix}_API_KEY and ${prefix}_MODEL`);
  return { provider, apiKey, model };
}
