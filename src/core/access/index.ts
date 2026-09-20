import { RISK_ORDER, type ApprovalRequest, type EmailMessage, type Person, type PolicyDecision, type RiskLevel } from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { store } from "@/core/store";
import { DELEGATIONS, personById } from "@/data/org";

/**
 * The single read-access gate.
 *
 * Every path that returns message content, or anything derived from it — a
 * summary, an entity list, an audit detail line, a dashboard tile — asks this
 * first. It existed inline in one route and nowhere else, which is how an
 * assistant could be denied by policy and handed the content anyway.
 *
 * Deriving risk here rather than accepting it as a parameter is deliberate:
 * a caller cannot pass a lower risk to obtain access it should not have.
 */
export type ReadGate =
  | { ok: true; decision: PolicyDecision }
  | { ok: false; decision: PolicyDecision; status: 403 };

export function canReadMessage(actor: Person, message: EmailMessage): ReadGate {
  const det = evaluateDeterministicRisk({
    subject: message.subject,
    body: message.body,
    senderIsExternal: message.external,
  });

  const decision = evaluatePolicy({
    action: "email.read",
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    resourceOwnerId: message.mailboxOwnerId,
    risk: det.floor,
    topic: det.topic,
    ruleState: store.ruleState,
  });

  if (decision.outcome === "deny") return { ok: false, decision, status: 403 };
  return { ok: true, decision };
}

/** Convenience for list endpoints: keeps only what this actor may read. */
export function readableMessages(actor: Person, messages: EmailMessage[]): EmailMessage[] {
  return messages.filter((m) => canReadMessage(actor, m).ok);
}

/**
 * A resource label safe to write into an audit line.
 *
 * Audit entries are read by people who may not be cleared for the underlying
 * resource, so they carry identifiers, never subjects or bodies.
 */
export function safeAuditLabel(message: EmailMessage): string {
  return `message ${message.id}`;
}

/**
 * Whether this actor may see an approval request.
 *
 * An approval carries the subject of the thing being approved, so it inherits
 * the underlying resource's access rules. Being a reviewer in the chain is not
 * enough on its own: a restricted matter is visible only to the named list,
 * and the policy engine already refuses to build a chain for one.
 */
export function canSeeApproval(
  actor: Person,
  approval: { requestedFor: string; risk: string; subjectType: string; action: string; decision: PolicyDecision },
  opts: { restrictedTopicOwners?: string[] } = {},
): boolean {
  if (approval.risk === "restricted") {
    const named = opts.restrictedTopicOwners ?? [];
    return named.includes(actor.id);
  }
  if (approval.requestedFor === actor.id) return true;
  if (actor.roles.includes("auditor")) return true;

  const delegated = DELEGATIONS.some((d) => d.executiveId === approval.requestedFor &&
    d.delegateId === actor.id && d.allowedActions.includes(approval.action) &&
    RISK_ORDER[approval.risk as RiskLevel] <= RISK_ORDER[d.maxRisk]);

  return approval.decision.approvalChain.some((step) => {
    if (step.kind === "reviewer" && step.reviewerDomain) {
      return actor.reviewerDomains.includes(step.reviewerDomain);
    }
    if (step.kind === "executive_assistant") {
      return delegated;
    }
    return step.kind === "executive" && delegated;
  });
}

/** A visible approval may only be decided by its current named authority. */
export function authorizeApprovalStep(
  actor: Person,
  approval: ApprovalRequest,
): { ok: true } | { ok: false; reason: string } {
  const step = approval.decision.approvalChain[approval.currentStep];
  if (!step) return { ok: false, reason: "This approval has no current reviewer." };

  if (step.kind === "executive") {
    const isOwner = actor.id === approval.requestedFor;
    const delegated = DELEGATIONS.some((d) =>
      d.delegateId === actor.id && d.executiveId === approval.requestedFor &&
      d.allowedActions.includes(approval.action) &&
      RISK_ORDER[approval.risk] <= RISK_ORDER[d.maxRisk]);
    if (isOwner || delegated) return { ok: true };
    return { ok: false, reason: `This step is ${personById(approval.requestedFor)?.name ?? "the requesting executive"}'s to clear. ${actor.name} holds no delegation for it.` };
  }

  if (step.kind === "executive_assistant") {
    const delegated = DELEGATIONS.some((d) =>
      d.delegateId === actor.id && d.executiveId === approval.requestedFor &&
      d.allowedActions.includes(approval.action) &&
      RISK_ORDER[approval.risk] <= RISK_ORDER[d.maxRisk]);
    if (delegated) return { ok: true };
    return { ok: false, reason: `This step is assigned to the delegated executive assistant for ${personById(approval.requestedFor)?.name ?? "this executive"}.` };
  }

  if (step.kind === "reviewer") {
    if (step.reviewerDomain && actor.reviewerDomains.includes(step.reviewerDomain)) return { ok: true };
    return { ok: false, reason: `This step requires the ${step.reviewerDomain ?? "assigned"} reviewer. ${actor.name} is not assigned to that review domain.` };
  }
  return { ok: false, reason: "This approval has no current reviewer." };
}
