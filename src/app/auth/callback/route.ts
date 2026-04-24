// GitHub OAuth callback. Supabase Auth redirects here with ?code=... after
// the user authorizes on github.com. We exchange the code for a session
// cookie, upsert the profiles row (service role, because the RLS-bound
// session cookie might not have propagated yet for brand-new users), and
// route the user to the first onboarding step they still need.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_ONBOARD_STATE, type OnboardState } from "@/lib/supabase/types";
import { computeRedirect } from "@/lib/onboarding";

function redirectTo(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return NextResponse.redirect(url);
}

function loginError(request: NextRequest, reason: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?error=${encodeURIComponent(reason)}`;
  return NextResponse.redirect(url);
}

function waitlistRedirect(
  request: NextRequest,
  params: { reason?: string; handle?: string },
) {
  const url = request.nextUrl.clone();
  url.pathname = "/waitlist";
  const search = new URLSearchParams();
  search.set("status", "not_invited");
  if (params.reason) search.set("reason", params.reason);
  if (params.handle) search.set("handle", params.handle);
  url.search = `?${search.toString()}`;
  return NextResponse.redirect(url);
}

function readStringMeta(
  meta: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!meta) return null;
  const v = meta[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return loginError(request, "missing_code");
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch (err) {
    console.error("[auth/callback] failed to init server client", err);
    return loginError(request, "server_init_failed");
  }

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error || !exchange.data.user) {
    console.error(
      "[auth/callback] exchangeCodeForSession failed",
      exchange.error,
    );
    return loginError(request, "auth_failed");
  }

  const user = exchange.data.user;
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  let admin;
  try {
    admin = createAdminClient();
  } catch (err) {
    console.error("[auth/callback] failed to init admin client", err);
    return loginError(request, "server_init_failed");
  }

  // --- Invite gating -----------------------------------------------------
  // Only github_handles present in the `invites` table are allowed past this
  // point. Anyone else gets signed out and bounced to /waitlist.
  const handle =
    readStringMeta(meta, "user_name") ??
    readStringMeta(meta, "preferred_username");

  if (!handle) {
    await supabase.auth.signOut();
    return waitlistRedirect(request, { reason: "missing_handle" });
  }

  // `invites` is not in the typed Database yet; cast through unknown to a
  // minimal client view so we keep TS strict without using `any`.
  type InviteRow = { github_handle: string; used_at: string | null };
  type MinimalAdmin = {
    from(table: "invites"): {
      select(cols: string): {
        eq(col: string, val: string): {
          maybeSingle(): Promise<{
            data: InviteRow | null;
            error: { message: string } | null;
          }>;
        };
      };
      update(patch: { used_at: string }): {
        eq(col: string, val: string): Promise<{
          error: { message: string } | null;
        }>;
      };
    };
  };
  const inviteDb = admin as unknown as MinimalAdmin;

  const inviteLookup = await inviteDb
    .from("invites")
    .select("github_handle, used_at")
    .eq("github_handle", handle)
    .maybeSingle();

  if (inviteLookup.error) {
    console.error("[auth/callback] invites lookup failed", inviteLookup.error);
    await supabase.auth.signOut();
    return waitlistRedirect(request, { reason: "lookup_failed" });
  }

  if (!inviteLookup.data) {
    await supabase.auth.signOut();
    return waitlistRedirect(request, { handle });
  }

  if (!inviteLookup.data.used_at) {
    const stamp = await inviteDb
      .from("invites")
      .update({ used_at: new Date().toISOString() })
      .eq("github_handle", handle);
    if (stamp.error) {
      console.warn(
        "[auth/callback] failed to stamp invite used_at (non-fatal)",
        stamp.error,
      );
    }
  }
  // --- End invite gating -------------------------------------------------

  const existing = await admin
    .from("profiles")
    .select("user_id, onboard_state")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing.error) {
    console.error("[auth/callback] profiles select failed", existing.error);
    return loginError(request, "profile_read_failed");
  }

  let nextOnboard: OnboardState;

  if (!existing.data) {
    nextOnboard = { ...DEFAULT_ONBOARD_STATE, signed_in: true };
    const insert = await admin.from("profiles").insert({
      user_id: user.id,
      github_handle:
        readStringMeta(meta, "user_name") ??
        readStringMeta(meta, "preferred_username"),
      github_avatar_url: readStringMeta(meta, "avatar_url"),
      display_name:
        readStringMeta(meta, "full_name") ?? readStringMeta(meta, "name"),
      email: user.email ?? null,
      onboard_state: nextOnboard,
    });
    if (insert.error) {
      console.error("[auth/callback] profiles insert failed", insert.error);
      return loginError(request, "profile_insert_failed");
    }
  } else {
    const current = (existing.data.onboard_state ?? DEFAULT_ONBOARD_STATE) as OnboardState;
    nextOnboard = { ...current, signed_in: true };
    const update = await admin
      .from("profiles")
      .update({ onboard_state: nextOnboard })
      .eq("user_id", user.id);
    if (update.error) {
      console.error("[auth/callback] profiles update failed", update.error);
      return loginError(request, "profile_update_failed");
    }
  }

  // Route the user to the next onboarding step they still need.
  // `computeRedirect` returns null once all four flags are set, meaning
  // the user is fully onboarded and belongs on the dashboard.
  const next = computeRedirect(nextOnboard) ?? "/radar";
  return redirectTo(request, next);
}
