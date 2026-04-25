// Pure card accumulator and output transformer for the Strategist agent.
// No I/O, no external imports beyond local types and utilities.
// Deterministic given the same input (trivially unit-testable).

import type {
  ArenaCard,
  BulkScore,
  DatedCard,
  PlanEntry,
  PlanItem,
  PlanTier,
  RecurrentCard,
  RenderedCard,
  RollingCard,
} from "./types";

// Section count limits (matches the agent's prompt constraints).
const LIMITS: Record<string, number> = {
  dated_one_shot: 3,
  recurrent_annual: 3,
  rolling: 2,
  arenas: 3,
  ninety_day_plan: 5,
};

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

// ---------------------------------------------------------------------------
// Card-to-section-shape mappers
// ---------------------------------------------------------------------------

function toDated(card: RenderedCard): DatedCard {
  return {
    opportunity_id: card.opportunity_id,
    title: card.title,
    source_url: card.source_url,
    deadline: str(card.extra?.deadline),
    funding_brl: str(card.extra?.funding_brl),
    fit_score: card.fit_score,
    prep_required: str(card.extra?.prep_required),
    why_you: card.why_you,
  };
}

function toRecurrent(card: RenderedCard): RecurrentCard {
  return {
    opportunity_id: card.opportunity_id,
    title: card.title,
    source_url: card.source_url,
    next_window: str(card.extra?.next_window),
    fit_score: card.fit_score,
    cadence_note: str(card.extra?.cadence_note),
    why_you: card.why_you,
  };
}

function toRolling(card: RenderedCard): RollingCard {
  return {
    opportunity_id: card.opportunity_id,
    title: card.title,
    source_url: card.source_url,
    fit_score: card.fit_score,
    when_to_engage: str(card.extra?.when_to_engage),
    why_you: card.why_you,
  };
}

function toArena(card: RenderedCard): ArenaCard {
  return {
    opportunity_id: card.opportunity_id,
    title: card.title,
    source_url: card.source_url,
    fit_score: card.fit_score,
    entry_point: str(card.extra?.entry_point),
    suggested_cadence: str(card.extra?.suggested_cadence),
    why_you: card.why_you,
  };
}

