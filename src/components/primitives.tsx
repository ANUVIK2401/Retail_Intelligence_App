import type { ReactNode } from "react";
import type { RiskLevel } from "@/core/contracts";

export function RiskBadge({ level }: { level: RiskLevel }) {
  const label: Record<RiskLevel, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    restricted: "Restricted",
  };
  // Text carries the meaning; color is reinforcement only.
  return <span className={`badge badge-${level}`}>{label[level]} risk</span>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const tone =
    outcome === "allow"
      ? "low"
      : outcome === "require_approval" || outcome === "route_through_assistant"
        ? "medium"
        : outcome === "deny"
          ? "restricted"
          : "high";
  const label = outcome.replace(/_/g, " ");
  return <span className={`badge badge-${tone}`}>{label}</span>;
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`}>
      {(title || action) && (
        <header className="mb-3 flex items-start justify-between gap-3">
          {typeof title === "string" ? (
            <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          ) : (
            title
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Reason({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-2 rounded-lg px-3 py-2 text-[13px] leading-relaxed"
      style={{ background: "color-mix(in srgb, var(--border) 35%, transparent)" }}
    >
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="muted py-6 text-center text-sm">{children}</p>;
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
