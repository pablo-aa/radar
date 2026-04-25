// POST /api/intake/submit
//
// Single source of truth for intake submission. Synchronously persists all
// intake fields into the profile + flips onboard_state.intake_done = true,
// then dispatches the Anamnesis agent in the background via after().
// Returns 202 { run_id, status: "running" } immediately.
//
// Why this exists separately from /api/anamnesis/run:
// The anamnesis route is for re-running an already-onboarded user. This
// route is for first-time intake — it does the profile writes the form
// expects and provides one POST for the form to call.

import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runAnamnesis } from "@/lib/agents/anamnesis/run";
import { sendRunError } from "@/lib/email/notify";
import type { AnamnesisInput } from "@/lib/agents/anamnesis/types";
import type { Profile, OnboardState, ProfileUpdate } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

/**
 * Casts a typed value to the Record<string, unknown> shape expected by
 * Supabase JSONB columns.
 */
function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

/**
 * Internal helper: dispatch Strategist via fetch to /api/strategist/run.
 *
 * Why fetch instead of an inline call: combined Anamnesis + Strategist
 * runtime exceeds Vercel maxDuration (300s) on Hobby/Pro. Posting to the
 * route opens a fresh function invocation with its own 300s budget.
 *
 * Why headers instead of session: this runs from inside after(), where the
 * user cookie is no longer accessible. The shared secret + caller-provided
 * user_id replace cookie auth; the route validates both.
 *
 * Safety net: if the fetch errors or returns non-2xx, we INSERT a
 * strategist_runs error row directly so routing detects "strategist
 * failed" instead of looping on "strategist null". This is the bridge
 * that keeps /generating?step=both from getting stuck.
 */
/**
 * Defense-in-depth: only allow the chained dispatch fetch to point at
 * hosts we own. Without this, a misconfigured NEXT_PUBLIC_SITE_URL on
 * Vercel (typo, paste error) would POST the INTERNAL_DISPATCH_SECRET
 * and a user_id to whatever origin the env var names, leaking the
 * secret to a third party.
 *
 * Allowed hosts (case-insensitive):
 *   - radar.pabloaa.com               (production custom domain)
 *   - *.vercel.app over HTTPS         (any Vercel preview/default URL)
 *   - localhost / 127.0.0.1           (any port, dev only)
 *
 * Returns false on parse errors so a malformed URL also fails loud.
 */
function isAllowedDispatchHost(urlString: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "radar.pabloaa.com") return true;
  if (parsed.protocol === "https:" && hostname.endsWith(".vercel.app")) {
    return true;
  }
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  return false;
}

async function dispatchStrategistChained(args: {
  userId: string;
  toEmail: string | null;
  toName: string | null;
  admin: ReturnType<typeof createAdminClient>;
}): Promise<void> {
  const { userId, toEmail, toName, admin } = args;

  // In production, refuse to fall through to localhost: that would post from
  // a Vercel function back to its own dev port and time out, then trigger
  // the safety-net error path despite Anamnesis being healthy. Fail loud.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[api/intake/submit] NEXT_PUBLIC_SITE_URL missing in production; chained dispatch impossible",
      );
      await insertStrategistFailureRowSafe({
        admin,
        userId,
        code: "site_url_missing",
        message: "NEXT_PUBLIC_SITE_URL env var is not set on the server.",
      });
      if (toEmail) await sendRunError({ toEmail, toName, step: "strategist" });
      return;
    }
  }
  const url = `${baseUrl ?? "http://localhost:3001"}/api/strategist/run`;

  // Belt-and-suspenders host allowlist. If NEXT_PUBLIC_SITE_URL is misset
  // (typo, accidental paste of a different project URL, etc), we refuse
  // to fetch rather than leak the dispatch secret to whatever origin the
  // env var names.
  if (!isAllowedDispatchHost(url)) {
    console.error(
      "[api/intake/submit] dispatch URL host not in allowlist; refusing fetch",
      { url },
    );
    await insertStrategistFailureRowSafe({
      admin,
      userId,
      code: "dispatch_host_not_allowed",
      message: `Refusing to dispatch to non-allowlisted host. Check NEXT_PUBLIC_SITE_URL.`,
    });
    if (toEmail) await sendRunError({ toEmail, toName, step: "strategist" });
    return;
  }

  const secret = process.env.INTERNAL_DISPATCH_SECRET;
  if (!secret) {
    console.error(
      "[api/intake/submit] INTERNAL_DISPATCH_SECRET missing; cannot chain Strategist",
    );
    await insertStrategistFailureRowSafe({
      admin,
      userId,
      code: "internal_dispatch_secret_missing",
      message: "INTERNAL_DISPATCH_SECRET env var is not set on the server.",
    });
    if (toEmail) await sendRunError({ toEmail, toName, step: "strategist" });
    return;
  }

  try {
    // Reasonable upper bound: dispatch is fast (route inserts row + returns
    // 202). 30s is generous; the actual round-trip is ~hundreds of ms.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-dispatch": secret,
          "x-internal-user-id": userId,
        },
        body: JSON.stringify({}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[api/intake/submit] strategist dispatch non-2xx", {
        user_id: userId,
        status: res.status,
        body: body.slice(0, 500),
      });
      await insertStrategistFailureRowSafe({
        admin,
        userId,
        code: "dispatch_http_error",
        message: `Strategist dispatch returned ${res.status}.`,
      });
      if (toEmail) await sendRunError({ toEmail, toName, step: "strategist" });
      return;
    }

    console.log("[api/intake/submit] strategist dispatched", {
      user_id: userId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[api/intake/submit] strategist dispatch threw", {
      user_id: userId,
      message,
    });
    await insertStrategistFailureRowSafe({
      admin,
      userId,
      code: "dispatch_fetch_failed",
      message,
    });
    if (toEmail) await sendRunError({ toEmail, toName, step: "strategist" });
  }
}

