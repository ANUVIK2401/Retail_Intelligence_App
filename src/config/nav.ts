/**
 * The one navigation map. The desktop sidebar and the phone drawer both
 * render from `navFor()`, so a label changes in one place.
 *
 * Sept 23 review: chat first, plain names, at most two groups, governance
 * tucked under Settings rather than presented as daily work.
 */
export type NavIcon =
  | "chat" | "inbox" | "calendar" | "approvals" | "projects" | "notes" | "posts"
  | "insights" | "people" | "controls" | "audit" | "admin";

export type NavItem = { href: string; label: string; icon: NavIcon; description: string };

export type NavSections = { main: NavItem[]; settings: NavItem[] };

const CHAT: NavItem = { href: "/", label: "Chat", icon: "chat", description: "Ask for anything in plain words" };
const INBOX: NavItem = { href: "/inbox", label: "Inbox", icon: "inbox", description: "Reply fully, quickly, or later" };
const CALENDAR: NavItem = { href: "/schedule", label: "Calendar", icon: "calendar", description: "Your week and new meeting times" };
const APPROVALS: NavItem = { href: "/approvals", label: "Approvals", icon: "approvals", description: "Items waiting on a sign-off" };
const PROJECTS: NavItem = { href: "/projects", label: "Projects", icon: "projects", description: "Email, meetings, and people by initiative" };
const NOTES: NavItem = { href: "/workspace", label: "Notes", icon: "notes", description: "Private notes, ideas, and reminders" };
const POSTS: NavItem = { href: "/publish", label: "Posts", icon: "posts", description: "LinkedIn and professional drafts" };
const INSIGHTS: NavItem = { href: "/insights", label: "Insights", icon: "insights", description: "Business signals with sources" };
const PEOPLE: NavItem = { href: "/org-chart", label: "People", icon: "people", description: "Who reports to whom" };
const CONTROLS: NavItem = { href: "/controls", label: "Controls", icon: "controls", description: "What the assistant may do" };
const AUDIT: NavItem = { href: "/audit", label: "Audit history", icon: "audit", description: "Everything the assistant did" };
const ADMIN: NavItem = { href: "/admin", label: "Administration", icon: "admin", description: "Members and access" };

export function navFor(options: { approvals: boolean; admin: boolean }): NavSections {
  return {
    main: [CHAT, INBOX, CALENDAR, ...(options.approvals ? [APPROVALS] : []), PROJECTS, NOTES, POSTS, INSIGHTS, PEOPLE],
    settings: [CONTROLS, AUDIT, ...(options.admin ? [ADMIN] : [])],
  };
}

/** Page title for the phone header and the "Ask" prefill. */
export function navItemFor(pathname: string, sections: NavSections): NavItem | undefined {
  const all = [...sections.main, ...sections.settings];
  return all.find((item) => item.href === pathname) ?? all.filter((item) => item.href !== "/").find((item) => pathname.startsWith(item.href));
}

/** What the chat composer starts with when opened from a page's "Ask" button. */
export function askPrefillFor(pathname: string): string {
  if (pathname.startsWith("/inbox")) return "What emails need my attention?";
  if (pathname.startsWith("/schedule")) return "Find 30 minutes next week with ";
  if (pathname.startsWith("/projects")) return "What's pending on ";
  if (pathname.startsWith("/insights")) return "Summarize today's business brief";
  if (pathname.startsWith("/org-chart")) return "Find time with ";
  return "";
}
