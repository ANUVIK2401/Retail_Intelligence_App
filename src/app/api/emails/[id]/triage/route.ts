import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 30;
import { NextResponse } from "next/server";
import { TriageActionSchema } from "@/core/contracts";
import { readJsonBody } from "@/core/deployment/request";
import { actorFromRequest } from "@/core/session";
import { sendReply, snoozeMessage, TriageError, unsnoozeMessage } from "@/core/services/triage";

/** Reply fully, reply quickly, or later. Sending goes through policy and an approval id. */
async function handlePOST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = actorFromRequest(req);
  const { id } = await params;
  let body: unknown;
  try { body = await readJsonBody(req, 8192); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const parsed = TriageActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose reply, quick reply, or later." }, { status: 400 });
  try {
    const action = parsed.data;
    if (action.action === "snooze") return NextResponse.json({ status: "snoozed", ...(await snoozeMessage(actor, id, action.preset)) });
    if (action.action === "unsnooze") {
      await unsnoozeMessage(actor, id);
      return NextResponse.json({ status: "unsnoozed" });
    }
    const result = await sendReply(actor, id, action.body, action.kind);
    return NextResponse.json(result.status === "sent"
      ? { status: "sent", replyId: result.reply.id, sentAt: result.reply.sentAt, approvalId: result.approvalId }
      : { status: "needs_review", approvalId: result.approval.id, reviewers: result.reviewers, reason: result.approval.decision.reason });
  } catch (error) {
    if (error instanceof TriageError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export const POST = withDemoState(handlePOST);
