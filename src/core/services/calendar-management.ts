import type { CalendarEvent, Person } from "@/core/contracts";
import { RescheduleCalendarEventSchema } from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import { nextId, recordAudit, store } from "@/core/store";
import { BUSY_BLOCKS, PROTECTED_BLOCKS } from "@/data/calendar";
import { personById } from "@/data/org";

export class CalendarManagementError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.name = "CalendarManagementError";
    this.status = status;
  }
}

/** Event details are owner-scoped so subjects cannot leak across calendars. */
export function listOwnedCalendarEvents(actorId: string): CalendarEvent[] {
  return [...store.mockEvents.values()]
    .filter((event) => event.ownerId === actorId)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(copyEvent);
}

/** Reschedule an event without mutating the previously stored event object. */
export function rescheduleCalendarEvent(input: {
  actorId: string;
  eventId: string;
  start: string;
}): CalendarEvent {
  const parsed = RescheduleCalendarEventSchema.safeParse({
    start: input.start,
  });
  if (!parsed.success) {
    throw new CalendarManagementError("Choose a valid start time.", 400);
  }

  const original = store.mockEvents.get(input.eventId);
  if (!original || original.ownerId !== input.actorId) {
    throw new CalendarManagementError("Calendar event not found.", 404);
  }
  const duration = Date.parse(original.end) - Date.parse(original.start);
  const startAt = Date.parse(parsed.data.start);
  const horizon = 30 * 24 * 60 * 60 * 1000;
  const originalAnchor = original.originalStart ?? original.start;
  if (startAt < Date.now()) {
    throw new CalendarManagementError("Events cannot be moved into the past.", 400);
  }
  if (Math.abs(startAt - Date.parse(originalAnchor)) > horizon) {
    throw new CalendarManagementError("Events may be moved by at most 30 days.", 400);
  }
  const end = new Date(startAt + duration).toISOString();

  const actor = personById(input.actorId);
  const decision = evaluatePolicy({
    action: "calendar.update_event",
    actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive",
    resourceOwnerId: original.ownerId,
    risk: original.sensitivity === "normal" ? "low" : "medium",
    topic: "scheduling",
    confidential: original.sensitivity !== "normal",
    ruleState: store.ruleState,
  });
  if (decision.outcome !== "allow") {
    throw new CalendarManagementError("This calendar change requires a separate approval workflow.", 403);
  }

  const participants = [...new Set([original.ownerId, ...(original.attendeeIds ?? [])])];
  validateWorkingHours(participants, parsed.data.start, end);
  validateConflicts(original.eventId, participants, parsed.data.start, end);

  const updated: CalendarEvent = {
    ...original,
    attendeeIds: [...(original.attendeeIds ?? [])],
    start: parsed.data.start,
    end,
    originalStart: originalAnchor,
  };
  store.mockEvents = new Map(store.mockEvents).set(updated.eventId, updated);

  recordAudit({
    correlationId: nextId("cor"),
    actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive",
    action: "calendar.event.rescheduled",
    resourceType: "calendar_event",
    resourceId: updated.eventId,
    outcome: "completed",
    risk: original.sensitivity === "normal" ? "low" : "medium",
    policyVersion: decision.policyVersion,
    matchedRules: decision.matchedRules,
    aiModel: null,
    promptVersion: null,
    detail: `Owned synthetic event rescheduled from ${original.start} to ${updated.start}. ${decision.reason}`,
  });
  return copyEvent(updated);
}

function copyEvent(event: CalendarEvent): CalendarEvent {
  return { ...event, attendeeIds: [...(event.attendeeIds ?? [])] };
}

function validateWorkingHours(
  participantIds: string[],
  start: string,
  end: string,
): void {
  for (const participantId of participantIds) {
    const participant = personById(participantId);
    if (!participant || !insideWorkingHours(participant, start, end)) {
      throw new CalendarManagementError(
        "The requested time must be inside every participant's working hours.",
        400,
      );
    }

    const local = localTime(new Date(start), participant.timezone);
    const localEnd = localTime(new Date(end), participant.timezone);
    const protectedBlocks = PROTECTED_BLOCKS[participantId] ?? [];
    if (protectedBlocks.some((block) =>
      local.minutes < block.endHour * 60 && localEnd.minutes > block.startHour * 60)) {
      throw new CalendarManagementError("The requested time overlaps a protected calendar block.", 409);
    }
  }
}

function insideWorkingHours(person: Person, start: string, end: string): boolean {
  const localStart = localTime(new Date(start), person.timezone);
  const localEnd = localTime(new Date(end), person.timezone);
  const sameDay = localStart.date === localEnd.date;
  return sameDay &&
    localStart.weekday !== "Sat" && localStart.weekday !== "Sun" &&
    localStart.minutes >= person.workingHours.startHour * 60 &&
    localEnd.minutes <= person.workingHours.endHour * 60;
}

function localTime(date: Date, timeZone: string): {
  date: string;
  weekday: string;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function validateConflicts(
  eventId: string,
  participantIds: string[],
  start: string,
  end: string,
): void {
  const startAt = Date.parse(start);
  const endAt = Date.parse(end);
  const participantSet = new Set(participantIds);
  const storedConflict = [...store.mockEvents.values()].some((event) =>
    event.eventId !== eventId &&
    Date.parse(event.start) < endAt &&
    Date.parse(event.end) > startAt &&
    [event.ownerId, ...(event.attendeeIds ?? [])].some((id) => participantSet.has(id)));
  const busyConflict = BUSY_BLOCKS.some((block) =>
    participantSet.has(block.personId) &&
    Date.parse(block.start) < endAt &&
    Date.parse(block.end) > startAt);
  if (storedConflict || busyConflict) {
    throw new CalendarManagementError(
      "A participant is already busy at the requested time.",
      409,
    );
  }
}
