import { RemoteProvider } from "@/core/ai/providers/remote";
export class OpenAIProvider extends RemoteProvider {
  readonly name = "openai" as const;
}
