import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { listAudit } from "@/core/store";
import { personById } from "@/data/org";

async function handleGET() {
  return NextResponse.json({
    events: listAudit().map((e) => ({
      ...e,
      actorName: personById(e.actorId)?.name ?? e.actorId,
    })),
  });
}

export const GET = withDemoState(handleGET);
