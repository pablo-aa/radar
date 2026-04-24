import type { AnamnesisRisks as RisksT } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisRisks({ r }: { r: RisksT }) {
  return (
    <section className="anap-sec anap-sec-risks">
      <SecHead
        n="08"
        kicker="What you should not do"
        title="Risk profile"
      />
      <p className="anap-lede-sm">{r.lede}</p>
      <ul className="anap-risk-list">
        {r.items.map((it, i) => (
          <li key={i}>
            <div className="anap-risk-no">
              <span className="anap-risk-x">✕</span>
              <span className="anap-risk-n">0{i + 1}</span>
            </div>
            <div>
              <h3 className="anap-risk-title">{it.title}</h3>
              <p className="anap-risk-body">{it.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
