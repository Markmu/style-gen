# The Precision Frame

> Canonical UI and UX implementation manual for Visoryn.

## 1. Creative North Star

Visoryn is a quiet professional instrument for the Reference -> Evidence -> Render workflow. The interface frames source imagery, model evidence, user edits, and render readiness without competing with them.

The design should feel precise, calm, transparent, and editorially clear. Familiar product controls are a feature. Distinctive character comes from typography, image composition, restrained asymmetry, and excellent state design, not decorative effects.

## 2. Physical Scene And Theme

The default scene is a visual creator reviewing images, evidence, and prompt variables for a long session. A bright studio needs low-glare cool neutrals; a dim editing room needs a smoke-toned dark equivalent with the same hierarchy.

Light and dark are both complete page themes. The shared theme control offers Follow system, Light, and Dark. Follow system resolves from `prefers-color-scheme`; explicit choices override the operating system and persist across routes and reloads. Apply the resolved mode through `data-theme` on the root element so every surface consumes the same semantic tokens. Do not invert individual sections or mix themes inside a page.

Place the theme control beside authentication in the Landing header and above authentication in the Workspace sidebar. Use the same control, labels, and behavior everywhere.

## 3. Color Strategy

Use a restrained product palette:

- Cool tinted neutral surfaces define structure.
- Electric Blue (`--accent-primary`) is the only functional accent. Use it for primary actions, selection, focus, and active navigation.
- Evidence facet colors and semantic success, warning, error, and info colors communicate data or state only. They are not decorative accents.
- Media may contain any source-image colors. Media colors do not become interface colors.

All colors must consume semantic OKLCH tokens from `src/app/globals.css`. Do not add raw grays, isolated Tailwind color families, pure black, or pure white in page code.

## 4. Surface Hierarchy

Use three stable surface roles:

1. `--surface-page`: application canvas.
2. `--surface-panel`: persistent content regions such as Workspace columns and Style Memory cards.
3. `--surface-floating`: controls or surfaces that genuinely sit above content, including menus, dialogs, the sticky landing header, and transient status messages.

Prefer tonal layering to cards. A border is allowed when it communicates a real component boundary. Use only 1px ghost borders based on `--border-static` or `--border-interactive`.

Glass is an exception, not the base material. `backdrop-filter` belongs on content overlays, dropdowns, dialogs, and sticky chrome only. Persistent panels should use an opaque or nearly opaque semantic surface. Do not nest glass surfaces.

Shadows must be cool-tinted and diffuse. Persistent panels receive an inner highlight and little or no cast shadow. Floating surfaces may use `--shadow-ambient`.

## 5. Typography

- Use Geist through `next/font` as the single interface and display family.
- Use Geist Mono only for technical labels, prompt code, and machine-readable metadata.
- Keep the browser root at 16px. Never scale the entire application through `html { font-size }`.
- Product UI uses a fixed rem scale with a tight hierarchy. Marketing headlines may use a larger fixed scale at explicit breakpoints.
- The `/workspace` workbench uses a compact fixed scale: 1rem for page-level UI headings, 0.9375rem for emphasized panel copy, 0.8125rem for standard controls and body copy, and 0.75rem for supporting metadata. Do not apply this compact scale to Landing or Style Memory.
- Marketing and prose body text is at least 0.875rem with 1.5 or greater line height. The compact Workspace UI may use the 0.8125rem standard-control size defined above; long-form descriptions within it remain at least 0.875rem. Long prose is limited to 65-75 characters.
- Headings rely on weight, tracking, and spacing. Do not introduce a second display family.
- Technical labels use 0.6875rem, 650 weight, 0.14em tracking, and uppercase. Use them sparingly.

Visible copy uses regular hyphens only. Do not use em dashes, en dashes as separators, or repeated middle-dot metadata chains.

## 6. Shape, Spacing, And Layout

Shape rules:

- Cards and major panels: 1rem radius.
- Controls and buttons: 0.75rem radius.
- Pills: only chips, tags, avatars, and genuine segmented controls.

Spacing rules:

- Marketing sections vary vertical rhythm from 5rem to 8rem.
- Product panels use compact, repeatable spacing from 0.5rem to 1.5rem.
- Do not place every region inside a card. Use open page space and tonal grouping when elevation adds no meaning.

Layout rules:

- Landing uses an asymmetric split hero with one message and a real visual.
- Workspace preserves the three responsibilities: Reference Canvas, Style Intelligence, and Prompt + Render.
- Style Memory prioritizes previews, then name, variables, tags, reuse intent, and action.
- Below 768px, marketing layouts become one column. Workspace remains a horizontally navigable professional canvas until a dedicated mobile editing flow exists; do not silently squeeze all three columns into the viewport.
- Full-height application shells use `100dvh`, never `100vh` or `h-screen`.

