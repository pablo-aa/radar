// output-reader.ts
// Server-side utility: reads a strategist_runs.output JSONB blob and extracts
// the picks map keyed by opportunity_id for UI re-ranking.
// No imports from run-agent or client; safe to import in Server Components.

import type { StrategistRun } from "@/lib/supabase/types";
import type { FitBand } from "./types";

export interface PickOverride {
  fit_score: number;
  why_you: string;
  /** emission order from the agent (0-based); lower = higher rank within section */
  rank_in_section: number;
  section: string;
}

/** Map of opportunity_id -> override data for Strategist-picked cards. */
export type PicksMap = Map<string, PickOverride>;

type CardLike = {
  opportunity_id?: unknown;
  fit_score?: unknown;
  why_you?: unknown;
};

/**
 * Build a PicksMap from a StrategistRun row.
 * Returns an empty map if the run is null, not done, or has no output.
 */
export function buildPicksMap(run: StrategistRun | null): PicksMap {
  const map: PicksMap = new Map();
  if (!run || run.status !== "done" || !run.output) return map;

  const output = run.output as Record<string, unknown>;
  const sections = [
    "dated_one_shot",
    "recurrent_annual",
    "rolling",
    "arenas",
  ] as const;

  for (const section of sections) {
    const arr = output[section];
    if (!Array.isArray(arr)) continue;
    (arr as CardLike[]).forEach((card, idx) => {
      const oppId =
        typeof card.opportunity_id === "string" ? card.opportunity_id : null;
      const fitScore =
        typeof card.fit_score === "number" ? card.fit_score : null;
      const whyYou =
        typeof card.why_you === "string" ? card.why_you : null;
      if (oppId && fitScore !== null && whyYou) {
        map.set(oppId, {
          fit_score: fitScore,
          why_you: whyYou,
          rank_in_section: idx,
          section,
        });
      }
    });
  }

  return map;
}

/**
 * Per-opportunity bulk score from the Strategist's all_scores block.
 * Distinct from PickOverride: bulk scores have no why_you prose.
 */
export interface BulkScoreEntry {
  fit_score: number;
  fit_band: FitBand;
}

export type ScoresMap = Map<string, BulkScoreEntry>;

const VALID_BANDS = new Set(["high", "medium", "low", "exclude"]);

/**
 * Build a ScoresMap from a StrategistRun row's output.all_scores array.
 * Returns an empty map if the run is null, not done, has no output, or the
 * all_scores field is missing/malformed.
 */
export function buildScoresMap(run: StrategistRun | null): ScoresMap {
  const map: ScoresMap = new Map();
  if (!run || run.status !== "done" || !run.output) return map;
  const output = run.output as Record<string, unknown>;
  const arr = output.all_scores;
  if (!Array.isArray(arr)) return map;
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const oppId = obj.opportunity_id;
    const fitScore = obj.fit_score;
    const fitBand = obj.fit_band;
    if (typeof oppId !== "string" || oppId.length === 0) continue;
    if (typeof fitScore !== "number" || !Number.isFinite(fitScore)) continue;
    if (typeof fitBand !== "string" || !VALID_BANDS.has(fitBand)) continue;
    map.set(oppId, {
      fit_score: Math.max(0, Math.min(100, Math.round(fitScore))),
      fit_band: fitBand as FitBand,
    });
  }
  return map;
}

/**
 * Determine the display state for the /radar page.
 *
 * - "fresh":   no strategist run exists (or profile has no anamnesis_run_id)
 * - "stale":   latest run's snapshot anamnesis_run_id differs from current profile
 * - "running": a running row exists
 * - "error":   latest run is in error state
 * - "ready":   latest run is done and up to date
 */
export type StrategistState =
  | "fresh"
  | "stale"
  | "running"
  | "error"
  | "ready";

export function computeStrategistState(
  run: StrategistRun | null,
  currentAnamnesisRunId: string | null,
): StrategistState {
  if (!run) return "fresh";
  if (run.status === "running") return "running";
  if (run.status === "error") return "error";
  if (run.status === "done") {
    const snapshot = run.profile_snapshot as Record<string, unknown> | null;
    const snapshotId =
      snapshot && typeof snapshot.anamnesis_run_id === "string"
        ? snapshot.anamnesis_run_id
        : null;
    if (snapshotId !== currentAnamnesisRunId) return "stale";
    return "ready";
  }
  return "fresh";
}
