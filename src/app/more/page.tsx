"use client";

import Link from "next/link";
import { Card } from "@/components/primitives";

const ITEMS = [
  { href: "/insights", label: "Insights", blurb: "Function-specific briefs with citations" },
  { href: "/workspace", label: "Workspace", blurb: "Private brainstorming, saved on purpose" },
  { href: "/publish", label: "Publish", blurb: "Draft, check, review, export" },
  { href: "/controls", label: "Controls", blurb: "What the company can switch on and off" },
  { href: "/audit", label: "Audit history", blurb: "Every decision and who made it" },
];

export default function MorePage() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">More</h1>
      </header>
      <Card>
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link href={i.href} className="tap flex items-center justify-between gap-3 py-3">
                <span>
                  <span className="block text-sm font-medium">{i.label}</span>
                  <span className="muted block text-xs">{i.blurb}</span>
                </span>
                <span className="muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
