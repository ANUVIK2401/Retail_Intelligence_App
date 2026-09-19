"use client";

import { useState } from "react";
import type { MeetingProposal } from "@/core/contracts";
import { Card, OutcomeBadge, Reason } from "@/components/primitives";

const REQUESTERS = [
  { id: "p_coo", label: "Ray Alvarez — COO (direct report)" },
  { id: "p_dir_ops", label: "Casey Wu — Director, Store Ops (3 levels down)" },
  { id: "p_mgr_analytics", label: "Ellie Novak — Manager, Analytics (4 levels down)" },
  { id: "p_ext_banker", label: "Howard Teague — external" },
];

export default function SchedulePage() {
  const [requesterId, setRequesterId] = useState("p_dir_ops");
  const [purpose, setPurpose] = useState("West region remodel pilot review");
  const [duration, setDuration] = useState(30);
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState<MeetingProposal | null>(null);
  const [approvalId, setApprovalId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  async function propose() {
    setBusy(true);
    setOutcome(null);
    const now = new Date();
    const earliest = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const latest = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    const res = await fetch("/api/meeting-proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requesterId,
        attendeeIds: ["p_ceo"],
        purpose,
        durationMinutes: duration,
        sensitivity: confidential ? "confidential" : "normal",
        earliest: earliest.toISOString(),
        latest: latest.toISOString(),
      }),
    });
    const data = await res.json();
    setBusy(false);
    setProposal(data.proposal ?? null);
    setApprovalId(data.approval?.id ?? null);
  }

  async function accept(slotIndex: number) {
    if (!approvalId) {
      setOutcome("Direct proposal permitted. In production this would send the invitation.");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome: "approved", slotIndex }),
    });
    const data = await res.json();
    setBusy(false);
    setOutcome(
      res.ok
        ? data.execution?.kind === "calendar_event_created"
          ? "Invitation created (simulated). Recorded in the audit trail."
          : `Step cleared. Status: ${data.approval.status}. The next approver must still act.`
        : data.error,
    );
  }

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Daily work</p>
        <h1 className="t-title mt-2">Schedule</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Who may book directly, and who goes through the assistant, is a company rule,
          not an availability question.
        </p>
      </header>

      <Card title="Request time with Maya Hollis (CEO)">
        <div className="space-y-3">
          <Field label="Requester">
            <select
              className="tap w-full rounded-lg border px-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              value={requesterId}
              onChange={(e) => setRequesterId(e.target.value)}
            >
              {REQUESTERS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Purpose">
            <input
              className="tap w-full rounded-lg border px-3 text-sm"
              style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4">
            <Field label="Duration">
              <select
                className="tap rounded-lg border px-3 text-sm"
                style={{ borderColor: "var(--border)", background: "var(--bg)", color: "var(--text)" }}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {[15, 30, 45, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </Field>
            <label className="tap flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confidential}
                onChange={(e) => setConfidential(e.target.checked)}
              />
              Confidential
            </label>
          </div>

          <button className="btn btn-primary w-full" onClick={propose} disabled={busy}>
            {busy ? "Checking availability…" : "Find times"}
          </button>
        </div>
      </Card>

      {proposal && (
        <>
          <Card title="Routing decision">
            <OutcomeBadge outcome={proposal.decision.outcome} />
            <Reason>{proposal.decision.reason}</Reason>
            {proposal.decision.approvalChain.length > 0 && (
              <ol className="mt-3 space-y-1.5 text-sm">
                {proposal.decision.approvalChain.map((s, i) => (
                  <li key={i}>
                    {i + 1}. {s.label}
                  </li>
                ))}
              </ol>
            )}
            <p className="muted mt-3 font-mono text-[11px]">
              {proposal.decision.matchedRules.join(" · ")}
            </p>
          </Card>

          <Card title="Proposed times">
            <p className="muted mb-3 text-xs leading-relaxed">
              Availability came back as free/busy only. No meeting subject, attendee, or
              location on anyone&apos;s calendar was retrieved, and the connector contract
              has no field to carry one.
            </p>
            {proposal.slots.length === 0 ? (
              <p className="muted t-body mt-2 max-w-prose">
                No slot satisfies everyone&apos;s working hours and protected blocks in this
                window.
              </p>
            ) : (
              <ul className="space-y-2">
                {proposal.slots.map((slot, i) => (
                  <li
                    key={i}
                    className="row-item flex flex-wrap items-center justify-between gap-3"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div>
                      <p className="text-sm font-semibold">{formatSlot(slot)}</p>
                      <p className="muted text-xs">{slot.rationale}</p>
                    </div>
                    <button className="btn" onClick={() => accept(i)} disabled={busy}>
                      Choose
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {outcome && (
        <Card>
          <p className="text-sm leading-relaxed">{outcome}</p>
        </Card>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider muted">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function formatSlot(slot: { start: string; end: string }): string {
  const s = new Date(slot.start);
  const e = new Date(slot.end);
  const date = s.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const fmt = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${fmt(s)}–${fmt(e)}`;
}
