import type { AnamnesisReading } from "@/lib/sample-data/anamnesis-report";
import SecHead from "./SecHead";

export default function AnamnesisReadings({
  rs,
}: {
  rs: AnamnesisReading[];
}) {
  return (
    <section className="anap-sec">
      <SecHead
        n="10"
        kicker="Seven prescriptions, picked for you"
        title="Reading list"
      />
      <div className="anap-read">
        {rs.map((r, i) => (
          <div key={i} className="anap-read-row">
            <div className="anap-read-l">
              <span className="anap-read-kind">{r.kind}</span>
              <span className="anap-read-n">№ 0{i + 1}</span>
            </div>
            <div className="anap-read-m">
              <h3 className="anap-read-title">{r.title}</h3>
              <p className="anap-read-author">{r.author}</p>
            </div>
            <p className="anap-read-why">{r.why}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
