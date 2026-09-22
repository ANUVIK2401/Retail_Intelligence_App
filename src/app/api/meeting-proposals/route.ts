import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { MeetingRequestSchema } from "@/core/contracts";
import { canSeeApproval } from "@/core/access";
import { maySubmitMeetingRequest, proposeMeeting } from "@/core/services/scheduling";
import { actorFromRequest } from "@/core/session";
import { listApprovals, listProposals } from "@/core/store";
import { DELEGATIONS, RESTRICTED_ACCESS } from "@/data/org";
import { readJsonBody } from "@/core/deployment/request";

/** Proposals are scoped to the requester, the attendees, and auditors. */
async function handleGET(req: Request) {
  const actor = actorFromRequest(req);
  const visibleApprovalSubjects = new Set(listApprovals()
    .filter((a) => a.subjectType === "meeting_proposal" &&
      canSeeApproval(actor, a, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy }))
    .map((a) => a.subjectId));
  const proposals = listProposals().filter(
    (p) =>
      actor.roles.includes("auditor") ||
      p.request.requesterId === actor.id ||
      p.request.attendeeIds.includes(actor.id) ||
      visibleApprovalSubjects.has(p.id) ||
      DELEGATIONS.some(
        (d) => d.delegateId === actor.id && p.request.attendeeIds.includes(d.executiveId),
      ),
  );
  return NextResponse.json({ proposals });
}

async function handlePOST(req: Request) {
  const actor = actorFromRequest(req);
  let body: unknown;
  try { body = await readJsonBody(req, 16_384); }
  catch (error) {
    const oversized = error instanceof Error && error.message === "Request is too large.";
    return NextResponse.json({ error: oversized ? error.message : "Invalid JSON request." }, { status: oversized ? 413 : 400 });
  }
  const parsed = MeetingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid meeting request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // Who may submit this request.
  //
  // The prototype models INBOUND requests: the acting identity is usually the
  // person whose calendar is being asked for, triaging a request that came to
  // them. So the caller is allowed when they are the requester, when they are
  // an attendee (the request is addressed to them), when they hold an explicit
  // delegation, or when they are an assistant triaging on an executive's
  // behalf. What is refused is asserting a requester identity unrelated to the
  // caller and not addressed to them.
  const mayActFor = maySubmitMeetingRequest(actor, parsed.data);

  if (!mayActFor) {
    return NextResponse.json(
      {
        error: `A meeting request must come from you, be addressed to you, or be one you hold a delegation for. ${actor.name} is unrelated to this request.`,
      },
      { status: 403 },
    );
  }

  try {
    const result = await proposeMeeting({ actorId: actor.id, request: parsed.data });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Proposal failed" },
      { status: 400 },
    );
  }
}

export const GET = withDemoState(handleGET);
export const POST = withDemoState(handlePOST);
