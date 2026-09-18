import test from "node:test";
import assert from "node:assert/strict";
import { stateContext, freshState } from "../src/core/store/index.ts";
import { personById } from "../src/data/org.ts";
import { answerFromFacts } from "../src/core/assistant/facts.ts";

test("assistant answers email questions only from readable messages", async () => {
  await stateContext.run(freshState(), async () => {
    const cmo = personById("p_cmo")!;
    const reply = await answerFromFacts(cmo, "What emails need attention?");
    assert.match(reply.answer, /synthetic inbox/i);
    assert.doesNotMatch(reply.answer, /indication of interest|take-private/i);
  });
});

test("assistant gives free-busy only, not meeting subjects", async () => {
  await stateContext.run(freshState(), async () => {
    const ceo = personById("p_ceo")!;
    const reply = await answerFromFacts(ceo, "What is Priya Raman's availability?");
    assert.match(reply.answer, /Priya Raman/);
    assert.match(reply.answer, /busy|no synthetic busy/i);
    assert.doesNotMatch(reply.answer, /subject:/i);
  });
});

test("assistant admits when a question is outside its grounded data", async () => {
  await stateContext.run(freshState(), async () => {
    const reply = await answerFromFacts(personById("p_ceo")!, "What is the weather in Tokyo?");
    assert.match(reply.answer, /can help with.*availability.*meetings.*emails/i);
  });
});
