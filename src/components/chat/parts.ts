import type { ChatPart } from "@/core/contracts";

/**
 * Pure helpers behind the message-part renderer. Kept out of the .tsx files
 * so they can be unit-tested with node --test, which does not compile JSX.
 */

type SlotPart = Extract<ChatPart, { type: "slots" }>;

export function slotDay(start: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(start));
}

export function slotTime(start: string, end: string, timezone: string): string {
  const format = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  return `${format(start)} – ${format(end)}`;
}

const ZONE_ABBREVIATION: Record<string, string> = {
  "America/Los_Angeles": "PT", "America/Denver": "MT", "America/Chicago": "CT", "America/New_York": "ET",
};

/** "8:00 AM ET for Priya" for every attendee whose clock differs from the organizer's. */
export function otherZoneTimes(start: string, attendees: SlotPart["attendees"], organizerTimezone: string): string[] {
  const byZone = new Map<string, string[]>();
  for (const person of attendees) {
    if (person.timezone === organizerTimezone) continue;
    byZone.set(person.timezone, [...(byZone.get(person.timezone) ?? []), person.name.split(" ")[0]]);
  }
  return [...byZone.entries()].map(([zone, names]) => {
    const time = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(start));
    return `${time} ${ZONE_ABBREVIATION[zone] ?? zone} for ${names.join(" and ")}`;
  });
}

export function visibleSlots(part: SlotPart, expanded: boolean): SlotPart["slots"] {
  return expanded ? part.slots : part.slots.slice(0, part.initiallyVisible);
}

/** Plain text for a part: used for read-aloud and for the thread's accessible summary. */
export function partToText(part: ChatPart): string {
  switch (part.type) {
    case "text": return part.text;
    case "items": return part.items.map((item) => `${item.label}. ${item.detail}`).join(" ");
    case "slots": return `${part.slots.length} available times for ${part.title}.`;
    case "no_slots": return `${part.message} ${part.alternatives.map((alternative) => alternative.label).join(", ")}.`;
    case "clarify": return `${part.question} ${part.options.map((option) => option.label).join(", ")}.`;
    case "actions": return "";
    case "email_card": return `${part.email.from}: ${part.email.subject}. ${part.email.summary}`;
    case "event_confirmation": return `Booked ${part.title}.`;
    case "project_card": return `${part.project.name}. ${part.openItems.length} open items.`;
    case "link": return "";
  }
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export const SUGGESTIONS = [
  { title: "Find time with Ray and Priya", detail: "30 minutes next week", prompt: "Find 30 minutes next week with Ray and Priya" },
  { title: "What emails need my attention?", detail: "The few that need you", prompt: "What emails need my attention?" },
  { title: "What's on my calendar tomorrow?", detail: "Meetings and busy time", prompt: "What's on my calendar tomorrow?" },
  { title: "Summarize today's business brief", detail: "From approved sources", prompt: "Summarize today's business brief" },
] as const;
