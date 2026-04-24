import type { Opportunity } from "@/lib/supabase/types";
import type { PickOverride } from "@/lib/agents/strategist/output-reader";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

export default function OppCard({
  o,
  pick,
  whyOverride,
}: {
  o: Opportunity;
  pick?: PickOverride;
  whyOverride?: string;
}) {
  const fitDisplay = pick ? pick.fit_score : (o.fit ?? 0);
  const why = whyOverride ?? (pick ? pick.why_you : extractWhy(o));
  const isStrategistPick = !!pick;

  return (
    <article className="ocard">
      <div className="crown">
        <span className="badge">
          <span className="pulse"></span>
          {o.badge ?? "bolsas · inscrições abertas"}
        </span>
        <span>{o.loc}</span>
      </div>
      <h3>{o.title}</h3>
      <p className="sub">{o.org}</p>
      <div className="fit">
        <span className="num">{fitDisplay}</span>
        <span className="of">/100</span>
        <span className="lbl">fit</span>
        {isStrategistPick && (
          <span className="lbl" style={{ marginLeft: ".5em", color: "var(--accent, #6366f1)" }}>
            · strategist pick
          </span>
        )}
      </div>
      <dl>
        <dt>Deadline</dt>
        <dd>{o.deadline ?? "—"}</dd>
        <dt>Funding</dt>
        <dd>{o.funding_brl ?? "—"}</dd>
      </dl>
      <div className="why">
        <span className="tag">Why you · Strategist</span>
        {truncate(why, 180)}
      </div>
    </article>
  );
}

function extractWhy(o: Opportunity): string {
  const dd = o.deep_data;
  if (dd && typeof dd === "object" && "why" in dd) {
    const w = (dd as Record<string, unknown>).why;
    if (typeof w === "string") return w;
  }
  return "Strategist has not yet produced a why-you paragraph for this opportunity. The next weekly run will populate one.";
}
