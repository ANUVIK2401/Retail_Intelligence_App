import { createHash, timingSafeEqual } from "node:crypto";

export const DEMO_SESSION_COOKIE = "ecc_demo_session";
export const ACTOR_HEADER = "x-ecc-actor-id";
export const MEMBER_HEADER = "x-ecc-member-email";
export const SESSION_SECONDS = 24 * 60 * 60;

/** Shared URL gate, not enterprise identity. Roles remain synthetic demo personas. */
export function checkAccess(header: string | null, password: string | undefined, production: boolean): "allowed" | "denied" | "unconfigured" {
  if (!password) return production ? "unconfigured" : "allowed";
  if (password.length < 16) return "unconfigured";
  if (!header?.startsWith("Basic ")) return "denied";
  const supplied = Buffer.from(header.slice(6), "base64").toString("utf8");
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(supplied), digest(`demo:${password}`)) ? "allowed" : "denied";
}

export function isSafeMutation(req: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = req.headers.get("origin");
  if (!origin) return true;

  // Compare against the host the browser actually addressed, not
  // `new URL(req.url).origin`. Inside Next middleware `req.url` is normalized
  // and can carry a different host than the request (127.0.0.1 vs localhost
  // locally; the internal host behind a proxy), which rejected same-origin
  // POSTs from the app's own pages and would make a deployment read-only.
  // Precedence: the proxy's forwarded host, then the Host header, then the
  // URL. Only the last is unreliable inside middleware, so it is the fallback
  // rather than the source of truth.
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    new URL(req.url).host;
  if (!host) return false;
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  try {
    const sent = new URL(origin);
    return sent.host === host && (sent.protocol === `${proto}:` || sent.protocol === "https:");
  } catch {
    return false;
  }
}

export function readSessionId(cookie: string | null): string | null {
  const value = cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${DEMO_SESSION_COOKIE}=`))?.slice(DEMO_SESSION_COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
