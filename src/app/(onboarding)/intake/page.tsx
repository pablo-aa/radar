import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import IntakeForm from "@/components/IntakeForm";
import OnboardProgress from "@/components/OnboardProgress";
import { fetchGitHubProfile } from "@/lib/github";
import { getProfile, getServerUser } from "@/lib/onboarding";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";

export default async function IntakePage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");
  const profile = await getProfile(user.id);
  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;
  const firstRun = !onboard.report_seen;
  const handle = profile?.github_handle ?? "";
  const ghProfile = handle ? await fetchGitHubProfile(handle) : null;

  return (
    <div className="wrap">
      <Appbar
        route="intake"
        userInitials={(profile?.display_name ?? handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={handle || "you"}
        userName={profile?.display_name ?? handle ?? "you"}
        userCity={ghProfile?.location ?? ""}
        intakeSubmitted={onboard.intake_done}
        onboardComplete={onboard.report_seen}
      />
      {firstRun && <OnboardProgress step="intake" />}
      <IntakeForm
        userId={user.id}
        initialHandle={handle}
        ghProfile={ghProfile}
        initialCvPath={profile?.cv_url ?? null}
        initialSiteUrl={profile?.site_url ?? ""}
        runsUsed={onboard.runs_used}
        firstRun={firstRun}
      />
      <CornerMeta />
    </div>
  );
}
