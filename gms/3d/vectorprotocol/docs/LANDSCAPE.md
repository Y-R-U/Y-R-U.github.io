# VECTOR PROTOCOL — Landscape + portrait plan (D24)

Owner of this file: the landscape planner. Spec only. Build agents implement it in the work packages below.
Read D3, D24 and D25 in `docs/DECISIONS.md` first. **Portrait stays the primary layout and must not regress.** Landscape is an
additional set of layouts, switched live.

## 0. Today (measured 2026-10-19, CDP 9435, M5 metal)

| Viewport | What happens now |
|---|---|
| 915×412, 844×390 (landscape phone, touch) | The full-screen "Rotate to portrait" hint covers the game. Under the hint is a 232 px column. |
| 1280×800 desktop | A centred 450×800 portrait column. About 65% of the window is dark backdrop. |
| `#app` forced full-width at 915×412 | Battle: the camera's width-fill fit blows the board off-screen (only the stands show), and the 6-card strip takes 147 of 412 px. Formation: the hexes overflow and ENGAGE covers them. Hub: the dock and CONTINUE take ~40% of the height and the labels pile up in the middle. Map: mostly fine. Unit profile: a tiny turntable and the sheet below the fold. |
| `#app` forced full-width at 1280×800 | Battle: the board overflows (near edge 1.06× the width). Hub: reads well already. |

How portrait is enforced today: `css/vp.css` sets `#app` to `min(100vw, 100dvh*9/16)` × `min(100dvh, 100vw*21/9)`, centred over `#backdrop`.
`#rotate-hint` shows on `(orientation: landscape) and (max-height: 500px) and (pointer: coarse)`. `js/app/router.js` has no orientation logic.
The 3D scenes already fit by aspect: battle `camera.js fit()` uses `widthFill`, hub `hub_scene.js frame()` uses `min(a, .75)`. Neither has a wide mode.

Measured unit size (idle 6v6, `battle._bounds()`; target for landscape = portrait):

| View | Pitch | Avg / max unit height |
|---|---|---|
| Portrait 412×915, HUD margins 64/150 | 39.3° | **122** / 165 px |
| Portrait 390×844 | 37.4° | 114 / 152 px |
| Landscape 915×412, current lanes, slot-fit, top 52 | 30° | 103 / 159 px (0.84×) |
| Landscape 915×412, current lanes, top 10 | 30° | 115 / 185 px |
| **Landscape 915×412, compressed lanes (§2.3), top 52** | **30°** | **133 / 193 px (1.09×)** |
| Landscape 844×390, compressed lanes, top 40 | 34° | 122 / 177 px |

The experiment scripts and shots are in the session scratchpad (`land/cam2.mjs`; `cam2_C30.png` is the recommended framing).

---

## 1. Detection and switching (contract: every package follows it)

### 1.1 Breakpoint
- **Landscape** when the visual viewport aspect `w/h ≥ 1.15`. Return to portrait when `≤ 1.05`. The hysteresis stops a desktop window being dragged across ~1.1 from flickering. Phones jump from ~0.45 to ~2.2 on rotation, so for them it does not matter.
- **Form factor** (`data-form`): `phone` if the short side is < 500 px; `tablet` if the short side is ≥ 500 and `(pointer: coarse)`; otherwise `desktop`.
- **Height class**: `l-short` = landscape with `h < 480`. That is every landscape phone (visible height 340–430). Tablets and desktops are `l-tall`.

| Device class | Example CSS px | Aspect | Mode |
|---|---|---|---|
| Phone 19.5:9–20:9 landscape | 915×412, 844×390 | 2.16–2.22 | landscape, l-short |
| Same with browser bars | 915×360 (Chrome), 844×340 (Safari) | 2.5 | landscape, l-short |
| 21:9 phone | 960×412 | 2.33 | landscape, l-short |
| Tablet 4:3 / iPad | 1024×768, 1180×820 | 1.33–1.44 | landscape, l-tall |
| Desktop 16:10 / 16:9 / 21:9 | 1280×800, 1920×1080, 2560×1080 | 1.6–2.37 | landscape, l-tall |
| Near-square desktop window | 1000×900 | 1.11 | stays in whichever mode it was in (hysteresis band); starts portrait |
| Any portrait screen | 412×915, 768×1024 | < 1 | portrait (D3 column, unchanged) |

### 1.2 Root attributes and CSS
- `<html data-orient="portrait|landscape" data-form="phone|tablet|desktop">`, plus the class `l-short` when it applies.
- **All landscape CSS goes in one new file, `css/landscape.css`** (ui-owned), loaded after `screens.css` and `hud_fantasy.css`. Every rule in it is scoped under `html[data-orient=landscape]`. Portrait rules are left alone, so portrait cannot regress through specificity fights.
- In landscape, `#app` becomes full-bleed: `inset:0; width:100vw; height:100dvh; transform:none`, with no box-shadow. `#backdrop` is hidden. Container `app` queries keep working.
- Delete `#rotate-hint` (both the markup and the CSS). There is no rotate nag anywhere.

