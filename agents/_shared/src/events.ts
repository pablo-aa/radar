// Compact one-liner event logger for Managed Agents streams.
// Truncates long strings so console output stays scannable.

function truncate(value: unknown, max: number): string {
  if (value == null) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export function logEvent(ev: any) {
  const type: string = ev?.type ?? 'unknown';

  switch (type) {
    case 'agent.thinking': {
      const text = ev.content?.text ?? ev.text ?? ev.content ?? '';
      console.log(`[agent.thinking] ${truncate(text, 200)}`);
      return;
    }
    case 'agent.message': {
      const text = ev.content?.text ?? ev.text ?? ev.content ?? '';
      console.log(`[agent.message] ${truncate(text, 500)}`);
      return;
    }
    case 'agent.custom_tool_use': {
      const name = ev.name ?? ev.tool_name ?? ev.tool?.name ?? 'unknown';
      const input = ev.input ?? ev.tool?.input ?? {};
      console.log(
        `[agent.custom_tool_use] name=${name} input=${truncate(input, 300)}`,
      );
      return;
    }
    case 'agent.tool_use': {
      const name = ev.name ?? ev.tool_name ?? 'unknown';
      console.log(`[agent.tool_use] name=${name}`);
      return;
    }
    case 'span.model_request_end': {
      const mu = ev.model_usage ?? {};
      const i = mu.input_tokens ?? 0;
      const o = mu.output_tokens ?? 0;
      const cr = mu.cache_read_input_tokens ?? 0;
      const cw = mu.cache_creation_input_tokens ?? 0;
      console.log(`[span.model_request_end] tokens=${i}/${o}/${cr}/${cw}`);
      return;
    }
    case 'session.status_idle': {
      console.log(`[session.status_idle]`);
      return;
    }
    case 'session.status_terminated': {
      console.log(`[session.status_terminated]`);
      return;
    }
    case 'session.status_running': {
      console.log(`[session.status_running]`);
      return;
    }
    default: {
      const keys = ev && typeof ev === 'object' ? Object.keys(ev) : [];
      console.log(`[unknown-event: ${type}] keys=${JSON.stringify(keys)}`);
      return;
    }
  }
}
