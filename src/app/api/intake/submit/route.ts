// POST /api/intake/submit
//
// Persists the intake form fields into the profile and flips
// onboard_state.intake_done = true. Returns 200 with the next route the
// client should navigate to (always /clarify in the new flow).
//
// What this route NO LONGER does (compared to pre-clarify versions):
// dispatch the Anamnesis -> Strategist chain. That now happens after the
// user answers the AI-generated clarification questions and the client POSTs
// /api/intake/clarify-answers. This split exists so the downstream agents
// can ground their output in role / duration / status confirmations the
// user types on /clarify, instead of guessing from CV + GitHub alone.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile, OnboardState, ProfileUpdate } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type IntakeSubmitBody = {
  cv_url?: string;
  moment_text?: string;
  declared_interests?: string[];
  site_url?: string;
};

function parseBody(raw: unknown): IntakeSubmitBody {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;

  const cv_url =
    typeof r.cv_url === "string" && r.cv_url.length > 0 ? r.cv_url : undefined;

  const moment_text =
    typeof r.moment_text === "string" && r.moment_text.length > 0
      ? r.moment_text
      : undefined;

  const declared_interests =
    Array.isArray(r.declared_interests) &&
    r.declared_interests.every((x) => typeof x === "string")
      ? (r.declared_interests as string[])
      : undefined;

  const site_url =
    typeof r.site_url === "string" && r.site_url.length > 0
      ? r.site_url
      : undefined;

  return { cv_url, moment_text, declared_interests, site_url };
}

function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);

  if (body.cv_url && !body.cv_url.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "invalid_cv_url" }, { status: 400 });
  }
  if (body.moment_text && body.moment_text.length > 2000) {
    return NextResponse.json({ error: "moment_text_too_long" }, { status: 400 });
  }
  if (body.declared_interests && body.declared_interests.length > 20) {
    return NextResponse.json(
      { error: "declared_interests_too_many" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileRead.error) {
    console.error("[api/intake/submit] profile read failed", profileRead.error);
    return NextResponse.json({ error: "profile_read_failed" }, { status: 500 });
  }
  if (!profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  const existingStructured: Record<string, unknown> =
    profile.structured_profile &&
    typeof profile.structured_profile === "object" &&
    !Array.isArray(profile.structured_profile)
      ? { ...(profile.structured_profile as Record<string, unknown>) }
      : {};

  const newStructured: Record<string, unknown> = { ...existingStructured };
  if (body.moment_text !== undefined) {
    newStructured.moment_text = body.moment_text;
  }
  if (body.declared_interests !== undefined) {
    newStructured.declared_interests = body.declared_interests;
  }
  if (body.site_url !== undefined) {
    newStructured.site_url = body.site_url;
  }
  // If the intake form is being re-submitted, clear any cached clarify
  // questions so the next /clarify visit regenerates them with the new
  // intake context.
  delete newStructured.clarify_questions;
  delete newStructured.clarify_answers;
  delete newStructured.clarify_skipped;
  delete newStructured.clarify_completed_at;

  const existingOnboard: OnboardState = profile.onboard_state;
  const newOnboardState: OnboardState = {
    ...existingOnboard,
    intake_done: true,
    intake_clarified: false,
  };

  const profileUpdatePayload: ProfileUpdate = {
    structured_profile: toJsonb(newStructured),
    onboard_state: toJsonb(newOnboardState) as OnboardState,
    updated_at: new Date().toISOString(),
  };
  if (body.cv_url !== undefined) profileUpdatePayload.cv_url = body.cv_url;
  if (body.site_url !== undefined) profileUpdatePayload.site_url = body.site_url;

  const profileWrite = await admin
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("user_id", userId);

  if (profileWrite.error) {
    console.error("[api/intake/submit] profile update failed", profileWrite.error);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", next: "/clarify" }, { status: 200 });
}
