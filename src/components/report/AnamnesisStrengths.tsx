import type { AnamnesisStrength } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisStrengths({
  ss,
}: {
  ss: AnamnesisStrength[];
}) {
  return (
    <section className="anap-sec">
      <SecHead
        n="04"
        kicker={`${ss.length} named strengths, with evidence`}
        title="Strengths"
      />
      <div className="anap-str">
        {ss.map((s) => (
          <div key={s.n} className="anap-str-row">
            <div className="anap-str-n">0{s.n}</div>
            <div className="anap-str-body">
              <h3 className="anap-str-name">{s.name}</h3>
              <p className="anap-str-ev">{s.evidence}</p>
              <div className="anap-str-src">source · {s.source}</div>
            </div>
            <div className="anap-str-score">
              <div className="anap-str-num">{s.score}</div>
              <div className="anap-str-bar">
                <i style={{ width: s.score + "%" }}></i>
              </div>
              <div className="anap-str-lbl">signal</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
