import type { Opportunity } from "@/lib/supabase/types";
import type {
  BulkScoreEntry,
  PickOverride,
} from "@/lib/agents/strategist/output-reader";
import { displayOrDash } from "@/lib/format";

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

export default function OppCard({
  o,
  pick,
  score,
  whyOverride,
}: {
  o: Opportunity;
  pick?: PickOverride;
  score?: BulkScoreEntry;
  whyOverride?: string;
}) {
  // Score precedence:
  //   pick:  Strategist wrote a full card with rich why_you. Use its fit.
  //   score: Strategist scored it in bulk (all_scores) but did not write a card.
  //   o.fit: legacy seed value on the opportunity row (rare; pre-Strategist
  //          catalogs have it).
  //   null:  no per-user signal; render an em-dash so the UI does not imply
  //          "scored 0/100".
  const fitDisplay: number | null = pick
    ? pick.fit_score
    : score
      ? score.fit_score
      : typeof o.fit === "number"
        ? o.fit
        : null;

  const why = whyOverride ?? (pick ? pick.why_you : extractWhy(o));
  const isStrategistPick = !!pick;
  const isStrategistScored = !pick && !!score;

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
        <span className="num">{fitDisplay ?? "—"}</span>
        <span className="of">/100</span>
        <span className="lbl">fit</span>
        {isStrategistPick ? (
          <span
            className="lbl"
            style={{ marginLeft: ".5em", color: "var(--accent, #6366f1)" }}
          >
            · strategist pick
          </span>
        ) : isStrategistScored ? null : (
          fitDisplay === null && (
            <span
              className="lbl"
              style={{ marginLeft: ".5em", color: "var(--ink-4)" }}
            >
              · scout · not yet ranked
            </span>
          )
        )}
      </div>
      <dl>
        <dt>Deadline</dt>
        <dd>{displayOrDash(o.deadline)}</dd>
        <dt>Funding</dt>
        <dd>{displayOrDash(o.funding_brl)}</dd>
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
