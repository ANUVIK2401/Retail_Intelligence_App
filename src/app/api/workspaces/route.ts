import { NextResponse } from "next/server";
import { create, listForActor } from "@/core/services/workspace";
import { actorFromRequest } from "@/core/session";
import { recordAudit } from "@/core/store";

/** Workspaces are listed for the acting identity only. */
export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  return NextResponse.json({ workspaces: listForActor(actor.id) });
}

export async function POST(req: Request) {
  const actor = actorFromRequest(req);

  let title = "Untitled workspace";
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed === "object" && parsed !== null && "title" in parsed) {
      title = String((parsed as { title: unknown }).title ?? title);
    }
  } catch {
    /* default title */
  }

  const ws = create(actor.id, title);

  recordAudit({
    correlationId: ws.id,
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    action: "workspace.create",
    resourceType: "workspace",
    resourceId: ws.id,
    outcome: "created",
    risk: "low",
    policyVersion: null,
    matchedRules: [],
    aiModel: null,
    promptVersion: null,
    detail: "Private workspace created for the acting identity.",
  });

  return NextResponse.json({ workspace: ws }, { status: 201 });
}
