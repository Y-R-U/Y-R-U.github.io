# sculptor-17: WOLF (dire_wolf / frost_wolf) + MINOTAUR (fantasy, D21)

Owns: `js/actors/models/wolf.js`, `js/actors/models/minotaur.js`, `js/fx/units/wolf.js`, `js/fx/units/minotaur.js`,
the `wolf` + `minotaur` lines in `js/fx/units/index.js`, this file. Scratch: `<scratchpad>/s17/` (shot.mjs, sheet.sh, bshot.mjs =
battle_test driver, pose.sh = debug-pose tester that needs a temporary `post()` hook, now removed). CDP port 9428.
Work copies live in the scratch dir; `node --check` before copying into the tree (D19).

## Status: DONE (checkpoint 3, final)
- `__gallery.testAll()`: 0 failures (whole roster). battle_test with both units + fantasy arena: 60 fps, no console errors.
- Final screenshots: `<scratchpad>/s17/final/` (single, tiers, ranks, battle view, battle_test, Gore Charge sequence, close-ups).

| unit | rarity / rank | dc (high) | tris (high) | height |
|---|---|---|---|---|
| wolf (dire, horde) | common R0 | 6 | 13.1k | 1.35 m (~1.05 m withers) |
| wolf (frost, order) | rare R1 | 6 | 14.1k | |
| wolf | epic R2 / leg R3 | 6 +1 motes | 15.2k / 15.8k | |
| minotaur | epic R2 | 6 +1 motes | 14.9k | 2.45 m (XL) |

## Wolf (`models/wolf.js`)
- Own dims (WOLF_DIMS), body centred over the plate by a pelvis z shift (`Z0`); ears on aux2/aux3 re-parented to the head (they flick),
  jaw on aux1 with a glowing maw, tail on aux0. Head built inside a 1.18 scope (`HEADK`; aux1-3 offsets pre-scaled).
- Fur: `fur()` scatters smooth-normal tuft clumps (`tuftGeo`, 12 tris, indexed so they shade soft, like painted strokes) over
  ellipsoids with a flow direction; plus a canvas strand texture (`furTex`) as the paint/accent/trim detail map.
  Coat: accent = dark saddle, paint = flanks, trim = pale underside/bib/cheeks (trim is fur, not metal, on this model).
- Variant by faction: `order` = frost (the `metal` slot becomes glassy ice: crystals, claws, fangs; cold veins), anything else =
  ember (glow cracks + smouldering glow tufts, glow ei 3.4 so they read at battle size). Rank: R0 thin coat, R2 bone/ice-spiked collar,
  R3 glowing claws, R4 flame / ice-blade spine crest, R5 horn crown + rune ring.
- All 10 anims bespoke (beast-rig helpers copied locally and extended): idle sniff + ear flicks + breathing, trot, pounce-bite
  (impact 0.48), claw rake (0.5), howl cast (0.4), OD = rear-up howl (cast 0.22) + leap and crash (impact 0.72), hit, side-collapse die
  (down 0.62), sitting victory howl, leap-in deploy from behind (`noDrop: true`, land 0.42).

## Minotaur (`models/minotaur.js`)
- Hunched XL brute: layered muscle blobs, mane over the hump, goat-furred thighs, iron-shod cloven hooves, `taper()` horns (R0 broken
  right horn, R4 bigger + iron rings), chained nose ring, broken manacle + chain on the left wrist, leather bracer, loincloth/belt,
  labrys (double crescent axe: Labyrinth) authored in the hand hold frame. Jaw on aux1, tail on aux0.
- Rank: R2 pauldron + bandolier, R3 war paint turns to glow + axe edge glow + smouldering mane, R4 both pauldrons + skull trophies,
  R5 ember crown ring + axe rune.
- All 10 anims bespoke: snort idle, stomping march (stock gait legs + own upper body), Scythe Sweep (raw-keyed arm, impact 0.5),
  overhead cleave with the left hand IK'd onto the haft (0.52), Bloodrage roar (cast 0.4), Gore Charge (hoof stamps cast 0.2,
  horns down, dash + toss impact 0.62), hit, kneel-then-topple die (down 0.74), axe-raised roaring victory, three-point landing deploy.

## FX (`fx/units/wolf.js`, `fx/units/minotaur.js`, keyed by model id)
- wolf: pounce streak + snapping fang arcs, claw-rake streaks (attack_alt via `shot`), howl rings (OD cast), landing ring.
  Ember Howl: fire cone + per-target burst + 4 s lingering burn (follows the target). Frost Lunge: ice streak, ice-spike eruption,
  4 s frost crust/rime (slow). Deploy hook: rift shimmer at take-off + landing dust (the unit is noDrop).
- minotaur: red crescent sweep (shot) + slash at target; cleave = floor crack line, shock ring, rubble; Gore Charge = hoof stamps +
  nostril steam, glowing gouge + streak down the column, per-target gore (explosion, ring, body toss), stun stars 1.5 s. Deploy keeps
  the kit drop and adds a rubble crater.

## Open issues
- Close-up: wolf lower legs and minotaur muscles still read smooth/plastic next to the painterly ref; battle-size read is good.
- Gore Charge: the battle doesn't move the root forward, so the charge is sold by FX only.
- Wolf common is 13.1k tris against the 8–12k budget (fur clumps). Could be trimmed with fewer tail/ruff tufts if needed.
- battle.js FCOL has no fantasy factions, so `palette.faction` is cyan for horde/order. My FX use their own colours.

## Requests (kit / battle)
- battle: add `horde`/`order`/`wild` to FCOL in battle.js (plate-coloured generic FX for fantasy units without signature files).
- robots: a hook to emit a debuff visual (burn/slow) per status event to the source's FX file (`debuff(ctx)`), so lingering statuses
  don't have to be guessed from the overdrive hook with fx.after loops.
- robots: optional `furTex`-style built-in detail map (`map: 'fur'`) and a shared tuft scatter helper in organic.js; the local ones
  in wolf.js / minotaur.js are ready to be lifted.
- gallery: `&theme=fantasy` for single/tiers/ranks views (today only battle_test shows the fantasy arena).
