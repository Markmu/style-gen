# style-gen AI-first Redesign Brief

Date: 2026-07-02
Scope: Landing, Workspace, Template Library, core Reference -> Recipe -> Render loop
Method: Product Design audit with current-run screenshots, code review, existing design system review

## Evidence

Screenshots captured from `http://localhost:3001` with `AUTH_REQUIRED=false`:

- `01-landing.png`: Landing first page and upload entry
- `02-workspace-empty.png`: Workspace at default browser viewport
- `03-template-library.png`: Template Library with unauthenticated API state
- `04-workspace-wide.png`: Workspace at 1440 x 900

Reference material reviewed:

- `docs/design/DESIGN.md`: The Ethereal Lens / Precision Glass system
- `docs/stitch-reference/precision-glass/landing-page-precision-glass.png`
- `docs/stitch-reference/precision-glass/workbench-precision-glass.png`
- Workspace implementation around `WorkspaceThreeColumnLayout`, `ReferenceCard`, `RecipeCard`, `PromptCard`, `OutputCard`, `HistoryStrip`, and Template Library

Evidence limits:

- API routes for history/templates returned `401` in the local unauthenticated run, so populated history and template-grid states were not screenshot-verified.
- Post-upload, post-analysis, and generation-result states were reviewed from code and prior component structure, not live API evidence.
- Mobile viewport screenshot capture timed out in the in-app browser. Mobile redesign recommendations are based on current layout constraints and source structure.

## Current Diagnosis

The current product already has the right core object model: Reference, Visual Recipe, Prompt, Output, History, Templates. The weakness is not capability. The weakness is that the AI feels like a background processor rather than an active collaborator.

1. Landing is clear but generic.
   The hero explains the workflow, but the headline reads as a category label rather than an AI-native promise. The preview uses constructed UI-like blocks instead of showing the product's strongest concept: an image being understood, decomposed, edited, and re-rendered.

2. Workspace empty state is structurally correct but passive.
   The three columns preserve the mental model, but the empty panels are equal-weight pale blocks. They do not show what the AI will infer, what the user can control, or what success will look like after upload.

3. The primary AI decision is too compressed.
   The `OutputCard` reduces generation readiness, aspect ratio, quality, errors, retry, and the final generate command into a compact bottom toolbar. Its helper text is screen-reader-only, so sighted users get little visible guidance before the most important action.

4. Recipe and prompt are adjacent, not causally linked.
   The UI says the recipe leads to a prompt, but it does not make provenance visible. Users should be able to see which color, lighting, composition, and texture decisions are driving which prompt spans.

5. History is a strip, not a learning loop.
   The current history area is useful once populated, but the empty state does not teach that outputs can be restored, compared, learned from, or saved into reusable style memory.

6. Template Library feels like storage, not AI memory.
   The library has search, cards, source-image preview support, duplicate, delete, and use actions. It needs a stronger concept: saved style recipes grouped by source image, variables, visual DNA, and reuse intent.

7. Responsive behavior needs a different model.
   The desktop three-column grid uses a fixed minimum width and horizontal overflow. That is acceptable for a dense workstation, but mobile should not be a squeezed horizontal table. It should become a stepwise AI flow.

## Redesign North Star

Make style-gen feel like an AI style studio, not a form pipeline.

The interface should keep Precision Glass restraint, but shift the product center from static panels to an AI collaborator that explains what it sees, links evidence to editable recipe decisions, and makes the next render action obvious.

Scene sentence:

A creator is working at a bright desk with a reference image open, trying to preserve style while changing intent. They need calm precision, visible AI reasoning, and fast iteration without feeling trapped in model internals.

Color strategy:

Restrained light product UI. Keep cool high-value neutrals and electric blue as the primary intent color. Use limited semantic micro-colors only for AI facets: color, composition, lighting, texture, risk, and readiness.

## Design Principles

1. AI explains before it asks.
   Empty, loading, ready, and error states should say what the AI is doing and what the user can do next. Avoid generic disabled controls without visible rationale.

2. Every AI claim needs visual evidence.
   A recipe category should point back to the reference image, and prompt text should point back to the recipe category that created it.

3. Generation is a cockpit, not a tiny button.
   Aspect ratio, quality, prompt readiness, unresolved variables, generation availability, and expected output should live near the generate action in a visible Render Dock.

4. Templates are memory, not files.
   A template card should communicate source image, variable shape, last generated output, and what kind of style reuse it supports.

5. The product should progressively disclose complexity.
   First-time users get a guided path. Power users get direct manipulation, keyboard actions, and dense controls once content exists.

## Proposed Information Architecture

Keep the three core workspace concepts, but rename and reframe them:

- Reference Canvas: the source image plus AI-detected visual anchors.
- Style Intelligence: recipe, confidence, facets, warnings, and suggested edits.
- Prompt and Render: editable prompt, variables, output controls, readiness, and generation results.

Move History from a passive bottom strip into an iteration memory layer:

- Desktop: recent renders remain near the render command, but with a clear empty state and comparison affordance.
- Mobile: recent renders appear as a fourth step after Render.

Template Library becomes Style Memory:

- Search remains.
- Add filters for source image, variable count, recent use, and style tags.
- Empty state should offer "Create from current prompt" and "Start from reference image".
- Cards should prioritize source preview and reusable variables, preserving the source-image linkage already added in the codebase.

