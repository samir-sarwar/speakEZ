# SpeakEZ

SpeakEZ is a desktop-first speaking practice application for building a daily habit around short camera-and-microphone reps. Users sign up, choose a prompt type and practice style, record a take in the browser, save or export the video, track streaks and XP, and optionally run transcript-based AI coaching.

The product is intentionally light, playful, and habit-forming. It combines the structure of a daily language-learning loop with practical speaking drills for interviews, storytelling, debates, pitches, timed responses, and freestyle practice.

## What The App Does

SpeakEZ helps a user practice speaking out loud in small, repeatable sessions:

1. A user creates an account or logs in with Supabase Auth.
2. The dashboard shows the user's daily goal, streak, XP, level, weekly minutes, recent takes, badges, and billing state.
3. The practice studio lets the user pick a content type and session style.
4. The browser requests camera and microphone access, runs the selected prep/countdown flow, and records one uninterrupted take.
5. The user reviews the video, saves it to Supabase Storage, exports a watermarked landscape video, or starts again.
6. Saved recordings appear in history, where playback URLs are generated only when the user opens a recording.
7. The AI Coach can transcribe a saved take and return gentle feedback on clarity, structure, pacing, confidence, and concision.
8. Free users get one lifetime AI analysis; premium users unlock additional analyses through Stripe billing.

## Architecture

SpeakEZ is a monorepo with a React frontend, Go API, shared TypeScript domain package, and Supabase database/storage assets.

```text
.
├── apps
│   ├── api                  # Go REST API
│   └── web                  # React + TypeScript + Vite app
├── packages
│   └── shared               # Shared TypeScript types and constants
├── supabase
│   ├── migrations           # Database schema
│   └── seed                 # Prompt seed data
├── docs
│   └── DEPLOYMENT.md        # Deployment checklist
├── render.yaml              # Render API service config
├── vercel.json              # Vercel frontend config
└── package.json             # Root workspace scripts
```

### Frontend

`apps/web` is built with:

- React 18.
- TypeScript.
- Vite.
- Tailwind CSS.
- React Query for server state.
- Zustand for local recorder state.
- Framer Motion for transitions.
- Supabase JS for auth and signed storage uploads.
- lucide-react icons.
- ffmpeg.wasm for browser-side video export.

Important frontend files:

- `apps/web/src/App.tsx`: authenticated app shell, sidebar navigation, view switching.
- `apps/web/src/components/AuthGate.tsx`: signup, login, demo entry, auth state.
- `apps/web/src/components/Dashboard.tsx`: metrics, streaks, recent takes, billing card, badges.
- `apps/web/src/components/PracticeStudio.tsx`: mode picker, recorder flow, review actions, AI panel placement.
- `apps/web/src/components/AiPanel.tsx`: analysis trigger and result display.
- `apps/web/src/components/HistoryPanel.tsx`: session list, signed playback preview, delete action.
- `apps/web/src/components/SettingsModal.tsx`: profile settings, billing, logout.
- `apps/web/src/lib/api.ts`: typed API client and local demo request implementation.
- `apps/web/src/lib/sessionStore.ts`: recorder mode, timing, blob, and review state.
- `apps/web/src/lib/exportVideo.ts`: MP4/WebM export pipeline.

### Backend

`apps/api` is a Go REST API using the standard library HTTP router.

Important backend packages:

- `internal/app`: HTTP routes, request/response types, orchestration.
- `internal/auth`: Supabase JWT verification.
- `internal/store`: Supabase PostgREST client for profiles, sessions, prompts, streaks, badges, usage, and analyses.
- `internal/storage`: Supabase Storage signed upload/download/delete client.
- `internal/billing`: Stripe Checkout, Billing Portal, webhook parsing, and subscription state mapping.
- `internal/ai`: OpenAI transcription and OpenRouter feedback generation.
- `internal/config`: environment loading and defaults.

The API exposes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Health check |
| `GET` | `/me` | Current profile, usage, streak, badges |
| `PATCH` | `/me` | Update display name, timezone, daily goal |
| `GET` | `/prompts/random?type=...` | Fetch a random active prompt |
| `POST` | `/sessions` | Create draft session and signed upload target |
| `PATCH` | `/sessions/{id}/complete` | Mark session uploaded or local-only |
| `GET` | `/sessions` | List recent sessions |
| `GET` | `/sessions/{id}` | Fetch one session with signed playback URL |
| `DELETE` | `/sessions/{id}` | Delete session metadata and stored recording |
| `POST` | `/sessions/{id}/analyze` | Run transcript-based AI analysis |
| `GET` | `/sessions/{id}/analysis` | Fetch saved analysis |
| `POST` | `/billing/checkout` | Create Stripe Checkout session |
| `POST` | `/billing/portal` | Create Stripe Billing Portal session |
| `POST` | `/webhooks/stripe` | Handle Stripe subscription events |

### Shared Package

`packages/shared` contains TypeScript constants and types shared by the frontend:

- Content types and session styles.
- Practice session shape.
- Profile, streak, badge, usage, and AI analysis types.
- Recorder timing presets.
- Freestyle upload limit.

## Data Model

The Supabase schema lives in `supabase/migrations/001_initial_schema.sql`.

Main tables:

