import type { AnamnesisMeta } from "@/lib/sample-data/anamnesis-report";

export default function AnamnesisMasthead({ meta }: { meta: AnamnesisMeta }) {
  return (
    <div className="anap-mast">
      <div className="anap-mast-l">
        <div className="anap-mast-label">A self-portrait, generated</div>
        <div className="anap-mast-title">
          Anamnesis · № {meta.version.split(" ")[0]}
        </div>
      </div>
      <div className="anap-mast-r">
        <div>
          <span className="k">subject</span>
          <span className="v">{meta.subject}</span>
        </div>
        <div>
          <span className="k">generated</span>
          <span className="v">{meta.generated}</span>
        </div>
        <div>
          <span className="k">based on</span>
          <span className="v">{meta.basedOn}</span>
        </div>
        <div>
          <span className="k">confidence</span>
          <span className="v">
            {Math.round(meta.confidence * 100)} / 100
          </span>
        </div>
        <div>
          <span className="k">previous</span>
          <span className="v">{meta.previousVersion}</span>
        </div>
      </div>
    </div>
  );
}
