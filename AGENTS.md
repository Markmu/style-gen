# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

style-gen is a visual style extraction and recreation workbench. Core loop: **Reference → Recipe → Render**.
1. User uploads a reference image (direct-to-R2 via pre-signed URL)
2. Two-stage AI chain extracts a structured Visual Recipe: Vision model (Gemini) analyzes the image → LLM (Gemini) structures the analysis into a `VisualRecipe` JSON
3. User edits the generated prompt, then creates a new image via fal.ai/FLUX

## Commands

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm lint             # ESLint
pnpm type-check       # TypeScript type checking (tsc --noEmit)
pnpm test             # Run all unit tests (Vitest)
pnpm test:watch       # Vitest in watch mode
pnpm e2e              # Playwright E2E tests (auto-starts dev server)
pnpm db:up            # Start local PostgreSQL via Docker
pnpm db:reset         # Reset DB (down -v + up)
pnpm db:generate      # Generate Drizzle migrations
pnpm db:push          # Push schema to DB (drizzle-kit push)
pnpm db:studio        # Open Drizzle Studio
```

Run a single test file: `pnpm vitest --run src/lib/__tests__/r2.test.ts`

## Tech Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4** for styling
- **PostgreSQL** with **Drizzle ORM** (node-postgres driver) + JSONB for recipes; Docker Compose for local DB (port 5433)
- **Cloudflare R2** (S3-compatible) for image storage with pre-signed upload URLs
- **Gemini** (`gemini-3-flash-preview`) for both vision analysis and structural organization
- **fal.ai / FLUX** for image generation
- **TanStack React Query** for async task polling
- **ULIDs** for all entity IDs (lexicographically sortable)
- **Vitest** for unit tests, **Playwright** for E2E

## Architecture

### Backend (API Routes)

All API routes are under `src/app/api/`:
- `upload/presign/` — generates R2 pre-signed URLs for direct client uploads
- `analysis/` — creates analysis tasks; `analysis/[id]/` — polls task status
- `generation/` — creates generation tasks; `generation/[id]/` — polls task status

### AI Pipeline (`src/lib/ai/`)

Two-stage chain (ADR-2):
- `vision.ts` — calls Gemini vision model with the image URL, returns raw analysis text
- `structurer.ts` — calls Gemini LLM to convert raw text into `VisualRecipe` + prompt/negative prompt (JSON mode)
- `image-gen.ts` — calls fal.ai FLUX to generate images from prompts
- `prompts.ts` — system prompts for both stages

### Data Layer (`src/lib/`)

- `db/index.ts` — Drizzle ORM 实例 + PostgreSQL 连接池（懒初始化 Proxy）
- `db/schema.ts` — Drizzle 表定义（assets, analysis_tasks, generation_tasks）
- `r2.ts` — Cloudflare R2 client for pre-signed URLs
- `repositories/` — Repository pattern for `assets`, `analysis_tasks`, `generation_tasks`

### Frontend

- `src/app/workspace/page.tsx` — main workbench page
- `src/components/` — UI components (landing, workspace, providers)
- `src/hooks/` — custom hooks for analysis/generation polling

### Async Processing

Long-running AI tasks use DB-based status polling (no message queue — intentional per ADR-3). Task statuses: `pending` → `processing` → `completed` | `failed`.

## Environment Variables

See `.env.example`: `DATABASE_URL`, `R2_*`, `GEMINI_API_KEY`, `FAL_KEY`.

## Testing Conventions

- Unit tests live in `__tests__/` directories adjacent to source files
- Test pattern: `src/**/__tests__/**/*.test.{ts,tsx}`
- E2E tests in `e2e/` directory, run against `localhost:3000`
- Path alias `@/` maps to `src/` (configured in both tsconfig and vitest)

## Documentation

Architecture and implementation plans are in `docs/`. The architecture doc (`docs/01-1-架构文档-参考图风格再创作.md`) is the source of truth for ADRs and data schemas.

## Design System

`docs/design/DESIGN.md` is the canonical system design specification for all UI/UX work. Before changing visual styling, layout, components, interaction states, typography, color, or motion, read and follow this file.

Design priority order:
1. `docs/design/DESIGN.md` — source of truth for the current visual system ("The Precision Frame")
2. Existing component patterns and tokens in `src/app/globals.css`
3. Older design docs and implementation plans in `docs/`

If older docs or existing UI conflict with `docs/design/DESIGN.md`, prefer `docs/design/DESIGN.md` unless the task explicitly asks to preserve legacy behavior.
