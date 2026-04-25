// Dashboard - the weekly radar + 90-day plan.
// Route path: /radar (the unauthed root `/` is the landing page).
// Server component. Reads opportunities, latest scout_run, latest strategist_run.

import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import OppCardLink from "@/components/cards/OppCardLink";
import AdminRerunButton from "@/components/AdminRerunButton";
import ClearRadarNudge from "@/components/ClearRadarNudge";
import { getServerUser } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { isAdminProfile } from "@/lib/admin";
import { nextDestinationFor } from "@/lib/routing";
import {
  buildPicksMap,
  buildScoresMap,
  computeStrategistState,
  type PicksMap,
  type ScoresMap,
} from "@/lib/agents/strategist/output-reader";
import { computeRuleBasedScores } from "@/lib/scoring/rule-based";
import type {
  Opportunity,
  OpportunityCategory,
  ScoutRun,
  StrategistRun,
} from "@/lib/supabase/types";

const CATS: { id: OpportunityCategory; label: string; hint: string }[] = [
  { id: "dated_one_shot", label: "Dated · one-shot", hint: "Specific deadline, runs once this year" },
  { id: "rolling", label: "Rolling", hint: "No deadline; decision window 2 to 6 weeks" },
  { id: "recurrent_annual", label: "Recurrent · annual", hint: "Returns yearly; start preparing now" },
  { id: "arena", label: "Arenas", hint: "Ongoing practice grounds and OSS tracks" },
];

type PlanItem = { text: string; meta: string; ok?: boolean };
type PlanTier = { label: string; range: string; items: PlanItem[] };

const FALLBACK_PLAN: { generatedAt: string; horizon: string; tiers: PlanTier[] } = {
  generatedAt: "2026-04-22 06:12 BRT",
  horizon: "90 days · to 2026-07-22",
  tiers: [
    {
      label: "This week",
      range: "apr 22 to 28",
      items: [
        {
          text:
            "Ship Emergent Ventures application. Use the T5 monograph as centrepiece; open with Cosseno exit in one sentence.",
          meta: "op_0142 · fit 84 · est. 6h",
          ok: true,
        },
        {
          text:
            "Submit first checkpoint to Hugging Face PT-BR leaderboard. Target top-5 placement, not the win.",
          meta: "op_0171 · fit 88 · est. 3h",
          ok: true,
        },
      ],
    },
    {
      label: "Next 30 days",
      range: "apr 29 to may 26",
      items: [
        {
          text:
            "Open conversation with a MEXT host professor. Two Tsukuba candidates identified, one Osaka.",
          meta: "op_0119 · fit 71",
        },
        {
          text: "Draft FAPESP PIPE Fase 1 orçamento at R$ 218k. Anexo técnico = monograph.",
          meta: "op_0128 · fit 79",
        },
      ],
    },
    {
      label: "60 to 90 days",
      range: "may 27 to jul 22",
      items: [
        {
          text: "Submit first METR task. Pick an eval closest to your T5 methodology.",
          meta: "op_0173 · fit 73",
        },
      ],
    },
  ],
};

function extractPlan(
  run: StrategistRun | null,
): { generatedAt: string; horizon: string; tiers: PlanTier[] } {
  if (!run?.output || typeof run.output !== "object") return FALLBACK_PLAN;
  const out = run.output as Record<string, unknown>;
  if (Array.isArray(out.tiers)) {
    return {
      generatedAt: typeof out.generatedAt === "string" ? out.generatedAt : FALLBACK_PLAN.generatedAt,
      horizon: typeof out.horizon === "string" ? out.horizon : FALLBACK_PLAN.horizon,
      tiers: out.tiers as PlanTier[],
    };
  }
  return FALLBACK_PLAN;
}

function minutesAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((now - then) / 60000));
  if (mins < 1) return "moments";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  return `${days}d`;
}

