import {
  RISK_ORDER,
  type Action,
  type PolicyDecision,
  type PolicyRule,
  type ReviewerDomain,
  type RiskLevel,
  type Role,
  type Topic,
} from "@/core/contracts";
import {
  DELEGATIONS,
  RESTRICTED_ACCESS,
  isDirectReport,
  levelDifference,
  personById,
} from "@/data/org";

export const POLICY_VERSION = "2026-09-16.v1";

/**
 * The deterministic policy engine.
 *
 * This function is pure: same inputs, same decision, every time. It never
 * calls a model and it never reads model output except as a risk *input* that
 * has already been floored by deterministic rules.
 *
 * No other module is permitted to decide whether an action may proceed.
 */

export type PolicyContext = {
  action: Action;
  /** Who is asking. */
  actorId: string;
  actorRole: Role;
  /** Whose resource is being acted on (mailbox owner, calendar owner). */
  resourceOwnerId: string;
  risk: RiskLevel;
  topic: Topic;
  /** For scheduling: who is requesting time with the resource owner. */
  requesterId?: string;
  /** For scheduling: whether any attendee is outside the tenant. */
  hasExternalAttendee?: boolean;
  /** For scheduling: meeting marked confidential by the requester. */
  confidential?: boolean;
  /** Rule on/off state from the Control Center. */
  ruleState?: Record<string, boolean>;
};

/* ------------------------------------------------------------------ */
/* Rule catalogue — the client-visible surface of the Control Center   */
/* ------------------------------------------------------------------ */

export const POLICY_RULES: PolicyRule[] = [
  {
    id: "P-RESTRICTED-ALLOWLIST",
    description:
      "Restricted topics are visible only to a named group. Role and seniority do not grant access.",
    enabled: true,
    category: "access",
    editable: false,
  },
  {
    id: "P-HIGH-NO-AUTODRAFT",
    description:
      "High-risk messages are never auto-drafted. They are escalated to the executive and the matching reviewer.",
    enabled: true,
    category: "email",
    editable: false,
  },
  {
    id: "P-NO-AUTOSEND",
    description:
      "No email is ever sent without an explicit human approval, at any risk level.",
    enabled: true,
    category: "email",
    editable: false,
  },
  {
    id: "P-MEDIUM-APPROVAL",
    description:
      "Medium-risk replies may be drafted but require executive or delegated approval before sending.",
    enabled: true,
    category: "email",
    editable: true,
  },
  {
    id: "P-LOW-DELEGATE",
    description:
      "Low-risk replies may be cleared by a delegated executive assistant.",
    enabled: true,
    category: "email",
    editable: true,
  },
  {
    id: "P-SCHED-DIRECT-REPORT",
    description:
      "Direct reports may propose time with the executive without going through the assistant.",
    enabled: true,
    category: "scheduling",
    editable: true,
  },
  {
    id: "P-SCHED-TWO-LEVELS",
    description:
      "Requests from two or more levels below the executive are routed through the executive assistant.",
    enabled: true,
    category: "scheduling",
    editable: true,
  },
  {
    id: "P-SCHED-FREEBUSY-ONLY",
    description:
      "Meeting subjects and attendees are never exposed. Only free/busy status is retrieved.",
    enabled: true,
    category: "scheduling",
    editable: false,
  },
  {
    id: "P-SCHED-CONFIDENTIAL",
    description:
      "Meetings marked confidential require the executive's own approval and are not delegated.",
    enabled: true,
    category: "scheduling",
    editable: true,
  },
  {
    id: "P-SCHED-OWNER-CHANGE",
    description:
      "Calendar changes are made by the calendar owner; changes on another person's calendar require a separate approval workflow.",
    enabled: true,
    category: "scheduling",
    editable: false,
  },
  {
    id: "P-PUBLISH-REVIEW-CHAIN",
    description:
      "External publication requires communications review, then executive approval. Legal review is added for regulated claims.",
    enabled: true,
    category: "publishing",
    editable: true,
  },
  {
    id: "P-PUBLISH-NO-DIRECT",
    description:
      "The prototype never publishes to an external platform. Approved content is exported for a human to post.",
    enabled: true,
    category: "publishing",
    editable: false,
  },
  {
    id: "P-INSIGHT-APPROVED-SOURCES",
    description:
      "Insights are generated only from approved sources, filtered by the executive's function.",
    enabled: true,
    category: "insights",
    editable: false,
  },
];

