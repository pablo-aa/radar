// render_card custom tool specification for the Strategist Managed Agent.
// Shape matches BetaManagedAgentsCustomToolParams in the Anthropic SDK:
// { type, name, description, input_schema }. The input_schema only models
// type/properties/required; other JSON Schema keys are not declared and
// will be rejected by the API's strict validator.

export const renderCardToolSpec = {
  type: "custom" as const,
  name: "render_card",
  description:
    "Render one card (or one 90-day-plan entry) for the user. Call this once per item produced. The platform persists cards in order of invocation.",
  input_schema: {
    type: "object" as const,
    properties: {
      section: {
        type: "string",
        enum: [
          "dated_one_shot",
          "recurrent_annual",
          "rolling",
          "arenas",
          "ninety_day_plan",
        ],
      },
      opportunity_id: { type: "string" },
      title: { type: "string" },
      why_you: { type: "string" },
      fit_score: { type: "number" },
      source_url: { type: "string" },
      extra: {
        type: "object",
        description:
          "Section-specific fields, e.g. deadline, funding_brl, prep_required, next_window, cadence_note, when_to_engage, entry_point, suggested_cadence, week_range, action, unlocks.",
      },
    },
    required: [
      "section",
      "opportunity_id",
      "title",
      "why_you",
      "fit_score",
    ] as string[],
  },
} as const;

// Narrow type for the validated input received from the agent.
export interface RenderCardInput {
  section:
    | "dated_one_shot"
    | "recurrent_annual"
    | "rolling"
    | "arenas"
    | "ninety_day_plan";
  opportunity_id: string;
  title: string;
  why_you: string;
  fit_score: number;
  source_url?: string;
  extra?: Record<string, unknown>;
}

/**
 * Narrow an unknown tool input to RenderCardInput.
 * Returns null if required fields are missing or wrong type.
 */
export function parseRenderCardInput(
  raw: unknown,
): RenderCardInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const validSections = [
    "dated_one_shot",
    "recurrent_annual",
    "rolling",
    "arenas",
    "ninety_day_plan",
  ] as const;
  type ValidSection = (typeof validSections)[number];

  if (
    typeof r.section !== "string" ||
    !validSections.includes(r.section as ValidSection)
  )
    return null;
  if (typeof r.opportunity_id !== "string") return null;
  if (typeof r.title !== "string") return null;
  if (typeof r.why_you !== "string") return null;
  if (typeof r.fit_score !== "number") return null;

  return {
    section: r.section as ValidSection,
    opportunity_id: r.opportunity_id,
    title: r.title,
    why_you: r.why_you,
    fit_score: r.fit_score,
    source_url:
      typeof r.source_url === "string" ? r.source_url : undefined,
    extra:
      r.extra && typeof r.extra === "object" && !Array.isArray(r.extra)
        ? (r.extra as Record<string, unknown>)
        : undefined,
  };
}
