import type { AnamnesisYearShape as YearShapeT } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisYearShape({ y }: { y: YearShapeT }) {
  return (
    <section className="anap-sec anap-year">
      <SecHead
        n="09"
        kicker="What the next 12 months should feel like"
        title="Year-shape"
      />
      <div className="anap-year-grid">
        <aside>
          <div className="anap-year-sub">Shape</div>
          <div className="anap-year-shape">{y.shape}</div>
          <div className="anap-year-sub" style={{ marginTop: 20 }}>
            Counter-shape
          </div>
          <div className="anap-year-counter">{y.counterShape}</div>
        </aside>
        <div>
          <p className="anap-year-body">{y.body}</p>
        </div>
      </div>
    </section>
  );
}