const REVIEWER_FOR_TOPIC: Partial<Record<Topic, ReviewerDomain>> = {
  crisis_incident: "crisis",
  legal_matter: "legal",
  media_inquiry: "communications",
  financial_approval: "finance",
  external_communication: "communications",
};

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  const enabled = (id: string) => ctx.ruleState?.[id] ?? true;
  const matched: string[] = [];

  const decide = (
    outcome: PolicyDecision["outcome"],
    reason: string,
    chain: PolicyDecision["approvalChain"] = [],
  ): PolicyDecision => ({
    action: ctx.action,
    outcome,
    approvalChain: chain,
    reason,
    matchedRules: matched,
    policyVersion: POLICY_VERSION,
  });

  /* 1. Restricted access gate — runs before everything, for every action. */
  if (ctx.risk === "restricted") {
    matched.push("P-RESTRICTED-ALLOWLIST");
    const allowed = RESTRICTED_ACCESS[ctx.topic] ?? RESTRICTED_ACCESS["confidential_strategy"];
    if (!allowed.includes(ctx.actorId)) {
      return decide(
        "deny",
        "This matter is restricted to a named group. Your account is not on that list, so the content and any action on it are unavailable.",
      );
    }
    if (ctx.action !== "email.read" && ctx.action !== "email.summarize") {
      return decide(
        "block_and_escalate",
        "Restricted matters are handled personally. The assistant will not draft, schedule, or send anything on this thread.",
        [{ kind: "executive", reviewerDomain: null, label: "Handle personally" }],
      );
    }
    return decide(
      "allow",
      "You are on the named access list for this matter. Summary only; no automated action is available.",
    );
  }

  switch (ctx.action) {
    case "email.read":
    case "email.summarize":
      return decide("allow", "Reading and summarizing is permitted for this mailbox.");

    case "email.draft":
      return evaluateDraft(ctx, matched, decide, enabled);

    case "email.send":
      matched.push("P-NO-AUTOSEND");
      if (RISK_ORDER[ctx.risk] >= RISK_ORDER.high) {
        return decide(
          "block_and_escalate",
          "High-risk messages are not sent by the assistant under any approval path. This needs a person to respond directly.",
          escalationChain(ctx),
        );
      }
      return decide(
        "require_approval",
        "No message is sent without an explicit human approval.",
        approverChain(ctx),
      );

    case "calendar.read_freebusy":
      matched.push("P-SCHED-FREEBUSY-ONLY");
      return decide(
        "allow",
        "Free/busy availability only. Meeting subjects and attendees are not retrieved.",
      );

    case "calendar.read_details":
      matched.push("P-SCHED-FREEBUSY-ONLY");
      if (ctx.actorId === ctx.resourceOwnerId || hasDelegation(ctx.actorId, ctx.resourceOwnerId, "calendar.read_details")) {
        return decide("allow", "You own this calendar or hold an explicit delegation.");
      }
      return decide(
        "deny",
        "Calendar details are not exposed outside the owner and their delegated assistant.",
      );

    case "calendar.propose":
      return evaluateSchedulingProposal(ctx, matched, decide, enabled);

    case "calendar.create_event":
      if (ctx.confidential && enabled("P-SCHED-CONFIDENTIAL")) {
        matched.push("P-SCHED-CONFIDENTIAL");
        return decide(
          "require_approval",
          "Confidential meetings are confirmed by the executive personally and are not delegated.",
          [{ kind: "executive", reviewerDomain: null, label: "Executive approval" }],
        );
      }
      if (ctx.actorId === ctx.resourceOwnerId) {
        return decide("allow", "You are booking on your own calendar.");
      }
      return decide(
        "require_approval",
        "Calendar writes on another person's calendar require their approval or a delegated assistant's confirmation.",
        approverChain(ctx),
      );

    case "calendar.update_event":
      matched.push("P-SCHED-OWNER-CHANGE");
      if (ctx.actorId === ctx.resourceOwnerId && ctx.risk === "low") {
        return decide("allow", "You are moving a routine event on your own calendar.");
      }
      return decide(
        "require_approval",
        "Changes to another person's calendar or a sensitive event require a separate approval workflow.",
        [{ kind: "executive", reviewerDomain: null, label: "Calendar owner approval" }],
      );

    case "insight.generate":
      matched.push("P-INSIGHT-APPROVED-SOURCES");
      return decide(
        "allow",
        "Generated from approved sources filtered to your function. Every claim carries a citation.",
      );

    case "publication.draft":
      return decide("allow", "Drafting external content is permitted. Publishing is not.");

    case "publication.publish": {
      matched.push("P-PUBLISH-NO-DIRECT", "P-PUBLISH-REVIEW-CHAIN");
      return decide(
        "require_approval",
        "External content clears communications review and then executive approval. The prototype exports the approved text rather than posting it.",
        [
          { kind: "reviewer", reviewerDomain: "communications", label: "Communications review" },
          ...(ctx.topic === "legal_matter" || ctx.topic === "financial_approval"
            ? [{ kind: "reviewer" as const, reviewerDomain: "legal" as const, label: "Legal review" }]
            : []),
          { kind: "executive" as const, reviewerDomain: null, label: "Executive approval" },
        ],
      );
    }

    default:
      return decide(
        "block_and_escalate",
        "No policy covers this action, so it is blocked pending an administrator decision.",
      );
  }
}

