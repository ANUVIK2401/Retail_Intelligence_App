import { MockCalendarConnector } from "@/core/connectors/mock";
import type {
  ApprovalRequest,
  BusyBlock,
  MeetingProposal,
  MeetingRequest,
  Person,
  ProposedSlot,
} from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import {
  getProposal,
  nextId,
  recordAudit,
  saveApproval,
  saveProposal,
  store,
} from "@/core/store";
import { PROTECTED_BLOCKS } from "@/data/calendar";
import { DELEGATIONS, personById } from "@/data/org";

const calendar = new MockCalendarConnector();

const MINUTE = 60 * 1000;

/** Who may submit an inbound meeting request for the named participants. */
export function maySubmitMeetingRequest(actor: Person, request: MeetingRequest): boolean {
  return request.requesterId === actor.id ||
    request.attendeeIds.includes(actor.id) ||
    DELEGATIONS.some((delegation) =>
      delegation.delegateId === actor.id &&
      delegation.allowedActions.includes("calendar.propose") &&
      (delegation.executiveId === request.requesterId ||
        request.attendeeIds.includes(delegation.executiveId)));
}

/**
 * Policy-aware scheduling.
 *
 * Availability is retrieved as free/busy only; the connector contract has no
 * subject field, so a meeting title cannot leak through this path.
 */
export async function proposeMeeting(input: {
  actorId: string;
  request: MeetingRequest;
}): Promise<{ proposal: MeetingProposal; approval: ApprovalRequest | null }> {
  const correlationId = nextId("cor");
  const { request } = input;

  const owner = personById(request.attendeeIds[0]);
  const requester = personById(request.requesterId);
  if (!owner || !requester) throw new Error("Unknown requester or attendee.");

  const actor = personById(input.actorId);
  const hasExternalAttendee = request.attendeeIds
    .map((id) => personById(id))
    .some((p) => p?.function === "external");

  /* Policy runs before any calendar is read. */
  const decision = evaluatePolicy({
    action: "calendar.propose",
    actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive",
    resourceOwnerId: owner.id,
    risk: request.sensitivity === "confidential" ? "medium" : "low",
    topic: "scheduling",
    requesterId: request.requesterId,
    hasExternalAttendee,
    confidential: request.sensitivity === "confidential",
    ruleState: store.ruleState,
  });

  const participants = [...new Set([request.requesterId, ...request.attendeeIds])];
  const busy = await calendar.getSchedule({
    personIds: participants,
    from: request.earliest,
    to: request.latest,
  });

  const slots = rankSlots({
    participants,
    busy,
    request,
  });

  const proposal: MeetingProposal = {
    id: nextId("mp"),
    request,
    slots,
    decision,
    status: decision.outcome === "allow" ? "proposed" : "awaiting_approval",
    createdAt: new Date().toISOString(),
  };
  saveProposal(proposal);

  recordAudit({
    correlationId,
    actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive",
    action: "calendar.propose",
    resourceType: "meeting_proposal",
    resourceId: proposal.id,
    outcome: decision.outcome,
    risk: request.sensitivity === "confidential" ? "medium" : "low",
    policyVersion: decision.policyVersion,
    matchedRules: decision.matchedRules,
    aiModel: null,
    promptVersion: null,
    detail: `Free/busy retrieved for ${participants.length} people. No meeting subjects were requested or returned. ${decision.reason}`,
  });

  let approval: ApprovalRequest | null = null;
  if (decision.outcome !== "allow") {
    approval = saveApproval({
      id: nextId("ap"),
      action: "calendar.create_event",
      subjectType: "meeting_proposal",
      subjectId: proposal.id,
      title: `Meeting request from ${requester.name}: ${request.purpose}`,
      proposedContent: slots
        .map((s, i) => `Option ${i + 1}: ${formatSlot(s, owner.timezone)} — ${s.rationale}`)
        .join("\n"),
      risk: request.sensitivity === "confidential" ? "medium" : "low",
      decision,
      currentStep: 0,
      status: "awaiting_approval",
      contentVersion: 0,
      executionClaimed: false,
      requestedFor: owner.id,
      createdAt: new Date().toISOString(),
      history: [],
    });

    recordAudit({
      correlationId,
      actorId: input.actorId,
      actorRole: actor?.roles[0] ?? "executive",
      action: "approval.requested",
      resourceType: "approval",
      resourceId: approval.id,
      outcome: "awaiting_approval",
      risk: approval.risk,
      policyVersion: decision.policyVersion,
      matchedRules: decision.matchedRules,
      aiModel: null,
      promptVersion: null,
      detail: decision.reason,
    });
  }

  return { proposal, approval };
}

