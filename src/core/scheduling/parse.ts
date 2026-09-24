import type { Person, SchedulingDraft, SchedulingWindow } from "@/core/contracts";
import { PEOPLE } from "@/data/org";
import { type Weekday, zonedClock, zonedInstant } from "@/core/scheduling/availability";

/**
 * Deterministic reading of a scheduling request in plain English.
 *
 * This is the offline path and the safety net under a live model: it runs
 * with no network, so the demo works on a plane, and every name it returns is
 * a directory match, never free text a model invented.
 */

export type ClarifyOption = { label: string; value: string };

export type ParseOutcome =
  | { kind: "not_scheduling" }
  | { kind: "draft"; draft: SchedulingDraft; changes: string[] }
  | { kind: "clarify"; question: string; options: ClarifyOption[] };

type Directory = readonly Person[];

const DAY_WORDS: Record<string, Weekday> = {
  monday: "Mon", mon: "Mon", tuesday: "Tue", tue: "Tue", tues: "Tue", wednesday: "Wed", wed: "Wed",
  thursday: "Thu", thu: "Thu", thur: "Thu", thurs: "Thu", friday: "Fri", fri: "Fri",
};
const DAY_PATTERN = "monday|tuesday|wednesday|thursday|friday|mon|tues?|wed|thur?s?|fri";

/** Titles and roles people say instead of names. Longer phrases win over shorter ones. */
const ROLE_ALIASES: Record<string, string[]> = {
  p_ceo: ["ceo", "chief executive"],
  p_ea: ["my assistant", "my ea", "executive assistant", "ea"],
  p_coo: ["coo", "chief operating officer", "head of operations"],
  p_cfo: ["cfo", "chief financial officer", "head of finance", "finance chief"],
  p_cdio: ["cdio", "cio", "cto", "chief digital officer", "chief information officer", "head of technology", "head of it"],
  p_cmo: ["cmo", "chief marketing officer", "head of marketing"],
  p_gc: ["gc", "general counsel", "legal", "our lawyer", "head of legal"],
  p_vp_stores: ["vp stores", "vp of stores", "vp store operations", "vp of store operations", "head of stores", "stores vp"],
  p_vp_logistics: ["vp logistics", "vp of logistics", "head of logistics", "logistics vp"],
  p_vp_brand: ["vp brand", "vp of brand", "head of brand", "brand vp", "head of social"],
  p_dir_ops: ["director of store operations", "store operations director", "west region director"],
  p_mgr_analytics: ["analytics manager", "logistics analytics"],
  p_auditor: ["auditor", "internal audit", "audit lead"],
};
/** Phrases that name a group, so the executive is asked which person they meant. */
const GROUP_ALIASES: { phrase: string; ids: string[]; label: string }[] = [
  { phrase: "the vp", ids: ["p_vp_stores", "p_vp_logistics", "p_vp_brand"], label: "Which vice president did you mean?" },
  { phrase: "a vp", ids: ["p_vp_stores", "p_vp_logistics", "p_vp_brand"], label: "Which vice president did you mean?" },
  { phrase: "vp", ids: ["p_vp_stores", "p_vp_logistics", "p_vp_brand"], label: "Which vice president did you mean?" },
  { phrase: "finance", ids: ["p_cfo", "p_auditor"], label: "Who from finance should join?" },
  { phrase: "operations", ids: ["p_coo", "p_vp_stores", "p_dir_ops"], label: "Who from operations should join?" },
];
/** A chunk containing any of these is conversation, not a person's name. */
const COMMON_WORDS = new Set([
  "me", "us", "you", "him", "her", "them", "everyone", "everybody", "team", "my", "our", "all", "someone", "anyone",
  "time", "times", "minutes", "minute", "hour", "hours", "please", "thanks", "the", "a", "an", "it", "that", "this",
  "make", "can", "could", "would", "should", "also", "just", "let", "lets", "see", "find", "book", "schedule", "set",
  "up", "get", "want", "need", "like", "some", "any", "more", "other", "options", "slot", "slots", "sync", "call",
  "check", "catch", "early", "late", "later", "soon", "quick", "quickly", "briefly", "day", "days", "week", "weeks",
  "morning", "afternoon", "evening", "lunch", "coffee", "meeting", "instead", "actually", "too", "well", "as", "or",
  "so", "if", "when", "either", "both", "then", "there", "here", "folks", "people", "leadership", "staff", "maya",
]);
/** Surnames that are also everyday words, so they only match as part of a full name. */
const SURNAME_ONLY_IN_FULL = new Set(["field"]);

