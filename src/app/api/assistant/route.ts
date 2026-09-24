import { NextResponse } from "next/server";
import { withDemoState } from "@/core/persistence";
import { actorFromRequest } from "@/core/session";
import { ChatRequestSchema } from "@/core/contracts";
import { respond } from "@/core/services/chat";
import { store } from "@/core/store";
import { readJsonBody } from "@/core/deployment/request";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Per demo session. The chat is now the main surface, so this is a cost guard, not a feature limit. */
const MAX_QUESTIONS = 200;

async function handlePOST(req: Request) {
  const actor = actorFromRequest(req);
  let body: unknown;
  try { body = await readJsonBody(req, 8192); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === "Request is too large." ? error.message : "Invalid JSON request." }, { status: error instanceof Error && error.message === "Request is too large." ? 413 : 400 }); }
  const parsed = ChatRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ask a question of 2–500 characters." }, { status: 400 });
  if (store.assistantRequests >= MAX_QUESTIONS) return NextResponse.json({ error: "This demo session has reached its question limit. Sign out and back in to start a fresh session." }, { status: 429 });
  store.assistantRequests += 1;
  const result = await respond(actor, parsed.data.question, parsed.data.context ?? null);
  // Nothing in a chat turn books, sends, or approves. Those are separate routes.
  return NextResponse.json({ ...result, readOnly: true });
}

export const POST = withDemoState(handlePOST);
