import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { MockMailConnector } from "@/core/connectors/mock";
import { evaluatePolicy } from "@/core/policy/engine";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { actorFromRequest } from "@/core/session";
import { getAssessment, store } from "@/core/store";
import { personById } from "@/data/org";

const mail = new MockMailConnector();

/**
 * Inbox listing.
 *
 * Restricted messages are filtered at the row level, not hidden in the UI:
 * an unauthorized actor never receives the subject or body over the wire.
 */
async function handleGET(req: Request) {
  const actor = actorFromRequest(req);
  const messages = await mail.listMessages("p_ceo");

  const rows = messages.map((m) => {
    const det = evaluateDeterministicRisk({
      subject: m.subject,
      body: m.body,
      senderIsExternal: m.external,
    });
    const gate = evaluatePolicy({
      action: "email.read",
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      resourceOwnerId: m.mailboxOwnerId,
      risk: det.floor,
      topic: det.topic,
      ruleState: store.ruleState,
    });

    if (gate.outcome === "deny") {
      return {
        id: m.id,
        redacted: true as const,
        reason: gate.reason,
        receivedAt: m.receivedAt,
        riskFloor: det.floor,
      };
    }

    const cached = getAssessment(m.id);
    return {
      id: m.id,
      redacted: false as const,
      subject: m.subject,
      from: personById(m.fromId)?.name ?? "Unknown",
      fromTitle: personById(m.fromId)?.title ?? "",
      external: m.external,
      receivedAt: m.receivedAt,
      preview: m.body.replace(/\s+/g, " ").slice(0, 140),
      riskFloor: det.floor,
      injectionSuspected: det.injectionSuspected,
      assessed: Boolean(cached),
      assessedRisk: cached?.risk.level ?? null,
      topic: det.topic,
    };
  });

  return NextResponse.json({ actor: { id: actor.id, name: actor.name }, messages: rows });
}

export const GET = withDemoState(handleGET);
