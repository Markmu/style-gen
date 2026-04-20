# Design System Specification: The Precision Frame
 
## 1. Overview & Creative North Star
This design system is built on the philosophy of **"The Digital Surgeon."** In a landscape of over-saturated AI tools, this system acts as a high-end, quiet workspace. It does not compete with the user’s creativity; it provides the precise, stable ground upon which that creativity is built.
 
**The Creative North Star: Silent Authority.**
We break the "template" look by favoring intentional asymmetry and tonal depth over rigid grids and heavy borders. The UI should feel like a custom-machined piece of hardware—cold to the touch, perfectly balanced, and utterly reliable. We achieve this through "Atmospheric Layering," where depth is communicated through light and shadow rather than structural lines.
 
---
 
## 2. Colors & Surface Logic
The palette is a sophisticated "Deep Dark" range. We avoid pure `#000000` to prevent "ink-smear" on OLED screens and to allow for "Negative Depth" (surfaces that appear to go deeper than the base).
 
### The "No-Line" Rule
**Prohibit 1px solid borders for sectioning.** 
Structural boundaries must be defined solely through background color shifts. A `surface-container-low` section sitting on a `surface` background creates a natural, sophisticated break that is felt rather than seen. Lines are "visual noise"; tonal shifts are "visual harmony."
 
### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Each level of nesting should move one step up or down the tier scale:
- **Base Layer:** `surface` (#131315) - The primary canvas.
- **Sunken Elements:** `surface-container-lowest` (#0e0e10) - Used for input fields or "wells" to imply data entry.
- **Raised Elements:** `surface-container` (#201f22) up to `surface-bright` (#39393b) - Used for modals and floating panels.
 
### The Glass & Signature Texture Rule
- **Functional Glass:** For floating command bars (Raycast-style), use `surface-container-highest` at 80% opacity with a `24px` backdrop-blur.
- **The Indigo Pulse:** Use `primary` (#c0c1ff) sparingly. It is a surgical laser—only used to highlight the current point of focus or a primary action.
 
---
 
## 3. Typography
We utilize a clean, modern sans-serif stack (Inter/Geist) to convey technical precision.
 
| Token | Size | Weight | Intent |
| :--- | :--- | :--- | :--- |
| **display-md** | 2.75rem | 600 | Editorial moments; low tracking (-0.02em). |
| **headline-sm** | 1.5rem | 500 | Section anchors; clear and authoritative. |
| **title-sm** | 1rem | 600 | High-contrast labels for professional tools. |
| **body-md** | 0.875rem | 400 | Standard UI text; increased line-height (1.6) for legibility. |
| **label-sm** | 0.6875rem | 500 | Monospace-style utility; all-caps with +0.05em tracking. |
 
**Editorial Hierarchy:** Use `display-md` for empty states or hero headers, paired with `body-lg` in `on-surface-variant` color to create a high-end magazine feel.
 
---
 
## 4. Elevation & Depth
 
### Tonal Layering
Depth is achieved by stacking `surface-container` tiers. 
- **Example:** A sidebar uses `surface-container-low`, the main content uses `surface`, and a property inspector uses `surface-container-low`. This creates a "Valley" effect where the workspace feels like the most important, recessed area.
 
### Ambient Shadows
Avoid traditional "Drop Shadows." Use **Ambient Glows**:
- **Floating Modals:** Shadow color `on-surface` (#e5e1e4) at **4% opacity**, 32px blur, 0px offset. This mimics a soft object blocking ambient light, rather than a harsh spotlight from above.
 
### The "Ghost Border" Fallback
If accessibility requires a border, use the **Ghost Border**:
- `outline-variant` (#464555) at **15% opacity**. It should be almost invisible, appearing only as a slight sharpening of the edge.
 
---
 
## 5. Components
 
### Buttons
- **Primary:** `primary-container` background with `on-primary-container` text. Corner radius: `md` (0.375rem). No border.
- **Secondary:** Transparent background with a `Ghost Border`. Text color: `on-surface`.
- **Tertiary:** Pure text using `label-md` specs. Subtle background shift to `surface-variant` on hover.
 
### Input Fields
- **Styling:** Use `surface-container-lowest` for the background to create a "recessed" look. 
- **Focus State:** 1px `primary` border. No "outer glow" rings; keep it surgical and sharp.
 
### Cards & Lists
- **The No-Divider Rule:** Forbid 1px dividers between list items. Use vertical whitespace (Spacing `3`: 1rem) or subtle background shifts on hover to separate items.
- **Padding:** Use generous internal padding (Spacing `4` or `5`) to let the "Interface as a Frame" principle breathe.
 
### The "Tool-Dock" (Special Component)
A floating horizontal container at the bottom of the viewport. 
- **Style:** `surface-container-highest` at 85% opacity, `xl` radius (0.75rem), `20px` backdrop blur. This houses the Lucide-style minimalist icons.
 
---
 
## 6. Do's and Don'ts
 
### Do
- **Do** use `on-surface-variant` (#c7c4d8) for secondary text to maintain a low-contrast, calm environment.
- **Do** use sharp `none` or `sm` corners for technical data visualizations to emphasize precision.
- **Do** lean on the Spacing Scale (especially `10`, `12`, and `16`) to create "luxurious" gaps between functional groups.
 
### Don't
- **Don't** use pure white for text. It vibrates against deep dark backgrounds. Always use `on-surface` (#e5e1e4).
- **Don't** use "Rainbow" status colors. If an AI process is "Success," use a subtle `secondary` tone, not a bright neon green.
- **Don't** use heavy gradients. A 2% vertical tint is the maximum allowed to prevent the UI from looking dated.