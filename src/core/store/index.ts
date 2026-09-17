import type {
  ApprovalRequest,
  AuditEvent,
  EmailAssessment,
  MeetingProposal,
  MemoryEntry,
  PublicationDraft,
  Role,
  Workspace,
  WorkspaceMessage,
} from "@/core/contracts";
import { POLICY_RULES } from "@/core/policy/engine";

/**
 * In-memory store.
 *
 * Deliberate choice for the prototype: no database, so the demo starts from a
 * known state every time and there is no executive data at rest anywhere.
 * The repository functions below are the seam — swapping them for SQLAlchemy
 * or Prisma is a change to this file only.
 */

type State = {
  assessments: Map<string, EmailAssessment>;
  approvals: Map<string, ApprovalRequest>;
  proposals: Map<string, MeetingProposal>;
  publications: Map<string, PublicationDraft>;
  audit: AuditEvent[];
  workspaces: Map<string, Workspace>;
  /** Messages keyed by workspace id, in arrival order. */
  messages: Map<string, WorkspaceMessage[]>;
  /** Persistent memory keyed by workspace id. */
  memory: Map<string, MemoryEntry[]>;
  ruleState: Record<string, boolean>;
  /** Demo switches exposed in the Control Center. */
  settings: {
    /** Simulate a model that has been manipulated into reporting everything safe. */
    simulateCompromisedModel: boolean;
    /** Which provider the gateway resolves to. */
    provider: "mock" | "anthropic";
  };
  seq: number;
};

function freshState(): State {
  return {
    assessments: new Map(),
    approvals: new Map(),
    proposals: new Map(),
    publications: new Map(),
    audit: [],
    workspaces: new Map(),
    messages: new Map(),
    memory: new Map(),
    ruleState: Object.fromEntries(POLICY_RULES.map((r) => [r.id, r.enabled])),
    settings: {
      simulateCompromisedModel: false,
      provider: process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock",
    },
    seq: 0,
  };
}

const globalRef = globalThis as unknown as { __ecc_state?: State };
export const store: State = (globalRef.__ecc_state ??= freshState());

export function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}_${store.seq.toString().padStart(4, "0")}`;
}

export function resetStore(): void {
  globalRef.__ecc_state = freshState();
  Object.assign(store, globalRef.__ecc_state);
}

/* ------------------------------------------------------------------ */
/* Audit                                                               */
/* ------------------------------------------------------------------ */

export function recordAudit(event: Omit<AuditEvent, "id" | "at">): AuditEvent {
  const full: AuditEvent = {
    ...event,
    id: nextId("au"),
    at: new Date().toISOString(),
  };
  store.audit.unshift(full);
  return full;
}

export function listAudit(limit = 200): AuditEvent[] {
  return store.audit.slice(0, limit);
}

/* ------------------------------------------------------------------ */
/* Approvals                                                           */
/* ------------------------------------------------------------------ */

export function saveApproval(a: ApprovalRequest): ApprovalRequest {
  store.approvals.set(a.id, a);
  return a;
}

export function getApproval(id: string): ApprovalRequest | undefined {
  return store.approvals.get(id);
}

export function listApprovals(): ApprovalRequest[] {
  return [...store.approvals.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/**
 * Advances one step of the approval chain. Approval is per-step: clearing the
 * last step is what moves the request to `approved`.
 */
export function decideApproval(input: {
  id: string;
  actorId: string;
  actorRole: Role;
  outcome: "approved" | "rejected" | "edited" | "escalated";
  note?: string;
  editedContent?: string;
}): ApprovalRequest {
  const approval = store.approvals.get(input.id);
  if (!approval) throw new Error("Unknown approval request.");
  if (approval.status === "approved" || approval.status === "rejected") {
    throw new Error("This request has already been decided.");
  }

  approval.history.push({
    at: new Date().toISOString(),
    actorId: input.actorId,
    actorRole: input.actorRole,
    outcome: input.outcome,
    note: input.note ?? null,
  });

  if (input.editedContent !== undefined) {
    approval.proposedContent = input.editedContent;
  }

  if (input.outcome === "rejected") {
    approval.status = "rejected";
  } else if (input.outcome === "escalated") {
    approval.status = "awaiting_approval";
  } else if (input.outcome === "approved") {
    const last = approval.decision.approvalChain.length - 1;
    if (approval.currentStep >= last) {
      approval.status = "approved";
    } else {
      approval.currentStep += 1;
      approval.status = "awaiting_approval";
    }
  }

  store.approvals.set(approval.id, approval);
  return approval;
}

/* ------------------------------------------------------------------ */
/* Assessments and proposals                                           */
/* ------------------------------------------------------------------ */

export function saveAssessment(a: EmailAssessment): EmailAssessment {
  store.assessments.set(a.emailId, a);
  return a;
}

export function getAssessment(emailId: string): EmailAssessment | undefined {
  return store.assessments.get(emailId);
}

export function saveProposal(p: MeetingProposal): MeetingProposal {
  store.proposals.set(p.id, p);
  return p;
}

export function getProposal(id: string): MeetingProposal | undefined {
  return store.proposals.get(id);
}

export function listProposals(): MeetingProposal[] {
  return [...store.proposals.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

/* ------------------------------------------------------------------ */
/* Workspaces, messages, memory                                        */
/* ------------------------------------------------------------------ */

export function createWorkspace(ownerId: string, title: string): Workspace {
  const now = new Date().toISOString();
  const ws: Workspace = {
    id: nextId("ws"),
    ownerId,
    title,
    createdAt: now,
    updatedAt: now,
  };
  store.workspaces.set(ws.id, ws);
  store.messages.set(ws.id, []);
  store.memory.set(ws.id, []);
  return ws;
}

export function getWorkspace(id: string): Workspace | undefined {
  return store.workspaces.get(id);
}

/** Owner-scoped by construction: there is no "list all workspaces". */
export function listWorkspaces(ownerId: string): Workspace[] {
  return [...store.workspaces.values()]
    .filter((w) => w.ownerId === ownerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function deleteWorkspace(id: string): void {
  store.workspaces.delete(id);
  store.messages.delete(id);
  store.memory.delete(id);
}

export function appendMessage(input: Omit<WorkspaceMessage, "id" | "at">): WorkspaceMessage {
  const msg: WorkspaceMessage = {
    ...input,
    id: nextId("wm"),
    at: new Date().toISOString(),
  };
  const thread = store.messages.get(input.workspaceId) ?? [];
  store.messages.set(input.workspaceId, [...thread, msg]);

  const ws = store.workspaces.get(input.workspaceId);
  if (ws) {
    store.workspaces.set(ws.id, { ...ws, updatedAt: msg.at });
  }
  return msg;
}

export function listMessages(workspaceId: string): WorkspaceMessage[] {
  return store.messages.get(workspaceId) ?? [];
}

/**
 * Writes a memory entry. Called only from `services/workspace.promote()`,
 * which is where the explicit-save invariant is enforced.
 */
export function saveMemory(input: Omit<MemoryEntry, "id" | "savedAt">): MemoryEntry {
  const entry: MemoryEntry = {
    ...input,
    id: nextId("mem"),
    savedAt: new Date().toISOString(),
  };
  const existing = store.memory.get(input.workspaceId) ?? [];
  store.memory.set(input.workspaceId, [...existing, entry]);
  return entry;
}

export function listMemory(workspaceId: string): MemoryEntry[] {
  return store.memory.get(workspaceId) ?? [];
}
