// GET /api/intake/clarify-questions
//
// Generates (or returns the cached) AI clarification questions for the
// current user. Cached in profiles.structured_profile.clarify_questions to
// avoid regenerating on every page load. Re-generated only if absent or if
// ?regenerate=1 is passed.

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGitHubProfile } from "@/lib/github";
import { generateClarifyQuestions } from "@/lib/agents/intake-clarify/run";
import type { ClarifyQuestionSet } from "@/lib/agents/intake-clarify/types";
import type { Profile } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

function readCached(profile: Profile): ClarifyQuestionSet | null {
  const sp = asRecord(profile.structured_profile);
  const cached = sp.clarify_questions;
  if (
    cached &&
    typeof cached === "object" &&
    !Array.isArray(cached) &&
    Array.isArray((cached as Record<string, unknown>).questions)
  ) {
    return cached as unknown as ClarifyQuestionSet;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;
  const url = new URL(request.url);
  const regenerate = url.searchParams.get("regenerate") === "1";

  const admin = createAdminClient();
  const profileRead = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileRead.error || !profileRead.data) {
    return NextResponse.json({ error: "profile_not_found" }, { status: 404 });
  }
  const profile = profileRead.data as Profile;

  if (!regenerate) {
    const cached = readCached(profile);
    if (cached) {
      return NextResponse.json({ questions: cached.questions, cached: true });
    }
  }

  const sp = asRecord(profile.structured_profile);
  const moment_text =
    typeof sp.moment_text === "string" ? sp.moment_text : undefined;
  const declared_interests = Array.isArray(sp.declared_interests)
    ? (sp.declared_interests.filter((x) => typeof x === "string") as string[])
    : undefined;
  const site_url = typeof sp.site_url === "string" ? sp.site_url : undefined;
  const cv_attached = typeof profile.cv_url === "string" && profile.cv_url.length > 0;

  const handle = profile.github_handle ?? profile.email ?? userId;
  const gh = profile.github_handle
    ? await fetchGitHubProfile(profile.github_handle)
    : null;

  let questionSet: ClarifyQuestionSet;
  try {
    questionSet = await generateClarifyQuestions({
      handle,
      display_name: profile.display_name,
      city: profile.city,
      github: gh
        ? {
            bio: gh.bio,
            company: gh.company,
            location: gh.location,
            public_repos: gh.public_repos,
            followers: gh.followers,
            created_at: gh.created_at,
          }
        : null,
      intake: {
        moment_text,
        declared_interests,
        site_url,
        cv_attached,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/intake/clarify-questions] generation failed", message);
    return NextResponse.json(
      { error: "generation_failed", message },
      { status: 500 },
    );
  }

  // Persist into structured_profile so reloads do not regenerate.
  const updatedSp = { ...sp, clarify_questions: questionSet };
  const write = await admin
    .from("profiles")
    .update({ structured_profile: updatedSp as Record<string, unknown> })
    .eq("user_id", userId);
  if (write.error) {
    console.warn(
      "[api/intake/clarify-questions] failed to cache questions",
      write.error,
    );
  }

  return NextResponse.json({ questions: questionSet.questions, cached: false });
}
