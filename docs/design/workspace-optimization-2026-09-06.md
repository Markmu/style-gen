# Workspace interaction optimization

## 需求变更

Implementation of the user-approved 2026-09-06 audit plan. The Reference → Evidence → Render loop, three-column desktop layout, existing API/database/storage contracts, prompt compiler, persisted enums and once-only automatic authorization remain intact. Workspace controls and directly opened dialogs use English; user content, model observations and saved names are not translated.

## Delivered behavior

| Area | Change |
| --- | --- |
| Trust and status | Removed inferred Confidence and unprobed Services Ready. Coverage counts actual nonempty evidence dimensions, with a waiting state when absent. Render Dock consumes existing readiness and shows blocking reasons locally. |
| Layout | At xl and above, the right panel has a fixed heading, scrolling editor and fixed Render Dock. Below xl, panels stack vertically. Empty evidence/prompt areas and history use shorter guidance. |
| History | View latest result opens history details; Compare with reference belongs to current-direction results. History thumbnails have distinct sequence/date labels. Detail loading exposes busy/error/retry states, preserves drafts and restores keyboard focus. |
| Editing | Intent/detail remain primary. Content variables precede negative constraints; Style overrides and Structured data are progressive controls. Final Prompt starts with two lines. Existing linked-text editing and full-text replacement protection remain available. |
| Evidence and adjustment | Show in prompt locates evidence without changing retained rules. Location is repeatable, preserves custom full text and does not steal focus during subsequent editing. A single Undo adjustment restores the preceding adjustment state; later edits or direction changes invalidate it. |
| Quick recreate | Model/quality use a local confirmation draft. Cancel writes nothing; confirm atomically applies settings and the authorization snapshot. Armed settings require exiting before editing. Ordinary exit feedback expires; failures/blockers remain visible. |
| Draft save | One page contains the reference, name, optional description and retained-rule summary. Name prefill accepts the workspace display name, then a nonempty style tag, then Untitled style, within the existing 50-character limit. Adjust saved content reveals the existing fields. Iteration representative confirmation is unchanged. |

## Verification scope

- Deterministic V2 fixtures exercise analysis → edit → render → reference comparison → adjust → render, full-text protection, undo invalidation and history recovery. Legacy recipe coverage remains separate in the existing Workspace evidence/render/history suite.
- Component tests cover evidence counts, entry semantics, variable-first ordering, linked/full-text editing, quick confirmation cancellation, name prefill/focus and complete save payloads.
- The new `e2e/workspace-interaction-refinement.spec.ts` covers 1440×900, 1280×800, 1280×720 and 390×844 in both themes with reduced motion. It captures empty, quick confirmation, analyzing, editing, draft save, render error, result and comparison states.
- Shared save regression includes Iterations and Style Memory: representative verification, source associations, failed-save input recovery and duplicate submission protection.
- No live image-generation requests or deployment. API and image delivery use test mocks. Screenshots show fixture images, not a visual-generation quality assessment.

## Validation results and screenshots

Completed on 2026-09-07. `pnpm verify:acceptance` passed on the final application and test state:

| Check | Result |
| --- | --- |
| Workflow contracts and workflow tests | Passed |
| TypeScript | Passed |
| ESLint | 0 errors; 26 non-blocking warnings |
| Vitest | 118 files, 1,217 tests passed |
| Production build | Passed |
| Targeted Playwright acceptance | 160 tests passed (3.9 minutes) |
| Final screenshots | 64 captures: 4 viewports × 2 themes × 8 states |

[Screenshot index](../product-design/workspace-optimization-2026-09-06/README.md) · [Full acceptance log](../product-design/workspace-optimization-2026-09-06/validation.log) · [Validated source/test file hashes](../product-design/workspace-optimization-2026-09-06/validated-files.json)

The unauthenticated browser scenario now explicitly mocks a logged-out session instead of depending on local Auth.js availability. Earlier audit and acceptance records were not rewritten. The pre-existing untracked `.codex/config.toml` was not changed. No deployment was performed.

After recording these results, the documentation handoff is checked again with `pnpm verify:fast`; its [log](../product-design/workspace-optimization-2026-09-06/documentation-validation.log) accompanies this report.