export class MeetingBookingError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.status = status;
  }
}

/** Book a chosen slot when both proposal and write policy explicitly allow it. */
export async function bookAllowedMeeting(input: { actorId: string; proposalId: string; slotIndex: number }) {
  const proposal = getProposal(input.proposalId);
  if (!proposal) throw new MeetingBookingError("Meeting proposal not found.", 404);
  const { request } = proposal;
  const ownerId = request.attendeeIds[0];
  const maySee = input.actorId === request.requesterId || request.attendeeIds.includes(input.actorId) ||
    DELEGATIONS.some((d) => d.delegateId === input.actorId && request.attendeeIds.includes(d.executiveId));
  if (!maySee) throw new MeetingBookingError("You are not authorized to book this meeting.", 403);
  if (proposal.status !== "proposed") throw new MeetingBookingError("This meeting has already been booked or is awaiting review.", 409);
  if (proposal.decision.outcome !== "allow") throw new MeetingBookingError("This meeting requires approval before booking.", 409);
  const slot = Number.isInteger(input.slotIndex) && input.slotIndex >= 0 ? proposal.slots[input.slotIndex] : undefined;
  if (!slot) throw new MeetingBookingError("Choose one of the proposed slots.", 400);

  const actor = personById(input.actorId);
  const hasExternalAttendee = request.attendeeIds.some((id) => personById(id)?.function === "external");
  const decision = evaluatePolicy({
    action: "calendar.create_event", actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive", resourceOwnerId: ownerId,
    risk: request.sensitivity === "confidential" ? "medium" : "low", topic: "scheduling",
    requesterId: request.requesterId, hasExternalAttendee,
    confidential: request.sensitivity === "confidential", ruleState: store.ruleState,
  });
  if (decision.outcome !== "allow") throw new MeetingBookingError("Calendar policy requires approval for this booking.", 409);

  const participants = [...new Set([request.requesterId, ...request.attendeeIds])];
  const busy = await calendar.getSchedule({ personIds: participants, from: slot.start, to: slot.end });
  const conflict = busy.some((block) => block.status !== "tentative" && block.start < slot.end && block.end > slot.start);
  if (conflict) throw new MeetingBookingError("That time has since been booked. Choose another slot.", 409);

  const event = await calendar.createEvent({
    ownerId, attendeeIds: participants, start: slot.start, end: slot.end,
    subject: request.purpose, sensitivity: request.sensitivity,
    policyGrantId: `policy:${proposal.id}:${decision.policyVersion}`,
  });
  const updated = saveProposal({ ...proposal, status: "approved" });
  recordAudit({
    correlationId: nextId("cor"), actorId: input.actorId,
    actorRole: actor?.roles[0] ?? "executive", action: "connector.calendar.create_event",
    resourceType: "meeting_proposal", resourceId: proposal.id, outcome: "completed",
    risk: request.sensitivity === "confidential" ? "medium" : "low",
    policyVersion: decision.policyVersion, matchedRules: decision.matchedRules,
    aiModel: null, promptVersion: null,
    detail: `Event ${event.eventId} created (simulated) for chosen slot under direct policy grant.`,
  });
  return { proposal: updated, execution: { kind: "calendar_event_created" as const, ...event, slot } };
}

/* ------------------------------------------------------------------ */