const WORD_NUMBERS: Record<string, number> = {
  five: 5, ten: 10, fifteen: 15, twenty: 20, "twenty five": 25, "twenty-five": 25, thirty: 30, forty: 40,
  "forty five": 45, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90, "one twenty": 120,
};

const SCHEDULING_CUE = /\b(find|schedule|book|set ?up|arrange|organi[sz]e|grab|get|put|block|line up|plan|need|want|carve out)\b[^.?!]*\b(time|meeting|minutes?|mins?|hours?|call|sync|slot|1:1|one[- ]on[- ]one|check[- ]?in|catch[- ]?up|chat|review|session)\b/i;
const MEET_WITH = /\b(meet(ing)?|sync|call|catch[- ]?up|check[- ]?in|1:1|huddle)\b[^.?!]*\bwith\b/i;
const FREE_TOGETHER = /\bwhen (can|could|are) (i|we)\b[^.?!]*\b(meet|free|available)\b/i;

export function looksLikeScheduling(text: string): boolean {
  return SCHEDULING_CUE.test(text) || MEET_WITH.test(text) || FREE_TOGETHER.test(text) || /\bfind time\b/i.test(text);
}

const FOLLOW_UP_CUE_RE = /\b(make it|change it|instead|what about|how about|anything (on|in|later|earlier|else)|add|include|invite|also|remove|drop|without|exclude|take .+ off|longer|shorter|actually|other (times|options)|more (times|options)|different time|morning|afternoon|later|earlier|buffer)\b|^\s*\d{2,3}\s*(min(ute)?s?)?\s*[.?!]?\s*$/i;

/** Questions about other things, which never revise a scheduling request. */
const OTHER_TOPIC = /\b(emails?|inbox|mail|messages?|calendar|agenda|brief|insights?|summari[sz]e|approvals?|projects?|posts?|notes?|pending)\b|\bon my (calendar|schedule)\b/i;

/** Whether a message revises the scheduling request already on screen. */
export function looksLikeFollowUp(text: string): boolean {
  if (OTHER_TOPIC.test(text)) return false;
  const short = text.trim().split(/\s+/).length <= 6;
  return FOLLOW_UP_CUE_RE.test(text) || Boolean(bareDuration(text)) ||
    (short && (Boolean(parseDuration(text)) || Boolean(parseWindow(text, null))));
}

/** A new request, from scratch. */
export function parseSchedulingRequest(text: string, actor: Person, directory: Directory = PEOPLE): ParseOutcome {
  if (!looksLikeScheduling(text)) return { kind: "not_scheduling" };
  const people = resolvePeople(text, actor, directory);
  const clarify = clarification(text, people);
  if (clarify) return clarify;
  if (people.resolved.length === 0) {
    return {
      kind: "clarify",
      question: "Who should be in the meeting?",
      options: suggestedPeople(actor, directory).map((person) => ({
        label: person.name,
        value: `${text.trim().replace(/[.?!]+$/, "")} with ${person.name}`,
      })),
    };
  }
  const window = parseWindow(text, null) ?? { kind: "next_days", count: 5 };
  const draft: SchedulingDraft = {
    attendeeIds: people.resolved.map((person) => person.id),
    durationMinutes: parseDuration(text) ?? 30,
    window,
    title: parseTitle(text),
    ...parseTimeOfDay(text),
    ...parseBuffer(text),
  };
  return { kind: "draft", draft, changes: [] };
}

