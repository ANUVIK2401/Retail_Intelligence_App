import { OrgChart } from "@/components/OrgChart";

export default function OrgChartPage() {
  return (
    <div className="space-y-5">
      <header className="org-page-header">
        <div>
          <p className="org-eyebrow">People & governance</p>
          <h1 className="text-2xl font-semibold tracking-tight">Organization hierarchy</h1>
          <p className="muted mt-2 max-w-2xl text-sm leading-relaxed">
            See who reports to whom in PacSun&apos;s synthetic directory.
            Reporting lines do not grant access or approval authority on their own.
          </p>
        </div>
      </header>

      <section className="card p-5" aria-label="Founder and board overview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="org-eyebrow">Governance layer</p>
            <h2 className="mt-1 text-lg font-semibold">Founders & board</h2>
          </div>
          <span className="muted text-xs">Roster pending</span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <p className="text-sm font-semibold">Founder seats</p>
            <p className="muted mt-1 text-xs">No founder identities are configured in the synthetic directory.</p>
          </div>
          <div className="rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
            <p className="text-sm font-semibold">Board of directors</p>
            <p className="muted mt-1 text-xs">No board roster or governance relationships are configured yet.</p>
          </div>
        </div>
      </section>

      <OrgChart />

      <aside className="org-note" aria-label="Directory coverage">
        <div className="org-note-mark" aria-hidden="true">i</div>
        <div>
          <h2 className="text-sm font-semibold">Board and founder records are not configured</h2>
          <p className="muted mt-1 text-sm leading-relaxed">
            This prototype directory identifies a CEO and executive reporting lines, but contains no verified founders or board members. Add those records before showing a board hierarchy. Calendar availability is separate from reporting structure and is not inferred here.
          </p>
        </div>
      </aside>
    </div>
  );
}
