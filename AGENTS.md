# AGENTS.md

This file is the project-level entrypoint for coding agents working in this repository.

## Project Overview

style-gen is a visual style extraction and recreation workbench. The current product loop is **Reference → Evidence → Render**:

1. Upload a reference image directly to Cloudflare R2 with a pre-signed URL.
2. Analyze observable content and transferable style into a versioned `VisualRecipe`.
3. Expose evidence, confidence, variables, invariants, and derived prompts for user review.
4. Generate a new image while preserving editable context and recovery paths.

The AI pipeline supports multiple providers. The repository defaults to Replicate for vision, structuring, and image generation; Gemini and fal.ai remain supported alternatives selected through environment variables.

## Runtime and Fresh Start

Project runtime is pinned by `.node-version` and `package.json`:

- Node.js `25.9.0`
- pnpm `11.11.0`
- Docker with Compose v2 for local PostgreSQL

From a fresh clone:

```bash
pnpm doctor
pnpm install --frozen-lockfile
# If no local environment file exists, copy .env.example to .env.local and fill the selected live-provider credentials.
pnpm db:up
pnpm db:push
pnpm dev
```

Before the first browser test run:

```bash
pnpm exec playwright install chromium
```

`pnpm doctor` checks the pinned Node/pnpm versions, project manifests, local environment-file presence, and Docker Compose syntax. It intentionally does not contact external providers, inspect credential values, start PostgreSQL, or install browsers.

## Commands

```bash
pnpm dev              # Start the Next.js development server
pnpm build            # Create the production build
pnpm start            # Start the production build
pnpm doctor           # Diagnose local toolchain and Compose readiness

pnpm verify           # Alias for the fast repository gate
pnpm verify:fast      # Workflow contract + type + lint + unit/component tests
pnpm verify:full      # Fast gate + build + stable critical-path browser smoke suite
pnpm verify:acceptance # Fast gate + build + complete current targeted acceptance/visual suite
pnpm workflow:check   # Validate workflow docs, contracts, evidence links, and mirrors

pnpm type-check       # TypeScript production-source checking
pnpm lint             # ESLint
pnpm test             # Unit and component tests (Vitest)
pnpm test:watch       # Vitest watch mode
pnpm test:coverage    # Unit-test coverage
pnpm e2e              # Full Playwright suite; starts configured web servers
pnpm e2e:smoke        # Stable blocking browser checks used by CI
pnpm e2e:targeted     # Current AI-first acceptance and visual-regression suite
pnpm e2e:ui           # Playwright UI mode
pnpm e2e:report       # Open the last Playwright HTML report

pnpm db:up            # Start local PostgreSQL
pnpm db:down          # Stop local PostgreSQL
pnpm db:reset         # Destroy the local volume and recreate PostgreSQL
pnpm db:logs          # Follow PostgreSQL logs
pnpm db:generate      # Generate a Drizzle migration from schema changes
pnpm db:push          # Apply the current schema to a local development database
pnpm db:studio        # Open Drizzle Studio
```

Run one unit file with `pnpm vitest --run <test-file>`. Run one browser spec with `pnpm e2e -- <spec-file> --project=workspace`.

## Environment Modes

`.env.example` is the canonical variable inventory. Do not read or print credential values during routine diagnosis.

- Mocked unit/component and targeted workspace E2E checks do not require live AI or storage credentials.
- Live application flows require `DATABASE_URL`, the `R2_*` variables, and Auth.js configuration.
- Default Replicate flows require `REPLICATE_API_TOKEN`; webhook delivery additionally requires `REPLICATE_WEBHOOK_SECRET` and `WEBHOOK_BASE_URL`.
- Gemini/fal.ai flows require selecting `VISION_PROVIDER`, `STRUCTURER_PROVIDER`, and `IMAGE_GEN_PROVIDER`, then supplying `GEMINI_API_KEY` and/or `FAL_KEY`.

## Architecture and Canonical Context

Use these owners in priority order:

1. `PRODUCT.md` — current product purpose and product-level invariants.
2. `docs/design/DESIGN.md` — canonical UI/UX system, “The Precision Frame”.
3. The latest numbered PRD/architecture/implementation-plan chain under `docs/` for the scoped feature.
4. Current executable contracts: `src/lib/ai/providers/index.ts`, `src/lib/db/schema.ts`, API route handlers, and committed Drizzle migrations.
5. `docs/backup/` — historical context only; never treat it as current truth without confirming the executable owner.

