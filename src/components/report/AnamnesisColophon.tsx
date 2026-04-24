import Link from "next/link";
import type { AnamnesisMeta } from "@/lib/sample-data/anamnesis-report";

export default function AnamnesisColophon({ meta }: { meta: AnamnesisMeta }) {
  return (
    <section className="anap-colo">
      <div className="anap-colo-bar"></div>
      <div className="anap-colo-grid">
        <div>
          <div className="anap-colo-label">Colophon</div>
          <p className="anap-colo-body">
            This Anamnesis was composed from {meta.basedOn}. Confidence{" "}
            {Math.round(meta.confidence * 100)} / 100. It is a draft, not a
            verdict. Re-run when your work changes.
          </p>
        </div>
        <div className="anap-colo-actions">
          <Link className="btn" href="/radar">
            <span className="hi">G</span>o to radar
            <span className="cur"></span>
          </Link>
          <Link className="btn ghost" href="/settings">
            Re-run Anamnesis
          </Link>
        </div>
      </div>
      <div className="anap-colo-meta">
        <span>{meta.version}</span>
        <span>generated {meta.generated}</span>
        <span>previous · {meta.previousVersion}</span>
        <span>claude opus 4.7 · managed agents</span>
      </div>
    </section>
  );
}
