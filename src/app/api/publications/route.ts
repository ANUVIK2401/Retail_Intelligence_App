import { NextResponse } from "next/server";
import { evaluatePolicy } from "@/core/policy/engine";
import { exportForHuman, review } from "@/core/services/publishing";
import { actorFromRequest } from "@/core/session";
import { recordAudit, store } from "@/core/store";

/**
 * Runs the pre-publication check pipeline over a draft and returns the derived
 * review chain. The route has no publish branch, because the service it calls
 * has no publish function.
 */
export async function POST(req: Request) {
  const actor = actorFromRequest(req);

  let body = "";
  let title = "Untitled draft";
  let channel = "linkedin";
  let wantExport = false;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      body = String(p.body ?? "");
      title = String(p.title ?? title);
      channel = String(p.channel ?? channel);
      wantExport = p.export === true;
    }
  } catch {
    body = "";
  }

  if (body.trim().length < 20) {
    return NextResponse.json(
      { error: "Provide a draft of at least twenty characters." },
      { status: 400 },
    );
  }

  const result = review(body);

  const decision = evaluatePolicy({
    action: "publication.publish",
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    resourceOwnerId: actor.id,
    // A blocking MNPI finding is restricted risk, and the policy engine — not
    // this route — decides what that means.
    risk: result.blocked ? "restricted" : "low",
    topic: result.blocked ? "confidential_strategy" : "external_communication",
    ruleState: store.ruleState,
  });

  recordAudit({
    correlationId: `pub_${Date.now()}`,
    actorId: actor.id,
    actorRole: actor.roles[0] ?? "executive",
    action: "publication.check",
    resourceType: "publication_draft",
    resourceId: title.slice(0, 40),
    outcome: result.blocked ? "blocked" : "checks_complete",
    risk: result.blocked ? "restricted" : "low",
    policyVersion: decision.policyVersion,
    matchedRules: decision.matchedRules,
    aiModel: null,
    promptVersion: result.checkVersion,
    // Records which checks failed, never the draft text.
    detail: `failed: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(",") || "none"}; chain: ${result.chain.map((s) => s.label).join(" -> ") || "none"}.`,
  });

  if (!wantExport) {
    return NextResponse.json({ decision, ...result });
  }

  try {
    const exported = exportForHuman({
      channel,
      title,
      body,
      approvedBy: result.chain.map((s) => s.label),
      review: result,
    });
    recordAudit({
      correlationId: `pub_${Date.now()}`,
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      action: "publication.export",
      resourceType: "publication_draft",
      resourceId: exported.filename,
      outcome: "exported_for_human",
      risk: "low",
      policyVersion: decision.policyVersion,
      matchedRules: decision.matchedRules,
      aiModel: null,
      promptVersion: result.checkVersion,
      detail: "Exported as a file for a person to post. The prototype has no publish path.",
    });
    return NextResponse.json({ decision, ...result, exported });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        decision,
        ...result,
        error: error instanceof Error ? error.message : "Export refused.",
      },
      { status: 409 },
    );
  }
}