/* ------------------------------------------------------------------ */

function evaluateDraft(
  ctx: PolicyContext,
  matched: string[],
  decide: (
    outcome: PolicyDecision["outcome"],
    reason: string,
    chain?: PolicyDecision["approvalChain"],
  ) => PolicyDecision,
  enabled: (id: string) => boolean,
): PolicyDecision {
  if (RISK_ORDER[ctx.risk] >= RISK_ORDER.high) {
    matched.push("P-HIGH-NO-AUTODRAFT");
    return decide(
      "block_and_escalate",
      "High-risk matters are not drafted automatically. This is escalated so a person writes the response.",
      escalationChain(ctx),
    );
  }

  if (ctx.risk === "medium" && enabled("P-MEDIUM-APPROVAL")) {
    matched.push("P-MEDIUM-APPROVAL", "P-NO-AUTOSEND");
    return decide(
      "require_approval",
      "A reply can be prepared, but an executive or delegated approver must review it before it goes out.",
      approverChain(ctx),
    );
  }

  matched.push("P-LOW-DELEGATE", "P-NO-AUTOSEND");
  return decide(
    "require_approval",
    "Routine reply prepared. One approval is still required before sending.",
    approverChain(ctx),
  );
}

function evaluateSchedulingProposal(
  ctx: PolicyContext,
  matched: string[],
  decide: (
    outcome: PolicyDecision["outcome"],
    reason: string,
    chain?: PolicyDecision["approvalChain"],
  ) => PolicyDecision,
  enabled: (id: string) => boolean,
): PolicyDecision {
  const requesterId = ctx.requesterId ?? ctx.actorId;
  const owner = personById(ctx.resourceOwnerId);
  const requester = personById(requesterId);

  if (ctx.hasExternalAttendee) {
    matched.push("P-SCHED-FREEBUSY-ONLY");
  }

  if (ctx.confidential && enabled("P-SCHED-CONFIDENTIAL")) {
    matched.push("P-SCHED-CONFIDENTIAL");
    return decide(
      "require_approval",
      "The meeting is marked confidential, so the executive approves it personally.",
      [{ kind: "executive", reviewerDomain: null, label: "Executive approval" }],
    );
  }

  if (!owner || !requester) {
    return decide("block_and_escalate", "Requester or calendar owner is unknown.");
  }

  if (requester.function === "external") {
    matched.push("P-SCHED-TWO-LEVELS");
    return decide(
      "route_through_assistant",
      `External requests are handled by ${assistantName(ctx.resourceOwnerId)}, who confirms before anything is placed on the calendar.`,
      [
        {
          kind: "executive_assistant",
          reviewerDomain: null,
          label: `${assistantName(ctx.resourceOwnerId)} confirms`,
        },
      ],
    );
  }

  if (isDirectReport(requesterId, ctx.resourceOwnerId) && enabled("P-SCHED-DIRECT-REPORT")) {
    matched.push("P-SCHED-DIRECT-REPORT");
    return decide(
      "allow",
      `${requester.name} reports directly to ${owner.name}, so times can be proposed without going through the assistant.`,
    );
  }

  const diff = levelDifference(requesterId, ctx.resourceOwnerId);
  if (diff >= 2 && enabled("P-SCHED-TWO-LEVELS")) {
    matched.push("P-SCHED-TWO-LEVELS");
    return decide(
      "route_through_assistant",
      `${requester.name} is ${diff} levels below ${owner.name}. Company practice routes this through ${assistantName(ctx.resourceOwnerId)} rather than booking directly.`,
      [
        {
          kind: "executive_assistant",
          reviewerDomain: null,
          label: `${assistantName(ctx.resourceOwnerId)} confirms`,
        },
        { kind: "executive", reviewerDomain: null, label: "Executive accepts" },
      ],
    );
  }

  matched.push("P-SCHED-DIRECT-REPORT");
  return decide("allow", "Requester is within one level, so direct proposal is permitted.");
}

