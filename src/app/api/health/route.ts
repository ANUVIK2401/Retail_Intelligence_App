import { checkPersistence } from "@/core/persistence";
import { readProviderConfig } from "@/core/ai/config";
import { googleAuthConfigured } from "@/core/auth/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  const localDemo =
    process.env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;

  // Each check is reported separately. A single "check everything" message
  // sends an operator hunting through three unrelated subsystems; naming the
  // failing one is the difference between a two-minute fix and an evening.
  // Only presence and reachability are reported, never a value.
  const checks: Record<string, string> = {};

  if (localDemo) {
    checks.auth = "ok (local demo)";
  } else if (googleAuthConfigured()) {
    checks.auth = "ok";
  } else {
    const missing: string[] = [];
    if (!process.env.AUTH_GOOGLE_ID?.trim()) missing.push("AUTH_GOOGLE_ID");
    if (!process.env.AUTH_GOOGLE_SECRET?.trim()) missing.push("AUTH_GOOGLE_SECRET");
    if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
    else if (process.env.AUTH_SECRET.length < 32) missing.push("AUTH_SECRET (needs 32+ characters)");
    if (!process.env.EXECUTIVE_MEMBER_MAP?.trim()) missing.push("EXECUTIVE_MEMBER_MAP");
    checks.auth = missing.length
      ? `missing or invalid: ${missing.join(", ")}`
      : "EXECUTIVE_MEMBER_MAP did not parse. Use email:persona, e.g. you@example.com:p_ceo, where the persona is an executive.";
  }

  try {
    readProviderConfig();
    checks.aiProvider = "ok";
  } catch (error) {
    checks.aiProvider = error instanceof Error ? error.message : "invalid configuration";
  }

  let durable = false;
  try {
    const persistence = await checkPersistence();
    durable = persistence.durable;
    checks.database = `ok (${persistence.backend})`;
  } catch (error) {
    checks.database = !process.env.DATABASE_URL
      ? "DATABASE_URL is not set. Attach Postgres in Vercel Storage."
      : `could not connect: ${error instanceof Error ? error.name : "unknown error"}. Check that the connection string is the pooled one.`;
  }

  const ok = Object.values(checks).every((v) => v.startsWith("ok"));

  return Response.json(
    ok
      ? { status: "ok", demo: true, durable, checks }
      : { status: "unavailable", durable, checks },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
