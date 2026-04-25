// Deterministic rule-based fit scoring for opportunities the Strategist
// agent did not write a full card for. This runs in-process on /radar
// (no LLM cost, no latency) and gives every opportunity a per-user
// fit_score so the catalog is not visually flat at "—/100".
//
// The scoring is intentionally simple and conservative. Trade-off vs an
// LLM scorer: less nuance, no prose, but instant and free. Suitable for
// the long tail; the Strategist still writes rich cards for top picks.

import "server-only";

import type { Opportunity, Profile } from "@/lib/supabase/types";
import type { FitBand } from "@/lib/agents/strategist/types";
import type { BulkScoreEntry } from "@/lib/agents/strategist/output-reader";

const STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","your","you","are","but",
  "can","not","have","has","was","were","they","them","their","what","when",
  "where","which","while","sobre","como","para","mais","tem","esse","essa",
  "este","esta","sou","minha","meu","mim","muito","quero","preciso","agora",
  "estou","sendo","fazer","tendo","entre","onde","quando","sempre","todo",
  "toda","cada","alguma","algum","outro","outra","pode","poder","seria",
  "seu","sua","ele","ela","eles","elas","nos","nas","nos","das","dos","aos",
  "porque","fazer","feito","feita","feitos","feitas","ainda","essa","essas",
  "esse","esses","estive","estado","temos",
]);

const FIT_BAND_THRESHOLDS = {
  high: 70,
  medium: 50,
  low: 35,
  // exclude: anything below `low`
} as const;

/** "Outras oportunidades" lives below this score. */
export const EXCLUDE_THRESHOLD = FIT_BAND_THRESHOLDS.low;

