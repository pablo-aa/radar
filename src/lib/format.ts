// Display helpers for opportunity-card UI.
//
// Scout sometimes captures the literal string "NULL" / "null" / "none" /
// "n/a" / "" from source pages instead of returning a real null. Treating
// those as absent on the render side keeps the UI clean without needing a
// data backfill on every catalog change.

const ABSENT_TOKENS = new Set([
  "",
  "null",
  "none",
  "n/a",
  "na",
  "tbd",
  "tba",
  "-",
  "—",
  "undefined",
]);

/**
 * Returns a clean display string or the em-dash placeholder when the input
 * is null, undefined, or one of the known "absent" tokens (case-insensitive).
 */
export function displayOrDash(value: string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const trimmed = value.trim();
  if (ABSENT_TOKENS.has(trimmed.toLowerCase())) return "—";
  return trimmed;
}