/** A revision of the draft already on screen: "make it 45 and add Nina". */
export function reviseSchedulingDraft(text: string, draft: SchedulingDraft, actor: Person, directory: Directory = PEOPLE): ParseOutcome {
  const changes: string[] = [];
  let next: SchedulingDraft = { ...draft, attendeeIds: [...draft.attendeeIds] };

  const duration = parseDuration(text) ?? bareDuration(text);
  if (duration && duration !== draft.durationMinutes) {
    next = { ...next, durationMinutes: duration };
    changes.push(`${duration} minutes`);
  }

  const removal = /\b(remove|drop|without|exclude|take)\b(.+?)(?:\b(off|out)\b|$)/i.exec(text);
  if (removal) {
    const removed = resolvePeople(removal[2], actor, directory, true).resolved.map((person) => person.id);
    if (removed.length) {
      next = { ...next, attendeeIds: next.attendeeIds.filter((id) => !removed.includes(id)) };
      changes.push(`without ${names(removed, directory)}`);
    }
  }

  const addition = /\b(add|include|invite|also|bring in|loop in)\b(.+)$/i.exec(text);
  if (addition) {
    const people = resolvePeople(addition[2], actor, directory, true);
    const clarify = clarification(addition[2], people, (value) => text.replace(addition[2], ` ${value}`));
    if (clarify) return clarify;
    const added = people.resolved.map((person) => person.id).filter((id) => !next.attendeeIds.includes(id));
    if (added.length) {
      next = { ...next, attendeeIds: [...next.attendeeIds, ...added].slice(0, 8) };
      changes.push(`adding ${names(added, directory)}`);
    }
  }

  const window = parseWindow(text, draft.window);
  if (window && JSON.stringify(window) !== JSON.stringify(draft.window)) {
    next = { ...next, window };
    changes.push(describeWindow(window));
  }
  const timeOfDay = parseTimeOfDay(text);
  if (timeOfDay.notBeforeMinutes !== undefined || timeOfDay.notAfterMinutes !== undefined) {
    next = { ...next, notBeforeMinutes: timeOfDay.notBeforeMinutes, notAfterMinutes: timeOfDay.notAfterMinutes };
    changes.push(describeTimeOfDay(timeOfDay));
  }
  const buffer = parseBuffer(text);
  if (buffer.bufferMinutes !== undefined) {
    next = { ...next, bufferMinutes: buffer.bufferMinutes };
    changes.push(`${buffer.bufferMinutes}-minute buffer`);
  }
  const title = parseTitle(text);
  if (title) {
    next = { ...next, title };
    changes.push(`titled “${title}”`);
  }

  if (next.attendeeIds.length === 0) {
    return { kind: "clarify", question: "That leaves nobody in the meeting. Who should join?", options: [] };
  }
  if (changes.length === 0) return { kind: "not_scheduling" };
  return { kind: "draft", draft: next, changes };
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

type PeopleMatch = {
  resolved: Person[];
  ambiguous: { phrase: string; question: string; candidates: Person[] }[];
  unknown: string[];
};

/**
 * Directory matches for the people a message names. `namesOnly` is for a
 * fragment that is only names ("Nina and Sam" after "add").
 */
export function resolvePeople(text: string, actor: Person, directory: Directory = PEOPLE, namesOnly = false): PeopleMatch {
  const internal = directory.filter((person) => person.function !== "external" && person.id !== actor.id);
  let remaining = ` ${text.toLowerCase().replace(/[’']s\b/g, "").replace(/[^a-z0-9:\s-]/g, " ")} `;
  const resolved = new Map<string, Person>();
  const mentionedAt = new Map<string, number>();
  const ambiguous: PeopleMatch["ambiguous"] = [];

  const aliases = internal.flatMap((person) => [
    person.name.toLowerCase(),
    ...(ROLE_ALIASES[person.id] ?? []),
    person.name.split(" ")[0].toLowerCase(),
    person.name.split(" ").slice(-1)[0].toLowerCase(),
  ].filter((alias) => !SURNAME_ONLY_IN_FULL.has(alias)).map((alias) => ({ alias, person })))
    .sort((a, b) => b.alias.length - a.alias.length);

  for (const { alias, person } of aliases) {
    const pattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`);
    if (pattern.test(remaining)) {
      resolved.set(person.id, person);
      mentionedAt.set(person.id, Math.min(mentionedAt.get(person.id) ?? Infinity, remaining.search(pattern)));
      remaining = remaining.replace(new RegExp(`\\b${escapeRegExp(alias)}\\b`, "g"), " ");
    }
  }
  const unknown: string[] = [];
  for (const phrase of nameSlots(remaining, namesOnly)) {
    // "the VP" names a group: ask which person rather than guessing.
    const group = GROUP_ALIASES.find((candidate) => candidate.phrase === phrase || `the ${candidate.phrase}` === phrase || `someone from ${candidate.phrase}` === phrase);
    if (group) {
      const candidates = group.ids.map((id) => internal.find((person) => person.id === id)).filter((person): person is Person => Boolean(person));
      ambiguous.push({ phrase, question: group.label, candidates });
      continue;
    }
    if (phrase.split(" ").some((word) => COMMON_WORDS.has(word))) continue;
    const close = closeMatches(phrase, internal);
    if (close.length === 1) resolved.set(close[0].id, close[0]);
    else if (close.length > 1) ambiguous.push({ phrase, question: `Did you mean ${close.map((person) => person.name.split(" ")[0]).join(" or ")}?`, candidates: close });
    else unknown.push(phrase);
  }
  // Keep the order the executive said the names in.
  const ordered = [...resolved.values()].sort((a, b) => (mentionedAt.get(a.id) ?? Infinity) - (mentionedAt.get(b.id) ?? Infinity));
  return { resolved: ordered, ambiguous, unknown };
}

/** Words sitting where a name would be: after "with" or "add", split on "and" and commas. */
function nameSlots(text: string, namesOnly: boolean): string[] {
  const match = namesOnly ? [text, text] : /\b(?:with|add|invite|include|including)\b(.*)$/.exec(text);
  if (!match) return [];
  const segment = match[1].split(/\b(?:for|about|to|on|next|this|tomorrow|today|before|after|in|at|by|regarding|re|sometime|around|during|whenever|instead|please|early|late|later|soon|asap|if|so|when)\b|\d/)[0];
  return segment.split(/,|\band\b|&|\+/)
    .map((chunk) => chunk.trim().replace(/\s+/g, " "))
    .filter((chunk) => chunk.length >= 2 && chunk.split(" ").length <= 3 && /^[a-z\s-]+$/.test(chunk));
}

/** Tolerates one typo, which is also what voice recognition tends to produce ("Pria"). */
function closeMatches(phrase: string, people: readonly Person[]): Person[] {
  const words = phrase.split(" ");
  return people.filter((person) => {
    const [first, ...rest] = person.name.toLowerCase().split(" ");
    const last = rest[rest.length - 1] ?? "";
    return words.some((word) => word.length >= 3 &&
      (distance(word, first) <= (first.length >= 6 ? 2 : 1) || (last && distance(word, last) <= (last.length >= 6 ? 2 : 1))));
  });
}

function clarification(text: string, people: PeopleMatch, rewrite: (value: string) => string = (value) => value): ParseOutcome | null {
  const lower = text;
  const firstAmbiguous = people.ambiguous[0];
  if (firstAmbiguous) {
    return {
      kind: "clarify",
      question: firstAmbiguous.question,
      options: firstAmbiguous.candidates.map((person) => ({
        label: `${person.name}, ${shortTitle(person.title)}`,
        value: rewrite(replacePhrase(lower, firstAmbiguous.phrase, person.name)).replace(/\s{2,}/g, " ").trim(),
      })),
    };
  }
  const firstUnknown = people.unknown[0];
  if (firstUnknown) {
    const rest = replacePhrase(lower, firstUnknown, "").replace(/\s+(and|,)\s*(?=(and|,|for|next|this|$))/gi, " ").replace(/\s{2,}/g, " ").trim();
    return {
      kind: "clarify",
      question: `I could not find “${titleCase(firstUnknown)}” in the ${"PacSun"} directory. Who did you mean?`,
      options: people.resolved.length ? [{ label: `Continue without ${titleCase(firstUnknown)}`, value: rewrite(rest) }] : [],
    };
  }
  return null;
}

function suggestedPeople(actor: Person, directory: Directory): Person[] {
  return directory.filter((person) => person.managerId === actor.id && person.id !== actor.assistantId).slice(0, 4);
}

/* ------------------------------------------------------------------ */
/* Duration, window, time of day, title                               */
/* ------------------------------------------------------------------ */

export function parseDuration(text: string): number | null {
  // "a 10 minute buffer" is spacing, not the length of the meeting.
  const lower = text.toLowerCase().replace(/\b\d{1,2}\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?buffer\b|\bbuffer of \d{1,2}\s*(?:minutes?|mins?)?/g, " ");
  if (/\b(an? )?hour and a half\b|\b1\.5 ?(hours?|hrs?)\b|\bninety minutes\b/.test(lower)) return 90;
  if (/\bhalf(?: an)? hour\b|\bhalf-hour\b/.test(lower)) return 30;
  if (/\bquarter(?: of an)? hour\b/.test(lower)) return 15;
  const hours = /\b(\d+(?:\.\d+)?)\s*-?\s*(?:hours?|hrs?)\b/.exec(lower);
  if (hours) return clampDuration(Math.round(Number(hours[1]) * 60));
  if (/\b(an|one) hour\b|\bhour-long\b/.test(lower)) return 60;
  if (/\btwo hours\b/.test(lower)) return 120;
  const minutes = /\b(\d{1,3})\s*-?\s*(?:minutes?|mins?|m)\b/.exec(lower);
  if (minutes) return clampDuration(Number(minutes[1]));
  for (const [word, value] of Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${word}\\s*-?\\s*(minutes?|mins?|minute)\\b`).test(lower)) return clampDuration(value);
  }
  return null;
}

