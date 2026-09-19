import type { CSSProperties, ReactNode } from "react";
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
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Carries the `--i` stagger index for entrance motion. */
  style?: CSSProperties;
}) {
  return (
    <section className={`card p-4 sm:p-5 ${className}`} style={style}>
      {(title || action) && (
        <header className="card-head">
          {typeof title === "string" ? (
            <h2 className="t-section">{title}</h2>
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
  // The reason is written for an executive to read, so it is set as an aside
  // with a rule, not as a grey code-style slab.
  return <p className="reason t-caption">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      <p className="muted t-caption">{children}</p>
    </div>
  );
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
