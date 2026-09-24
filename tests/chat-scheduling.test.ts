import assert from "node:assert/strict";
import test from "node:test";
import type { ChatPart } from "../src/core/contracts/index.ts";
import { ChatPartSchema } from "../src/core/contracts/index.ts";
import { runMemorySession } from "../src/core/persistence/index.ts";
import { respond } from "../src/core/services/chat.ts";
import { bookAllowedMeeting } from "../src/core/services/scheduling.ts";
import { listVisibleCalendarEvents } from "../src/core/services/calendar-management.ts";
import { listAudit, store } from "../src/core/store/index.ts";
import { personById } from "../src/data/org.ts";

const maya = personById("p_ceo")!;
const slotsOf = (parts: ChatPart[]) => parts.find((part): part is Extract<ChatPart, { type: "slots" }> => part.type === "slots");

test("demo script: request, options, book, event on every calendar, then revise", async () => {
  await runMemorySession("chat-demo", async () => {
    // 1. "Find 30 minutes next week with Ray and Priya" -> 3 to 4 options.
    const first = await respond(maya, "Find 30 minutes next week with Ray and Priya", null);
    for (const part of first.parts) assert.ok(ChatPartSchema.safeParse(part).success, `valid ${part.type} part`);
    const options = slotsOf(first.parts);
    assert.ok(options, "a slots part is returned");
    assert.ok(Math.min(options.slots.length, options.initiallyVisible) >= 3, "at least three options are shown");
    assert.deepEqual(options.attendees.map((person) => person.id), ["p_ceo", "p_coo", "p_cfo"]);
    assert.equal(options.approvalId, null, "the CEO books directly");
    assert.equal(options.policyNote, null);
    assert.equal(first.context?.scheduling?.durationMinutes, 30);

    // 2. Click one -> confirm -> booked, with an edited title.
    const chosen = options.slots[0];
    const booked = await bookAllowedMeeting({ actorId: "p_ceo", proposalId: options.proposalId, slotIndex: chosen.index, subject: "Q4 planning sync" });
    assert.equal(booked.execution.kind, "calendar_event_created");
    for (const attendee of ["p_ceo", "p_coo", "p_cfo"]) {
      const visible = listVisibleCalendarEvents(attendee).find((event) => event.eventId === booked.execution.eventId);
      assert.equal(visible?.subject, "Q4 planning sync", `${attendee} sees the meeting`);
    }
    assert.equal(listVisibleCalendarEvents("p_cmo").some((event) => event.eventId === booked.execution.eventId), false, "people not invited do not");
    assert.ok(listAudit().some((event) => event.action === "connector.calendar.create_event" && event.resourceId === options.proposalId));

    // 3. "Actually make it 45 and add Nina" -> new options that avoid the booked time.
    const second = await respond(maya, "Actually make it 45 and add Nina", first.context);
    const revised = slotsOf(second.parts);
    assert.ok(revised && revised.slots.length > 0, "new options after the revision");
    assert.equal(revised.durationMinutes, 45);
    assert.deepEqual(revised.attendees.map((person) => person.id), ["p_ceo", "p_coo", "p_cfo", "p_vp_stores"]);
    assert.match(second.summary, /Updated: 45 minutes, adding Nina/);
    for (const slot of revised.slots) {
      assert.ok(slot.end <= chosen.start || slot.start >= chosen.end, "never overlaps the meeting just booked");
    }
  });
});

test("an ambiguous request asks a question instead of guessing", async () => {
  await runMemorySession("chat-clarify", async () => {
    const reply = await respond(maya, "Find time with the VP next week", null);
    const clarify = reply.parts.find((part) => part.type === "clarify");
    assert.ok(clarify && clarify.type === "clarify" && clarify.options.length === 3);
    assert.equal(store.proposals.size, 0, "nothing is proposed until the person is known");
  });
});

test("a project team check-in schedules with the project's members", async () => {
  await runMemorySession("chat-project", async () => {
    const reply = await respond(maya, "Schedule a check-in with the remodel pilot team", null);
    const options = slotsOf(reply.parts);
    assert.ok(options);
    assert.deepEqual(options.attendees.map((person) => person.id).sort(), ["p_ceo", "p_coo", "p_dir_ops", "p_vp_stores"]);
    assert.equal(options.projectId, "pr_remodel");
    assert.match(options.title, /West region remodel pilot check-in/);
  });
});

test("project and inbox questions return cards, not prose only", async () => {
  await runMemorySession("chat-cards", async () => {
    const pending = await respond(maya, "What's pending on the denim launch?", null);
    assert.ok(pending.parts.some((part) => part.type === "project_card"));
    const inbox = await respond(maya, "What emails need my attention?", null);
    const cards = inbox.parts.filter((part) => part.type === "email_card");
    assert.ok(cards.length >= 3);
    const crisis = cards.find((part) => part.type === "email_card" && part.email.id === "e_crisis");
    assert.ok(crisis && crisis.type === "email_card" && crisis.email.replyable === false, "high-risk mail cannot be answered from a card");
    const replyable = cards.filter((part) => part.type === "email_card" && part.email.replyable);
    assert.ok(replyable.length >= 2, "routine mail can be handled from the cards");
    assert.ok(cards.some((part) => part.type === "email_card" && part.email.id === "e_schedule_direct"), "Ray's 1:1 request is among them");
  });
});

test("restricted mail never appears in another executive's cards", async () => {
  await runMemorySession("chat-restricted", async () => {
    const inbox = await respond(personById("p_cdio")!, "What emails need my attention?", null);
    assert.ok(!JSON.stringify(inbox).toLowerCase().includes("indication of interest"));
  });
});

test("a forged draft naming unknown or external ids is cleaned before anything runs", async () => {
  await runMemorySession("chat-forged", async () => {
    const reply = await respond(maya, "make it 45", {
      scheduling: { attendeeIds: ["p_ext_banker", "p_ghost", "p_coo"], durationMinutes: 30, window: { kind: "next_week" }, title: null },
    });
    const options = slotsOf(reply.parts);
    assert.ok(options);
    assert.deepEqual(options.attendees.map((person) => person.id), ["p_ceo", "p_coo"]);
  });
});
