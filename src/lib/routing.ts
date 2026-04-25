// Centralized destination routing for authenticated users.
// Single source of truth: given a user's state, returns the page they should be on.
// Each authed/onboarding page calls nextDestinationFor once at the top; if current
// path != destination, it redirects.

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AnamnesisRun, Profile, RunStatus, StrategistRun } from "@/lib/supabase/types";

export type Destination =
  | "/welcome"
  | "/intake"
  | "/generating?step=both"
  | "/report"
  | "/radar";

// Latest run status for each agent. `null` means no row exists.
// `error` is treated as a terminal state for routing (user can re-run from
// the dedicated UI; routing keeps them on /generating with an error banner).
export type AgentStatus = RunStatus | null;

export interface RoutingState {
  profile: Profile | null;
  anamnesisStatus: AgentStatus;
  strategistStatus: AgentStatus;
}

/**
 * Compute the next destination for an authenticated user based on the
 * intake state machine + latest agent run statuses for BOTH agents.
 *
 * The intake flow chains Anamnesis -> Strategist sequentially. The user is
 * blocked on /generating until BOTH are done. This avoids any flash of
 * /report or /radar while the second agent is still running.
 *
 * Order of checks (top-to-bottom; first match wins):
 *   1. No profile row              -> /welcome (auth callback should have created it)
 *   2. !welcomed                   -> /welcome
 *   3. !intake_done                -> /intake
 *
 *   intake_done = true. Look at Anamnesis:
 *   4. anamnesis = null            -> /intake (broken state recovery)
 *   5. anamnesis = pending|running -> /generating?step=both
 *   6. anamnesis = error           -> /generating?step=both (error UI)
 *
 *   anamnesis = done. Look at Strategist:
 *   7. strategist = null           -> /generating?step=both (gap or chained dispatch failed)
 *   8. strategist = pending|running-> /generating?step=both
 *   9. strategist = error          -> /generating?step=both (error UI)
 *
 *   Both done:
 *  10. !report_seen                -> /report
 *  11. else                        -> /radar
 */
export function nextDestination(state: RoutingState): Destination {
  const { profile, anamnesisStatus, strategistStatus } = state;

  if (!profile) return "/welcome";

  const onboard = profile.onboard_state;

  if (!onboard.welcomed) return "/welcome";
  if (!onboard.intake_done) return "/intake";

  // Returning-user shortcut: once the user has acknowledged the report at
  // least once, they have completed onboarding. From then on, /radar is
  // their home. We do NOT re-route them to /generating just because an
  // admin re-run of the strategist has flipped its status to running or
  // error. /radar handles those states with its own re-run UI.
  if (onboard.report_seen) return "/radar";

  // First-time onboarding flow below.

  // intake_done = true. The user has submitted; we expect at least one
  // anamnesis run to exist. If none does, the row was wiped (admin reset)
  // or insert failed silently. Send back to /intake so the user re-submits.
  if (anamnesisStatus === null) return "/intake";

  // Anamnesis still in progress (pending or running) OR errored: keep on
  // /generating. The page renders progress for in-progress states and an
  // error banner for the error state.
  if (anamnesisStatus !== "done") return "/generating?step=both";

  // Anamnesis is done. Now look at Strategist.
  // Three "keep waiting" states:
  //   - null: chained dispatch from intake/submit hasn't inserted the row
  //     yet (a sub-second gap) OR the dispatch fetch failed silently. The
  //     intake/submit safety net inserts an error row when the fetch fails,
  //     so a persistent null here usually means the gap. The poller and
  //     /generating page both handle this.
  //   - pending|running: still working.
  //   - error: failed; show error UI on /generating with a re-run option.
  if (strategistStatus !== "done") return "/generating?step=both";

  // Both done, first-time flow: send the user to read the editorial report.
  return "/report";
}

/**
 * Server-side helper. Loads the latest profile + agent run statuses for the
 * user and returns the next destination.
 *
 * Uses Promise.all for the three reads in one round-trip.
 * Uses the admin client to bypass RLS and avoid a redundant auth cookie read.
 *
 * Each run query orders by created_at desc and takes the latest row REGARDLESS
 * of status (no IN filter). This ensures error rows are visible to routing
 * so the user is not silently sent to /radar with broken state.
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
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("strategist_runs")
      .select("id, status")
      .eq("user_id", userId)
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

  const anamnesisStatus: AgentStatus = anamnesisRow?.status ?? null;
  const strategistStatus: AgentStatus = strategistRow?.status ?? null;

  const state: RoutingState = {
    profile,
    anamnesisStatus,
    strategistStatus,
  };

  const destination = nextDestination(state);

  return { destination, profile, state };
}
