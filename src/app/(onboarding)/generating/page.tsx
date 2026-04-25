import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/onboarding";
import { nextDestinationFor } from "@/lib/routing";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminProfile } from "@/lib/admin";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import RunPoller from "@/components/RunPoller";
import StrategistDispatcher from "@/components/StrategistDispatcher";
import BothPoller from "@/components/BothPoller";
import type { RunStatus } from "@/lib/supabase/types";

// Two distinct flows render here:
//   - "both" (default): the chained intake flow. Polled via /api/onboarding/status.
//     Legacy step=anamnesis URLs are folded into this so old bookmarks do not break.
//   - "strategist": admin or returning-user re-run of just the Strategist,
//     dispatched from /radar. Polls /api/strategist/status.
type Step = "both" | "strategist";

interface PageProps {
  searchParams: Promise<{ step?: string; run_id?: string }>;
}

export default async function GeneratingPage({ searchParams }: PageProps) {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const stepParam = params.step;
  // step=anamnesis is folded into step=both for back-compat with any in-flight URL.
  const step: Step = stepParam === "strategist" ? "strategist" : "both";
  const runIdParam = params.run_id;

  const { destination, profile } = await nextDestinationFor(user.id);

  // Destination guard:
  //   step=both: this is the canonical onboarding wait. If routing wants the
  //     user elsewhere (eg. both done -> /report), follow it.
  //   step=strategist: explicit re-run from /radar admin button. Routing
  //     normally sends to /radar, so we skip the guard to avoid a loop.
  if (step === "both" && destination !== "/generating?step=both") {
    redirect(destination);
  }

  const isAdmin = isAdminProfile(profile);
  const onboard = profile?.onboard_state;
  const handle = profile?.github_handle ?? "";

  const appbarProps = {
    route: "generating" as const,
    userInitials:
      (profile?.display_name ?? handle ?? "").slice(0, 2).toUpperCase() || "PA",
    userHandle: handle || "you",
    userName: profile?.display_name ?? handle ?? "you",
    userCity: "",
    intakeSubmitted: onboard?.intake_done ?? false,
    onboardComplete: onboard?.report_seen ?? false,
  };

  // step=both: aggregated waiting screen for the chained intake flow.
  // BothPoller fetches /api/onboarding/status itself; no run_id needed.
  if (step === "both") {
    return (
      <div className="wrap">
        <Appbar {...appbarProps} />
        <BothPoller isAdmin={isAdmin} />
        <CornerMeta />
      </div>
    );
  }

  // step=strategist: re-run flow.
  const admin = createAdminClient();

  const query = admin
    .from("strategist_runs")
    .select("id, status, started_at, finished_at")
    .eq("user_id", user.id);

  const { data: row } = runIdParam
    ? await query.eq("id", runIdParam).maybeSingle()
    : await query.order("started_at", { ascending: false }).limit(1).maybeSingle();

  // No run row found yet: dispatch a new strategist run client-side.
  // The dispatcher replaces the URL with run_id once the API responds,
  // then RunPoller takes over.
  if (!row) {
    return (
      <div className="wrap">
        <Appbar {...appbarProps} />
        <StrategistDispatcher />
        <CornerMeta />
      </div>
    );
  }

  // Server-side redirect when the run is already done (no flash of loading screen).
  if (row.status === "done") {
    redirect("/radar");
  }

  return (
    <div className="wrap">
      <Appbar {...appbarProps} />
      <RunPoller
        step="strategist"
        runId={row.id}
        startedAt={row.started_at}
        initialStatus={row.status as RunStatus}
        isAdmin={isAdmin}
      />
      <CornerMeta />
    </div>
  );
}
