import type { BusyBlock, Person } from "@/core/contracts";

/**
 * Multi-person availability engine.
 *
 * Pure: no store, no connector, no clock unless one is passed in. Callers
 * fetch free/busy through the calendar connector and hand the blocks here, so
 * this module never sees a meeting subject and can be tested with plain data.
 *
 * Hard rules (a slot is never offered): weekends and hours outside any
 * participant's working day in their own timezone, protected blocks, busy or
 * out-of-office time, the requested buffer, and the caller's day/time limits.
 * Soft rules (a slot is ranked lower): tentative holds, focus time, and
 * back-to-back meetings.
 */

export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
export const WEEKDAYS: readonly Weekday[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type HourBlock = { startHour: number; endHour: number; label: string };
export type FocusBlock = HourBlock & { weekdays?: Weekday[] };

export type AvailabilityConstraints = {
  /** Zone the limits below are read in, normally the organizer's. */
  timezone: string;
  /** Earliest local start, in minutes after midnight. */
  notBeforeMinutes?: number;
  /** Latest local end, in minutes after midnight. */
  notAfterMinutes?: number;
  /** Only these local weekdays. */
  days?: Weekday[];
  /** Minimum gap to any busy block, before and after. */
  bufferMinutes?: number;
};

export type AvailabilityQuery = {
  participants: Person[];
  busy: BusyBlock[];
  durationMinutes: number;
  from: string;
  to: string;
  constraints?: AvailabilityConstraints;
  protectedBlocks?: Record<string, HourBlock[]>;
  focusBlocks?: Record<string, FocusBlock[]>;
  stepMinutes?: number;
  limit?: number;
  /** Busy time for these people is tolerated and reported instead of excluded. */
  tolerateBusyFor?: string[];
};

export type RankedSlot = {
  start: string;
  end: string;
  score: number;
  rationale: string;
  /** People whose busy time this slot overlaps. Only set when tolerated. */
  conflictsWith: string[];
};

export type Alternative =
  | { kind: "shorter"; durationMinutes: number; slots: RankedSlot[] }
  | { kind: "one_conflict"; personId: string; slot: RankedSlot };

const MINUTE = 60_000;
const NEAR_CONFLICT_MINUTES = 15;
/** Options offered at once before "Show more times". */
const PRESENTED_TOGETHER = 4;

export function findSlots(query: AvailabilityQuery): RankedSlot[] {
  const step = (query.stepMinutes ?? 30) * MINUTE;
  const duration = query.durationMinutes * MINUTE;
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || duration <= 0) return [];
  const anchorZone = query.constraints?.timezone ?? query.participants[0]?.timezone ?? "UTC";

  const candidates: RankedSlot[] = [];
  for (let t = ceilToStep(from, step); t + duration <= to; t += step) {
    const slot = scoreSlot(query, t, t + duration, anchorZone);
    if (slot) candidates.push(slot);
  }
  const chosen = spreadAcrossDays(candidates, anchorZone).slice(0, query.limit ?? 4);
  // Chosen by rank, shown in time order: the best four read Monday to
  // Friday, then the next four. Reading options out of order is harder.
  const groups: RankedSlot[][] = [];
  for (let index = 0; index < chosen.length; index += PRESENTED_TOGETHER) {
    groups.push(chosen.slice(index, index + PRESENTED_TOGETHER).sort((a, b) => a.start.localeCompare(b.start)));
  }
  return groups.flat();
}

/** What to offer when nobody shares a free slot: a shorter meeting, or the closest time with one conflict. */
export function suggestAlternatives(query: AvailabilityQuery): Alternative[] {
  const alternatives: Alternative[] = [];
  if (query.durationMinutes > 15) {
    const durationMinutes = Math.max(15, Math.floor(query.durationMinutes / 2 / 15) * 15);
    const slots = findSlots({ ...query, durationMinutes, limit: 2 });
    if (slots.length) alternatives.push({ kind: "shorter", durationMinutes, slots });
  }
  const oneConflict = query.participants
    .map((person) => ({ personId: person.id, slot: findSlots({ ...query, tolerateBusyFor: [person.id], limit: 1 })[0] }))
    .filter((option): option is { personId: string; slot: RankedSlot } => Boolean(option.slot))
    .sort((a, b) => a.slot.start.localeCompare(b.slot.start));
  if (oneConflict[0]) alternatives.push({ kind: "one_conflict", ...oneConflict[0] });
  return alternatives;
}

