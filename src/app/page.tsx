"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/dashboard");
      if (!response.ok) throw new Error("The overview could not be loaded.");
      const payload = await response.json() as Dashboard | null;
      if (!payload?.actor?.name || !payload.counts ||
        !Array.isArray(payload.needsAttention) || !Array.isArray(payload.routine) ||
        !Array.isArray(payload.pendingApprovals) || !Array.isArray(payload.insights) ||
        !Array.isArray(payload.recentAudit)) {
        throw new Error("The overview returned an unexpected response.");
      }
      setData(payload);
    } catch {
      setError("The overview could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return error ? (
    <div className="load-error card" role="alert">
      <p className="t-section">Your overview is temporarily unavailable</p>
      <p className="muted t-caption mt-2">{error}</p>
      <button className="btn btn-primary mt-4" onClick={() => void load()}>Try again</button>
    </div>
  ) : <DashboardSkeleton />;

  const waiting = data.pendingApprovals.length;
  const priority = data.needsAttention[0];
  const remaining = data.needsAttention.slice(1);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="overview space-y-5">
      <header className="overview-hero enter" style={{ "--i": 0 } as React.CSSProperties}>
        <div className="overview-hero-top">
          <p className="overview-kicker"><span className="overview-kicker-mark" />Executive overview</p>
          <p className="overview-date">{today}</p>
        </div>
        <div className="overview-hero-copy">
          <p className="overview-role">{data.actor.title}</p>
          <h1 className="t-display mt-2">{greeting()}, {data.actor.name.split(" ")[0]}.</h1>
          <p className="overview-intro">
            {data.counts.high === 0 && waiting === 0
              ? "Your queue is clear. The command center is watching for what matters next."
              : "A clear view of what needs judgment, what can wait, and what has already moved."}
          </p>
        </div>
        <div className="overview-stats" aria-label="Queue summary">
          <Stat value={data.counts.high} label="Needs attention" tone={data.counts.high > 0 ? "high" : "neutral"} />
          <Stat value={waiting} label="Awaiting approval" tone={waiting > 0 ? "medium" : "neutral"} />
          <Stat value={data.counts.total} label="In the queue" tone="neutral" />
          <Stat value={data.completedApprovals} label="Decisions made" tone="neutral" />
        </div>
      </header>

      <div className="overview-grid">
        <Card title="Priority queue" className="overview-priority enter" style={{ "--i": 1 } as React.CSSProperties} action={<CardLink href="/inbox">Open inbox</CardLink>}>
          {priority ? (
            <>
              <Link href={`/inbox/${priority.id}`} className="priority-feature tap">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="priority-index">01 / {String(data.needsAttention.length).padStart(2, "0")}</span>
                  <RiskBadge level={priority.level} />
                  {priority.injectionSuspected && <span className="badge badge-high">Instruction attempt</span>}
                  <span className="priority-time">{relativeTime(priority.receivedAt)}</span>
                </div>
                <h2 className="priority-title">{priority.subject}</h2>
                <div className="priority-bottom">
                  <span>{priority.from}</span>
                  <span className="priority-action">{priority.assessed ? "Review matter" : "Assess matter"} <ArrowIcon /></span>
                </div>
              </Link>
              {remaining.length > 0 && (
                <ul className="priority-list">
                  {remaining.map((m, index) => (
                    <li key={m.id}>
                      <Link href={`/inbox/${m.id}`} className="priority-row tap">
                        <span className="priority-row-number">{String(index + 2).padStart(2, "0")}</span>
                        <span className="priority-row-copy">
                          <span className="priority-row-title">{m.subject}</span>
                          <span className="muted t-caption">{m.from} · {relativeTime(m.receivedAt)}</span>
                        </span>
                        <RiskBadge level={m.level} />
                        <ArrowIcon />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : <Empty>No escalations right now. Your priority queue is clear.</Empty>}
        </Card>

        <Card title="Decision desk" className="overview-approvals enter" style={{ "--i": 2 } as React.CSSProperties} action={<CardLink href="/approvals">All approvals</CardLink>}>
          {waiting === 0 ? (
            <div className="decision-empty">
              <span className="decision-empty-icon" aria-hidden="true">✓</span>
              <p className="t-section mt-3">Nothing waiting on a decision</p>
              <p className="muted t-caption mt-1">Assess a message to see its proposed action and approval path here.</p>
              <CardLink href="/inbox">Review inbox</CardLink>
            </div>
          ) : (
            <ul className="decision-list">
              {data.pendingApprovals.slice(0, 4).map((a) => {
                const steps = Math.max(a.decision.approvalChain.length, 1);
                return (
                  <li key={a.id}>
                    <Link href="/approvals" className="decision-row tap">
                      <div className="flex flex-wrap items-center gap-2"><RiskBadge level={a.risk} /><StepMeter current={a.currentStep} total={steps} /></div>
                      <p className="t-body mt-2 font-semibold leading-snug">{a.title}</p>
                      <p className="muted t-caption mt-1 leading-snug">{a.decision.reason}</p>
                      <span className="decision-row-action">Review approval <ArrowIcon /></span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Your daily brief" className="overview-brief enter" style={{ "--i": 3 } as React.CSSProperties} action={<CardLink href="/insights">Explore insights</CardLink>}>
          {data.insights.length === 0 ? <Empty>No approved brief is available for your function.</Empty> : (
            <ul className="brief-list">
              {data.insights.map((insight, index) => (
                <li key={insight.id} className="brief-story">
                  <span className="brief-number">0{index + 1}</span>
                  <div>
                    <h3 className="brief-headline">{insight.headline}</h3>
                    <p className="muted t-caption mt-1 leading-relaxed">{insight.body.length > 180 ? `${insight.body.slice(0, 180).trimEnd()}…` : insight.body}</p>
                    <p className="cite mt-2">{insight.citations.map((citation) => citation.label).join(", ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Routine in the queue" className="overview-routine enter" style={{ "--i": 4 } as React.CSSProperties} action={<CardLink href="/inbox">View queue</CardLink>}>
          {data.routine.length === 0 ? <Empty>Nothing routine to review.</Empty> : (
            <ul className="divide-list">
              {data.routine.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link href={`/inbox/${m.id}`} className="routine-row tap">
                    <span className="dot" style={{ background: m.level === "medium" ? "var(--medium)" : "var(--low)" }} />
                    <span className="routine-title">{m.subject}</span>
                    <span className="muted t-caption tnum routine-time">{relativeTime(m.receivedAt)}</span>
                    <ArrowIcon />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" className="overview-activity enter" style={{ "--i": 5 } as React.CSSProperties} action={<CardLink href="/audit">Audit history</CardLink>}>
          {data.recentAudit.length === 0 ? <Empty>No activity yet this session.</Empty> : (
            <ul className="audit-list">
              {data.recentAudit.map((e) => (
                <li key={e.id} className="audit-row">
                  <div className="flex flex-wrap items-baseline gap-2"><span className="audit-action">{e.action}</span><span className="muted t-micro tnum">{relativeTime(e.at)}</span></div>
                  <p className="muted t-caption mt-0.5">{e.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
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

function ArrowIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
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
