import test from "node:test";
import assert from "node:assert/strict";
import { checkAccess, isSafeMutation, readSessionId } from "../src/core/deployment/access.ts";

test("production access fails closed when password is absent or weak", () => {
  assert.equal(checkAccess(null, undefined, true), "unconfigured");
  assert.equal(checkAccess(null, "short", true), "unconfigured");
  assert.equal(checkAccess(null, undefined, false), "allowed");
});
test("password gate validates exact Basic credentials", () => {
  const password = "test-only-password-12345";
  const header = `Basic ${Buffer.from(`demo:${password}`).toString("base64")}`;
  assert.equal(checkAccess(header, password, true), "allowed");
  assert.equal(checkAccess(null, password, true), "denied");
  assert.equal(checkAccess("Basic !!!!", password, true), "denied");
  assert.equal(checkAccess(`Basic ${Buffer.from(`other:${password}`).toString("base64")}`, password, true), "denied");
});
test("cross-site mutations are refused, same-origin and CLI requests allowed", () => {
  assert.equal(isSafeMutation(new Request("https://demo.example/api/session", {method:"POST",headers:{origin:"https://evil.example"}})), false);
  assert.equal(isSafeMutation(new Request("https://demo.example/api/session", {method:"POST",headers:{origin:"https://demo.example"}})), true);
  assert.equal(isSafeMutation(new Request("https://demo.example/api/session", {method:"POST",headers:{"sec-fetch-site":"cross-site"}})), false);
  assert.equal(isSafeMutation(new Request("https://demo.example/api/session", {method:"POST"})), true);
});
test("session identifiers are exact, opaque and bounded", () => {
  const id="a".repeat(64);
  assert.equal(readSessionId(`ecc_demo_session=${id}; ecc_actor=p_ceo`), id);
  assert.equal(readSessionId(`not_ecc_demo_session=${id}`), null);
  assert.equal(readSessionId("ecc_demo_session=../../oops"), null);
});

test("same-origin mutations survive a normalized req.url host", () => {
  // Reproduces the middleware case: Next rewrites req.url, so its host can
  // differ from the host the browser addressed. Comparing the Origin against
  // req.url rejected the app's own POSTs and would make a deploy read-only.
  const normalized = new Request("http://localhost:3000/api/assistant", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:3000", host: "127.0.0.1:3000" },
  });
  assert.equal(isSafeMutation(normalized), true);

  // Behind a proxy (Vercel), the forwarded host is authoritative.
  const proxied = new Request("http://internal.local/api/assistant", {
    method: "POST",
    headers: {
      origin: "https://demo.vercel.app",
      host: "internal.local",
      "x-forwarded-host": "demo.vercel.app",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isSafeMutation(proxied), true);

  // A genuine cross-site POST is still refused under the same conditions.
  const attacker = new Request("http://internal.local/api/assistant", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      host: "internal.local",
      "x-forwarded-host": "demo.vercel.app",
      "x-forwarded-proto": "https",
    },
  });
  assert.equal(isSafeMutation(attacker), false);

  // A malformed Origin is not treated as absent.
  assert.equal(
    isSafeMutation(new Request("https://demo.example/api/x", {
      method: "POST",
      headers: { origin: "not-a-url", host: "demo.example" },
    })),
    false,
  );
});
