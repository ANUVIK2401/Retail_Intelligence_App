import { NextResponse } from "next/server";
import { withDemoState } from "@/core/persistence";
import { actorFromRequest } from "@/core/session";
import { listOwnedCalendarEvents } from "@/core/services/calendar-management";

export const runtime = "nodejs";
export const maxDuration = 60;

async function handleGET(req: Request) {
  const actor = actorFromRequest(req);
  return NextResponse.json({
    actor: { id: actor.id, name: actor.name, timezone: actor.timezone },
    events: listOwnedCalendarEvents(actor.id),
  });
}

export const GET = withDemoState(handleGET);
