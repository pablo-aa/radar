// GET /api/onboarding/status
//
// Aggregated status of the chained intake flow (Anamnesis + Strategist).
// One round-trip per poll instead of two. Used by BothPoller on /generating?step=both.
//
// Response shape:
//   200 {
//     anamnesis: { status, started_at, elapsed_seconds, error_code? } | null,
//     strategist: { status, started_at, elapsed_seconds, error_code? } | null,
//   }
//   401 { error: "unauthorized" }
//
// `null` for either side means no row exists yet for that user. The poller
// treats that as "still waiting" (the chained dispatch may not have inserted
// the strategist row yet, etc).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AnamnesisRun, RunStatus, StrategistRun } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentSnapshot = {
  status: RunStatus;
  started_at: string;
  elapsed_seconds: number;
  error_code: string | null;
};

type StatusResponse = {
  anamnesis: AgentSnapshot | null;
  strategist: AgentSnapshot | null;
};

function computeElapsed(startedAt: string, finishedAt: string | null): number {
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  return Math.round((end - start) / 1000);
}

function extractErrorCode(output: unknown): string | null {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const meta = o._meta;
  if (!meta || typeof meta !== "object") return null;
  const err = (meta as Record<string, unknown>).error;
  if (!err || typeof err !== "object") return null;
  const code = (err as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const auth = await supabase.auth.getUser();
  if (auth.error || !auth.data.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const userId = auth.data.user.id;

  const admin = createAdminClient();

  const [anamnesisRes, strategistRes] = await Promise.all([
    admin
      .from("anamnesis_runs")
      .select("id, status, started_at, finished_at, output")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("strategist_runs")
      .select("id, status, started_at, finished_at, output")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const anamnesisRow = anamnesisRes.data as
    | (Pick<AnamnesisRun, "id" | "status" | "started_at" | "finished_at"> & {
        output: unknown;
      })
    | null;
  const strategistRow = strategistRes.data as
    | (Pick<StrategistRun, "id" | "status" | "started_at" | "finished_at"> & {
        output: unknown;
      })
    | null;

  const anamnesis: AgentSnapshot | null = anamnesisRow
    ? {
        status: anamnesisRow.status,
        started_at: anamnesisRow.started_at,
        elapsed_seconds: computeElapsed(
          anamnesisRow.started_at,
          anamnesisRow.finished_at,
        ),
        error_code:
          anamnesisRow.status === "error"
            ? extractErrorCode(anamnesisRow.output)
            : null,
      }
    : null;

  const strategist: AgentSnapshot | null = strategistRow
    ? {
        status: strategistRow.status,
        started_at: strategistRow.started_at,
        elapsed_seconds: computeElapsed(
          strategistRow.started_at,
          strategistRow.finished_at,
        ),
        error_code:
          strategistRow.status === "error"
            ? extractErrorCode(strategistRow.output)
            : null,
      }
    : null;

  const response: StatusResponse = { anamnesis, strategist };
  return NextResponse.json(response);
}
