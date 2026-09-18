import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { MemoryCategorySchema } from "@/core/contracts";
import {
  MemoryPromotionError,
  WorkspaceAccessError,
  promote,
} from "@/core/services/workspace";
import { actorFromRequest } from "@/core/session";
import { recordAudit } from "@/core/store";

type Ctx = { params: Promise<{ id: string }> };

/** Saving is always an explicit act. The route never infers one. */
async function handlePOST(req: Request, ctx: Ctx) {
  const actor = actorFromRequest(req);
  const { id } = await ctx.params;

  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed === "object" && parsed !== null) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    raw = {};
  }

  const category = MemoryCategorySchema.safeParse(raw.category);
  if (!category.success) {
    return NextResponse.json(
      { error: "Provide one of the four memory categories." },
      { status: 400 },
    );
  }

  try {
    const entry = promote({
      workspaceId: id,
      actorId: actor.id,
      category: category.data,
      content: String(raw.content ?? ""),
      sourceMessageId:
        typeof raw.sourceMessageId === "string" ? raw.sourceMessageId : null,
      explicitSave: raw.explicitSave === true,
    });

    recordAudit({
      correlationId: id,
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      action: "workspace.memory_saved",
      resourceType: "memory_entry",
      resourceId: entry.id,
      outcome: "saved",
      risk: "low",
      policyVersion: null,
      matchedRules: [],
      aiModel: null,
      promptVersion: null,
      // Category and provenance only. The content itself is not audited.
      detail: `Saved to ${entry.category} by an explicit save action.`,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof MemoryPromotionError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

export const POST = withDemoState(handlePOST);
