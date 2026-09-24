import { connectors } from "@/core/connectors/resolve";
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
import { FOCUS_BLOCKS, PROTECTED_BLOCKS } from "@/data/calendar";
import { findSlots } from "@/core/scheduling/availability";
import { DELEGATIONS, personById } from "@/data/org";

const calendar = connectors().calendar;


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
  /** How many ranked options to keep; chat keeps extra for "show more times". */
  slotLimit?: number;
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
    limit: input.slotLimit,
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
        .map((s, i) => `Option ${i + 1}: ${formatSlot(s, owner.timezone)} · ${s.rationale}`)
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
export async function bookAllowedMeeting(input: { actorId: string; proposalId: string; slotIndex: number; subject?: string }) {
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
    subject: input.subject?.trim() || request.purpose, sensitivity: request.sensitivity,
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
  limit?: number;
}): ProposedSlot[] {
  const { request } = input;
  const people = input.participants.map((id) => personById(id)).filter((person): person is Person => Boolean(person));
  const owner = personById(request.attendeeIds[0]) ?? people[0];
  // The same engine serves the Calendar page form and the chat, so both
  // offer identical times for identical requests.
  return findSlots({
    participants: people,
    busy: input.busy,
    durationMinutes: request.durationMinutes,
    from: request.earliest,
    to: request.latest,
    constraints: { timezone: owner?.timezone ?? "America/Los_Angeles", ...request.constraints },
    protectedBlocks: PROTECTED_BLOCKS,
    focusBlocks: FOCUS_BLOCKS,
    limit: input.limit ?? 3,
  }).map(({ start, end, score, rationale }) => ({ start, end, score, rationale }));
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
