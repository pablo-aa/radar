// Custom tool specs for the Scout Managed Agent.
// Shape matches BetaManagedAgentsCustomToolParams:
//   { type: "custom", name, description, input_schema: { type, properties, required } }
// No extra JSON Schema keys -- the API's strict validator rejects them.

import type { FetchUrlInput, MarkDiscardedInput } from "./types";

// ---------------------------------------------------------------------------
// Tool specs (MA custom format)
// ---------------------------------------------------------------------------

export const fetchUrlToolSpec = {
  type: "custom" as const,
  name: "fetch_url",
  description:
    "Fetch the text content of a public URL. Strips HTML tags and returns the first N characters. Use this to read primary source pages for opportunity details. Private IP ranges and non-HTTP(S) protocols are blocked. Returns ok:false on SSRF block, timeout, or HTTP error.",
  input_schema: {
    type: "object" as const,
    properties: {
      url: {
        type: "string",
        description: "The URL to fetch. Must be http or https.",
      },
      max_chars: {
        type: "number",
        description: "Maximum characters to return from the page content. Default 8000.",
      },
    },
    required: ["url"] as string[],
  },
} as const;

export const upsertOpportunityToolSpec = {
  type: "custom" as const,
  name: "upsert_opportunity",
  description:
    "Persist a validated opportunity to the database. Deduplicates by source_url (updates if exists, inserts if new). Call once per distinct opportunity that passes scope check. Returns the row id and whether it was inserted or updated.",
  input_schema: {
    type: "object" as const,
    properties: {
      source_url: {
        type: "string",
        description: "Official/primary URL for this opportunity.",
      },
      title: { type: "string", description: "Concise official title." },
      org: { type: "string", description: "Sponsoring organization name." },
      loc: {
        type: "string",
        description: "Short location string, e.g. 'Brasil', 'UK', 'Remoto'.",
      },
      category: {
        type: "string",
        enum: ["dated_one_shot", "recurrent_annual", "rolling", "arena"],
        description: "Legacy category for Strategist matching.",
      },
      opportunity_type: {
        type: "string",
        enum: [
          "grant",
          "fellowship",
          "scholarship",
          "accelerator",
          "arena",
          "competition",
          "event",
          "community",
          "internship",
        ],
        description: "Precise opportunity type.",
      },
      deadline: {
        type: "string",
        description: "ISO date YYYY-MM-DD or null if rolling.",
      },
      funding_brl: {
        type: "string",
        description: "Human-readable funding amount in BRL or null.",
      },
      commitment: {
        type: "string",
        description: "Duration or time commitment, e.g. '10 semanas'.",
      },
      status: {
        type: "string",
        enum: ["open", "closed", "opening_soon"],
        description: "Current application status.",
      },
      badge: {
        type: "string",
        description: "One short label, e.g. 'Bolsa integral'.",
      },
      seniority: {
        type: "array",
        items: { type: "string" },
        description:
          "Applicable seniority levels: estudante, junior, pleno, senior, pesquisador, qualquer.",
      },
      audience: {
        type: "array",
        items: { type: "string" },
        description:
          "Target audience: devs, pesquisadores, estudantes, startups, designers, qualquer.",
      },
      location_req: {
        type: "object",
        properties: {
          country: { type: "string" },
          remote_ok: { type: "boolean" },
        },
        required: ["country", "remote_ok"],
        description: "Location requirements.",
      },
      deep_data: {
        type: "object",
        description:
          "Rich object with why, partners, winner_pattern, red_flags, typical_timeline, confidence_score (0-1), sources_cited (URLs).",
      },
      scout_run_id: {
        type: "string",
        description: "The current scout run UUID.",
      },
    },
    required: [
      "source_url",
      "title",
      "category",
      "opportunity_type",
      "deep_data",
      "scout_run_id",
    ] as string[],
  },
} as const;

export const markDiscardedToolSpec = {
  type: "custom" as const,
  name: "mark_discarded",
  description:
    "Record that a URL was evaluated and rejected. Call for every source that fails scope check or cannot be processed.",
  input_schema: {
    type: "object" as const,
    properties: {
      host: {
        type: "string",
        description: "Hostname of the discarded URL.",
      },
      path: {
        type: "string",
        description: "Path portion of the URL, or null.",
      },
      reason: {
        type: "string",
        enum: [
          "out-of-scope",
          "duplicate",
          "unchanged",
          "throttled",
          "error",
          "low-fit",
          "unverifiable",
        ],
        description: "Reason for discarding.",
      },
      detail: {
        type: "string",
        description: "Optional free-text detail for debugging.",
      },
      scout_run_id: {
        type: "string",
        description: "The current scout run UUID.",
      },
    },
    required: ["host", "reason", "scout_run_id"] as string[],
  },
} as const;

// Convenience array for agent creation: web_search native tool + 3 custom tools.
// NOTE: web_search is declared here for reference; the agent creation script
// passes it inline as a native tool spec (type "web_search_20260209").
export const SCOUT_CUSTOM_TOOL_SPECS = [
  fetchUrlToolSpec,
  upsertOpportunityToolSpec,
  markDiscardedToolSpec,
] as const;

// ---------------------------------------------------------------------------
// Input parsers (narrow unknown -> typed | null at MA event boundaries)
// ---------------------------------------------------------------------------

export function parseFetchUrlInput(raw: unknown): FetchUrlInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r["url"] !== "string" || r["url"].length === 0) return null;
  return {
    url: r["url"],
    max_chars: typeof r["max_chars"] === "number" ? r["max_chars"] : undefined,
  };
}

// upsert_opportunity passes raw unknown to executeUpsertOpportunity which does
// its own internal narrowing -- we just need to confirm it's a plain object.
export function parseUpsertOpportunityInput(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

export function parseMarkDiscardedInput(
  raw: unknown,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Require the fields that executeMarkDiscarded will validate.
  if (typeof r["host"] !== "string") return null;
  if (typeof r["reason"] !== "string") return null;
  return r;
}

// Re-export the MarkDiscardedInput type so callers don't need a separate import.
export type { MarkDiscardedInput };
