import assert from "node:assert/strict";
import test from "node:test";
import { MeetingRequestSchema } from "../src/core/contracts/index.ts";
import {
  CalendarManagementError,
  listOwnedCalendarEvents,
  rescheduleCalendarEvent,
} from "../src/core/services/calendar-management.ts";
import { maySubmitMeetingRequest, rankSlots } from "../src/core/services/scheduling.ts";
import { resetStore, store } from "../src/core/store/index.ts";
import { personById } from "../src/data/org.ts";
import { MockCalendarConnector } from "../src/core/connectors/mock.ts";

function seedEvent(input: {
  eventId: string;
  ownerId: string;
  start: string;
  end: string;
  subject?: string;
  attendeeIds?: string[];
  sensitivity?: "normal" | "confidential";
}) {
  const event = {
    subject: "Synthetic leadership meeting",
    attendeeIds: [],
    sensitivity: "normal" as const,
    ...input,
  };
  store.mockEvents.set(event.eventId, event);
  return event;
}

test.beforeEach(() => {
  resetStore();
  store.mockEvents.clear();
});

test("calendar listing returns only the actor's own synthetic events", () => {
  seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
    subject: "CEO operating review",
  });
  seedEvent({
    eventId: "ev_cfo",
    ownerId: "p_cfo",
    start: "2030-01-08T20:00:00.000Z",
    end: "2030-01-08T21:00:00.000Z",
    subject: "Private finance review",
  });

  const events = listOwnedCalendarEvents("p_ceo");

  assert.deepEqual(events.map((event) => event.eventId), ["ev_ceo"]);
  assert.equal(events[0]?.subject, "CEO operating review");
  assert.ok(!JSON.stringify(events).includes("Private finance review"));
  assert.notStrictEqual(events[0], store.mockEvents.get("ev_ceo"));
});

test("an owner can reschedule immutably and every successful change is audited", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    attendeeIds: ["p_coo"],
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });

  const updated = rescheduleCalendarEvent({
    actorId: "p_ceo",
    eventId: original.eventId,
    start: "2030-01-09T19:00:00.000Z",
  });

  assert.equal(original.start, "2030-01-08T18:00:00.000Z");
  assert.notStrictEqual(updated, original);
  assert.notStrictEqual(store.mockEvents.get(original.eventId), original);
  assert.equal(updated.start, "2030-01-09T19:00:00.000Z");
  assert.deepEqual(updated.attendeeIds, ["p_coo"]);
  assert.notStrictEqual(updated.attendeeIds, original.attendeeIds);
  assert.equal(store.audit.length, 1);
  assert.equal(store.audit[0]?.action, "calendar.event.rescheduled");
  assert.equal(store.audit[0]?.actorId, "p_ceo");
  assert.equal(store.audit[0]?.resourceId, original.eventId);
});

test("a delegated assistant cannot bypass policy to reschedule the executive's event", () => {
  seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });

  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ea",
      eventId: "ev_ceo",
      start: "2030-01-09T19:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && error.status === 404,
  );
});

test("an unrelated actor cannot reschedule or learn another owner's event", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
    subject: "Restricted strategy session",
  });

  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_cfo",
      eventId: original.eventId,
      start: "2030-01-09T19:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError &&
      error.status === 404 && !error.message.includes(original.subject),
  );
  assert.strictEqual(store.mockEvents.get(original.eventId), original);
  assert.equal(store.audit.length, 0);
});

test("rescheduling rejects participant conflicts without changing the event", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    attendeeIds: ["p_coo"],
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });
  seedEvent({
    eventId: "ev_coo_conflict",
    ownerId: "p_coo",
    start: "2030-01-09T19:30:00.000Z",
    end: "2030-01-09T20:30:00.000Z",
  });

  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: original.eventId,
      start: "2030-01-09T19:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && error.status === 409,
  );
  assert.strictEqual(store.mockEvents.get(original.eventId), original);
  assert.equal(store.audit.length, 0);
});

test("rescheduling rejects time outside a participant's local working hours", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });

  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: original.eventId,
      start: "2030-01-09T15:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError &&
      error.status === 400 && /working hours/i.test(error.message),
  );
  assert.strictEqual(store.mockEvents.get(original.eventId), original);
  assert.equal(store.audit.length, 0);
});

test("rescheduling preserves duration and refuses moves outside a 30-day horizon", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });
  const updated = rescheduleCalendarEvent({
    actorId: "p_ceo",
    eventId: original.eventId,
    start: "2030-01-09T19:00:00.000Z",
  });
  assert.equal(Date.parse(updated.end) - Date.parse(updated.start), 60 * 60 * 1000);
  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: original.eventId,
      start: "2030-03-09T19:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && error.status === 400,
  );
});

