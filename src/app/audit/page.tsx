"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditEvent } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";

type Row = AuditEvent & { actorName: string };

export default function AuditPage() {
  const [events, setEvents] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/audit-events");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.events)) throw new Error("Invalid audit response");
      setEvents(body.events);
    } catch {
      setError("Audit history could not be loaded. Please try again.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!events && !error) return <p className="muted py-10 text-center text-sm" role="status">Loading audit history…</p>;

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Governance</p>
        <h1 className="t-title mt-2">Audit history</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Assessment, policy, approval, refusal, and connector activity for this signed-in
          demo session. Message bodies are not copied here.
        </p>
      </header>

      {error && (
        <Card title="Audit history unavailable">
          <p className="muted text-sm">{error}</p>
          <button type="button" className="btn mt-3" onClick={() => void load()}>Retry</button>
        </Card>
      )}

      {events?.length === 0 && !error ? (
        <Empty>No events yet. Work through the Inbox or Schedule to generate some.</Empty>
      ) : !error && events && events.length > 0 ? (
        <ul className="space-y-2">
          {events.map((e, index) => (
            <li key={e.id}>
              {/* A log is scanned top to bottom, so events are rows with a
                  hairline rule rather than nine separately floating cards. */}
              <Card className="enter" style={{ "--i": Math.min(index, 8) } as React.CSSProperties}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="audit-action">{e.action}</span>
                  {e.risk && <RiskBadge level={e.risk} />}
                  <span className="muted t-caption tnum ml-auto">{relativeTime(e.at)}</span>
                </div>
                <p className="t-caption mt-2 leading-relaxed">{e.detail}</p>
                <dl className="meta-grid">
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
      ) : null}
    </div>
  );
}

function Pair({ k, v }: { k: string; v: string }) {
  // Label above value, so the eye can run down one column of values instead of
  // re-parsing "key: value" on every line.
  return (
    <div className="min-w-0">
      <dt className="meta-key">{k}</dt>
      <dd className="meta-value break-words">{v}</dd>
    </div>
  );
}
