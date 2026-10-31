# theme2d — Plain 2D theme (id `plain`)

Aaron: "Can we get a 2d theme with traditional looking easy to recognise pieces? You know... a boring theme :)"

## Done
- `js/themes/plain/`
  - `art.js` — **original** piece art (my own SVG path strings in a 100-unit box, chess-site Staunton
    style; not derived from cburnett/merida). `drawPiece(ctx, type, color, x, y, size)` and
    `pieceDataURL(type, color, px)` for DOM use (e.g. a promotion picker).
    White = white fill + dark outline + dark inner lines; black = near-black fill + light inner lines.
  - `pieces.js` — each piece is one flat quad (2 tris) textured from ONE 1920×640 canvas atlas, one shared
    unlit material (toneMapped off). 12 instanced draw calls, no shadows, no contact blobs.
  - `board.js` — flat green/cream squares (#ebecd0 / #739552), chess-site coordinates inside the edge
    squares (flipped for black), no frame, no scenery, ambient-light-only rig, yellow highlight style.
    1 draw call.
  - `anims.js` — moves: `slide` (weight 3) / `glide` (faint lift), 120–220 ms. Battles: `fade` / `pop`,
    ~260–360 ms at 1×, on the battle timeline (speed 1/2/5×, tap-skip), `battle_util.prep` for D24 caps,
    no sfx (board's capture click plays). Hooks: `captureAnim` (battles Off), `castleAnim`, `promoteAnim`.
  - `sounds.js` — muted wooden clicks (move/capture/castle), Classic's music.
- Registry lines: `js/themes/index.js` (`plain`), `js/app/themes-meta.js` (picker entry "Plain 2D").
- Small board hooks (all opt-in, other themes unchanged):
  - `theme.board.view: 'top'` — camera fixed. `camera.preset()` / V / `cycle()` remember the user's view
    but don't move the camera and don't emit `view` (so the saved `view` setting is NOT overwritten);
    switching to another theme restores it (and emits `view`). New getter `board.camera.fixed` → `'top'|null`.
  - `theme.board.pixelRatio: 3` — render up to DPR 3 for this theme (cheap: ~15 draw calls, 66 tris).
  - `pieces.facing.view: true` — icon yaw follows the board orientation (upright for black too);
    `PieceSet.setView()` called from `setOrientation`.
  - `pieces.contact: false` — hides the contact blob.
  - `theme.castleAnim(ctx)`, `theme.captureAnim(ctx)` (ctx.piece = victim), `theme.promoteFx: false`
    (no sparkles/flash/ring/spin on promotion).
- `tools/theme2d_preview.html` — the art on both square colours, large and small.

## Verified
- Gallery (play/lineup, phone 390×844 DPR 3 and 1440×900), bot game in the app (white + flipped),
  puzzle as black, settings picker card. Zero console errors.
- `board_test.mjs` 18/18 (classic). Same test pointed at `theme=plain`: 14/18 — the 3 view-cycle/orbit
  checks fail **by design** (fixed Top), and "battle skippable" fails only because the plain battle is
  already over at the test's 300 ms probe.
- `board_game_test.mjs` 14/14, `board_ambient_test.mjs` 13/13, `board_perf.mjs classic,plain top`:
  plain rest 0 fps (no idle frames), 15 draw calls, 66 tris; animating 60 fps.

## Requests (ui-4, files I did not touch)
- game.js / online_game.js / puzzles: when `board.camera.fixed` is set, show the View button as "Top"
  and disable or hide it (now it keeps showing the saved view label, e.g. "Tilt", and does nothing).
  Re-run `syncViewBtn()` on theme change.
- `ui.js promotionPicker` uses unicode glyphs; it could show the theme's art via
  `import { pieceDataURL } from '../themes/plain/art.js'` when `board.theme === 'plain'`.
- Overlays are created once with the FIRST theme's `overlayStyle` (board.js `if (!overlays)`), so the
  plain highlight colours only apply when Plain is the first theme loaded. Harmless (classic defaults are
  similar yellow); board owner may want to restyle on theme change.

## Open
- Board leaves the rig's small fit margin around the board (same as other themes).
