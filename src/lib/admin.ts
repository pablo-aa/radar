import "server-only";
import type { Profile } from "@/lib/supabase/types";

export function isAdminHandle(handle: string | null | undefined): boolean {
  if (!handle) return false;
  const raw = process.env.ADMIN_GITHUB_HANDLES ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(handle.trim().toLowerCase());
}

export function isAdminProfile(
  profile: Pick<Profile, "github_handle"> | null,
): boolean {
  return !!profile && isAdminHandle(profile.github_handle);
}
