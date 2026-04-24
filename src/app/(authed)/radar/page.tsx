// Dashboard - the weekly radar + 90-day plan.
// Route path: /radar (the unauthed root `/` is the landing page).
// Server component. Reads opportunities, latest scout_run, latest strategist_run.

import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import OppCardLink from "@/components/cards/OppCardLink";
import StrategistAutoRunner from "@/components/StrategistAutoRunner";
import AdminRerunButton from "@/components/AdminRerunButton";
import { getProfile, getServerUser } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { isAdminProfile } from "@/lib/admin";
import {
  buildPicksMap,
  computeStrategistState,
} from "@/lib/agents/strategist/output-reader";
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
  const profile = user ? await getProfile(user.id) : null;
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
  const picksMap = buildPicksMap(stratRun);
  const isAdmin = isAdminProfile(profile);

  const plan = extractPlan(stratRun);
  const highest = opps.length > 0 ? Math.max(...opps.map((o) => o.fit ?? 0)) : 0;
  const openNow = opps.filter((o) => /open|rolling|live|accepting/i.test(o.status ?? "")).length;
  const scoutAgo = scoutRun?.finished_at ? minutesAgo(scoutRun.finished_at) : "47m";
  const cycleLabel = scoutRun?.cycle_label ?? "week 17 · apr 20 to 26, 2026";

  // Re-rank: Strategist picks first (by rank_in_section), non-picks after (by seed fit DESC).
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
      .sort((a, b) => (b.fit ?? 0) - (a.fit ?? 0));
    return [...picked, ...unpicked];
  }

  const byCat = CATS.map((c) => ({
    cat: c,
    items: rerank(opps.filter((o) => o.category === c.id)),
  })).filter((g) => g.items.length > 0);

  const generating =
    strategistState === "fresh" ||
    strategistState === "stale" ||
    strategistState === "running";

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

      {/* Auto-trigger on fresh/stale; not on running (already in progress), error, or ready. */}
      {(strategistState === "fresh" || strategistState === "stale") && (
        <StrategistAutoRunner />
      )}

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

      {generating ? (
        <div
          style={{
            padding: "5rem 1rem",
            textAlign: "center",
            borderTop: "1px solid var(--ink-5, rgba(26, 26, 23, 0.12))",
            borderBottom: "1px solid var(--ink-5, rgba(26, 26, 23, 0.12))",
            margin: "2rem 0",
          }}
        >
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              color: "var(--ink-3)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "1.5rem",
            }}
          >
            Strategist · running
          </div>
          <h2
            style={{
              fontFamily: "var(--mono)",
              fontSize: "28px",
              fontWeight: 700,
              lineHeight: 1.2,
              margin: 0,
              maxWidth: "640px",
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Reading your profile, ranking the catalog.
            <span
              style={{
                display: "inline-block",
                width: ".45em",
                height: ".75em",
                background: "var(--accent)",
                marginLeft: ".08em",
                verticalAlign: "-.05em",
                animation: "blink 1.05s steps(1) infinite",
              }}
            ></span>
          </h2>
          <p
            style={{
              fontFamily: "var(--serif)",
              fontSize: "16px",
              color: "var(--ink-2)",
              marginTop: "1.25rem",
              maxWidth: "560px",
              marginLeft: "auto",
              marginRight: "auto",
              lineHeight: 1.5,
            }}
          >
            Claude Opus 4.7 is weighing your trajectory against each opportunity
            in this week&apos;s catalog. One pass. Output is a 90-day plan and a
            fit score grounded in your work.
          </p>
          <p
            style={{
              fontFamily: "var(--mono)",
              fontSize: "11px",
              color: "var(--ink-3)",
              marginTop: "2rem",
            }}
          >
            About 2 to 3 minutes. You can close this tab, results persist.
          </p>
          {isAdmin && (
            <div style={{ marginTop: "2rem" }}>
              <AdminRerunButton />
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 90-day plan above the filter row */}
          <div className="plan">
            <h2>Strategist · 90-day plan</h2>
            <p className="sub">
              generated {plan.generatedAt} · horizon {plan.horizon}
            </p>
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
            {isAdmin && (
              <div style={{ marginTop: "1rem" }}>
                <AdminRerunButton />
              </div>
            )}
          </div>

          <div className="filter-row">
            <button className="pill on" type="button">
              All <span className="ct">{opps.length}</span>
            </button>
            {CATS.map((c) => {
              const n = opps.filter((o) => o.category === c.id).length;
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
                  <OppCardLink key={o.id} o={o} pick={picksMap.get(o.id)} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      <CornerMeta />
    </div>
  );
}
