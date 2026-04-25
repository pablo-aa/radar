// Shared helper that runs Anamnesis to completion and then dispatches the
// Strategist via internal HTTP. Extracted from /api/intake/submit so the new
// /api/intake/clarify-answers route can reuse the exact same flow without
// duplicating the secret/host/safety-net plumbing.
//
// Why fetch chaining instead of an inline call: combined Anamnesis + Strategist
// runtime exceeds Vercel maxDuration (300s) on Hobby/Pro. Posting to the
// route opens a fresh function invocation with its own 300s budget.

import "server-only";

import { runAnamnesis } from "./run";
import { sendRunError } from "@/lib/email/notify";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnamnesisInput } from "./types";

type Admin = ReturnType<typeof createAdminClient>;

function toJsonb<T>(v: T): Record<string, unknown> {
  return v as unknown as Record<string, unknown>;
}

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

async function insertStrategistFailureRowSafe(args: {
  admin: Admin;
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
      "[anamnesis/chain] skipping failure row insert; recent strategist run exists",
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
      "[anamnesis/chain] failed to insert strategist failure row",
      insert.error,
    );
  }
}

async function dispatchStrategistChained(args: {
  userId: string;
  toEmail: string | null;
  toName: string | null;
  admin: Admin;
}): Promise<void> {
  const { userId, toEmail, toName, admin } = args;

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!baseUrl) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[anamnesis/chain] NEXT_PUBLIC_SITE_URL missing in production; chained dispatch impossible",
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

  if (!isAllowedDispatchHost(url)) {
    console.error(
      "[anamnesis/chain] dispatch URL host not in allowlist; refusing fetch",
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
      "[anamnesis/chain] INTERNAL_DISPATCH_SECRET missing; cannot chain Strategist",
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
      console.error("[anamnesis/chain] strategist dispatch non-2xx", {
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

    console.log("[anamnesis/chain] strategist dispatched", { user_id: userId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[anamnesis/chain] strategist dispatch threw", {
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

/**
 * Run Anamnesis to completion (writing to anamnesis_runs + profiles), then
 * dispatch the Strategist via internal HTTP. Designed to be called inside an
 * after() callback so the HTTP response can return 202 immediately.
 *
 * Failure modes:
 * - Anamnesis throws: row stamped error, per-agent error email sent.
 * - Strategist dispatch fails: failure row inserted, per-agent error email sent.
 */
export async function chainAnamnesisToStrategist(args: {
  userId: string;
  runId: string;
  anamnesisInput: AnamnesisInput;
  toEmail: string | null;
  toName: string | null;
}): Promise<void> {
  const { userId, runId, anamnesisInput, toEmail, toName } = args;
  const admin = createAdminClient();

  try {
    const output = await runAnamnesis(anamnesisInput);

    await admin
      .from("anamnesis_runs")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
        output: toJsonb(output),
      })
      .eq("id", runId);

    if (output.profile) {
      await admin
        .from("profiles")
        .update({
          structured_profile: toJsonb(output.profile),
          anamnesis_run_id: runId,
        })
        .eq("user_id", userId);
    }

    console.log("[anamnesis/chain] anamnesis done", {
      user_id: userId,
      run_id: runId,
      input_tokens: output._meta.usage.input_tokens,
      output_tokens: output._meta.usage.output_tokens,
      cost_usd: output._meta.cost_usd,
      tool_calls: output._meta.tool_calls,
    });

    await dispatchStrategistChained({ userId, toEmail, toName, admin });
  } catch (err: unknown) {
    const errorBody = redactError(err, runId);
    console.error("[anamnesis/chain] anamnesis failed", errorBody);

    await admin
      .from("anamnesis_runs")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        output: toJsonb({ _meta: { error: errorBody } }),
      })
      .eq("id", runId);

    if (toEmail) {
      await sendRunError({ toEmail, toName, step: "anamnesis" });
      await admin
        .from("anamnesis_runs")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", runId);
    }
  }
}
