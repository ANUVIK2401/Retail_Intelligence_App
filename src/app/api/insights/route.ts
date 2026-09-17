import { NextResponse } from "next/server";
import { evaluatePolicy } from "@/core/policy/engine";
import { answer, RETRIEVAL_VERSION } from "@/core/services/insights";
import { actorFromRequest } from "@/core/session";
import { recordAudit, store } from "@/core/store";
import { CORPUS, INSIGHTS } from "@/data/knowledge";

/**
 * Insights are filtered by the acting person's function before anything is
 * retrieved. Executives see all approved sources; functional leaders see only
 * what their function is cleared for.
 */
function decisionFor(actorId: string, actorRole: Parameters<typeof evaluatePolicy>[0]["actorRole"]) {
  return evaluatePolicy({
    action: "insight.generate",
    actorId,
    actorRole,
    resourceOwnerId: actorId,
    risk: "low",
    topic: "routine_operations",
    ruleState: store.ruleState,
  });
}

export async function GET(req: Request) {
  const actor = actorFromRequest(req);
  const decision = decisionFor(actor.id, actor.roles[0] ?? "executive");

  const permittedSources = CORPUS.filter((s) =>
    s.allowedFunctions.includes(actor.function),
  );
  const permittedFunctions = new Set(permittedSources.flatMap((s) => s.allowedFunctions));

  return NextResponse.json({
    decision,
    sources: permittedSources.map(({ id, label, kind }) => ({ id, label, kind })),
    insights: INSIGHTS.filter(
      (i) => permittedFunctions.has(i.function) || actor.function === "executive",
    ),
    excludedCount: CORPUS.length - permittedSources.length,
    retrievalVersion: RETRIEVAL_VERSION,
  });
}

/** Ask a question against the approved corpus. Retrieval is permission-first. */
export async function POST(req: Request) {
  const actor = actorFromRequest(req);
  const decision = decisionFor(actor.id, actor.roles[0] ?? "executive");

  let question = "";
  try {
    const body: unknown = await req.json();
    if (typeof body === "object" && body !== null && "question" in body) {
      question = String((body as { question: unknown }).question ?? "").trim();
    }
  } catch {
    question = "";
  }

  if (question.length < 3) {
    return NextResponse.json(
      { error: "Ask a question of at least three characters." },
      { status: 400 },
    );
  }

  const result = answer(question, actor.function);

  recordAudit({
    correlationId: `insight_${Date.now()}`,
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    action: "insight.retrieve",
    resourceType: "knowledge_corpus",
    resourceId: result.citations.map((c) => c.sourceId).join(",") || "none",
    outcome: result.citations.length > 0 ? "answered" : "no_permitted_match",
    risk: "low",
    policyVersion: decision.policyVersion,
    matchedRules: decision.matchedRules,
    aiModel: null,
    promptVersion: result.retrievalVersion,
    // No question text and no passage text: the audit line records the shape
    // of the retrieval, not its content.
    detail: `${result.consideredChunks} permitted chunks considered, ${result.excluded.length} sources excluded by function.`,
  });

  return NextResponse.json({ decision, ...result });
}
