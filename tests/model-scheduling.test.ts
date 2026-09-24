import assert from "node:assert/strict";
import test from "node:test";
import { extractSchedulingFields } from "../src/core/assistant/model.ts";
import { respond } from "../src/core/services/chat.ts";
import { runMemorySession } from "../src/core/persistence/index.ts";
import { personById } from "../src/data/org.ts";

const env = { AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key", ANTHROPIC_MODEL: "claude-test" };
const replyWith = (text: string) => (async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text }] }), { status: 200 })) as typeof fetch;

test("the mock provider makes no call and returns nothing to merge", async () => {
  let called = false;
  const result = await extractSchedulingFields("Find time with Ray", { env: { AI_PROVIDER: "mock" }, fetch: (async () => { called = true; return new Response("{}"); }) as typeof fetch });
  assert.equal(result.fields, null);
  assert.equal(called, false);
});

test("a live provider's structured fields are validated", async () => {
  const ok = await extractSchedulingFields("Grab the finance chief and Ray for half an hour next week", {
    env, fetch: replyWith('{"people":["the finance chief","Ray"],"durationMinutes":30,"when":"next week","topic":null}'),
  });
  assert.deepEqual(ok.fields?.people, ["the finance chief", "Ray"]);
  const bad = await extractSchedulingFields("x", { env, fetch: replyWith("Sure! I booked it for you.") });
  assert.equal(bad.fields, null, "prose is not accepted as structure");
  const oversized = await extractSchedulingFields("x", { env, fetch: replyWith('{"people":[],"durationMinutes":9999,"when":null,"topic":null}') });
  assert.equal(oversized.fields, null, "out-of-range durations are rejected");
});

test("names from the model still go through the directory, and failures fall back to the parser", async () => {
  await runMemorySession("model-scheduling", async () => {
    const maya = personById("p_ceo")!;
    const invented = await respond(maya, "Find time with Ray next week", null, {
      env, fetch: replyWith('{"people":["Ray","Elon Musk"],"durationMinutes":30,"when":"next week","topic":null}'),
    });
    assert.ok(invented.parts.some((part) => part.type === "clarify"), "an invented person is questioned, not booked");
    const down = await respond(maya, "Find 30 minutes next week with Ray and Priya", null, {
      env, fetch: (async () => new Response("unavailable", { status: 503 })) as typeof fetch,
    });
    assert.ok(down.parts.some((part) => part.type === "slots"), "the deterministic parser carries on");
  });
});
