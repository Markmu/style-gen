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
pnpm workflow:status  # Derive task status from plan task files

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

Run the smallest relevant checks after the last edit, then escalate with risk. Skill-specific checks supplement rather than replace this table. Reuse a command result only when it covers the same final file state and relevant environment; do not rerun identical checks merely because another Skill takes over:

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

## Autonomy, Clarification, and Approval

- Existing explicit authorization remains valid for the same action, artifact version, and scope across Skill handoffs. Do not ask again merely because the executing Skill changed.
- Execute action requests through their requested deliverable. Status queries and review-only requests remain read-only. A Skill finishing its own role does not finish a broader authorized task: load the next applicable Skill and continue.
- Resolve questions from explicit user input, current task context, and verifiable repository facts first. Ask only when missing information materially changes requirements, acceptance, authorization, or the risk of substantial rework. Use project-consistent defaults for reversible implementation details and state material assumptions. Unanswered optional preferences do not block independent work.
- Preserve explicit approval gates. Approval must cover the actual action or artifact version; silence, elapsed time, successful tests, and a seemingly obvious choice are not approval. Freeze approved requirements and respect explicit ask-first and prohibited boundaries.
- Diagnose and repair ordinary failures within the authorized scope. Pause only the affected work for external blockers, required approval, or repeated attempts without new evidence or progress; continue independent authorized work. Report what remains incomplete and the concrete condition needed to resume.
- File lists identify planned implementation files. New plans should explicitly allow necessary adjacent tests, types, fixtures, and configuration, with changes recorded. Existing explicit restrictions, including an extra-file allowance of “none”, remain binding unless the user changes them; do not infer permission to change public contracts or product scope.

## Workflow and Delivery Assets

- `.agents/contracts/workflow-schema.json` is the single project workflow-contract SSOT.
- `.claude/contracts/workflow-schema.json` is a compatibility mirror and must remain structurally identical.
- `.agents/skills/`, when installed in the workspace, contains the local project workflow Skills. These local packages are not versioned; provider-specific copies may differ in implementation, but both must consume the versioned `.agents` contract.
- `pnpm workflow:check` validates contracts, active plan state, required sections, evidence links, and forbidden cross-provider owner references.
- `.github/workflows/ci.yml` is the repository CI entrypoint and runs the same project-owned verification commands used locally.

Pull requests block on `verify:fast`, production build, and `e2e:smoke`. A manual CI `workflow_dispatch` additionally runs the complete targeted suite as the strict release-acceptance gate. If `verify:acceptance` is red, the affected implementation plan must remain `in_review` and release-check pre must not claim acceptance.

Ordinary scoped work follows requirements → implementation and necessary tests → repository verification → delivery. Full plans follow PRD → architecture → plan → red → implementation with green evidence → independent task review; `doc-review` checks the corresponding document at each required gate. `workflow-orchestrator` owns execution and recovery; there is no separate auto-dev or green-evidence handoff. Component tests use `test-unit component`; visual regression uses `test-e2e visual`. Research, UAT and `release-check pre/post` are invoked when required by the request or plan, not simply because their artifacts are missing.

New plans use `workflow_version: 2`: task-local AC/test/result mapping, actual red/green records and independent review evidence; `pnpm workflow:status` derives status without a manually maintained step table. Existing unversioned plans retain v1 evidence and approval requirements. Never silently migrate away explicit UAT, review or approval gates. The `new-feature` Skill has been removed; ordinary scoped work does not require generating a standalone spec. Existing `workflow_type: new-feature` specs remain supported for compatibility and go directly from explicit approval to `implementer`, without entering the full plan path. Draft specs may be revised as requested, but must be presented for explicit approval before implementation. Keep the required “需求变更” section even for behavior-preserving changes, stating that no product behavior changes.

Release Skills provide the checklist and evidence contract; they do not by themselves prove deployment, production health, approval, or rollback. Bind release evidence to the actual deployment target and current revision before marking a plan `released`.
