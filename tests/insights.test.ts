import assert from "node:assert/strict";
import { test } from "node:test";
import { answer, chunkSource, embed, cosine, retrieve } from "../src/core/services/insights.ts";
import { CORPUS } from "../src/data/knowledge.ts";

/**
 * The claim under test is not ranking quality. It is that permission
 * filtering happens before retrieval, so a chunk the acting person may not
 * read is never scored and can never be paraphrased into an answer.
 */

const LOGISTICS_MARKERS = [
  "container",
  "dwell",
  "carrier",
  "Ontario",
  "Grand Prairie",
  "overtime",
  "surcharge",
  "tender",
];

test("marketing identity retrieves no logistics content, not even paraphrased", () => {
  const q = "What is inbound container dwell at the Ontario DC and should we fund overtime?";
  const result = answer(q, "marketing");

  const haystack = [
    result.answer,
    ...result.citations.map((c) => `${c.label} ${c.quote}`),
  ]
    .join(" ")
    .toLowerCase();

  for (const marker of LOGISTICS_MARKERS) {
    assert.ok(
      !haystack.includes(marker.toLowerCase()),
      `logistics marker "${marker}" leaked into a marketing answer`,
    );
  }

  const logisticsSourceIds = CORPUS.filter(
    (s) => !s.allowedFunctions.includes("marketing"),
  ).map((s) => s.id);
  for (const c of result.citations) {
    assert.ok(
      !logisticsSourceIds.includes(c.sourceId),
      `cited a source not cleared for marketing: ${c.sourceId}`,
    );
  }
});

test("excluded sources are never chunked or scored", () => {
  const { ranked, excluded, consideredChunks } = retrieve("container dwell", "marketing");
  const permittedChunkCount = CORPUS.filter((s) =>
    s.allowedFunctions.includes("marketing"),
  ).flatMap(chunkSource).length;

  assert.equal(consideredChunks, permittedChunkCount);
  assert.ok(excluded.length > 0, "expected some sources excluded for marketing");
  for (const c of ranked) {
    assert.ok(c.allowedFunctions.includes("marketing"));
  }
});

test("logistics identity does get the logistics answer", () => {
  const result = answer("What is driving inbound container dwell?", "logistics");
  assert.ok(result.citations.length > 0, "logistics should retrieve something");
  const text = result.answer.toLowerCase();
  assert.ok(text.includes("dwell"), `expected dwell content, got: ${result.answer}`);
});

test("an off-corpus question returns nothing rather than a confident near-miss", () => {
  const result = answer("What is the office parking policy?", "marketing");
  assert.equal(result.citations.length, 0);
  assert.match(result.answer, /No approved source/);
});

test("embedding is deterministic and normalized", () => {
  const a = embed("carrier exception rate");
  const b = embed("carrier exception rate");
  assert.equal(cosine(a, b).toFixed(6), "1.000000");
});