### 1.3 JS API: `js/app/orient.js` (new, ui)
```js
export const ORIENT = { enter: 1.15, exit: 1.05, phoneShort: 500, short: 480 };
export function createOrient({ getSetting }) // getSetting() -> 'auto' | 'portrait'
  -> { mode, form, short, w, h, on(fn) /* returns off */, refresh() }
```
- It listens to `resize`, `orientationchange` and `visualViewport.resize`, and updates the root attributes **synchronously in the resize handler**. That handler is registered before `createEngine` runs, so the attributes are set before the engine's ResizeObserver refits the scene.
- It fires `fn({mode, form, short, w, h, prev})` and also `dispatchEvent(new CustomEvent('vp:orient', {detail}))`, and exposes `window.__vp.orient`.
- **Setting `settings.layout`**: `'auto'` (default) or `'portrait'`, which forces the D3 column. It appears in Settings only when `form !== 'phone'`. There is no "force landscape" on a portrait screen.
- Dev/test hooks: `?orient=landscape|portrait` forces a mode (for battle_test or hub_test parity). `?insets=t,r,b,l` overrides `--sat/--sar/--sab/--sal`, because CDP cannot easily emulate notches.

### 1.4 How the 3D scenes know: no import, aspect only
- `#app` is either a portrait column (aspect ≤ 0.5625) or the full landscape viewport (aspect ≥ 1.05). So **a scene decides with `wide = w / h >= 1` inside `resize(w, h)`**. That keeps `js/battle`, `js/hub` and `js/map` free of ui imports, and it makes `tools/*_test.html` work standalone.
- `scene.setMargins({top, bottom, left, right})` (CSS px of HUD to keep clear) is the only new channel. Portrait passes left/right as 0 or omits them.
- **Rotation never restarts anything.** Routes, the battle sim, the scene objects, the HUD DOM and open modals all survive a rotation. Only framing and layout change.

### 1.5 Desktop default: D3's column
**Recommendation: desktop and tablet default to landscape (`auto` follows the window aspect).** A 16:9 window gets the wide layouts. "Portrait column" stays available as a Settings option, so the old D3 look is one toggle away and Aaron can test portrait on desktop. The manager should record this as a D24 addendum. D3's "centred portrait column" then applies only to portrait aspects ≥ 9:16 (for example a 768×1024 tablet in portrait) and to the forced setting.

---

## 2. Battle in landscape (packages BATTLE-L and UI-L1)

### 2.1 HUD layout (ui; `.hud` in landscape.css plus small `hud.js` changes)
```
┌──────────────────────────────────────────────────────────────────────────┐
│[≡] [YOUR SQUAD ██████ 100%]  [ROUND 1/3]  [ENEMY ██████ 37%]  [⛶][badge] │ top cluster: 40 px
│┌─────┐┌─────┐                                                   ┌────┐   │
││ far ││ far │                                                   │ ×2 │   │
││back ││front│                                                   ├────┤   │
│├─────┤├─────┤                   3D BOARD                        │AUTO│   │
││ mid ││ mid │       (centred between the side bands)            ├────┤   │
│├─────┤├─────┤                                                   │ 👥 │   │
││near ││near │                                                   │ ⓘ  │   │
│└─────┘└─────┘                                                   └────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```
- **Top cluster** (`.hud-top`): one row, 40 px tall at `top: sat + 6`, `left: sal + 6`, `right: sar + 6`. The integrity panels are each `max-width: 320px` and centred around the round box (58×40). The menu button is 40×40 at the far left. The top-right corner keeps the D25 fullscreen toggle and the br8t badge reservation (`--badge-w`).
- **Player cards** (`.hud-strip` becomes a grid): a **2×3 grid that mirrors the formation**. The back column is on the left and the front column on the right (toward the board). The far lane is the top row and the near lane the bottom row, the same mapping as `scr_formation` (`gridColumn = col===0 ? 2 : 1`, `gridRow = 3 - lane`). The grid sits at `left: sal + 6`, `top: sat + 52`, `bottom: sab + 6`.
  - Card size: `--card-h: clamp(84px, (100dvh - var(--sat) - var(--sab) - 64px - 10px) / 3, 137px)` and `--card-w: calc(var(--card-h) * .7)`. That gives 80×114 at 915×412, 68×97 at 915×360 and 96×137 on tablets and desktop. Every case is at least the portrait card size of 63×90.
  - Unoccupied slots show the existing `.pc-empty` frame. Story-locked slots can't be mapped to a position (slots are a count, not a place), so the grid shows a small caption under it instead: "2/6 slots" with a lock icon.
  - On tall screens (`l-tall`) the grid is vertically centred in the left band.
  - The bottom gradient (`.hud::after`) is replaced by a left gradient behind the grid (width = grid + 24 px) and a narrower right one behind the rail.
