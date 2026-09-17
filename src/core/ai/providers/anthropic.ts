import {
  CLASSIFY_SYSTEM_PROMPT,
  ClassificationSchema,
  DRAFT_SYSTEM_PROMPT,
  DraftSchema,
  buildClassifyPrompt,
  buildDraftPrompt,
  conservativeClassification,
  type AIProvider,
  type Classification,
  type ClassifyRequest,
  type Draft,
  type DraftRequest,
} from "@/core/ai/gateway";

/**
 * Claude adapter.
 *
 * Active only when ANTHROPIC_API_KEY is present. The client's stated stack is
 * Claude Enterprise, so this is the expected production path; the mock remains
 * the demo path so a recorded walkthrough never depends on the network.
 *
 * The model is given no tools and no credentials. It returns JSON which is
 * validated before it is allowed anywhere near the policy engine.
 */
export class AnthropicProvider implements AIProvider {
  readonly name = "anthropic";
  readonly model: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(opts: { apiKey: string; model?: string; timeoutMs?: number }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
    this.timeoutMs = opts.timeoutMs ?? 20_000;
  }

  async classify(req: ClassifyRequest): Promise<Classification> {
    try {
      const raw = await this.call(CLASSIFY_SYSTEM_PROMPT, buildClassifyPrompt(req), 1200);
      const parsed = ClassificationSchema.safeParse(extractJson(raw));
      if (!parsed.success) {
        return conservativeClassification("model output failed schema validation");
      }
      return parsed.data;
    } catch (err) {
      return conservativeClassification(
        err instanceof Error ? err.message : "provider error",
      );
    }
  }

  async draft(req: DraftRequest): Promise<Draft> {
    const raw = await this.call(DRAFT_SYSTEM_PROMPT, buildDraftPrompt(req), 800);
    const parsed = DraftSchema.safeParse(extractJson(raw));
    if (!parsed.success) {
      throw new Error("Draft output failed schema validation");
    }
    return parsed.data;
  }

  private async call(system: string, user: string, maxTokens: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}`);
      }
      const json = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      return (json.content ?? [])
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("");
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Tolerates a fenced or prefixed response without trusting its content. */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}
