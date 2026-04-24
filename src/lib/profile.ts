// Server-only enriched profile reader. Combines the Supabase profiles row with
// a cached GitHub API lookup so callers get one object with both data sources.
// The GitHub fetch is cached upstream (see ./github.ts), so this is cheap.

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/supabase/types";
import { fetchGitHubProfile, type GitHubProfile } from "./github";

export type EnrichedProfile = Profile & {
  github_data: GitHubProfile | null;
};

/**
 * Read the profile row for `userId` and, if a github_handle is set, merge in
 * the cached GitHub profile under `github_data`. Returns null if no profile.
 */
export async function getProfileEnriched(
  userId: string,
): Promise<EnrichedProfile | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[profile.getProfileEnriched] select failed", error);
    return null;
  }

  if (!data) {
    return null;
  }

  const handle = data.github_handle;
  const github_data =
    handle && handle.length > 0 ? await fetchGitHubProfile(handle) : null;

  return { ...data, github_data };
}
