import { NextResponse } from "next/server";
import { z } from "zod";
import { withDemoState } from "@/core/persistence";
import { actorFromRequest } from "@/core/session";
import { answerFromFacts } from "@/core/assistant/facts";
import { classifyQuestion } from "@/core/assistant/model";
import { store } from "@/core/store";
import { readJsonBody } from "@/core/deployment/request";

export const runtime = "nodejs";
export const maxDuration = 30;

const AskSchema = z.object({ question: z.string().trim().min(2).max(500) }).strict();

async function handlePOST(req: Request) {
  const actor = actorFromRequest(req);
  let body: unknown;
  try { body = await readJsonBody(req, 2048); }
  catch (error) { return NextResponse.json({ error: error instanceof Error && error.message === "Request is too large." ? error.message : "Invalid JSON request." }, { status: error instanceof Error && error.message === "Request is too large." ? 413 : 400 }); }
  const parsed = AskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Ask a question of 2–500 characters." }, { status: 400 });
  if (store.assistantRequests >= 30) return NextResponse.json({ error: "This demo session has reached its assistant question limit." }, { status: 429 });
  store.assistantRequests += 1;
  const intent = await classifyQuestion(parsed.data.question);
  const facts = await answerFromFacts(actor, parsed.data.question, intent.source);
  return NextResponse.json({ ...facts, model: intent.model, readOnly: true });
}

export const POST = withDemoState(handlePOST);
