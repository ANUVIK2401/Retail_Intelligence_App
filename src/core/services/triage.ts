import { connectors } from "@/core/connectors/resolve";
import { authorizeApprovalStep, canReadMessage } from "@/core/access";
import {
  RISK_ORDER,
  type ApprovalRequest,
  type EmailMessage,
  type Person,
  type RiskLevel,
  type SentReply,
  type SnoozePreset,
  type Topic,
} from "@/core/contracts";
import { evaluatePolicy } from "@/core/policy/engine";
import { evaluateDeterministicRisk } from "@/core/risk/rules";
import { suggestProject } from "@/core/projects/suggest";
import { zonedClock, zonedInstant } from "@/core/scheduling/availability";
import { claimExecution, decideApproval, getAssessment, nextId, recordAudit, saveApproval, store } from "@/core/store";
import { EMAIL_SUMMARIES } from "@/data/emails";
import { personById } from "@/data/org";

/**
 * Mobile-first inbox triage: reply fully, reply quickly, or later.
 *
 * Sending is the only consequential step here, and it takes the same path as
 * every other write: policy decides, an approval record with an id is
 * created, the executive's own confirmation clears it only when policy says
 * their confirmation is enough, and the connector refuses without the id.
 */

const mail = connectors().mail;

export type TriageBucket = "needs_me" | "can_wait";

export type TriageRow =
  | { id: string; redacted: true; reason: string; receivedAt: string; riskFloor: RiskLevel }
  | {
      id: string;
      redacted: false;
      subject: string;
      from: string;
      fromTitle: string;
      fromId: string;
      external: boolean;
      receivedAt: string;
      summary: string;
      preview: string;
      riskFloor: RiskLevel;
      risk: RiskLevel;
      topic: Topic;
      injectionSuspected: boolean;
      assessed: boolean;
      bucket: TriageBucket;
      snoozedUntil: string | null;
      replied: boolean;
      /** Whether policy lets a reply go out from this screen at all. */
      replyable: boolean;
      projectId: string | null;
      suggestion: { projectId: string; projectName: string; reason: string } | null;
    };

export class TriageError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.status = status;
  }
}

const ROUTINE_TOPICS: readonly Topic[] = ["promotional", "routine_operations", "report_review"];

/** Whether a message needs the executive, or can wait. Rules only, no model. */
export function bucketFor(risk: RiskLevel, topic: Topic): TriageBucket {
  return RISK_ORDER[risk] <= RISK_ORDER.low && ROUTINE_TOPICS.includes(topic) ? "can_wait" : "needs_me";
}

