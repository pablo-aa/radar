// 5-step progress strip. Server component.
// Render only when first-run; parent layouts/pages decide whether to mount it.

import { Fragment } from "react";

export type OnboardStep =
  | "welcome"
  | "intake"
  | "clarify"
  | "generating"
  | "report"
  | "radar";

const STEPS: { key: OnboardStep; label: string }[] = [
  { key: "welcome", label: "01 · Welcome" },
  { key: "intake", label: "02 · Intake" },
  { key: "clarify", label: "03 · Confirm" },
  { key: "generating", label: "04 · Generating" },
  { key: "report", label: "05 · Report" },
  { key: "radar", label: "06 · Radar" },
];

export default function OnboardProgress({ step }: { step: OnboardStep }) {
  const idx = Math.max(
    0,
    STEPS.findIndex((s) => s.key === step),
  );

  return (
    <div className="onboard-prog">
      <div className="onboard-prog-kicker">first-run · building your radar</div>
      <div className="onboard-prog-row">
        {STEPS.map((s, i) => (
          <Fragment key={s.key}>
            <div
              className={
                "onboard-prog-step" +
                (i < idx ? " done" : i === idx ? " on" : "")
              }
            >
              <span className="onboard-prog-dot" aria-hidden="true"></span>
              <span className="onboard-prog-lbl">{s.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={"onboard-prog-rule" + (i < idx ? " done" : "")}
              ></div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
