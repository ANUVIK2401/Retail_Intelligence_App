"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest, MeetingProposal } from "@/core/contracts";
import { Card, Empty, OutcomeBadge, Reason, RiskBadge, relativeTime } from "@/components/primitives";

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<ApprovalRequest[] | null>(null);
  const [proposals, setProposals] = useState<MeetingProposal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [slotByApproval, setSlotByApproval] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setError(null);
    try {
      const [approvalResponse, proposalResponse] = await Promise.all([
        fetch("/api/approvals"),
        fetch("/api/meeting-proposals"),
      ]);
      const approvalData = await approvalResponse.json();
      if (!approvalResponse.ok) throw new Error(approvalData.error ?? "Approvals could not be loaded.");
      if (!Array.isArray(approvalData.approvals)) throw new Error("Approvals returned an unexpected response.");
      setApprovals(approvalData.approvals);
      const proposalData = await proposalResponse.json();
      if (proposalResponse.ok && Array.isArray(proposalData.proposals)) {
        setProposals(proposalData.proposals);
      } else {
        setProposals([]);
        setError(proposalData.error ?? "Meeting times could not be loaded. Retry before approving a meeting.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Approvals could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(approval: ApprovalRequest, outcome: "approved" | "rejected" | "escalated") {
    const slotIndex = slotByApproval[approval.id];
    if (approval.subjectType === "meeting_proposal" && outcome === "approved" && slotIndex === undefined) {
      setMessage("Choose a proposed time before approving this meeting.");
      return;
    }
    setBusyId(approval.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/approvals/${encodeURIComponent(approval.id)}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outcome, slotIndex: outcome === "approved" ? slotIndex : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "This decision could not be recorded.");
      setMessage(data.execution?.kind === "calendar_event_created"
        ? `Invitation created for ${formatSlot(data.execution.slot)} (simulated).`
        : `Recorded: ${data.approval.status.replace(/_/g, " ")}.`);
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "This decision could not be recorded.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Daily work</p>
        <h1 className="t-title mt-2">Approvals</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Each step names who may clear it. Approving as the wrong identity is refused
          and recorded.
        </p>
      </header>

      {message && (
        <Card>
          <p role="status" className="text-sm leading-relaxed">{message}</p>
        </Card>
      )}

      {error && (
        <Card>
          <p role="alert" className="text-sm leading-relaxed">{error}</p>
          <button className="btn mt-3" onClick={() => void load()}>Retry loading approvals</button>
        </Card>
      )}

      {!approvals && !error && <Card><p role="status" className="muted text-sm">Loading approvals…</p></Card>}

      {approvals?.length === 0 && !error ? (
        <Empty>Nothing pending. Assess a message or request a meeting to create one.</Empty>
      ) : approvals ? (
        <ul className="space-y-3">
          {approvals.map((a) => {
            const step = a.decision.approvalChain[a.currentStep];
            const actionable = a.status === "proposed" || a.status === "awaiting_approval";
            const blocked = a.decision.outcome === "block_and_escalate";
            const meeting = a.subjectType === "meeting_proposal" ? proposals.find((item) => item.id === a.subjectId) : null;
            const selectedSlot = slotByApproval[a.id];
            return (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={a.risk} />
                    <OutcomeBadge outcome={a.decision.outcome} />
                    <span className="muted t-caption tnum ml-auto">{relativeTime(a.createdAt)}</span>
                  </div>
                  <h2 className="t-section mt-2.5 leading-snug">{a.title}</h2>
                  <Reason>{a.decision.reason}</Reason>

                  <div className="mt-3">
                    <p className="rule-head">Proposed content</p>
                    <pre className="proposed mt-2">{a.proposedContent}</pre>
                  </div>

                  {a.subjectType === "meeting_proposal" && actionable && (
                    <div className="mt-4">
                      <p className="rule-head">Choose a time to approve</p>
                      {meeting?.slots.length ? (
                        <div className="mt-2 space-y-2" role="radiogroup" aria-label={`Times for ${a.title}`}>
                          {meeting.slots.map((slot, index) => (
                            <label key={slot.start} className="row-item flex cursor-pointer items-center gap-3">
                              <input type="radio" name={`slot-${a.id}`} checked={selectedSlot === index} onChange={() => setSlotByApproval((current) => ({ ...current, [a.id]: index }))} disabled={busyId !== null} />
                              <span className="text-sm">{formatSlot(slot)}</span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <p className="muted mt-2 text-xs">Proposed times are unavailable. Refresh before approving.</p>
                      )}
                    </div>
                  )}

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

                  {actionable && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {blocked ? (
                        <button className="btn btn-primary" onClick={() => decide(a, "escalated")} disabled={busyId !== null || a.history.some((entry) => entry.outcome === "escalated")}>
                          {busyId === a.id ? "Recording…" : a.history.some((entry) => entry.outcome === "escalated") ? "Escalation recorded" : "Acknowledge and escalate"}
                        </button>
                      ) : <button
                        className="btn btn-primary"
                        onClick={() => decide(a, "approved")}
                        disabled={busyId !== null || (a.subjectType === "meeting_proposal" && (selectedSlot === undefined || !meeting?.slots[selectedSlot]))}
                      >
                        {busyId === a.id ? "Recording…" : a.subjectType === "meeting_proposal" ? "Approve selected time" : "Approve"}
                      </button>}
                      {!blocked && <button className="btn" onClick={() => decide(a, "escalated")} disabled={busyId !== null}>
                        Escalate
                      </button>}
                      <button
                        className="btn btn-danger"
                        onClick={() => decide(a, "rejected")}
                        disabled={busyId !== null}
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
      ) : null}
    </div>
  );
}

function formatSlot(slot: { start: string; end: string }): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const date = start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const time = (value: Date) => value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${date}, ${time(start)}–${time(end)}`;
}
