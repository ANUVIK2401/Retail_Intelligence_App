import assert from "node:assert/strict";
import test from "node:test";
import { readFeatures } from "../src/config/features.ts";
import { askPrefillFor, navFor, navItemFor } from "../src/config/nav.ts";
import { PRODUCT } from "../src/config/product.ts";

test("approvals are hidden unless the flag is on", () => {
  const off = navFor({ approvals: readFeatures({}).approvals, admin: false });
  assert.ok(!off.main.some((item) => item.href === "/approvals"));
  const on = navFor({ approvals: readFeatures({ FEATURE_APPROVALS: "true" }).approvals, admin: false });
  assert.ok(on.main.some((item) => item.href === "/approvals"));
  assert.equal(readFeatures({ FEATURE_APPROVALS: "0" }).approvals, false);
});

test("the main group matches the Sept 23 structure, chat first", () => {
  assert.deepEqual(navFor({ approvals: false, admin: false }).main.map((item) => item.label),
    ["Chat", "Inbox", "Calendar", "Projects", "Notes", "Posts", "Insights", "People"]);
});

test("governance lives under Settings, and Administration only for administrators", () => {
  assert.deepEqual(navFor({ approvals: false, admin: false }).settings.map((item) => item.label), ["Controls", "Audit history"]);
  assert.deepEqual(navFor({ approvals: false, admin: true }).settings.map((item) => item.label), ["Controls", "Audit history", "Administration"]);
});

test("nested pages resolve to their section, and Ask prefills by page", () => {
  const sections = navFor({ approvals: false, admin: false });
  assert.equal(navItemFor("/inbox/e_crisis", sections)?.label, "Inbox");
  assert.equal(navItemFor("/projects/pr_denim", sections)?.label, "Projects");
  assert.equal(askPrefillFor("/inbox"), "What emails need my attention?");
  assert.equal(askPrefillFor("/audit"), "");
});

test("the product name is plain and not militaristic", () => {
  assert.equal(PRODUCT.name, "PacSun Executive Assistant");
  assert.ok(!/command|center|mission|war/i.test(Object.values(PRODUCT).join(" ")));
});
