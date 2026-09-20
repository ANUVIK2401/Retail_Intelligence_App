import { signIn } from "@/auth";
import { googleAuthConfigured } from "@/core/auth/membership";

export const dynamic = "force-dynamic";

export default function SignInPage() {
  const configured = googleAuthConfigured();
  return (
    <main className="sign-in-page">
      <div className="sign-in-frame">
        <section className="sign-in-story" aria-label="Executive Command Center overview">
          <div className="sign-in-brand"><span className="sign-in-mark" aria-hidden="true">PS</span><span>PacSun <strong>Executive Command Center</strong></span></div>
          <div className="sign-in-story-content">
            <p className="sign-in-kicker">A new standard for executive focus</p>
            <h1>Clarity for the decisions that matter.</h1>
            <p className="sign-in-lede">See the signal across your day. Move routine work forward with confidence. Keep every consequential action under human control.</p>
          </div>
          <div className="sign-in-capabilities">
            <span>01 <strong>Prioritize</strong> the queue</span>
            <span>02 <strong>Review</strong> the reasoning</span>
            <span>03 <strong>Decide</strong> with control</span>
          </div>
        </section>
        <section className="sign-in-entry" aria-label="Sign in">
          <div className="sign-in-entry-inner">
            <p className="page-eyebrow">Private workspace</p>
            <h2>Welcome to your command center.</h2>
            <p className="muted t-body mt-3">Access is reserved for authorized executive members. Sign in to view your permitted synthetic workspace.</p>
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
          <p className="sign-in-footer">PacSun · Executive Command Center</p>
        </section>
      </div>
    </main>
  );
}
