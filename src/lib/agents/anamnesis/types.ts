// Types for the Anamnesis raw-messages agent.
// AnamnesisOutput is persisted to anamnesis_runs.output (JSONB) and
// read back by the /report page via profiles.structured_profile.

export interface AnamnesisInput {
  handle: string;
  display_name: string | null;
  email: string | null;
  /** Existing structured_profile fields from the intake form, if any. */
  intake: Record<string, unknown> | null;
  /**
   * Supabase storage path for the user's CV PDF (bucket: cvs).
   * If present, run.ts will fetch signed URL, download bytes, and include
   * the PDF as a native document block in the first user message.
   */
  cv_url?: string | null;
}

export interface AnamnesisOssSiganls {
  maintainer_of: string[];
  top_contributions: string[];
  primary_languages: string[];
}

export interface AnamnesisProfile {
  summary_one_line: string;
  trajectory: string;
  strengths: string[];
  domains: string[];
  oss_signals: AnamnesisOssSiganls;
  interests: string[];
  goals: string[];
  narrative_voice: string;
  weak_spots: string[];
  cited_profile_fields: string[];
}

export interface AnamnesisUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AnamnesisRunMeta {
  model: "claude-opus-4-7";
  usage: AnamnesisUsage;
  cost_usd: number;
  started_at: string;
  finished_at: string;
  tool_calls: number;
  error?: {
    code: string;
    message: string;
  };
}

export interface AnamnesisOutput {
  profile: AnamnesisProfile;
  report: import("@/lib/sample-data/anamnesis-report").AnamnesisReport;
  _meta: AnamnesisRunMeta;
}

// Narrow types for tool_use content blocks returned by the Claude API.

export interface AnamnesisToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnamnesisTextBlock {
  type: "text";
  text: string;
}

export type AnamnesisContentBlock = AnamnesisToolUseBlock | AnamnesisTextBlock | { type: string };
