# The Design System: Implementation Manual

> Source: Stitch `Precision Glass` reference, using the `Aether Glass` light design system / "The Ethereal Lens" direction.
 
## 1. Overview & Creative North Star: "The Ethereal Lens"
The creative north star for this design system is **The Ethereal Lens**. In this paradigm, the UI is not a container, but a precision-engineered pane of glass that clarifies and elevates the content beneath it. 
 
We move away from the "boxy" nature of standard web design by embracing extreme atmospheric depth, high-contrast editorial typography, and intentional asymmetry. This system draws heavy inspiration from the tactile precision of luxury watchmaking and high-end digital productivity tools. Every pixel must feel intentional; every margin must provide "breathing room" that signals premium quality and calm authority.
 
---
 
## 2. Colors & Atmospheric Tones
The palette is rooted in a "High-Value Neutral" philosophy. We utilize a spectrum of whites and soft grays to build structure, reserving the **Electric Blue** (`primary`) for moments of functional intent.
 
### The "No-Line" Rule
Traditional 1px solid borders for sectioning are strictly prohibited. Boundaries between major layout sections must be defined through:
1.  **Background Color Shifts:** A section using `surface-container-low` sitting against a `surface` background.
2.  **Tonal Transitions:** Using subtle shifts between `surface-bright` and `surface-dim`.
 
