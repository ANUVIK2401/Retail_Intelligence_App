import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { googleAuthConfigured } from "@/core/auth/membership";
import { ACTOR_HEADER } from "@/core/session";
import { DEMO_SESSION_COOKIE, isSafeMutation, MEMBER_HEADER, readSessionId, SESSION_SECONDS } from "@/core/deployment/access";
import { personById } from "@/data/org";

export const proxy = auth((req) => {
  const path = req.nextUrl.pathname;
  if (path.startsWith("/api/auth/") || path === "/sign-in" || path === "/api/health") return NextResponse.next();
  const localDemo = process.env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production" && !process.env.VERCEL &&
    ["localhost", "127.0.0.1"].includes(req.nextUrl.hostname);
  if (!localDemo && !googleAuthConfigured()) {
    return NextResponse.json({ error: "Google executive sign-in is not configured." }, { status: 503 });
  }
  const testActor = req.cookies.get("ecc_actor")?.value;
  const actorId = localDemo ? (testActor && personById(testActor) ? testActor : "p_ceo") : req.auth?.user?.actorId;
  // A real address shape, so local demo exercises the same admin and member
  // code paths as a deployment rather than a special case that hides bugs.
  // It is only ever used on localhost with AUTH_MODE=demo.
  const memberEmail = localDemo
    ? (process.env.DEMO_MEMBER_EMAIL?.trim().toLowerCase() || "local-demo@example.test")
    : req.auth?.user?.email?.trim().toLowerCase();
  if (!actorId || !memberEmail) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in with an authorized Google account." }, { status: 401 });
    return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));
  }
  if (!isSafeMutation(req)) return NextResponse.json({ error: "Cross-site changes are not permitted." }, { status: 403 });
  if (Number(req.headers.get("content-length") ?? 0) > 65_536) return NextResponse.json({ error: "Request is too large." }, { status: 413 });

  const existing = readSessionId(req.headers.get("cookie"));
  const id = existing ?? randomBytes(32).toString("hex");
  const headers = new Headers(req.headers);
  headers.set(ACTOR_HEADER, actorId);
  headers.set(MEMBER_HEADER, memberEmail);
  if (!existing) {
    req.cookies.set(DEMO_SESSION_COOKIE, id);
    headers.set("cookie", req.cookies.toString());
  }
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("Cache-Control", "private, no-store");
  if (!existing) res.cookies.set(DEMO_SESSION_COOKIE, id, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:" || Boolean(process.env.VERCEL),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_SECONDS,
  });
  return res;
});

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"] };
