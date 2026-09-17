"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ApprovalRequest, AuditEvent, Insight, RiskLevel } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";

type Item = {
  id: string;
  subject: string;
  from: string;
  receivedAt: string;
  level: RiskLevel;
  topic: string;
  assessed: boolean;
  injectionSuspected: boolean;
};

type Dashboard = {
  actor: { id: string; name: string; title: string; roles: string[] };
  needsAttention: Item[];
  routine: Item[];
  pendingApprovals: ApprovalRequest[];
  completedApprovals: number;
  insights: Insight[];
  recentAudit: AuditEvent[];
  counts: { total: number; unassessed: number; high: number };
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          Good morning, {data.actor.name.split(" ")[0]}
        </h1>
        <p className="muted text-sm">
          {data.counts.high} matter{data.counts.high === 1 ? "" : "s"} need you.{" "}
          {data.pendingApprovals.length} waiting on your approval.
        </p>
      </header>

      <Card title="Needs your attention">
        {data.needsAttention.length === 0 ? (
          <Empty>Nothing escalated right now.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.needsAttention.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/inbox/${m.id}`}
                  className="tap block rounded-lg border p-3 transition-colors"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={m.level} />
                    {m.injectionSuspected && (
                      <span className="badge badge-high">Instruction attempt</span>
                    )}
                    <span className="muted text-xs">{relativeTime(m.receivedAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug">{m.subject}</p>
                  <p className="muted text-xs">{m.from}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Approvals waiting"
        action={
          <Link href="/approvals" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            View all
          </Link>
        }
      >
        {data.pendingApprovals.length === 0 ? (
          <Empty>Nothing is waiting. Assess a message in the Inbox to create one.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.pendingApprovals.slice(0, 4).map((a) => (
              <li key={a.id} className="rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <RiskBadge level={a.risk} />
                  <span className="muted text-xs">
                    step {a.currentStep + 1} of {Math.max(a.decision.approvalChain.length, 1)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm font-medium leading-snug">{a.title}</p>
                <p className="muted mt-1 text-xs leading-snug">{a.decision.reason}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="Routine, ready for review">
          {data.routine.length === 0 ? (
            <Empty>Nothing routine.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {data.routine.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link href={`/inbox/${m.id}`} className="tap flex items-center gap-2 text-sm">
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: m.level === "medium" ? "var(--medium)" : "var(--low)" }}
                    />
                    <span className="truncate">{m.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your daily brief">
          <ul className="space-y-3">
            {data.insights.map((i) => (
              <li key={i.id}>
                <p className="text-sm font-medium leading-snug">{i.headline}</p>
                <p className="muted mt-1 text-xs leading-relaxed">{i.body.slice(0, 150)}…</p>
                <p className="mt-1 text-[11px]" style={{ color: "var(--accent)" }}>
                  {i.citations.map((c) => c.label).join(", ")}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Recent activity"
        action={
          <Link href="/audit" className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
            Audit history
          </Link>
        }
      >
        {data.recentAudit.length === 0 ? (
          <Empty>No activity yet this session.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.recentAudit.map((e) => (
              <li key={e.id} className="text-xs leading-relaxed">
                <span className="font-mono" style={{ color: "var(--accent)" }}>
                  {e.action}
                </span>{" "}
                <span className="muted">{relativeTime(e.at)}</span>
                <p className="muted">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
