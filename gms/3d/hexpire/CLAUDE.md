# Hexpire — hex empire strategy

Turn-based hex-map strategy: claim land with bases/towers, fund wars with
villages and per-hex income, march level 1–10 armies, raze every rival base.
Three.js 0.160 CDN importmap, **no build step**, procedural low-poly art (no
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
  coin for high-level hosts; intercepts invaders on own land.
- `js/render.js` — one merged prism mesh, per-vertex owner colours, border
  ribbon quads (contested hexes get each claimant's colour on facing edges),
  vertex-waved water, instanced trees; building/army mesh diffing by id.
- `js/meshes.js` — procedural castles (grow with level), towers, villages,
  soldier squads with level banner.
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

## Testing

- `scratchpad sim.mjs` pattern: the engine runs headless in node (no DOM) —
  fastest way to check balance (`node sim.mjs <seed> <maxRounds>`).
- Browser: `?auto=1` all-AI soak (`window.__done` on finish), `?lite=1` no
  shadows/AA, `?map=s1..s8` boot straight into a chapter, `?shot=1` staged
  7-round board + `__shotReady` for the projects screenshot.
- `window.__game` exposes `{st, mode, over…}` for assertions.
- Headless Chrome needs `--use-angle=swiftshader --enable-unsafe-swiftshader`.

## Gotchas

- Rebuild visuals after ANY rules mutation: `refreshTiles` + `syncBuildings` +
  `syncArmies` (main.js `refreshAll()`), or colours/borders go stale.
- `recalcTerritory` runs inside build/sell/attack actions already — don't
  double-recalc in loops; it's O(tiles × buildings).
- Army meshes flagged `animating` are skipped by `syncArmies` position sync.
- Editor slots = colour indices; exported maps compact them to empire indices
  (player is always index 0 = first base).
