import { z } from "zod";

/**
 * Shared contracts. Every module in the app — UI, API routes, policy engine,
 * connectors, AI gateway — speaks these types and nothing else.
 *
 * Rule: if a value crosses a module boundary it is defined here first.
 */

/* ------------------------------------------------------------------ */
/* Identity and organization                                           */
/* ------------------------------------------------------------------ */

export const RoleSchema = z.enum([
  "executive",
  "executive_assistant",
  "reviewer",
  "administrator",
  "auditor",
]);
export type Role = z.infer<typeof RoleSchema>;

export const ReviewerDomainSchema = z.enum([
  "legal",
  "crisis",
  "communications",
  "finance",
  "security",
]);
export type ReviewerDomain = z.infer<typeof ReviewerDomainSchema>;

export const PersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  title: z.string(),
  email: z.string(),
  /** 1 = CEO. Used for hierarchy distance checks in scheduling policy. */
  level: z.number().int().min(1),
  managerId: z.string().nullable(),
  /** Business function. Drives insight profiles and reviewer routing. */
  function: z.enum([
    "executive",
    "operations",
    "logistics",
    "finance",
    "marketing",
    "technology",
    "legal",
    "external",
  ]),
  roles: z.array(RoleSchema),
  reviewerDomains: z.array(ReviewerDomainSchema).default([]),
  /** Assistant who gates inbound scheduling requests, if any. */
  assistantId: z.string().nullable().default(null),
  timezone: z.string().default("America/Los_Angeles"),
  workingHours: z
    .object({ startHour: z.number(), endHour: z.number() })
    .default({ startHour: 8, endHour: 18 }),
});
export type Person = z.infer<typeof PersonSchema>;

/** Explicit delegation: assistant may act for an executive within limits. */
export const DelegationSchema = z.object({
  id: z.string(),
  executiveId: z.string(),
  delegateId: z.string(),
  /** Actions the delegate may take without the executive. */
  allowedActions: z.array(z.string()),
  /** Ceiling on risk the delegate may clear alone. */
  maxRisk: z.enum(["low", "medium"]),
});
export type Delegation = z.infer<typeof DelegationSchema>;

/* ------------------------------------------------------------------ */
/* Risk                                                                */
/* ------------------------------------------------------------------ */

