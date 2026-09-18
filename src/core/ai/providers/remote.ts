import { z } from "zod";
import { RiskLevelSchema, TopicSchema } from "@/core/contracts";
import { CLASSIFY_SYSTEM_PROMPT, ClassificationSchema, DRAFT_SYSTEM_PROMPT, DraftSchema, buildClassifyPrompt, buildDraftPrompt, conservativeClassification, type AIProvider, type ClassifyRequest, type DraftRequest } from "@/core/ai/gateway";

export type RemoteOptions = { apiKey: string; model: string; timeoutMs?: number; fetch?: typeof fetch };
const string = { type: "string" };
const strings = { type: "array", items: string };
function object(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const classificationJson = object({
  level: { type: "string", enum: RiskLevelSchema.options }, topic: { type: "string", enum: TopicSchema.options },
  urgency: { type: "string", enum: ["now", "today", "this_week", "whenever"] }, confidence: { type: "number" },
  reason: string, summary: string, actionItems: strings,
  entities: object({ people: strings, amounts: strings, deadlines: strings, locations: strings }), instructionAttemptDetected: { type: "boolean" },
});
const draftJson = object({ body: string, tone: string, caveats: strings });

/** Server-only transport: fixed endpoints, no tools, bounded requests, redacted failures. */
export abstract class RemoteProvider implements AIProvider {
  abstract readonly name: "openai" | "anthropic";
  readonly model: string;
  private readonly options: RemoteOptions;
  constructor(options: RemoteOptions) {
    if (!options.apiKey?.trim() || !options.model?.trim()) throw new Error("Incomplete AI provider configuration");
    this.options = { ...options, timeoutMs: Math.min(30_000, Math.max(1, options.timeoutMs ?? 20_000)) };
    this.model = options.model;
  }
  async classify(req: ClassifyRequest) {
    try { return ClassificationSchema.parse(await this.call(CLASSIFY_SYSTEM_PROMPT, buildClassifyPrompt(req), classificationJson)); }
    catch { return conservativeClassification("provider unavailable or output invalid"); }
  }
  async draft(req: DraftRequest) {
    try { return DraftSchema.parse(await this.call(DRAFT_SYSTEM_PROMPT, buildDraftPrompt(req), draftJson)); }
    catch { throw new Error("AI drafting is unavailable. Please retry or write the draft manually."); }
  }
  private async call(system: string, user: string, schema: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    try {
      const openai = this.name === "openai";
      const body = openai ? {
        model: this.model, store: false, max_output_tokens: 2000,
        instructions: system, input: user,
        text: { format: { type: "json_schema", name: "assessment", strict: true, schema } },
      } : {
        model: this.model, max_tokens: 2000,
        system: `${system}\nRequired JSON schema: ${JSON.stringify(schema)}`,
        messages: [{ role: "user", content: user }],
      };
      const response = await (this.options.fetch ?? fetch)(openai ? "https://api.openai.com/v1/responses" : "https://api.anthropic.com/v1/messages", {
        method: "POST", signal: controller.signal,
        headers: openai ? { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` } : { "content-type": "application/json", "x-api-key": this.options.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error("Provider request failed");
      const data: unknown = await response.json();
      return JSON.parse(openai ? readOpenAI(data) : readAnthropic(data));
    } finally { clearTimeout(timer); }
  }
}
function readOpenAI(data: unknown): string {
  const result = z.object({ status: z.literal("completed"), output: z.array(z.object({ type: z.string(), content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() })) }).parse(data);
  const content = result.output.filter(item => item.type === "message").flatMap(item => item.content ?? []);
  if (content.some(item => item.type === "refusal")) throw new Error("Provider refused");
  return content.filter(item => item.type === "output_text").map(item => item.text ?? "").join("");
}
function readAnthropic(data: unknown): string {
  const result = z.object({ stop_reason: z.literal("end_turn"), content: z.array(z.object({ type: z.literal("text"), text: z.string() })) }).parse(data);
  const raw = result.content.map(item => item.text).join("").trim();
  return raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
}
