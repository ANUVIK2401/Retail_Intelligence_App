import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { emailById } from "@/data/emails";
import { actorFromRequest } from "@/core/session";
import { fullReplyDraft, quickReplies, triageRows } from "@/core/services/triage";

/**
 * Inbox listing for triage.
 *
 * Restricted messages are filtered at the row level, not hidden in the UI:
 * an unauthorized actor never receives the subject, summary, or body over
 * the wire. Reply suggestions are built only for rows the actor may read.
 */
async function handleGET(req: Request) {
  const actor = actorFromRequest(req);
  const rows = await triageRows(actor);
  const messages = rows.map((row) => {
    if (row.redacted) return row;
    const message = emailById(row.id)!;
    return {
      ...row,
      // Kept for older clients of this route.
      assessedRisk: row.assessed ? row.risk : null,
      quickReplies: row.replyable ? quickReplies(message, actor) : [],
      fullDraft: row.replyable ? fullReplyDraft(message, actor) : null,
    };
  });
  return NextResponse.json({ actor: { id: actor.id, name: actor.name }, messages });
}

export const GET = withDemoState(handleGET);