function bandFor(score: number): FitBand {
  if (score >= FIT_BAND_THRESHOLDS.high) return "high";
  if (score >= FIT_BAND_THRESHOLDS.medium) return "medium";
  if (score >= FIT_BAND_THRESHOLDS.low) return "low";
  return "exclude";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

interface ProfileSignals {
  keywords: Set<string>;
  isBR: boolean;
}

/**
 * Extract a flat keyword set + the user's BR-residency signal from the
 * profile. Defensive parsing: we accept either string or array values for
 * the common Anamnesis-shaped fields and fall back to scanning moment_text
 * for tokens.
 */
export function extractProfileSignals(profile: Profile | null): ProfileSignals {
  const keywords = new Set<string>();
  let isBR = true; // Radar targets BR devs; default true unless proven otherwise

  if (!profile?.structured_profile) return { keywords, isBR };

  const sp = profile.structured_profile as Record<string, unknown>;

  const stringSources: unknown[] = [
    sp.declared_interests,
    sp.skills,
    sp.languages,
    sp.interests,
    sp.focus_areas,
    sp.specialties,
    sp.tags,
  ];
  for (const src of stringSources) {
    if (Array.isArray(src)) {
      for (const item of src) {
        if (typeof item === "string") {
          tokenize(item).forEach((t) => keywords.add(t));
        }
      }
    } else if (typeof src === "string") {
      tokenize(src).forEach((t) => keywords.add(t));
    }
  }

  if (typeof sp.moment_text === "string") {
    tokenize(sp.moment_text).forEach((t) => keywords.add(t));
  }
  if (typeof sp.bio === "string") {
    tokenize(sp.bio).forEach((t) => keywords.add(t));
  }

  // BR-residency signal: only flip false on explicit non-BR markers.
  const country = sp.country;
  if (typeof country === "string" && country.length > 0) {
    const c = country.toLowerCase();
    isBR = c === "br" || c === "brasil" || c === "brazil";
  }

  return { keywords, isBR };
}

function isPastDeadline(deadline: string | null, now: Date): boolean {
  if (!deadline) return false;
  // Try common formats. We are permissive: anything Date can parse.
  const dt = new Date(deadline);
  if (Number.isNaN(dt.getTime())) return false;
  return dt.getTime() < now.getTime();
}

function isUrgentDeadline(deadline: string | null, now: Date): boolean {
  if (!deadline) return false;
  const dt = new Date(deadline);
  if (Number.isNaN(dt.getTime())) return false;
  const days = (dt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return days >= 0 && days <= 30;
}

function locOverlap(opp: Opportunity, isBR: boolean): number {
  // Penalize opportunities that explicitly require non-BR residency,
  // boost those that are BR-specific. Many opps have free-form loc text;
  // this is a fuzzy heuristic.
  const loc = opp.loc?.toLowerCase() ?? "";
  const status = opp.status?.toLowerCase() ?? "";

  let delta = 0;

  if (isBR) {
    if (/(\bbr\b|brasil|brazil|s[aã]o paulo|rio de|brazilian)/.test(loc)) {
      delta += 6;
    }
    // Hard-negative signal: explicit US-only / EU-only-residency markers in loc.
    if (/(\busa\s*only|\beua\s*only|us\s+citizen|us\s+resident|eu\s*only|european\s+union\s+only)/.test(loc)) {
      delta -= 25;
    }
  }

  // Slightly nudge "open" / "rolling" status, demote "closed" / "ended".
  if (/(open|rolling|live|accepting|inscri[cç][aã]o aberta)/.test(status)) {
    delta += 3;
  } else if (/(closed|ended|encerrad)/.test(status)) {
    delta -= 15;
  }

  return delta;
}

function keywordOverlap(opp: Opportunity, kw: Set<string>): number {
  if (kw.size === 0) return 0;
  const haystack = [
    opp.title ?? "",
    opp.org ?? "",
    opp.opportunity_type ?? "",
    Array.isArray(opp.audience) ? opp.audience.join(" ") : "",
    Array.isArray(opp.seniority) ? opp.seniority.join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();
  let hits = 0;
  for (const t of kw) {
    if (haystack.includes(t)) hits++;
  }
  // Diminishing returns: 1 hit +6, 2 hits +10, 3 hits +13, 4+ hits +15.
  if (hits === 0) return 0;
  if (hits === 1) return 6;
  if (hits === 2) return 10;
  if (hits === 3) return 13;
  return 15;
}

/**
 * Compute a per-user fit_score (0..100) and fit_band for one opportunity.
 * Pure function. Cheap. Deterministic for the same inputs.
 *
 * Returns the BulkScoreEntry shape (no opportunity_id; the caller keys by
 * opp.id in a Map) so the result plugs straight into the existing
 * ScoresMap consumed by /radar.
 */
export function scoreOpportunityForUser(
  opp: Opportunity,
  signals: ProfileSignals,
  now: Date = new Date(),
): BulkScoreEntry {
  // Hard exclude: past deadline. Send straight to the footer.
  if (isPastDeadline(opp.deadline, now)) {
    return { fit_score: 10, fit_band: "exclude" };
  }

  let score = 50; // neutral baseline
  score += locOverlap(opp, signals.isBR);
  score += keywordOverlap(opp, signals.keywords);
  if (isUrgentDeadline(opp.deadline, now)) score += 5;

  // Tiny stable tie-breaker so equal-score opps don't all land on the same
  // integer (would also flatten visual ordering). Hash opp.id to +/- 4.
  let hash = 0;
  for (let i = 0; i < opp.id.length; i++) {
    hash = (hash * 31 + opp.id.charCodeAt(i)) | 0;
  }
  score += Math.abs(hash) % 5; // 0..4

  const final = clamp(Math.round(score), 0, 100);
  return {
    fit_score: final,
    fit_band: bandFor(final),
  };
}

/**
 * Score every opportunity in the catalog. Returns a Map keyed by opp id
 * for O(1) lookup from the render path. Map shape matches ScoresMap from
 * output-reader.ts so rule-based scores can substitute for agent-emitted
 * all_scores when the agent does not emit them.
 */
export function computeRuleBasedScores(
  opps: readonly Opportunity[],
  profile: Profile | null,
  now: Date = new Date(),
): Map<string, BulkScoreEntry> {
  const signals = extractProfileSignals(profile);
  const map = new Map<string, BulkScoreEntry>();
  for (const o of opps) {
    map.set(o.id, scoreOpportunityForUser(o, signals, now));
  }
  return map;
}
