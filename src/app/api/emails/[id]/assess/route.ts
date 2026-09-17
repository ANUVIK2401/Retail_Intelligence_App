import { NextResponse } from "next/server";
import { assessEmail } from "@/core/services/assess";
import { actorFromRequest } from "@/core/session";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = actorFromRequest(req);
  try {
    const result = await assessEmail({ emailId: id, actorId: actor.id });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Assessment failed" },
      { status: 400 },
    );
  }
}
