import assert from "node:assert/strict";
import { test } from "node:test";
import { readProviderConfig } from "../src/core/ai/config.ts";
import { OpenAIProvider } from "../src/core/ai/providers/openai.ts";
import { AnthropicProvider } from "../src/core/ai/providers/anthropic.ts";

const req = { subject: "Hello", body: "Thanks", senderName: "Pat", senderIsExternal: false, recipientTitle: "CEO" };
const draftReq = { ...req, recipientName: "Alex", intent: "Acknowledge" };
const classification = { level: "low", topic: "unknown", urgency: "whenever", confidence: 0.9, reason: "Routine", summary: "Thanks", actionItems: [], entities: { people: [], amounts: [], deadlines: [], locations: [] }, instructionAttemptDetected: false };

test("provider configuration defaults to mock even with keys", () => {
  assert.deepEqual(readProviderConfig({ OPENAI_API_KEY: "secret", ANTHROPIC_API_KEY: "secret" }), { provider: "mock" });
});
test("live providers require explicit key and model without echoing secrets", () => {
  for (const provider of ["openai", "anthropic"]) {
    assert.throws(() => readProviderConfig({ AI_PROVIDER: provider }), /configuration/);
    assert.throws(() => readProviderConfig({ AI_PROVIDER: provider, [`${provider.toUpperCase()}_API_KEY`]: "secret" }), /configuration/);
    const out = readProviderConfig({ AI_PROVIDER: provider, [`${provider.toUpperCase()}_API_KEY`]: "secret", [`${provider.toUpperCase()}_MODEL`]: "configured-model" });
    assert.equal(out.provider, provider);
  }
  assert.throws(() => readProviderConfig({ AI_PROVIDER: "secret-invalid" }), (err: Error) => !err.message.includes("secret-invalid"));
});
for (const Provider of [OpenAIProvider, AnthropicProvider]) {
  const openai = Provider === OpenAIProvider;
  const response = (value: unknown) => new Response(JSON.stringify(openai ? { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] } : { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(value) }] }));
  test(`${Provider.name} validates output and sends no tools`, async () => {
    const fetcher: typeof fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.tools, undefined);
      assert.equal(body.model, "configured-model");
      if (openai) { assert.equal(body.store, false); assert.equal(body.text.format.strict, true); }
      return response(classification);
    };
    const provider = new Provider({ apiKey: "secret", model: "configured-model", fetch: fetcher });
    assert.deepEqual(await provider.classify(req), classification);
  });
  test(`${Provider.name} rejects invalid schemas conservatively`, async () => {
    const provider = new Provider({ apiKey: "secret", model: "configured-model", fetch: async () => response({ level: "low" }) });
    assert.equal((await provider.classify(req)).level, "high");
    await assert.rejects(provider.draft(draftReq), /unavailable/);
  });
  test(`${Provider.name} sanitizes errors and HTTP failures`, async () => {
    for (const fetcher of [async () => { throw new Error("secret transport details"); }, async () => new Response("secret upstream", { status: 429 })]) {
      const provider = new Provider({ apiKey: "secret", model: "configured-model", fetch: fetcher });
      assert.equal((await provider.classify(req)).reason.includes("secret"), false);
      await assert.rejects(provider.draft(draftReq), (err: Error) => !err.message.includes("secret"));
    }
  });
  test(`${Provider.name} aborts timed out requests`, async () => {
    const provider = new Provider({ apiKey: "secret", model: "configured-model", timeoutMs: 5, fetch: async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("abort")))) });
    assert.equal((await provider.classify(req)).level, "high");
  });
  test(`${Provider.name} rejects refusals and truncated responses`, async () => {
    const payloads = openai
      ? [{ status: "incomplete", output: [] }, { status: "completed", output: [{ type: "message", content: [{ type: "refusal" }] }] }]
      : [{ stop_reason: "max_tokens", content: [{ type: "text", text: JSON.stringify(classification) }] }, { stop_reason: "refusal", content: [] }];
    for (const payload of payloads) {
      const provider = new Provider({ apiKey: "secret", model: "configured-model", fetch: async () => new Response(JSON.stringify(payload)) });
      assert.equal((await provider.classify(req)).level, "high");
      await assert.rejects(provider.draft(draftReq), /unavailable/);
    }
  });
  test(`${Provider.name} returns validated drafts`, async () => {
    const draft = { body: "Thank you.", tone: "warm", caveats: [] };
    const provider = new Provider({ apiKey: "secret", model: "configured-model", fetch: async () => response(draft) });
    assert.deepEqual(await provider.draft(draftReq), draft);
  });
}
