# ui agent notes

Owns: `js/ui/*`, `css/*`, `tools/ui_kit.html`, `docs/notes/ui.md`. API spec: `js/ui/README.md` (kept accurate).

## DONE (first pass written, not yet screenshot-verified)
- `js/ui/ui.js` facade (importable) — mount injects `css/*.css` + Google Fonts (Michroma + Rajdhani), `--hs` HUD scale from viewport, desktop keys.
- `core.js` (h(), bus, RARITY, stat labels, settings store `heirframe:settings`), `icons.js` (inline SVG set), `portrait.js` (procedural holo/metal busts), `figure.js` (full-body frame schematic).
- `hud.js` + `css/hud.css` — vitals (hex portrait, shield/hull/energy bars with lag, XP), buffs, mission tracker, heat pips, menu buttons, credits count-up, minimap canvas + compass, hit/heal vignette, low-HP pulse.
- `controls.js` + `css/controls.css` — floating joystick (zone = bottom-left 44%, emits `tap` for short taps), attack + 3 skills (conic cooldown) + dodge, keyboard.
- `feedback.js` + `itemcard.js` + `css/feedback.css` — toasts, loot feed + legendary callout, pooled damage numbers (WAAPI), objective marker (edge clamp), interact prompt, item card with compare popover.
- `dialogue.js` + `css/dialogue.css` — letterbox, holo portrait, typewriter synced to VO, choices.
- `panels.js` + `panel_contracts.js`, `panel_warehouse.js`, `panel_codex.js` (family tree auto-layout), `panel_settings.js` (settings + pause) + `css/panels.css`.
- `screens.js` + `css/screens.css` — title, loading, rotate, complete, death.

## IN PROGRESS
- `tools/ui_kit.html` showcase, then headless screenshots at 915x412 + 1280x720 (port 9304).

## NEXT
1. Write ui_kit.html (fake data, `?state=` direct states, trigger buttons).
2. Screenshot every state, fix layout/overflow, iterate on looks.
3. Touch-target audit (>=44px) at 915x412.
4. Reconcile rarity/stat/archetype names with docs/DESIGN.md when the planner writes it.

## Gotchas
- UI root is pointer-events:none; only `.hf-live` elements take input.
- Panels/dialogue/screens add `hf-in-panel` / `hf-in-dialogue` / `hf-in-screen` on the root, which hides HUD+controls.