/**
 * Insert a strategist_runs row with status="error" only if there is no
 * other strategist row for this user from the last 60 seconds.
 *
 * The dedupe window covers the race where the dispatch fetch was actually
 * picked up (the strategist route inserted its running row and started its
 * after()) but our caller observed a timeout/abort/network error first.
 * Without this guard we would insert a stale error row that sorts above
 * the real run by created_at desc, fooling routing into thinking the
 * pipeline failed while the real Strategist quietly completes.
 */
async function insertStrategistFailureRowSafe(args: {
  admin: ReturnType<typeof createAdminClient>;
  userId: string;
  code: string;
  message: string;
}): Promise<void> {
  const { admin, userId, code, message } = args;

  const sixtySecondsAgo = new Date(Date.now() - 60_000).toISOString();
  const recent = await admin
    .from("strategist_runs")
    .select("id, status")
    .eq("user_id", userId)
    .gt("created_at", sixtySecondsAgo)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recent.data) {
    console.warn(
      "[api/intake/submit] skipping failure row insert; recent strategist run exists",
      {
        user_id: userId,
        existing_id: recent.data.id,
        existing_status: recent.data.status,
        intended_code: code,
      },
    );
    return;
  }

  const nowIso = new Date().toISOString();
  const insert = await admin.from("strategist_runs").insert({
    user_id: userId,
    status: "error",
    started_at: nowIso,
    finished_at: nowIso,
    cycle_label: "intake_dispatch_failed",
    profile_snapshot: null,
    opportunity_ids: null,
    output: { _meta: { error: { code, message } } },
    agent_session_id: null,
  });
  if (insert.error) {
    console.error(
      "[api/intake/submit] failed to insert strategist failure row",
      insert.error,
    );
  }
}

