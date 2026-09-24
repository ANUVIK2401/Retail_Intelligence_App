import { OrgChart } from "@/components/OrgChart";

export default function OrgChartPage() {
  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">Directory</p>
        <h1 className="t-title mt-2">People</h1>
        <p className="muted t-body mt-2 max-w-prose">
          Who reports to whom across the leadership team. The assistant uses this to route
          meeting requests; access and approval authority are granted separately.
        </p>
      </header>

      <OrgChart />

      <aside className="org-note" aria-label="Directory coverage">
        <div className="org-note-mark" aria-hidden="true">i</div>
        <div>
          <h2 className="text-sm font-semibold">Directory coverage</h2>
          <p className="muted mt-1 text-sm leading-relaxed">
            This directory shows the CEO and executive reporting lines. Founder and board records are not configured in the prototype. Calendar availability is separate from reporting structure and is not inferred here.
          </p>
        </div>
      </aside>
    </div>
  );
}