test("the reschedule horizon stays anchored to the event's original time", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });
  rescheduleCalendarEvent({
    actorId: "p_ceo",
    eventId: original.eventId,
    start: "2030-02-05T18:00:00.000Z",
  });
  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: original.eventId,
      start: "2030-03-05T18:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && error.status === 400,
  );
});

test("a connector-created confidential event cannot use the routine owner shortcut", async () => {
  const calendar = new MockCalendarConnector();
  const created = await calendar.createEvent({
    ownerId: "p_ceo",
    attendeeIds: [],
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
    subject: "Confidential strategy",
    sensitivity: "confidential",
    approvalId: "approved-confidential",
  });
  assert.equal(store.mockEvents.get(created.eventId)?.sensitivity, "confidential");
  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: created.eventId,
      start: "2030-01-09T18:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && error.status === 403,
  );
});

test("events cannot be moved into the past", () => {
  const original = seedEvent({
    eventId: "ev_ceo",
    ownerId: "p_ceo",
    start: "2030-01-08T18:00:00.000Z",
    end: "2030-01-08T19:00:00.000Z",
  });
  assert.throws(
    () => rescheduleCalendarEvent({
      actorId: "p_ceo",
      eventId: original.eventId,
      start: "2020-01-08T18:00:00.000Z",
    }),
    (error) => error instanceof CalendarManagementError && /past/i.test(error.message),
  );
});

test("meeting requests require a meaningful bounded purpose and duration", () => {
  const base = {
    requesterId: "p_coo",
    attendeeIds: ["p_ceo"],
    purpose: "Operations review",
    durationMinutes: 30,
    sensitivity: "normal",
    earliest: "2030-01-08T18:00:00.000Z",
    latest: "2030-01-08T20:00:00.000Z",
  };

  assert.equal(MeetingRequestSchema.safeParse(base).success, true);
  assert.equal(MeetingRequestSchema.safeParse({ ...base, purpose: "   " }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({ ...base, purpose: "x".repeat(201) }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({ ...base, durationMinutes: 0 }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({ ...base, durationMinutes: 481 }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({ ...base, attendeeIds: Array.from({ length: 13 }, (_, index) => `p_${index}`) }).success, false);
});

test("meeting requests require a valid window long enough for the meeting", () => {
  const base = {
    requesterId: "p_coo",
    attendeeIds: ["p_ceo"],
    purpose: "Operations review",
    durationMinutes: 60,
    sensitivity: "normal",
    earliest: "2030-01-08T18:00:00.000Z",
    latest: "2030-01-08T20:00:00.000Z",
  };

  assert.equal(MeetingRequestSchema.safeParse({ ...base, earliest: "tomorrow" }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({
    ...base,
    earliest: "2030-01-08T20:00:00.000Z",
    latest: "2030-01-08T18:00:00.000Z",
  }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({
    ...base,
    latest: "2030-02-20T18:00:00.000Z",
  }).success, false);
  assert.equal(MeetingRequestSchema.safeParse({
    ...base,
    earliest: "2030-01-08T18:00:00.000Z",
    latest: "2030-01-08T18:30:00.000Z",
  }).success, false);
});

test("an unrelated executive assistant cannot submit requests for other executives", () => {
  const assistant = personById("p_ea")!;
  const request = MeetingRequestSchema.parse({
    requesterId: "p_cfo",
    attendeeIds: ["p_coo"],
    purpose: "Finance and operations review",
    durationMinutes: 30,
    sensitivity: "normal",
    earliest: "2030-01-08T18:00:00.000Z",
    latest: "2030-01-08T22:00:00.000Z",
  });

  assert.equal(maySubmitMeetingRequest(assistant, request), false);
  assert.equal(maySubmitMeetingRequest(assistant, {
    ...request,
    attendeeIds: ["p_ceo"],
  }), true);
});

test("slot ranking uses each participant's IANA timezone instead of the server timezone", () => {
  const request = MeetingRequestSchema.parse({
    requesterId: "p_cfo",
    attendeeIds: ["p_cfo"],
    purpose: "Finance focus",
    durationMinutes: 30,
    sensitivity: "normal",
    earliest: "2030-01-08T13:00:00.000Z",
    latest: "2030-01-08T14:00:00.000Z",
  });
  const slots = rankSlots({ participants: ["p_cfo"], busy: [], request });
  assert.equal(slots[0]?.start, "2030-01-08T13:00:00.000Z");
});