/** Narrow an unknown error to a safe redacted shape for DB storage. */
function redactError(
  err: unknown,
  runId: string,
): { code: string; message: string; run_id: string } {
  const base =
    err instanceof Error
      ? {
          code:
            (err as Error & { error?: { type?: string } }).error?.type ??
            err.name ??
            "unknown_error",
          message: err.message,
        }
      : { code: "unknown_error", message: "An unexpected error occurred." };
  return { ...base, run_id: runId };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Auth guard.
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  // 2. Parse body.
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = null;
  }
  const body = parseBody(raw);

  // 3. Validate cv_url ownership.
  if (body.cv_url && !body.cv_url.startsWith(`${userId}/`)) {
    return NextResponse.json({ error: "invalid_cv_url" }, { status: 400 });
  }

  // 4. Validate moment_text length.
  if (body.moment_text && body.moment_text.length > 2000) {
    return NextResponse.json({ error: "moment_text_too_long" }, { status: 400 });
  }

  // 5. Validate declared_interests.
  if (body.declared_interests && body.declared_interests.length > 20) {
    return NextResponse.json(
      { error: "declared_interests_too_many" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // 6a. Read existing profile (must exist).
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

  // 6b. Build new structured_profile merging existing with intake fields.
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

  // 6c. Build new onboard_state merging existing with intake_done = true.
  const existingOnboard: OnboardState = profile.onboard_state;
  const newOnboardState: OnboardState = {
    ...existingOnboard,
    intake_done: true,
  };

  // 6d. UPDATE profiles with all intake fields atomically.
  const profileUpdatePayload: ProfileUpdate = {
    structured_profile: toJsonb(newStructured),
    onboard_state: toJsonb(newOnboardState) as OnboardState,
    updated_at: new Date().toISOString(),
  };
  if (body.cv_url !== undefined) {
    profileUpdatePayload.cv_url = body.cv_url;
  }
  if (body.site_url !== undefined) {
    profileUpdatePayload.site_url = body.site_url;
  }

  const profileWrite = await admin
    .from("profiles")
    .update(profileUpdatePayload)
    .eq("user_id", userId);

  if (profileWrite.error) {
    console.error("[api/intake/submit] profile update failed", profileWrite.error);
    return NextResponse.json({ error: "profile_update_failed" }, { status: 500 });
  }

  // Update the local profile reference so the anamnesis input below is consistent.
  if (body.cv_url !== undefined) profile.cv_url = body.cv_url;
  if (body.site_url !== undefined) profile.site_url = body.site_url;
  profile.structured_profile = newStructured;
  profile.onboard_state = newOnboardState;

  // 7. Idempotency: if a running row exists within 5-min window, return it.
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: existingRun } = await admin
    .from("anamnesis_runs")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "running")
    .gt("started_at", fiveMinutesAgo)
    .maybeSingle();

  if (existingRun) {
    return NextResponse.json(
      { run_id: existingRun.id, status: "running" },
      { status: 202 },
    );
  }

  const nowIso = new Date().toISOString();

  // 8. INSERT new anamnesis_runs row.
  const runInsert = await admin
    .from("anamnesis_runs")
    .insert({
      user_id: userId,
      status: "running",
      started_at: nowIso,
      finished_at: null,
      agent_session_id: null,
      output: null,
    })
    .select("id")
    .single();

  if (runInsert.error || !runInsert.data) {
    console.error("[api/intake/submit] run insert failed", runInsert.error);
    return NextResponse.json({ error: "run_insert_failed" }, { status: 500 });
  }

  const runId: string = runInsert.data.id;

  // Build AnamnesisInput from the just-updated profile.
  const anamnesisInput: AnamnesisInput = {
    handle: profile.github_handle ?? profile.email ?? userId,
    display_name: profile.display_name,
    email: profile.email,
    intake: Object.keys(newStructured).length > 0 ? newStructured : null,
    cv_url:
      typeof profile.cv_url === "string" && profile.cv_url.length > 0
        ? profile.cv_url
        : null,
  };

  // Capture email info for the after() closure before the response is sent.
  const toEmail = profile.email;
  const toName = profile.display_name ?? null;

  // 9. Dispatch the chained agent flow in background via after().
  //
  // Sequence inside the callback:
  //   1. runAnamnesis -> stamp anamnesis_runs done + profile.structured_profile
  //   2. SUPPRESS the per-agent Anamnesis email (single combined email is sent
  //      by /api/strategist/run when the second agent finishes).
  //   3. fetch /api/strategist/run with internal-dispatch headers to start
  //      the Strategist on a FRESH 300s function budget (we cannot run both
  //      agents inline; combined runtime exceeds Vercel maxDuration).
  //   4. Safety net: if the fetch fails (network/5xx/secret missing), INSERT
  //      a strategist_runs error row directly so routing detects "strategist
  //      done failing" instead of looping on "strategist null". Send the
  //      Strategist error email so the user knows.
  after(async () => {
    try {
      const output = await runAnamnesis(anamnesisInput);

      // UPDATE row to done. notified_at is intentionally NOT set on this
      // path: in the chained intake flow, no Anamnesis email is sent (the
      // single combined email is sent by /api/strategist/run when the
      // chain completes). notified_at on this row stays null forever for
      // intake-flow runs; that is the correct signal.
      await admin
        .from("anamnesis_runs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          output: toJsonb(output),
        })
        .eq("id", runId);

      // UPDATE profiles.structured_profile + anamnesis_run_id BEFORE
      // dispatching Strategist, so Strategist reads the rich profile.
      if (output.profile) {
        await admin
          .from("profiles")
          .update({
            structured_profile: toJsonb(output.profile),
            anamnesis_run_id: runId,
          })
          .eq("user_id", userId);
      }

      console.log("[api/intake/submit] anamnesis done", {
        user_id: userId,
        run_id: runId,
        input_tokens: output._meta.usage.input_tokens,
        output_tokens: output._meta.usage.output_tokens,
        cost_usd: output._meta.cost_usd,
        tool_calls: output._meta.tool_calls,
      });

      // 10. Chain Strategist via internal HTTP dispatch (fresh function = fresh
      //     300s budget). The internal headers replace cookie auth.
      await dispatchStrategistChained({
        userId,
        toEmail,
        toName,
        admin,
      });
    } catch (err: unknown) {
      const errorBody = redactError(err, runId);
      console.error("[api/intake/submit] anamnesis failed", errorBody);

      await admin
        .from("anamnesis_runs")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          output: toJsonb({ _meta: { error: errorBody } }),
        })
        .eq("id", runId);

      // Anamnesis errored: send the per-agent Anamnesis error email (the
      // chained Strategist never ran).
      if (toEmail) {
        await sendRunError({ toEmail, toName, step: "anamnesis" });
        await admin
          .from("anamnesis_runs")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", runId);
      }
    }
  });

  // 10. Return 202 immediately.
  return NextResponse.json({ run_id: runId, status: "running" }, { status: 202 });
}
