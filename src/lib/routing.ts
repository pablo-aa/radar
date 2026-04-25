// Centralized destination routing for authenticated users.
// Single source of truth: given a user's state, returns the page they should be on.
// Each authed/onboarding page calls nextDestinationFor once at the top; if current
// path != destination, it redirects.

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AnamnesisRun, Profile, StrategistRun } from "@/lib/supabase/types";

export type Destination =
  | "/welcome"
  | "/intake"
  | "/generating"
  | "/report"
  | "/radar";

export interface RoutingState {
  profile: Profile | null;
  hasAnamnesisRunningOrDone: boolean;
  hasAnamnesisDone: boolean;
  hasStrategistRunningOrDone: boolean;
  hasStrategistDone: boolean;
}

/**
 * Compute the next destination for an authenticated user based on the
 * intake state machine plus latest agent run statuses.
 *
 * Order of checks (top-to-bottom; first match wins):
 *   1. No profile row              -> /welcome (guard; auth callback should have created it)
 *   2. !welcomed                   -> /welcome
 *   3. !intake_done                -> /intake
 *   4. anamnesis running, no done  -> /generating
 *   5. anamnesis done, !report_seen -> /report
 *   6. else                        -> /radar
 */
export function nextDestination(state: RoutingState): Destination {
  const { profile, hasAnamnesisRunningOrDone, hasAnamnesisDone } = state;

  if (!profile) return "/welcome";

  const onboard = profile.onboard_state;

  if (!onboard.welcomed) return "/welcome";
  if (!onboard.intake_done) return "/intake";

  // Anamnesis running but not yet done: show generating screen.
  if (hasAnamnesisRunningOrDone && !hasAnamnesisDone) return "/generating";

  // Anamnesis done, user hasn't seen the report yet.
  if (hasAnamnesisDone && !onboard.report_seen) return "/report";

  // Fully onboarded.
  return "/radar";
}

/**
 * Server-side helper. Loads the latest profile + agent run statuses for the
 * user and returns the next destination.
 *
 * Uses a single round-trip via Promise.all for the three reads.
 * Uses the admin client to bypass RLS and avoid a redundant auth cookie read.
 */
export async function nextDestinationFor(userId: string): Promise<{
  destination: Destination;
  profile: Profile | null;
  state: RoutingState;
}> {
  const admin = createAdminClient();

  const [profileRes, anamnesisRes, strategistRes] = await Promise.all([
    admin
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("anamnesis_runs")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["running", "done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("strategist_runs")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["running", "done"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (profileRes.error) {
    console.error("[routing.nextDestinationFor] profile read failed", profileRes.error);
  }
  if (anamnesisRes.error) {
    console.error("[routing.nextDestinationFor] anamnesis read failed", anamnesisRes.error);
  }
  if (strategistRes.error) {
    console.error("[routing.nextDestinationFor] strategist read failed", strategistRes.error);
  }

  const profile = (profileRes.data as Profile | null) ?? null;

  const anamnesisRow = anamnesisRes.data as Pick<AnamnesisRun, "id" | "status"> | null;
  const strategistRow = strategistRes.data as Pick<StrategistRun, "id" | "status"> | null;

  const hasAnamnesisRunningOrDone = anamnesisRow !== null;
  const hasAnamnesisDone = anamnesisRow?.status === "done";
  const hasStrategistRunningOrDone = strategistRow !== null;
  const hasStrategistDone = strategistRow?.status === "done";

  const state: RoutingState = {
    profile,
    hasAnamnesisRunningOrDone,
    hasAnamnesisDone,
    hasStrategistRunningOrDone,
    hasStrategistDone,
  };

  const destination = nextDestination(state);

  return { destination, profile, state };
}
