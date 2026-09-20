import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { actorFromRequest } from "@/core/session";
import { bookAllowedMeeting, MeetingBookingError } from "@/core/services/scheduling";

async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorFromRequest(req);
  const { id } = await params;
  const parsed: unknown = await req.json().catch(() => null);
  const slotIndex = typeof parsed === "object" && parsed !== null ?
    (parsed as Record<string, unknown>).slotIndex : undefined;
  if (!Number.isInteger(slotIndex) || Number(slotIndex) < 0) {
    return NextResponse.json({ error: "Choose a valid proposed slot." }, { status: 400 });
  }
  try {
    return NextResponse.json(await bookAllowedMeeting({ actorId: actor.id, proposalId: id, slotIndex: Number(slotIndex) }));
  } catch (error) {
    if (error instanceof MeetingBookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withDemoState(handlePOST);
