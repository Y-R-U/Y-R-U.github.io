# Hexpire — hex empire strategy

Turn-based hex-map strategy: claim land with bases/towers, fund wars with
villages and per-hex income, march level 1–10 armies, raze every rival base.
Three.js 0.160 importmap → vendored `/gms/lib/three/0.160.0/`, **no build step**, procedural low-poly art (no
asset packs), mobile-first portrait. Built 2026-07-09 (Fable 5).

## Architecture

Pure-data rules engine, presentation observes it — the whole game state is
JSON-serializable (powers autosave/Continue and the node-side balance sim):

- `js/config.js` — **every balance number** + colours. Tweak here only.
- `js/hex.js` — axial pointy-top math, BFS, components. Tiles keyed `"q,r"`.
- `js/state.js` — tiles/empires/armies + (de)serialize. `mapDef.pieces`
  (`[q,r,empireIdx,kind,level]`) places editor-authored towers/villages/armies.
- `js/rules.js` — territory recalc (claims → owner / `-2` contested), income,
  build/upgrade/sell/recruit actions, arrow volleys, split→auto-base,
  eliminations. Villages flip owner with their hex; can't neighbour a village.
- `js/units.js` — moveOptions (BFS marches *through* friendly armies, stands
  on free tiles), move/merge/attack. Combat: `dmg = atk − (def + aura ≤3)`,
  near-miss within `glancingMargin` still deals 1 (prevents aura stalemates),
  worse than that = repelled (attacker takes 1).
- `js/mapgen.js` — classic/jagged/islands/maze + farthest-point base spacing.
- `js/maps.js` — 8 story chapters (fixed seeds ⇒ deterministic boards).
- `js/ai.js` — one action per `aiStep()` call so main can animate; personality
  weights in config. Muster keeps base ring clear + dodges enemy arrows; banks
  coin for high-level hosts; intercepts invaders on own land. Marching uses a
  BFS distance field over land from the target (not hex distance); never builds
  on a tile that would split a corridor/causeway (`cutsLane`); a jammed army
  grinds at whatever blocks it; recruit score has a banked-wealth term so
  economists/expansionists don't hoard; base upgrades skipped when the new ring
  is all rival-claimed; turtles go out once their host is ≥1.5× everyone else's.
- `js/render.js` — one merged prism mesh, per-vertex owner colours, border
  ribbon quads (contested hexes get each claimant's colour on facing edges),
  vertex-waved water, instanced trees; building/army mesh diffing by id.
  `setLowGraphics()` (DPR ≤1.5, no shadows, live), `onScreen(k)`, `R.camVer`
  (bumped on every camera change — drives the idle-render cap).
- `js/meshes.js` — procedural castles (grow with level), towers, villages,
  soldier squads with level banner. Each kind/level is built once from cached
  primitive geometries and **baked** (`mergeGeometries`) into one geometry per
  material; instances share those geometries and cached materials. Army tabards
  use a `BODY` placeholder swapped for the owner colour. Flag cloth stays its own
  mesh (it sways); flag textures/materials cached by `css|text`. HP bars: one
  sprite+canvas per entity, redrawn only when the fraction changes, disposed on
  removal. Nothing per-entity needs disposing except that sprite.
- `js/editor.js` — paint/erase land, place bases + all pieces per empire,
  preview runs the REAL territory pipeline; save/export/import/test-play.
- `js/main.js` — turn engine (income → act → arrows), animation, interaction.

## Balance decisions (deviations from the original spec, deliberate)

- Hex income 1 coin per **4** fully-held hexes (1/hex prints money at L3 start
  radius 4 ≈ 45 hexes). Village costs 10/15/20 (5-coin villages pay back in one
  turn). Base upgrades 10/20/30/40. Armies muster within 2 of a base.
- Watch for **stalemates** when tuning: auras that fully repel equal armies +
  armies blocking each other's pathing froze entire games for 200+ rounds.
  The glancing rule, pass-through movement and AI merge/banking fixed it —
  sim wins now land round ~25–60 across seeds/personalities.

## Runtime behaviour (2026-10-11 hub pass)

- Render loop runs full rate while fx, camera moves (≤0.5 s after), player
  animations or rival turns are live; otherwise capped at ~30 fps.
- Frame time >25 ms over 3×60 active frames → auto Low graphics + toast, saved
  in settings (`lowGfx`); toggling it in Options sets `lowGfxManual` so it never
  auto-drops again.
- Rival turns: hold ⏩ (`#btn-ff`, `G.ff`) to speed them up; actions and arrow
  volleys entirely off-screen resolve instantly. Taps during rival turns open
  read-only panels (`H.readOnly`).
- Round summary callout (`#roundsum`) replaces AI-turn raze toasts: built from
  `st.log` since the player's End Turn plus hex/village/army diffs.
- Home and Sell use inline tap-again confirm (`UI.confirmTap`), no modals.
  Skirmish/custom "Play Again" rematches immediately (`G.rematch`).
- Toasts: max 2 on screen, repeats merge into "×n".
- Small skirmish maps cap rivals at 3 (`SMALL_MAX_RIVALS` in menus.js).
- Inline boot watchdog in index.html: 8 s (or a module load error) shows a
  Reload that re-fetches every `js/*.js` with `cache:'reload'` then navigates
  to `?v=<now>`. If you add a module, add it to that list.
- Empire/map names go through `escapeHtml` (utils.js) wherever they hit
  innerHTML.

## Testing

- `node tools/sim.mjs [nSeeds=30] [maxRounds=200] [jsDir]` — headless AI-vs-AI
  stall check (~25 s): skirmishes across style × size × player count plus all
  story chapters. Reports ended/median rounds, STALEMATE (still fighting at the
  cap) and FROZEN (no attacks in the last 50 rounds — the regression to watch).
  `jsDir` lets you point it at an old copy of `js/` for before/after. 2026-10-11:
  before 20/38 ended, 12 FROZEN; after 33/38 ended (median 39), 0 FROZEN. The 5
  left are live attrition wars on 1-wide causeways/maze corridors.
  `tools/` ships with the deploy (deploy.sh only drops `*.md`); it's harmless.
- Browser: `?auto=1` all-AI soak (`window.__done` on finish), `?lite=1` no
  shadows/AA, `?map=s1..s8` boot straight into a chapter, `?shot=1` staged
  7-round board + `__shotReady` for the projects screenshot.
- Deploy: `rsync -az --delete --exclude='*.md' gms/3d/hexpire/ br8t:/srv/apps/br8tgames/site/gms/3d/hexpire/`
  from the site root. The game also needs `/gms/lib/three/0.160.0/` on the box
  (incl. `addons/utils/BufferGeometryUtils.js`) — `games/deploy.sh` does NOT
  sync `gms/lib/`; it was missing on 2026-10-11 and the live game 404'd on boot.
- `window.__game` exposes `{st, mode, over…}` for assertions.
- Headless Chrome: use `cdp start -- --use-angle=metal` for real numbers
  (swiftshader works but every fps figure is fiction).

## Gotchas

- Rebuild visuals after ANY rules mutation: `refreshTiles` + `syncBuildings` +
  `syncArmies` (main.js `refreshAll()`), or colours/borders go stale.
- `recalcTerritory` runs inside build/sell/attack actions already — don't
  double-recalc in loops; it's O(tiles × buildings).
- Army meshes flagged `animating` are skipped by `syncArmies` position sync.
- Editor slots = colour indices; exported maps compact them to empire indices
  (player is always index 0 = first base).
