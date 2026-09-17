"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest } from "@/core/contracts";
import { Card, Empty, OutcomeBadge, Reason, RiskBadge, relativeTime } from "@/components/primitives";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    setApprovals(data.approvals);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, outcome: "approved" | "rejected" | "escalated") {
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/approvals/${id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outcome }),
    });
    const data = await res.json();
    setBusy(false);
    setMessage(res.ok ? `Recorded: ${data.approval.status}.` : data.error);
    load();
  }

  if (!approvals) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Approvals</h1>
        <p className="muted text-sm">
          Each step names who may clear it. Approving as the wrong identity is refused
          and recorded.
        </p>
      </header>

      {message && (
        <Card>
          <p className="text-sm leading-relaxed">{message}</p>
        </Card>
      )}

      {approvals.length === 0 ? (
        <Empty>Nothing pending. Assess a message or request a meeting to create one.</Empty>
      ) : (
        <ul className="space-y-3">
          {approvals.map((a) => {
            const step = a.decision.approvalChain[a.currentStep];
            const settled = a.status === "completed" || a.status === "rejected";
            return (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={a.risk} />
                    <OutcomeBadge outcome={a.decision.outcome} />
                    <span className="muted ml-auto text-xs">{relativeTime(a.createdAt)}</span>
                  </div>
                  <h2 className="mt-2 text-sm font-semibold leading-snug">{a.title}</h2>
                  <Reason>{a.decision.reason}</Reason>

                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider muted">
                      Proposed content
                    </p>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg border p-3 font-sans text-[13px] leading-relaxed"
                      style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
                      {a.proposedContent}
                    </pre>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className="muted">
                      Status: <strong>{a.status.replace(/_/g, " ")}</strong>
                    </span>
                    {step && (
                      <span className="muted">
                        · Waiting on: <strong>{step.label}</strong>
                      </span>
                    )}
                  </div>

                  {a.history.length > 0 && (
                    <ul className="muted mt-2 space-y-0.5 text-[11px]">
                      {a.history.map((h, i) => (
                        <li key={i}>
                          {h.outcome} by {h.actorId} · {relativeTime(h.at)}
                        </li>
                      ))}
                    </ul>
                  )}

                  {!settled && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="btn btn-primary"
                        onClick={() => decide(a.id, "approved")}
                        disabled={busy}
                      >
                        Approve
                      </button>
                      <button className="btn" onClick={() => decide(a.id, "escalated")} disabled={busy}>
                        Escalate
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => decide(a.id, "rejected")}
                        disabled={busy}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
