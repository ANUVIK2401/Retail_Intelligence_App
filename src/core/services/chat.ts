import { answerFromFacts } from "@/core/assistant/facts";
import { classifyQuestion, extractSchedulingFields } from "@/core/assistant/model";
import { connectors } from "@/core/connectors/resolve";
import {
  MeetingRequestSchema,
  RISK_ORDER,
  type AssistantDeepLink,
  type AssistantItem,
  type ChatContext,
  type ChatPart,
  type Person,
  type SchedulingDraft,
} from "@/core/contracts";
import { findSlots, suggestAlternatives } from "@/core/scheduling/availability";
import {
  describeWindow,
  looksLikeFollowUp,
  looksLikeScheduling,
  parseDuration,
  parseSchedulingRequest,
  parseTitle,
  parseWindow,
  resolveWindow,
  reviseSchedulingDraft,
  type ParseOutcome,
} from "@/core/scheduling/parse";
import { listVisibleCalendarEvents } from "@/core/services/calendar-management";
import { visibleInsights } from "@/core/services/insights";
import { projectDetail, projectMentioned } from "@/core/services/projects";
import { formatSlot, proposeMeeting } from "@/core/services/scheduling";
import { fullReplyDraft, quickReplies, triageRows } from "@/core/services/triage";
import { emailById } from "@/data/emails";
import { FOCUS_BLOCKS, PROTECTED_BLOCKS } from "@/data/calendar";
import { INSIGHTS } from "@/data/knowledge";
import { personById } from "@/data/org";

/**
 * The conversation behind the center chat.
 *
 * It reads, proposes, and explains. It never books or sends: those happen
 * only when the executive presses Book or Send, through their own routes,
 * where policy and the approval id are checked again.
 */

export type ChatReply = {
  parts: ChatPart[];
  context: ChatContext | null;
  source: string;
  model: string;
  /** Plain-text version of the reply, for older clients and read-aloud. */
  summary: string;
  answer: string;
  items: AssistantItem[];
  deepLink: AssistantDeepLink | null;
  suggestions: string[];
};

type Options = {
  now?: Date;
  env?: Readonly<Record<string, string | undefined>>;
  fetch?: typeof fetch;
};

const calendar = connectors().calendar;
/** Options kept on the proposal so "Show more times" needs no second search. */
const SLOTS_KEPT = 8;
const SLOTS_SHOWN = 4;
const MORE_TIMES = /\b(other|more|different) (times|options|slots)\b|\banything else\b/i;
const TEAM_WORDS = /\b(team|group|everyone|members|folks|people|crew|check[- ]?in)\b/i;

