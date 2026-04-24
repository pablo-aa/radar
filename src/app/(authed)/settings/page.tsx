import Appbar from "@/components/Appbar";
import CornerMeta from "@/components/CornerMeta";
import SettingsPanel from "@/components/SettingsPanel";
import { getProfile, getServerUser } from "@/lib/onboarding";

export default async function SettingsPage() {
  const { user } = await getServerUser();
  const profile = user ? await getProfile(user.id) : null;

  return (
    <div className="wrap">
      <Appbar
        route="settings"
        userInitials={(profile?.display_name ?? profile?.github_handle ?? "PA").slice(0, 2).toUpperCase()}
        userHandle={profile?.github_handle ?? "you"}
        userName={profile?.display_name ?? profile?.github_handle ?? "you"}
        userCity=""
        intakeSubmitted={true}
        onboardComplete={true}
      />

      <div className="sec-label" style={{ marginTop: 28 }}>
        <span className="n">04</span>
        <span>Settings</span>
        <span className="bar"></span>
      </div>

      <SettingsPanel
        profile={profile}
        fallbackName="Pablo A. Araújo"
        fallbackHandle="pabloaa"
      />

      <CornerMeta />
    </div>
  );
}
