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
  // Flip report_seen and arm the radar-nav nudge so the user sees a small
  // indicator that /radar is the next step. The nudge is cleared on first
  // /radar visit by markRadarVisited.
  return updateOnboardState(user.id, {
    report_seen: true,
    radar_nudged: true,
  });
}

export async function markRadarVisited(): Promise<OnboardState | null> {
  const { user } = await getServerUser();
  if (!user) return null;
  return updateOnboardState(user.id, { radar_nudged: false });
}
