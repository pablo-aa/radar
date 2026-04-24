// POST /api/strategist/run
//
// MVP stub: returns mock output until the Strategist Managed Agent is
// wired up. Snapshots the caller's profile and the top 12 opportunities
// (by fit) into strategist_runs.profile_snapshot and opportunity_ids,
// then persists a mock output block matching the contract the real agent
// will emit.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeCycleLabel } from "@/lib/cycle";
import type { Opportunity, Profile } from "@/lib/supabase/types";

type StrategistBody = {
  cycle_label?: string;
};

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function parseBody(raw: unknown): StrategistBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  return { cycle_label: optionalString(r.cycle_label) };
}

function pickByCategory(
  opportunities: Opportunity[],
  category: Opportunity["category"],
  limit: number,
): Opportunity[] {
  return opportunities
    .filter((o) => o.category === category)
    .slice(0, limit);
}

function buildMockOutput(
  profile: Profile,
  opps: Opportunity[],
): Record<string, unknown> {
  const handle = profile.github_handle ?? "founder";

  const dated = pickByCategory(opps, "dated_one_shot", 3).map((o) => ({
    opportunity_id: o.id,
    title: o.title,
    source_url: o.source_url,
    deadline: o.deadline,
    funding_brl: o.funding_brl,
    fit_score: o.fit,
    prep_required:
      "Tighten the monograph framing into a two-paragraph lede. Pre-write the red-team response to the 'why this, why now' question. Lead with the exit, not the audience size.",
    why_you: `Your public trajectory, ${handle} on GitHub, the Cosseno exit in 2024, and the T5 monograph, is legible to this panel in one paragraph. The exit resolves 'can this person ship'. The monograph supplies the research voice. The two together land at the exact bend this program is trying to fund.`,
  }));

  const recurrent = pickByCategory(opps, "recurrent_annual", 3).map((o) => ({
    opportunity_id: o.id,
    title: o.title,
    source_url: o.source_url,
    next_window: o.deadline,
    fit_score: o.fit,
    cadence_note:
      "Annual window. Start the file now, revise monthly, submit in the first week of the open period.",
    why_you: `The panel rewards track record over pedigree. Your OSS footprint under ${handle} and the published monograph replace the usual academic signal. Prepare early, the advantage compounds with each revision.`,
  }));

  const rolling = pickByCategory(opps, "rolling", 2).map((o) => ({
    opportunity_id: o.id,
    title: o.title,
    source_url: o.source_url,
    fit_score: o.fit,
    when_to_engage:
      "Apply inside the next 30 days. Rolling review compresses in Q2, decisions come back in 6 to 10 weeks.",
    why_you: `Rolling reviewers respond to sharp scope. Anchor the pitch on one research agenda, cite the monograph as the artifact of prior work, and keep the budget under the threshold that lets them approve without escalation.`,
  }));

  const arenas = pickByCategory(opps, "arena", 3).map((o) => ({
    opportunity_id: o.id,
    title: o.title,
    source_url: o.source_url,
    fit_score: o.fit,
    entry_point:
      "Low-friction first submission. Use your existing monograph methodology, retarget to this venue's evaluation frame.",
    suggested_cadence: "One high-effort submission per quarter.",
    why_you: `Arenas reward legibility, not applications. Your Instagram of 60k and the published monograph already give you the shape this venue rewards. The cost of a first attempt is two weekends, the upside is a persistent leaderboard entry under ${handle}.`,
  }));

  // Build the 90-day plan, sequenced across the first three months. Tie each
  // action to a concrete opportunity via `unlocks`, using real IDs we just
  // snapshotted.
  const firstDated = dated[0]?.opportunity_id ?? opps[0]?.id ?? null;
  const firstRolling = rolling[0]?.opportunity_id ?? firstDated;
  const firstArena = arenas[0]?.opportunity_id ?? firstDated;
  const firstRecurrent = recurrent[0]?.opportunity_id ?? firstDated;
  const secondDated = dated[1]?.opportunity_id ?? firstDated;

  const ninetyDayPlan = [
    {
      week_range: "W01-W02",
      action:
        "Draft the dated-one-shot application. Compress the monograph and exit into a single-page lede, run one round of red-team review.",
      unlocks: firstDated,
    },
    {
      week_range: "W03-W04",
      action:
        "Submit the first arena entry. Repackage the monograph's evaluation methodology for this venue's rubric, ship inside 10 working days.",
      unlocks: firstArena,
    },
    {
      week_range: "W05-W07",
      action:
        "File the rolling RFP. Lock the scope at one agenda, keep budget under the approval threshold, submit with two reference letters already in hand.",
      unlocks: firstRolling,
    },
    {
      week_range: "W08-W10",
      action:
        "Open the file for the annual panel. Outline, sample chapter, budget draft. No submission yet, the goal is a mature proposal by the public window.",
      unlocks: firstRecurrent,
    },
    {
      week_range: "W11-W13",
      action:
        "Submit the second dated-one-shot application. Tighten the pitch on the basis of feedback from the first submission; reuse 70% of the narrative.",
      unlocks: secondDated,
    },
  ].filter((entry) => entry.unlocks !== null);

  return {
    run_summary: `Post-exit founder, T5 monograph, ICPC bronze. Strongest signals point to research-track grants and arena entries this week. ${handle} has the legibility to convert on 2 of 3 dated applications inside 90 days.`,
    dated_one_shot: dated,
    recurrent_annual: recurrent,
    rolling,
    arenas,
    ninety_day_plan: ninetyDayPlan,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = auth.data.user;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);
  const cycleLabel = body.cycle_label ?? computeCycleLabel();

  const admin = createAdminClient();

  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileRead.error) {
    console.error("[api/strategist/run] profile read failed", profileRead.error);
    return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  const oppsRead = await admin
    .from("opportunities")
    .select("*")
    .order("fit", { ascending: false, nullsFirst: false })
    .limit(12);

  if (oppsRead.error) {
    console.error("[api/strategist/run] opportunities read failed", oppsRead.error);
    return NextResponse.json({ error: "opportunities_read_failed" }, { status: 500 });
  }
  const opportunities = (oppsRead.data ?? []) as Opportunity[];
  const opportunityIds = opportunities.map((o) => o.id);

  const profileSnapshot: Record<string, unknown> = {
    user_id: profile.user_id,
    github_handle: profile.github_handle,
    display_name: profile.display_name,
    email: profile.email,
    cv_url: profile.cv_url,
    site_url: profile.site_url,
    structured_profile: profile.structured_profile,
    anamnesis_run_id: profile.anamnesis_run_id,
    snapshot_at: new Date().toISOString(),
  };

  const output = buildMockOutput(profile, opportunities);

  const nowIso = new Date().toISOString();
  const runInsert = await admin
    .from("strategist_runs")
    .insert({
      user_id: user.id,
      cycle_label: cycleLabel,
      started_at: nowIso,
      finished_at: nowIso,
      status: "done",
      profile_snapshot: profileSnapshot,
      opportunity_ids: opportunityIds,
      output,
      agent_session_id: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/strategist/run] insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  // Card count is the sum of the four category arrays in the output payload.
  const dated = Array.isArray(output.dated_one_shot) ? output.dated_one_shot.length : 0;
  const recurrent = Array.isArray(output.recurrent_annual) ? output.recurrent_annual.length : 0;
  const rolling = Array.isArray(output.rolling) ? output.rolling.length : 0;
  const arenas = Array.isArray(output.arenas) ? output.arenas.length : 0;
  const cardsCount = dated + recurrent + rolling + arenas;

  return NextResponse.json({
    run_id: runInsert.data.id,
    cycle_label: cycleLabel,
    cards_count: cardsCount,
  });
}
