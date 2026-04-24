// Cycle label helpers. Scout and Strategist runs are stamped with an ISO-week
// label, e.g. `2026-W17`. The current MVP stub and the future Managed Agents
// trigger both use this to tag persistence rows.

// Compute the ISO week label (YYYY-Www) for a given date. ISO weeks start on
// Monday; week 1 is the week containing the first Thursday of the year.
export function computeCycleLabel(date: Date = new Date()): string {
  // Copy so we do not mutate the caller's instance, and work in UTC to keep
  // this deterministic across server TZs.
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // ISO weekday: 1 = Monday, 7 = Sunday.
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Shift to the Thursday of the current ISO week.
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNum = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  const weekStr = String(weekNum).padStart(2, "0");
  return `${isoYear}-W${weekStr}`;
}
