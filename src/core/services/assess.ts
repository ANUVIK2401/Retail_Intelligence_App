import { PROMPT_VERSION } from "@/core/ai/gateway";
import { resolveProvider } from "@/core/ai/resolve";
import { MockMailConnector } from "@/core/connectors/mock";
import {
  RISK_ORDER,
  type ApprovalRequest,
  type EmailAssessment,
  type RiskAssessment,
  type RiskLevel,
} from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import { INJECTION_PATTERNS, evaluateDeterministicRisk } from "@/core/risk/rules";
import { nextId, recordAudit, saveApproval, saveAssessment, store } from "@/core/store";
import { personById } from "@/data/org";

const mail = new MockMailConnector();

/**
 * The email assessment pipeline.
 *
 * Order matters and is the whole argument of the system:
 *
 *   sanitize -> deterministic rules -> model -> FUSE (rules floor the model)
 *   -> policy engine -> approval -> connector -> audit
 *
 * The model sits in the middle. It can raise risk. It cannot lower it, and it
 * cannot decide what happens next.
 */
export async function assessEmail(input: {
  emailId: string;
  actorId: string;
}): Promise<{ assessment: EmailAssessment; approval: ApprovalRequest | null }> {
  const correlationId = nextId("cor");
  const email = await mail.getMessage(input.emailId);
  if (!email) throw new Error("Unknown message.");

  const actor = personById(input.actorId);
  const owner = personById(email.mailboxOwnerId);
  const sender = personById(email.fromId);
  if (!actor || !owner) throw new Error("Unknown actor or mailbox owner.");

  /* 1. Deterministic rules, before any model sees the content. */
  const det = evaluateDeterministicRisk({
    subject: email.subject,
    body: email.body,
    senderIsExternal: email.external,
  });

  /* 2. Model assessment. Untrusted content is fenced inside the gateway. */
  const provider = resolveProvider();
  const model = await provider.classify({
    subject: email.subject,
    body: email.body,
    senderName: sender?.name ?? "Unknown sender",
    senderIsExternal: email.external,
    recipientTitle: owner.title,
  });

  /* 3. Fusion. max() of the two, never min(). */
  const level: RiskLevel =
    RISK_ORDER[det.floor] >= RISK_ORDER[model.level] ? det.floor : model.level;
  const escalatedByRule = RISK_ORDER[det.floor] > RISK_ORDER[model.level];
  const injectionSuspected = det.injectionSuspected || model.instructionAttemptDetected;

  const topic =
    det.topic !== "unknown" && RISK_ORDER[det.floor] >= RISK_ORDER[model.level]
      ? det.topic
      : model.topic;

  const risk: RiskAssessment = {
    level,
    topic,
    urgency: level === "high" || level === "restricted" ? "now" : model.urgency,
    reason: escalatedByRule
      ? `${det.reasons[0]} The model rated this ${model.level}; the company rule takes precedence.`
      : (det.reasons[0] ?? model.reason),
    triggeredRules: det.triggeredRules,
    modelProposed: {
      level: model.level,
      topic: model.topic,
      confidence: model.confidence,
      reason: model.reason,
    },
    escalatedByRule,
    injectionSuspected,
  };

  /* 4. Policy. The only place an outcome is decided. */
  const draftDecision = evaluatePolicy({
    action: "email.draft",
    actorId: input.actorId,
    actorRole: actor.roles[0] ?? "executive",
    resourceOwnerId: email.mailboxOwnerId,
    risk: risk.level,
    topic: risk.topic,
    ruleState: store.ruleState,
  });

  /* 5. Drafting happens only if policy permitted it. */
  let suggestedReply: string | null = null;
  if (draftDecision.outcome === "allow" || draftDecision.outcome === "require_approval") {
    try {
      const d = await provider.draft({
        subject: email.subject,
        body: email.body,
        senderName: sender?.name ?? "the sender",
        recipientName: owner.name,
        recipientTitle: owner.title,
        intent: intentFor(risk.topic),
      });
      suggestedReply = d.body;
    } catch {
      suggestedReply = null;
    }
  }

  /*
   * Presenting injected text back to the executive as a legitimate "requested
   * of you" item is itself an attack: it launders the instruction through the
   * interface. Anything matching an injection pattern is dropped from the
   * extracted items and replaced with a notice.
   */
  const cleanActionItems = model.actionItems.filter(
    (item) => !INJECTION_PATTERNS.some((p) => p.test(item)),
  );
  const suppressedCount = model.actionItems.length - cleanActionItems.length;
  if (suppressedCount > 0) {
    cleanActionItems.push(
      `${suppressedCount} further "request" in this message was an instruction aimed at the assistant, not at you. It was discarded.`,
    );
  }

  const assessment: EmailAssessment = {
    emailId: email.id,
    summary: model.summary,
    actionItems: cleanActionItems,
    entities: model.entities,
    risk,
    draftDecision,
    suggestedReply,
    assessedAt: new Date().toISOString(),
    promptVersion: PROMPT_VERSION,
    model: provider.model,
  };
  saveAssessment(assessment);

  recordAudit({
    correlationId,
    actorId: input.actorId,
    actorRole: actor.roles[0] ?? "executive",
    action: "email.assess",
    resourceType: "email",
    resourceId: email.id,
    outcome: draftDecision.outcome,
    risk: risk.level,
    policyVersion: draftDecision.policyVersion,
    matchedRules: [...risk.triggeredRules, ...draftDecision.matchedRules],
    aiModel: provider.model,
    promptVersion: PROMPT_VERSION,
    detail: injectionSuspected
      ? `Assessed "${email.subject}". Instruction-injection attempt detected in message body and ignored.`
      : `Assessed "${email.subject}".`,
  });

  /* 6. Anything consequential becomes a pending approval, never an action. */
  let approval: ApprovalRequest | null = null;
  if (
    draftDecision.outcome === "require_approval" ||
    draftDecision.outcome === "block_and_escalate"
  ) {
    approval = saveApproval({
      id: nextId("ap"),
      action: draftDecision.outcome === "block_and_escalate" ? "email.send" : "email.draft",
      subjectType: "email_draft",
      subjectId: email.id,
      title:
        draftDecision.outcome === "block_and_escalate"
          ? `Escalation: ${email.subject}`
          : `Reply to ${sender?.name ?? "sender"}: ${email.subject}`,
      proposedContent:
        suggestedReply ??
        "No reply was drafted. This matter is escalated for a person to handle directly.",
      risk: risk.level,
      decision: draftDecision,
      currentStep: 0,
      status: "awaiting_approval",
      requestedFor: email.mailboxOwnerId,
      createdAt: new Date().toISOString(),
      history: [],
    });

    recordAudit({
      correlationId,
      actorId: input.actorId,
      actorRole: actor.roles[0] ?? "executive",
      action:
        draftDecision.outcome === "block_and_escalate"
          ? "approval.escalated"
          : "approval.requested",
      resourceType: "approval",
      resourceId: approval.id,
      outcome: "awaiting_approval",
      risk: risk.level,
      policyVersion: draftDecision.policyVersion,
      matchedRules: draftDecision.matchedRules,
      aiModel: null,
      promptVersion: null,
      detail: draftDecision.reason,
    });
  }

  return { assessment, approval };
}

function intentFor(topic: string): string {
  switch (topic) {
    case "financial_approval":
      return "Acknowledge the request, confirm it is under review, and state that a decision will follow. Do not approve the spend.";
    case "scheduling":
      return "Acknowledge the scheduling request and say that times will follow.";
    case "report_review":
    case "routine_operations":
      return "Acknowledge receipt and note anything that stands out.";
    case "external_communication":
      return "Acknowledge the draft and say it will go through review before publication.";
    default:
      return "Acknowledge receipt briefly without committing to anything.";
  }
}
