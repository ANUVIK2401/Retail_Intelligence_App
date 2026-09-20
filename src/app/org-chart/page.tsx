import { OrgChart } from "@/components/OrgChart";

export default function OrgChartPage() {
  return (
    <div className="space-y-5">
      <header className="page-head enter">
        <p className="page-eyebrow">People & governance</p>
        <h1 className="t-title mt-2">Organization hierarchy</h1>
        <p className="muted t-body mt-2 max-w-prose">
          A clear view of the executive reporting structure in this synthetic directory.
          Access and approval authority are granted separately.
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
