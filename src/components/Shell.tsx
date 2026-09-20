"use client";

import Link from "next/link";
import { ThemeSelector } from "./ThemeSelector";
import { AssistantPanel } from "./AssistantPanel";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

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

const WORK_NAV = [
  { href: "/", label: "Overview", icon: HomeIcon },
  { href: "/inbox", label: "Inbox", icon: InboxIcon },
  { href: "/schedule", label: "Schedule", icon: CalendarIcon },
  { href: "/approvals", label: "Approvals", icon: CheckIcon },
];

const INTELLIGENCE_NAV = [
  { href: "/insights", label: "Insights", icon: SparkIcon },
  { href: "/workspace", label: "Workspace", icon: WorkspaceIcon },
  { href: "/publish", label: "Publish", icon: PublishIcon },
];

const ORGANIZATION_NAV = [
  { href: "/org-chart", label: "Org hierarchy", icon: OrgIcon },
  { href: "/controls", label: "Controls", icon: ControlsIcon },
  { href: "/audit", label: "Audit history", icon: AuditIcon },
];

/** Shown only to administrators, and the route enforces that independently. */
const ADMIN_NAV = [{ href: "/admin", label: "Administration", icon: AdminIcon }];

type SessionInfo = {
  actor: { id: string; name: string; title: string };
  member: { name: string; email: string };
  /** Server-derived. Only controls whether the console link is shown; the
   *  admin API re-checks it and never trusts the client. */
  admin?: boolean;
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantCloseRef = useRef<HTMLButtonElement>(null);
  const assistantRailRef = useRef<HTMLElement>(null);
  const assistantLauncherRef = useRef<HTMLButtonElement>(null);
  const mobileAssistantLauncherRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  function closeAssistant() {
    setAssistantOpen(false);
    requestAnimationFrame(() => {
      const launcher = window.matchMedia("(max-width: 639px)").matches
        ? mobileAssistantLauncherRef.current : assistantLauncherRef.current;
      launcher?.focus();
    });
  }

  useEffect(() => setAssistantOpen(false), [pathname]);
  useEffect(() => {
    if (!assistantOpen) return;
    assistantCloseRef.current?.focus();
    const sidebar = sidebarRef.current;
    const content = contentRef.current;
    if (sidebar) sidebar.inert = true;
    if (content) content.inert = true;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant();
      if (event.key !== "Tab") return;
      const focusable = [...(assistantRailRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (sidebar) sidebar.inert = false;
      if (content) content.inert = false;
    };
  }, [assistantOpen]);

  useEffect(() => {
    if (pathname === "/sign-in") return;
    fetch("/api/session")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setSession(data?.actor ? data : null))
      .catch(() => setSession(null));
  }, [pathname]);

  if (pathname === "/sign-in") return <>{children}</>;

  return (
    <div className="app-frame min-h-dvh sm:flex">
      <a className="skip-link btn" href="#main-content">Skip to content</a>
      {/* Laptop sidebar */}
      <aside
        ref={sidebarRef}
        className="app-sidebar hidden w-64 shrink-0 border-r p-4 sm:flex sm:flex-col"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="app-brand mb-7 flex items-center gap-3 px-2 pt-2">
          <div className="app-brand-mark" aria-hidden="true"><span>PS</span></div>
          <div className="min-w-0">
            <p className="app-brand-label">PacSun</p>
            <p className="app-brand-title">Executive Command Center</p>
          </div>
        </div>
        <nav aria-label="Main navigation" className="app-nav flex-1 space-y-5">
          <NavGroup title="Daily work" items={WORK_NAV} pathname={pathname} />
          <NavGroup title="Intelligence" items={INTELLIGENCE_NAV} pathname={pathname} />
          <NavGroup title="People & governance" items={ORGANIZATION_NAV} pathname={pathname} />
          {session?.admin && (
            <NavGroup title="Deployment" items={ADMIN_NAV} pathname={pathname} />
          )}
        </nav>
        <div className="app-sidebar-footer">
          <MemberPanel session={session} />
        </div>
      </aside>

      <div ref={contentRef} className="flex min-w-0 flex-1 flex-col">
        {/* Phone header */}
        <header
          className="material-bar sticky top-0 z-20 border-b px-4 py-3 sm:hidden"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-wider muted">
                PacSun
              </p>
              <p className="truncate text-sm font-semibold">
                {session?.member?.name ?? session?.actor.name ?? "Executive Command Center"}
              </p>
            </div>
            <div className="flex flex-none items-center gap-1.5">
              <span className="toolbar-slot"><ThemeSelector /></span>
              <button ref={mobileAssistantLauncherRef} type="button" onClick={() => setAssistantOpen(true)} className="mobile-assistant-button tap" aria-label="Open executive assistant" aria-expanded={assistantOpen}><SparkIcon /></button>
              <button type="button" onClick={() => signOut({ callbackUrl: "/sign-in" })} className="member-signout tap" title="Sign out" aria-label="Sign out">↗</button>
            </div>
          </div>
        </header>

        {/* Desktop toolbar. The theme control sits top right, where macOS and
            every desktop app put display preferences. */}
        <div className="notice-bar border-b px-4 py-2.5 sm:px-6">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
            <p className="notice-text t-caption">
              <span className="notice-dot" aria-hidden="true" />
              <strong>Demo environment</strong><span className="notice-separator" aria-hidden="true" />Synthetic records only. Do not enter confidential information.
            </p>
            <span className="toolbar-slot hidden flex-none sm:inline-flex"><ThemeSelector /></span>
          </div>
        </div>

        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-7 sm:pb-12 sm:pt-6">
          {children}
        </main>

        {/* Phone bottom navigation */}
        <nav
          aria-label="Main navigation"
          className="material-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] sm:hidden"
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

      {assistantOpen && <button type="button" className="assistant-backdrop" aria-label="Close assistant" onClick={closeAssistant} />}
      <aside ref={assistantRailRef} className={`assistant-rail ${assistantOpen ? "assistant-rail-open" : ""}`} aria-label="Executive assistant">
        <div className="assistant-rail-mobile-head">
          <span className="text-sm font-semibold">Executive assistant</span>
          <button ref={assistantCloseRef} type="button" className="tap assistant-close" aria-label="Close assistant" onClick={closeAssistant}>×</button>
        </div>
        <AssistantPanel />
      </aside>
      <button
        ref={assistantLauncherRef}
        type="button"
        className="assistant-launcher tap"
        aria-label="Open executive assistant"
        aria-expanded={assistantOpen}
        onClick={() => setAssistantOpen(true)}
      >
        <SparkIcon /><span>Ask assistant</span>
      </button>
    </div>
  );
}

