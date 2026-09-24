import assert from "node:assert/strict";
import test from "node:test";
import type { SchedulingDraft } from "../src/core/contracts/index.ts";
import { looksLikeFollowUp, parseSchedulingRequest, resolveWindow, reviseSchedulingDraft } from "../src/core/scheduling/parse.ts";
import { zonedClock } from "../src/core/scheduling/availability.ts";
import { personById } from "../src/data/org.ts";

const maya = personById("p_ceo")!;

function draftOf(text: string): SchedulingDraft {
  const outcome = parseSchedulingRequest(text, maya);
  assert.equal(outcome.kind, "draft", `${text} -> ${JSON.stringify(outcome)}`);
  return (outcome as { draft: SchedulingDraft }).draft;
}

const PHRASINGS: [string, Partial<SchedulingDraft> & { attendees: string[] }][] = [
  ["Find 30 minutes next week with Ray and Priya", { attendees: ["p_coo", "p_cfo"], durationMinutes: 30, window: { kind: "next_week" } }],
  ["find thirty minutes next week with ray and priya", { attendees: ["p_coo", "p_cfo"], durationMinutes: 30, window: { kind: "next_week" } }],
  ["Find time with the CFO tomorrow", { attendees: ["p_cfo"], durationMinutes: 30, window: { kind: "tomorrow" } }],
  ["Schedule an hour with Ray, Priya and Nina about the Q3 forecast", { attendees: ["p_coo", "p_cfo", "p_vp_stores"], durationMinutes: 60, title: "Q3 forecast" }],
  ["Set up a 45 minute call with Pria on Wednesday", { attendees: ["p_cfo"], durationMinutes: 45, window: { kind: "days", days: ["Wed"], week: "nearest" } }],
  ["Can we meet with Dana before Friday 3pm?", { attendees: ["p_cdio"], window: { kind: "before", day: "Fri", minutes: 900 } }],
  ["Schedule a 1:1 with Ray early next week", { attendees: ["p_coo"], window: { kind: "days", days: ["Mon", "Tue"], week: "next" } }],
  ["Get 15 minutes with legal this afternoon", { attendees: ["p_gc"], durationMinutes: 15, window: { kind: "today" }, notBeforeMinutes: 720 }],
  ["Book a half hour with Jordan and Ellie next Tuesday", { attendees: ["p_vp_logistics", "p_mgr_analytics"], durationMinutes: 30, window: { kind: "days", days: ["Tue"], week: "next" } }],
  ["Find 90 minutes with the COO and the CMO this week", { attendees: ["p_coo", "p_cmo"], durationMinutes: 90, window: { kind: "this_week" } }],
  ["I need 20 min with Sam sometime in the next 3 days to review the denim post", { attendees: ["p_vp_brand"], durationMinutes: 20, window: { kind: "next_days", count: 3 }, title: "Denim post" }],
  ["Set up time with Casey after 2pm on Thursday", { attendees: ["p_dir_ops"], notBeforeMinutes: 840, window: { kind: "days", days: ["Thu"], week: "nearest" } }],
  ["Find an hour and a half with Marcus and Priya next week in the morning", { attendees: ["p_gc", "p_cfo"], durationMinutes: 90, notAfterMinutes: 720 }],
  ["schedule a catch-up with my assistant tomorrow", { attendees: ["p_ea"], window: { kind: "tomorrow" } }],
  ["Grab 30 mins with the head of logistics before tomorrow at noon", { attendees: ["p_vp_logistics"], window: { kind: "before", day: "tomorrow", minutes: 720 } }],
  ["Find time with Rey and Tomas next week with a 10 minute buffer", { attendees: ["p_coo", "p_cmo"], bufferMinutes: 10, durationMinutes: 30 }],
  ["Please find 2 hours with Lena on Monday or Wednesday", { attendees: ["p_auditor"], durationMinutes: 120, window: { kind: "days", days: ["Mon", "Wed"], week: "nearest" } }],
];

for (const [text, expected] of PHRASINGS) {
  test(`parses: ${text}`, () => {
    const draft = draftOf(text);
    assert.deepEqual([...draft.attendeeIds].sort(), [...expected.attendees].sort());
    const { attendees: _attendees, ...rest } = expected;
    for (const [key, value] of Object.entries(rest)) {
      assert.deepEqual((draft as Record<string, unknown>)[key], value, `${key} for "${text}"`);
    }
  });
}

