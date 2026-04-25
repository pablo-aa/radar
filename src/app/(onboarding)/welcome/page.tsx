import Link from "next/link";
import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import OnboardProgress from "@/components/OnboardProgress";
import { getServerUser } from "@/lib/onboarding";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";
import { markWelcomeSeen } from "@/lib/actions";
import { nextDestinationFor } from "@/lib/routing";

export default async function WelcomePage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const { destination, profile } = await nextDestinationFor(user.id);
  if (destination !== "/welcome") redirect(destination);

  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;

  async function continueAction() {
    "use server";
    await markWelcomeSeen();
    redirect("/intake");
  }

  return (
    <div className="wrap">
      <Appbar
        route="welcome"
        userInitials={(profile?.display_name ?? profile?.github_handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={profile?.github_handle ?? "you"}
        userName={profile?.display_name ?? profile?.github_handle ?? "you"}
        userCity=""
        intakeSubmitted={onboard.intake_done}
        onboardComplete={onboard.report_seen}
      />
      {!onboard.report_seen && <OnboardProgress step="welcome" />}
      <div className="welcome">
        <div className="welcome-l">
          <div className="welcome-kicker">§ 01 · Before you begin</div>
          <h1 className="welcome-lede">
            Radar only reads you once.
            <span className="welcome-cur" aria-hidden="true"></span>
          </h1>
          <p className="welcome-caption">
            You are about to hand Anamnesis the inputs that shape every radar
            you&apos;ll ever receive. Take ten minutes. The profile you build
            now is the one Strategist will argue from, week after week.
          </p>
          <div className="welcome-beta">
            <div className="welcome-beta-k">beta · limits</div>
            <p className="welcome-beta-b">
              One report per account during beta. Additional runs unlock as we
              move through test cohorts. Treat this like a letter you only
              write once.
            </p>
          </div>
        </div>

        <div className="welcome-r">
          <div className="welcome-figcap">What happens next</div>
          <ol className="welcome-steps">
            <li>
              <span className="welcome-step-n">01</span>
              <div>
                <div className="welcome-step-t">Intake · 8 to 12 minutes</div>
                <p>
                  Connect GitHub, upload your CV, link your site, record a
                  90-second voice note, declare what you are building. The more
                  Anamnesis reads, the less it guesses.
                </p>
              </div>
            </li>
            <li>
              <span className="welcome-step-n">02</span>
              <div>
                <div className="welcome-step-t">Generate · ~15 seconds</div>
                <p>
                  Three agents run in sequence. You&apos;ll see the pipeline.
                  You can leave, the run continues.
                </p>
              </div>
            </li>
            <li>
              <span className="welcome-step-n">03</span>
              <div>
                <div className="welcome-step-t">Report · your self-portrait</div>
                <p>
                  A long-form read: archetype, territory, strengths, peers,
                  vectors, risks, year-shape, reading list. The foundation for
                  every radar that follows.
                </p>
              </div>
            </li>
            <li>
              <span className="welcome-step-n">04</span>
              <div>
                <div className="welcome-step-t">Radar · weekly, forever</div>
                <p>
                  Scout crawls 1,240 sources. Strategist writes your week.
                  Radar unlocks once the report is generated.
                </p>
              </div>
            </li>
          </ol>

          <div className="welcome-checklist">
            <div className="welcome-checklist-hd">Have these ready:</div>
            <ul>
              <li>Your GitHub username</li>
              <li>Your CV as a PDF (recent)</li>
              <li>Your personal site or blog URL, if you have one</li>
              <li>Ten quiet minutes and a microphone for the voice note</li>
            </ul>
          </div>

          <div className="welcome-actions">
            <form action={continueAction}>
              <button className="btn" type="submit">
                <span className="hi">I</span>&apos;m ready · start intake
                <span className="cur"></span>
              </button>
            </form>
            <span className="welcome-foot">
              you can save and return · intake is not final until you submit
            </span>
          </div>
          <div style={{ marginTop: 12 }}>
            <Link
              href="/intake"
              style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}
            >
              skip straight to intake
            </Link>
          </div>
        </div>
      </div>
      <CornerMeta />
    </div>
  );
}
