"use client";

import { useCallback, useEffect, useState } from "react";
import type { PolicyRule } from "@/core/contracts";
import { Card, Reason } from "@/components/primitives";

type Payload = {
  policyVersion: string;
  rules: PolicyRule[];
  settings: { simulateCompromisedModel: boolean; provider: string };
};

const CATEGORY_LABEL: Record<string, string> = {
  access: "Access",
  email: "Email",
  scheduling: "Scheduling",
  publishing: "Publishing",
  insights: "Insights",
};

export default function ControlsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/policies");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/policies", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error);
      return;
    }
    setData((d) => (d ? { ...d, rules: json.rules, settings: json.settings } : d));
  }

  if (!data) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  const grouped = data.rules.reduce<Record<string, PolicyRule[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Controls</h1>
        <p className="muted text-sm">
          What the company can switch on and off, and what it cannot. Policy version{" "}
          <span className="font-mono">{data.policyVersion}</span>.
        </p>
      </header>

      {error && (
        <Card>
          <p className="text-sm leading-relaxed" style={{ color: "var(--high)" }}>
            {error}
          </p>
        </Card>
      )}

      <Card title="Demonstration">
        <label className="tap flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-3"
            checked={data.settings.simulateCompromisedModel}
            onChange={(e) => post({ simulateCompromisedModel: e.target.checked })}
          />
          <span>
            <span className="text-sm font-semibold">Simulate a compromised model</span>
            <span className="muted block text-[13px] leading-relaxed">
              The model reports every message as low risk and routine. Re-assess the fire
              or the fraudulent invoice with this on: the classification the model returns
              changes, and the outcome does not. Deterministic rules and the policy engine
              sit downstream of the model, so a manipulated model cannot widen what the
              system is allowed to do.
            </span>
          </span>
        </label>
        <p className="muted mt-3 text-xs">
          Active provider: <span className="font-mono">{data.settings.provider}</span>
        </p>
      </Card>

      {Object.entries(grouped).map(([category, rules]) => (
        <Card key={category} title={CATEGORY_LABEL[category] ?? category}>
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li key={rule.id} className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={rule.enabled}
                  disabled={!rule.editable}
                  onChange={(e) => post({ ruleId: rule.id, enabled: e.target.checked })}
                  aria-label={rule.description}
                />
                <div className="min-w-0">
                  <p className="text-[13px] leading-relaxed">{rule.description}</p>
                  <p className="muted mt-0.5 font-mono text-[11px]">
                    {rule.id}
                    {!rule.editable && " · invariant, cannot be disabled"}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card title="Why some rules cannot be switched off">
        <Reason>
          A control the client can disable is a control an attacker or a mistake can
          disable. The rules marked invariant are the ones whose failure would be
          unrecoverable: sending without approval, auto-drafting a crisis reply, exposing
          calendar detail, publishing directly to an external platform. Everything else is
          the client&apos;s call.
        </Reason>
      </Card>
    </div>
  );
}
