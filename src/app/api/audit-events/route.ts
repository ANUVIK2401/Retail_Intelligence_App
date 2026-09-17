import { NextResponse } from "next/server";
import { listAudit } from "@/core/store";
import { personById } from "@/data/org";

export async function GET() {
  return NextResponse.json({
    events: listAudit().map((e) => ({
      ...e,
      actorName: personById(e.actorId)?.name ?? e.actorId,
    })),
  });
}