export function rankSlots(input: {
  participants: string[];
  busy: BusyBlock[];
  request: MeetingRequest;
}): ProposedSlot[] {
  const { participants, busy, request } = input;
  const duration = request.durationMinutes * MINUTE;
  const from = new Date(request.earliest).getTime();
  const to = new Date(request.latest).getTime();

  const candidates: ProposedSlot[] = [];
  const STEP = 30 * MINUTE;

  for (let t = ceilToHalfHour(from); t + duration <= to; t += STEP) {
    const start = new Date(t);
    const end = new Date(t + duration);

    const reasons: string[] = [];
    let score = 100;
    let viable = true;

    for (const pid of participants) {
      const person = personById(pid);
      if (!person) continue;

      const localStart = zonedClock(start, person.timezone);
      const localEnd = zonedClock(end, person.timezone);
      if (localStart.weekday === "Sat" || localStart.weekday === "Sun" ||
        localStart.date !== localEnd.date ||
        localStart.minutes < person.workingHours.startHour * 60 ||
        localEnd.minutes > person.workingHours.endHour * 60) {
        viable = false;
        break;
      }

      const protectedBlocks = PROTECTED_BLOCKS[pid] ?? [];
      if (
        protectedBlocks.some(
          (b) => localStart.minutes < b.endHour * 60 && localEnd.minutes > b.startHour * 60,
        )
      ) {
        viable = false;
        break;
      }

      const conflicts = busy.filter(
        (b) =>
          b.personId === pid &&
          new Date(b.start).getTime() < t + duration &&
          new Date(b.end).getTime() > t,
      );
      if (conflicts.some((c) => c.status === "busy" || c.status === "out_of_office")) {
        viable = false;
        break;
      }
      if (conflicts.some((c) => c.status === "tentative")) {
        score -= 25;
        reasons.push(`${person.name} is tentatively held`);
      }
    }

    if (!viable) continue;

    // Prefer mid-morning and early afternoon; penalize the very edges of day.
    const owner = personById(request.attendeeIds[0]) ?? personById(participants[0]);
    const h = owner ? Math.floor(zonedClock(start, owner.timezone).minutes / 60) : start.getUTCHours();
    if (h >= 10 && h <= 11) score += 12;
    else if (h >= 13 && h <= 15) score += 6;
    else if (h <= 8 || h >= 17) score -= 10;

    // Prefer sooner.
    const daysOut = Math.floor((t - from) / (24 * 60 * MINUTE));
    score -= daysOut * 3;

    if (reasons.length === 0) reasons.push("All participants free, inside working hours");

    candidates.push({
      start: start.toISOString(),
      end: end.toISOString(),
      score,
      rationale: reasons.join("; "),
    });
  }

  // Prefer one option per day before offering a second on the same day: three
  // slots in one afternoon is not a real choice for the requester.
  const ranked = candidates.sort((a, b) => b.score - a.score);
  const byDay = new Map<string, ProposedSlot>();
  const owner = personById(request.attendeeIds[0]) ?? personById(participants[0]);
  for (const slot of ranked) {
    const day = owner ? zonedClock(new Date(slot.start), owner.timezone).date : slot.start.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, slot);
  }
  const spread = [...byDay.values()].sort((a, b) => b.score - a.score);
  const filler = ranked.filter((s) => !spread.includes(s));
  return [...spread, ...filler].slice(0, 3);
}

function ceilToHalfHour(t: number): number {
  const d = new Date(t);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m <= 0 ? 0 : m <= 30 ? 30 : 60);
  return d.getTime();
}

function zonedClock(date: Date, timeZone: string): { date: string; weekday: string; minutes: number } {
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
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    weekday: read("weekday"),
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

export function formatSlot(slot: { start: string; end: string }, timeZone = "America/Los_Angeles"): string {
  const s = new Date(slot.start);
  const e = new Date(slot.end);
  const date = s.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return `${date}, ${fmt(s)}–${fmt(e)}`;
}
