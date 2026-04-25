import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/onboarding";
import { nextDestinationFor } from "@/lib/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminProfile } from "@/lib/admin";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import RunPoller from "@/components/RunPoller";
import StrategistDispatcher from "@/components/StrategistDispatcher";
import type { RunStatus } from "@/lib/supabase/types";

type Step = "anamnesis" | "strategist";

interface PageProps {
  searchParams: Promise<{ step?: string; run_id?: string }>;
}

export default async function GeneratingPage({ searchParams }: PageProps) {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const stepParam = params.step;
  const step: Step = stepParam === "strategist" ? "strategist" : "anamnesis";
  const runIdParam = params.run_id;

  const { destination, profile } = await nextDestinationFor(user.id);
  // The destination guard only applies to the anamnesis step. For
  // step=strategist, the user arrives here from /radar's own redirect when
  // the strategist run is fresh/stale/running. nextDestinationFor only
  // tracks anamnesis state, so it would loop us back to /radar otherwise.
  if (step === "anamnesis" && destination !== "/generating") {
    redirect(destination);
  }

  // Fetch the run row using the admin client (bypasses RLS).
  const admin = createAdminClient();
  const table = step === "strategist" ? "strategist_runs" : "anamnesis_runs";

  const query = admin
    .from(table)
    .select("id, status, started_at, finished_at")
    .eq("user_id", user.id);

  const { data: row } = runIdParam
    ? await query.eq("id", runIdParam).maybeSingle()
    : await query.order("started_at", { ascending: false }).limit(1).maybeSingle();

  const isAdmin = isAdminProfile(profile);
  const onboard = profile?.onboard_state;
  const handle = profile?.github_handle ?? "";

  // No run row found yet.
  if (!row) {
    if (step === "strategist") {
      // Dispatch a new strategist run client-side; dispatcher replaces URL with run_id
      // once the API responds, then RunPoller takes over. No redirect-to-/radar because
      // /radar now sends fresh/stale users here — looping back would be infinite.
      return (
        <div className="wrap">
          <Appbar
            route="generating"
            userInitials={(profile?.display_name ?? handle ?? "").slice(0, 2).toUpperCase() || "PA"}
            userHandle={handle || "you"}
            userName={profile?.display_name ?? handle ?? "you"}
            userCity=""
            intakeSubmitted={onboard?.intake_done ?? false}
            onboardComplete={onboard?.report_seen ?? false}
          />
          <StrategistDispatcher />
          <CornerMeta />
        </div>
      );
    }
    // Anamnesis: user shouldn't land on /generating without submitting intake first.
    redirect("/intake");
  }

  // Server-side redirect when the run is already done (no flash of loading screen).
  if (row.status === "done") {
    redirect(step === "anamnesis" ? "/report" : "/radar");
  }

  return (
    <div className="wrap">
      <Appbar
        route="generating"
        userInitials={(profile?.display_name ?? handle ?? "").slice(0, 2).toUpperCase() || "PA"}
        userHandle={handle || "you"}
        userName={profile?.display_name ?? handle ?? "you"}
        userCity=""
        intakeSubmitted={onboard?.intake_done ?? false}
        onboardComplete={onboard?.report_seen ?? false}
      />
      <RunPoller
        step={step}
        runId={row.id}
        startedAt={row.started_at}
        initialStatus={row.status as RunStatus}
        isAdmin={isAdmin}
      />
      <CornerMeta />
    </div>
  );
}
