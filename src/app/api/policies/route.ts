import { NextResponse } from "next/server";
import { POLICY_RULES, POLICY_VERSION } from "@/core/policy/engine";
import { actorFromRequest } from "@/core/session";
import { nextId, recordAudit, store } from "@/core/store";

export async function GET() {
  return NextResponse.json({
    policyVersion: POLICY_VERSION,
    rules: POLICY_RULES.map((r) => ({ ...r, enabled: store.ruleState[r.id] ?? r.enabled })),
    settings: store.settings,
  });
}

/** Administrators toggle rules and demo switches. Every change is audited. */
export async function POST(req: Request) {
  const actor = actorFromRequest(req);
  if (!actor.roles.includes("administrator") && !actor.roles.includes("executive")) {
    return NextResponse.json(
      { error: "Only administrators can change policy." },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    ruleId?: string;
    enabled?: boolean;
    simulateCompromisedModel?: boolean;
  };

  if (body.ruleId !== undefined && body.enabled !== undefined) {
    const rule = POLICY_RULES.find((r) => r.id === body.ruleId);
    if (!rule) {
      return NextResponse.json({ error: "Unknown rule." }, { status: 404 });
    }
    if (!rule.editable) {
      return NextResponse.json(
        {
          error:
            "This rule is a system invariant and cannot be switched off from the Control Center.",
        },
        { status: 409 },
      );
    }
    store.ruleState[body.ruleId] = body.enabled;
    recordAudit({
      correlationId: nextId("cor"),
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "administrator",
      action: "policy.updated",
      resourceType: "policy_rule",
      resourceId: body.ruleId,
      outcome: body.enabled ? "enabled" : "disabled",
      risk: null,
      policyVersion: POLICY_VERSION,
      matchedRules: [body.ruleId],
      aiModel: null,
      promptVersion: null,
      detail: `${actor.name} ${body.enabled ? "enabled" : "disabled"} "${rule.description}"`,
    });
  }

  if (body.simulateCompromisedModel !== undefined) {
    store.settings.simulateCompromisedModel = body.simulateCompromisedModel;
    recordAudit({
      correlationId: nextId("cor"),
      actorId: actor.id,
      actorRole: actor.roles[0] ?? "administrator",
      action: "demo.model_simulation",
      resourceType: "setting",
      resourceId: "simulateCompromisedModel",
      outcome: String(body.simulateCompromisedModel),
      risk: null,
      policyVersion: POLICY_VERSION,
      matchedRules: [],
      aiModel: null,
      promptVersion: null,
      detail: body.simulateCompromisedModel
        ? "Demo mode: the model now reports every message as low risk. Deterministic rules and policy remain in force."
        : "Demo mode off: normal model behavior restored.",
    });
  }

  return NextResponse.json({
    rules: POLICY_RULES.map((r) => ({ ...r, enabled: store.ruleState[r.id] ?? r.enabled })),
    settings: store.settings,
  });
}
