# ERP Codixia Usage

Design System 2.0 package guide for Open Design agents and reviewers.

## Read Order

1. Read this file first to understand the package contract.
2. Read `DESIGN.md` for visual intent, constraints, and anti-patterns. The
   app-side canonical spec is `apps/web/DESIGN.md` (+
   `apps/web/.impeccable/design.json`) — keep both in sync when tokens change.
3. Paste `tokens.css` (`:root` + `[data-mode='light']` + acento elegido)
   into the first artifact `<style>` block before writing component CSS.
4. Open `components.html` when exact selectors or states matter; it is the
   single fixture with buttons, fields, cards, badges, tabs, table, sidebar,
   dialog and popover recipes.
5. Inspect `preview/` pages for a visual sanity check (colors, typography,
   spacing, buttons, inputs, app shell).

## Design Highlights

- Dark default: `--bg` `oklch(0.13 0.01 260)`, `--surface`
  `oklch(0.18 0.01 260)`, `--fg` `oklch(0.985 0 0)`.
- Light mode: `html[data-mode='light']`.
- Accent: violet by default; rose, emerald, cobalt, amber via
  `html[data-accent='…']`.
- Radius base: controls 8px, nav items 10px, cards/modals 14px.
- Elevation: `--elev-card` < `--elev-raised` < `--elev-popover`.
- Focus ring: 3px `color-mix(accent, transparent 70%)`.

## Do

- Keep token names exactly as declared; only overwrite values per theme.
- Use `--accent` for primary actions, active nav, links, focus and one clear
  focal element per screen.
- Reuse the recipes in `components.html` before inventing new controls.
- Design dark-first, then verify light and `high-contrast`.
- Respect `--tap-target-min` (44px) with coarse pointers.

## Avoid

- Raw hex/rgb values outside the copied `:root` block.
- Decorative gradients, glassmorphism, neumorphism, or hard/colored shadows.
- More than three type sizes on one screen.
- `--radius-pill` on cards or buttons (chips and avatars only).
- Re-implementing permissions or business logic in the UI (see repo
  `AGENTS.md`).