/** "make it 45", "45 instead", or just "45". */
function bareDuration(text: string): number | null {
  const match = /\b(?:make it|change it to|how about|try)\s+(\d{2,3})\b(?!\s*(?:am|pm|:))|^\s*(\d{2,3})\s*(?:instead)?\s*[.?!]?\s*$/i.exec(text);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value >= 15 && value <= 240 ? clampDuration(value) : null;
}

function clampDuration(value: number): number {
  return Math.min(240, Math.max(15, Math.round(value / 5) * 5));
}

export function parseWindow(text: string, current: SchedulingWindow | null): SchedulingWindow | null {
  const lower = text.toLowerCase();
  const before = new RegExp(`\\b(?:before|by|no later than)\\s+(today|tomorrow|${DAY_PATTERN})\\w*(?:\\s+at)?\\s*(\\d{1,2})?(?::(\\d{2}))?\\s*(am|pm|noon)?`).exec(lower);
  if (before) {
    const day = before[1] === "today" || before[1] === "tomorrow" ? before[1] : DAY_WORDS[before[1]] ?? DAY_WORDS[before[1].slice(0, 3)];
    const minutes = before[2] ? toMinutes(Number(before[2]), Number(before[3] ?? 0), before[4]) : before[4] === "noon" ? 720 : 0;
    if (day) return { kind: "before", day: day as Weekday | "today" | "tomorrow", minutes };
  }
  const nextDays = /\b(?:next|coming)\s+(\d+|two|three|four|five|few)\s+(?:business\s+|working\s+)?days\b/.exec(lower);
  if (nextDays) {
    const count = { two: 2, three: 3, four: 4, five: 5, few: 3 }[nextDays[1]] ?? Number(nextDays[1]);
    return { kind: "next_days", count: Math.min(20, Math.max(1, count)) };
  }
  if (/\bnext two weeks\b|\bnext couple of weeks\b|\bcoming weeks\b/.test(lower)) return { kind: "next_days", count: 10 };
  if (/\bearly next week\b/.test(lower)) return { kind: "days", days: ["Mon", "Tue"], week: "next" };
  if (/\blate next week\b|\bend of next week\b/.test(lower)) return { kind: "days", days: ["Thu", "Fri"], week: "next" };
  if (/\bend of (the|this) week\b|\blater this week\b/.test(lower)) return { kind: "days", days: ["Thu", "Fri"], week: "this" };

  const days = [...lower.matchAll(new RegExp(`\\b(next |this )?(${DAY_PATTERN})\\b`, "g"))];
  if (days.length) {
    const unique = [...new Set(days.map((match) => DAY_WORDS[match[2]] ?? DAY_WORDS[match[2].slice(0, 3)]).filter(Boolean))];
    const explicit = days.find((match) => match[1])?.[1]?.trim();
    // A day named in a follow-up stays inside the week already being discussed.
    const inherited = current?.kind === "next_week" || (current?.kind === "days" && current.week === "next") ? "next" : "nearest";
    const week = explicit === "next" ? "next" : explicit === "this" ? "this" : /\bnext week\b/.test(lower) ? "next" : inherited;
    return { kind: "days", days: unique.slice(0, 5), week };
  }
  if (/\bnext week\b/.test(lower)) return { kind: "next_week" };
  if (/\bthis week\b/.test(lower)) return { kind: "this_week" };
  if (/\btomorrow\b/.test(lower)) return { kind: "tomorrow" };
  if (/\btoday\b|\bthis (morning|afternoon)\b/.test(lower)) return { kind: "today" };
  return null;
}