export const RiskLevelSchema = z.enum(["low", "medium", "high", "restricted"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  restricted: 3,
};

export const TopicSchema = z.enum([
  "scheduling",
  "routine_operations",
  "financial_approval",
  "report_review",
  "crisis_incident",
  "legal_matter",
  "media_inquiry",
  "confidential_strategy",
  "promotional",
  "external_communication",
  "unknown",
]);
export type Topic = z.infer<typeof TopicSchema>;

export const RiskAssessmentSchema = z.object({
  level: RiskLevelSchema,
  topic: TopicSchema,
  urgency: z.enum(["now", "today", "this_week", "whenever"]),
  /** Plain-language reason shown to the executive. Never optional. */
  reason: z.string().min(1),
  /** Which deterministic rules fired, by id. Shown in the audit trail. */
  triggeredRules: z.array(z.string()),
  /** What the model proposed, before deterministic rules were applied. */
  modelProposed: z
    .object({
      level: RiskLevelSchema,
      topic: TopicSchema,
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    })
    .nullable(),
  /** True when a rule overrode a lower model score. Surfaced in the UI. */
  escalatedByRule: z.boolean(),
  /** True when untrusted content tried to steer the classifier. */
  injectionSuspected: z.boolean().default(false),
});
export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

/* ------------------------------------------------------------------ */
/* Policy                                                              */
/* ------------------------------------------------------------------ */

export const ActionSchema = z.enum([
  "email.read",
  "email.summarize",
  "email.draft",
  "email.send",
  "calendar.read_freebusy",
  "calendar.read_details",
  "calendar.propose",
  "calendar.create_event",
  "insight.generate",
  "publication.draft",
  "publication.publish",
]);
export type Action = z.infer<typeof ActionSchema>;

export const PolicyDecisionSchema = z.object({
  action: ActionSchema,
  outcome: z.enum([
    "allow",
    "require_approval",
    "route_through_assistant",
    "block_and_escalate",
    "deny",
  ]),
  /** Who must sign off, in order. Empty when outcome is allow or deny. */
  approvalChain: z.array(
    z.object({
      kind: z.enum(["executive", "executive_assistant", "reviewer"]),
      reviewerDomain: ReviewerDomainSchema.nullable(),
      label: z.string(),
    }),
  ),
  reason: z.string().min(1),
  /** Ids of the policy rules that produced this outcome. */
  matchedRules: z.array(z.string()),
  policyVersion: z.string(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const PolicyRuleSchema = z.object({
  id: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  /** Client-facing grouping in the Control Center. */
  category: z.enum(["email", "scheduling", "publishing", "access", "insights"]),
  /** Editable by administrators in the prototype UI. */
  editable: z.boolean().default(true),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

export const EmailMessageSchema = z.object({
  id: z.string(),
  /** Id in the source system. No mailbox is copied wholesale. */
  externalId: z.string(),
  mailboxOwnerId: z.string(),
  fromId: z.string(),
  toIds: z.array(z.string()),
  subject: z.string(),
  receivedAt: z.string(),
  /** Plain text only. HTML is stripped at the connector boundary. */
  body: z.string(),
  hasAttachments: z.boolean().default(false),
  /** Set by the connector when the sender is outside the tenant. */
  external: z.boolean().default(false),
});
export type EmailMessage = z.infer<typeof EmailMessageSchema>;

export const EmailAssessmentSchema = z.object({
  emailId: z.string(),
  summary: z.string(),
  actionItems: z.array(z.string()),
  entities: z.object({
    people: z.array(z.string()),
    amounts: z.array(z.string()),
    deadlines: z.array(z.string()),
    locations: z.array(z.string()),
  }),
  risk: RiskAssessmentSchema,
  /** Decision for drafting a reply to this message. */
  draftDecision: PolicyDecisionSchema,
  suggestedReply: z.string().nullable(),
  assessedAt: z.string(),
  promptVersion: z.string(),
  model: z.string(),
});
export type EmailAssessment = z.infer<typeof EmailAssessmentSchema>;

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

/**
 * Free/busy only. There is deliberately no `subject` field: the prototype
 * must not be able to leak meeting titles even by accident.
 */
export const BusyBlockSchema = z.object({
  personId: z.string(),
  start: z.string(),
  end: z.string(),
  status: z.enum(["busy", "tentative", "out_of_office"]),
});
export type BusyBlock = z.infer<typeof BusyBlockSchema>;

export const MeetingRequestSchema = z.object({
  requesterId: z.string(),
  attendeeIds: z.array(z.string()).min(1),
  purpose: z.string(),
  durationMinutes: z.number().int().positive(),
  sensitivity: z.enum(["normal", "confidential"]).default("normal"),
  earliest: z.string(),
  latest: z.string(),
});
export type MeetingRequest = z.infer<typeof MeetingRequestSchema>;

export const ProposedSlotSchema = z.object({
  start: z.string(),
  end: z.string(),
  score: z.number(),
  rationale: z.string(),
});
export type ProposedSlot = z.infer<typeof ProposedSlotSchema>;

export const MeetingProposalSchema = z.object({
  id: z.string(),
  request: MeetingRequestSchema,
  slots: z.array(ProposedSlotSchema),
  decision: PolicyDecisionSchema,
  status: z.enum([
    "proposed",
    "awaiting_approval",
    "approved",
    "rejected",
    "expired",
  ]),
  createdAt: z.string(),
});
export type MeetingProposal = z.infer<typeof MeetingProposalSchema>;

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export const ApprovalStatusSchema = z.enum([
  "proposed",
  "awaiting_approval",
  "approved",
  "rejected",
  "expired",
  "executing",
  "completed",
  "failed",
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  action: ActionSchema,
  subjectType: z.enum(["email_draft", "meeting_proposal", "publication"]),
  subjectId: z.string(),
  title: z.string(),
  /** What will actually happen if this is approved. */
  proposedContent: z.string(),
  risk: RiskLevelSchema,
  decision: PolicyDecisionSchema,
  /** Index into decision.approvalChain of the pending step. */
  currentStep: z.number().int(),
  status: ApprovalStatusSchema,
  /** Bumped whenever proposedContent changes. Approvals bind to a version. */
  contentVersion: z.number().int().default(0),
  /** Set once, by claimExecution(). Makes execution idempotent. */
  executionClaimed: z.boolean().default(false),
  requestedFor: z.string(),
  createdAt: z.string(),
  history: z.array(
    z.object({
      at: z.string(),
      actorId: z.string(),
      actorRole: RoleSchema,
      outcome: z.enum(["approved", "rejected", "edited", "escalated"]),
      note: z.string().nullable(),
    }),
  ),
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export const AuditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  correlationId: z.string(),
  actorId: z.string(),
  actorRole: RoleSchema,
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string(),
  outcome: z.string(),
  risk: RiskLevelSchema.nullable(),
  policyVersion: z.string().nullable(),
  matchedRules: z.array(z.string()).default([]),
  aiModel: z.string().nullable(),
  promptVersion: z.string().nullable(),
  /** Short, non-sensitive. Full content lives in the evidence store. */
  detail: z.string(),
});
export type AuditEvent = z.infer<typeof AuditEventSchema>;

/* ------------------------------------------------------------------ */
/* Insights, workspaces, publishing (module 4-6 surface)               */
/* ------------------------------------------------------------------ */

export const InsightSchema = z.object({
  id: z.string(),
  function: z.string(),
  headline: z.string(),
  body: z.string(),
  citations: z.array(z.object({ sourceId: z.string(), label: z.string() })),
  generatedAt: z.string(),
});
export type Insight = z.infer<typeof InsightSchema>;

export const PublicationDraftSchema = z.object({
  id: z.string(),
  channel: z.enum(["linkedin", "substack", "instagram", "internal"]),
  authorId: z.string(),
  title: z.string(),
  body: z.string(),
  checks: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      detail: z.string(),
    }),
  ),
  decision: PolicyDecisionSchema,
  status: ApprovalStatusSchema,
});
export type PublicationDraft = z.infer<typeof PublicationDraftSchema>;

/* ------------------------------------------------------------------ */
/* Workspaces and memory (B9)                                          */
/* ------------------------------------------------------------------ */

/**
 * The four memory categories from the design document. The distinction that
 * matters is `scope`: `conversation` is transient working state, everything
 * else persists, and nothing crosses that line without an explicit save.
 */
export const MemoryCategorySchema = z.enum([
  /** Long-term, user editable. Survives every project. */
  "executive_profile",
  /** Lives as long as the project does. */
  "project_context",
  /** Short-term working state. Never persisted on its own. */
  "conversation_state",
  /** A decision that holds until the executive changes it. */
  "saved_decision",
]);
export type MemoryCategory = z.infer<typeof MemoryCategorySchema>;

export const MemoryEntrySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  ownerId: z.string(),
  category: MemoryCategorySchema,
  content: z.string().min(1),
  /** Who saved it and when. A memory with no save has no provenance. */
  savedBy: z.string(),
  savedAt: z.string(),
  /** Message this was promoted from, when it came from the thread. */
  sourceMessageId: z.string().nullable().default(null),
});
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const WorkspaceMessageSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  role: z.enum(["executive", "assistant"]),
  text: z.string().min(1),
  at: z.string(),
  /** Set on assistant turns so the thread is attributable. */
  model: z.string().nullable().default(null),
  promptVersion: z.string().nullable().default(null),
});
export type WorkspaceMessage = z.infer<typeof WorkspaceMessageSchema>;

export const WorkspaceSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  title: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Workspace = z.infer<typeof WorkspaceSchema>;