export async function triageRows(actor: Person, now = new Date()): Promise<TriageRow[]> {
  const messages = await mail.listMessages("p_ceo");
  const projects = [...store.projects.values()].filter((project) => project.ownerId === actor.id);
  return messages.map((message): TriageRow => {
    const det = evaluateDeterministicRisk({ subject: message.subject, body: message.body, senderIsExternal: message.external });
    const gate = canReadMessage(actor, message);
    if (!gate.ok) {
      return { id: message.id, redacted: true, reason: gate.decision.reason, receivedAt: message.receivedAt, riskFloor: det.floor };
    }
    const cached = getAssessment(message.id);
    // The rules floor the model: an assessment can raise the level, never lower it.
    const risk = cached && RISK_ORDER[cached.risk.level] > RISK_ORDER[det.floor] ? cached.risk.level : det.floor;
    const snooze = store.snoozes.get(message.id);
    const snoozedUntil = snooze && Date.parse(snooze.until) > now.getTime() ? snooze.until : null;
    const projectId = projects.find((project) => project.emailIds.includes(message.id))?.id ?? null;
    const suggestion = projectId ? null : suggestProject(message, projects, (id) => personById(id)?.name ?? "The sender");
    return {
      id: message.id,
      redacted: false,
      subject: message.subject,
      from: personById(message.fromId)?.name ?? "Unknown sender",
      fromTitle: personById(message.fromId)?.title ?? "",
      fromId: message.fromId,
      external: message.external,
      receivedAt: message.receivedAt,
      summary: EMAIL_SUMMARIES[message.id] ?? cached?.summary ?? message.subject,
      preview: message.body.replace(/\s+/g, " ").slice(0, 140),
      riskFloor: det.floor,
      risk,
      topic: det.topic,
      injectionSuspected: det.injectionSuspected,
      assessed: Boolean(cached),
      bucket: bucketFor(risk, det.topic),
      snoozedUntil,
      replied: [...store.sent.values()].some((reply) => reply.emailId === message.id),
      replyable: RISK_ORDER[risk] < RISK_ORDER.high,
      projectId,
      suggestion: suggestion ? { projectId: suggestion.projectId, projectName: suggestion.projectName, reason: suggestion.reason } : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Later                                                               */
/* ------------------------------------------------------------------ */

/** When a snoozed message comes back, in the executive's own timezone. Pure. */
export function snoozeUntil(preset: SnoozePreset, now: Date, timezone: string): Date {
  const local = zonedClock(now, timezone);
  const [year, month, day] = local.date.split("-").map(Number);
  const dayAt = (offset: number, minutes: number) => {
    const date = new Date(Date.UTC(year, month - 1, day + offset));
    return zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), minutes, timezone);
  };
  switch (preset) {
    case "tonight": {
      // After 6 PM "tonight" means two hours from now, not a time already past.
      const tonight = dayAt(0, 18 * 60);
      return tonight.getTime() > now.getTime() + 30 * 60_000 ? tonight : new Date(now.getTime() + 2 * 60 * 60_000);
    }
    case "tomorrow_morning":
      return dayAt(1, 8 * 60);
    case "next_week": {
      const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(local.weekday);
      return dayAt(((8 - weekday) % 7) || 7, 8 * 60);
    }
  }
}

export async function snoozeMessage(actor: Person, emailId: string, preset: SnoozePreset, now = new Date()): Promise<{ until: string }> {
  await readableOrThrow(actor, emailId);
  const until = snoozeUntil(preset, now, actor.timezone).toISOString();
  store.snoozes = new Map(store.snoozes).set(emailId, { until, actorId: actor.id });
  recordAudit({
    correlationId: nextId("cor"), actorId: actor.id, actorRole: actor.roles[0] ?? "executive",
    action: "email.snoozed", resourceType: "email", resourceId: emailId, outcome: "completed", risk: "low",
    policyVersion: "n/a", matchedRules: [], aiModel: null, promptVersion: null,
    detail: `Message ${emailId} set aside until ${until}.`,
  });
  return { until };
}

export async function unsnoozeMessage(actor: Person, emailId: string): Promise<void> {
  await readableOrThrow(actor, emailId);
  const next = new Map(store.snoozes);
  next.delete(emailId);
  store.snoozes = next;
}

/* ------------------------------------------------------------------ */
/* Reply                                                               */
/* ------------------------------------------------------------------ */

export type QuickReply = { id: "acknowledge" | "delegate" | "ask"; label: string; body: string };

/** Short replies for the three things an executive usually means. Pure. */
export function quickReplies(message: Pick<EmailMessage, "fromId" | "subject">, actor: Pick<Person, "name" | "assistantId">): QuickReply[] {
  const sender = personById(message.fromId);
  const first = sender && sender.function !== "external" ? sender.name.split(" ")[0] : "there";
  const assistant = actor.assistantId ? personById(actor.assistantId)?.name.split(" ")[0] : null;
  const me = actor.name.split(" ")[0];
  return [
    { id: "acknowledge", label: "Got it", body: `Thanks, ${first}. Got it, and I'll follow up shortly.\n\n${me}` },
    {
      id: "delegate", label: assistant ? `Loop in ${assistant}` : "Delegate",
      body: assistant
        ? `Thanks, ${first}. I'm looping in ${assistant} to find a time and keep this moving.\n\n${me}`
        : `Thanks, ${first}. I'm asking the right owner on my team to pick this up.\n\n${me}`,
    },
    { id: "ask", label: "Need more info", body: `Thanks, ${first}. Before I decide, can you send a short summary of the options and your recommendation?\n\n${me}` },
  ];
}

/** A complete first draft for "Reply fully". The executive edits it before sending. */
export function fullReplyDraft(message: Pick<EmailMessage, "id" | "fromId" | "subject">, actor: Pick<Person, "name">): string {
  const cached = getAssessment(message.id)?.suggestedReply;
  if (cached) return cached;
  const sender = personById(message.fromId);
  const first = sender && sender.function !== "external" ? sender.name.split(" ")[0] : "there";
  const me = actor.name.split(" ")[0];
  return `Hi ${first},\n\nThank you for this. I've read it and I'm supportive of moving ahead. Let's use our next conversation to agree on the specific next steps and owners, and please flag anything that needs a decision from me before then.\n\nBest,\n${me}`;
}

export type SendResult =
  | { status: "sent"; reply: SentReply; approvalId: string }
  | { status: "needs_review"; approval: ApprovalRequest; reviewers: string[] };

export async function sendReply(actor: Person, emailId: string, body: string, kind: "full" | "quick"): Promise<SendResult> {
  const message = await readableOrThrow(actor, emailId);
  const det = evaluateDeterministicRisk({ subject: message.subject, body: message.body, senderIsExternal: message.external });
  const cached = getAssessment(emailId);
  const risk = cached && RISK_ORDER[cached.risk.level] > RISK_ORDER[det.floor] ? cached.risk.level : det.floor;
  const decision = evaluatePolicy({
    action: "email.send", actorId: actor.id, actorRole: actor.roles[0] ?? "executive",
    resourceOwnerId: message.mailboxOwnerId, risk, topic: det.topic, ruleState: store.ruleState,
  });
  const correlationId = nextId("cor");

  if (decision.outcome === "deny" || decision.outcome === "block_and_escalate") {
    recordAudit({
      correlationId, actorId: actor.id, actorRole: actor.roles[0] ?? "executive", action: "email.send.refused",
      resourceType: "email", resourceId: emailId, outcome: decision.outcome, risk,
      policyVersion: decision.policyVersion, matchedRules: decision.matchedRules, aiModel: null, promptVersion: null,
      detail: decision.reason,
    });
    throw new TriageError(decision.reason, 409);
  }

  const approval = saveApproval({
    id: nextId("ap"), action: "email.send", subjectType: "email_reply", subjectId: emailId,
    title: `Reply to ${personById(message.fromId)?.name ?? "sender"}`,
    proposedContent: body, risk, decision, currentStep: 0, status: "awaiting_approval",
    contentVersion: 0, executionClaimed: false, requestedFor: message.mailboxOwnerId,
    createdAt: new Date().toISOString(), history: [],
  });
  recordAudit({
    correlationId, actorId: actor.id, actorRole: actor.roles[0] ?? "executive", action: "approval.requested",
    resourceType: "approval", resourceId: approval.id, outcome: "awaiting_approval", risk,
    policyVersion: decision.policyVersion, matchedRules: decision.matchedRules, aiModel: null, promptVersion: null,
    detail: `Reply to message ${emailId} awaiting confirmation. ${decision.reason}`,
  });

  // Pressing Send is this actor's decision on the current step, checked by
  // the same gate the Approvals queue uses. Anyone else in the chain (a
  // finance reviewer on a medium-risk reply) still has to act.
  const authz = authorizeApprovalStep(actor, approval);
  const decided = authz.ok
    ? decideApproval({ id: approval.id, actorId: actor.id, actorRole: actor.roles[0] ?? "executive", outcome: "approved", note: "Confirmed with Send." })
    : approval;
  if (authz.ok) {
    recordAudit({
      correlationId, actorId: actor.id, actorRole: actor.roles[0] ?? "executive", action: "approval.approved",
      resourceType: "approval", resourceId: approval.id, outcome: decided.status, risk,
      policyVersion: decision.policyVersion, matchedRules: decision.matchedRules, aiModel: null, promptVersion: null,
      detail: `${actor.name} confirmed the reply with Send.`,
    });
  }
  if (decided.status !== "approved") {
    return { status: "needs_review", approval: decided, reviewers: chain(decided) };
  }
  const reply = await executeReply(decided, actor, kind, correlationId);
  return { status: "sent", reply, approvalId: decided.id };
}

function chain(approval: ApprovalRequest): string[] {
  return approval.decision.approvalChain.slice(approval.currentStep).map((step) => step.label);
}

/**
 * Writes the reply to the synthetic Sent folder. Called once the approval's
 * last step clears, from here or from the approval gate, and at most once.
 */
export async function executeReply(approval: ApprovalRequest, actor: Person, kind: "full" | "quick", correlationId = nextId("cor")): Promise<SentReply> {
  if (approval.subjectType !== "email_reply" || approval.status !== "approved") {
    throw new TriageError("This reply has not been approved.", 409);
  }
  if (!claimExecution(approval.id)) throw new TriageError("This reply was already sent.", 409);
  return performReplySend(approval, actor, kind, correlationId);
}

/** The connector write itself. The caller must already hold the execution claim. */
export async function performReplySend(approval: ApprovalRequest, actor: Person, kind: "full" | "quick", correlationId: string): Promise<SentReply> {
  const draft = await mail.createReplyDraft({ messageId: approval.subjectId, body: approval.proposedContent, approvalId: approval.id });
  const { sentAt } = await mail.sendDraft({ draftId: draft.draftId, approvalId: approval.id });
  const reply: SentReply = {
    id: nextId("sent"), emailId: approval.subjectId, actorId: actor.id, body: approval.proposedContent,
    kind, approvalId: approval.id, sentAt,
  };
  store.sent = new Map(store.sent).set(reply.id, reply);
  saveApproval({ ...approval, status: "completed", executionClaimed: true });
  recordAudit({
    correlationId, actorId: actor.id, actorRole: actor.roles[0] ?? "executive", action: "connector.mail.send",
    resourceType: "email", resourceId: approval.subjectId, outcome: "completed", risk: approval.risk,
    policyVersion: approval.decision.policyVersion, matchedRules: approval.decision.matchedRules,
    aiModel: null, promptVersion: null,
    // Audit lines carry identifiers, never the reply text.
    detail: `Reply ${reply.id} written to the synthetic Sent folder under approval ${approval.id}. Nothing left the demo.`,
  });
  return reply;
}

export function sentReplies(actor: Person): SentReply[] {
  return [...store.sent.values()].filter((reply) => reply.actorId === actor.id).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

async function readableOrThrow(actor: Person, emailId: string): Promise<EmailMessage> {
  const message = await mail.getMessage(emailId);
  if (!message) throw new TriageError("Message not found.", 404);
  const gate = canReadMessage(actor, message);
  if (!gate.ok) throw new TriageError(gate.decision.reason, 403);
  return message;
}
