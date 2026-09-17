import { NextResponse } from "next/server";
import { canSeeApproval } from "@/core/access";
import { actorFromRequest } from "@/core/session";
import { listApprovals } from "@/core/store";
import { RESTRICTED_ACCESS } from "@/data/org";

/**
 * Approvals are scoped to the acting identity. An approval carries the
 * subject of the resource it governs, so listing them globally leaked
 * restricted titles to anyone who opened the page.
 */
export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  const approvals = listApprovals().filter((a) =>
    canSeeApproval(actor, a, {
      restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy,
    }),
  );
  return NextResponse.json({ approvals });
}
