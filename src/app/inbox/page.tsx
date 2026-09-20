"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { RiskLevel } from "@/core/contracts";
import { Card, Empty, RiskBadge, relativeTime } from "@/components/primitives";

type Row =
  | {
      id: string;
      redacted: true;
      reason: string;
      receivedAt: string;
      riskFloor: RiskLevel;
    }
  | {
      id: string;
      redacted: false;
      subject: string;
      from: string;
      fromTitle: string;
      external: boolean;
      receivedAt: string;
      preview: string;
      riskFloor: RiskLevel;
      injectionSuspected: boolean;
      assessed: boolean;
      assessedRisk: RiskLevel | null;
      topic: string;
    };

export default function InboxPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/emails");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The inbox could not be loaded.");
      if (!Array.isArray(data.messages)) throw new Error("The inbox returned an unexpected response.");
      setRows(data.messages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The inbox could not be loaded.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Daily work</p>
        <h1 className="t-title mt-2">Inbox</h1>
        <p className="muted t-body mt-2 max-w-prose">
          CEO mailbox. Rows the acting identity may not see are withheld at the API,
          not hidden in the interface.
        </p>
      </header>

      {error && (
        <Card>
          <p className="text-sm" role="alert">{error}</p>
          <button className="btn mt-3" onClick={() => void load()}>Retry loading inbox</button>
        </Card>
      )}

      {!rows && !error && <Card><p className="muted text-sm" role="status">Loading inbox…</p></Card>}

      {rows?.length === 0 && !error ? (
        <Empty>No messages.</Empty>
      ) : rows && !error ? (
        <ul className="space-y-2">
          {rows.map((row) =>
            row.redacted ? (
              <li key={row.id}>
                <Card className="opacity-80">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-restricted">Withheld</span>
                    <span className="muted t-caption tnum">{relativeTime(row.receivedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-snug">{row.reason}</p>
                </Card>
              </li>
            ) : (
              <li key={row.id}>
                <Link
                  href={`/inbox/${row.id}`}
                  className="tap row-item card-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={row.assessedRisk ?? row.riskFloor} />
                    {row.external && <span className="badge badge-medium">External</span>}
                    {row.injectionSuspected && (
                      <span className="badge badge-high">Instruction attempt</span>
                    )}
                    {!row.assessed && <span className="muted text-[11px]">not yet assessed</span>}
                    <span className="muted t-caption tnum ml-auto">{relativeTime(row.receivedAt)}</span>
                  </div>
                  <p className="t-body mt-2 font-semibold leading-snug">{row.subject}</p>
                  <p className="muted text-xs">
                    {row.from}
                    {row.fromTitle ? ` · ${row.fromTitle}` : ""}
                  </p>
                  <p className="muted mt-1.5 line-clamp-2 text-xs leading-relaxed">
                    {row.preview}…
                  </p>
                </Link>
              </li>
            ),
          )}
        </ul>
      ) : null}
    </div>
  );
}
