// Public showcase route. Renders Pablo's actual Anamnesis report,
// Strategist 90-day plan, and weekly radar without requiring auth.
// Built for hackathon judges. Single static URL: /showcase.

import { notFound } from "next/navigation";
import "server-only";

import AnamnesisMasthead from "@/components/report/AnamnesisMasthead";
import AnamnesisHeadline from "@/components/report/AnamnesisHeadline";
import AnamnesisArchetype from "@/components/report/AnamnesisArchetype";
import AnamnesisTerritory from "@/components/report/AnamnesisTerritory";
import AnamnesisStrengths from "@/components/report/AnamnesisStrengths";
import AnamnesisPeers from "@/components/report/AnamnesisPeers";
import AnamnesisAdvantages from "@/components/report/AnamnesisAdvantages";
import AnamnesisVectors from "@/components/report/AnamnesisVectors";
import AnamnesisRisks from "@/components/report/AnamnesisRisks";
import AnamnesisYearShape from "@/components/report/AnamnesisYearShape";
import AnamnesisReadings from "@/components/report/AnamnesisReadings";
import AnamnesisColophon from "@/components/report/AnamnesisColophon";

import OppCard from "@/components/cards/OppCard";
import {
  buildPicksMap,
  buildScoresMap,
  type PicksMap,
  type ScoresMap,
} from "@/lib/agents/strategist/output-reader";
import { computeRuleBasedScores } from "@/lib/scoring/rule-based";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Opportunity,
  OpportunityCategory,
  StrategistRun,
} from "@/lib/supabase/types";
import type { AnamnesisReport } from "@/lib/sample-data/anamnesis-report";

const SHOWCASE_HANDLE = "pablo-aa";

const CATS: { id: OpportunityCategory; label: string; hint: string }[] = [
  { id: "dated_one_shot", label: "Dated · one-shot", hint: "Specific deadline, runs once this year" },
  { id: "rolling", label: "Rolling", hint: "No deadline; decision window 2 to 6 weeks" },
  { id: "recurrent_annual", label: "Recurrent · annual", hint: "Returns yearly; start preparing now" },
  { id: "arena", label: "Arenas", hint: "Ongoing practice grounds and OSS tracks" },
];

// Always read fresh from Supabase. Showcase data evolves between runs.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Radar · showcase (built for hackathon judges)",
  description:
    "Public render of Radar's actual output: Anamnesis self-portrait, Strategist 90-day plan, and weekly radar. Generated end-to-end by three composed Claude Opus 4.7 Managed Agents.",
};

type PlanItem = { text: string; meta: string; ok?: boolean };
type PlanTier = { label: string; range: string; items: PlanItem[] };

function extractPlan(
  run: StrategistRun | null,
): { generatedAt: string; horizon: string; tiers: PlanTier[] } | null {
  if (!run?.output || typeof run.output !== "object") return null;
  const out = run.output as Record<string, unknown>;
  if (!Array.isArray(out.tiers) || out.tiers.length === 0) return null;
  return {
    generatedAt: typeof out.generatedAt === "string" ? out.generatedAt : "",
    horizon: typeof out.horizon === "string" ? out.horizon : "",
    tiers: out.tiers as PlanTier[],
  };
}

function extractReport(output: unknown): AnamnesisReport | null {
  if (!output || typeof output !== "object") return null;
  const out = output as Record<string, unknown>;
  // New shape: report nested under output.report.
  if (
    typeof out.report === "object" &&
    out.report !== null &&
    !Array.isArray(out.report)
  ) {
    const rep = out.report as Record<string, unknown>;
    if ("meta" in rep && "headline" in rep && "timeline" in rep && "archetype" in rep) {
      return rep as unknown as AnamnesisReport;
    }
  }
  // Legacy shape: report fields at top level of output.
  if ("meta" in out && "headline" in out && "timeline" in out && "archetype" in out) {
    return out as unknown as AnamnesisReport;
  }
  return null;
}

