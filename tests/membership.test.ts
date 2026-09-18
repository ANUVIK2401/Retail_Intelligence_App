import test from "node:test";
import assert from "node:assert/strict";
import { executiveActorId, googleAuthConfigured } from "../src/core/auth/membership.ts";

test("Google membership is fail-closed and exact", () => {
  const map = "ceo@gmail.com:p_ceo,cfo@example.com:p_cfo";
  assert.equal(executiveActorId("ceo@gmail.com", map), "p_ceo");
  assert.equal(executiveActorId("CEO@GMAIL.COM", map), "p_ceo");
  assert.equal(executiveActorId("other@gmail.com", map), null);
  assert.equal(executiveActorId("ceo@gmail.com.evil", map), null);
  assert.equal(executiveActorId("ceo@gmail.com", undefined), null);
});

test("non-executive personas and malformed mappings cannot sign in", () => {
  assert.equal(executiveActorId("ea@gmail.com", "ea@gmail.com:p_ea"), null);
  assert.equal(executiveActorId("auditor@gmail.com", "auditor@gmail.com:p_auditor"), null);
  assert.equal(executiveActorId("ceo@gmail.com", "ceo@gmail.com:p_missing"), null);
  assert.equal(executiveActorId("ceo@gmail.com", "ceo@gmail.com:p_ceo,broken"), null);
});

test("Google auth requires all confidential settings", () => {
  const configured = { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret", AUTH_SECRET: "x".repeat(32), EXECUTIVE_MEMBER_MAP: "ceo@gmail.com:p_ceo" };
  assert.equal(googleAuthConfigured(configured), true);
  assert.equal(googleAuthConfigured({ ...configured, AUTH_SECRET: undefined }), false);
  assert.equal(googleAuthConfigured({ ...configured, EXECUTIVE_MEMBER_MAP: "" }), false);
});
