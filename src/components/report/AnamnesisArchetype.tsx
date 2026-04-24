import type { AnamnesisArchetype as ArchetypeT } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisArchetype({ a }: { a: ArchetypeT }) {
  return (
    <section className="anap-sec">
      <SecHead
        n="02"
        kicker="The kind of animal you are"
        title="Archetype"
      />
      <div className="anap-arch">
        <div className="anap-arch-l">
          <div className="anap-arch-mono">your archetype is</div>
          <h2 className="anap-arch-name">{a.name}</h2>
          <div className="anap-arch-not">
            <span className="anap-arch-not-k">you are not:</span>
            {a.notName.map((x, i) => (
              <span key={i} className="anap-arch-not-v">
                {x}
              </span>
            ))}
          </div>
          <blockquote className="anap-arch-quote">
            <p className="pt">&ldquo;{a.shortQuote}&rdquo;</p>
            <p className="en">{a.shortQuoteEn}</p>
          </blockquote>
        </div>
        <div className="anap-arch-r">
          <p className="anap-prose">{a.body}</p>
          <div className="anap-ev">
            <div className="anap-ev-head">Evidence</div>
            {a.evidence.map((e, i) => (
              <div key={i} className="anap-ev-row">
                <span className="anap-ev-n">0{i + 1}</span>
                {e}
              </div>
            ))}
          </div>
          <p className="anap-prose anap-dim">{a.twinArchetypes}</p>
        </div>
      </div>
    </section>
  );
}
