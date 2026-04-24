// Onboarding helpers used by Phase 2D screens (welcome, intake, report, dashboard).
// Server-only: these read the Next 16 async cookies API through the server client.
// computeRedirect is pure, so it can also be imported from Client Components that
// receive an OnboardState via props.

import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ONBOARD_STATE,
  type OnboardState,
  type Profile,
} from "@/lib/supabase/types";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type ServerUser = {
  user: User | null;
  supabase: ServerClient;
};

export async function getServerUser(): Promise<ServerUser> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // getUser returning an error just means "no session"; surface as null.
    return { user: null, supabase };
  }
  return { user: data.user, supabase };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[onboarding.getProfile] select failed", error);
    return null;
  }
  return data ?? null;
}

export async function updateOnboardState(
  userId: string,
  patch: Partial<OnboardState>,
): Promise<OnboardState | null> {
  const supabase = await createClient();

  const read = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (read.error) {
    console.error("[onboarding.updateOnboardState] read failed", read.error);
    return null;
  }

  const current = (read.data?.onboard_state ?? DEFAULT_ONBOARD_STATE) as OnboardState;
  const next: OnboardState = { ...current, ...patch };

  const write = await supabase
    .from("profiles")
    .update({ onboard_state: next })
    .eq("user_id", userId);

  if (write.error) {
    console.error("[onboarding.updateOnboardState] write failed", write.error);
    return null;
  }

  return next;
}

// Pure. Given the current onboard state, returns the path the user should be
// at. Returns null if they are already past onboarding and no redirect is
// required. Callers decide what to do with it (redirect, render, etc.).
export function computeRedirect(onboard: OnboardState): string | null {
  if (!onboard.welcomed) return "/welcome";
  if (!onboard.intake_done) return "/intake";
  if (!onboard.report_seen) return "/report";
  return null;
}
