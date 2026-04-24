import type { OpportunityCategory, OpportunityType } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Scout input / output
// ---------------------------------------------------------------------------

export interface ScoutSource {
  url: string;
  hint: string;
  opportunity_type: OpportunityType;
  expected_loc: string;
}

export interface ScoutInput {
  sources: ScoutSource[];
  scout_run_id: string;
}

export interface ScoutUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface ScoutMeta {
  model: string;
  usage: ScoutUsage;
  cost_usd: number;
  started_at: string;
  finished_at: string;
  iterations: number;
  scope_rejections: number;
}

export interface ScoutOutput {
  run_summary: string;
  visited: number;
  upserted: number;
  discarded: number;
  _meta: ScoutMeta;
}

// ---------------------------------------------------------------------------
// Tool input schemas (narrow types for tool executors)
// ---------------------------------------------------------------------------

export interface FetchUrlInput {
  url: string;
  max_chars?: number;
}

export interface UpsertOpportunityInput {
  source_url: string;
  title: string;
  org: string | null;
  loc: string | null;
  category: OpportunityCategory;
  opportunity_type: OpportunityType;
  deadline: string | null;
  funding_brl: string | null;
  commitment: string | null;
  status: string | null;
  badge: string | null;
  seniority: string[] | null;
  audience: string[] | null;
  location_req: { country: string; remote_ok: boolean } | null;
  deep_data: Record<string, unknown>;
  scout_run_id: string;
}

export interface MarkDiscardedInput {
  host: string;
  path: string | null;
  reason:
    | "out-of-scope"
    | "duplicate"
    | "unchanged"
    | "throttled"
    | "error"
    | "low-fit"
    | "unverifiable";
  detail: string | null;
  scout_run_id: string;
}

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------

export type FetchUrlResult =
  | {
      ok: true;
      status: number;
      content_type: string | null;
      text_excerpt: string;
      truncated: boolean;
    }
  | {
      ok: false;
      error: "ssrf_blocked" | "timeout" | "http_error" | "fetch_failed";
      detail: string;
    };

export type UpsertOpportunityResult =
  | { ok: true; id: string; action: "inserted" | "updated" }
  | { ok: false; error: "invalid_input" | "db_error"; detail?: string };

export type MarkDiscardedResult =
  | { ok: true }
  | { ok: false; error: "db_error"; detail?: string };
