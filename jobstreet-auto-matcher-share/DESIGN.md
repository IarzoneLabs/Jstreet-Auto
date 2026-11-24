# DESIGN.md — JobStreet Auto-Matcher

## Design Read
Reading this as: Personal Job-Matching Workbench for an industrial/engineering job seeker, in an editorial-precision instrument style (warm paper light mode + deep charcoal dark mode, copper accent, tabular numeric scores), dial **ENERGY 2 / RHYTHM 2 / MOTION 1**.

## Dials
- **ENERGY 2 (Balanced)**: Confident, crisp instrument hierarchy with clear focal point on the ranked job list and match percentage.
- **RHYTHM 2 (Consistent with intentional breaks)**: Asymmetric workspace context strip (7:5 split) above a structured single-column job evaluation feed.
- **MOTION 1 (Hover & focus states only)**: Subtle 150ms color/border transitions; zero endless decorative loops; full `prefers-reduced-motion: reduce` support.

## Palette (2 Core Neutrals + 1 Deliberate Accent)
- **Light Mode**: Canvas `#F7F6F2`, Surface `#FFFFFF`, Subtle `#EFECE6`, Ink `#18181B`, Muted `#52525B`, Border `#DDD9CE`.
- **Dark Mode**: Canvas `#101113`, Surface `#17191C`, Subtle `#1E2126`, Ink `#F4F4F5`, Muted `#A1A1AA`, Border `#2A2D34`.
- **Accent (1 deliberate accent)**: Industrial Copper `#C2410C` (light) / `#EA580C` (dark) for primary CTAs, active controls, and focus rings.
- **Functional Status Colors (WCAG AA >= 4.5:1)**: Forest green (high match / matched skills), ochre (medium match / skill gap), crimson (errors).

## Typography
- **UI Sans**: `Plus Jakarta Sans` (clear Indonesian/English legibility, warm geometric precision).
- **Numeric Mono**: `JetBrains Mono` with `tabular-nums` exclusively for match percentages, job counts, and timestamps.

## Radius & Elevation Scale
- `4px` (`rounded-sm`): Skill tags and engine labels.
- `6px` (`rounded-md`): Buttons, inputs, segmented controls.
- `8px` (`rounded-lg`): Cards, context panels, dialogs.
- **Elevation**: Flat by default with 1px structural hairlines; shadow reserved strictly for the modal dialog surface.
