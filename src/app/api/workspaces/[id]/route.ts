import { NextResponse } from "next/server";
import { WorkspaceAccessError, read, remove } from "@/core/services/workspace";
import { actorFromRequest } from "@/core/session";
import { recordAudit } from "@/core/store";

type Ctx = { params: Promise<{ id: string }> };

function refuse(actorId: string, actorRole: Parameters<typeof recordAudit>[0]["actorRole"], id: string, message: string) {
  recordAudit({
    correlationId: id,
    actorId,
    actorRole,
    action: "workspace.read",
    resourceType: "workspace",
    resourceId: id,
    outcome: "denied",
    risk: "low",
    policyVersion: null,
    matchedRules: [],
    aiModel: null,
    promptVersion: null,
    detail: "Access refused: workspaces are private to their owner.",
  });
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function GET(req: Request, ctx: Ctx) {
  const actor = actorFromRequest(req);
  const { id } = await ctx.params;
  try {
    return NextResponse.json(read(id, actor.id));
  } catch (error: unknown) {
    if (error instanceof WorkspaceAccessError) {
      return refuse(actor.id, actor.roles[0] ?? "executive", id, error.message);
    }
    throw error;
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const actor = actorFromRequest(req);
  const { id } = await ctx.params;
  try {
    remove(id, actor.id);
    return NextResponse.json({ deleted: id });
  } catch (error: unknown) {
    if (error instanceof WorkspaceAccessError) {
      return refuse(actor.id, actor.roles[0] ?? "executive", id, error.message);
    }
    throw error;
  }
}
