import type { Person } from "@/core/contracts";
import { readableMessages } from "@/core/access";
import { MockCalendarConnector, MockMailConnector } from "@/core/connectors/mock";
import { listProposals } from "@/core/store";
import { PEOPLE } from "@/data/org";

export type AssistantFacts = { answer: string; source: "emails" | "meetings" | "availability" | "help" };

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
export async function answerFromFacts(actor: Person, question: string, selected?: AssistantFacts["source"] | null): Promise<AssistantFacts> {
  const q = question.toLowerCase();
  if (selected === "availability" || (!selected && /availab|free|busy|calendar|schedule/.test(q))) {
    const target = namedPerson(question, actor);
    const from = new Date();
    const to = new Date(from.getTime() + 5 * 24 * 60 * 60 * 1000);
    const busy = (await new MockCalendarConnector().getSchedule({
      personIds: [target.id], from: from.toISOString(), to: to.toISOString(),
    })).slice(0, 8);
    const blocks = busy.length ? busy.map((block) =>
      `${formatTime(block.start, target.timezone)}–${formatTime(block.end, target.timezone)} (${block.status.replaceAll("_", " ")})`,
    ).join("; ") : "no synthetic busy blocks were recorded";
    return { source: "availability", answer: `${target.name}'s working hours are ${target.workingHours.startHour}:00–${target.workingHours.endHour}:00 (${target.timezone}). Over the next five days: ${blocks}. This is free/busy-only demo data, not a confirmed booking or live Google Calendar.` };
  }
  if (selected === "meetings" || (!selected && /meet|proposal|appointment|invite/.test(q))) {
    const proposals = listProposals().filter((proposal) =>
      proposal.request.requesterId === actor.id || proposal.request.attendeeIds.includes(actor.id),
    ).slice(0, 5);
    return { source: "meetings", answer: proposals.length
      ? `Your synthetic meeting proposals: ${proposals.map((proposal) => `${proposal.request.purpose} (${proposal.status}, ${proposal.slots.length} suggested slots)`).join("; ")}. These are proposals, not confirmed calendar events.`
      : "You have no synthetic meeting proposals in this session. The Schedule page can generate options from free/busy data; it does not read meeting subjects." };
  }
  if (selected === "emails" || (!selected && /email|mail|inbox|message|urgent/.test(q))) {
    const messages = readableMessages(actor, await new MockMailConnector().listMessages("p_ceo")).slice(0, 6);
    return { source: "emails", answer: messages.length
      ? `Your readable synthetic inbox includes: ${messages.map((message) => message.subject).join("; ")}. Open Inbox to assess a message before acting on it.`
      : "No synthetic inbox messages are available to your role. I cannot inspect Gmail or another member's restricted messages." };
  }
  return { source: "help", answer: "I can help with synthetic availability, meeting proposals, and emails you are permitted to read. Try asking ‘When is Priya busy?’, ‘What meetings are pending?’, or ‘What emails need attention?’" };
}