function MemberPanel({ session }: { session: SessionInfo | null }) {
  if (!session) return null;
  return (
    <div className="member-panel">
      <div className="member-avatar" aria-hidden="true">{session.member?.name?.split(" ").map((part) => part[0]).slice(0, 2).join("") || "M"}</div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{session.member?.name ?? session.actor.name}</p>
        <p className="muted truncate text-xs">{session.actor.title}</p>
      </div>
      <button type="button" onClick={() => signOut({ callbackUrl: "/sign-in" })} className="member-signout tap" title="Sign out" aria-label="Sign out">↗</button>
    </div>
  );
}

function NavGroup({ title, items, pathname }: { title: string; items: { href: string; label: string; icon: () => React.JSX.Element }[]; pathname: string }) {
  return (
    <div>
      <p className="app-nav-label">{title}</p>
      <div className="space-y-0.5">
        {items.map((item) => <NavLink key={item.href} href={item.href} label={item.label} icon={item.icon} active={isActive(pathname, item.href)} />)}
      </div>
    </div>
  );
}

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: () => React.JSX.Element;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className="app-nav-link tap flex items-center gap-3 rounded-xl px-3 text-sm font-medium"
      style={{
        background: active ? "color-mix(in srgb, var(--accent) 12%, transparent)" : "transparent",
        color: active ? "var(--accent)" : "var(--text)",
      }}
      aria-current={active ? "page" : undefined}
    >
      <Icon />{label}
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
function SparkIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" /></svg>;
}
function WorkspaceIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M8 4v16M11 9h7M11 13h5" /></svg>;
}
function PublishIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 16V3m0 0L8 7m4-4 4 4M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>;
}
function OrgIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="2" y="17" width="6" height="5" rx="1" /><rect x="16" y="17" width="6" height="5" rx="1" /><path d="M12 7v5M5 17v-5h14v5" /></svg>;
}
function ControlsIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" fill="var(--surface)" /><circle cx="16" cy="17" r="2" fill="var(--surface)" /></svg>;
}
function AuditIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M7 3h10l4 4v14H3V3h4zm10 0v5h4M7 12h10M7 16h7" /></svg>;
}

export { SECONDARY as SECONDARY_NAV };

function AdminIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l7 3v5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6z" /><path d="M9.5 12.2l1.8 1.8 3.4-3.6" /></svg>;
}
