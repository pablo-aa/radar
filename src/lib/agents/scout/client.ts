import "server-only";

// Reuse the lazy singleton Anthropic client from the Strategist module.
// Both agents share the same API key and undici-backed client instance.
export { getAnthropicClient } from "@/lib/agents/strategist/client";

export function getScoutAgentIds(): {
  agentId: string;
  environmentId: string;
} {
  const agentId = process.env.SCOUT_AGENT_ID;
  const environmentId = process.env.SCOUT_ENVIRONMENT_ID;
  if (!agentId) {
    throw new ScoutNotConfiguredError(
      "SCOUT_AGENT_ID is not set. Run `npm run scout:setup` and paste the output into .env.local.",
    );
  }
  if (!environmentId) {
    throw new ScoutNotConfiguredError(
      "SCOUT_ENVIRONMENT_ID is not set. Run `npm run scout:setup` and paste the output into .env.local.",
    );
  }
  return { agentId, environmentId };
}

/** Typed error thrown when required env vars for Scout are absent. */
export class ScoutNotConfiguredError extends Error {
  readonly code = "scout_not_configured";
  constructor(message: string) {
    super(message);
    this.name = "ScoutNotConfiguredError";
  }
}
