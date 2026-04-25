import { redirect } from "next/navigation";
import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import GeneratingProgress from "@/components/GeneratingProgress";
import OnboardProgress from "@/components/OnboardProgress";
import { getServerUser } from "@/lib/onboarding";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";
import { nextDestinationFor } from "@/lib/routing";

export default async function GeneratingPage() {
  const { user } = await getServerUser();
  if (!user) redirect("/login");

  const { destination, profile } = await nextDestinationFor(user.id);
  if (destination !== "/generating") redirect(destination);

  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;
  const handle = profile?.github_handle ?? "";

  return (
    <div className="wrap">
      <Appbar
        route="generating"
        userInitials={(profile?.display_name ?? handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={handle || "you"}
        userName={profile?.display_name ?? handle ?? "you"}
        userCity=""
        intakeSubmitted={onboard.intake_done}
        onboardComplete={onboard.report_seen}
      />
      {!onboard.report_seen && <OnboardProgress step="generating" />}
      <GeneratingProgress />
      <CornerMeta />
    </div>
  );
}