- `profiles`: user profile, daily goal, premium state, Stripe IDs, XP, level.
- `usage_limits`: free and premium AI usage counters.
- `prompts`: active prompt bank by content type.
- `practice_sessions`: session metadata, prompt text, duration, storage path, status.
- `ai_analyses`: transcript, scores, feedback, and analysis status.
- `analysis_messages`: reserved for future follow-up chat.
- `streak_events`: per-day practice minutes.
- `badges`: unlocked achievements.

Supabase Row Level Security is enabled for user-owned tables. The Go API uses the service role key for server-side operations and still performs ownership checks by querying resources with the authenticated user ID.

Prompt seed data lives in `supabase/seed/001_prompts.sql` and generates a bank of prompt templates across the supported content types.

## Local Development

### Prerequisites

- Node.js 20 or newer.
- npm.
- Go 1.23 or newer for the API.
- A modern browser with camera/microphone support.
- Optional production services: Supabase, Stripe, OpenAI, OpenRouter.

### Install

```sh
npm install
```

### Run The Frontend In Demo Mode

Demo mode is the fastest way to explore the frontend without external services.

```sh
cp apps/web/.env.example apps/web/.env.local
```

Set:

```env
VITE_DEMO_MODE=true
VITE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Then run:

```sh
npm run dev
```

Demo mode uses local in-browser data. Recording and export work, but live billing and live AI analysis are intentionally disabled.

### Run With The API And Real Services

Copy environment files:

```sh
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Start the API:

```sh
cd apps/api
go run ./cmd/server
```

Start the web app from the repo root:

```sh
npm run dev
```

The frontend defaults to `http://localhost:5173`. The API defaults to `http://localhost:8080`.

## Environment Variables

### Frontend

Defined in `apps/web/.env.local`:

| Variable | Purpose |
| --- | --- |
| `VITE_DEMO_MODE` | `true` bypasses live API/Supabase behavior with local demo data |
| `VITE_API_URL` | Base URL for the Go API |
| `VITE_SUPABASE_URL` | Supabase project URL for auth and signed upload helpers |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |

### API

Defined in `apps/api/.env`:

| Variable | Purpose |
| --- | --- |
| `ADDR` or `PORT` | API listen address |
| `FRONTEND_URL` | Allowed frontend origin and Stripe return URL |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase key for PostgREST and Storage |
| `SUPABASE_JWT_SECRET` | Optional HS256 JWT secret; JWKS can be used with `SUPABASE_URL` |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_PRICE_ID` | Recurring subscription price ID |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `OPENAI_API_KEY` | OpenAI key for transcription |
| `OPENAI_TRANSCRIPTION_MODEL` | Optional transcription model, defaults to `gpt-4o-mini-transcribe` |
| `OPENROUTER_API_KEY` | OpenRouter key for coaching feedback |
| `OPENROUTER_MODEL` | Optional chat model, defaults to `openai/gpt-4o-mini` |
| `TEST_PREMIUM_EMAILS` | Comma-separated emails treated as premium for testing |

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/migrations/001_initial_schema.sql`.
3. Run `supabase/seed/001_prompts.sql`.
4. Create a private Storage bucket named `recordings`.
5. Add local and production frontend URLs to Supabase Auth redirect URLs.
6. Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and either `SUPABASE_JWT_SECRET` or JWKS-compatible auth settings.

## Stripe Setup

1. Create a recurring subscription price, currently intended as `$5/month`.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` for the API.
3. Point a webhook endpoint at `/webhooks/stripe`.
4. Set `STRIPE_WEBHOOK_SECRET`.
5. Listen for checkout completion and subscription create/update/delete events.

The API pins Stripe requests to the `2026-02-25.clover` API version.

## AI Setup

AI analysis requires both:

- `OPENAI_API_KEY` for audio transcription.
- `OPENROUTER_API_KEY` for structured speaking feedback.

The transcription model defaults to `gpt-4o-mini-transcribe`. The feedback model defaults to `openai/gpt-4o-mini` through OpenRouter.

## Common Commands

From the repo root:

```sh
npm run dev
npm run build
npm run lint
npm run typecheck
```

For the Go API:

```sh
cd apps/api
go test ./...
go run ./cmd/server
```

## Deployment

The repository includes deployment configuration for:

- Vercel frontend deployment via `vercel.json`.
- Render API deployment via `render.yaml`.

Production deployment expects:

- The web build command to run from the repo root with `npm run build`.
- The built frontend output at `apps/web/dist`.
- The API service root at `apps/api`.
- Supabase Auth, Postgres, and Storage configured.
- Stripe billing credentials configured.
- OpenAI and OpenRouter credentials configured for live analysis.

Additional deployment notes are in `docs/DEPLOYMENT.md`.

## Privacy And Security Notes

- Users must be authenticated for production app access.
- API session and analysis reads are scoped by authenticated user ID.
- Recordings are private by default in Supabase Storage.
- Playback URLs are signed and short-lived.
- Local-only recordings are never uploaded for analysis.
- AI analysis is based on transcripts only.
- Deleting a saved session removes metadata and, when configured, the storage object.

## Current Limitations

- Demo mode does not call live billing or live AI analysis.
- Export depends on browser support for media APIs, canvas capture, and ffmpeg.wasm; WebM fallback covers some MP4 failures.
- The follow-up chat button in the AI panel is present in the UI, but analysis message chat is not implemented yet.
- Session history currently fetches recent sessions, not a fully paginated archive.
- AI analysis runs synchronously during the API request rather than through a background job queue.
