import type { AssistantResponse, AssistantSource, Person } from "@/core/contracts";
import { readableMessages } from "@/core/access";
import { connectors } from "@/core/connectors/resolve";
import { listProposals } from "@/core/store";
import { PEOPLE } from "@/data/org";

export type AssistantFacts = AssistantResponse;

function namedPerson(question: string, actor: Person): Person {
  const lower = question.toLowerCase();
  return PEOPLE.find((person) => person.function !== "external" && lower.includes(person.name.toLowerCase())) ?? actor;
}

function formatTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

/** Generates a bounded, permission-filtered answer before any optional model call. */
export async function answerFromFacts(actor: Person, question: string, selected?: AssistantSource | null): Promise<AssistantFacts> {
  const q = question.toLowerCase();
  if (selected === "availability" || (!selected && /availab|free|busy|calendar|schedule/.test(q))) {
    const target = namedPerson(question, actor);
    const from = new Date();
    const to = new Date(from.getTime() + 5 * 24 * 60 * 60 * 1000);
    const busy = (await connectors().calendar.getSchedule({
      personIds: [target.id], from: from.toISOString(), to: to.toISOString(),
    })).slice(0, 8);
    const blocks = busy.length ? busy.map((block) =>
      `${formatTime(block.start, target.timezone)}–${formatTime(block.end, target.timezone)} (${block.status.replaceAll("_", " ")})`,
    ).join("; ") : "no synthetic busy blocks were recorded";
    return {
      source: "availability",
      answer: `${target.name}'s working hours are ${target.workingHours.startHour}:00–${target.workingHours.endHour}:00 (${target.timezone}). Over the next five days: ${blocks}. This is free/busy-only demo data, not a confirmed booking or live Google Calendar.`,
      summary: busy.length
        ? `${target.name} has ${busy.length} synthetic busy block${busy.length === 1 ? "" : "s"} over the next five days.`
        : `${target.name} has no synthetic busy blocks recorded over the next five days.`,
      items: busy.map((block) => ({
        label: `${formatTime(block.start, target.timezone)}–${formatTime(block.end, target.timezone)}`,
        detail: `${target.name} · ${target.timezone}`,
        status: block.status,
      })),
      deepLink: { href: "/schedule", label: "Open schedule" },
      suggestions: ["What meetings are pending?", "When is my next busy block?"],
    };
  }
  if (selected === "meetings" || (!selected && /meet|proposal|appointment|invite/.test(q))) {
    const proposals = listProposals().filter((proposal) =>
      proposal.request.requesterId === actor.id || proposal.request.attendeeIds.includes(actor.id),
    ).slice(0, 5);
    return {
      source: "meetings",
      answer: proposals.length
        ? `Your synthetic meeting proposals: ${proposals.map((proposal) => `${proposal.request.purpose} (${proposal.status}, ${proposal.slots.length} suggested slots)`).join("; ")}. These are proposals, not confirmed calendar events.`
        : "You have no synthetic meeting proposals in this session. The Schedule page can generate options from free/busy data; it does not read meeting subjects.",
      summary: proposals.length
        ? `${proposals.length} synthetic meeting proposal${proposals.length === 1 ? " is" : "s are"} visible to you.`
        : "You have no synthetic meeting proposals in this session.",
      items: proposals.map((proposal) => ({
        label: proposal.request.purpose,
        detail: `${proposal.slots.length} suggested slot${proposal.slots.length === 1 ? "" : "s"} · not a confirmed event`,
        status: proposal.status,
      })),
      deepLink: { href: "/schedule", label: "Open schedule" },
      suggestions: ["When is Priya Raman busy?", "What emails need attention?"],
    };
  }
  if (selected === "emails" || (!selected && /email|mail|inbox|message|urgent/.test(q))) {
    // Start at the mailbox boundary, then apply the central access gate before
    // deriving labels or counts. A recipient in someone else's fixture is not
    // equivalent to ownership of that person's inbox.
    const messages = readableMessages(actor, await connectors().mail.listMessages(actor.id)).slice(0, 6);
    return {
      source: "emails",
      answer: messages.length
        ? `Your readable synthetic inbox includes: ${messages.map((message) => message.subject).join("; ")}. Open Inbox to assess a message before acting on it.`
        : "No synthetic inbox messages are available to your role. I cannot inspect Gmail or another member's restricted messages.",
      summary: messages.length
        ? `${messages.length} permission-filtered synthetic message${messages.length === 1 ? " is" : "s are"} ready to review.`
        : "No synthetic inbox messages are available to your role.",
      items: messages.map((message) => ({
        label: message.subject,
        detail: message.external ? "External synthetic message" : "Internal synthetic message",
        status: "info",
      })),
      deepLink: { href: "/inbox", label: "Open inbox" },
      suggestions: ["What meetings are pending?", "When is Priya Raman busy?"],
    };
  }
  return {
    source: "help",
    answer: "I can help with synthetic availability, meeting proposals, and emails you are permitted to read. Try asking ‘When is Priya busy?’, ‘What meetings are pending?’, or ‘What emails need attention?’",
    summary: "I can answer questions from permitted synthetic inbox, proposal, and free/busy records.",
    items: [],
    deepLink: null,
    suggestions: ["What emails need attention?", "What meetings are pending?", "When is Priya Raman busy?"],
  };
}
