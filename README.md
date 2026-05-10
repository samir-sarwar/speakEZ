# SpeakEZ

SpeakEZ is a desktop-first daily speaking practice app with prompt-based recording, gamification, premium AI feedback, and export-ready videos.

## Quick Start

```sh
npm install
npm run dev
```

In another terminal:

```sh
cd apps/api
go run ./cmd/server
```

Copy `.env.example` files before running against real services.

## Apps

- `apps/web`: React + TypeScript + Vite frontend.
- `apps/api`: Go REST API.
- `packages/shared`: shared TypeScript types/constants.
- `supabase`: database migrations and seed data.

