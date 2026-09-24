import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { connectors } from "@/core/connectors/resolve";
import { RISK_ORDER, type RiskLevel } from "@/core/contracts";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { canSeeApproval, readableMessages } from "@/core/access";
import { visibleInsights } from "@/core/services/insights";
import { actorFromRequest } from "@/core/session";
import { triageRows } from "@/core/services/triage";
import { getAssessment, listApprovals, listAudit } from "@/core/store";
import { INSIGHTS } from "@/data/knowledge";
import { RESTRICTED_ACCESS, personById } from "@/data/org";

const mail = connectors().mail;

/**
 * Aggregated view. Reads cached assessments and stored state; it does not
 * re-send mailbox content to a model on every page load.
 */
async function handleGET(req: Request) {
  const actor = actorFromRequest(req);
  // Filter before anything is derived. Tiles, counts, and "needs attention"
  // are all message-derived, so an unfiltered read here leaks subjects and
  // senders regardless of what the inbox route does.
  const messages = readableMessages(actor, await mail.listMessages("p_ceo"));

  const scored = messages.map((m) => {
    const cached = getAssessment(m.id);
    const det = evaluateDeterministicRisk({
      subject: m.subject,
      body: m.body,
      senderIsExternal: m.external,
    });
    const level: RiskLevel = cached?.risk.level ?? det.floor;
    return {
      id: m.id,
      subject: m.subject,
      from: personById(m.fromId)?.name ?? "Unknown",
      receivedAt: m.receivedAt,
      level,
      topic: cached?.risk.topic ?? det.topic,
      assessed: Boolean(cached),
      injectionSuspected: det.injectionSuspected,
    };
  });

  // Approvals carry the subject of the underlying resource, so they are
  // scoped by the same access rules rather than by chain membership alone.
  const approvals = listApprovals().filter((a) =>
    canSeeApproval(actor, a, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy }),
  );

  return NextResponse.json({
    actor: { id: actor.id, name: actor.name, title: actor.title, roles: actor.roles },
    needsAttention: scored
      .filter((s) => RISK_ORDER[s.level] >= RISK_ORDER.high)
      .sort((a, b) => RISK_ORDER[b.level] - RISK_ORDER[a.level]),
    routine: scored.filter((s) => RISK_ORDER[s.level] <= RISK_ORDER.medium),
    pendingApprovals: approvals.filter(
      (a) => a.status === "awaiting_approval" || a.status === "proposed",
    ),
    completedApprovals: approvals.filter(
      (a) => a.status === "completed" || a.status === "approved" || a.status === "rejected",
    ).length,
    insights: visibleInsights(INSIGHTS, actor.function).slice(0, 2),
    // Auditors see the full trail on the Audit page; the dashboard shows only
    // this actor's own events so a tile cannot surface someone else's work.
    recentAudit: listAudit(50)
      .filter((e) => e.actorId === actor.id || actor.roles.includes("auditor"))
      .slice(0, 5),
    // The same buckets the Inbox filters use, so the two never disagree.
    triage: await triageCounts(actor),
    counts: {
      total: scored.length,
      unassessed: scored.filter((s) => !s.assessed).length,
      high: scored.filter((s) => RISK_ORDER[s.level] >= RISK_ORDER.high).length,
    },
  });
}


async function triageCounts(actor: ReturnType<typeof actorFromRequest>): Promise<{ needsMe: number; canWait: number; snoozed: number }> {
  const rows = (await triageRows(actor)).filter((row) => !row.redacted);
  const open = rows.filter((row) => !row.redacted && !row.snoozedUntil && !row.replied);
  return {
    needsMe: open.filter((row) => !row.redacted && row.bucket === "needs_me").length,
    canWait: open.filter((row) => !row.redacted && row.bucket === "can_wait").length,
    snoozed: rows.filter((row) => !row.redacted && row.snoozedUntil).length,
  };
}

export const GET = withDemoState(handleGET);
