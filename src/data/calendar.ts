import type { BusyBlock, CalendarEvent } from "@/core/contracts";

/**
 * Synthetic free/busy. Deliberately contains no meeting subjects: the mock
 * connector cannot leak a title because no title exists in the fixture.
 */

const PERSON_TIMEZONES: Record<string, string> = {
  p_ceo: "America/Los_Angeles",
  p_ea: "America/Los_Angeles",
  p_coo: "America/Los_Angeles",
  p_dir_ops: "America/Los_Angeles",
  p_vp_stores: "America/Los_Angeles",
  p_cfo: "America/New_York",
  p_vp_logistics: "America/Chicago",
};

function slot(
  personId: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
  status: BusyBlock["status"] = "busy",
): BusyBlock {
  const timezone = PERSON_TIMEZONES[personId] ?? "America/Los_Angeles";
  const start = zonedDate(dayOffset, startHour, timezone);
  const end = zonedDate(dayOffset, endHour, timezone);
  return { personId, start: start.toISOString(), end: end.toISOString(), status };
}

export const BUSY_BLOCKS: BusyBlock[] = [
  // CEO — heavily booked, with a protected strategy block each morning.
  slot("p_ceo", 1, 8, 9, "out_of_office"),
  slot("p_ceo", 1, 9, 11),
  slot("p_ceo", 1, 13, 14),
  slot("p_ceo", 1, 15, 17),
  slot("p_ceo", 2, 8, 9, "out_of_office"),
  slot("p_ceo", 2, 10, 12),
  slot("p_ceo", 2, 14, 15),
  slot("p_ceo", 3, 8, 9, "out_of_office"),
  slot("p_ceo", 3, 9, 10),
  slot("p_ceo", 3, 11, 12),
  slot("p_ceo", 3, 14, 16),
  slot("p_ceo", 4, 8, 9, "out_of_office"),
  slot("p_ceo", 4, 9, 12),
  slot("p_ceo", 4, 16, 18),

  // COO
  slot("p_coo", 1, 7, 12),
  slot("p_coo", 2, 9, 10),
  slot("p_coo", 2, 13, 15),
  slot("p_coo", 3, 8, 11),
  slot("p_coo", 4, 13, 14),

  // Director, requesting time with the CEO
  slot("p_dir_ops", 1, 9, 10),
  slot("p_dir_ops", 2, 11, 13),
  slot("p_dir_ops", 3, 9, 10, "tentative"),
  slot("p_dir_ops", 4, 14, 15),

  // Executive assistant
  slot("p_ea", 1, 7, 8),
  slot("p_ea", 2, 12, 13),
  slot("p_ea", 3, 15, 16),

  slot("p_cfo", 1, 10, 12),
  slot("p_cfo", 2, 9, 11),
  slot("p_cfo", 3, 13, 15),
  slot("p_vp_stores", 1, 8, 16),
  slot("p_vp_logistics", 2, 8, 10),
];

/** Protected blocks the assistant may never book over, by person. */
export const PROTECTED_BLOCKS: Record<string, { startHour: number; endHour: number; label: string }[]> = {
  p_ceo: [{ startHour: 8, endHour: 9, label: "Protected strategy hour" }],
};

function calendarEvent(
  eventId: string,
  ownerId: string,
  dayOffset: number,
  startHour: number,
  durationMinutes: number,
  timezone: string,
  subject: string,
  attendeeIds: string[] = [],
): CalendarEvent {
  const start = zonedDate(dayOffset, startHour, timezone);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return {
    eventId,
    ownerId,
    attendeeIds,
    start: start.toISOString(),
    end: end.toISOString(),
    subject,
    sensitivity: "normal",
  };
}

/** Build a wall-clock time in an IANA zone so fixtures survive UTC hosting and DST. */
function zonedDate(dayOffset: number, hour: number, timezone: string): Date {
  const partsFor = (date: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const today = partsFor(new Date());
  const businessDay = new Date(Date.UTC(read(today, "year"), read(today, "month") - 1, read(today, "day")));
  let added = 0;
  while (added < dayOffset) {
    businessDay.setUTCDate(businessDay.getUTCDate() + 1);
    if (businessDay.getUTCDay() !== 0 && businessDay.getUTCDay() !== 6) added += 1;
  }
  const desiredWall = Date.UTC(businessDay.getUTCFullYear(), businessDay.getUTCMonth(), businessDay.getUTCDate(), hour);
  let candidate = desiredWall;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = partsFor(new Date(candidate));
    const renderedWall = Date.UTC(read(rendered, "year"), read(rendered, "month") - 1, read(rendered, "day"), read(rendered, "hour"), read(rendered, "minute"));
    candidate += desiredWall - renderedWall;
  }
  return new Date(candidate);
}

/**
 * Synthetic event details for the schedule showcase. Unlike BUSY_BLOCKS these
 * contain subjects, so callers must filter by owner before returning them.
 */
export const SYNTHETIC_CALENDAR_EVENTS: CalendarEvent[] = [
  calendarEvent("cal_ceo_leadership", "p_ceo", 1, 11, 60, "America/Los_Angeles", "Leadership operating review", ["p_coo"]),
  calendarEvent("cal_ceo_store", "p_ceo", 2, 15, 45, "America/Los_Angeles", "Store performance briefing", ["p_vp_stores"]),
  calendarEvent("cal_ceo_focus", "p_ceo", 3, 10, 60, "America/Los_Angeles", "Executive focus block"),
  calendarEvent("cal_cfo_forecast", "p_cfo", 2, 12, 60, "America/New_York", "Quarterly forecast review", ["p_ceo"]),
];