function parseTimeOfDay(text: string): { notBeforeMinutes?: number; notAfterMinutes?: number } {
  const lower = text.toLowerCase();
  const range: { notBeforeMinutes?: number; notAfterMinutes?: number } = {};
  if (/\bmornings?\b/.test(lower)) range.notAfterMinutes = 12 * 60;
  if (/\bafternoons?\b/.test(lower)) range.notBeforeMinutes = 12 * 60;
  const after = /\b(?:after|not before|from)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|noon)?\b/.exec(lower);
  if (after) range.notBeforeMinutes = toMinutes(Number(after[1]), Number(after[2] ?? 0), after[3]);
  const beforeTime = new RegExp(`\\b(?:before|by)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)\\b`).exec(lower);
  if (beforeTime && !new RegExp(`\\b(?:before|by)\\s+(today|tomorrow|${DAY_PATTERN})`).test(lower)) {
    range.notAfterMinutes = toMinutes(Number(beforeTime[1]), Number(beforeTime[2] ?? 0), beforeTime[3]);
  }
  return range;
}

function parseBuffer(text: string): { bufferMinutes?: number } {
  const match = /\b(\d{1,2})\s*-?\s*(?:minutes?|mins?)\s+(?:of\s+)?buffer\b|\bbuffer of (\d{1,2})\b/i.exec(text);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value > 0 ? { bufferMinutes: Math.min(60, value) } : {};
}

