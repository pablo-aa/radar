import type { AnamnesisVector } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisVectors({
  vs,
}: {
  vs: AnamnesisVector[];
}) {
  return (
    <section className="anap-sec">
      <SecHead
        n="07"
        kicker="Three paths forward, with tradeoffs"
        title="Career vectors"
      />
      <div className="anap-vec-grid">
        {vs.map((v) => (
          <article key={v.key} className="anap-vec">
            <div className="anap-vec-hd">
              <span className="anap-vec-key">vector {v.key}</span>
              <span className="anap-vec-conf">
                confidence · {Math.round(v.confidence * 100)}%
              </span>
            </div>
            <h3 className="anap-vec-label">{v.label}</h3>
            <p className="anap-vec-becomes">
              <em>You become:</em> {v.becomes}
            </p>
            <div className="anap-vec-section">
              <div className="anap-vec-sub">Year 1</div>
              <p>{v.year1}</p>
            </div>
            <div className="anap-vec-section">
              <div className="anap-vec-sub">Year 3 ceiling</div>
              <p>{v.year3}</p>
            </div>
            <div className="anap-vec-section anap-vec-trade">
              <div className="anap-vec-sub">Honest tradeoff</div>
              <p>{v.tradeoff}</p>
            </div>
            <div className="anap-vec-fit">{v.fit}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
