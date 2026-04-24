import type { AnamnesisTimeline } from "@/lib/sample-data/anamnesis-report";

export default function TimelineArc({ tl }: { tl: AnamnesisTimeline }) {
  const past = tl.nodes.filter((n) => n.past);
  const now = tl.nodes.find((n) => n.now);
  const futures = tl.nodes.filter((n) => n.future);

  return (
    <div className="tl-card">
      <div className="tl-rail">
        {past.map((n, i) => (
          <div key={"p" + i} className="tl-step">
            <div className="tl-step-dot" aria-hidden="true"></div>
            <div className="tl-step-meta">{n.meta.split(" · ")[0]}</div>
            <div className="tl-step-label">{n.label}</div>
            <div className="tl-step-sub">
              {n.meta.split(" · ").slice(1).join(" · ")}
            </div>
          </div>
        ))}
        {now && (
          <div className="tl-step tl-now">
            <div
              className="tl-step-dot tl-now-dot"
              aria-hidden="true"
            ></div>
            <div className="tl-step-meta tl-now-meta">now · 2026-04</div>
            <div className="tl-step-label">{now.label}</div>
            <div className="tl-step-sub">
              {now.meta.split(" · ").slice(1).join(" · ")}
            </div>
          </div>
        )}
      </div>

      <div className="tl-fan-hd">
        Three candidate futures · one thesis per vector
      </div>
      <ul className="tl-fan">
        {futures.map((n, i) => (
          <li key={"f" + i} className="tl-fan-row">
            <span className="tl-fan-vec">Vector {n.vector}</span>
            <span className="tl-fan-arrow" aria-hidden="true">
              →
            </span>
            <span className="tl-fan-label">{n.label}</span>
            <span className="tl-fan-meta">
              {n.meta.replace(/^future · /, "")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
