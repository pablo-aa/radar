# Scout (indexer job)

Scout is Radar's opportunity catalog crawler. It runs as a GitHub Action,
not on Vercel, because Vercel Hobby caps serverless at 300 seconds and
Scout takes 2-5 minutes per batch.

## Trigger manually

1. GitHub repo -> Actions tab -> "Scout (indexer)" -> Run workflow
2. Optional: set a different cost cap (default $2)

## Secrets required

Set these at Settings -> Secrets and variables -> Actions:

- ANTHROPIC_API_KEY
- NEXT_PUBLIC_SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SCOUT_AGENT_ID
- SCOUT_ENVIRONMENT_ID

The Anthropic beta header is set by the SDK automatically.

## Running locally

With .env.local populated:

    npx tsx scripts/scout/trigger-run.ts
    MAX_COST_USD=3 npx tsx scripts/scout/trigger-run.ts
