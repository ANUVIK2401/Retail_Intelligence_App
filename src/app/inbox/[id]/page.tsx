"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/emails/${id}`);
    if (res.status === 403) {
      const body = await res.json();
      setForbidden(body.reason);
      return;
    }
    const data: Detail = await res.json();
    setDetail(data);
    if (data.assessment?.suggestedReply) setDraft(data.assessment.suggestedReply);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function assess() {
    setBusy(true);
    setResult(null);
    const res = await fetch(`/api/emails/${id}/assess`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (data.assessment) {
      setDetail((d) => (d ? { ...d, assessment: data.assessment } : d));
      setDraft(data.assessment.suggestedReply ?? "");
      setApproval(data.approval ?? null);
    }
  }

  async function decide(outcome: "approved" | "rejected" | "escalated") {
    if (!approval) return;
    setBusy(true);
    const res = await fetch(`/api/approvals/${approval.id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outcome,
        editedContent: outcome === "approved" ? draft : undefined,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setResult(data.error);
      return;
    }
    setApproval(data.approval);
    setResult(
      data.execution?.kind === "outlook_draft_created"
        ? `Draft ${data.execution.externalRef} created in the mailbox. It was not sent: sending is a separate authorized action.`
        : `Recorded: ${data.approval.status}.`,
    );
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

  if (!detail) return <p className="muted py-10 text-center text-sm">Loading…</p>;

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

      {!a && (
        <button className="btn btn-primary w-full" onClick={assess} disabled={busy}>
          {busy ? "Assessing…" : "Assess this message"}
        </button>
      )}

      {a && (
        <>
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
                  <button className="btn" onClick={() => decide("escalated")} disabled={busy}>
                    Acknowledge and escalate
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => decide("approved")}
                    disabled={busy}
                    title="Demonstrates that approval is refused for blocked matters"
                  >
                    Try to approve a reply
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
                Edits are recorded in the audit trail alongside the original text.
              </p>
              {approval && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => decide("approved")}
                    disabled={busy || approval.status === "completed"}
                  >
                    Approve and create draft
                  </button>
                  <button className="btn btn-danger" onClick={() => decide("rejected")} disabled={busy}>
                    Reject
                  </button>
                </div>
              )}
            </Card>
          )}

          {result && (
            <Card>
              <p className="text-sm leading-relaxed">{result}</p>
              <Link href="/audit" className="mt-2 inline-block text-xs font-semibold" style={{ color: "var(--accent)" }}>
                See the audit entry
              </Link>
            </Card>
          )}
        </>
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
