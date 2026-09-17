import { MockCalendarConnector } from "@/core/connectors/mock";
import type {
  ApprovalRequest,
  BusyBlock,
  MeetingProposal,
  MeetingRequest,
  ProposedSlot,
} from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import {
  nextId,
  recordAudit,
  saveApproval,
  saveProposal,
  store,
} from "@/core/store";
import { PROTECTED_BLOCKS } from "@/data/calendar";
import { personById } from "@/data/org";

const calendar = new MockCalendarConnector();

const MINUTE = 60 * 1000;

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
        .map((s, i) => `Option ${i + 1}: ${formatSlot(s)} — ${s.rationale}`)
        .join("\n"),
      risk: request.sensitivity === "confidential" ? "medium" : "low",
      decision,
      currentStep: 0,
      status: "awaiting_approval",
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

/* ------------------------------------------------------------------ */

function rankSlots(input: {
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

    if (isWeekend(start)) continue;

    const reasons: string[] = [];
    let score = 100;
    let viable = true;

    for (const pid of participants) {
      const person = personById(pid);
      if (!person) continue;

      const hour = start.getHours();
      const endHour = end.getHours() + (end.getMinutes() > 0 ? 1 : 0);
      if (hour < person.workingHours.startHour || endHour > person.workingHours.endHour) {
        viable = false;
        break;
      }

      const protectedBlocks = PROTECTED_BLOCKS[pid] ?? [];
      if (
        protectedBlocks.some(
          (b) => hour < b.endHour && end.getHours() + end.getMinutes() / 60 > b.startHour,
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
    const h = start.getHours();
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
  for (const slot of ranked) {
    const day = slot.start.slice(0, 10);
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

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function formatSlot(slot: { start: string; end: string }): string {
  const s = new Date(slot.start);
  const e = new Date(slot.end);
  const date = s.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const fmt = (d: Date) =>
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${fmt(s)}–${fmt(e)}`;
}
