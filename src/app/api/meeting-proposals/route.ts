import { NextResponse } from "next/server";
import { MeetingRequestSchema } from "@/core/contracts";
import { proposeMeeting } from "@/core/services/scheduling";
import { actorFromRequest } from "@/core/session";
import { listProposals } from "@/core/store";
import { DELEGATIONS } from "@/data/org";

/** Proposals are scoped to the requester, the attendees, and auditors. */
export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  const proposals = listProposals().filter(
    (p) =>
      actor.roles.includes("auditor") ||
      p.request.requesterId === actor.id ||
      p.request.attendeeIds.includes(actor.id) ||
      DELEGATIONS.some(
        (d) => d.delegateId === actor.id && p.request.attendeeIds.includes(d.executiveId),
      ),
  );
  return NextResponse.json({ proposals });
}

export async function POST(req: Request) {
  const actor = actorFromRequest(req);
  const parsed = MeetingRequestSchema.safeParse(await req.json().catch(() => null));
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
  const { requesterId, attendeeIds } = parsed.data;
  const mayActFor =
    requesterId === actor.id ||
    attendeeIds.includes(actor.id) ||
    DELEGATIONS.some(
      (d) =>
        d.delegateId === actor.id &&
        (d.executiveId === requesterId || attendeeIds.includes(d.executiveId)),
    ) ||
    actor.roles.includes("executive_assistant");

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
