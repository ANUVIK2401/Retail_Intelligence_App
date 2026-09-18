import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { AccessDeniedError, assessEmail } from "@/core/services/assess";
import { actorFromRequest } from "@/core/session";

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = actorFromRequest(req);
  try {
    const result = await assessEmail({ emailId: id, actorId: actor.id });
    return NextResponse.json(result);
  } catch (err) {
    // A denial returns the reason and nothing derived from the content.
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: err.message, redacted: true }, { status: 403 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Assessment failed" },
      { status: 400 },
    );
  }
}

export const POST = withDemoState(handlePOST);
