"use client";

// Settings UI. Local-only state for MVP. Phase 2E: persist via server action.

import { useState } from "react";
import type { Profile } from "@/lib/supabase/types";

type Props = {
  profile: Profile | null;
  fallbackName: string;
  fallbackHandle: string;
};

export default function SettingsPanel({
  profile,
  fallbackName,
  fallbackHandle,
}: Props) {
  const [cadence, setCadence] = useState<"weekly" | "biweekly" | "monthly">(
    "weekly",
  );
  const [day, setDay] = useState<string>("mon");
  const [notify, setNotify] = useState<"email" | "both" | "app">("email");

  const displayName = profile?.display_name ?? fallbackName;
  const handle = profile?.github_handle ?? fallbackHandle;
  const email = profile?.email ?? "";

  return (
    <div className="settings">
      <aside>
        <a className="on" href="#account">
          01 · Account
        </a>
        <a href="#anamnesis">02 · Anamnesis</a>
        <a href="#cadence">03 · Radar cadence</a>
        <a href="#data">04 · Data &amp; export</a>
        <a href="#license">05 · License</a>
      </aside>

      <div>
        <div className="set-section" id="account">
          <h2>
            <span className="n">01</span>Account
          </h2>
          <p className="hint">
            Your connected identity and primary channel.
          </p>
          <div className="row">
            <span className="k">Signed in as</span>
            <span className="v">
              {displayName} ·{" "}
              <span style={{ color: "var(--ink-3)" }}>@{handle}</span>
            </span>
            <button type="button" className="btn sm ghost">
              Switch
            </button>
          </div>
          <div className="row">
            <span className="k">GitHub</span>
            <span className="v">
              connected · last sync 4h ago
              <div className="meta">read-only · public repos + profile</div>
            </span>
            <button type="button" className="btn sm ghost">
              Re-sync
            </button>
          </div>
          <div className="row">
            <span className="k">Email</span>
            <span className="v">{email}</span>
            <button type="button" className="btn sm ghost">
              Change
            </button>
          </div>
        </div>

        <div className="set-section" id="anamnesis">
          <h2>
            <span className="n">02</span>Anamnesis
          </h2>
          <p className="hint">
            Re-run to refresh the profile. Useful after you ship something,
            publish writing, or change focus. Costs one agent invocation.
            Takes ~90 seconds.
          </p>
          <div className="row">
            <span className="k">Last run</span>
            <span className="v">
              2026-04-19 09:14 BRT
              <div className="meta">
                source: github + cv + site · no voice note
              </div>
            </span>
            <button type="button" className="btn sm">
              Re-run now
            </button>
          </div>
          <div className="row">
            <span className="k">Auto re-run</span>
            <span className="v">
              on significant github activity
              <div className="meta">
                trigger: 5+ commits on a new repo in a week
              </div>
            </span>
            <div className="seg">
              <button type="button" className="on">
                on
              </button>
              <button type="button">off</button>
            </div>
          </div>
        </div>

        <div className="set-section" id="cadence">
          <h2>
            <span className="n">03</span>Radar cadence
          </h2>
          <p className="hint">
            When Scout runs and when Strategist delivers your radar. Weekly is
            the default and what Radar is optimized for.
          </p>
          {/* MVP: local-only. Phase 2E persists to profile.settings. */}
          <div className="row">
            <span className="k">Cadence</span>
            <span className="v">
              {cadence === "weekly"
                ? "weekly"
                : cadence === "biweekly"
                  ? "every two weeks"
                  : "monthly"}
            </span>
            <div className="seg">
              <button
                type="button"
                className={cadence === "weekly" ? "on" : ""}
                onClick={() => setCadence("weekly")}
              >
                weekly
              </button>
              <button
                type="button"
                className={cadence === "biweekly" ? "on" : ""}
                onClick={() => setCadence("biweekly")}
              >
                biweekly
              </button>
              <button
                type="button"
                className={cadence === "monthly" ? "on" : ""}
                onClick={() => setCadence("monthly")}
              >
                monthly
              </button>
            </div>
          </div>
          <div className="row">
            <span className="k">Delivery day</span>
            <span className="v">{day.toUpperCase()}</span>
            <div className="seg">
              {["mon", "tue", "wed", "thu", "fri"].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={day === d ? "on" : ""}
                  onClick={() => setDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="row">
            <span className="k">Notify</span>
            <span className="v">
              {notify === "email"
                ? "email digest"
                : notify === "both"
                  ? "email + in-app"
                  : "in-app only"}
            </span>
            <div className="seg">
              <button
                type="button"
                className={notify === "email" ? "on" : ""}
                onClick={() => setNotify("email")}
              >
                email
              </button>
              <button
                type="button"
                className={notify === "both" ? "on" : ""}
                onClick={() => setNotify("both")}
              >
                both
              </button>
              <button
                type="button"
                className={notify === "app" ? "on" : ""}
                onClick={() => setNotify("app")}
              >
                in-app
              </button>
            </div>
          </div>
        </div>

        <div className="set-section" id="data">
          <h2>
            <span className="n">04</span>Data &amp; export
          </h2>
          <p className="hint">
            Everything Radar has about you, portable at any time. JSON, one
            click.
          </p>
          <div className="row">
            <span className="k">Export profile</span>
            <span className="v">
              profile + all radars + plans
              <div className="meta">json · ~480 kb</div>
            </span>
            <button type="button" className="btn sm">
              Download
            </button>
          </div>
          <div className="row">
            <span className="k">Delete account</span>
            <span className="v">
              irreversible · removes profile and all history
            </span>
            <button type="button" className="btn sm ghost">
              Delete
            </button>
          </div>
        </div>

        <div className="set-section" id="license">
          <h2>
            <span className="n">05</span>License
          </h2>
          <p className="hint">
            Radar is open source. You can run your own, fork it, rewrite it.
          </p>
          <div className="row">
            <span className="k">License</span>
            <span className="v">
              AGPL-3.0
              <div className="meta">
                modifications must be shared upstream
              </div>
            </span>
            <a
              className="btn sm ghost"
              href="https://github.com/pablo-aa/radar"
              target="_blank"
              rel="noopener noreferrer"
            >
              github
            </a>
          </div>
          <div className="row">
            <span className="k">Self-host</span>
            <span className="v">
              docker-compose up
              <div className="meta">requires anthropic api key</div>
            </span>
            <a
              className="btn sm ghost"
              href="https://github.com/pablo-aa/radar#self-host"
              target="_blank"
              rel="noopener noreferrer"
            >
              docs
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
