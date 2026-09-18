import { RemoteProvider } from "@/core/ai/providers/remote";
export class AnthropicProvider extends RemoteProvider {
  readonly name = "anthropic" as const;
}