function scoreSlot(query: AvailabilityQuery, startMs: number, endMs: number, anchorZone: string): RankedSlot | null {
  const start = new Date(startMs);
  const end = new Date(endMs);
  const buffer = (query.constraints?.bufferMinutes ?? 0) * MINUTE;
  const reasons: string[] = [];
  const conflictsWith: string[] = [];
  let score = 100;

  if (!withinConstraints(start, end, query.constraints)) return null;

  for (const person of query.participants) {
    const localStart = zonedClock(start, person.timezone);
    const localEnd = zonedClock(end, person.timezone);
    if (localStart.weekday === "Sat" || localStart.weekday === "Sun" || localStart.date !== localEnd.date ||
      localStart.minutes < person.workingHours.startHour * 60 || localEnd.minutes > person.workingHours.endHour * 60) {
      return null;
    }
    if ((query.protectedBlocks?.[person.id] ?? []).some((block) => overlapsHours(localStart.minutes, localEnd.minutes, block))) {
      return null;
    }

    const own = query.busy.filter((block) => block.personId === person.id);
    const hard = own.filter((block) => block.status !== "tentative" &&
      Date.parse(block.start) < endMs + buffer && Date.parse(block.end) > startMs - buffer);
    if (hard.length) {
      if (!query.tolerateBusyFor?.includes(person.id)) return null;
      conflictsWith.push(person.id);
      score -= 40;
      reasons.push(`${person.name} has a conflict`);
    }
    if (own.some((block) => block.status === "tentative" && Date.parse(block.start) < endMs && Date.parse(block.end) > startMs)) {
      score -= 25;
      reasons.push(`${person.name} is tentatively held`);
    }
    const focus = (query.focusBlocks?.[person.id] ?? []).find((block) =>
      (!block.weekdays || block.weekdays.includes(localStart.weekday)) && overlapsHours(localStart.minutes, localEnd.minutes, block));
    if (focus) {
      score -= 20;
      reasons.push(`overlaps ${person.name}'s ${focus.label.toLowerCase()}`);
    }
    const nearby = own.filter((block) => block.status !== "tentative" && (
      Math.abs(Date.parse(block.end) - startMs) <= NEAR_CONFLICT_MINUTES * MINUTE ||
      Math.abs(Date.parse(block.start) - endMs) <= NEAR_CONFLICT_MINUTES * MINUTE));
    if (nearby.length && !hard.length) {
      score -= 6 * nearby.length;
      reasons.push(`back-to-back for ${person.name}`);
    }
  }

  // Earliest first: each day out costs more than any time-of-day preference.
  const daysOut = Math.floor((startMs - Date.parse(query.from)) / (24 * 60 * MINUTE));
  score -= daysOut * 3;
  const hour = Math.floor(zonedClock(start, anchorZone).minutes / 60);
  if (hour >= 10 && hour <= 11) score += 12;
  else if (hour >= 13 && hour <= 15) score += 6;
  else if (hour <= 8 || hour >= 17) score -= 10;

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    score,
    rationale: reasons.length ? capitalize(reasons.join("; ")) : "Everyone is free, inside working hours",
    conflictsWith,
  };
}

function withinConstraints(start: Date, end: Date, constraints?: AvailabilityConstraints): boolean {
  if (!constraints) return true;
  const localStart = zonedClock(start, constraints.timezone);
  const localEnd = zonedClock(end, constraints.timezone);
  if (constraints.days?.length && !constraints.days.includes(localStart.weekday)) return false;
  if (constraints.notBeforeMinutes !== undefined && localStart.minutes < constraints.notBeforeMinutes) return false;
  if (constraints.notAfterMinutes !== undefined && (localEnd.date !== localStart.date || localEnd.minutes > constraints.notAfterMinutes)) return false;
  return true;
}

/**
 * One option per day before a second option on the same day: three slots in
 * one afternoon is not a real choice. Within that, highest score first, and
 * earliest on a tie.
 */
function spreadAcrossDays(candidates: RankedSlot[], zone: string): RankedSlot[] {
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.start.localeCompare(b.start));
  const byDay = new Map<string, RankedSlot>();
  for (const slot of ranked) {
    const day = zonedClock(new Date(slot.start), zone).date;
    if (!byDay.has(day)) byDay.set(day, slot);
  }
  const spread = [...byDay.values()];
  return [...spread, ...ranked.filter((slot) => !spread.includes(slot))];
}

function overlapsHours(startMinutes: number, endMinutes: number, block: HourBlock): boolean {
  return startMinutes < block.endHour * 60 && endMinutes > block.startHour * 60;
}

function ceilToStep(t: number, step: number): number {
  return Math.ceil(t / step) * step;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Wall-clock view of an instant in an IANA zone. */
export function zonedClock(date: Date, timeZone: string): { date: string; weekday: Weekday; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: read("weekday") as Weekday,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

/** The instant a wall-clock time in an IANA zone refers to. Survives DST. */
export function zonedInstant(year: number, month: number, day: number, minutes: number, timeZone: string): Date {
  const desired = Date.UTC(year, month - 1, day, 0, minutes);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const rendered = Date.UTC(read("year"), read("month") - 1, read("day"), read("hour"), read("minute"));
    if (rendered === desired) break;
    candidate += desired - rendered;
  }
  return new Date(candidate);
}
