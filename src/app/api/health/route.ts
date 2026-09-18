import { checkPersistence } from "@/core/persistence";
import { readProviderConfig } from "@/core/ai/config";
import { googleAuthConfigured } from "@/core/auth/membership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET() {
  try {
    const localDemo = process.env.AUTH_MODE === "demo" && process.env.NODE_ENV !== "production" && !process.env.VERCEL;
    if (!localDemo && !googleAuthConfigured()) throw new Error("Google auth not configured");
    readProviderConfig();
    const persistence = await checkPersistence();
    return Response.json({ status: "ok", demo: true, durable: persistence.durable }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable", message: "Check database, Google auth, and AI provider configuration." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
