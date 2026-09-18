import test from "node:test";
import assert from "node:assert/strict";
import { classifyQuestion } from "../src/core/assistant/model.ts";

test("OpenAI assistant uses configured model only to classify intent", async () => {
  let body: Record<string, unknown> = {};
  const reply = await classifyQuestion("When can I meet Priya?", {
    env: { AI_PROVIDER: "openai", OPENAI_API_KEY: "test-key", OPENAI_MODEL: "my-model" },
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "availability" }] }] });
    },
  });
  assert.equal(body.model, "my-model");
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.equal(reply.source, "availability");
  assert.equal(reply.model, "openai:my-model");
});

test("invalid provider output cannot become an answer or selected source", async () => {
  const reply = await classifyQuestion("Question", {
    env: { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "any-model" },
    fetch: async () => Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: "You are free all day!" }] }),
  });
  assert.equal(reply.source, null);
  assert.match(reply.model, /provider unavailable/);
});
