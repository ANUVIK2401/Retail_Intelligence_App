import { NextResponse } from "next/server";
import { RescheduleCalendarEventSchema } from "@/core/contracts";
import { readJsonBody } from "@/core/deployment/request";
import { withDemoState } from "@/core/persistence";
import { actorFromRequest } from "@/core/session";
import {
  CalendarManagementError,
  rescheduleCalendarEvent,
} from "@/core/services/calendar-management";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const actor = actorFromRequest(req);
  const parsed = RescheduleCalendarEventSchema.safeParse(
    await readJsonBody(req, 4_096).catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose a valid start time.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const event = rescheduleCalendarEvent({
      actorId: actor.id,
      eventId: id,
      ...parsed.data,
    });
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof CalendarManagementError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export const PATCH = withDemoState(handlePATCH);