async function loadShowcase() {
  const admin = createAdminClient();

  const profileRes = await admin
    .from("profiles")
    .select("*")
    .eq("github_handle", SHOWCASE_HANDLE)
    .maybeSingle();

  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) return null;
  const profile = profileRes.data;

  const [anamnesisRes, oppsRes, stratRes] = await Promise.all([
    admin
      .from("anamnesis_runs")
      .select("*")
      .eq("user_id", profile.user_id)
      .eq("status", "done")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("opportunities")
      .select("*")
      .order("fit", { ascending: false })
      .limit(500),
    admin
      .from("strategist_runs")
      .select("*")
      .eq("user_id", profile.user_id)
      .eq("status", "done")
      .order("finished_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    profile,
    anamnesisRun: anamnesisRes.data,
    opps: (oppsRes.data as Opportunity[] | null) ?? [],
    stratRun: (stratRes.data as StrategistRun | null) ?? null,
  };
}

export default async function ShowcasePage() {
  let data: Awaited<ReturnType<typeof loadShowcase>>;
  try {
    data = await loadShowcase();
  } catch (err) {
    console.error("[showcase] data fetch failed", err);
    return <ShowcaseUnavailable />;
  }

  if (!data) notFound();

  const { profile, anamnesisRun, opps, stratRun } = data;

  const report = extractReport(anamnesisRun?.output ?? null);

  const picksMap: PicksMap = stratRun ? buildPicksMap(stratRun) : new Map();
  const agentScoresMap: ScoresMap = stratRun ? buildScoresMap(stratRun) : new Map();
  const ruleScoresMap = computeRuleBasedScores(opps, profile);
  const scoresMap: ScoresMap = agentScoresMap.size > 0 ? agentScoresMap : ruleScoresMap;

  function effectiveFit(o: Opportunity): number | null {
    const pick = picksMap.get(o.id);
    if (pick) return pick.fit_score;
    const score = scoresMap.get(o.id);
    if (score) return score.fit_score;
    return typeof o.fit === "number" ? o.fit : null;
  }

  function isExcluded(o: Opportunity): boolean {
    if (picksMap.has(o.id)) return false;
    const score = scoresMap.get(o.id);
    return score?.fit_band === "exclude";
  }

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
        if (fa === null && fb === null) return 0;
        if (fa === null) return 1;
        if (fb === null) return -1;
        return fb - fa;
      });
    return [...picked, ...unpicked];
  }

  const plan = extractPlan(stratRun);
  const visibleOpps = opps.filter((o) => !isExcluded(o));
  const byCat = CATS.map((c) => ({
    cat: c,
    items: rerank(visibleOpps.filter((o) => o.category === c.id)),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="wrap">
      <ShowcaseBanner />

      {report ? (
        <>
          <AnamnesisMasthead meta={report.meta} />
          <AnamnesisHeadline h={report.headline} tl={report.timeline} />
          <AnamnesisArchetype a={report.archetype} />
          <AnamnesisTerritory t={report.territory} />
          <AnamnesisStrengths ss={report.strengths} />
          <AnamnesisPeers p={report.peers} />
          <AnamnesisAdvantages items={report.advantages} />
          <AnamnesisVectors vs={report.vectors} />
          <AnamnesisRisks r={report.risks} />
          <AnamnesisYearShape y={report.yearShape} />
          <AnamnesisReadings rs={report.readings} />
          <AnamnesisColophon meta={report.meta} />
        </>
      ) : (
        <ShowcaseEmptyNote label="Anamnesis report" />
      )}

      <ShowcaseDivider label="Strategist · 90-day plan" />

      {plan ? (
        <div className="plan">
          {(plan.generatedAt || plan.horizon) && (
            <p className="sub">
              {plan.generatedAt && <>generated {plan.generatedAt}</>}
              {plan.generatedAt && plan.horizon && " · "}
              {plan.horizon && <>horizon {plan.horizon}</>}
            </p>
          )}
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
        </div>
      ) : (
        <ShowcaseEmptyNote label="Strategist plan" />
      )}

      <ShowcaseDivider label="Strategist · weekly radar" />

      {byCat.length > 0 ? (
        byCat.map(({ cat, items }) => (
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
                <OppCard
                  key={o.id}
                  o={o}
                  pick={picksMap.get(o.id)}
                  score={scoresMap.get(o.id)}
                />
              ))}
            </div>
          </div>
        ))
      ) : (
        <ShowcaseEmptyNote label="opportunities catalog" />
      )}

      <ShowcaseFooter />
    </div>
  );
}

