import type { NavIcon } from "@/config/nav";

/* Inline icons keep the bundle self-contained. Stroke icons, 1.8 weight. */
const PATHS: Record<NavIcon | "menu" | "close" | "mic" | "send" | "spark" | "panel" | "plus" | "check" | "clock" | "arrow" | "stop", React.ReactNode> = {
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  inbox: <><path d="M3 13h5l1.5 3h5L16 13h5" /><path d="M4 5h16l1 8v6H3v-6z" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  approvals: <path d="M20 6 9 17l-5-5" />,
  projects: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  notes: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  posts: <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13 7 4 4" /></>,
  insights: <path d="m12 2 2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" />,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.8c1.7.6 2.8 2.3 3.2 5.2" /></>,
  controls: <><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="2" /><circle cx="16" cy="17" r="2" /></>,
  audit: <path d="M7 3h10l4 4v14H3V3h4zm10 0v5h4M7 12h10M7 16h7" />,
  admin: <><path d="M12 3l7 3v5c0 4.2-2.8 7.6-7 9-4.2-1.4-7-4.8-7-9V6z" /><path d="M9.5 12.2l1.8 1.8 3.4-3.6" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  send: <path d="M12 19V5m0 0-6 6m6-6 6 6" />,
  spark: <path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9z" />,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M15 4v16" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M20 6 9 17l-5-5" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