test("questions that are not scheduling requests are left alone", () => {
  for (const text of ["What emails need my attention?", "When is Priya Raman busy?", "Summarize today's business brief", "What's on my calendar tomorrow?"]) {
    assert.equal(parseSchedulingRequest(text, maya).kind, "not_scheduling", text);
  }
});

test("an ambiguous role asks which person, with ready-to-send options", () => {
  const outcome = parseSchedulingRequest("Book time with the VP next week", maya);
  assert.equal(outcome.kind, "clarify");
  if (outcome.kind !== "clarify") return;
  assert.match(outcome.question, /vice president/i);
  assert.deepEqual(outcome.options.map((option) => option.value), [
    "Book time with Nina Serrano next week", "Book time with Jordan Pike next week", "Book time with Sam Rivera next week",
  ]);
});

test("an unknown name is named back, never guessed", () => {
  const outcome = parseSchedulingRequest("Find time with Ray and Bob next week", maya);
  assert.equal(outcome.kind, "clarify");
  if (outcome.kind !== "clarify") return;
  assert.match(outcome.question, /Bob/);
  assert.deepEqual(outcome.options, [{ label: "Continue without Bob", value: "Find time with Ray next week" }]);
});

test("the executive is never added as their own attendee, and external senders are not in the directory", () => {
  assert.deepEqual(draftOf("Find time with Maya and Ray").attendeeIds, ["p_coo"]);
  assert.equal(parseSchedulingRequest("Find time with Howard Teague", maya).kind, "clarify");
});

test("follow-ups revise the request on screen", () => {
  const draft = draftOf("Find 30 minutes next week with Ray and Priya");
  const revised = reviseSchedulingDraft("Actually make it 45 and add Nina", draft, maya);
  assert.equal(revised.kind, "draft");
  if (revised.kind !== "draft") return;
  assert.equal(revised.draft.durationMinutes, 45);
  assert.deepEqual(revised.draft.attendeeIds, ["p_coo", "p_cfo", "p_vp_stores"]);
  assert.deepEqual(revised.changes, ["45 minutes", "adding Nina"]);

  const wednesday = reviseSchedulingDraft("anything on Wednesday instead?", draft, maya);
  assert.equal(wednesday.kind, "draft");
  if (wednesday.kind === "draft") assert.deepEqual(wednesday.draft.window, { kind: "days", days: ["Wed"], week: "next" }, "a day stays inside the week being discussed");

  const removed = reviseSchedulingDraft("drop Priya", draft, maya);
  assert.ok(removed.kind === "draft" && removed.draft.attendeeIds.join() === "p_coo");

  const afternoon = reviseSchedulingDraft("what about the afternoon?", draft, maya);
  assert.ok(afternoon.kind === "draft" && afternoon.draft.notBeforeMinutes === 720 && afternoon.draft.title === null);
});

test("a follow-up about something else does not rewrite the meeting", () => {
  assert.equal(looksLikeFollowUp("What's on my calendar tomorrow?"), false);
  assert.equal(looksLikeFollowUp("What emails need my attention?"), false);
  assert.equal(looksLikeFollowUp("make it 45"), true);
  assert.equal(looksLikeFollowUp("Thursday?"), true);
});

test("windows resolve in the executive's timezone and never start in the past", () => {
  const thursdayEvening = new Date("2026-09-25T01:30:00.000Z"); // Thu Sep 24, 6:30 PM PT
  const next = resolveWindow({ kind: "next_week" }, thursdayEvening, "America/Los_Angeles");
  assert.equal(zonedClock(new Date(next.from), "America/Los_Angeles").date, "2026-09-28");
  assert.equal(zonedClock(new Date(next.from), "America/Los_Angeles").minutes, 0);
  assert.equal(zonedClock(new Date(next.to), "America/Los_Angeles").date, "2026-10-03");
  const today = resolveWindow({ kind: "today" }, thursdayEvening, "America/Los_Angeles");
  assert.ok(Date.parse(today.from) > thursdayEvening.getTime());
  const before = resolveWindow({ kind: "before", day: "Fri", minutes: 900 }, thursdayEvening, "America/Los_Angeles");
  assert.equal(zonedClock(new Date(before.to), "America/Los_Angeles").date, "2026-09-25");
  assert.equal(zonedClock(new Date(before.to), "America/Los_Angeles").minutes, 900);
});