function ShowcaseBanner() {
  return (
    <div
      style={{
        margin: "1.5rem 0 2rem",
        padding: "1rem 1.25rem",
        border: "1px solid var(--ink-5, #e5e5e5)",
        borderLeft: "3px solid var(--accent, #6366f1)",
        background: "var(--paper, #fafafa)",
        fontFamily: "var(--mono, ui-monospace)",
        fontSize: 13,
        lineHeight: 1.55,
        color: "var(--ink, #1a1a17)",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        Showcase · built for hackathon judges
      </div>
      <div style={{ color: "var(--ink-3, #555)" }}>
        Public render of Radar's actual output for one user, generated end-to-end by three composed Claude Opus 4.7 Managed Agents. The interactive product lives at{" "}
        <a href="/" style={{ color: "var(--accent, #6366f1)" }}>
          radar.pabloaa.com
        </a>{" "}
        (invite-only beta during the hackathon, request via{" "}
        <a href="mailto:contato@pabloaa.com" style={{ color: "var(--accent, #6366f1)" }}>
          contato@pabloaa.com
        </a>
        ).
      </div>
    </div>
  );
}

function ShowcaseUnavailable() {
  return (
    <div className="wrap">
      <div
        style={{
          margin: "4rem auto",
          maxWidth: 560,
          padding: "2rem",
          textAlign: "center",
          fontFamily: "var(--mono, ui-monospace)",
          color: "var(--ink-3, #6b6b64)",
          border: "1px dashed var(--ink-5, #cbc8be)",
        }}
      >
        <div
          style={{
            fontSize: 14,
            marginBottom: 8,
            color: "var(--ink, #1a1a17)",
            fontWeight: 600,
          }}
        >
          Showcase temporarily unavailable.
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>
          The data layer is having a moment. Try{" "}
          <a href="/" style={{ color: "var(--accent, #d83a2c)" }}>
            radar.pabloaa.com
          </a>{" "}
          or{" "}
          <a
            href="https://github.com/pablo-aa/radar"
            style={{ color: "var(--accent, #d83a2c)" }}
          >
            the source on GitHub
          </a>
          .
        </div>
      </div>
    </div>
  );
}

function ShowcaseDivider({ label }: { label: string }) {
  return (
    <section
      style={{
        margin: "3rem 0 1.5rem",
        paddingBottom: "0.5rem",
        borderBottom: "1px solid var(--ink-5, #e5e5e5)",
      }}
    >
      <h2
        style={{
          fontFamily: "var(--mono, ui-monospace)",
          fontSize: 14,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ink-3, #555)",
          margin: 0,
        }}
      >
        § {label}
      </h2>
    </section>
  );
}

function ShowcaseEmptyNote({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: "1.5rem",
        textAlign: "center",
        fontFamily: "var(--mono, ui-monospace)",
        fontSize: 13,
        color: "var(--ink-3, #555)",
        border: "1px dashed var(--ink-5, #e5e5e5)",
        margin: "1rem 0",
      }}
    >
      No {label} on file yet.
    </div>
  );
}

function ShowcaseFooter() {
  return (
    <footer
      style={{
        marginTop: "4rem",
        paddingTop: "2rem",
        borderTop: "1px solid var(--ink-5, #e5e5e5)",
        display: "flex",
        flexWrap: "wrap",
        gap: "1.5rem",
        justifyContent: "space-between",
        fontFamily: "var(--mono, ui-monospace)",
        fontSize: 12,
        color: "var(--ink-3, #555)",
      }}
    >
      <span>built with claude opus 4.7 · cerebral valley · 2026-04 · agpl-3.0</span>
      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
        <a href="https://github.com/pablo-aa/radar" style={{ color: "inherit" }}>
          github.com/pablo-aa/radar
        </a>
        <a href="https://youtu.be/ueLPzXevysQ" style={{ color: "inherit" }}>
          demo video (3 min)
        </a>
        <a href="/" style={{ color: "inherit" }}>
          radar.pabloaa.com
        </a>
      </div>
    </footer>
  );
}
