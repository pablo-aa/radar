// Onboarding group layout. Server component.
// Ensures a signed-in user. Individual pages decide whether the user belongs
// on that step (via computeRedirect).

import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/onboarding";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await getServerUser();
  if (!user) {
    redirect("/login");
  }
  // Each page fetches its own onboard state and handles computeRedirect.
  return <>{children}</>;
}
