import type { Person } from "@/core/contracts";

export type OrgNode = { person: Person; reports: OrgNode[] };

/** Build reporting lines from the synthetic people directory, not job-title guesses. */
export function buildOrgHierarchy(people: readonly Person[]): {
  roots: OrgNode[];
  members: Person[];
} {
  const members = people.filter((person) => person.function !== "external");
  const byId = new Map(members.map((person) => [person.id, person]));
  const reportsByManager = new Map<string, Person[]>();

  for (const person of members) {
    if (!person.managerId || !byId.has(person.managerId)) continue;
    reportsByManager.set(person.managerId, [
      ...(reportsByManager.get(person.managerId) ?? []),
      person,
    ]);
  }

  const comparePeople = (a: Person, b: Person) =>
    a.level - b.level || a.name.localeCompare(b.name);
  const buildNode = (person: Person, ancestors: ReadonlySet<string>): OrgNode => {
    const seen = new Set([...ancestors, person.id]);
    return {
      person,
      reports: (reportsByManager.get(person.id) ?? [])
        .filter((report) => !seen.has(report.id))
        .sort(comparePeople)
        .map((report) => buildNode(report, seen)),
    };
  };

  const flattenIds = (nodes: readonly OrgNode[]): string[] =>
    nodes.flatMap((node) => [node.person.id, ...flattenIds(node.reports)]);
  const initialRoots = members
    .filter((person) => !person.managerId || !byId.has(person.managerId))
    .sort(comparePeople)
    .map((person) => buildNode(person, new Set()));
  // Malformed cycles have no natural root; surface them instead of silently hiding people.
  const roots = [...members].sort(comparePeople).reduce<OrgNode[]>(
    (current, person) => flattenIds(current).includes(person.id)
      ? current
      : [...current, buildNode(person, new Set())],
    initialRoots,
  );

  return { roots, members };
}
