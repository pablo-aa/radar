import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { fetch as undiciFetch } from "undici";

// Lazy singleton: key is read on first call, not at module load time.
// This keeps `next build` safe in environments where ANTHROPIC_API_KEY is not set.
let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Set it in .env.local before running the Strategist agent.",
    );
  }
  // Use undici's native fetch directly. Next.js patches globalThis.fetch with
  // caching / request memoization behavior that breaks long-lived Managed Agents
  // SSE streams (stream closes after the first few events). Passing undici's
  // fetch bypasses the patched global entirely.
  _client = new Anthropic({
    apiKey: key,
    fetch: undiciFetch as unknown as typeof fetch,
  });
  return _client;
}

export function getStrategistIds(): {
  agentId: string;
  environmentId: string;
} {
  const agentId = process.env.STRATEGIST_AGENT_ID;
  const environmentId = process.env.STRATEGIST_ENVIRONMENT_ID;
  if (!agentId) {
    throw new Error(
      "STRATEGIST_AGENT_ID is not set. Run `npm run strategist:setup` and paste the output into .env.local.",
    );
  }
  if (!environmentId) {
    throw new Error(
      "STRATEGIST_ENVIRONMENT_ID is not set. Run `npm run strategist:setup` and paste the output into .env.local.",
    );
  }
  return { agentId, environmentId };
}

/** Typed error thrown when required env vars are absent. */
export class StrategistNotConfiguredError extends Error {
  readonly code = "strategist_not_configured";
  constructor(message: string) {
    super(message);
    this.name = "StrategistNotConfiguredError";
  }
}