function toPlanEntry(card: RenderedCard): PlanEntry {
  return {
    week_range: str(card.extra?.week_range) ?? card.title,
    action: str(card.extra?.action) ?? card.why_you,
    unlocks: str(card.extra?.unlocks) ?? card.opportunity_id,
  };
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const SHORT_MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/** "apr 24" style, matches FALLBACK_PLAN range format in page.tsx. */
function shortDate(d: Date): string {
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "YYYY-MM-DD" for the horizon field. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD HH:mm BRT" matching FALLBACK_PLAN.generatedAt style. */
function brtTimestamp(d: Date): string {
  // America/Sao_Paulo is UTC-3 (BRT); no DST in winter.
  const brtOptions: Intl.DateTimeFormatOptions = {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat("en-CA", brtOptions).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")} BRT`;
}

// ---------------------------------------------------------------------------
// Tier derivation from ninety_day_plan cards
// ---------------------------------------------------------------------------

/**
 * Parse the starting week number from a week_range string like "W01-W02",
 * "W05-W07", "Week 1-2", etc. Returns NaN if unparseable.
 */
function parseStartWeek(weekRange: string): number {
  const match = weekRange.match(/W?(\d+)/i);
  return match ? parseInt(match[1], 10) : NaN;
}

function deriveTiers(
  planCards: RenderedCard[],
  runSummary: string,
  now: Date,
): PlanTier[] {
  if (planCards.length === 0) {
    // Empty-plan fallback: emit a single stub tier so the panel is never blank.
    return [
      {
        label: "Next 90 days",
        range: `${shortDate(now)} to ${shortDate(addDays(now, 90))}`,
        items: [
          {
            text: runSummary,
            meta: "plan summary",
          },
        ],
      },
    ];
  }

  const t1Start = now;
  const t1End = addDays(now, 30);
  const t2End = addDays(now, 60);
  const t3End = addDays(now, 90);

  // Tier label simplification: weeks 1-4 = "Next 30 days", 5-8 = "Next 60 days",
  // 9+ = "60 to 90 days". This is intentionally simpler than the mock's
  // "This week" / "Next 30 days" split; the real output should not be assumed
  // to mirror the mock 1:1.
  const tierDefs: Array<{
    label: string;
    range: string;
    test: (n: number) => boolean;
  }> = [
    {
      label: "Next 30 days",
      range: `${shortDate(t1Start)} to ${shortDate(t1End)}`,
      test: (n) => n >= 1 && n <= 4,
    },
    {
      label: "Next 60 days",
      range: `${shortDate(addDays(now, 31))} to ${shortDate(t2End)}`,
      test: (n) => n >= 5 && n <= 8,
    },
    {
      label: "60 to 90 days",
      range: `${shortDate(addDays(now, 61))} to ${shortDate(t3End)}`,
      test: (n) => n >= 9,
    },
  ];

  const tiers: PlanTier[] = [];

  for (const def of tierDefs) {
    const items: PlanItem[] = planCards
      .filter((c) => def.test(parseStartWeek(str(c.extra?.week_range) ?? c.title)))
      .map((c) => ({
        text: str(c.extra?.action) ?? c.why_you,
        meta: `${c.opportunity_id} · fit ${c.fit_score}`,
      }));
    if (items.length > 0) {
      tiers.push({ label: def.label, range: def.range, items });
    }
  }

  // If no card matched any tier (all week numbers unparseable), fall back to stub.
  if (tiers.length === 0) {
    return [
      {
        label: "Next 90 days",
        range: `${shortDate(now)} to ${shortDate(t3End)}`,
        items: [{ text: runSummary, meta: "plan summary" }],
      },
    ];
  }

  return tiers;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CardBuffer {
  push(card: RenderedCard): number;
  getCards(): readonly RenderedCard[];
}

export function createCardBuffer(): CardBuffer {
  const cards: RenderedCard[] = [];
  return {
    push(card: RenderedCard): number {
      cards.push(card);
      return cards.length - 1;
    },
    getCards(): readonly RenderedCard[] {
      return cards;
    },
  };
}

export interface TransformedOutput {
  tiers: PlanTier[];
  generatedAt: string;
  horizon: string;
  run_summary: string;
  dated_one_shot: DatedCard[];
  recurrent_annual: RecurrentCard[];
  rolling: RollingCard[];
  arenas: ArenaCard[];
  ninety_day_plan: PlanEntry[];
  all_scores: BulkScore[];
}

/**
 * Pure transform: cards + bulk scores -> structured output matching the UI contract.
 * The clock parameter is injectable for deterministic testing.
 */
export function transformCardsToOutput(
  cards: readonly RenderedCard[],
  runSummary: string,
  allScores: readonly BulkScore[] = [],
  clock: () => Date = () => new Date(),
): TransformedOutput {
  const now = clock();

  // Group by section and apply count limits.
  const bySection = (section: string): RenderedCard[] =>
    cards
      .filter((c) => c.section === section)
      .slice(0, LIMITS[section] ?? 5);

  const datedCards = bySection("dated_one_shot");
  const recurrentCards = bySection("recurrent_annual");
  const rollingCards = bySection("rolling");
  const arenaCards = bySection("arenas");
  const planCards = bySection("ninety_day_plan");

  const tiers = deriveTiers(planCards, runSummary, now);

  return {
    tiers,
    generatedAt: brtTimestamp(now),
    horizon: `90 days · to ${isoDate(addDays(now, 90))}`,
    run_summary: runSummary,
    dated_one_shot: datedCards.map(toDated),
    recurrent_annual: recurrentCards.map(toRecurrent),
    rolling: rollingCards.map(toRolling),
    arenas: arenaCards.map(toArena),
    ninety_day_plan: planCards.map(toPlanEntry),
    all_scores: [...allScores],
  };
}

// Re-export for convenience (used by run-agent.ts).
export type { RenderedCard };
