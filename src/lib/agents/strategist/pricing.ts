// Opus 4.7 raw token pricing (USD per million tokens).
// Source: Anthropic public pricing page.
// The Managed Agents platform surcharge (if any) is not included here.
// Do not add a multiplier without explicit data from Anthropic billing.

export const OPUS_4_7_PRICING = {
  input_per_mtok: 5.0,
  output_per_mtok: 25.0,
  cache_read_per_mtok: 0.5,
  cache_write_per_mtok: 6.25,
} as const;

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

/**
 * Compute the raw token cost in USD for a completed run.
 * Cache write tokens use the higher cache_write_per_mtok rate.
 */
export function computeCostUsd(usage: TokenUsage): number {
  return (
    (usage.input_tokens / 1_000_000) * OPUS_4_7_PRICING.input_per_mtok +
    (usage.output_tokens / 1_000_000) * OPUS_4_7_PRICING.output_per_mtok +
    (usage.cache_read_input_tokens / 1_000_000) *
      OPUS_4_7_PRICING.cache_read_per_mtok +
    (usage.cache_creation_input_tokens / 1_000_000) *
      OPUS_4_7_PRICING.cache_write_per_mtok
  );
}
