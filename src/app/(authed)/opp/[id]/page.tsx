import Link from "next/link";
import { notFound } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import { getProfile, getServerUser } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import {
  buildPicksMap,
} from "@/lib/agents/strategist/output-reader";
import type { Opportunity, StrategistRun } from "@/lib/supabase/types";

type DeepData = {
  why?: string;
  partners?: string[];
  winnerPattern?: string;
  redFlags?: string[];
  fitBreakdown?: { k: string; v: string }[];
};

function extractDeep(o: Opportunity): DeepData {
  const dd = o.deep_data;
  if (dd && typeof dd === "object") return dd as DeepData;
  return {};
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await getServerUser();
  const profile = user ? await getProfile(user.id) : null;
  const supabase = await createClient();

  const [oppRes, stratRes] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).maybeSingle(),
    user
      ? supabase
          .from("strategist_runs")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "done")
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const o = oppRes.data as Opportunity | null;
  if (!o) notFound();

  const stratRun = (stratRes.data as StrategistRun | null) ?? null;
  const picksMap = buildPicksMap(stratRun);
  const pick = picksMap.get(o.id);

  const deep = extractDeep(o);
  const fitDisplay = pick ? pick.fit_score : (o.fit ?? 0);
  const whyDisplay = pick ? pick.why_you : deep.why;

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
      <div className="detail">
        <Link href="/radar" className="back">
          ← back to radar
        </Link>

        <div className="detail-hd">
          <div>
            <div className="crown">
              <span className="chip on">
                <span className="tick"></span>
                {o.badge ?? "bolsas · inscrições abertas"}
              </span>
              {pick && (
                <span
                  style={{
                    fontSize: "11px",
                    fontFamily: "var(--mono)",
                    color: "var(--accent, #6366f1)",
                    fontWeight: 600,
                    letterSpacing: ".04em",
                    textTransform: "uppercase",
                  }}
                >
                  Strategist pick
                </span>
              )}
              <span>{o.id_display ?? `#${o.id.slice(0, 6)}`}</span>
              <span>
                found by Scout ·{" "}
                {o.found_at ? new Date(o.found_at).toLocaleString() : "recent"}
              </span>
            </div>
            <h1>{o.title}</h1>
            <h2>
              {o.org} · {o.loc}
            </h2>

            <div className="keyfacts">
              <div className="cell">
                <div className="k">Deadline</div>
                <div className="v">{o.deadline ?? "—"}</div>
              </div>
              <div className="cell">
                <div className="k">Funding</div>
                <div className="v">{o.funding_brl ?? "—"}</div>
              </div>
              <div className="cell">
                <div className="k">Commitment</div>
                <div className="v">{o.commitment ?? "—"}</div>
              </div>
            </div>
          </div>

          <aside>
            <p className="score">Fit score · Strategist</p>
            <div className="big">
              {fitDisplay}
              <span className="of"> /100</span>
            </div>
            <div className="bar">
              <i style={{ width: fitDisplay + "%" }}></i>
            </div>
            {deep.fitBreakdown && (
              <div className="breakdown">
                {deep.fitBreakdown.map((b, i) => (
                  <div key={i}>
                    <span className="k">{b.k}</span>
                    <span className="v">{b.v}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="actions">
              <button type="button" className="btn sm">
                Add to plan
              </button>
              <button type="button" className="btn sm ghost">
                Snooze 7d
              </button>
            </div>
          </aside>
        </div>

        <div className="detail-body">
          <div>
            {whyDisplay && (
              <div className="why-block">
                <h3>Why you · Strategist</h3>
                <p>{whyDisplay}</p>
              </div>
            )}

            {deep.partners && deep.partners.length > 0 && (
              <>
                <h3>Partner institutions</h3>
                <p
                  style={{ fontFamily: "var(--mono)", fontSize: "13px" }}
                >
                  {deep.partners.join(" · ")}
                </p>
              </>
            )}

            {deep.winnerPattern && (
              <>
                <h3>Historical winner pattern</h3>
                <p>{deep.winnerPattern}</p>
              </>
            )}

            {deep.redFlags && deep.redFlags.length > 0 && (
              <>
                <h3>Red flags</h3>
                {deep.redFlags.map((r, i) => (
                  <p key={i} className="red">
                    · {r}
                  </p>
                ))}
              </>
            )}
          </div>

          <div>
            <h3>Deep data</h3>
            <div className="deep">
              <div className="row">
                <span className="k">status</span>
                <span>{o.status ?? "—"}</span>
              </div>
              <div className="row">
                <span className="k">category</span>
                <span>{o.category.replace(/_/g, " ")}</span>
              </div>
              <div className="row">
                <span className="k">indexed by</span>
                <span>Scout · weekly crawl</span>
              </div>
              <div className="row">
                <span className="k">last verified</span>
                <span>
                  {o.found_at
                    ? new Date(o.found_at).toLocaleString()
                    : "—"}
                </span>
              </div>
              <div className="row">
                <span className="k">confidence</span>
                <span>0.94 · direct-source, structured data</span>
              </div>
              <div className="row">
                <span className="k">language</span>
                <span>
                  {o.loc === "BR" ? "pt-br · primary" : "en-us · primary"}
                </span>
              </div>
            </div>

            <h3>Source</h3>
            <div className="src">
              <a href={o.source_url} target="_blank" rel="noopener noreferrer">
                {o.source_url}
              </a>
            </div>
          </div>
        </div>
      </div>
      <CornerMeta />
    </div>
  );
}
