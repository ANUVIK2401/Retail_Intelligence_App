"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Responsive shell. One set of routes, two layouts:
 *  - phone: bottom navigation, five primary destinations
 *  - laptop: left sidebar with every permitted module
 */

const PRIMARY = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarIcon },
  { href: "/approvals", label: "Approvals", icon: CheckIcon },
  { href: "/more", label: "More", icon: MoreIcon },
];

const SECONDARY = [
  { href: "/insights", label: "Insights" },
  { href: "/workspace", label: "Workspace" },
  { href: "/publish", label: "Publish" },
  { href: "/controls", label: "Controls" },
  { href: "/audit", label: "Audit history" },
];

type SessionInfo = {
  actor: { id: string; name: string; title: string };
  options: { id: string; name: string; title: string; roles: string[] }[];
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => r.json())
      .then(setSession)
      .catch(() => setSession(null));
  }, [pathname]);

  async function switchActor(actorId: string) {
    await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ actorId }),
    });
    router.refresh();
    window.location.reload();
  }

  return (
    <div className="min-h-dvh sm:flex">
      {/* Laptop sidebar */}
      <aside
        className="hidden w-60 shrink-0 border-r p-4 sm:block"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider muted">
            Northline Retail Group
          </p>
          <p className="text-sm font-semibold">Executive Command Center</p>
        </div>
        <nav className="space-y-1">
          {[...PRIMARY.filter((p) => p.href !== "/more"), ...SECONDARY].map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isActive(pathname, item.href)}
            />
          ))}
        </nav>
        <ActorSwitcher session={session} onSwitch={switchActor} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header
          className="sticky top-0 z-20 border-b px-4 py-3 sm:hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider muted">
                Northline Retail Group
              </p>
              <p className="truncate text-sm font-semibold">
                {session?.actor.name ?? "Executive Command Center"}
              </p>
            </div>
            <select
              aria-label="Acting as"
              className="tap rounded-lg border px-2 text-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              value={session?.actor.id ?? ""}
              onChange={(e) => switchActor(e.target.value)}
            >
              {session?.options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </header>

        <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-28 pt-4 sm:px-6 sm:pb-10">
          {children}
        </main>

        {/* Phone bottom navigation */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t sm:hidden"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          {PRIMARY.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="tap flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium"
                style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                aria-current={active ? "page" : undefined}
              >
                <Icon />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function ActorSwitcher({
  session,
  onSwitch,
}: {
  session: SessionInfo | null;
  onSwitch: (id: string) => void;
}) {
  if (!session) return null;
  return (
    <div className="mt-8 border-t pt-4" style={{ borderColor: "var(--border)" }}>
      <label className="text-[11px] font-semibold uppercase tracking-wider muted">
        Acting as
      </label>
      <select
        className="tap mt-2 w-full rounded-lg border px-2 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        value={session.actor.id}
        onChange={(e) => onSwitch(e.target.value)}
      >
        {session.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name} — {o.title}
          </option>
        ))}
      </select>
      <p className="muted mt-2 text-[11px] leading-snug">
        Stands in for Microsoft Entra sign-in. Switching identity changes what the
        policy engine permits.
      </p>
    </div>
  );
}

function NavLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="tap flex items-center rounded-lg px-3 text-sm font-medium"
      style={{
        background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
        color: active ? "var(--accent)" : "var(--text)",
      }}
      aria-current={active ? "page" : undefined}
    >
      {label}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

/* Inline icons keep the bundle self-contained. */
function HomeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}
function InboxIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M3 13h5l1.5 3h5L16 13h5" />
      <path d="M4 5h16l1 8v6H3v-6z" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
function MoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

export { SECONDARY as SECONDARY_NAV };
