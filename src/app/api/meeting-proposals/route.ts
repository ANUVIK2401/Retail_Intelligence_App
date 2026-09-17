import { NextResponse } from "next/server";
import { MeetingRequestSchema } from "@/core/contracts";
import { proposeMeeting } from "@/core/services/scheduling";
import { actorFromRequest } from "@/core/session";
import { listProposals } from "@/core/store";

export async function GET() {
  return NextResponse.json({ proposals: listProposals() });
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
