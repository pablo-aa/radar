import Link from "next/link";
import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import MarkReportSeen from "@/components/MarkReportSeen";
import OnboardProgress from "@/components/OnboardProgress";
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
import { getProfile, getServerUser } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import type { AnamnesisReport } from "@/lib/sample-data/anamnesis-report";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";

async function fetchReport(userId: string): Promise<AnamnesisReport | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("anamnesis_runs")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "done")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.output && typeof data.output === "object") {
      const out = data.output as Record<string, unknown>;
      // New shape: output.report holds the editorial report.
      if (
        typeof out["report"] === "object" &&
        out["report"] !== null &&
        !Array.isArray(out["report"])
      ) {
        const rep = out["report"] as Record<string, unknown>;
        if (
          "meta" in rep &&
          "headline" in rep &&
          "timeline" in rep &&
          "archetype" in rep
        ) {
          return rep as unknown as AnamnesisReport;
        }
      }
      // Legacy shape: report fields at the top level.
      if (
        "meta" in out &&
        "headline" in out &&
        "timeline" in out &&
        "archetype" in out
      ) {
        return out as unknown as AnamnesisReport;
      }
    }
  } catch (err) {
    console.error("[report] fetch failed", err);
  }
  return null;
}

export default async function ReportPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;
  const firstView = !onboard.report_seen;
  const handle = profile?.github_handle ?? "";

  const D = await fetchReport(user.id);

  if (!D) {
    return (
      <div className="wrap">
        <Appbar
          route="report"
          userInitials={(profile?.display_name ?? handle ?? "PA").slice(0, 2).toUpperCase()}
          userHandle={handle || "you"}
          userName={profile?.display_name ?? handle ?? "you"}
          userCity=""
          intakeSubmitted={onboard.intake_done}
          onboardComplete={onboard.report_seen}
        />
        {firstView && <OnboardProgress step="report" />}
        <div className="report-empty">
          <div className="report-empty-kicker">§ 04 · Report</div>
          <h1 className="report-empty-h">Your report is being drafted.</h1>
          <p className="report-empty-body">
            Anamnesis is still composing your self-portrait. This usually takes
            under a minute. If you ended up here by accident, head back to
            intake.
          </p>
          <div className="report-empty-actions">
            <Link className="btn ghost" href="/intake">
              Back to intake
            </Link>
          </div>
        </div>
        <CornerMeta />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Appbar
        route="report"
        userInitials={(profile?.display_name ?? handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={handle || "you"}
        userName={profile?.display_name ?? handle ?? "you"}
        userCity=""
        intakeSubmitted={onboard.intake_done}
        onboardComplete={onboard.report_seen}
      />
      {firstView && <OnboardProgress step="report" />}
      <AnamnesisMasthead meta={D.meta} />
      <AnamnesisHeadline h={D.headline} tl={D.timeline} />
      <AnamnesisArchetype a={D.archetype} />
      <AnamnesisTerritory t={D.territory} />
      <AnamnesisStrengths ss={D.strengths} />
      <AnamnesisPeers p={D.peers} />
      <AnamnesisAdvantages items={D.advantages} />
      <AnamnesisVectors vs={D.vectors} />
      <AnamnesisRisks r={D.risks} />
      <AnamnesisYearShape y={D.yearShape} />
      <AnamnesisReadings rs={D.readings} />
      <AnamnesisColophon meta={D.meta} />
      <MarkReportSeen />
      <CornerMeta />
    </div>
  );
}