## Workspace Interaction Model

### Empty

Primary action: upload a reference image.

What the screen should teach:

- The AI will extract color, composition, lighting, texture, and subject treatment.
- The user can edit the prompt before generation.
- A template can be saved with its source reference image.

Suggested UI:

- Reference Canvas shows upload target plus a small "What AI will read" preview list.
- Style Intelligence shows a compact placeholder checklist instead of a blank pale block.
- Prompt and Render shows a disabled Render Dock with visible reason: "Waiting for a reference analysis."

### Analyzing

Primary action: wait, replace, or retry.

Suggested UI:

- Stream analysis facets as they become available: color palette, composition map, lighting, mood.
- Show queueing and service degradation inline in the relevant panel.
- Keep the upload image visible. Do not replace it with a generic spinner.

### Ready

Primary action: review AI interpretation, edit intent, generate.

Suggested UI:

- Reference image gains selectable anchors: palette, subject, light source, texture, composition.
- Style Intelligence categories are clickable.
- Prompt highlights spans generated from each category.
- Render Dock shows readiness, unresolved variables, output params, and generate.

### Editing

Primary action: change intent while preserving style.

Suggested UI:

- Split prompt editor into "Intent", "Style locks", and "Negative constraints".
- Variables show inline chips and a right-side variable inspector.
- "Save as template" remains one visible entry point, but it previews source image linkage and variable list before saving.

### Generating

Primary action: understand progress and avoid duplicate actions.

Suggested UI:

- Render Dock expands into progress mode.
- Show the exact prompt snapshot being rendered.
- Keep the previous result or reference visible to avoid a dead waiting screen.

### Result

Primary action: compare, restore, refine, save.

Suggested UI:

- Result appears beside reference with an adjustable comparison.
- Suggested next actions: refine prompt, generate variation, save template, restore prior output.
- History becomes a visible iteration chain, not just thumbnails.

## Visual Direction

Keep:

- Light Precision Glass base.
- High-value neutral surfaces.
- Blue for primary intent.
- Compact product UI density.
- The left workspace navigation and three-column desktop workbench.

Change:

- Reduce decorative glass on empty content areas. Use glass for controls and important floating layers, not every large blank region.
- Replace equal-weight pale panels with content-specific states.
- Use one icon system consistently. The app currently leans on Material Symbols, so either standardize that fully or migrate deliberately. Do not mix handmade SVGs with icon-font controls.
- Avoid oversized product typography inside work surfaces. Landing can stay expressive; workspace should be tighter.
- Make disabled controls explain themselves visibly, not only via `title` or `sr-only` copy.

## Component Concepts

1. `AiStatusHeader`
   Shows active phase, AI confidence, service availability, and one suggested next action.

2. `ReferenceInsightCanvas`
   Replaces a static image container with reference image, detected anchors, palette chips, and composition overlay toggles.

3. `StyleIntelligencePanel`
   Evolves `RecipeCard` into confidence-scored facets with provenance links.

4. `PromptProvenanceEditor`
   Evolves `UnifiedPromptEditor` to highlight prompt spans that came from recipe categories and variables.

5. `RenderDock`
   Evolves `OutputCard` into a visible generation cockpit with params, readiness, errors, retry, and generate.

6. `IterationMemory`
   Evolves `HistoryStrip` into a recent output chain with empty state, compare, restore, and save actions.

7. `StyleMemoryLibrary`
   Evolves Template Library into a visual memory surface grouped by source image and reusable style variables.

## Recommended Implementation Sequence

1. Redesign workspace empty state and visible AI guidance.
   Lowest risk, highest first impression impact. Preserve current data flow and tests around upload.

2. Promote `OutputCard` into `RenderDock`.
   Make generation readiness visible and move the primary action into the prompt/render context.

3. Add recipe-to-prompt provenance.
   Start with visual highlighting and category click behavior, then deepen into editable style locks.

4. Redesign Template Library as Style Memory.
   Keep existing template APIs and source-image relationship. Add better empty/error states and richer card hierarchy.

5. Rework mobile workspace into step tabs.
   Use Reference, Recipe, Prompt, Render as tabs or a segmented stepper. Avoid horizontal scrolling for the primary workflow.

6. Add visual regression and targeted E2E coverage.
   Cover empty, analysis-ready, generation-ready, result, template empty, and template populated states.

## Acceptance Criteria

- A new user can explain what the AI will do before uploading.
- After analysis, every major recipe category has a visible relationship to the reference image or prompt.
- The generate action visibly explains why it is enabled or disabled.
- History teaches iteration even when empty.
- Template Library communicates source image, variables, and reuse value.
- Desktop preserves the three-column workbench.
- Mobile has no required horizontal scroll for the primary flow.
- Existing template source-image linkage remains intact.

## Product Design Brief For Confirmation

Design task:

Redesign style-gen into a modern AI-first visual style studio, centered on Reference Canvas, Style Intelligence, and Prompt/Render.

Visual lane:

Restrained light Precision Glass, with less decorative blank glass and more evidence-rich AI state surfaces.

Interactivity target:

Full product interactivity for workspace states, template memory, and generation readiness. Visual exploration should happen before code implementation.

Next Product Design step after confirmation:

Generate exactly three visual options for the AI-first workspace direction, then choose one before implementation.
