import type { AnamnesisTerritory as TerritoryT } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisTerritory({ t }: { t: TerritoryT }) {
  const sorted = [...t.provinces].sort((a, b) => b.weight - a.weight);
  const yours = sorted.filter((p) => p.you || p.weight >= 0.6);
  const yourNames = new Set(yours.map((p) => p.name));

  return (
    <section className="anap-sec">
      <SecHead
        n="03"
        kicker="Your place in the landscape"
        title="Territory"
      />
      <p className="anap-lede-sm">{t.lede}</p>

      <div className="terr-legend">
        <span className="terr-leg-item">
          <span className="terr-sw terr-sw-you"></span>your citizenship
        </span>
        <span className="terr-leg-item">
          <span className="terr-sw terr-sw-near"></span>adjacent · some signal
        </span>
        <span className="terr-leg-item">
          <span className="terr-sw terr-sw-far"></span>distant · low signal
        </span>
        <span className="terr-leg-meta">
          twelve provinces · ranked by fit to portfolio
        </span>
      </div>

      <div className="terr-grid">
        {sorted.map((p, i) => {
          const isYou = !!p.you;
          const isNear = !p.you && yourNames.has(p.name);
          const pct = Math.round(p.weight * 100);
          let tier = "far";
          if (isYou) tier = "you";
          else if (isNear) tier = "near";
          else if (p.weight >= 0.25) tier = "mid";
          return (
            <div key={i} className={"terr-box terr-" + tier}>
              <div className="terr-rank">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="terr-name">{p.name}</div>
              <div className="terr-bar">
                <i style={{ width: pct + "%" }}></i>
              </div>
              <div className="terr-foot">
                <span className="terr-pct">{pct}</span>
                <span className="terr-lbl">
                  {isYou
                    ? "you are here"
                    : isNear
                      ? "border province"
                      : "signal"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="anap-prose anap-prose-wide"
        style={{ marginTop: 32 }}
      >
        {t.verdict}
      </p>
    </section>
  );
}
