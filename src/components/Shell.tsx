"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import { ThemeSelector } from "./ThemeSelector";
import { ExecutiveOnboarding } from "./ExecutiveOnboarding";
import { Icon } from "./icons";
import { SessionProvider, type SessionInfo } from "./session";
import { askPrefillFor, navFor, navItemFor, type NavItem } from "@/config/nav";
import { PRODUCT } from "@/config/product";

/**
 * GPT-style shell: left navigation, the page in the center, and (on the chat
 * page) an optional right panel the page renders itself.
 *  - laptop: sidebar always visible
 *  - phone: sidebar becomes a drawer behind a menu button
 * The same nav config drives both, so they cannot drift.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tourRequest, setTourRequest] = useState(0);
  const sidebarRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const sections = useMemo(
    () => navFor({ approvals: session?.features.approvals ?? false, admin: Boolean(session?.admin) }),
    [session],
  );
  const current = navItemFor(pathname, sections);
  const onChat = pathname === "/";

  useEffect(() => setDrawerOpen(false), [pathname]);

  useEffect(() => {
    if (pathname === "/sign-in") return;
    fetch("/api/session")
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setSession(data?.actor ? data as SessionInfo : null))
      .catch(() => setSession(null));
  }, [pathname]);

  // The drawer is modal on phones: trap focus, close on Escape, and make the
  // page behind it inert so a screen reader cannot wander off.
  useEffect(() => {
    if (!drawerOpen) return;
    const content = contentRef.current;
    if (content) content.inert = true;
    sidebarRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
      }
      if (event.key !== "Tab") return;
      const focusable = [...(sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), summary") ?? [])]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (content) content.inert = false;
    };
  }, [drawerOpen]);

  if (pathname === "/sign-in") return <>{children}</>;

  function ask() {
    const prefill = askPrefillFor(pathname);
    router.push(prefill ? `/?ask=${encodeURIComponent(prefill)}` : "/");
  }

  function newChat() {
    window.dispatchEvent(new CustomEvent("assistant:new-chat"));
    if (!onChat) router.push("/?new=1");
    setDrawerOpen(false);
  }

  return (
    <SessionProvider value={session}>
      <div className="shell" data-drawer={drawerOpen ? "open" : "closed"}>
        <a className="skip-link btn" href="#main-content">Skip to content</a>

        <aside ref={sidebarRef} className="shell-sidebar" aria-label="Navigation">
          <div className="shell-brand">
            <div className="app-brand-mark" aria-hidden="true"><span>PS</span></div>
            <div className="min-w-0">
              <p className="app-brand-label">{PRODUCT.org}</p>
              <p className="app-brand-title">{PRODUCT.title}</p>
            </div>
            <button type="button" className="shell-icon-button shell-drawer-close" aria-label="Close menu" onClick={() => { setDrawerOpen(false); menuButtonRef.current?.focus(); }}>
              <Icon name="close" />
            </button>
          </div>

          <button type="button" className="shell-new-chat tap" onClick={newChat}>
            <Icon name="plus" size={18} />New chat
          </button>

          <nav aria-label="Main navigation" className="shell-nav">
            <ul>
              {sections.main.map((item) => <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} />)}
            </ul>
            <details className="shell-settings" open={sections.settings.some((item) => isActive(pathname, item.href)) || undefined}>
              <summary className="tap"><span>Settings</span><Icon name="arrow" size={14} /></summary>
              <ul>
                {sections.settings.map((item) => <NavRow key={item.href} item={item} active={isActive(pathname, item.href)} />)}
              </ul>
            </details>
          </nav>

          <div className="shell-sidebar-footer">
            <span className="toolbar-slot"><ThemeSelector /></span>
            {session && (
              <div className="member-panel">
                <div className="member-avatar" aria-hidden="true">{initials(session.member?.name ?? session.actor.name)}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{session.member?.name ?? session.actor.name}</p>
                  <p className="muted truncate text-xs">{session.actor.title}</p>
                </div>
                <button type="button" onClick={() => { setDrawerOpen(false); setTourRequest((request) => request + 1); }} className="member-signout tap px-2 text-xs font-semibold" title="Open tour" aria-label="Open tour">Tour</button>
                <button type="button" onClick={() => signOut({ callbackUrl: "/sign-in" })} className="member-signout tap" title="Sign out" aria-label="Sign out">↗</button>
              </div>
            )}
          </div>
        </aside>

        {drawerOpen && <button type="button" className="shell-backdrop" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />}

        <div ref={contentRef} className="shell-main">
          <header className="shell-topbar material-bar">
            <button ref={menuButtonRef} type="button" className="shell-icon-button shell-menu-button" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
              <Icon name="menu" />
            </button>
            <p className="shell-topbar-title">{onChat ? PRODUCT.shortName : current?.label ?? PRODUCT.shortName}</p>
            <p className="shell-demo-note t-caption"><span className="notice-dot" aria-hidden="true" />Synthetic demo data. Do not enter confidential information.</p>
            {!onChat && (
              <button type="button" className="shell-ask tap" onClick={ask} aria-label={`Ask the ${PRODUCT.shortName}`}>
                <Icon name="spark" size={17} /><span>Ask</span>
              </button>
            )}
            {onChat && (
              <button type="button" className="shell-icon-button shell-topbar-new" aria-label="New chat" onClick={newChat}>
                <Icon name="plus" />
              </button>
            )}
          </header>

          <main id="main-content" tabIndex={-1} className={onChat ? "shell-content shell-content-chat" : "shell-content shell-content-page"}>
            {children}
          </main>
        </div>

        {session && <ExecutiveOnboarding actor={session.actor} openRequest={tourRequest} />}
      </div>
    </SessionProvider>
  );
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <li>
      <Link href={item.href} className="shell-nav-link tap" aria-current={active ? "page" : undefined} title={item.description}>
        <Icon name={item.icon} size={19} />
        <span>{item.label}</span>
      </Link>
    </li>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("") || "M";
}
