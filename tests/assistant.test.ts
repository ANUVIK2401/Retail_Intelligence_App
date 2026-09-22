import test from "node:test";
import assert from "node:assert/strict";
import { stateContext, freshState } from "../src/core/store/index.ts";
import { personById } from "../src/data/org.ts";
import { answerFromFacts } from "../src/core/assistant/facts.ts";
import { AssistantResponseSchema } from "../src/core/contracts/index.ts";

function assertStructuredReply(reply: Awaited<ReturnType<typeof answerFromFacts>>) {
  assert.doesNotThrow(() => AssistantResponseSchema.parse(reply));
  assert.equal(typeof reply.summary, "string");
  assert.ok(reply.summary.length > 0);
  assert.ok(Array.isArray(reply.items));
  for (const item of reply.items) {
    assert.deepEqual(Object.keys(item).sort(), ["detail", "label", "status"]);
    assert.equal(typeof item.label, "string");
    assert.equal(typeof item.detail, "string");
    assert.equal(typeof item.status, "string");
  }
  assert.ok(reply.deepLink === null || (
    typeof reply.deepLink.href === "string" &&
    typeof reply.deepLink.label === "string"
  ));
  assert.ok(Array.isArray(reply.suggestions));
  assert.ok(reply.suggestions.every((suggestion) => typeof suggestion === "string"));
}

test("assistant answers email questions only from readable messages", async () => {
  await stateContext.run(freshState(), async () => {
    const ceo = personById("p_ceo")!;
    const reply = await answerFromFacts(ceo, "What emails need attention?");
    assertStructuredReply(reply);
    assert.match(reply.answer, /synthetic inbox/i);
    assert.deepEqual(reply.deepLink, { href: "/inbox", label: "Open inbox" });
    assert.ok(reply.items.length > 0);
    assert.doesNotMatch(reply.items.map((item) => item.label).join(" "), /take-private/i);
  });
});

test("assistant inbox answers are scoped to the signed-in persona's mailbox", async () => {
  await stateContext.run(freshState(), async () => {
    const cmo = personById("p_cmo")!;
    const reply = await answerFromFacts(cmo, "What emails need attention?");
    assertStructuredReply(reply);
    assert.equal(reply.source, "emails");
    const renderedReply = `${reply.answer} ${reply.summary} ${reply.items.map((item) => item.label).join(" ")}`;
    assert.deepEqual(reply.items, []);
    assert.match(reply.summary, /no synthetic inbox messages/i);
    assert.doesNotMatch(
      renderedReply,
      /fire at store|indication of interest|denim circularity/i,
    );
  });
});

test("assistant gives free-busy only, not meeting subjects", async () => {
  await stateContext.run(freshState(), async () => {
    const ceo = personById("p_ceo")!;
    const reply = await answerFromFacts(ceo, "What is Priya Raman's availability?");
    assertStructuredReply(reply);
    assert.match(reply.answer, /Priya Raman/);
    assert.match(reply.answer, /busy|no synthetic busy/i);
    assert.doesNotMatch(reply.answer, /subject:/i);
    assert.deepEqual(reply.deepLink, { href: "/schedule", label: "Open schedule" });
    assert.ok(reply.items.every((item) => ["busy", "tentative", "out_of_office"].includes(item.status)));
  });
});

test("assistant returns structured meeting proposal cards", async () => {
  await stateContext.run(freshState(), async () => {
    const reply = await answerFromFacts(personById("p_ceo")!, "What meetings are pending?");
    assertStructuredReply(reply);
    assert.equal(reply.source, "meetings");
    assert.deepEqual(reply.deepLink, { href: "/schedule", label: "Open schedule" });
    assert.ok(reply.suggestions.length > 0);
  });
});

test("assistant admits when a question is outside its grounded data", async () => {
  await stateContext.run(freshState(), async () => {
    const reply = await answerFromFacts(personById("p_ceo")!, "What is the weather in Tokyo?");
    assertStructuredReply(reply);
    assert.match(reply.answer, /can help with.*availability.*meetings.*emails/i);
    assert.equal(reply.deepLink, null);
    assert.deepEqual(reply.items, []);
  });
});