export default async function DashboardPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const { destination, profile } = await nextDestinationFor(user.id);
  if (destination !== "/radar") redirect(destination);

  const supabase = await createClient();

  const [oppsRes, scoutRes, stratRes] = await Promise.all([
    supabase.from("opportunities").select("*").order("fit", { ascending: false }),
    supabase
      .from("scout_runs")
      .select("*")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    user
      ? supabase
          .from("strategist_runs")
          .select("*")
          .eq("user_id", user.id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const opps: Opportunity[] = (oppsRes.data as Opportunity[] | null) ?? [];
  const scoutRun = (scoutRes.data as ScoutRun | null) ?? null;
  const stratRun = (stratRes.data as StrategistRun | null) ?? null;

  const currentAnamnesisRunId = profile?.anamnesis_run_id ?? null;
  const strategistState = computeStrategistState(stratRun, currentAnamnesisRunId);

  // Delegate the wait UX to /generating for all in-progress states.
  if (
    strategistState === "fresh" ||
    strategistState === "stale" ||
    strategistState === "running"
  ) {
    redirect("/generating?step=strategist");
  }

  // State is "ready" or "error" from here on.
  const picksMap: PicksMap =
    strategistState === "ready" ? buildPicksMap(stratRun) : new Map();

  // Bulk score precedence:
  //   1. Agent-emitted all_scores (Strategist's own bulk scoring; currently
  //      unused since we ship rule-based, but the hook stays for when an
  //      LLM scorer is plugged back in).
  //   2. Deterministic rule-based scoring computed in-process (free, fast).
  // Picks override scores by id at the OppCard render layer.
  const agentScoresMap: ScoresMap =
    strategistState === "ready" ? buildScoresMap(stratRun) : new Map();
  const ruleScoresMap = computeRuleBasedScores(opps, profile);
  const scoresMap: ScoresMap =
    agentScoresMap.size > 0 ? agentScoresMap : ruleScoresMap;
  const showError = strategistState === "error";
  const isAdmin = isAdminProfile(profile);

  // Effective fit precedence: pick (rich card) > bulk score > legacy seed > none.
  function effectiveFit(o: Opportunity): number | null {
    const pick = picksMap.get(o.id);
    if (pick) return pick.fit_score;
    const score = scoresMap.get(o.id);
    if (score) return score.fit_score;
    return typeof o.fit === "number" ? o.fit : null;
  }

  // Excluded = bulk-scored as "exclude" AND not a Strategist pick. These go
  // to the "Outras oportunidades" footer instead of the main category list.
  function isExcluded(o: Opportunity): boolean {
    if (picksMap.has(o.id)) return false;
    const score = scoresMap.get(o.id);
    return score?.fit_band === "exclude";
  }

  const plan = extractPlan(stratRun);
  const highest =
    opps.length > 0
      ? Math.max(0, ...opps.map((o) => effectiveFit(o) ?? 0))
      : 0;
  const openNow = opps.filter((o) => /open|rolling|live|accepting/i.test(o.status ?? "")).length;
  const scoutAgo = scoutRun?.finished_at ? minutesAgo(scoutRun.finished_at) : "47m";
  const cycleLabel = scoutRun?.cycle_label ?? "week 17 · apr 20 to 26, 2026";

  // Re-rank within a category: Strategist picks first (by rank_in_section),
  // then everything else by effective fit DESC (with null fit going last).
  function rerank(items: Opportunity[]): Opportunity[] {
    const picked = items
      .filter((o) => picksMap.has(o.id))
      .sort((a, b) => {
        const ra = picksMap.get(a.id)!.rank_in_section;
        const rb = picksMap.get(b.id)!.rank_in_section;
        return ra - rb;
      });
    const unpicked = items
      .filter((o) => !picksMap.has(o.id))
      .sort((a, b) => {
        const fa = effectiveFit(a);
        const fb = effectiveFit(b);
        // Nulls sort to the end.
        if (fa === null && fb === null) return 0;
        if (fa === null) return 1;
        if (fb === null) return -1;
        return fb - fa;
      });
    return [...picked, ...unpicked];
  }

  // Split opportunities by category, excluding low-fit "Outras oportunidades"
  // which renders as its own footer section.
  const visibleOpps = opps.filter((o) => !isExcluded(o));
  const excludedOpps = opps
    .filter(isExcluded)
    .sort((a, b) => (effectiveFit(b) ?? 0) - (effectiveFit(a) ?? 0));

  const byCat = CATS.map((c) => ({
    cat: c,
    items: rerank(visibleOpps.filter((o) => o.category === c.id)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="wrap">
      <Appbar
        route="radar"
        userInitials={(profile?.display_name ?? profile?.github_handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={profile?.github_handle ?? "you"}
        userName={profile?.display_name ?? profile?.github_handle ?? "you"}
        userCity=""
        intakeSubmitted={true}
        onboardComplete={true}
      />

      <div className="dash-hd">
        <div>
          <div className="eyebrow">
            <span>{cycleLabel}</span>
            <span className="live">
              <span className="pulse"></span>Scout finished {scoutAgo} ago
            </span>
            <a
              href="/scout"
              style={{ color: "var(--ink-3)", textDecoration: "underline" }}
            >
              watch scout →
            </a>
          </div>
          <h1>
            Your radar
            <span
              style={{
                display: "inline-block",
                width: ".5em",
                height: ".75em",
                background: "var(--accent)",
                marginLeft: ".05em",
                verticalAlign: "-.05em",
                animation: "blink 1.05s steps(1) infinite",
              }}
            ></span>
          </h1>
        </div>
        <div className="stats">
          <div className="stat">
            <b>{opps.length}</b>new this week
          </div>
          <div className="stat">
            <b>{openNow}</b>open right now
          </div>
          <div className="stat">
            <b>{highest}</b>highest fit
          </div>
        </div>
      </div>

      {/* 90-day plan above the filter row */}
      <div className="plan">
        <h2>Strategist · 90-day plan</h2>
        {showError ? (
          <p
            className="sub"
            style={{ color: "var(--red, #c0392b)" }}
          >
            Strategist encountered an error on the last run. Showing catalog without personalized ranking.
          </p>
        ) : (
          <p className="sub">
            generated {plan.generatedAt} · horizon {plan.horizon}
          </p>
        )}
        {!showError && (
          <div className="plan-grid">
            {plan.tiers.map((tier, i) => (
              <div key={i} className="plan-col">
                <h4>
                  <span>{tier.label}</span> · {tier.range}
                </h4>
                <ol>
                  {tier.items.map((it, j) => (
                    <li key={j}>
                      {it.text}
                      <span className="meta">
                        {it.meta}
                        {it.ok && <span className="ok"> · strategist picks</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <div style={{ marginTop: "1rem" }}>
            <AdminRerunButton />
          </div>
        )}
      </div>

      <div className="filter-row">
        <button className="pill on" type="button">
          All <span className="ct">{visibleOpps.length}</span>
        </button>
        {CATS.map((c) => {
          const n = visibleOpps.filter((o) => o.category === c.id).length;
          return (
            <button key={c.id} className="pill" type="button">
              {c.label} <span className="ct">{n}</span>
            </button>
          );
        })}
        <span className="spacer"></span>
        <span className="sort">Sorted by fit · Strategist weighting</span>
      </div>

      {byCat.map(({ cat, items }) => (
        <div key={cat.id} className="dash-section">
          <div className="category-hd">
            <h3>
              <span className="n">/</span>
              {cat.label}
            </h3>
            <span>
              {items.length} · {cat.hint}
            </span>
          </div>
          <div className="grid-3">
            {items.map((o) => (
              <OppCardLink
                key={o.id}
                o={o}
                pick={picksMap.get(o.id)}
                score={scoresMap.get(o.id)}
              />
            ))}
          </div>
        </div>
      ))}

      {excludedOpps.length > 0 && (
        <div className="dash-section">
          <div className="category-hd">
            <h3>
              <span className="n">/</span>
              Outras oportunidades
            </h3>
            <span>
              {excludedOpps.length} · fit baixo, listadas para descoberta
            </span>
          </div>
          <div className="grid-3">
            {excludedOpps.map((o) => (
              <OppCardLink
                key={o.id}
                o={o}
                pick={picksMap.get(o.id)}
                score={scoresMap.get(o.id)}
              />
            ))}
          </div>
        </div>
      )}

      <ClearRadarNudge />
      <CornerMeta />
    </div>
  );
}
