import Link from "next/link";
import Appbar from "./Appbar";
import CornerMeta from "./CornerMeta";
import OnboardProgress from "./OnboardProgress";

type Target = "radar" | "report";

const LABELS: Record<Target, { kicker: string; title: string; body: string }> = {
  radar: {
    kicker: "§ radar · locked",
    title: "Your radar hasn't been generated yet.",
    body:
      "Radar unlocks once Anamnesis reads you and Strategist writes your first report. It's the foundation, without it, every weekly radar would be generic. Start with Intake.",
  },
  report: {
    kicker: "§ report · not generated",
    title: "Your self-portrait hasn't been written yet.",
    body:
      "The report is Anamnesis's long-form read of you, archetype, territory, strengths, peers, vectors, risks, year-shape, reading list. It does not exist until you submit your intake.",
  },
};

export default function LockedScreen({
  target,
  userInitials,
  userHandle,
  userName,
  userCity,
}: {
  target: Target;
  userInitials?: string;
  userHandle?: string;
  userName?: string;
  userCity?: string;
}) {
  const L = LABELS[target];
  return (
    <div className="wrap">
      <Appbar
        route={target}
        userInitials={userInitials}
        userHandle={userHandle}
        userName={userName}
        userCity={userCity}
        intakeSubmitted={false}
      />
      <OnboardProgress step="intake" />
      <div className="locked">
        <div className="locked-seal" aria-hidden="true">
          <span className="locked-seal-shell"></span>
          <span className="locked-seal-dot"></span>
        </div>
        <div className="locked-kicker">{L.kicker}</div>
        <h1 className="locked-h">{L.title}</h1>
        <p className="locked-body">{L.body}</p>
        <div className="locked-actions">
          <Link className="btn" href="/intake">
            <span className="hi">S</span>tart intake
            <span className="cur"></span>
          </Link>
          <span className="locked-foot">one report per account · beta</span>
        </div>
      </div>
      <CornerMeta />
    </div>
  );
}
