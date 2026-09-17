"use client";

import { useEffect, useState } from "react";
import type { AuditEvent } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";

type Row = AuditEvent & { actorName: string };

export default function AuditPage() {
  const [events, setEvents] = useState<Row[] | null>(null);

  useEffect(() => {
    fetch("/api/audit-events")
      .then((r) => r.json())
      .then((d) => setEvents(d.events))
      .catch(() => setEvents([]));
  }, []);

  if (!events) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Audit history</h1>
        <p className="muted text-sm">
          Every assessment, policy outcome, approval, refusal, and connector call. Message
          bodies are not copied here.
        </p>
      </header>

      {events.length === 0 ? (
        <Empty>No events yet. Work through the Inbox or Schedule to generate some.</Empty>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold" style={{ color: "var(--accent)" }}>
                    {e.action}
                  </span>
                  {e.risk && <RiskBadge level={e.risk} />}
                  <span className="muted ml-auto text-xs">{relativeTime(e.at)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-relaxed">{e.detail}</p>
                <dl className="muted mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono text-[11px] sm:grid-cols-4">
                  <Pair k="actor" v={`${e.actorName} (${e.actorRole})`} />
                  <Pair k="resource" v={`${e.resourceType}/${e.resourceId}`} />
                  <Pair k="outcome" v={e.outcome} />
                  <Pair k="correlation" v={e.correlationId} />
                  {e.policyVersion && <Pair k="policy" v={e.policyVersion} />}
                  {e.aiModel && <Pair k="model" v={e.aiModel} />}
                  {e.promptVersion && <Pair k="prompt" v={e.promptVersion} />}
                  {e.matchedRules.length > 0 && <Pair k="rules" v={e.matchedRules.join(" ")} />}
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="inline">{k}: </dt>
      <dd className="inline break-words">{v}</dd>
    </div>
  );
}
