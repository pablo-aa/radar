// Authed group layout. Server component.
// Gates: must be signed in + onboarding complete.

import { redirect } from "next/navigation";
import { computeRedirect, getProfile, getServerUser } from "@/lib/onboarding";
import { DEFAULT_ONBOARD_STATE } from "@/lib/supabase/types";

export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerUser();
  if (!user) {
    redirect("/login");
  }
  const profile = await getProfile(user.id);
  const onboard = profile?.onboard_state ?? DEFAULT_ONBOARD_STATE;
  const next = computeRedirect(onboard);
  if (next) {
    redirect(next);
  }
  return <>{children}</>;
}
