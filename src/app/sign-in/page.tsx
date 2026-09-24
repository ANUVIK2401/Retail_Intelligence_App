import { signIn } from "@/auth";
import { googleAuthConfigured } from "@/core/auth/membership";
import { PRODUCT } from "@/config/product";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const configured = googleAuthConfigured();
  return (
    <main className="sign-in-page">
      <div className="sign-in-frame">
        <section className="sign-in-story" aria-label={`${PRODUCT.name} overview`}>
          <div className="sign-in-brand"><span className="sign-in-mark" aria-hidden="true">PS</span><span>{PRODUCT.org} <strong>{PRODUCT.title}</strong></span></div>
          <div className="sign-in-story-content">
            <p className="sign-in-kicker">Your day, handled with care</p>
            <h1>An assistant that finds the time and clears the noise.</h1>
            <p className="sign-in-lede">Ask in plain words, by text or voice. Find a time that works for everyone, catch up on what needs you, and confirm anything that matters before it happens.</p>
          </div>
          <div className="sign-in-capabilities">
            <span>01 <strong>Ask</strong> in plain words</span>
            <span>02 <strong>Choose</strong> from clear options</span>
            <span>03 <strong>Confirm</strong> before anything happens</span>
          </div>
        </section>
        <section className="sign-in-entry" aria-label="Sign in">
          <div className="sign-in-entry-inner">
            <p className="page-eyebrow">Welcome back</p>
            <h2>Good to see you.</h2>
            <p className="muted t-body mt-3">Your assistant is ready. Sign in with the Google account your administrator added, and you will pick up right where you left off.</p>
            {configured ? (
              <form action={async () => { "use server"; await signIn("google", { redirectTo: "/" }); }}>
                <button className="btn btn-primary sign-in-button" type="submit">Continue with Google <span aria-hidden="true">→</span></button>
              </form>
            ) : (
              <div className="sign-in-config-note" role="status">Google sign-in is not configured. An administrator must set the OAuth client, session secret, and executive member map.</div>
            )}
            <div className="sign-in-trust">
              <span className="sign-in-trust-icon" aria-hidden="true">◇</span>
              <p>This prototype uses synthetic records only. Signing in does not grant Gmail or Calendar access; those integrations require separate authorization.</p>
            </div>
          </div>
          <p className="sign-in-footer">{PRODUCT.name}</p>
        </section>
      </div>
    </main>
  );
}
