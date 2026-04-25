// Hand-crafted Database types for Radar.
// Source of truth is supabase/migrations/. If a migration changes, update here.
// Phase 2E will refine JSONB shapes for anamnesis.output, strategist.output,
// opportunities.deep_data, and profiles.structured_profile.

export type OnboardState = {
  signed_in: boolean;
  welcomed: boolean;
  intake_done: boolean;
  report_seen: boolean;
  runs_used: number;
};

export type OpportunityCategory =
  | "dated_one_shot"
  | "recurrent_annual"
  | "rolling"
  | "arena";

export type OpportunityType =
  | "grant"
  | "fellowship"
  | "scholarship"
  | "accelerator"
  | "arena"
  | "competition"
  | "event"
  | "community"
  | "internship";

export type ScoutDiscardReason =
  | "out-of-scope"
  | "duplicate"
  | "unchanged"
  | "throttled"
  | "error"
  | "low-fit"
  | "unverifiable";

export type RunStatus = "pending" | "running" | "done" | "error";

// profiles row
export type Profile = {
  user_id: string;
  github_handle: string | null;
  github_avatar_url: string | null;
  display_name: string | null;
  email: string | null;
  cv_url: string | null;
  site_url: string | null;
  structured_profile: Record<string, unknown> | null;
  onboard_state: OnboardState;
  anamnesis_run_id: string | null;
  city: string | null;
  state: string | null;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  user_id: string;
  github_handle?: string | null;
  github_avatar_url?: string | null;
  display_name?: string | null;
  email?: string | null;
  cv_url?: string | null;
  site_url?: string | null;
  structured_profile?: Record<string, unknown> | null;
  onboard_state?: OnboardState;
  anamnesis_run_id?: string | null;
  city?: string | null;
  state?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProfileUpdate = Partial<ProfileInsert>;

// opportunities row
export type Opportunity = {
  id: string;
  source_url: string;
  title: string;
  org: string | null;
  loc: string | null;
  category: OpportunityCategory;
  opportunity_type: OpportunityType | null;
  deadline: string | null;
  funding_brl: string | null;
  commitment: string | null;
  badge: string | null;
  status: string | null;
  fit: number | null;
  id_display: string | null;
  found_at: string | null;
  deep_data: Record<string, unknown> | null;
  scout_run_id: string | null;
  seniority: string[] | null;
  audience: string[] | null;
  location_req: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type OpportunityInsert = {
  id?: string;
  source_url: string;
  title: string;
  org?: string | null;
  loc?: string | null;
  category: OpportunityCategory;
  opportunity_type?: OpportunityType | null;
  deadline?: string | null;
  funding_brl?: string | null;
  commitment?: string | null;
  badge?: string | null;
  status?: string | null;
  fit?: number | null;
  id_display?: string | null;
  found_at?: string | null;
  deep_data?: Record<string, unknown> | null;
  scout_run_id?: string | null;
  seniority?: string[] | null;
  audience?: string[] | null;
  location_req?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type OpportunityUpdate = Partial<OpportunityInsert>;

// scout_runs row
export type ScoutRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  cycle_label: string | null;
  sources_count: number;
  pages_fetched: number;
  found_count: number;
  updated_count: number;
  discarded_count: number;
  agent_session_id: string | null;
  status: RunStatus;
  output: Record<string, unknown> | null;
  created_at: string;
};

export type ScoutRunInsert = {
  id?: string;
  started_at?: string;
  finished_at?: string | null;
  cycle_label?: string | null;
  sources_count?: number;
  pages_fetched?: number;
  found_count?: number;
  updated_count?: number;
  discarded_count?: number;
  agent_session_id?: string | null;
  status?: RunStatus;
  output?: Record<string, unknown> | null;
  created_at?: string;
};

export type ScoutRunUpdate = Partial<ScoutRunInsert>;

// scout_discarded row
export type ScoutDiscarded = {
  id: string;
  scout_run_id: string;
  host: string;
  path: string | null;
  reason: ScoutDiscardReason;
  detail: string | null;
  decided_at: string;
};

export type ScoutDiscardedInsert = {
  id?: string;
  scout_run_id: string;
  host: string;
  path?: string | null;
  reason: ScoutDiscardReason;
  detail?: string | null;
  decided_at?: string;
};

export type ScoutDiscardedUpdate = Partial<ScoutDiscardedInsert>;

// anamnesis_runs row
export type AnamnesisRun = {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  agent_session_id: string | null;
  status: RunStatus;
  output: Record<string, unknown> | null;
  created_at: string;
  notified_at: string | null;
};

export type AnamnesisRunInsert = {
  id?: string;
  user_id: string;
  started_at?: string;
  finished_at?: string | null;
  agent_session_id?: string | null;
  status?: RunStatus;
  output?: Record<string, unknown> | null;
  created_at?: string;
  notified_at?: string | null;
};

export type AnamnesisRunUpdate = Partial<AnamnesisRunInsert>;

// strategist_runs row
export type StrategistRun = {
  id: string;
  user_id: string;
  started_at: string;
  finished_at: string | null;
  profile_snapshot: Record<string, unknown> | null;
  opportunity_ids: string[] | null;
  output: Record<string, unknown> | null;
  agent_session_id: string | null;
  status: RunStatus;
  cycle_label: string | null;
  created_at: string;
  notified_at: string | null;
};

export type StrategistRunInsert = {
  id?: string;
  user_id: string;
  started_at?: string;
  finished_at?: string | null;
  profile_snapshot?: Record<string, unknown> | null;
  opportunity_ids?: string[] | null;
  output?: Record<string, unknown> | null;
  agent_session_id?: string | null;
  status?: RunStatus;
  cycle_label?: string | null;
  created_at?: string;
  notified_at?: string | null;
};

export type StrategistRunUpdate = Partial<StrategistRunInsert>;

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      opportunities: {
        Row: Opportunity;
        Insert: OpportunityInsert;
        Update: OpportunityUpdate;
        Relationships: [];
      };
      scout_runs: {
        Row: ScoutRun;
        Insert: ScoutRunInsert;
        Update: ScoutRunUpdate;
        Relationships: [];
      };
      scout_discarded: {
        Row: ScoutDiscarded;
        Insert: ScoutDiscardedInsert;
        Update: ScoutDiscardedUpdate;
        Relationships: [];
      };
      scout_queue: {
        Row: ScoutQueueRow;
        Insert: ScoutQueueInsert;
        Update: ScoutQueueUpdate;
        Relationships: [];
      };
      anamnesis_runs: {
        Row: AnamnesisRun;
        Insert: AnamnesisRunInsert;
        Update: AnamnesisRunUpdate;
        Relationships: [];
      };
      strategist_runs: {
        Row: StrategistRun;
        Insert: StrategistRunInsert;
        Update: StrategistRunUpdate;
        Relationships: [];
      };
    };
    Views: { [key: string]: never };
    Functions: { [key: string]: never };
    Enums: {
      scout_discard_reason: ScoutDiscardReason;
      opportunity_type: OpportunityType;
    };
    CompositeTypes: { [key: string]: never };
  };
};

// scout_queue row
export type ScoutQueueStatus = "pending" | "visited" | "skipped" | "failed";

export type ScoutQueueRow = {
  url: string;
  hint: string;
  opportunity_type: string | null;
  discovered_from: string | null;
  discovered_at: string;
  visit_count: number;
  last_visited_at: string | null;
  citation_count: number;
  priority_score: number;
  status: ScoutQueueStatus;
};

export type ScoutQueueInsert = {
  url: string;
  hint: string;
  opportunity_type?: string | null;
  discovered_from?: string | null;
  discovered_at?: string;
  visit_count?: number;
  last_visited_at?: string | null;
  citation_count?: number;
  priority_score?: number;
  status?: ScoutQueueStatus;
};

export type ScoutQueueUpdate = Partial<ScoutQueueInsert>;

export const DEFAULT_ONBOARD_STATE: OnboardState = {
  signed_in: false,
  welcomed: false,
  intake_done: false,
  report_seen: false,
  runs_used: 0,
};
