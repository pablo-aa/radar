"use client";

// Login screen. GitHub OAuth primary, alt buttons are placeholders.
// Client component: the OAuth button needs the browser Supabase client.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGithub = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${origin}/auth/callback` },
      });
      if (err) throw err;
      // supabase redirects the window; nothing else to do here.
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "sign-in failed";
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-left">
        <div className="brand">
          <span
            style={{
              display: "inline-block",
              width: 14,
              height: 14,
              border: "1.25px solid var(--ink)",
              borderRadius: "50%",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                inset: "3px",
                border: "1.25px solid var(--ink)",
                borderRadius: "50%",
                display: "block",
              }}
            ></span>
          </span>
          <span>radar</span>
        </div>
        <div>
          <h1>
            Sign in<span className="cur" aria-hidden="true"></span>
          </h1>
          <p className="lede">
            Radar is built for developers, so GitHub is the door.
            Weekly crawl, personal plan, zero job-board noise.
          </p>
          <div className="specs">
            <div>
              storage <b>self-hosted · encrypted at rest</b>
            </div>
            <div>
              license <b>AGPL-3.0 · fork at will</b>
            </div>
            <div>
              data export <b>JSON · any time · one click</b>
            </div>
            <div>
              agents <b>Anamnesis · Scout · Strategist</b>
            </div>
            <div>
              runtime <b>Claude Opus 4.7 · Managed Agents</b>
            </div>
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--mono)",
            fontSize: "10px",
            letterSpacing: ".06em",
            color: "var(--ink-4)",
          }}
        >
          radar.pabloaa.com · week 17 · 2026
        </div>
      </div>

      <div className="auth-right">
        <div className="card-auth">
          <h2>001 · Connect</h2>
          <p className="eye">Sign in with the account that ships your work.</p>

          <button
            type="button"
            className="btn-gh"
            onClick={signInWithGithub}
            disabled={loading}
            style={{ cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}
          >
            <span>
              {loading ? "Redirecting to GitHub..." : "Continue with GitHub"}
            </span>
            <span className="arr">→</span>
          </button>

          {error && (
            <p
              style={{
                marginTop: 12,
                color: "var(--accent)",
                fontFamily: "var(--mono)",
                fontSize: 11,
              }}
            >
              {error}
            </p>
          )}

          <p className="fine">
            Radar reads public repos and your profile bio. No write access, no
            issue tracking, no auto-posting. You can revoke at any time.
          </p>
        </div>
      </div>
    </div>
  );
}
