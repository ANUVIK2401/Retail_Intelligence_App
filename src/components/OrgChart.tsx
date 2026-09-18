import { PEOPLE } from "@/data/org";
import { buildOrgHierarchy, type OrgNode } from "./orgHierarchy";

const { roots, members } = buildOrgHierarchy(PEOPLE);

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

function PersonCard({ node, featured = false }: { node: OrgNode; featured?: boolean }) {
  const person = node.person;
  const isAssistant = person.roles.includes("executive_assistant");
  return (
    <article className={`org-person ${featured ? "org-person-featured" : ""}`}>
      <div className="org-person-top">
        <div className="org-avatar" aria-hidden="true">{initials(person.name)}</div>
        <div className="min-w-0">
          <h3 className="org-person-name">{person.name}</h3>
          <p className="org-person-title">{person.title}</p>
        </div>
      </div>
      <div className="org-person-meta">
        <span>{isAssistant ? "Executive support" : person.roles.includes("executive") ? "Executive" : "Team member"}</span>
        {node.reports.length > 0 && <span>{node.reports.length} direct report{node.reports.length === 1 ? "" : "s"}</span>}
      </div>
    </article>
  );
}

function ReportingBranch({ node }: { node: OrgNode }) {
  return (
    <li className="org-branch">
      <PersonCard node={node} />
      {node.reports.length > 0 && (
        <ul className="org-reports" aria-label={`People reporting to ${node.person.name}`}>
          {node.reports.map((report) => <ReportingBranch key={report.person.id} node={report} />)}
        </ul>
      )}
    </li>
  );
}

export function OrgChart() {
  const primaryRoot = roots.find((node) => node.person.id === "p_ceo");
  const otherRoots = roots.filter((node) => node.person.id !== "p_ceo");

  return (
    <div className="org-layout">
      <div className="org-topline">
        <div>
          <span className="org-eyebrow">Leadership map</span>
          <h2 className="org-section-title">Reporting structure</h2>
        </div>
        <span className="org-count">{members.length} internal members</span>
      </div>

      {primaryRoot && (
        <section aria-label="CEO and reporting lines">
          <div className="org-root-label">Chief Executive Officer</div>
          <PersonCard node={primaryRoot} featured />
          <div className="org-connector" aria-hidden="true" />
          <div className="org-root-label">Direct reports</div>
          <ul className="org-leadership-grid">
            {primaryRoot.reports.map((report) => <ReportingBranch key={report.person.id} node={report} />)}
          </ul>
        </section>
      )}

      {otherRoots.length > 0 && (
        <section className="mt-7" aria-label="Other internal reporting lines">
          <h2 className="org-section-title">Other internal lines</h2>
          <ul className="org-leadership-grid mt-3">
            {otherRoots.map((root) => <ReportingBranch key={root.person.id} node={root} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
