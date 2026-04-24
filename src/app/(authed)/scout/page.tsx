import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import ScoutLiveStream from "@/components/ScoutLiveStream";
import { getProfile, getServerUser } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import {
  SCOUT_EVENTS,
  SCOUT_METRICS,
  SCOUT_QUEUE,
  type ScoutEvent,
} from "@/lib/sample-data/scout-events";
import type {
  ScoutDiscarded,
  ScoutRun,
  Opportunity,
} from "@/lib/supabase/types";

// Build event list. If we have real scout_run + scout_discarded + opps with
// that scout_run_id, merge them into synthetic events. Otherwise fall back to
// the static SCOUT_EVENTS sample.
function buildEvents(
  discarded: ScoutDiscarded[],
  opps: Opportunity[],
): ScoutEvent[] {
  const out: ScoutEvent[] = [];
  for (const o of opps.slice(0, 12)) {
    const host = safeHost(o.source_url);
    out.push({
      t: formatTime(o.found_at ?? o.created_at),
      v: "found",
      host,
      note: `${o.id_display ?? "#" + o.id.slice(0, 6)} · ${o.title} · fit ${o.fit ?? 0}`,
    });
  }
  for (const d of discarded.slice(0, 20)) {
    const verb = mapDiscardReason(d.reason);
    out.push({
      t: formatTime(d.decided_at),
      v: verb,
      host: d.host,
      note: d.detail ?? d.reason,
    });
  }
  out.sort((a, b) => (a.t < b.t ? 1 : -1));
  return out;
}

function mapDiscardReason(r: ScoutDiscarded["reason"]): ScoutEvent["v"] {
  if (r === "duplicate" || r === "unchanged") return "dup";
  if (r === "out-of-scope" || r === "unverifiable") return "skip";
  if (r === "throttled" || r === "error") return "err";
  if (r === "low-fit") return "match";
  return "skip";
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 24);
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default async function ScoutPage() {
  const { user } = await getServerUser();
  const profile = user ? await getProfile(user.id) : null;
  const supabase = await createClient();

  const runRes = await supabase
    .from("scout_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const run = (runRes.data as ScoutRun | null) ?? null;

  let discarded: ScoutDiscarded[] = [];
  let opps: Opportunity[] = [];
  if (run) {
    const [dRes, oRes] = await Promise.all([
      supabase
        .from("scout_discarded")
        .select("*")
        .eq("scout_run_id", run.id)
        .order("decided_at", { ascending: false })
        .limit(40),
      supabase
        .from("opportunities")
        .select("*")
        .eq("scout_run_id", run.id)
        .order("found_at", { ascending: false, nullsFirst: false })
        .limit(20),
    ]);
    discarded = (dRes.data as ScoutDiscarded[] | null) ?? [];
    opps = (oRes.data as Opportunity[] | null) ?? [];
  }

  const realEvents = buildEvents(discarded, opps);
  const allEvents: ScoutEvent[] =
    realEvents.length >= 6 ? realEvents : SCOUT_EVENTS;
  const initialEvents = allEvents.slice(0, 8);

  return (
    <div className="wrap">
      <Appbar
        route="scout"
        userInitials={(profile?.display_name ?? profile?.github_handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={profile?.github_handle ?? "you"}
        userName={profile?.display_name ?? profile?.github_handle ?? "you"}
        userCity=""
        intakeSubmitted={true}
        onboardComplete={true}
      />
      <div className="scout">
        <div className="max">
          <div className="scout-hd">
            <div className="title">
              <h1>
                Scout<span className="cur" aria-hidden="true"></span>
              </h1>
              <span className="state">
                <span className="pulse"></span>crawling ·{" "}
                {run?.cycle_label ?? "cycle 2026-W17"}
              </span>
            </div>
            <div className="tele">
              <div>
                <b>{SCOUT_METRICS.elapsed}</b>elapsed
              </div>
              <div>
                <b>
                  {run
                    ? `${run.sources_count} of ${Math.max(run.sources_count, 18)}`
                    : SCOUT_METRICS.sources}
                </b>
                sources
              </div>
              <div>
                <b>
                  {run ? `${run.pages_fetched} pages` : SCOUT_METRICS.fetched}
                </b>
                fetched
              </div>
              <div>
                <b>
                  {run
                    ? `${run.found_count} new · ${run.updated_count} updated`
                    : SCOUT_METRICS.confirmed}
                </b>
                opportunities
              </div>
            </div>
          </div>

          <ScoutLiveStream
            initialEvents={initialEvents}
            allEvents={allEvents}
            initialQueue={SCOUT_QUEUE}
            metrics={SCOUT_METRICS}
          />

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 24,
              paddingTop: 16,
              borderTop: ".5px solid rgba(232,228,216,.2)",
              fontSize: "11px",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "rgba(232,228,216,.45)",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <span>
              Claude Opus 4.7 · Managed Agents · autonomous · 47 min budget, 2
              min remaining
            </span>
            <span>runs again next Monday 06:00 BRT</span>
          </div>
        </div>
      </div>
      <CornerMeta />
    </div>
  );
}
