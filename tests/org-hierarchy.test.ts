import assert from "node:assert/strict";
import { test } from "node:test";
import { PEOPLE } from "../src/data/org.ts";
import { buildOrgHierarchy } from "../src/components/orgHierarchy.ts";

test("org hierarchy follows managerId and excludes external contacts", () => {
  const { roots, members } = buildOrgHierarchy(PEOPLE);
  assert.equal(roots.length, 1);
  assert.equal(roots[0].person.id, "p_ceo");
  assert.equal(members.length, PEOPLE.filter((person) => person.function !== "external").length);
  assert.ok(!members.some((person) => person.id === "p_ext_banker"));
  const operations = roots[0].reports.find((node) => node.person.id === "p_coo");
  assert.ok(operations);
  assert.deepEqual(operations.reports.map((node) => node.person.id), ["p_vp_logistics", "p_vp_stores"]);
});

test("org hierarchy surfaces an orphan safely as a root", () => {
  const { roots } = buildOrgHierarchy([
    { ...PEOPLE[0], id: "leader" },
    { ...PEOPLE[1], id: "orphan", managerId: "missing" },
  ]);
  assert.deepEqual(roots.map((node) => node.person.id), ["leader", "orphan"]);
});

test("a malformed cycle does not make members disappear", () => {
  const { roots, members } = buildOrgHierarchy([
    { ...PEOPLE[0], id: "one", managerId: "two" },
    { ...PEOPLE[2], id: "two", managerId: "one" },
  ]);
  const visible = roots.flatMap((node) => [node.person.id, ...node.reports.map((report) => report.person.id)]);
  assert.equal(members.length, 2);
  assert.deepEqual(new Set(visible), new Set(["one", "two"]));
});