export function parseTitle(text: string): string | null {
  const match = /(?<!\b(?:what|how) )\b(?:about|to discuss|regarding|re:|to review|to go over|on the topic of|titled|called|call it)\s+(.+?)\s*(?:\b(?:next week|this week|tomorrow|today|before|after|on (?:mon|tue|wed|thu|fri)\w*)\b.*)?[.?!]*$/i.exec(text);
  if (!match) return null;
  const title = match[1].replace(/^(the|our)\s+/i, "").trim();
  if (title.length < 3 || /^\d/.test(title) || parseDuration(title)) return null;
  return (title.charAt(0).toUpperCase() + title.slice(1)).slice(0, 120);
}

function toMinutes(hour: number, minute: number, meridiem?: string): number {
  let h = hour % 24;
  if (meridiem === "noon") return 720;
  if (meridiem === "pm" && h < 12) h += 12;
  if (meridiem === "am" && h === 12) h = 0;
  // No am/pm: business hours read naturally ("after 2" means 2 PM).
  if (!meridiem && h >= 1 && h <= 7) h += 12;
  return Math.min(1440, h * 60 + minute);
}

/* ------------------------------------------------------------------ */
/* From words to dates                                                 */
/* ------------------------------------------------------------------ */

export type ResolvedWindow = { from: string; to: string; days?: Weekday[] };

