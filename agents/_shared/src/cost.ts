// Opus 4.7 pricing, confirmed by Radar capacity test 2026-04-23.
// Raw token cost only. The Managed Agents platform surcharge (if any) is
// TBD and NOT included here. Do not add a multiplier without explicit data.
const OPUS_4_7 = {
  input_per_mtok: 5.0,
  output_per_mtok: 25.0,
  cache_read_per_mtok: 0.5,
  cache_write_per_mtok: 6.25,
};

const USD_PER_BRL = 5.2;

export class CostMeter {
  private input = 0;
  private output = 0;
  private cacheRead = 0;
  private cacheWrite = 0;

  // CRITICAL: usage is emitted ONLY on span.model_request_end events, inside
  // a model_usage object. Reading ev.usage on other events silently returns
  // zero and breaks the meter.
  observe(ev: any) {
    if (ev?.type !== 'span.model_request_end') return;
    const mu = ev.model_usage;
    if (!mu) return;
    this.input += mu.input_tokens ?? 0;
    this.output += mu.output_tokens ?? 0;
    this.cacheRead += mu.cache_read_input_tokens ?? 0;
    this.cacheWrite += mu.cache_creation_input_tokens ?? 0;
  }

  report() {
    const usd =
      (this.input / 1_000_000) * OPUS_4_7.input_per_mtok +
      (this.output / 1_000_000) * OPUS_4_7.output_per_mtok +
      (this.cacheRead / 1_000_000) * OPUS_4_7.cache_read_per_mtok +
      (this.cacheWrite / 1_000_000) * OPUS_4_7.cache_write_per_mtok;
    console.log(`\n=== cost (raw token cost, MA surcharge TBD) ===`);
    console.log(`input  tokens: ${this.input.toLocaleString()}`);
    console.log(`output tokens: ${this.output.toLocaleString()}`);
    console.log(
      `cache  r / w:  ${this.cacheRead.toLocaleString()} / ${this.cacheWrite.toLocaleString()}`,
    );
    console.log(`USD:           $${usd.toFixed(4)}`);
    console.log(`BRL:           R$ ${(usd * USD_PER_BRL).toFixed(2)}`);
  }
}