/* ------------------------------------------------------------------ */

function escalationChain(ctx: PolicyContext): PolicyDecision["approvalChain"] {
  const domain = REVIEWER_FOR_TOPIC[ctx.topic];
  const chain: PolicyDecision["approvalChain"] = [
    { kind: "executive", reviewerDomain: null, label: "Executive attention" },
  ];
  if (domain) {
    chain.push({
      kind: "reviewer",
      reviewerDomain: domain,
      label: `${domain[0].toUpperCase()}${domain.slice(1)} reviewer`,
    });
  }
  return chain;
}

function approverChain(ctx: PolicyContext): PolicyDecision["approvalChain"] {
  const delegate = DELEGATIONS.find((d) => d.executiveId === ctx.resourceOwnerId);
  if (delegate && ctx.risk === "low" && delegate.maxRisk === "low") {
    return [
      {
        kind: "executive_assistant",
        reviewerDomain: null,
        label: `${personById(delegate.delegateId)?.name ?? "Assistant"} may approve`,
      },
    ];
  }
  // The executive decides first; a functional reviewer then releases it.
  // Reversing this would make the reviewer the decision-maker, which is not
  // how the client's approval authority actually runs.
  const domain = REVIEWER_FOR_TOPIC[ctx.topic];
  const chain: PolicyDecision["approvalChain"] = [
    { kind: "executive", reviewerDomain: null, label: "Executive approval" },
  ];
  if (domain === "finance" && ctx.risk === "medium") {
    chain.push({
      kind: "reviewer",
      reviewerDomain: "finance",
      label: "Finance reviewer releases",
    });
  }
  return chain;
}

function hasDelegation(actorId: string, ownerId: string, action: string): boolean {
  return DELEGATIONS.some(
    (d) =>
      d.delegateId === actorId &&
      d.executiveId === ownerId &&
      d.allowedActions.includes(action),
  );
}

function assistantName(ownerId: string): string {
  const owner = personById(ownerId);
  if (!owner?.assistantId) return "the executive assistant";
  return personById(owner.assistantId)?.name ?? "the executive assistant";
}