export async function respond(actor: Person, question: string, context: ChatContext | null, options: Options = {}): Promise<ChatReply> {
  const now = options.now ?? new Date();
  const draft = context?.scheduling;

  if (draft && looksLikeFollowUp(question) && !/\bwith\b/i.test(question)) {
    if (MORE_TIMES.test(question)) return runScheduling(actor, draft, [], now, "mock-grounded", SLOTS_SHOWN);
    const revised = reviseSchedulingDraft(question, draft, actor);
    if (revised.kind !== "not_scheduling") return fromOutcome(actor, revised, now, "mock-grounded", context);
  }

  const project = projectMentioned(actor, question);

  if (looksLikeScheduling(question)) {
    if (project && (TEAM_WORDS.test(question) || !/\bwith\b/i.test(question))) {
      const projectDraft: SchedulingDraft = {
        attendeeIds: project.memberIds.filter((id) => id !== actor.id).slice(0, 8),
        durationMinutes: parseDuration(question) ?? 30,
        window: parseWindow(question, null) ?? { kind: "next_days", count: 5 },
        title: parseTitle(question) ?? `${project.name} check-in`,
        projectId: project.id,
      };
      return runScheduling(actor, projectDraft, [], now, "mock-grounded");
    }
    const { outcome, model } = await parseWithOptionalModel(actor, question, options);
    if (outcome.kind !== "not_scheduling") return fromOutcome(actor, outcome, now, model, context);
  }

  if (project && /\b(pending|status|open|going on|update|where are we|what'?s new|summari[sz]e|progress|next steps?)\b/i.test(question)) {
    return projectAnswer(actor, project.id, now);
  }
  if (/\b(emails?|inbox|mail|messages?)\b/i.test(question) && !/\bpending\b/i.test(question)) {
    return emailAnswer(actor, now);
  }
  if (/\bon my (calendar|schedule)\b|\bmy (calendar|schedule|agenda|day)\b|\b(calendar|agenda|meetings?) (for |on )?(today|tomorrow)\b/i.test(question)) {
    return calendarAnswer(actor, question, now);
  }
  if (/\b(brief|briefing|insights?|business (update|summary)|how('s| is) the business)\b/i.test(question)) {
    return briefAnswer(actor);
  }

  const intent = await classifyQuestion(question, options);
  const facts = await answerFromFacts(actor, question, intent.source);
  return {
    ...facts,
    model: intent.model,
    context: context ?? null,
    parts: [
      { type: "text", text: facts.summary },
      ...(facts.items.length ? [{ type: "items" as const, items: facts.items }] : []),
      ...(facts.deepLink ? [{ type: "link" as const, ...facts.deepLink }] : []),
      ...(facts.source === "help" ? [{ type: "actions" as const, actions: STARTER_ACTIONS }] : []),
    ],
  };
}

export const STARTER_ACTIONS = [
  { label: "Find time with Ray and Priya", prompt: "Find 30 minutes next week with Ray and Priya" },
  { label: "What needs my attention?", prompt: "What emails need my attention?" },
  { label: "My calendar tomorrow", prompt: "What's on my calendar tomorrow?" },
  { label: "Today's business brief", prompt: "Summarize today's business brief" },
];

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

async function parseWithOptionalModel(actor: Person, question: string, options: Options): Promise<{ outcome: ParseOutcome; model: string }> {
  const extracted = await extractSchedulingFields(question, options);
  if (extracted.fields && extracted.fields.people.length) {
    const { people, durationMinutes, when, topic } = extracted.fields;
    // The model's fields are rewritten into a plain request and read by the
    // same deterministic parser, so only directory matches survive.
    const canonical = `Find ${durationMinutes ? `${durationMinutes} minutes` : "time"} ${when ?? ""} with ${people.join(" and ")}${topic ? ` about ${topic}` : ""}`;
    const outcome = parseSchedulingRequest(canonical, actor);
    if (outcome.kind !== "not_scheduling") return { outcome, model: extracted.model };
  }
  return { outcome: parseSchedulingRequest(question, actor), model: extracted.model };
}

async function fromOutcome(actor: Person, outcome: ParseOutcome, now: Date, model: string, context: ChatContext | null): Promise<ChatReply> {
  if (outcome.kind === "clarify") {
    return reply({
      parts: [
        { type: "text", text: outcome.question },
        ...(outcome.options.length ? [{ type: "clarify" as const, question: outcome.question, options: outcome.options.map((option) => ({ label: option.label, prompt: option.value })) }] : []),
      ],
      context,
      source: "scheduling",
      model,
    });
  }
  if (outcome.kind === "draft") return runScheduling(actor, outcome.draft, outcome.changes, now, model);
  return reply({ parts: [{ type: "text", text: "I did not catch a meeting request there." }], context, source: "scheduling", model });
}

export async function runScheduling(actor: Person, draft: SchedulingDraft, changes: string[], now: Date, model: string, offset = 0): Promise<ChatReply> {
  const attendees = draft.attendeeIds
    .map((id) => personById(id))
    .filter((person): person is Person => Boolean(person) && person!.function !== "external" && person!.id !== actor.id);
  if (!attendees.length) {
    return reply({ parts: [{ type: "text", text: "Who should be in the meeting?" }], context: null, source: "scheduling", model });
  }
  const cleanDraft: SchedulingDraft = { ...draft, attendeeIds: attendees.map((person) => person.id) };
  const range = resolveWindow(draft.window, now, actor.timezone);
  const windowLabel = describeWindow(draft.window);
  const title = draft.title ?? `Meeting with ${firstNames(attendees)}`;
  const constraints = {
    ...(range.days ? { days: range.days } : {}),
    ...(draft.notBeforeMinutes !== undefined ? { notBeforeMinutes: draft.notBeforeMinutes } : {}),
    ...(draft.notAfterMinutes !== undefined ? { notAfterMinutes: draft.notAfterMinutes } : {}),
    ...(draft.bufferMinutes !== undefined ? { bufferMinutes: draft.bufferMinutes } : {}),
  };
  const request = MeetingRequestSchema.safeParse({
    requesterId: actor.id,
    attendeeIds: [actor.id, ...cleanDraft.attendeeIds],
    purpose: title.length >= 3 ? title : `Meeting: ${title}`,
    durationMinutes: draft.durationMinutes,
    sensitivity: "normal",
    earliest: range.from,
    latest: range.to,
    ...(Object.keys(constraints).length ? { constraints } : {}),
  });
  if (!request.success) {
    return reply({
      parts: [
        { type: "text", text: `There is not enough time left ${windowLabel} for a ${draft.durationMinutes}-minute meeting. Want me to look further ahead?` },
        { type: "actions", actions: [{ label: "Look at next week", prompt: "What about next week?" }] },
      ],
      context: { scheduling: cleanDraft }, source: "scheduling", model,
    });
  }

  const { proposal, approval } = await proposeMeeting({ actorId: actor.id, request: request.data, slotLimit: SLOTS_KEPT });
  const everyone = `you, ${listNames(attendees.map((person) => person.name))}`;
  const lead = changes.length ? `Updated: ${changes.join(", ")}. ` : "";

  if (proposal.slots.length === 0) {
    return noSlotsReply(actor, attendees, cleanDraft, request.data.earliest, request.data.latest, constraints, windowLabel, lead, model);
  }

  const visible = proposal.slots.slice(offset);
  const count = Math.min(visible.length, SLOTS_SHOWN);
  const text = `${lead}${count === 1 ? "Here is the one time" : `Here are ${count} times`} ${windowLabel} when ${everyone} are all free for ${draft.durationMinutes} minutes. Pick one to review before booking.`;
  const durations = [15, 30, 45, 60].filter((minutes) => minutes !== draft.durationMinutes);
  return reply({
    parts: [
      { type: "text", text },
      {
        type: "slots",
        proposalId: proposal.id,
        approvalId: approval?.id ?? null,
        title,
        durationMinutes: draft.durationMinutes,
        timezone: actor.timezone,
        windowLabel,
        attendees: [actor, ...attendees].map(({ id, name, title: jobTitle, timezone }) => ({ id, name, title: jobTitle, timezone })),
        slots: proposal.slots.map((slot, index) => ({ index, start: slot.start, end: slot.end, rationale: slot.rationale })).slice(offset),
        initiallyVisible: SLOTS_SHOWN,
        policyNote: proposal.decision.outcome === "allow" ? null : proposal.decision.reason,
        projectId: draft.projectId ?? null,
      },
      { type: "actions", actions: durations.map((minutes) => ({ label: `${minutes} min`, prompt: `Make it ${minutes} minutes` })) },
    ],
    context: { scheduling: cleanDraft },
    source: "scheduling",
    model,
    items: visible.slice(0, SLOTS_SHOWN).map((slot) => ({ label: formatSlot(slot, actor.timezone), detail: slot.rationale, status: "free" })),
  });
}

async function noSlotsReply(
  actor: Person, attendees: Person[], draft: SchedulingDraft, from: string, to: string,
  constraints: Record<string, unknown>, windowLabel: string, lead: string, model: string,
): Promise<ChatReply> {
  const participants = [actor, ...attendees];
  const busy = await calendar.getSchedule({ personIds: participants.map((person) => person.id), from, to });
  const query = {
    participants, busy, durationMinutes: draft.durationMinutes, from, to,
    constraints: { timezone: actor.timezone, ...constraints },
    protectedBlocks: PROTECTED_BLOCKS, focusBlocks: FOCUS_BLOCKS,
  };
  const alternatives = suggestAlternatives(query).map((alternative) => {
    if (alternative.kind === "shorter") {
      return {
        label: `Make it ${alternative.durationMinutes} minutes`,
        prompt: `Make it ${alternative.durationMinutes} minutes`,
        detail: `${alternative.slots.length > 1 ? "Times open" : "A time opens"}, first ${formatSlot(alternative.slots[0], actor.timezone)}`,
      };
    }
    const person = personById(alternative.personId);
    const first = person?.name.split(" ")[0] ?? "them";
    return {
      label: `Without ${first}`,
      prompt: `Remove ${first}`,
      detail: `${formatSlot(alternative.slot, actor.timezone)} works for everyone except ${person?.name ?? "one person"}, who has a conflict`,
    };
  });
  // Sanity check that looking further ahead can help before offering it.
  const later = findSlots({ ...query, to: new Date(Date.parse(to) + 7 * 86_400_000).toISOString(), limit: 1 });
  if (later.length) alternatives.push({ label: "Look further ahead", prompt: "What about the next two weeks?", detail: `First opening ${formatSlot(later[0], actor.timezone)}` });
  return reply({
    parts: [
      { type: "text", text: `${lead}No time ${windowLabel} works for you and ${listNames(attendees.map((person) => person.name))} for ${draft.durationMinutes} minutes inside everyone's working hours.` },
      { type: "no_slots", message: "Here is what would work instead:", alternatives },
    ],
    context: { scheduling: draft }, source: "scheduling", model,
  });
}

/* ------------------------------------------------------------------ */
/* Email, calendar, brief, projects                                    */
/* ------------------------------------------------------------------ */

async function emailAnswer(actor: Person, now: Date): Promise<ChatReply> {
  const rows = await triageRows(actor, now);
  const visible = rows.filter((row): row is Extract<typeof row, { redacted: false }> => !row.redacted);
  const needs = visible.filter((row) => row.bucket === "needs_me" && !row.snoozedUntil && !row.replied);
  const newest = (a: { receivedAt: string }, b: { receivedAt: string }) => b.receivedAt.localeCompare(a.receivedAt);
  // Two groups, because they call for different things: sensitive threads the
  // executive answers personally, and routine ones that can be handled here.
  const personal = needs.filter((row) => !row.replyable).sort(newest);
  const quick = needs.filter((row) => row.replyable).sort(newest);
  const shown = [...personal.slice(0, 2), ...quick.slice(0, 3)];
  const withheld = rows.length - visible.length;
  const text = needs.length
    ? [
      `${needs.length} message${needs.length === 1 ? " needs" : "s need"} you.`,
      personal.length ? `${personal.length} ${personal.length === 1 ? "is" : "are"} sensitive and need${personal.length === 1 ? "s" : ""} you personally, starting with ${personal[0].from}.` : "",
      quick.length ? `${quick.length} can be handled right here with a reply, a quick reply, or later.` : "",
      withheld ? `${withheld} restricted message${withheld === 1 ? " is" : "s are"} withheld from your view.` : "",
    ].filter(Boolean).join(" ")
    : "Nothing in your inbox needs you right now.";
  return reply({
    parts: [
      { type: "text", text },
      ...shown.map((row) => ({
        type: "email_card" as const,
        email: {
          id: row.id, subject: row.subject, from: row.from, fromTitle: row.fromTitle, summary: row.summary,
          risk: row.risk, receivedAt: row.receivedAt, external: row.external, injectionSuspected: row.injectionSuspected,
          replyable: row.replyable,
          quickReplies: row.replyable ? quickReplies(emailById(row.id)!, actor) : [],
          fullDraft: row.replyable ? fullReplyDraft(emailById(row.id)!, actor) : null,
        },
      })),
      { type: "link", href: "/inbox", label: needs.length > shown.length ? `See all ${needs.length} in Inbox` : "Open Inbox" },
    ],
    context: null, source: "emails", model: "mock-grounded",
    items: shown.map((row) => ({ label: row.subject, detail: row.summary, status: row.risk })),
    deepLink: { href: "/inbox", label: "Open Inbox" },
  });
}

async function calendarAnswer(actor: Person, question: string, now: Date): Promise<ChatReply> {
  const window = parseWindow(question, null) ?? { kind: "today" as const };
  const range = resolveWindow(window, now, actor.timezone);
  const label = describeWindow(window);
  const events = listVisibleCalendarEvents(actor.id).filter((event) => event.start < range.to && event.end > range.from);
  const busy = (await calendar.getSchedule({ personIds: [actor.id], from: range.from, to: range.to }))
    .filter((block) => !events.some((event) => event.start === block.start && event.end === block.end));
  const items: AssistantItem[] = [
    ...events.map((event) => ({
      label: event.subject,
      detail: `${formatSlot(event, actor.timezone)}${event.ownerId === actor.id ? "" : ` · invited by ${personById(event.ownerId)?.name ?? "a colleague"}`}`,
      status: "busy",
    })),
    ...busy.slice(0, 6).map((block) => ({ label: block.status === "tentative" ? "Tentative hold" : block.status === "out_of_office" ? "Out of office" : "Busy", detail: formatSlot(block, actor.timezone), status: block.status })),
  ].sort((a, b) => a.detail.localeCompare(b.detail));
  const text = items.length
    ? `You have ${events.length} meeting${events.length === 1 ? "" : "s"} and ${busy.length} other busy block${busy.length === 1 ? "" : "s"} ${label}.`
    : `Your calendar is clear ${label}.`;
  return reply({
    parts: [{ type: "text", text }, ...(items.length ? [{ type: "items" as const, items }] : []), { type: "link", href: "/schedule", label: "Open Calendar" }],
    context: null, source: "availability", model: "mock-grounded", items, deepLink: { href: "/schedule", label: "Open Calendar" },
  });
}

function briefAnswer(actor: Person): ChatReply {
  const insights = visibleInsights(INSIGHTS, actor.function).slice(0, 3);
  if (!insights.length) {
    return reply({ parts: [{ type: "text", text: "There is no approved brief for your function today." }], context: null, source: "insights", model: "mock-grounded" });
  }
  const items = insights.map((insight) => ({
    label: insight.headline,
    detail: `${insight.body.split(/(?<=\.)\s/)[0]} Source: ${insight.citations.map((citation) => citation.label).join(", ")}`,
    status: "info",
  }));
  return reply({
    parts: [
      { type: "text", text: `Today's brief, from approved sources only: ${insights[0].headline}.` },
      { type: "items", items },
      { type: "link", href: "/insights", label: "Open Insights" },
    ],
    context: null, source: "insights", model: "mock-grounded", items, deepLink: { href: "/insights", label: "Open Insights" },
  });
}

async function projectAnswer(actor: Person, projectId: string, now: Date): Promise<ChatReply> {
  const detail = await projectDetail(actor, projectId, now);
  const { project } = detail;
  return reply({
    parts: [
      { type: "text", text: detail.overview.summary },
      {
        type: "project_card",
        project: {
          id: project.id, name: project.name, description: project.description, color: project.color, status: project.status,
          counts: { emails: project.emailIds.length, meetings: project.eventIds.length, people: project.memberIds.length, notes: project.workspaceIds.length },
        },
        openItems: detail.overview.openItems,
      },
      { type: "actions", actions: [{ label: `Schedule a ${project.name.split(" ")[0]} check-in`, prompt: `Schedule a check-in with the ${project.name} team` }] },
    ],
    context: null, source: "projects", model: "mock-grounded",
    deepLink: { href: `/projects/${project.id}`, label: "Open project" },
  });
}

/* ------------------------------------------------------------------ */

function reply(input: { parts: ChatPart[]; context: ChatContext | null; source: string; model: string; items?: AssistantItem[]; deepLink?: AssistantDeepLink | null }): ChatReply {
  const text = input.parts.filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text").map((part) => part.text).join(" ");
  return {
    parts: input.parts,
    context: input.context,
    source: input.source,
    model: input.model,
    summary: text,
    answer: text,
    items: input.items ?? [],
    deepLink: input.deepLink ?? null,
    suggestions: [],
  };
}

function firstNames(people: Person[]): string {
  return listNames(people.map((person) => person.name.split(" ")[0]));
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
