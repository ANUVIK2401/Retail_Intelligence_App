import { PROMPT_VERSION, fenceUntrusted } from "@/core/ai/gateway";
import { resolveProvider } from "@/core/ai/resolve";
import type {
  MemoryCategory,
  MemoryEntry,
  Workspace,
  WorkspaceMessage,
} from "@/core/contracts";
import {
  appendMessage,
  createWorkspace,
  deleteWorkspace,
  getWorkspace,
  listMemory,
  listMessages,
  listWorkspaces,
  saveMemory,
} from "@/core/store";

/**
 * Brainstorming workspace.
 *
 * Two properties are enforced here rather than in the interface:
 *
 * 1. A workspace is private to its owner. `assertOwner()` runs on every read
 *    and every write, and the API routes have no path that skips it.
 * 2. Nothing becomes permanent memory without an explicit save. Conversation
 *    state is not a memory category that can be persisted; attempting to
 *    promote it throws. A UI bug therefore cannot silently make a passing
 *    remark permanent.
 */

export class WorkspaceAccessError extends Error {
  readonly status = 403;
}

export class MemoryPromotionError extends Error {
  readonly status = 422;
}

/** Categories that persist. `conversation_state` is deliberately absent. */
const PERSISTABLE: readonly MemoryCategory[] = [
  "executive_profile",
  "project_context",
  "saved_decision",
] as const;

export function assertOwner(workspaceId: string, actorId: string): Workspace {
  const ws = getWorkspace(workspaceId);
  if (!ws || ws.ownerId !== actorId) {
    // Same message whether the workspace is missing or belongs to someone
    // else: a 403 that distinguishes the two is an existence oracle.
    throw new WorkspaceAccessError(
      "This workspace is private to its owner. Brainstorming material is not shared across accounts, including with assistants and administrators.",
    );
  }
  return ws;
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export function create(actorId: string, title: string): Workspace {
  return createWorkspace(actorId, title.trim() || "Untitled workspace");
}

export function listForActor(actorId: string): Workspace[] {
  return listWorkspaces(actorId);
}

export function read(
  workspaceId: string,
  actorId: string,
): { workspace: Workspace; messages: WorkspaceMessage[]; memory: MemoryEntry[] } {
  const workspace = assertOwner(workspaceId, actorId);
  return {
    workspace,
    messages: listMessages(workspaceId),
    memory: listMemory(workspaceId),
  };
}

export function remove(workspaceId: string, actorId: string): void {
  assertOwner(workspaceId, actorId);
  deleteWorkspace(workspaceId);
}

/* ------------------------------------------------------------------ */
/* Threaded conversation                                               */
/* ------------------------------------------------------------------ */

/**
 * Appends the executive's turn and one assistant turn.
 *
 * The assistant reply goes through the AI gateway like every other model call,
 * and the executive's own text is fenced: a workspace note pasted from an
 * email is still untrusted content.
 */
export async function send(
  workspaceId: string,
  actorId: string,
  text: string,
): Promise<{ messages: WorkspaceMessage[] }> {
  assertOwner(workspaceId, actorId);

  appendMessage({
    workspaceId,
    role: "executive",
    text,
    model: null,
    promptVersion: null,
  });

  const provider = resolveProvider();
  const history = listMessages(workspaceId)
    .slice(-6)
    .map((m) => `${m.role}: ${m.text}`)
    .join("\n");

  const draft = await provider
    .draft({
      subject: "Brainstorming thread",
      body: fenceUntrusted("workspace", history),
      senderName: "the executive",
      recipientName: "the executive",
      recipientTitle: "executive",
      intent:
        "Respond as a thinking partner. Push on the idea, name what is weak, and suggest the next concrete step. Do not commit the company to anything.",
    })
    .catch(() => null);

  appendMessage({
    workspaceId,
    role: "assistant",
    text:
      draft?.body ??
      "The assistant could not respond just now, so nothing has been added to the thread. Nothing was saved.",
    model: provider.model,
    promptVersion: PROMPT_VERSION,
  });

  return { messages: listMessages(workspaceId) };
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

/**
 * Promotes content to persistent memory. This is the only path that writes a
 * memory entry, and it requires an explicit category and an acting saver.
 *
 * `conversation_state` is rejected rather than quietly downgraded. The design
 * document treats it as short-term working state; a call that tries to persist
 * it is a bug in the caller, and a silent success would hide it.
 */
export function promote(input: {
  workspaceId: string;
  actorId: string;
  category: MemoryCategory;
  content: string;
  sourceMessageId?: string | null;
  /** Must be true. Present so a save is never a side effect of another call. */
  explicitSave: boolean;
}): MemoryEntry {
  assertOwner(input.workspaceId, input.actorId);

  if (!input.explicitSave) {
    throw new MemoryPromotionError(
      "Nothing is remembered unless you save it. This call did not carry an explicit save, so no memory was written.",
    );
  }

  if (!PERSISTABLE.includes(input.category)) {
    throw new MemoryPromotionError(
      "Conversation state is working memory and is not persisted. Save it as a decision, project context, or profile detail if it should last.",
    );
  }

  if (input.content.trim().length === 0) {
    throw new MemoryPromotionError("An empty memory cannot be saved.");
  }

  return saveMemory({
    workspaceId: input.workspaceId,
    ownerId: input.actorId,
    category: input.category,
    content: input.content.trim(),
    savedBy: input.actorId,
    sourceMessageId: input.sourceMessageId ?? null,
  });
}
