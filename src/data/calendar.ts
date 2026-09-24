import type { BusyBlock, CalendarEvent } from "@/core/contracts";
import type { FocusBlock, Weekday } from "@/core/scheduling/availability";
import { PEOPLE, personById } from "@/data/org";

/**
 * Synthetic free/busy. Deliberately contains no meeting subjects: the mock
 * connector cannot leak a title because no title exists in the fixture.
 */

function slot(
  personId: string,
  dayOffset: number,
  startHour: number,
  endHour: number,
  status: BusyBlock["status"] = "busy",
): BusyBlock {
  const timezone = personById(personId)?.timezone ?? "America/Los_Angeles";
  const start = zonedDate(dayOffset, startHour, timezone);
  const end = zonedDate(dayOffset, endHour, timezone);
  return { personId, start: start.toISOString(), end: end.toISOString(), status };
}

/** Hand-placed commitments for the next four business days. */
const THIS_WEEK: BusyBlock[] = [
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

type Recurring = [Weekday[], number, number, BusyBlock["status"]?];

/**
 * A recurring week for every internal person, in their own local hours, so
 * multi-person requests ("next week with Ray and Priya") meet a realistic
 * calendar rather than an empty one. Days with hand-placed commitments above
 * keep those instead.
 */
const RECURRING_WEEK: Record<string, Recurring[]> = {
  p_ceo: [[["Mon"], 9, 10], [["Mon"], 13, 14], [["Tue"], 10, 12], [["Tue"], 15, 16], [["Wed"], 9, 10], [["Wed"], 14, 15, "tentative"], [["Thu"], 11, 12], [["Thu"], 16, 17], [["Fri"], 9, 11]],
  p_ea: [[["Mon", "Wed", "Fri"], 7, 8], [["Tue", "Thu"], 12, 13]],
  p_coo: [[["Mon"], 7, 9], [["Tue"], 13, 15], [["Wed"], 10, 11], [["Thu"], 8, 10], [["Fri"], 14, 16]],
  p_cfo: [[["Mon"], 12, 13], [["Tue"], 9, 11], [["Wed"], 15, 17], [["Thu"], 13, 14], [["Fri"], 10, 12]],
  p_cdio: [[["Mon", "Thu"], 9, 11], [["Wed"], 13, 15]],
  p_cmo: [[["Tue"], 9, 12], [["Thu"], 14, 16], [["Fri"], 10, 11]],
  p_gc: [[["Mon"], 10, 12], [["Wed"], 9, 10], [["Fri"], 13, 15]],
  p_vp_stores: [[["Mon"], 8, 10], [["Tue"], 11, 12], [["Wed"], 12, 14], [["Thu"], 9, 10], [["Fri"], 8, 12, "out_of_office"]],
  p_vp_logistics: [[["Mon", "Wed"], 8, 9], [["Tue"], 14, 16], [["Thu"], 10, 12]],
  p_vp_brand: [[["Mon"], 14, 15], [["Wed"], 10, 12], [["Fri"], 9, 10]],
  p_dir_ops: [[["Mon"], 11, 12], [["Wed"], 15, 16], [["Thu"], 13, 14, "tentative"]],
  p_mgr_analytics: [[["Tue", "Thu"], 9, 10], [["Wed"], 14, 15]],
  p_auditor: [[["Mon"], 13, 15], [["Thu"], 9, 11]],
};

/** Business days the fixture covers, enough for "next week" asked on a Friday. */
const HORIZON_BUSINESS_DAYS = 15;

function recurringBlocks(): BusyBlock[] {
  const placed = new Set(THIS_WEEK.map((block) => `${block.personId}:${block.start.slice(0, 10)}`));
  const blocks: BusyBlock[] = [];
  for (const [personId, pattern] of Object.entries(RECURRING_WEEK)) {
    const timezone = personById(personId)?.timezone ?? "America/Los_Angeles";
    for (let offset = 1; offset <= HORIZON_BUSINESS_DAYS; offset += 1) {
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" })
        .format(zonedDate(offset, 12, timezone)) as Weekday;
      const day = zonedDate(offset, 12, timezone).toISOString().slice(0, 10);
      if (placed.has(`${personId}:${day}`)) continue;
      for (const [days, startHour, endHour, status] of pattern) {
        if (days.includes(weekday)) blocks.push(slot(personId, offset, startHour, endHour, status ?? "busy"));
      }
    }
  }
  return blocks;
}

export const BUSY_BLOCKS: BusyBlock[] = [...THIS_WEEK, ...recurringBlocks()];

/**
 * Focus time. Unlike protected blocks it can be booked over, but slots that
 * avoid it rank higher.
 */
export const FOCUS_BLOCKS: Record<string, FocusBlock[]> = {
  p_ceo: [{ weekdays: ["Fri"], startHour: 13, endHour: 15, label: "Focus time" }],
  p_coo: [{ weekdays: ["Tue", "Thu"], startHour: 15, endHour: 17, label: "Focus time" }],
  p_cfo: [{ weekdays: ["Mon", "Wed"], startHour: 16, endHour: 18, label: "Focus time" }],
};

/** Every person the fixture knows, for tests that check coverage. */
export const CALENDAR_PEOPLE = PEOPLE.filter((person) => person.function !== "external").map((person) => person.id);

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
  calendarEvent("cal_ceo_denim", "p_ceo", 4, 13, 30, "America/Los_Angeles", "Denim launch messaging review", ["p_vp_brand", "p_cmo"]),
];
