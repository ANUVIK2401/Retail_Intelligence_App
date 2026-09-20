"use client";

import { useCallback, useEffect, useState } from "react";
import type { PolicyRule } from "@/core/contracts";
import { Card, Reason } from "@/components/primitives";

type Payload = {
  policyVersion: string;
  rules: PolicyRule[];
  settings: { simulateCompromisedModel: boolean; provider: string };
  activeModel: string;
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
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/policies");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (!Array.isArray(body.rules) || !body.settings) throw new Error("Invalid policy response");
      setData(body);
    } catch {
      setError("Controls could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "The control could not be updated.");
        return;
      }
      if (!Array.isArray(json.rules) || !json.settings) throw new Error("Invalid policy response");
      setData((d) => (d ? { ...d, rules: json.rules, settings: json.settings } : d));
    } catch {
      setError("The control could not be updated. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (!data && !error) return <p className="muted py-10 text-center text-sm" role="status">Loading controls…</p>;
  if (!data) return (
    <Card title="Controls unavailable">
      <p className="muted text-sm">{error}</p>
      <button type="button" className="btn mt-3" onClick={() => void load()}>Retry</button>
    </Card>
  );

  const grouped = data.rules.reduce<Record<string, PolicyRule[]>>((acc, r) => {
    (acc[r.category] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Governance</p>
        <h1 className="t-title mt-2">Controls</h1>
        <p className="muted t-body mt-2 max-w-prose">
          What the company can switch on and off, and what it cannot. Policy version{" "}
          <span className="font-mono">{data.policyVersion}</span>.
        </p>
      </header>

      {error && (
        <Card>
          <p className="text-sm leading-relaxed" role="alert" style={{ color: "var(--high)" }}>
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
            disabled={pending}
            onChange={(e) => void post({ simulateCompromisedModel: e.target.checked })}
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
          Active provider: <span className="font-mono">{data.settings.provider}</span> · Model: <span className="font-mono">{data.activeModel}</span>
        </p>
      </Card>

      <Card title="AI provider configuration">
        <p className="text-sm leading-relaxed">
          The assistant and assessments use the server-configured provider. To choose a model,
          set <span className="font-mono">AI_PROVIDER</span> to <span className="font-mono">openai</span> or <span className="font-mono">anthropic</span>,
          then set the matching <span className="font-mono">*_API_KEY</span> and <span className="font-mono">*_MODEL</span> in Vercel environment variables.
        </p>
        <p className="muted mt-3 text-xs leading-relaxed">Keys are server-only and cannot be entered or viewed here. A key by itself never enables a live model. Use an exact model ID available to your account; invalid or unavailable models fall back to grounded demo answers in the assistant.</p>
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
                  disabled={!rule.editable || pending}
                  onChange={(e) => void post({ ruleId: rule.id, enabled: e.target.checked })}
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