### Surface Hierarchy & Nesting
Treat the UI as a physical stack of frosted glass. 
- **Base Layer:** `surface` (#f7f9fb).
- **Secondary Content Areas:** `surface-container-low` (#f2f4f6).
- **Interactive Floating Elements:** `surface-container-lowest` (#ffffff) with 15% opacity and a backdrop blur.
 
### The Glass Recipe
To achieve the signature "Linear-meets-Apple" aesthetic, use the following stack for all floating containers:
- **Fill:** `surface-container-lowest` at 10–20% opacity.
- **Backdrop Blur:** Minimum 30px.
- **Inner Glow:** A 1px inner stroke using `outline-variant` (#c2c6d8) at 15% opacity.
- **Signature Glow:** For primary actions, use a subtle gradient from `primary` (#0050cb) to `primary-container` (#0066ff) to add "soul" to the interactable area.
 
---
 
## 3. Typography: Editorial Authority
We utilize **Inter** (or Manrope) with a focus on high-contrast hierarchy. The goal is to make data look like a premium magazine spread.
 
- **Display Scale:** Use `display-lg` (3.5rem) with a `letter-spacing` of `-0.02em` for hero statements. This creates a "tight," professional look.
- **Hierarchy of Importance:** Headlines should use `on-surface` (#191c1e), while supporting body text should use `on-surface-variant` (#424656) to create natural visual weight without needing bold weights.
- **Functional Labels:** Use `label-sm` (0.6875rem) in all-caps with `+0.05em` tracking for micro-copy or categories. This mimics the technical precision of a high-end instrument.
 
---
 
## 4. Elevation & Depth
Depth in this system is achieved through **Tonal Layering** rather than structural shadows.
 
- **The Layering Principle:** To lift a card, place a `surface-container-lowest` element on top of a `surface-container-high` background. The color shift provides enough "lift" for the eye without creating visual noise.
- **Ambient Shadows:** When a "floating" effect is mandatory (e.g., a dropdown or modal), use an ultra-diffused shadow. 
    - *Formula:* `0px 20px 40px rgba(25, 28, 30, 0.06)`. The shadow must be tinted with the `on-surface` color to feel natural.
- **The Ghost Border:** If a boundary is required for accessibility, use a "Ghost Border"—the `outline-variant` token at 10% opacity. It should feel like a suggestion of a line, not a hard stop.
 
---
 
## 5. Components & Primitives
 
### Buttons
- **Primary:** `primary` (#0050cb) fill with `on-primary` (#ffffff) text. Use `md` (0.375rem) corner radius. Add a subtle 1px top-inner-stroke of white at 20% to simulate a light source.
- **Secondary (Glass):** `surface-container-lowest` at 15% opacity, 30px blur, with a 1px `outline-variant` hairline.
 
### Input Fields
- Avoid full-box borders. Use a `surface-container-highest` bottom-only hairline (1px). 
- Active state: The hairline transitions to `primary` (#0050cb) with a subtle `primary_fixed` outer glow.
 
### Cards & Lists
- **No Dividers:** Forbid the use of horizontal lines to separate list items. Use vertical white space (`spacing-8` or `spacing-12`) or alternating tonal backgrounds (`surface` to `surface-container-low`).
- **Lens Effect:** Images within cards should have a 1px inner-border (`outline-variant` at 10%) to ensure they feel "seated" within the glass UI.
 
### Precision Chips
- Use `full` (9999px) roundedness. 
- Background: `surface-container-high` at 40% opacity. 
- Text: `label-md` for a technical, utility-first appearance.

### Iconography
- Use Lucide Outline for every functional product icon through the shared `AppIcon` component.
- Default to 18px with a 1.75px absolute stroke width. Use 16px beside text, 20px for prominent toolbar actions, and 24px for upload or empty-state illustrations.
- Icons inherit `currentColor`. Express hover, active, disabled, and semantic state through the surrounding control rather than switching to filled icons or adding gradients.
- Keep the custom Visoryn brand mark as the only non-Lucide interface symbol. Status dots, progress rings, confidence meters, and evidence anchors remain data components rather than decorative icons.
 
---
 
## 6. Do's and Don'ts
 
### Do:
- **Embrace White Space:** If a layout feels "crowded," double the padding. Premium design requires "room to breathe."
- **Focus on Hairlines:** Use 1px widths exclusively for any decorative lines. Never use 2px or 3px.
- **Use Intentional Asymmetry:** Align text to the left but allow imagery or secondary data to float with generous, asymmetrical margins to break the "grid template" look.
 
### Don't:
- **Avoid Opaque Grays:** Never use solid #CCCCCC or #888888. Always use the themed neutral tokens (`outline`, `surface-variant`) to ensure the color temperature remains consistent.
- **No Heavy Shadows:** If the shadow is immediately obvious, it is too dark. It should feel like an atmospheric "vibe," not a black smudge.
- **No Generic Gradients:** Avoid "top-to-bottom" dark-to-light gradients. If using a gradient, keep it nearly flat (e.g., a 2% shift in hue/value) to maintain the "quiet" aesthetic.
- **No "Web" Dividers:** Never use `<hr>` style lines to separate content. Use space and color-blocking.

 
---
 
## 7. Director's Closing Note
This design system is about **restraint**. Our goal is to create a digital environment that feels as silent and expensive as a gallery. Trust the typography and the white space to do the heavy lifting. Every time you are tempted to add a border or a shadow, ask if a shift in background tone or a 1px inner glow could achieve the same goal with more elegance.

---

## 8. Phase 12 AI-First Evidence Workbench Appendix

The Phase 12 interface uses the existing Precision Glass foundation to make AI work visible. Every page should explain what the AI has read, what evidence supports the current prompt or render decision, what context is preserved, and which action is available next. The shared contract is Reference -> Evidence -> Render.

### Evidence Facets

Evidence facets represent color, composition, lighting, texture, mood, subject, and neutral supporting signals. Use `.evidence-chip` with `data-facet` whenever a page labels an AI observation. A facet should include a short label, confidence or strength when available, a reference anchor when it points back to the image, and prompt provenance when it explains a prompt phrase. Do not invent decorative facet colors in page code; consume `--evidence-color-*`, `--evidence-composition-*`, `--evidence-lighting-*`, `--evidence-texture-*`, `--evidence-mood-*`, and `--evidence-neutral-*`.

### Render Dock Readiness

Render Dock is the visible source for generation readiness. It must show the readiness list, output parameters, busy state, service availability, disabled reason, and the primary render action in one scanning area. Use `.readiness-row` with `data-state="ready" | "waiting" | "blocked" | "processing"` and the matching `--readiness-*` tokens. Disabled generation controls must explain why generation is blocked and what can still be edited or saved.

### Style Memory Cards

Style Memory is the user-facing name for saved prompt templates. Cards should prioritize the source image or a clear no-preview surface, then the memory name, derived tags, variable count, and reuse intent. Use `.style-memory-card`, `.style-memory-source`, and `--style-memory-*` tokens. Empty, no-result, auth, and service-limited states should use `StatePresenter` rather than a blank template grid.

### Status Language

All empty, queued, processing, recoverable failure, auth required, no result, and service-limited states follow a three-part sentence model:
1. What happened.
2. What context remains preserved.
3. What the user can do next.

This model covers the L1-L5 degradation ladder: queued work over 60 seconds, temporary service unavailability, recoverable analysis or generation failure, auth restriction, and empty or no-result states. `failedRecoverable` plus page override is the default way to describe service unavailability; do not add a new backend-facing status for visual copy alone. `StatePresenter` uses `aria-live="assertive"` for recoverable failures and `polite` for every other state.

### Control Feedback And Phase D Cleanup

Continue to use `.surface-panel`, `.ai-panel`, `.btn-primary`, `.btn-secondary`, `.input-precision`, `.evidence-chip`, `.readiness-row`, `.style-memory-card`, and `.status-tone-dot` before adding page-specific classes. Phase D must remove obvious old-system leftovers: hard structural dividers, isolated SVG text buttons where an icon or normal button is expected, disabled controls without explanation, visible "Template Library" product copy, and old two-pane workspace visuals that conflict with the Evidence Workbench hierarchy.
