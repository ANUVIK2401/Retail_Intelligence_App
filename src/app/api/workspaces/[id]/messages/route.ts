import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { WorkspaceAccessError, send } from "@/core/services/workspace";
import { actorFromRequest } from "@/core/session";

type Ctx = { params: Promise<{ id: string }> };

async function handlePOST(req: Request, ctx: Ctx) {
  const actor = actorFromRequest(req);
  const { id } = await ctx.params;

  let text = "";
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed === "object" && parsed !== null && "text" in parsed) {
      text = String((parsed as { text: unknown }).text ?? "").trim();
    }
  } catch {
    text = "";
  }

  if (text.length === 0) {
    return NextResponse.json({ error: "A message cannot be empty." }, { status: 400 });
  }

  try {
    return NextResponse.json(await send(id, actor.id, text));
  } catch (error: unknown) {
    if (error instanceof WorkspaceAccessError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export const POST = withDemoState(handlePOST);
