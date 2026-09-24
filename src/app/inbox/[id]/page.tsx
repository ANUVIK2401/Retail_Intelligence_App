"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApprovalRequest, EmailAssessment } from "@/core/contracts";
import { Card, OutcomeBadge, Reason, RiskBadge, relativeTime } from "@/components/primitives";

type Detail = {
  message: {
    id: string;
    subject: string;
    body: string;
    receivedAt: string;
    external: boolean;
    fromName: string;
    fromTitle: string;
  };
  assessment: EmailAssessment | null;
};

export default function MessagePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoadError(null);
    setDetail(null);
    setApproval(null);
    setForbidden(null);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (sequence !== loadSequence.current) return;
      if (res.status === 403) {
        setForbidden(data.reason ?? data.error ?? "Access to this message is withheld.");
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "This message could not be loaded.");
      if (!data.message) throw new Error("The message returned an unexpected response.");
      setDetail(data as Detail);
      setForbidden(null);
      setDraft(data.assessment?.suggestedReply ?? "");
      const approvalResponse = await fetch("/api/approvals");
      const approvalData = await approvalResponse.json();
      if (sequence !== loadSequence.current) return;
      if (!approvalResponse.ok) throw new Error(approvalData.error ?? "Approval status could not be loaded.");
      const current = (approvalData.approvals as ApprovalRequest[] | undefined)?.find(
        (candidate) => candidate.subjectType === "email_draft" && candidate.subjectId === id &&
          ["proposed", "awaiting_approval"].includes(candidate.status),
      );
      setApproval(current ?? null);
    } catch (cause) {
      if (sequence === loadSequence.current) {
        setLoadError(cause instanceof Error ? cause.message : "This message could not be loaded.");
      }
    }
  }, [id]);

  useEffect(() => {
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  async function assess() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/emails/${encodeURIComponent(id)}/assess`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Assessment failed. Please try again.");
      if (!data.assessment) throw new Error("Assessment returned an unexpected response.");
      setDetail((current) => (current ? { ...current, assessment: data.assessment } : current));
      setDraft(data.assessment.suggestedReply ?? "");
      setApproval(data.approval ?? null);
      setResult("Assessment updated against the current policy.");
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Assessment failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function decide(outcome: "approved" | "rejected" | "escalated") {
    if (!approval) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/approvals/${approval.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome,
          editedContent: outcome === "approved" ? draft : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "This decision could not be recorded.");
      setApproval(data.approval);
      setResult(
        data.execution?.kind === "outlook_draft_created"
          ? `Draft ${data.execution.externalRef} created in the mailbox. It was not sent: sending is a separate authorized action.`
          : `Recorded: ${data.approval.status}.`,
      );
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "This decision could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
      setResult("Prepared reply copied. You can paste it into your mail client.");
    } catch {
      setResult("The reply could not be copied automatically. Select the text above to copy it.");
    }
  }

  if (forbidden) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <span className="badge badge-restricted">Access withheld</span>
          <p className="mt-3 text-sm leading-relaxed">{forbidden}</p>
          <Reason>
            Access to restricted matters comes from a named list, not from seniority or
            role. Switch to an identity on that list to see this thread.
          </Reason>
        </Card>
      </div>
    );
  }

  if (!detail && loadError) return (
    <div className="space-y-4">
      <BackLink />
      <Card><p role="alert" className="text-sm">{loadError}</p><button className="btn mt-3" onClick={() => void load()}>Retry loading message</button></Card>
    </div>
  );

  if (!detail) return <Card><p role="status" className="muted text-sm">Loading message…</p></Card>;

  const a = detail.assessment;
  const blocked = a?.draftDecision.outcome === "block_and_escalate";

  return (
    <div className="space-y-4">
      <BackLink />

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {a && <RiskBadge level={a.risk.level} />}
          {detail.message.external && <span className="badge badge-medium">External sender</span>}
          <span className="muted ml-auto text-xs">
            {relativeTime(detail.message.receivedAt)}
          </span>
        </div>
        <h1 className="mt-2 text-lg font-semibold leading-snug">{detail.message.subject}</h1>
        <p className="muted text-xs">
          {detail.message.fromName} · {detail.message.fromTitle}
        </p>
        <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {detail.message.body}
        </pre>
      </Card>

      {loadError && <Card><p role="alert" className="text-sm">{loadError}</p><button className="btn mt-3" onClick={() => void load()}>Retry</button></Card>}

      {!a && (
        <button className="btn btn-primary w-full" onClick={assess} disabled={busy}>
          {busy ? "Assessing…" : "Assess this message"}
        </button>
      )}

      {a && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="muted text-xs">Assessed {relativeTime(a.assessedAt)} · {a.model}</p>
            <button className="btn" onClick={assess} disabled={busy}>
              {busy ? "Reassessing…" : "Reassess with current policy"}
            </button>
          </div>
          <Card title="Summary">
            <p className="text-sm leading-relaxed">{a.summary}</p>
            {a.actionItems.length > 0 && (
              <>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wider muted">
                  Requested of you
                </h3>
                <ul className="mt-1.5 space-y-1 text-sm">
                  {a.actionItems.map((item, i) => (
                    <li key={i} className="flex gap-2">
                      <span style={{ color: "var(--accent)" }}>·</span>
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {a.entities.amounts.length > 0 && (
              <p className="muted mt-3 text-xs">
                Amounts found: {a.entities.amounts.join(", ")}
              </p>
            )}
          </Card>

          <Card title="Why it is rated this way">
            <div className="flex flex-wrap items-center gap-2">
              <RiskBadge level={a.risk.level} />
              <span className="muted text-xs">{a.risk.topic.replace(/_/g, " ")}</span>
            </div>
            <Reason>{a.risk.reason}</Reason>

            {a.risk.injectionSuspected && (
              <div
                className="mt-3 rounded-lg border p-3"
                style={{ borderColor: "var(--high)", background: "var(--high-bg)" }}
              >
                <p className="text-sm font-semibold" style={{ color: "var(--high)" }}>
                  Instructions found inside the message
                </p>
                <p className="mt-1 text-[13px] leading-relaxed">
                  The body contains text addressed to the assistant, telling it to treat
                  this as pre-approved and send a reply without review. Message content is
                  data, never instruction. The text was ignored and the message was
                  escalated instead.
                </p>
              </div>
            )}

            {a.risk.modelProposed && (
              <div className="mt-3 text-xs leading-relaxed">
                <p className="muted">
                  Model ({a.model}, prompt {a.promptVersion}) proposed{" "}
                  <strong>{a.risk.modelProposed.level}</strong> at{" "}
                  {Math.round(a.risk.modelProposed.confidence * 100)}% confidence.
                  {a.risk.escalatedByRule && (
                    <>
                      {" "}
                      A company rule raised it to <strong>{a.risk.level}</strong>. Rules can
                      raise risk; the model cannot lower it.
                    </>
                  )}
                </p>
              </div>
            )}

            {a.risk.triggeredRules.length > 0 && (
              <p className="muted mt-2 font-mono text-[11px]">
                Rules fired: {a.risk.triggeredRules.join(" · ")}
              </p>
            )}
          </Card>

          <Card title="What the system may do">
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={a.draftDecision.outcome} />
              <span className="muted font-mono text-[11px]">
                policy {a.draftDecision.policyVersion}
              </span>
            </div>
            <Reason>{a.draftDecision.reason}</Reason>
            {a.draftDecision.approvalChain.length > 0 && (
              <ol className="mt-3 space-y-1.5">
                {a.draftDecision.approvalChain.map((step, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                      style={{
                        background: "color-mix(in srgb, var(--accent) 15%, transparent)",
                        color: "var(--accent)",
                      }}
                    >
                      {i + 1}
                    </span>
                    {step.label}
                  </li>
                ))}
              </ol>
            )}
            {a.draftDecision.matchedRules.length > 0 && (
              <p className="muted mt-3 font-mono text-[11px]">
                {a.draftDecision.matchedRules.join(" · ")}
              </p>
            )}
          </Card>

          {blocked ? (
            <Card title="No reply was drafted">
              <p className="text-sm leading-relaxed">
                The assistant did not write a response and cannot be made to. This matter
                goes to a person.
              </p>
              {approval && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn btn-primary" onClick={() => decide("escalated")} disabled={busy || !["proposed", "awaiting_approval"].includes(approval.status) || approval.history.some((entry) => entry.outcome === "escalated")}>
                    {approval.history.some((entry) => entry.outcome === "escalated") ? "Escalation recorded" : "Acknowledge and escalate"}
                  </button>
                </div>
              )}
            </Card>
          ) : (
            <Card title="Prepared reply">
              <textarea
                className="w-full rounded-lg border p-3 text-sm leading-relaxed"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  minHeight: 160,
                }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Prepared reply"
              />
              <p className="muted mt-2 text-xs">
                {approval
                  ? "Edits submitted for approval are recorded in the audit trail alongside the original text."
                  : a.draftDecision.outcome === "allow"
                    ? "This suggestion is ready to copy into your mail client. Nothing is sent from this page."
                    : "This needs a sign-off before anything is drafted in your mailbox. The named reviewer confirms it with their own account, and every step is recorded in Audit history."}
              </p>
              {approval && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => decide("approved")}
                    disabled={busy || !["proposed", "awaiting_approval"].includes(approval.status)}
                  >
                    Approve and create draft
                  </button>
                  <button className="btn btn-danger" onClick={() => decide("rejected")} disabled={busy || !["proposed", "awaiting_approval"].includes(approval.status)}>
                    Reject
                  </button>
                </div>
              )}
              {!approval && !loadError && a.draftDecision.outcome === "allow" && (
                <button className="btn btn-primary mt-3" onClick={() => void copyDraft()} disabled={!draft.trim()}>
                  Copy suggested draft
                </button>
              )}
            </Card>
          )}

        </>
      )}
      {result && (
        <Card>
          <p role="status" className="text-sm leading-relaxed">{result}</p>
          <Link href="/audit" className="mt-2 inline-block text-xs font-semibold" style={{ color: "var(--accent)" }}>
            See the audit entry
          </Link>
        </Card>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/inbox" className="muted tap inline-flex items-center text-sm">
      ← Inbox
    </Link>
  );
}
