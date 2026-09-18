import { withDemoState } from "@/core/persistence";
export const runtime = "nodejs";
export const maxDuration = 60;
import { NextResponse } from "next/server";
import { evaluatePolicy } from "@/core/policy/engine";
import { exportForHuman, review } from "@/core/services/publishing";
import { actorFromRequest } from "@/core/session";
import { getApproval, nextId, recordAudit, saveApproval, store } from "@/core/store";
import { PEOPLE } from "@/data/org";

/**
 * Runs the pre-publication check pipeline over a draft and returns the derived
 * review chain. The route has no publish branch, because the service it calls
 * has no publish function.
 */
async function handlePOST(req: Request) {
  const actor = actorFromRequest(req);

  let body = "";
  let title = "Untitled draft";
  let channel = "linkedin";
  let wantExport = false;
  let approvalId: string | null = null;
  let wantApproval = false;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed === "object" && parsed !== null) {
      const p = parsed as Record<string, unknown>;
      body = String(p.body ?? "");
      title = String(p.title ?? title);
      channel = String(p.channel ?? channel);
      wantExport = p.export === true;
      approvalId = typeof p.approvalId === "string" ? p.approvalId : null;
      wantApproval = p.requestApproval === true;
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

  // The exported artifact is title + body, so both are scanned. Checking the
  // body alone let a restricted claim ride out in the headline.
  const result = review(`${title}\n\n${body}`);

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
    // Identifier only: a draft title can itself be restricted material.
    resourceId: `draft ${titleHash(title)}`,
    outcome: result.blocked ? "blocked" : "checks_complete",
    risk: result.blocked ? "restricted" : "low",
    policyVersion: decision.policyVersion,
    matchedRules: decision.matchedRules,
    aiModel: null,
    promptVersion: result.checkVersion,
    // Records which checks failed, never the draft text.
    detail: `failed: ${result.checks.filter((c) => !c.passed).map((c) => c.name).join(",") || "none"}; chain: ${result.chain.map((s) => s.label).join(" -> ") || "none"}.`,
  });

  // Requesting review creates a real ApprovalRequest that the ordinary
  // approval gate decides. The Publish page's buttons drive that gate; they
  // no longer advance a local counter that means nothing.
  if (wantApproval && !result.blocked) {
    const created = saveApproval({
      id: nextId("ap"),
      action: "publication.publish",
      subjectType: "publication",
      subjectId: title.slice(0, 60),
      title: `Publication: ${title}`,
      proposedContent: body,
      risk: "low",
      decision: {
        ...decision,
        // The chain the checks derived, not one a model or caller chose.
        approvalChain: result.chain.map((s) => ({
          kind: s.kind === "executive" ? ("executive" as const) : ("reviewer" as const),
          reviewerDomain: s.reviewerDomain,
          label: s.label,
        })),
      },
      currentStep: 0,
      status: "awaiting_approval",
      contentVersion: 0,
      executionClaimed: false,
      requestedFor: actor.id,
      createdAt: new Date().toISOString(),
      history: [],
    });
    return NextResponse.json({ decision, ...result, approval: created });
  }

  if (!wantExport) {
    return NextResponse.json({ decision, ...result, approval: approvalId ? getApproval(approvalId) ?? null : null });
  }

  // Provenance comes from a real approval record or from nothing at all.
  const approval = approvalId ? getApproval(approvalId) : undefined;
  const approvalComplete =
    approval?.status === "approved" || approval?.status === "completed";
  const decidedBy = (approval?.history ?? [])
    .filter((h) => h.outcome === "approved")
    .map((h) => `${personName(h.actorId)} (${h.actorRole})`);

  try {
    const exported = exportForHuman({
      channel,
      title,
      body,
      approvedBy: decidedBy,
      approvalComplete: Boolean(approvalComplete),
      approvalId: approval?.id ?? null,
      review: result,
    });
    recordAudit({
      correlationId: `pub_${Date.now()}`,
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "executive",
      action: "publication.export",
      resourceType: "publication_draft",
      resourceId: exported.filename,
      outcome: approvalComplete ? "exported_approved" : "exported_unapproved_draft",
      risk: "low",
      policyVersion: decision.policyVersion,
      matchedRules: decision.matchedRules,
      aiModel: null,
      promptVersion: result.checkVersion,
      detail: approvalComplete
        ? `Approved export backed by ${approval?.id}. The prototype has no publish path; a person posts it.`
        : "Exported as an UNAPPROVED draft, labelled as not cleared for posting.",
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

/** Names a decider for the export header. Falls back to the raw id. */
function personName(id: string): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? id;
}

/** Short stable id for a draft title, so audit lines carry no content. */
function titleHash(t: string): string {
  let h = 0;
  for (let i = 0; i < t.length; i += 1) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).slice(0, 8);
}

export const POST = withDemoState(handlePOST);