/** Turns "next week" into instants in the executive's own timezone. Never starts in the past. */
export function resolveWindow(window: SchedulingWindow, now: Date, timezone: string): ResolvedWindow {
  const today = zonedClock(now, timezone);
  const [year, month, day] = today.date.split("-").map(Number);
  const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(today.weekday);
  const at = (offsetDays: number, minutes = 0) => {
    const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
    return zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), minutes, timezone);
  };
  const earliest = new Date(now.getTime() + 30 * 60_000);
  const clampFrom = (from: Date) => (from < earliest ? earliest : from);
  const untilNextMonday = ((8 - dayIndex) % 7) || 7;
  const offsetFor = (weekday: Weekday, week: "this" | "next" | "nearest") => {
    const target = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
    if (week === "next") return untilNextMonday + (target - 1);
    const ahead = (target - dayIndex + 7) % 7;
    return ahead;
  };

  switch (window.kind) {
    case "today":
      return { from: clampFrom(at(0)).toISOString(), to: at(1).toISOString() };
    case "tomorrow":
      return { from: at(1).toISOString(), to: at(2).toISOString() };
    case "this_week": {
      if (dayIndex === 6 || dayIndex === 0) return resolveWindow({ kind: "next_week" }, now, timezone);
      return { from: clampFrom(at(0)).toISOString(), to: at(6 - dayIndex).toISOString() };
    }
    case "next_week":
      return { from: at(untilNextMonday).toISOString(), to: at(untilNextMonday + 5).toISOString() };
    case "next_days": {
      let added = 0;
      let offset = 0;
      while (added < window.count) {
        offset += 1;
        const weekday = (dayIndex + offset) % 7;
        if (weekday !== 0 && weekday !== 6) added += 1;
      }
      return { from: clampFrom(at(0)).toISOString(), to: at(offset + 1).toISOString() };
    }
    case "days": {
      const offsets = window.days.map((weekday) => offsetFor(weekday, window.week)).sort((a, b) => a - b);
      return {
        from: clampFrom(at(offsets[0])).toISOString(),
        to: at(offsets[offsets.length - 1] + 1).toISOString(),
        days: [...window.days],
      };
    }
    case "before": {
      const offset = window.day === "today" ? 0 : window.day === "tomorrow" ? 1 : offsetFor(window.day, "nearest");
      const deadline = at(offset, window.minutes || 24 * 60);
      return { from: clampFrom(at(0)).toISOString(), to: deadline.toISOString() };
    }
  }
}

export function describeWindow(window: SchedulingWindow): string {
  const longDay: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  switch (window.kind) {
    case "today": return "today";
    case "tomorrow": return "tomorrow";
    case "this_week": return "this week";
    case "next_week": return "next week";
    case "next_days": return `the next ${window.count} business days`;
    case "days": {
      const list = window.days.map((day) => longDay[day]);
      const joined = list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}` : list[0];
      return window.week === "next" ? `${joined} next week` : window.week === "this" ? `${joined} this week` : joined;
    }
    case "before": {
      const day = window.day === "today" || window.day === "tomorrow" ? window.day : longDay[window.day];
      return window.minutes ? `before ${day} ${formatClock(window.minutes)}` : `before ${day}`;
    }
  }
}

function describeTimeOfDay(range: { notBeforeMinutes?: number; notAfterMinutes?: number }): string {
  if (range.notBeforeMinutes !== undefined && range.notAfterMinutes !== undefined) return `between ${formatClock(range.notBeforeMinutes)} and ${formatClock(range.notAfterMinutes)}`;
  if (range.notBeforeMinutes !== undefined) return range.notBeforeMinutes === 720 ? "in the afternoon" : `after ${formatClock(range.notBeforeMinutes)}`;
  return range.notAfterMinutes === 720 ? "in the morning" : `ending by ${formatClock(range.notAfterMinutes ?? 0)}`;
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${suffix}`;
}

/* ------------------------------------------------------------------ */

function names(ids: string[], directory: Directory): string {
  const list = ids.map((id) => directory.find((person) => person.id === id)?.name.split(" ")[0] ?? id);
  return list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0];
}

function shortTitle(title: string): string {
  return title.replace("Vice President, ", "VP ").replace("Chief ", "Chief ");
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function replacePhrase(text: string, phrase: string, replacement: string): string {
  return text.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i"), replacement);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}