- **Right rail** (`.hud-right` + `.hud-left` merged): a vertical stack at `right: sar + 6`, vertically centred. From top to bottom: speed 50×56, auto 50×56, then squad and info at 44×44. Pause stays as the top-left menu button.
- `hud.js` changes: `hud.setMode('portrait'|'landscape')` re-runs `layoutStrip()` with a mode-specific order. Portrait keeps today's centred squad with padding frames. Landscape places each card by slot, using `data-slot` from `u.slotIndex`. **Cards are moved, never rebuilt**, so HP, charge and status state survive a rotation. `scr_battle.js` calls `setMode` from `orient.on`.
- `hud.margins()` always returns `{top, bottom, left, right}`. In portrait: `left = right = 0` (today's top and bottom). In landscape: `top` = top-cluster bottom + 4, `bottom` = `sab + 4`, `left` = grid right edge + 10, `right` = `W` − rail left edge + 10. The existing ResizeObserver also observes the grid.
- Tutorial hints are closed on an orient change (`screens.show` already closes them; also call it from `orient.on`). The Overdrive hint re-anchors to its card.

### 2.2 Camera: `wide` mode (battle; `camera.js`)
Portrait keeps `fit()` exactly as it is (`widthFill` + pitch search). **The portrait framing must stay pixel-identical at 412×915.** When `w/h ≥ 1`, use `fitWide()`:

| Item | Spec |
|---|---|
| Pitch | Fixed by aspect, not searched. **30°** at aspect ≥ 2.0, **34°** at 1.6, **36°** at ≤ 1.4, linear in between. Expose it as `FRAME_WIDE.pitch(aspect)` so it can be tuned. |
| FOV | 40, same as portrait. |
| Fit volume ("slot box", not the floor rectangle) | x ∈ ±(`colX[1]` + 1.6); z from `laneZ[0]` + 2.5 (near plates and the console lip) to `laneZ[2]` + `backShift` − 1.6; y ∈ [0, 4.5] at the far edge (tallest capped boss). Use the active lane profile (§2.3). |
| Vertical fit | Binary-search the distance so the projected box spans `[margins.top + 4, H − margins.bottom − 4]`, then apply the vertical lens shift (`elements[9]`) as today. |
| Horizontal | Centre the box in the free band `[margins.left, W − margins.right]` with a **horizontal lens shift** `shiftX` (`projectionMatrix.elements[8]`). If the box's projected half-width exceeds the free band, increase the distance and re-shift vertically. |
| Backdrop camera | `bgCamera.aspect = W/H`, the same `shiftX` (`elements[8]`), and the seam logic unchanged. **Rule: the seam must project at y ≤ 0.35·H and ≥ `margins.top` − 20.** If it lands lower, raise the pitch by 2° steps (max +6°). |
| Breathing / shake / OD push | Unchanged. Scale by `dist / 27` as now, and keep `shiftX` constant during the push (only `shiftY` eases). |
| Fallback | If `margins.left` and `margins.right` are missing (battle_test without a HUD), centre on the screen. |

Clearance rules (landscape):
- No idle unit bbox (`_bounds()`) may enter the card-grid band or the rail band. **Minimum gap 8 px** at 844×390, 915×360 and 960×412. Portrait only manages 3–5 px today; landscape has room.
- Wide attack anims (BARB, REDLINE whirlwind) may enter the side band by at most 12 px mid-swing. Sample every 60 ms for 15 s, as battle-4 did.
- Far-lane unit heads stay ≥ 4 px below the top cluster.
- The near-rim console may be cropped at the bottom edge in landscape. That is allowed; the near-lane plates may not be cropped.

### 2.3 Lane profile `wide` (battle; `layout.js`, `battle.js`, `board.js`)
Measured above: with today's lanes (3 lattice rows = 7.97 m apart) a landscape phone shows units at 0.84× their portrait size. **Compressing the lanes to 2 lattice rows gets 1.09×.**
- `LANE_PROFILES = { tall: { laneZ: [1.5, -6.467, -14.433], backShift: -3.983 }, wide: { laneZ: [1.5, -3.811, -9.122], backShift: -2.656 } }`. Both are on-lattice (row step 2.656 m), and `wide` keeps the even one-row stagger.
- The floor, barriers, shadow camera and theme geometry do **not** change: the board stays 14×31.66 m. Only homes, plates and rings move.
- `battle.setLaneProfile(name, {animate})`:
  - Recompute each actor's home from `slotPos()` under the profile.
  - Move node, plate and ring with `board.setPlace(side, slot, x, z, k)`, keeping `k`.
  - Re-run `fitBossFootprint` (x-only, so it is cheap).
  - Tween homes over **0.35 s, per actor, only when that actor is idle**. An actor mid-attack, Overdrive or death re-homes when its anim ends (max wait 1.5 s). Projectiles target the unit object, so they follow.
- The profile is picked at `createBattleScene` from the aspect. `resize()` switches it when `wide` flips.
- Fantasy theme: the same profile. The flagstone floor has no lattice, so there is nothing to align.
- Risk: more occlusion between lanes at 30°. If a front-lane XL unit hides a mid-lane unit's HP bar, the overlay already draws bars on top. Tune the pitch to 32° before touching the lanes.

### 2.4 Overlay (battle; `overlay.js`)
- `overlay.setFrame({left, right, top})`: the Overdrive callout, OVERTIME plate and banners centre on the board band, `cx = (left + W − right) / 2`, using a CSS var `--cx` instead of `left: 50%`. `setPlateY` keeps working.
- Damage numbers and HP bars need no change (they are projected).

### 2.5 Engine (battle; `js/engine`)
- Pixel cap: `quality.maxPixels` (high 2.4 Mpx, med 1.6, low 1.0). `engine.resize` lowers the dpr so `w·h·dpr² ≤ maxPixels`. A 1920×1080 window is 3.1× the pixels of the old 607×1080 column. Landscape phones have the same pixel count as portrait.
- Nothing else. `resize()` already passes `(w, h)`.

### 2.6 `tools/battle_test.html` (battle)
- `?wide=1`: full-width `#col`, plus a mock landscape HUD (`top 52 / left 190 / right 74`) when `&hud=1`.
- `?rot=SECONDS`: the page itself swaps `#col` between 412×915 and 915×412 every N s. Use it for soak tests without CDP.

---

## 3. Hub in landscape (packages HUB-L and UI-L1)

### 3.1 Chrome (ui; `scr_hub.js`, `topbar.js`, landscape.css)
- **Topbar**: one row, 40 px. The company box is `max-width: 280px` and, per D25, collapses to just the number after a few seconds. Currencies sit right of centre. The top-right keeps the gear, the fullscreen toggle and the br8t badge reservation.
- **Dock becomes a left rail**: 5 buttons stacked vertically at `left: sal + 8`, `top: sat + 52`, `bottom: sab + 8`, 68 px wide, each `(available − 24) / 5`. That is 64 px tall at 412 and ≥ 56 px at 340. Icon 24 px, label 10 px.
- **CONTINUE**: bottom-right, `right: sar + 12`, `bottom: sab + 12`, `min-width: 260px`, 52 px tall (not `.big`). D25: always visible.
- Hub margins passed to the scene and labels: `{top: 52, bottom: 16, left: sal + 84, right: sar + 12, ctaRect}`. Labels must avoid the CTA rect too.

### 3.2 Framing (hub; `hub_scene.js frame()`)
- `wide` mode (`a ≥ 1`):
  - Pitch 0.74 → **0.66**: a lower aerial view reads as a panorama, and the buildings stand taller.
  - `shift` 0.08 → **0.04**.
  - Fit the distance by **height**, so the platform from the near slab edge to the HQ crown fills `[margins.top, H − margins.bottom]`.
  - Then a horizontal view offset centres the compound in `[margins.left, W − margins.right]`.
- Goal: the compound slab spans **≥ 45% of the width at 915×412 and ≥ 38% at 1920×1080**. The flank skyline fills the rest; the k1 shot at 1280×800 already looks right.
- Pan clamp: `PAN.x` 9 → 14 in wide, since there is more skyline to explore sideways. `PAN.z` is unchanged.
- The rift billboard (`rift.js`) is already aspect-agnostic. Check it stays clear of labels at 2.2:1.
- `scene.setMargins(m)` (new): updates the camera and the labels without a rebuild.

### 3.3 Labels (hub; `labels.js`)
- `OFFSETS_WIDE`: splay labels sideways away from the compound centre instead of stacking them upward. Left-half anchors (workshop, story, recruit) get `[-64, -18]` with the label right-aligned to the anchor. Right-half anchors (arena, events, squad) get `[+64, -18]`. HQ gets `[0, -40]`. Pick the side from the anchor's projected x against the band centre.
- Margins gain `left`, `right` and `avoid: [rect]` (the CTA). The relax loop clamps into them.
- Accept: at 915×412 and 844×390, stages 1–4, all 7 labels are visible with no overlap between labels and none on the rail, topbar or CTA. Leader lines ≤ 120 px.

---

## 4. Story map (packages HUB-L for `js/map` and UI-L1 for the level sheet)

| Item | Portrait (today) | Landscape |
|---|---|---|
| Road band (y) | mid 0.53, amp 0.15 / 0.11 of VH | Inside the free band `[headBottom + 24, VH − ctaH − railH − 20]`: mid = band centre, amp = 0.30 × band height. At 412: band ≈ 94–310 px. |
| Node spacing `sp` | `clamp(80, VW·0.215, 112)` | `clamp(96, VW·0.12, 140)`, so about 7–8 nodes show at 915 and 13+ at 1920. |
| Node size | 52 / elite 58 / boss 76 | Same when VH ≥ 400. When VH < 400, scale with a CSS var `--node-k: .88` (46 / 51 / 67); tags and stars scale with it. Touch target stays ≥ 44 px. |
| Backdrop | covers the height: `bgW = max(VW·1.05, VH·imgAspect)` | `bgW = max(VW·1.25, VH·imgAspect)` so the parallax still has travel. Anchor the image vertically at 0.45 (horizon) instead of 0.5. At 32:9 (3840×1080) that crops about 25% top and bottom, which is acceptable. |
| Head | title row, then the chest bar under it (ui) | Title left, stars right, and a **`.vpm-slot` flex box between them** (new, hub). ui mounts the chest bar there in landscape. Head height ≤ 64 px. |
| CTA (`.vpm-cta`) | full-width card, bottom 34 | Single row, 52 px: `NEXT CONTRACT 03 · HOUSE CALL · REC. POWER 190 [DEPLOY]`. Left/right 16 + insets, max-width 760, centred. |
| Rail | bottom 18 | Unchanged, plus insets. |
| Chapter select (`createMapSelect`) | 1 column of cards | Grid `repeat(auto-fill, minmax(340px, 1fr))`, max-width 1180, centred. |

Backdrop resolution: the art is 2560×1006 px. On a 1440p window at dpr 2 it upscales about 2.9×. If Aaron cares, regenerate later; mflux caps at 2048, so it would have to be tiled or upscaled. This is not needed for phones.

---

## 5. Menu screens (package UI-L1 / UI-L2; all ui-owned)

Shared landscape rules (`landscape.css`):
- `.screen` padding: `sat + 6` / `max(sar, 12) + 4` / `sab + 8` / `max(sal, 12) + 4`. `.scr-head` is 44 px tall on `l-short`.
- **Two-column pattern `.l2`**: a screen adds class `l2` and wraps its content in `.l2-a` (left) and `.l2-b` (right). In landscape that becomes `grid-template-columns: minmax(280px, .9fr) minmax(340px, 1.1fr)`, with the header spanning both columns and **each column scrolling on its own** (`min-height: 0; overflow-y: auto`). In portrait both wrappers are `display: contents`, so the DOM order matches today's single column.
- Content max-width **1180 px**, centred, on ultra-wide windows.
- **D25 primary action**: pinned to the bottom of `.l2-b` (sticky footer, `flex: none`), always inside the viewport at 844×340.
- Modals: `max-height: calc(100dvh - 24px)` with a scrolling body. Toasts: `top: sat + 52`, max-width 420.

| Screen | Left column (`.l2-a`) | Right column (`.l2-b`) | Notes |
|---|---|---|---|
| **Formation** | see §6 | see §6 | |
| Collection / Workshop (`scr_collection`) | Active squad as a 2×3 mirror grid (cards 64 px wide), surplus-shard panel, workshop hint | Tabs + sort, then the card grid `minmax(96px, 1fr)` scrolling | Squad grid uses the same slot mapping as the HUD. |
| Unit profile (`scr_unit`) | **Turntable stage**: 46% width, full height under the header, drag-spin area | Info sheet, `max-width: 560px`, scrolls; level-up / rank-up actions pinned at the bottom | Turntable: `setViewOffset(w, h, +w·0.27, 0, w, h)` (a positive x offset moves the subject left), `zoom: 0.85`, subject centred in the left 46%. |
| Recruit (`scr_recruit`) | — (single area) | — | Banners in a horizontal `scroll-x` row, each `flex: 0 0 min(360px, 44vw)`, with the x1/x10 buttons inside the card. |
| Recruit reveal x1 | Card, height `min(62dvh, 300px)` | Name, rarity, dupe/NEW, actions | The pod / Rift gate scales to `min(46dvh, 222px)`. |
| Recruit reveal x10 | — | — | `.rv-grid` uses 10 columns when aspect ≥ 1.8, otherwise 5×2; cards `min(84px, 9vw)`; actions below. |
| HQ (`scr_hq`) | Company panel (emblem, name, level, XP) | Branches in a grid `repeat(auto-fit, minmax(260px, 1fr))`: one column per branch, the whole area scrolls | |
| Arena (`scr_arena`) | Rank panel + shop (2×2) | Rival list (scroll), FIGHT buttons on each row | |
| Events (`scr_events`) | — | — | Event cards in `repeat(auto-fill, minmax(320px, 1fr))`. |
| Results (`scr_results`) | VICTORY / DEFEAT head + stars + MVP panel | Star goals, after-action rows, rewards; Continue / Retry pinned at the bottom | Chest reveal overlay: `.cr-loot` max-width 520; lid art scaled to `min(40dvh, …)`. |
| Settings (`scr_settings`) | — | — | Rows in `repeat(auto-fit, minmax(320px, 1fr))`, About spanning. **Add the "Layout: Auto / Portrait column" row** (non-phones only). |
| Map level sheet (`scr_map` `.lvl-sheet`) | — | **A right-side panel** `width: min(400px, 44vw)`, full height under the map head, slides in from the right; Deploy pinned at its bottom | The map stays visible and tappable on the left. |
| Chapters (`#/chapters`) | — | — | Hub's grid (§4). |
| Story dialogue (`dialogue.js`) | — | — | `.dl-box` max-width 720, centred, bottom-anchored; min-height 120; Skip top-right inside the insets. |
| Tutorial hints | — | — | Width ≤ 300; existing viewport clamp; closed on orient change. |
| Dev panel (`js/dev/dev_css.js`) | — | — | The badge moves to the **bottom-left corner**, horizontal (`bottom: sab + 8; left: sal + 8; 64×28`), so it stops covering the HUD card grid. The panel insets by `sal`, content in `column-count: 2`, max-width 960. |
| Hub | §3 | | |
| Battle | §2 | | |

---

## 6. Formation screen in landscape (UI-L1)

```
┌───────────────────────────────────────────────────────────────────────────┐
│[<] DEPLOYMENT                                        Rustline Docks · House Call │ 44
│ YOUR SQUAD 2/4          │ HOSTILES   [W1][W2]  ║ ★ goals chips (1 line, scroll-x)│
│ ┌────┐┌────┐            │ ┌────┐┌────┐         ║ Synergies (1 line)             │
│ │back││frnt│   ┃         │ │frnt││back│         ║ Buff · one per battle (1 line) │
│ ├────┤├────┤   ┃  centre │ ├────┤├────┤         ║ ROSTER (drag onto a hex)       │
│ │    ││    │   ┃  line   │ │    ││    │         ║ [card][card][card][card]…  ↕  │
│ ├────┤├────┤   ┃         │ ├────┤├────┤         ║                                │
│ │    ││    │            │ │    ││    │         ║ POWER 1,240 ███████░ 1,610      │
│ └────┘└────┘            │ └────┘└────┘         ║ [        ▶ ENGAGE        ]      │
└───────────────────────────────────────────────────────────────────────────┘
```
- Grid: `grid-template-columns: auto minmax(320px, 1fr)`. The left area is `.fm-field` (both boards and the centre line). The right column is a flex column: goals, synergies, buffs, roster (`flex: 1; min-height: 0`), the power bar, then **ENGAGE pinned at the bottom** (`flex: none`).
- **Hex size is driven by height**: `--hex-h: clamp(64px, (100dvh - var(--sat) - var(--sab) - 44px - 22px - 28px) / 3, 130px)` and `--hex-w: calc(var(--hex-h) * 1.12)`. At 915×412 that is about 100×112, so the field is `2·(2·112 + 4) + 30 ≈ 486 px` wide. At 844×340 it is about 82×92, or 400 px. The board stops stretching with the screen width (today's bug: the hexes balloon to 430 px).
- Roster: a vertical scrolling grid `repeat(auto-fill, minmax(74px, 1fr))` of cards at their current 74×100, so several rows show instead of one `scroll-x` row. Long-press/drag works as today (the `fm-ghost` is absolute and crosses columns fine). Tap-to-auto-place is unchanged.
- The goals, synergy and buff rows stay single-line `scroll-x` (ui-3 fixed them that way). The power bar moves to sit right above ENGAGE.
- Accept: at 844×340 and 915×360, all 12 hexes, at least one full roster row and ENGAGE are visible without scrolling. Drag from roster to hex works with touch emulation. Rotating mid-drag cancels the drag cleanly (pointercancel) with no stuck ghost.

---

## 7. Safe areas, notches, fullscreen, D25

- **Insets**: iPhone landscape reports `sal = sar ≈ 47–59` and `sab ≈ 21`. Android reports a cutout inset on one side only (with `viewport-fit=cover`, already set). Rules:
  - The canvas and backgrounds are full-bleed (they draw under the notch).
  - Every interactive element and text is offset by its side's inset plus a 6 px gutter (`--sal/--sar` tokens already exist in `vp.css`).
  - Camera margins include the insets: `hud.margins().left` already does, because it is measured from the DOM.
- **Fullscreen** (D25 toggle; ui-5 is building it): in landscape it lives in the top-right cluster on every screen. Android Chrome landscape loses ~56 px to the URL bar without fullscreen, so **915×360 is a first-class test size**. iPhone Safari has no element fullscreen, so **844×340 is the floor**. Never auto-request fullscreen and never lock orientation.
- **D25 always-visible actions**: ENGAGE, Deploy (level panel), CONTINUE (hub), Continue/Retry (results), recruit pull buttons, unit Level up. Each is pinned (not inside a scroller) and its rect must be fully inside the viewport at 844×340 and 915×360.
- **br8t badge**: reserve `--badge-w: 120px` × 40 px top-right in landscape (wider than portrait, since there is room); the top cluster and topbar end before it.

---

## 8. Work packages

Owners follow the TEAM_BRIEF table. **No file is touched by two packages.** The build agents should start only after the ui-5, hub-3 and battle-7 agents running now have handed back their files.

| Package | Owner | Files | Depends on | Effort |
|---|---|---|---|---|
| **UI-L0 shell** | ui | `js/app/orient.js` (new), `js/main.js`, `index.html` (drop rotate-hint, add `css/landscape.css` link), `css/vp.css` (only the `#app`/`#backdrop`/rotate-hint block), `css/landscape.css` (new), `js/app/store.js` (`settings.layout`) | — | 1 h |
| **UI-L1 core** | ui | `css/landscape.css`, `js/ui/hud.js` (`setMode`, slot grid, 4-side margins), `scr_battle.js` (orient → `hud.setMode` + margins), `scr_formation.js` (wrappers only), `scr_hub.js` (rail dock, CTA, `scene.setMargins`), `topbar.js`, `scr_map.js` (side-panel sheet, chest bar into `.vpm-slot`) | UI-L0; uses BATTLE-L/HUB-L APIs but feature-detects them (D19) | 3–4 h |
| **UI-L2 menus** | ui | `scr_collection, scr_unit, scr_recruit, scr_hq, scr_arena, scr_events, scr_results, scr_settings, dialogue.js, tutorial.js, components.js` (modal), `js/dev/*`, `tools/ui_kit.html` (landscape preview toggle) | UI-L0 | 2–3 h |
| **BATTLE-L** | battle | `js/battle/camera.js` (`fitWide`, `shiftX`, bg camera), `layout.js` (`LANE_PROFILES`), `battle.js` (`setLaneProfile`, re-home, 4-side `setMargins`, `overlay.setFrame`), `board.js` (only if `setPlace` needs a tween), `overlay.js` (`--cx`), `js/engine/quality.js` + `engine.js` (`maxPixels`), `tools/battle_test.html` (`?wide`, `?rot`) | none (test page first) | 3–4 h |
| **HUB-L** | hub | `js/hub/hub_scene.js` (wide frame, `setMargins`, pan clamp), `labels.js` (`OFFSETS_WIDE`, left/right/avoid margins), `js/map/story_map.js` (wide layout, node scale, bg anchor, `.vpm-slot`, map-select grid), `js/map/map_css.js`, `tools/hub_test.html` (`?wide=1`) | none (test page first) | 2–3 h |
| robots | — | **None required.** The turntable is reframed by ui through `setViewOffset` in `scr_unit.js`. Optional later: `createTurntable` accepts `{offsetX}` so ui stops wrapping `resize`. | — | 0 |
| **QA-L** | qa | the test matrix (§9), screenshots, issue list into `docs/notes/qa.md` | all | 1–1.5 h |

API changes in one place (append-only; feature-detect on the caller side):
- battle: `scene.setMargins({top, bottom, left?, right?})`, `scene.setLaneProfile('tall'|'wide', {animate})`, `scene.laneProfile`, `overlay.setFrame({left, right, top})`, `engine.quality.maxPixels`.
- hub: `hubScene.setMargins({top, bottom, left, right, avoid?: [{x, y, w, h}]})`, and `createStoryMap` head slot `.vpm-slot` (or `map.headSlot` element).
- ui: `orient` (`window.__vp.orient`, the `vp:orient` event), `hud.setMode()`, `hud.margins()` → 4 sides.

---

## 9. Test matrix and acceptance

### 9.1 Viewports (CDP, touch emulation for phones; dpr 2 phones, 1 desktop)
| Group | Sizes |
|---|---|
| Portrait regression | 412×915, 390×844, 360×780; 1280×800 with `settings.layout=portrait` (must equal today's column) |
| Landscape phone | **915×412, 915×360, 844×390, 844×340**, 960×412 (21:9), 740×360; each also with `?insets=0,47,21,47` |
| Tablet | 1024×768, 1180×820, 1366×1024; 768×1024 portrait (column) |
| Desktop | 1280×800, 1440×900, 1920×1080, 2560×1080; 1000×900 (hysteresis start: portrait) |

### 9.2 Rotation tests (CDP `setDeviceMetricsOverride` swaps; or `battle_test ?rot=3`)
1. **Battle at ×1**: rotate 412×915 → 915×412 → 412×915 at t ≈ 3 s and 6 s. The battle must not restart: same `window.__vp.battle` scene object, sim tick strictly increasing. The HUD card DOM nodes are the same objects. The camera refits within 1 frame. Units re-home within ≤ 1.5 s. No console errors. Median fps unchanged within 10%.
2. Rotate during the drop-in deploy, during an Overdrive (camera push), during the overtime plate, during the VICTORY banner, and while paused (with the pause modal open).
3. Formation mid-drag: the drag is cancelled and no ghost is left. Hub mid-pan: the momentum is dropped and labels relax within 2 frames. Map: the current node stays centred (story_map's ResizeObserver already keeps `st.cur`). Unit profile: the turntable is reframed and the spin angle kept. Recruit reveal mid-animation: it finishes correctly.
4. Desktop: drag the window width 1300 → 900 → 1300 at height 900. The mode flips exactly once each way (hysteresis), with no flicker loop.

### 9.3 Acceptance per package
- **UI-L0**: `data-orient` and `data-form` are correct for every viewport in §9.1. There is no rotate hint. Portrait screenshots at 412×915 and 390×844 match pre-change shots (pixel diff only where dynamic). The 1280×800 "Portrait column" setting reproduces D3.
- **UI-L1**:
  - Battle HUD at 915×412: 2×3 mirrored grid, cards ≥ 80×114. At 915×360 and 844×340: cards ≥ 68×97, the grid fits and the rail fits.
  - `hud.margins()` returns 4 sides and the board honours them.
  - Formation meets §6.
  - Hub: rail dock and CONTINUE are visible at 844×340, and labels clear them.
  - Map: the level side-panel has Deploy visible at 844×340.
- **UI-L2**: every screen in §5 at 844×340, 915×412, 1024×768 and 1920×1080: no horizontal page scroll, primary action visible, no text clipped by insets (with `?insets`), modals scroll when tall.
- **BATTLE-L**:
  - 412×915 portrait framing is unchanged: the camera position, pitch and `shiftY` equal today's values to 3 decimals.
  - At 915×412 with the real HUD, the 6v6 idle **average unit height is ≥ 122 px** (portrait parity). At 844×390 it is ≥ 114 px.
  - Side clearance ≥ 8 px idle (≤ 12 px intrusion mid-attack). Far-lane heads clear the top cluster. The seam rule holds, and there is no void or black at the corners at 2.33:1 or 2.37:1.
  - Re-homing is smooth (no teleport) and keeps footprints valid.
  - Draw calls are within +5 of portrait. 1920×1080 stays ≤ 2.4 Mpx at high.
  - The fantasy theme passes the same checks on m6.
- **HUB-L**: §3.2 width goals; §3.3 label checks at stages 1–4; 60 fps at 915×412; the map at 915×412 and 844×340 shows ≥ 6 nodes with no node under the head, CTA or rail; chapter grid at 1920.
- **QA-L**: the full matrix above, plus one full loop in landscape at 915×360 (hub → map → sheet → formation → battle → results → recruit → unit → settings) with zero console errors, plus the same loop in portrait as a regression check.

---

## 10. Risks, effort, order

| Risk | Impact | Mitigation |
|---|---|---|
| Portrait regression from shared CSS/JS | High | All landscape CSS in `landscape.css` under `[data-orient=landscape]`; camera `fit()` untouched; pixel-diff acceptance. |
| Lane compression changes the look (more occlusion at 30°) | Medium | Pitch is tunable 30–34°; profile switch is one table; Aaron decides (Q2). |
| Mid-battle re-home glitches (lunges, bosses, OD push) | Medium | Re-home only idle actors; boss footprint re-fit; rotation soak test §9.2. |
| Visible height on phones with browser bars (340–360 px) | High (D25) | 844×340 / 915×360 are acceptance sizes; card/hex sizes are `clamp()`ed to dvh. |
| Desktop fill cost (3× pixels) | Medium | `maxPixels` cap; governor already drops dpr. |
| Backdrop edges at 21:9+ (sky/stands end; map art crop) | Low–Med | Corner checks at 2.37:1; bg anchor 0.45. |
| Five agents editing near the same seams | Medium | File-disjoint packages; APIs feature-detected (D19); test pages let battle/hub finish before ui integrates. |
| Hub labels clutter at l-short | Low | Sideways splay + CTA avoid rect. |

**Recommended order** (wall-clock ~1 working session with 3–4 parallel agents):
1. In parallel: **UI-L0** (1 h, unblocks every ui screen), **BATTLE-L** and **HUB-L**. Both of the latter work on their test pages with `?wide`, so they do not need the ui.
2. **UI-L1** once UI-L0 lands. It integrates the battle/hub APIs as they arrive (feature-detected).
3. **UI-L2** in parallel with UI-L1 (different files) if a second ui agent is free; otherwise right after UI-L1.
4. **QA-L** last. Then a fix round.

Total ≈ 10–14 agent-hours.

## 11. Decisions for Aaron
1. **Desktop default** (recommended: **landscape/wide when the window is wide**, with "Portrait column" in Settings). This supersedes D3 for desktop.
2. **Landscape phone battle lanes** (recommended: **compressed lanes**, a denser HoDA-like board with units ≥ portrait size). The alternative keeps today's lane spacing, with units ~15% smaller than portrait.
3. **Landscape battle camera** at ~30–34° (portrait is ~39°): more side-on, bigger units, more overlap between lanes. OK?
4. **Card layout** (recommended: **all 6 player cards on the left as a 2×3 grid mirroring the formation**, speed/auto on the right). The alternatives are 3 + 3 on both edges, or a shorter bottom strip.
5. Later and optional: an enemy mini-roster column on the right (HP only) for symmetry. Also, should portrait tablets (768×1024) get a wider 3:4 column instead of 9:16?
