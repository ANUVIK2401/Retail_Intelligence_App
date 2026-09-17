import { NextResponse } from "next/server";
import { MockCalendarConnector, MockMailConnector } from "@/core/connectors/mock";
import { RISK_ORDER, type ApprovalRequest, type Person } from "@/core/contracts";
import { actorFromRequest } from "@/core/session";
import {
  claimExecution,
  decideApproval,
  getApproval,
  getProposal,
  nextId,
  recordAudit,
} from "@/core/store";
import { DELEGATIONS, personById } from "@/data/org";

const mail = new MockMailConnector();
const calendar = new MockCalendarConnector();

/**
 * The approval gate.
 *
 * Authorization is re-checked here against the acting identity, independently
 * of anything the model produced earlier. Execution happens only after the
 * final step of the chain clears, and the connector is handed the approval id
 * that authorized it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = actorFromRequest(req);
  const body = (await req.json().catch(() => ({}))) as {
    outcome?: "approved" | "rejected" | "edited" | "escalated";
    note?: string;
    editedContent?: string;
    /** Slot index chosen when approving a meeting proposal. */
    slotIndex?: number;
  };

  const approval = getApproval(id);
  if (!approval) {
    return NextResponse.json({ error: "Unknown approval request." }, { status: 404 });
  }

  const outcome = body.outcome ?? "approved";

  /* A blocked matter can be acknowledged or rejected, never approved into an action. */
  if (approval.decision.outcome === "block_and_escalate" && outcome === "approved") {
    return NextResponse.json(
      {
        error:
          "This matter is blocked from automated handling. It can be acknowledged and escalated, but the assistant will not send a response on it.",
        policyVersion: approval.decision.policyVersion,
      },
      { status: 409 },
    );
  }

  const authz = authorize(actor, approval);
  if (!authz.ok) {
    recordAudit({
      correlationId: nextId("cor"),
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      action: "approval.denied",
      resourceType: "approval",
      resourceId: approval.id,
      outcome: "denied",
      risk: approval.risk,
      policyVersion: approval.decision.policyVersion,
      matchedRules: approval.decision.matchedRules,
      aiModel: null,
      promptVersion: null,
      detail: authz.reason,
    });
    return NextResponse.json({ error: authz.reason }, { status: 403 });
  }

  let updated: ApprovalRequest;
  try {
    updated = decideApproval({
      id,
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      outcome,
      note: body.note,
      editedContent: body.editedContent,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "This request could not be decided." },
      { status: 409 },
    );
  }

  const correlationId = nextId("cor");
  recordAudit({
    correlationId,
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    action: `approval.${outcome}`,
    resourceType: "approval",
    resourceId: approval.id,
    outcome: updated.status,
    risk: updated.risk,
    policyVersion: updated.decision.policyVersion,
    matchedRules: updated.decision.matchedRules,
    aiModel: null,
    promptVersion: null,
    detail:
      body.editedContent !== undefined
        ? `${actor.name} edited the proposed content before deciding.`
        : `${actor.name} recorded: ${outcome}.`,
  });

  /* Execution happens here and only here, and at most once per approval. */
  let execution: unknown = null;
  if (updated.status === "approved" && claimExecution(updated.id)) {
    try {
      updated.status = "executing";
      if (updated.subjectType === "email_draft") {
        const draft = await mail.createReplyDraft({
          messageId: updated.subjectId,
          body: updated.proposedContent,
          approvalId: updated.id,
        });
        execution = { kind: "outlook_draft_created", ...draft };
        recordAudit({
          correlationId,
          actorId: actor.id,
          actorRole: actor.roles[0] ?? "executive",
          action: "connector.mail.create_draft",
          resourceType: "email",
          resourceId: updated.subjectId,
          outcome: "completed",
          risk: updated.risk,
          policyVersion: updated.decision.policyVersion,
          matchedRules: updated.decision.matchedRules,
          aiModel: null,
          promptVersion: null,
          detail: `Draft ${draft.externalRef} created in the mailbox. Not sent: sending is a separate, explicitly authorized action.`,
        });
      } else if (updated.subjectType === "meeting_proposal") {
        const proposal = getProposal(updated.subjectId);
        const slot = proposal?.slots[body.slotIndex ?? 0];
        if (proposal && slot) {
          const event = await calendar.createEvent({
            ownerId: proposal.request.attendeeIds[0],
            attendeeIds: proposal.request.attendeeIds,
            start: slot.start,
            end: slot.end,
            subject: proposal.request.purpose,
            approvalId: updated.id,
          });
          proposal.status = "approved";
          execution = { kind: "calendar_event_created", ...event, slot };
          recordAudit({
            correlationId,
            actorId: actor.id,
            actorRole: actor.roles[0] ?? "executive",
            action: "connector.calendar.create_event",
            resourceType: "meeting_proposal",
            resourceId: proposal.id,
            outcome: "completed",
            risk: updated.risk,
            policyVersion: updated.decision.policyVersion,
            matchedRules: updated.decision.matchedRules,
            aiModel: null,
            promptVersion: null,
            detail: `Event ${event.eventId} created (simulated).`,
          });
        }
      }
      updated.status = "completed";
    } catch (err) {
      updated.status = "failed";
      recordAudit({
        correlationId,
        actorId: actor.id,
        actorRole: actor.roles[0] ?? "executive",
        action: "connector.failed",
        resourceType: updated.subjectType,
        resourceId: updated.subjectId,
        outcome: "failed",
        risk: updated.risk,
        policyVersion: updated.decision.policyVersion,
        matchedRules: [],
        aiModel: null,
        promptVersion: null,
        detail: err instanceof Error ? err.message : "Connector error",
      });
    }
  }

  return NextResponse.json({ approval: updated, execution });
}

function authorize(
  actor: Person,
  approval: ApprovalRequest,
): { ok: true } | { ok: false; reason: string } {
  const step = approval.decision.approvalChain[approval.currentStep];
  if (!step) return { ok: true };

  if (step.kind === "executive") {
    // The executive step belongs to the person the request was raised for, or
    // to someone holding an explicit delegation from them. Accepting any
    // account with the "executive" role let one executive approve another's
    // work, which is not how approval authority runs.
    const isOwner = actor.id === approval.requestedFor;
    const delegated = DELEGATIONS.some(
      (d) =>
        d.delegateId === actor.id &&
        d.executiveId === approval.requestedFor &&
        RISK_ORDER[approval.risk] <= RISK_ORDER[d.maxRisk],
    );
    if (isOwner || delegated) return { ok: true };

    const owner = personById(approval.requestedFor);
    return {
      ok: false,
      reason: `This step is ${owner?.name ?? "the requesting executive"}'s to clear. ${actor.name} holds no delegation for it.`,
    };
  }

  if (step.kind === "executive_assistant") {
    const delegated = DELEGATIONS.some(
      (d) => d.delegateId === actor.id && d.executiveId === approval.requestedFor,
    );
    if (delegated || actor.roles.includes("executive")) return { ok: true };
    return {
      ok: false,
      reason: `This step is assigned to the delegated executive assistant. ${actor.name} holds no delegation for ${personById(approval.requestedFor)?.name ?? "this executive"}.`,
    };
  }

  if (step.kind === "reviewer") {
    const domain = step.reviewerDomain;
    if (domain && actor.reviewerDomains.includes(domain)) return { ok: true };
    return {
      ok: false,
      reason: `This step requires the ${domain ?? "assigned"} reviewer. ${actor.name} is not assigned to that review domain.`,
    };
  }

  return { ok: true };
}
