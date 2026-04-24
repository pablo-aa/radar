import type { AnamnesisAdvantage } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisAdvantages({
  items,
}: {
  items: AnamnesisAdvantage[];
}) {
  return (
    <section className="anap-sec anap-sec-plate">
      <SecHead
        n="06"
        kicker="Assets your rivals do not have"
        title="Unfair advantages"
      />
      <div className="anap-adv">
        {items.map((it, i) => (
          <div key={i} className="anap-adv-row">
            <div className="anap-adv-num">0{i + 1}</div>
            <div>
              <h3 className="anap-adv-title">{it.title}</h3>
              <p className="anap-adv-body">{it.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
