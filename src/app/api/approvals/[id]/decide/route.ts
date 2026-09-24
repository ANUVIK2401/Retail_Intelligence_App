import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { authorizeApprovalStep, canSeeApproval } from "@/core/access";
import { connectors } from "@/core/connectors/resolve";
import { type ApprovalRequest } from "@/core/contracts";
import { actorFromRequest } from "@/core/session";
import {
  claimExecution,
  decideApproval,
  getApproval,
  getProposal,
  nextId,
  recordAudit,
} from "@/core/store";
import { RESTRICTED_ACCESS } from "@/data/org";
import { performReplySend } from "@/core/services/triage";

const { mail, calendar } = connectors();

/**
 * The approval gate.
 *
 * Authorization is re-checked here against the acting identity, independently
 * of anything the model produced earlier. Execution happens only after the
 * final step of the chain clears, and the connector is handed the approval id
 * that authorized it.
 */
async function handlePOST(
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
  if (!canSeeApproval(actor, approval, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy })) {
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

  const authz = authorizeApprovalStep(actor, approval);
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

  if (approval.subjectType === "meeting_proposal" && outcome === "approved" &&
    (!Number.isInteger(body.slotIndex) || (body.slotIndex ?? -1) < 0)) {
    return NextResponse.json(
      { error: "Choose a proposed meeting time before approving." },
      { status: 400 },
    );
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
  const contentEdited = updated.contentVersion !== approval.contentVersion;
  recordAudit({
    correlationId,
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    action: `approval.${contentEdited ? "edited" : outcome}`,
    resourceType: "approval",
    resourceId: approval.id,
    outcome: updated.status,
    risk: updated.risk,
    policyVersion: updated.decision.policyVersion,
    matchedRules: updated.decision.matchedRules,
    aiModel: null,
    promptVersion: null,
    detail:
      contentEdited
        ? `${actor.name} edited the proposed content; the review chain restarted.`
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
      } else if (updated.subjectType === "email_reply") {
        const reply = await performReplySend(updated, actor, "full", correlationId);
        execution = { kind: "email_reply_sent", replyId: reply.id, sentAt: reply.sentAt };
      } else if (updated.subjectType === "meeting_proposal") {
        const proposal = getProposal(updated.subjectId);
        const slotIndex = body.slotIndex!;
        const slot = proposal?.slots[slotIndex];

        // A missing proposal or an out-of-range slot must fail the approval,
        // not silently complete it. The earlier version fell through to
        // `status = "completed"` having created no event at all, so the UI
        // reported a booking that did not exist.
        if (!proposal) {
          throw new Error("The meeting proposal for this approval no longer exists.");
        }
        if (!slot) {
          throw new Error(
            `Slot ${slotIndex} is not one of the ${proposal.slots.length} proposed times. Nothing was booked.`,
          );
        }
        {
          const event = await calendar.createEvent({
            ownerId: proposal.request.attendeeIds[0],
            attendeeIds: [...new Set([proposal.request.requesterId, ...proposal.request.attendeeIds])],
            start: slot.start,
            end: slot.end,
            subject: proposal.request.purpose,
            sensitivity: proposal.request.sensitivity,
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

export const POST = withDemoState(handlePOST);
