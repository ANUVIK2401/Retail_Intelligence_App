import assert from "node:assert/strict";
import test from "node:test";
import type { BusyBlock, Person } from "../src/core/contracts/index.ts";
import { findSlots, suggestAlternatives, zonedClock } from "../src/core/scheduling/availability.ts";
import { personById } from "../src/data/org.ts";

// Tuesday 2030-01-08. 16:00Z = 8:00 PT = 11:00 ET.
const ceo = personById("p_ceo")!;
const coo = personById("p_coo")!;
const cfo = personById("p_cfo")!;
const day = (hourUtc: number, minute = 0) => `2030-01-08T${String(hourUtc).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00.000Z`;
const busy = (person: Person, from: string, to: string, status: BusyBlock["status"] = "busy"): BusyBlock => ({ personId: person.id, start: from, end: to, status });
const base = { durationMinutes: 30, from: day(16), to: day(23), limit: 20 };

test("finds only times when every participant is free", () => {
  const slots = findSlots({ ...base, participants: [ceo, coo], busy: [busy(ceo, day(17), day(19)), busy(coo, day(19), day(20))] });
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    assert.ok(slot.end <= day(17) || slot.start >= day(20), `${slot.start} overlaps someone's busy time`);
  }
});

test("reports nothing when calendars never overlap in working hours", () => {
  const slots = findSlots({ ...base, participants: [ceo, coo], busy: [busy(ceo, day(16), day(23))] });
  assert.deepEqual(slots, []);
});

test("respects each participant's own timezone for working hours", () => {
  // Priya works 8-18 ET; 22:30Z is 5:30 PM ET but 2:30 PM PT. A 60-minute
  // meeting starting 22:30Z ends at 6:30 PM ET, after her day.
  const slots = findSlots({ ...base, durationMinutes: 60, participants: [ceo, cfo], busy: [] });
  assert.ok(slots.every((slot) => zonedClock(new Date(slot.end), "America/New_York").minutes <= 18 * 60));
  assert.ok(slots.every((slot) => zonedClock(new Date(slot.start), "America/Los_Angeles").minutes >= 8 * 60));
});

test("never books over a protected block, and ranks focus time lower", () => {
  const slots = findSlots({
    ...base, participants: [ceo], busy: [],
    protectedBlocks: { p_ceo: [{ startHour: 8, endHour: 9, label: "Protected strategy hour" }] },
    focusBlocks: { p_ceo: [{ startHour: 10, endHour: 11, label: "Focus time" }] },
  });
  assert.ok(slots.every((slot) => zonedClock(new Date(slot.start), "America/Los_Angeles").minutes >= 9 * 60), "protected hour is excluded");
  const focus = slots.find((slot) => slot.rationale.includes("focus time"));
  const free = slots.find((slot) => slot.rationale.startsWith("Everyone is free"));
  assert.ok(focus && free && focus.score < free.score, "focus-time slots rank below free ones");
});

test("a buffer keeps space around existing meetings", () => {
  const blocks = [busy(ceo, day(18), day(19))];
  const without = findSlots({ ...base, participants: [ceo], busy: blocks });
  const withBuffer = findSlots({ ...base, participants: [ceo], busy: blocks, constraints: { timezone: ceo.timezone, bufferMinutes: 15 } });
  assert.ok(without.some((slot) => slot.start === day(19)), "back-to-back is allowed without a buffer");
  assert.ok(!withBuffer.some((slot) => slot.start === day(19) || slot.end === day(18)), "the buffer excludes adjacent slots");
});

test("boundary times: a slot may end exactly at the end of the working day but not after", () => {
  // CEO works 8-18 PT. 01:30Z next day = 17:30 PT.
  const slots = findSlots({ ...base, from: day(16), to: "2030-01-09T03:00:00.000Z", participants: [ceo], busy: [] });
  assert.ok(slots.some((slot) => slot.end === "2030-01-09T02:00:00.000Z"), "17:30-18:00 PT is offered");
  assert.ok(!slots.some((slot) => slot.end > "2030-01-09T02:00:00.000Z"), "nothing ends after 18:00 PT");
});

test("tentative holds are allowed but ranked lower and named", () => {
  const slots = findSlots({ ...base, participants: [ceo, coo], busy: [busy(coo, day(18), day(19), "tentative")] });
  const held = slots.find((slot) => slot.start === day(18));
  assert.ok(held, "a tentative hold does not block");
  assert.match(held!.rationale, /Ray Alvarez is tentatively held/);
});

test("day and time-of-day constraints are honored in the organizer's zone", () => {
  const slots = findSlots({ ...base, from: "2030-01-07T15:00:00.000Z", to: "2030-01-12T00:00:00.000Z", participants: [ceo], busy: [], constraints: { timezone: ceo.timezone, days: ["Wed"], notBeforeMinutes: 12 * 60 } });
  assert.ok(slots.length > 0);
  for (const slot of slots) {
    const local = zonedClock(new Date(slot.start), ceo.timezone);
    assert.equal(local.weekday, "Wed");
    assert.ok(local.minutes >= 12 * 60);
  }
});

test("options are spread across days before repeating a day, and shown in time order", () => {
  const slots = findSlots({ durationMinutes: 30, from: "2030-01-07T15:00:00.000Z", to: "2030-01-12T00:00:00.000Z", participants: [ceo], busy: [], limit: 4 });
  const days = slots.map((slot) => zonedClock(new Date(slot.start), ceo.timezone).date);
  assert.equal(new Set(days).size, 4);
  assert.deepEqual([...slots].sort((a, b) => a.start.localeCompare(b.start)), slots);
});

test("with no common time, suggests a shorter meeting or the closest slot with one conflict, naming who", () => {
  // Only a 15-minute gap is free for both, so 30 minutes fails.
  const blocks = [busy(ceo, day(16), day(18)), busy(ceo, day(18, 15), day(23)), busy(coo, day(16), day(17))];
  const query = { durationMinutes: 30, from: day(16), to: day(23), participants: [ceo, coo], busy: blocks };
  assert.deepEqual(findSlots(query), []);
  const alternatives = suggestAlternatives(query);
  const shorter = alternatives.find((alternative) => alternative.kind === "shorter");
  assert.ok(shorter && shorter.kind === "shorter" && shorter.durationMinutes === 15 && shorter.slots[0].start === day(18));
  const conflict = alternatives.find((alternative) => alternative.kind === "one_conflict");
  assert.ok(conflict && conflict.kind === "one_conflict" && conflict.personId === "p_ceo");
  assert.deepEqual(conflict.slot.conflictsWith, ["p_ceo"]);
});