There is no active `docs/01-1-架构文档-参考图风格再创作.md` at the repository root. Do not infer an ADR or data contract from that retired path.

### Backend API

All API routes live under `src/app/api/`:

- `upload/presign/` — R2 pre-signed upload URLs
- `analysis/` and `analysis/[id]/` — create and poll analysis tasks
- `generation/` and `generation/[id]/` — create and poll generation tasks
- `templates/` and `templates/[id]/` — Style Memory/template CRUD and duplication
- `webhooks/replicate/` — Replicate completion callbacks
- `auth/[...nextauth]/` — Auth.js routes

### AI Pipeline

- `src/lib/ai/providers/` — provider interfaces, factory, and Gemini/Replicate/fal implementations
- `src/lib/ai/models.json` — model→provider mapping SSOT: each model binds multiple providers (each with its provider-side model id) plus one default binding; loaded and validated by `src/lib/ai/model-config.ts`
- `src/lib/ai/model-config.ts` — stage resolvers (`resolveImageGenModel` / `resolveVisionModel` / `resolveStructurerModel`) and the client-safe model catalog (`IMAGE_GEN_MODEL_OPTIONS`); `*_PROVIDER` env vars act as overrides only when the selected model supports that provider
- `src/lib/ai/structurer.ts` — semantic structuring orchestration
- `src/lib/ai/prompts.ts` and `structured-output-schema.ts` — model contracts
- `src/lib/prompt-composer.ts` — deterministic prompt derivation

### Data and Async Work

- `src/lib/db/schema.ts` and `drizzle/` own the current database shape.
- `src/lib/repositories/` owns persistence boundaries.
- Long-running tasks use database polling: `pending → processing → completed | failed`.

## Change-to-Validation Routing

Run the smallest relevant checks after the last edit, then escalate with risk:

| Change | Required focused evidence | Repository gate |
| --- | --- | --- |
| Documentation, workflow contract, Skill, or project rule | `pnpm workflow:check` and `pnpm test:workflow` | `pnpm verify:fast` before handoff |
| Library, hook, provider, repository, or API behavior | Adjacent Vitest file(s), including negative/recovery cases | `pnpm verify:fast` |
| React component or interaction state | Adjacent component test; add/update targeted Playwright coverage for user-observable behavior | `pnpm verify:fast`; targeted E2E when behavior changed |
| Layout, styling, typography, color, or motion | Component assertion plus targeted visual-regression spec; follow `docs/design/DESIGN.md` | `pnpm verify:acceptance` |
| Database schema or migration | Schema/repository tests, generated migration review, and disposable local DB apply/reset evidence | `pnpm verify:fast` plus the scoped DB check |
| Cross-cutting change | All affected focused checks | `pnpm verify:full` |
| Release-bound UI or workflow change | Complete targeted acceptance and visual suite | `pnpm verify:acceptance` |

Do not use an old review document or an earlier green run as evidence for the final edited state.

## Workflow and Delivery Assets

- `.agents/contracts/workflow-schema.json` is the single project workflow-contract SSOT.
- `.claude/contracts/workflow-schema.json` is a compatibility mirror and must remain structurally identical.
- `.agents/skills/`, when installed in the workspace, contains the local project workflow Skills. These local packages are not versioned; provider-specific copies may differ in implementation, but both must consume the versioned `.agents` contract.
- `pnpm workflow:check` validates contracts, active plan state, required sections, evidence links, and forbidden cross-provider owner references.
- `.github/workflows/ci.yml` is the repository CI entrypoint and runs the same project-owned verification commands used locally.

Pull requests block on `verify:fast`, production build, and `e2e:smoke`. A manual CI `workflow_dispatch` additionally runs the complete targeted suite as the strict release-acceptance gate. If `verify:acceptance` is red, the affected implementation plan must remain `in_review` and release-readiness must not claim acceptance.

The full document-driven path is PRD → architecture → implementation plan → red E2E → implementation → green E2E → task review → UAT → release readiness → post-release check. Lightweight `workflow_type: new-feature` specs go directly from approval to `implementer` and do not enter the full plan path.

Release Skills provide the checklist and evidence contract; they do not by themselves prove deployment, production health, approval, or rollback. Bind release evidence to the actual deployment target and current revision before marking a plan `released`.