## 7. Components And States

### Buttons

- `.btn-primary`: solid Electric Blue, high-contrast text, subtle inner highlight, restrained tinted shadow.
- `.btn-secondary`: `--surface-floating`, ghost border, no blur unless it overlays content.
- Buttons move by at most 1px on hover and return on active.
- Every button needs default, hover, focus-visible, active, disabled, and loading behavior.
- Keep button labels on one line. Reuse one label for one intent.

### Inputs

- Labels appear above controls. Placeholder text never replaces a label.
- Use `.input-precision` or `.style-memory-search` before creating page-specific input styles.
- Focus uses `--focus-ring`; errors use semantic error tokens. Placeholder, helper, and error copy must remain readable against the control surface.

### Panels And Media

- Use `.surface-panel` for persistent product surfaces.
- Use `.ai-panel` only when a region communicates model output, provenance, or model state.
- Use `.media-lens` and `.style-memory-source` for image seating. Real media is preferred over decorative CSS mockups.
- Empty media surfaces must state what is missing and what remains usable.

### Iconography

- Use Lucide Outline through `AppIcon` only.
- Default icon size is 18px with 1.75px absolute stroke width. Use 16px beside text, 20px in toolbars, and 24px for upload or empty-state illustrations.
- The Visoryn lens mark is the only custom interface symbol.
- Status dots are allowed only when they communicate a real state. Never use them as decoration.

### Motion

- Product transitions run for 150-220ms and communicate feedback or state change.
- Animate transform and opacity only.
- Loading skeletons and progress animation must honor `prefers-reduced-motion`.
- Do not choreograph product page loads or add decorative perpetual motion.

## 8. Evidence Workbench Contracts

Every page should explain what AI has read, what evidence supports the current prompt or render decision, what context remains preserved, and which action is available next.

### Evidence Facets

Evidence facets represent color, composition, lighting, texture, mood, subject, and neutral supporting signals. Use `.evidence-chip` with `data-facet`. A facet includes a short label, confidence or strength only when supplied by the model, a reference anchor when available, and prompt provenance when it explains a prompt phrase.

Consume `--evidence-color-*`, `--evidence-composition-*`, `--evidence-lighting-*`, `--evidence-texture-*`, `--evidence-mood-*`, and `--evidence-neutral-*`. Do not invent facet colors in page code.

### Render Dock Readiness

Render Dock is the visible source for generation readiness. It shows output parameters, busy state, service availability, disabled reason, and the primary render action in one scanning area. Use `.readiness-row` with `data-state="ready" | "waiting" | "blocked" | "processing"` when a full readiness explanation is required.

Disabled generation controls must explain why generation is blocked and what can still be edited or saved.

### Style Memory

Style Memory is the user-facing name for saved prompt templates. Cards prioritize the source image or a clear no-preview surface, then the memory name, derived tags, variable count, reuse intent, and action.

Use `.style-memory-card`, `.style-memory-source`, and `--style-memory-*` tokens. Empty, no-result, auth, and service-limited states use `StatePresenter` rather than a blank grid.

### Status Language

Empty, queued, processing, recoverable failure, auth required, no-result, and service-limited states follow a three-part model:

1. What happened.
2. What context remains preserved.
3. What the user can do next.

Use `failedRecoverable` plus a page override for service unavailability. Do not add a backend-facing status for visual copy alone. `StatePresenter` uses `aria-live="assertive"` for recoverable failures and `polite` for every other state.

## 9. Content And Trust Rules

- Never display invented confidence, provenance, coordinates, account plans, quotas, or usage values.
- Do not build fake screenshots from generic rectangles. Use real product components, real screenshots, generated media, or an explicit empty media surface.
- Do not use generic AI gradients, neon glows, gradient text, decorative glass cards, or identical feature-card rows.
- Preserve route slugs, primary navigation labels, form names, and analytics-sensitive actions unless a separate approved change owns them.
- Visible copy must be direct, grammatical, and consistent with the Reference -> Evidence -> Render vocabulary.

## 10. Required Validation

For changes to layout, typography, color, tokens, or motion:

1. Run adjacent component tests.
2. Run the targeted Playwright visual-regression scenarios at 1440x900, 1280x800, and 390x844.
3. Check landing, Workspace, Style Memory, loading, empty, error, and auth-required states.
4. Check text overlap, horizontal overflow, button wrapping, focus visibility, and reduced-motion behavior.
5. Run `pnpm verify:acceptance` before release-bound handoff.

Use `.surface-panel`, `.ai-panel`, `.btn-primary`, `.btn-secondary`, `.input-precision`, `.evidence-chip`, `.readiness-row`, `.style-memory-card`, and `.status-tone-dot` before adding page-specific classes.
