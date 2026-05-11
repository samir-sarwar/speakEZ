# SpeakEZ Deployment Notes

## Local

1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Install frontend dependencies with `npm install`.
4. Start the API with `cd apps/api && go run ./cmd/server`.
5. Start the web app with `npm run dev`.

Set `VITE_DEMO_MODE=true` only when you intentionally want local canned data. Stripe billing and live AI analysis require `VITE_DEMO_MODE=false` plus Supabase auth credentials.

## Supabase

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/seed/001_prompts.sql`.
4. Create a private Storage bucket named `recordings`.
5. Add `VITE_API_URL`, `VITE_SUPABASE_URL`, and `VITE_SUPABASE_ANON_KEY` to Vercel.
6. Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` to Render.
7. In Authentication settings, add the local and production web origins to allowed redirect URLs. If email confirmation is enabled, users must confirm email before logging in.

## Stripe

1. Create a `$5/month` recurring price.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET`.
3. Point the webhook endpoint to `https://YOUR_API_HOST/webhooks/stripe`.
4. Handle subscription events in the API before production payments are enabled.

## AI

1. Add `OPENAI_API_KEY` for transcription.
2. Add `OPENROUTER_API_KEY`.
3. Keep `OPENROUTER_MODEL=openai/gpt-4o-mini` unless testing a different model.

## Production hardening still required

- Replace in-memory API storage with Supabase Postgres queries.
- Implement real Supabase signed upload generation.
- Verify Supabase JWT signatures instead of trusting bearer presence.
- Implement Stripe Checkout, Billing Portal, and webhook state transitions.
- Add OpenAI transcription and OpenRouter structured analysis calls.
