import { AsyncLocalStorage } from "node:async_hooks";
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

export type State = {
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
    provider: "mock" | "anthropic" | "openai";
  };
  mockDrafts: Map<string, { messageId: string; body: string; sentAt?: string }>;
  mockEvents: Map<string, { eventId: string; ownerId: string; attendeeIds?: string[]; start: string; end: string; subject: string }>;
  assistantRequests: number;
  seq: number;
};

export function freshState(): State {
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
      provider: process.env.AI_PROVIDER === "anthropic" ? "anthropic" : process.env.AI_PROVIDER === "openai" ? "openai" : "mock",
    },
    mockDrafts: new Map(),
    mockEvents: new Map(),
    assistantRequests: 0,
    seq: 0,
  };
}

export const stateContext = new AsyncLocalStorage<State>();
let localState = freshState();
function currentState(): State {
  const state = stateContext.getStore();
  if (state) return state;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo state must be accessed inside a session transaction.");
  }
  return localState;
}
export const store: State = new Proxy({} as State, {
  get: (_target, key) => Reflect.get(currentState(), key),
  set: (_target, key, value) => Reflect.set(currentState(), key, value),
});

export function nextId(prefix: string): string {
  store.seq += 1;
  return `${prefix}_${store.seq.toString().padStart(4, "0")}`;
}

export function resetStore(): void {
  const active = stateContext.getStore();
  if (active) Object.assign(active, freshState());
  else localState = freshState();
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
  const original = store.approvals.get(input.id);
  if (!original) throw new Error("Unknown approval request.");

  // Only a request that is still awaiting a decision may receive one. The
  // earlier version of this check listed approved/rejected, which let a
  // `completed` request re-enter the chain and execute a second time: one
  // approval, two drafts. Terminal states are enumerated rather than
  // excluded so a new status cannot silently become re-approvable.
  const DECIDABLE = new Set(["proposed", "awaiting_approval"]);
  if (!DECIDABLE.has(original.status)) {
    throw new Error(
      `This request is ${original.status} and can no longer be decided. Start a new request if something needs to change.`,
    );
  }

  // Publication checks determine the reviewer chain from the exact text. A
  // change could require Legal or block export entirely, so edits need a new
  // request and a fresh check before any reviewer may clear them.
  if (original.subjectType === "publication" && input.editedContent !== undefined) {
    throw new Error("Publication content changed. Edit the draft and start a new review request.");
  }

  const contentChanged = input.editedContent !== undefined && input.editedContent !== original.proposedContent;
  const approval: ApprovalRequest = {
    ...original,
    history: [...original.history, {
      at: new Date().toISOString(),
      actorId: input.actorId,
      actorRole: input.actorRole,
      outcome: contentChanged ? "edited" : input.outcome,
      note: input.note ?? null,
    }],
  };

  // A changed draft cannot also count as this step's approval. The review
  // starts over, including the person who originally cleared the first step.
  if (contentChanged) {
    approval.proposedContent = input.editedContent!;
    approval.contentVersion = original.contentVersion + 1;
    approval.currentStep = 0;
    approval.status = "awaiting_approval";
    if (original.currentStep > 0) {
      approval.history = [...approval.history, {
        at: new Date().toISOString(),
        actorId: input.actorId,
        actorRole: input.actorRole,
        outcome: "escalated",
        note: "Content was edited, so previously collected approvals no longer apply and the chain restarted.",
      }];
    }
    store.approvals.set(approval.id, approval);
    return approval;
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

/**
 * Atomically claims the right to execute an approval exactly once.
 *
 * Returns true for the first caller and false for every caller after it. The
 * check and the flip happen with no await between them, which is what makes
 * this safe on Node's single-threaded event loop; a database implementation
 * would use a conditional update on the same field.
 */
export function claimExecution(id: string): boolean {
  const approval = store.approvals.get(id);
  if (!approval) return false;
  if (approval.executionClaimed) return false;
  approval.executionClaimed = true;
  store.approvals.set(id, approval);
  return true;
}
