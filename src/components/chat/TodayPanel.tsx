"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ApprovalRequest, Insight, RiskLevel } from "@/core/contracts";
import { RiskBadge, relativeTime } from "@/components/primitives";
import { Icon } from "@/components/icons";

type Item = { id: string; subject: string; from: string; receivedAt: string; level: RiskLevel };
type Dashboard = {
  needsAttention: Item[];
  routine: Item[];
  pendingApprovals: ApprovalRequest[];
  insights: Insight[];
  counts: { total: number; high: number };
  triage: { needsMe: number; canWait: number; snoozed: number };
};
type Agenda = { events: { eventId: string; subject: string; start: string; end: string; ownerId: string }[]; actor: { id: string; timezone: string } };

/**
 * What used to be the overview page, now a side panel beside the chat:
 * today's numbers, what needs attention, and the brief. It reads the same
 * permission-filtered dashboard route, so nothing new is exposed here.
 */
export function TodayPanel({ approvalsEnabled, onClose, onAsk }: { approvalsEnabled: boolean; onClose: () => void; onAsk: (prompt: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [agenda, setAgenda] = useState<Agenda | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [dashboard, calendar] = await Promise.all([fetch("/api/dashboard"), fetch("/api/calendar-events")]);
      if (!dashboard.ok) throw new Error("dashboard");
      setData(await dashboard.json() as Dashboard);
      if (calendar.ok) setAgenda(await calendar.json() as Agenda);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Refresh after a booking or a reply lands in the thread.
    const refresh = () => void load();
    window.addEventListener("assistant:changed", refresh);
    return () => window.removeEventListener("assistant:changed", refresh);
  }, [load]);

  const timezone = agenda?.actor.timezone ?? "America/Los_Angeles";
  const upcoming = (agenda?.events ?? []).filter((event) => Date.parse(event.end) > Date.now()).slice(0, 3);

  return (
    <div className="today">
      <div className="today-head">
        <div>
          <p className="page-eyebrow">Today</p>
          <p className="today-date">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <button type="button" className="shell-icon-button" aria-label="Close Today panel" onClick={onClose}><Icon name="close" /></button>
      </div>

      {error && (
        <div className="today-section" role="alert">
          <p className="t-caption">Today&apos;s summary could not be loaded.</p>
          <button type="button" className="btn mt-2" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!data && !error && <div className="today-section" aria-busy="true"><div className="shimmer h-20 rounded-2xl" /><div className="shimmer mt-3 h-32 rounded-2xl" /></div>}

      {data && (
        <>
          <div className="today-stats" aria-label="Summary">
            <Stat value={data.triage.needsMe} label="Needs you" tone={data.counts.high ? "high" : "neutral"} />
            <Stat value={data.triage.canWait} label="Can wait" tone="neutral" />
            {approvalsEnabled && <Stat value={data.pendingApprovals.length} label="Awaiting approval" tone={data.pendingApprovals.length ? "medium" : "neutral"} />}
          </div>

          <section className="today-section" aria-labelledby="today-attention">
            <div className="today-section-head">
              <h2 id="today-attention">Most urgent</h2>
              <Link href="/inbox" className="card-link tap">Inbox</Link>
            </div>
            {data.needsAttention.length === 0 ? <p className="muted t-caption">Nothing urgent right now.</p> : (
              <ul className="today-list">
                {data.needsAttention.slice(0, 4).map((item) => (
                  <li key={item.id}>
                    <Link href={`/inbox/${item.id}`} className="today-row tap">
                      <span className="min-w-0">
                        <span className="today-row-title">{item.subject}</span>
                        <span className="muted t-caption">{item.from} · {relativeTime(item.receivedAt)}</span>
                      </span>
                      <RiskBadge level={item.level} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {approvalsEnabled && data.pendingApprovals.length > 0 && (
            <section className="today-section" aria-labelledby="today-decision">
              <div className="today-section-head">
                <h2 id="today-decision">Needs your decision</h2>
                <Link href="/approvals" className="card-link tap">Approvals</Link>
              </div>
              <ul className="today-list">
                {data.pendingApprovals.slice(0, 3).map((approval) => (
                  <li key={approval.id}><Link href="/approvals" className="today-row tap"><span className="today-row-title">{approval.title}</span><RiskBadge level={approval.risk} /></Link></li>
                ))}
              </ul>
            </section>
          )}

          <section className="today-section" aria-labelledby="today-next">
            <div className="today-section-head">
              <h2 id="today-next">Coming up</h2>
              <Link href="/schedule" className="card-link tap">Calendar</Link>
            </div>
            {upcoming.length === 0 ? <p className="muted t-caption">No meetings on your calendar yet.</p> : (
              <ul className="today-list">
                {upcoming.map((event) => (
                  <li key={event.eventId} className="today-event">
                    <span className="today-event-time">{new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(event.start))}</span>
                    <span className="today-row-title">{event.subject}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="today-section" aria-labelledby="today-brief">
            <div className="today-section-head">
              <h2 id="today-brief">Daily brief</h2>
              <button type="button" className="card-link tap" onClick={() => onAsk("Summarize today's business brief")}>Ask</button>
            </div>
            {data.insights.length === 0 ? <p className="muted t-caption">No approved brief for your function.</p> : (
              <ul className="today-list">
                {data.insights.map((insight) => (
                  <li key={insight.id} className="today-brief">
                    <p className="today-row-title">{insight.headline}</p>
                    <p className="cite mt-1">{insight.citations.map((citation) => citation.label).join(", ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ value, label, tone }: { value: number; label: string; tone: "high" | "medium" | "neutral" }) {
  return (
    <div className={`stat stat-${tone}`}>
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  );
}
