import assert from "node:assert/strict";
import test from "node:test";
import { ChatPartSchema, type ChatPart } from "../src/core/contracts/index.ts";
import { greetingFor, otherZoneTimes, partToText, slotDay, slotTime, visibleSlots } from "../src/components/chat/parts.ts";

const people = [
  { id: "p_ceo", name: "Maya Hollis", title: "CEO", timezone: "America/Los_Angeles" },
  { id: "p_coo", name: "Ray Alvarez", title: "COO", timezone: "America/Los_Angeles" },
  { id: "p_cfo", name: "Priya Raman", title: "CFO", timezone: "America/New_York" },
  { id: "p_vp_logistics", name: "Jordan Pike", title: "VP", timezone: "America/Chicago" },
];
const slots: Extract<ChatPart, { type: "slots" }> = {
  type: "slots", proposalId: "mp_1", approvalId: null, title: "Meeting with Ray and Priya", durationMinutes: 30,
  timezone: "America/Los_Angeles", windowLabel: "next week", attendees: people, initiallyVisible: 4, policyNote: null, projectId: null,
  slots: Array.from({ length: 6 }, (_, index) => ({ index, start: `2030-01-0${index + 7}T19:00:00.000Z`, end: `2030-01-0${index + 7}T19:30:00.000Z`, rationale: "Everyone is free" })),
};

const EVERY_PART: ChatPart[] = [
  { type: "text", text: "Here are 4 times." },
  { type: "items", items: [{ label: "Busy", detail: "Tue 9:00 AM", status: "busy" }] },
  slots,
  { type: "no_slots", message: "Here is what would work instead:", alternatives: [{ label: "Make it 15 minutes", prompt: "Make it 15 minutes", detail: "first Tue" }] },
  { type: "clarify", question: "Which VP?", options: [{ label: "Nina Serrano", prompt: "Find time with Nina Serrano" }] },
  { type: "actions", actions: [{ label: "45 min", prompt: "Make it 45 minutes" }] },
  { type: "email_card", email: { id: "e_1", subject: "Hello", from: "Ray", fromTitle: "COO", summary: "Asks to move a 1:1.", risk: "low", receivedAt: "2030-01-07T10:00:00.000Z", external: false, injectionSuspected: false, replyable: true, quickReplies: [], fullDraft: null } },
  { type: "event_confirmation", eventId: "ev_1", title: "Sync", start: slots.slots[0].start, end: slots.slots[0].end, timezone: "America/Los_Angeles", attendees: [{ id: "p_ceo", name: "Maya Hollis" }], note: "Recorded." },
  { type: "project_card", project: { id: "pr_1", name: "Denim", description: "", color: "teal", status: "active", counts: { emails: 1, meetings: 0, people: 2, notes: 0 } }, openItems: ["Reply to Sam"] },
  { type: "link", href: "/inbox", label: "Open Inbox" },
];

test("every part type the renderer handles is a valid contract shape", () => {
  for (const part of EVERY_PART) assert.ok(ChatPartSchema.safeParse(part).success, part.type);
  assert.equal(ChatPartSchema.safeParse({ type: "link", href: "https://evil.example", label: "x" }).success, false, "links stay inside the app");
  assert.equal(ChatPartSchema.safeParse({ type: "script", code: "alert(1)" }).success, false, "unknown part types are rejected");
});

test("every part has a plain-text reading for screen readers and read-aloud", () => {
  const texts = EVERY_PART.map(partToText);
  assert.equal(texts[0], "Here are 4 times.");
  assert.equal(texts[2], "6 available times for Meeting with Ray and Priya.");
  assert.match(texts[6], /Ray: Hello\. Asks to move a 1:1\./);
});

test("slot cards show the first four until expanded", () => {
  assert.equal(visibleSlots(slots, false).length, 4);
  assert.equal(visibleSlots(slots, true).length, 6);
});

test("slot times read in the organizer's zone, with other zones called out per person", () => {
  assert.equal(slotDay(slots.slots[0].start, "America/Los_Angeles"), "Mon, Jan 7");
  assert.equal(slotTime(slots.slots[0].start, slots.slots[0].end, "America/Los_Angeles"), "11:00 AM – 11:30 AM");
  assert.deepEqual(otherZoneTimes(slots.slots[0].start, people.slice(1), "America/Los_Angeles"), ["2:00 PM ET for Priya", "1:00 PM CT for Jordan"]);
});

test("the greeting follows the local clock", () => {
  assert.equal(greetingFor(8), "Good morning");
  assert.equal(greetingFor(13), "Good afternoon");
  assert.equal(greetingFor(20), "Good evening");
});
