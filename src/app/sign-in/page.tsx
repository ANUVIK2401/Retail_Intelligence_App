import { signIn } from "@/auth";
import { googleAuthConfigured } from "@/core/auth/membership";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const configured = googleAuthConfigured();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <div className="card p-8 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-widest muted">PacSun</p>
        <h1 className="mt-3 text-3xl font-semibold">Executive Command Center</h1>
        <p className="mt-3 text-sm muted">A private workspace for authorized executive members. This prototype uses synthetic data only.</p>
        {configured ? (
          <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
            <button className="btn btn-primary mt-8 w-full" type="submit">Continue with Google</button>
          </form>
        ) : (
          <p className="mt-8 rounded-lg border p-4 text-sm" style={{ borderColor: "var(--border)" }}>
            Google sign-in is not configured. An administrator must set the OAuth client, session secret, and executive member map.
          </p>
        )}
        <p className="mt-6 text-xs muted">Signing in does not grant Gmail or Calendar access. Availability and messages remain synthetic until those integrations are separately authorized.</p>
      </div>
    </main>
  );
}
