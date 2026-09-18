import assert from "node:assert/strict";
import { test } from "node:test";
import {
  adminEmails,
  isAdmin,
  normalizeEmail,
  validateOnboarding,
  type MemberRecord,
} from "../src/core/auth/admin.ts";

const env = (ADMIN_EMAILS?: string) => ({ ADMIN_EMAILS }) as Record<string, string | undefined>;

test("administrators come from configuration, case and space insensitive", () => {
  const e = env(" Anuvikt@Gmail.com , second@pacsun.com ");
  assert.equal(isAdmin("anuvikt@gmail.com", e), true);
  assert.equal(isAdmin("ANUVIKT@GMAIL.COM", e), true);
  assert.equal(isAdmin("second@pacsun.com", e), true);
  assert.equal(adminEmails(e).size, 2);
});

test("nobody is an administrator when the setting is absent or empty", () => {
  assert.equal(isAdmin("anuvikt@gmail.com", env()), false);
  assert.equal(isAdmin("anuvikt@gmail.com", env("   ")), false);
  assert.equal(adminEmails(env()).size, 0);
});

test("an executive persona does not confer administration", () => {
  // The whole point of the split: p_ceo is the most powerful persona in the
  // directory and still cannot manage members unless named in ADMIN_EMAILS.
  assert.equal(isAdmin("maya.hollis@pacsun.example", env("anuvikt@gmail.com")), false);
});

test("malformed emails are never admitted as administrators", () => {
  for (const bad of ["", "   ", "not-an-email", "a@b", "two@emails,x@y.com", "@pacsun.com"]) {
    assert.equal(normalizeEmail(bad), null, `${JSON.stringify(bad)} should not normalize`);
    assert.equal(isAdmin(bad, env(bad)), false);
  }
});

test("onboarding requires a real email and a real persona", () => {
  const existing = new Map<string, MemberRecord>();
  assert.equal(validateOnboarding({ email: "nope", actorId: "p_cmo", existing }).ok, false);
  assert.equal(validateOnboarding({ email: "a@pacsun.com", actorId: "p_ghost", existing }).ok, false);

  const good = validateOnboarding({ email: "Sam@PacSun.com", actorId: "p_cmo", existing });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.member.email, "sam@pacsun.com", "email is normalized before storage");
    assert.equal(good.member.actorId, "p_cmo");
    assert.equal(good.member.origin, "invited");
  }
});

test("onboarding refuses a silent overwrite of an existing member", () => {
  const existing = new Map<string, MemberRecord>([
    ["sam@pacsun.com", {
      email: "sam@pacsun.com", actorId: "p_cmo", personaName: "Tomas Lund",
      personaTitle: "CMO", admin: false, origin: "invited",
    }],
  ]);
  // Same person, different role: must refuse rather than quietly re-map, so a
  // privilege change is always a deliberate remove-then-add.
  const result = validateOnboarding({ email: "SAM@pacsun.com", actorId: "p_cfo", existing });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /already onboarded/);
});

test("an onboarded member inherits admin only from configuration", () => {
  const existing = new Map<string, MemberRecord>();
  const plain = validateOnboarding({ email: "sam@pacsun.com", actorId: "p_cmo", existing, env: env("anuvikt@gmail.com") });
  assert.equal(plain.ok && plain.member.admin, false);

  const owner = validateOnboarding({ email: "anuvikt@gmail.com", actorId: "p_ceo", existing, env: env("anuvikt@gmail.com") });
  assert.equal(owner.ok && owner.member.admin, true);
});
