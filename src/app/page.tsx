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

/** Before noon it is morning; the greeting should match the user's clock. */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data) return <DashboardSkeleton />;

  const waiting = data.pendingApprovals.length;

  return (
    <div className="space-y-5">
      {/* Hero. The two figures an executive checks first get display type;
          everything else on the page is deliberately smaller than this. */}
      <header className="page-head enter" style={{ "--i": 0 } as React.CSSProperties}>
        <p className="page-eyebrow">{data.actor.title}</p>
        <h1 className="t-display mt-2.5">
          {greeting()}, {data.actor.name.split(" ")[0]}
        </h1>
        <p className="muted t-body mt-2 max-w-prose">
          {data.counts.high === 0 && waiting === 0
            ? "Nothing is escalated and nothing is waiting on you."
            : "The assistant has assessed the queue. Every consequential action below still needs your approval."}
        </p>

        <div className="stat-grid mt-6">
          {/* Tone is earned, not decorative: a count only takes a colour when
              the count itself means something needs doing. Zero is neutral. */}
          <Stat
            value={data.counts.high}
            label="Need you"
            tone={data.counts.high > 0 ? "high" : "neutral"}
          />
          <Stat
            value={waiting}
            label="Awaiting approval"
            tone={waiting > 0 ? "medium" : "neutral"}
          />
          <Stat value={data.counts.total} label="In queue" tone="neutral" />
          <Stat value={data.completedApprovals} label="Decided" tone="neutral" />
        </div>
      </header>

      <Card
        title="Needs your attention"
        className={`enter ${data.needsAttention.length > 0 ? "card-attention" : ""}`}
        style={{ "--i": 1 } as React.CSSProperties}
      >
        {data.needsAttention.length === 0 ? (
          <Empty>Nothing escalated right now.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.needsAttention.map((m) => (
              <li key={m.id}>
                <Link href={`/inbox/${m.id}`} className="tap row-item">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={m.level} />
                    {m.injectionSuspected && (
                      <span className="badge badge-high">Instruction attempt</span>
                    )}
                    <span className="muted t-caption tnum ml-auto">
                      {relativeTime(m.receivedAt)}
                    </span>
                  </div>
                  <p className="t-body mt-2 font-semibold leading-snug">{m.subject}</p>
                  <p className="muted t-caption mt-0.5">{m.from}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Approvals waiting"
        className="enter"
        style={{ "--i": 2 } as React.CSSProperties}
        action={<CardLink href="/approvals">View all</CardLink>}
      >
        {waiting === 0 ? (
          <Empty>Nothing is waiting. Assess a message in the Inbox to create one.</Empty>
        ) : (
          <ul className="space-y-2">
            {data.pendingApprovals.slice(0, 4).map((a) => {
              const steps = Math.max(a.decision.approvalChain.length, 1);
              return (
                <li key={a.id} className="row-item">
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={a.risk} />
                    <StepMeter current={a.currentStep} total={steps} />
                  </div>
                  <p className="t-body mt-2 font-semibold leading-snug">{a.title}</p>
                  <p className="muted t-caption mt-1 leading-snug">{a.decision.reason}</p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          title="Routine, ready for review"
          className="enter"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          {data.routine.length === 0 ? (
            <Empty>Nothing routine.</Empty>
          ) : (
            <ul className="divide-list">
              {data.routine.slice(0, 5).map((m) => (
                <li key={m.id}>
                  {/* min-w-0: a flex child defaults to min-width:auto, so the
                      truncating span below grows to its full text width and
                      pushes the card past the viewport on a phone. */}
                  <Link href={`/inbox/${m.id}`} className="tap quiet-row flex min-w-0 items-center gap-2.5">
                    <span
                      className="dot"
                      style={{ background: m.level === "medium" ? "var(--medium)" : "var(--low)" }}
                    />
                    <span className="t-caption truncate">{m.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Your daily brief"
          className="enter"
          style={{ "--i": 4 } as React.CSSProperties}
        >
          <ul className="space-y-3.5">
            {data.insights.map((i) => (
              <li key={i.id} className="brief-item">
                <p className="t-body font-semibold leading-snug">{i.headline}</p>
                <p className="muted t-caption mt-1 leading-relaxed">{i.body.slice(0, 150)}…</p>
                <p className="cite mt-1.5">{i.citations.map((c) => c.label).join(", ")}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        title="Recent activity"
        className="enter"
        style={{ "--i": 5 } as React.CSSProperties}
        action={<CardLink href="/audit">Audit history</CardLink>}
      >
        {data.recentAudit.length === 0 ? (
          <Empty>No activity yet this session.</Empty>
        ) : (
          <ul className="audit-list">
            {data.recentAudit.map((e) => (
              <li key={e.id} className="audit-row">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="audit-action">{e.action}</span>
                  <span className="muted t-micro tnum">{relativeTime(e.at)}</span>
                </div>
                <p className="muted t-caption mt-0.5">{e.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "high" | "medium" | "low" | "neutral" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <p className="stat-value">{value}</p>
      {/* The label carries the meaning; the coloured rail only reinforces it. */}
      <p className="stat-label">{label}</p>
    </div>
  );
}

/** Approval progress as ticks rather than "step 1 of 3" in muted 11px. */
function StepMeter({ current, total }: { current: number; total: number }) {
  return (
    <span className="step-meter" aria-label={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className="step-tick" data-done={index <= current ? "true" : undefined} />
      ))}
      <span className="muted t-micro tnum">{current + 1}/{total}</span>
    </span>
  );
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="tap card-link">
      {children}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="m9 5 7 7-7 7" />
      </svg>
    </Link>
  );
}

/** Shape-matched placeholder, so the layout does not jump when data lands. */
function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="page-head">
        <div className="shimmer h-3 w-28 rounded-full" />
        <div className="shimmer mt-4 h-9 w-64 max-w-full rounded-xl" />
        <div className="stat-grid mt-6">
          {[0, 1, 2, 3].map((i) => <div key={i} className="shimmer h-[86px] rounded-2xl" />)}
        </div>
      </div>
      <div className="shimmer h-40 rounded-3xl" />
      <div className="shimmer h-32 rounded-3xl" />
    </div>
  );
}
