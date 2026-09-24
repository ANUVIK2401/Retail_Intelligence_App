import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { z } from "zod";
import { actorFromRequest } from "@/core/session";
import { bookAllowedMeeting, MeetingBookingError } from "@/core/services/scheduling";
import { linkToProject, ProjectError } from "@/core/services/projects";

const BookSchema = z.object({
  slotIndex: z.number().int().min(0).max(20),
  /** The executive may retitle the meeting on the confirmation card. */
  title: z.string().trim().min(3).max(120).optional(),
  /** File the booked meeting under one of the executive's projects. */
  projectId: z.string().min(1).max(40).optional(),
}).strict();

async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorFromRequest(req);
  const { id } = await params;
  const parsed = BookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Choose a valid proposed slot." }, { status: 400 });
  }
  try {
    const result = await bookAllowedMeeting({ actorId: actor.id, proposalId: id, slotIndex: parsed.data.slotIndex, subject: parsed.data.title });
    let project: string | null = null;
    if (parsed.data.projectId) {
      // Filing is a convenience after the booking succeeded; it never blocks it.
      project = await linkToProject(actor, parsed.data.projectId, { op: "add", kind: "event", id: result.execution.eventId })
        .then((linked) => linked.id)
        .catch((error: unknown) => { if (error instanceof ProjectError) return null; throw error; });
    }
    return NextResponse.json({ ...result, projectId: project });
  } catch (error) {
    if (error instanceof MeetingBookingError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const POST = withDemoState(handlePOST);
