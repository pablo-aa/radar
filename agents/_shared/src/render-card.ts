import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './repo-root.js';

// Shape matches BetaManagedAgentsCustomToolParams in the Anthropic SDK:
// { type, name, description, input_schema }. input_schema only models
// type/properties/required; other JSON Schema keys are not declared and
// will be rejected by the API's strict validator.
export const renderCardToolSpec = {
  type: 'custom' as const,
  name: 'render_card',
  description:
    'Render one card (or one 90-day-plan entry) for the user. Call this once per item produced. The platform persists cards in order of invocation.',
  input_schema: {
    type: 'object' as const,
    properties: {
      section: {
        type: 'string',
        enum: [
          'dated_one_shot',
          'recurrent_annual',
          'rolling',
          'arenas',
          'ninety_day_plan',
        ],
      },
      opportunity_id: { type: 'string' },
      title: { type: 'string' },
      why_you: { type: 'string' },
      fit_score: { type: 'number' },
      source_url: { type: 'string' },
      extra: {
        type: 'object',
        description:
          'Section-specific fields, e.g. deadline, funding_brl, prep_required, next_window, cadence_note, when_to_engage, entry_point, suggested_cadence, week_range, action, unlocks.',
      },
    },
    required: ['section', 'opportunity_id', 'title', 'why_you', 'fit_score'],
  },
};

export interface RenderedCard {
  section: string;
  opportunity_id: string;
  title: string;
  why_you: string;
  fit_score: number;
  source_url?: string;
  extra?: Record<string, unknown>;
}

export function makeRenderCardHandler(runId: string) {
  const outDir = path.join(repoRoot, '.notes/test-b-runs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outFile = path.join(outDir, `${runId}.json`);
  const cards: RenderedCard[] = [];

  return {
    outFile,
    handle(input: RenderedCard): { ok: true; card_index: number } {
      cards.push(input);
      fs.writeFileSync(outFile, JSON.stringify(cards, null, 2));
      const idx = cards.length - 1;
      console.log(
        `[render_card] #${idx} section=${input.section} id=${input.opportunity_id} fit=${input.fit_score}`,
      );
      return { ok: true, card_index: idx };
    },
  };
}
