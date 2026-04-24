// Types for the Strategist Managed Agent pipeline.
// These are server-side types only: StrategistOutput is persisted to
// strategist_runs.output (JSONB) and read back by the /radar page via
// the StrategistRun DB type in src/lib/supabase/types.ts.

export type Section =
  | "dated_one_shot"
  | "recurrent_annual"
  | "rolling"
  | "arenas"
  | "ninety_day_plan";

export interface RenderedCard {
  section: Section;
  opportunity_id: string;
  title: string;
  why_you: string;
  fit_score: number;
  source_url?: string;
  extra?: Record<string, unknown>;
}

// Mirrors src/app/(authed)/radar/page.tsx lines 24-25.
export interface PlanItem {
  text: string;
  meta: string;
  ok?: boolean;
}

export interface PlanTier {
  label: string;
  range: string;
  items: PlanItem[];
}

// Section-specific card shapes emitted into the output JSON.
// These preserve the shape the old mock route produced so existing
// callers and future UI surfaces can rely on them.

export interface DatedCard {
  opportunity_id: string;
  title: string;
  source_url?: string;
  deadline?: string;
  funding_brl?: string;
  fit_score: number;
  prep_required?: string;
  why_you: string;
}

export interface RecurrentCard {
  opportunity_id: string;
  title: string;
  source_url?: string;
  next_window?: string;
  fit_score: number;
  cadence_note?: string;
  why_you: string;
}

export interface RollingCard {
  opportunity_id: string;
  title: string;
  source_url?: string;
  fit_score: number;
  when_to_engage?: string;
  why_you: string;
}

export interface ArenaCard {
  opportunity_id: string;
  title: string;
  source_url?: string;
  fit_score: number;
  entry_point?: string;
  suggested_cadence?: string;
  why_you: string;
}

export interface PlanEntry {
  week_range: string;
  action: string;
  unlocks: string;
}

export interface UsageSummary {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface CostSummary {
  usage: UsageSummary;
  cost_usd: number;
}

export interface StrategistRunMeta {
  usage: UsageSummary;
  cost_usd: number;
  session_id: string;
  model: "claude-opus-4-7";
  started_at: string;
  finished_at: string;
  error?: {
    code: string;
    message: string;
    request_id?: string;
    session_id?: string;
  };
}

export interface StrategistOutput {
  // UI-contract fields (primary, read by /radar extractPlan).
  tiers: PlanTier[];
  generatedAt: string;
  horizon: string;
  // Additive category sections (reserved for future UI surfaces).
  run_summary: string;
  dated_one_shot: DatedCard[];
  recurrent_annual: RecurrentCard[];
  rolling: RollingCard[];
  arenas: ArenaCard[];
  ninety_day_plan: PlanEntry[];
  _meta: StrategistRunMeta;
}

export interface StrategistInput {
  profile: Record<string, unknown>;
  opportunities: Record<string, unknown>[];
}
