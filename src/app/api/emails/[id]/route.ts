import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { MockMailConnector } from "@/core/connectors/mock";
import { evaluatePolicy } from "@/core/policy/engine";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { canSeeApproval } from "@/core/access";
import { actorFromRequest } from "@/core/session";
import { getAssessment, listApprovals, store } from "@/core/store";
import { personById, RESTRICTED_ACCESS } from "@/data/org";

const mail = new MockMailConnector();

async function handleGET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const actor = actorFromRequest(req);
  const message = await mail.getMessage(id);
  if (!message) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const det = evaluateDeterministicRisk({
    subject: message.subject,
    body: message.body,
    senderIsExternal: message.external,
  });

  const gate = evaluatePolicy({
    action: "email.read",
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    resourceOwnerId: message.mailboxOwnerId,
    risk: det.floor,
    topic: det.topic,
    ruleState: store.ruleState,
  });

  if (gate.outcome === "deny") {
    return NextResponse.json(
      { redacted: true, reason: gate.reason, policyVersion: gate.policyVersion },
      { status: 403 },
    );
  }

  return NextResponse.json({
    message: {
      ...message,
      fromName: personById(message.fromId)?.name ?? "Unknown",
      fromTitle: personById(message.fromId)?.title ?? "",
    },
    assessment: getAssessment(id) ?? null,
    approval: listApprovals().find((a) =>
      a.subjectType === "email_draft" && a.subjectId === id &&
      canSeeApproval(actor, a, { restrictedTopicOwners: RESTRICTED_ACCESS.confidential_strategy }),
    ) ?? null,
  });
}

export const GET = withDemoState(handleGET);
