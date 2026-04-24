"use server";

// Server actions used by client components on the onboarding flow and the appbar.
// Each reads the current user via getServerUser, and writes through
// updateOnboardState when applicable.

import { redirect } from "next/navigation";
import { getServerUser, updateOnboardState } from "@/lib/onboarding";
import type { OnboardState } from "@/lib/supabase/types";

export async function signOut(): Promise<void> {
  const { supabase } = await getServerUser();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function markWelcomeSeen(): Promise<OnboardState | null> {
  const { user } = await getServerUser();
  if (!user) return null;
  return updateOnboardState(user.id, { welcomed: true });
}

export async function markIntakeDone(): Promise<OnboardState | null> {
  const { user } = await getServerUser();
  if (!user) return null;
  return updateOnboardState(user.id, { intake_done: true });
}

export async function markReportSeen(): Promise<OnboardState | null> {
  const { user } = await getServerUser();
  if (!user) return null;
  return updateOnboardState(user.id, { report_seen: true });
}
