"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  useEffect(() => {
    fetch("/api/emails")
      .then((r) => r.json())
      .then((d) => setRows(d.messages))
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="muted py-10 text-center text-sm">Loading…</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
        <p className="muted text-sm">
          CEO mailbox. Rows the acting identity may not see are withheld at the API,
          not hidden in the interface.
        </p>
      </header>

      {rows.length === 0 ? (
        <Empty>No messages.</Empty>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) =>
            row.redacted ? (
              <li key={row.id}>
                <Card className="opacity-80">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge badge-restricted">Withheld</span>
                    <span className="muted text-xs">{relativeTime(row.receivedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm leading-snug">{row.reason}</p>
                </Card>
              </li>
            ) : (
              <li key={row.id}>
                <Link
                  href={`/inbox/${row.id}`}
                  className="tap block rounded-xl border p-3 sm:p-4"
                  style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <RiskBadge level={row.assessedRisk ?? row.riskFloor} />
                    {row.external && <span className="badge badge-medium">External</span>}
                    {row.injectionSuspected && (
                      <span className="badge badge-high">Instruction attempt</span>
                    )}
                    {!row.assessed && <span className="muted text-[11px]">not yet assessed</span>}
                    <span className="muted ml-auto text-xs">{relativeTime(row.receivedAt)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-snug">{row.subject}</p>
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
      )}
    </div>
  );
}
