# HOTWIRE — a Smashy-Road-style open-town driving game

Mobile-first isometric 3D driving sandbox built on the deadtown/whoami template
(Three.js 0.160 CDN importmap, **no build step**). You are **Ash Vega**, an
ex-getaway driver back in **Palm Bay** to pay off cousin Rico's debt — caught
between a police detective and the Chrome Serpents gang, free to work both
sides… if you're smart enough not to get burned.

Built 2026-07-08 (Fable 5). Play: `index.html` · Design levels: `editor.html`.

## The pillars

- **Smashy Road feel**: fixed isometric camera, chunky low-poly cars, most
  land drivable (grass/dirt/sand kick up dust clouds), buildings block but
  never damage, props smash, damaged cars smoke then burn.
- **In & out of cars**: a small on-foot character; nearest enterable car gets
  a bouncing indicator; right-side ENTER/EXIT button. Weapons picked up by
  EITHER the car or the person — never rendered as models; the person just
  raises arms into an aiming pose and projectiles/particles do the talking.
- **Three modes** from the title screen: **STORY** (14 nodes, 3 endings),
  **MISSIONS** (replay any discovered mission for medals), **MOST WANTED**
  (endless survival — heat only ever climbs).
- **Both sides of the law**: police AND gang mission boards. Dual trust
  meters + a hidden *exposure* score. Conflict-tagged missions burn the other
  faction if you're seen (or if the story catches up with you). You can
  decline any mission — smart players keep both doors open to the end.
- **A real designer**: `editor.html` paints terrain, places every pack object,
  cars, weapon pickups, and **hotspots** (mission givers / shops / story
  triggers / portals to other maps). Custom levels save locally, export as
  JSON, and boot straight into the game.

## Asset protection (same scheme as deadtown — read this before touching art)

PolyPerfect "Low Poly Ultimate Pack" is commercial; **no raw GLB/PNG ever
lands in the repo**. `tools/build_pack.py` packs every model + atlas into
`assets/pack.dat` (`XOR(gzip(raw), keystream(name))`, keystream = xorshift32
seeded by `fnv1a(KEY+':'+name)`). KEY = `hotwire-lpup-vR7!aron-2026`, mirrored
in `js/assets.js`. Sources: gallery cache `app/3d/gallery/models_all/` (LOCAL
ONLY) + rigged people `~/cc/assets/3d/public/assets/chars_rigged/`. To change
the model set: edit `MODELS`/`RIGS` in `build_pack.py`, re-run it. Logical
names map to game roles (`v_sport`, `bld_bank`, `ped_cop`).

## The cast & the story (complete — extensible via the editor)

**Ash Vega** (player, `man_race_driver` rig) · **Rico** — cousin, runs Rico's
Rides garage, owes the Serpents $25k · **Det. Ada Marlowe** — Precinct 9,
holds the '23 warehouse job over Ash · **Vex** (Vera Voss) — boss of the
Chrome Serpents, runs the Nest bar · **Knuckles** — her lieutenant ·
**Capt. Dane** — Marlowe's captain, secretly on Vex's payroll (the twist) ·
**Dot** — Blue Palm Diner, neutral odd jobs.

Story nodes live in `js/story.js` (data, not code). Each: giver, dialogue,
mission spec, trust/exposure effects, branch conditions.

**ACT 1 — Homecoming** · S01 *Homecoming* (tutorial drive to Rico's) · S02
*Grease Money* (timed 3-stop parts delivery) · S03 *The Nest* (repo a sport
car for Vex; gang board opens) · S04 *Flashing Lights* (Marlowe's shakedown
cutscene; police board opens).

**ACT 2 — Double Life** (order free) · S05 gang *Smash & Dash* (trash the
market stalls, escape 2★ — conflict: police −10 if finished at ≥2★) · S06
police *Eyes On* (tail the Serpents' van to the docks, distance band) · S07
gang *Special Delivery* (fragile van docks→Nest through roadblocks; exposure+
if S06 done) · S08 police *Plant the Bug* (steal Knuckles' muscle car to the
precinct at 0★) · S09 Dot *Yellow Fever* (4 taxi fares / *Dust Cup* airfield
race) · S10 *Dinner With Snakes* (gate: gang ≥60): loyalty test — torch two
cruisers; if police ≥60 you may warn Marlowe first → decoys, no trust loss
(the "smart play" the game teaches).

**ACT 3 — The Squeeze** · S11 police *Wire* (wear a wire into the Nest —
cutscene reveals Friday's shipment AND that Vex has "a badge" on the payroll:
Capt. Dane) · S12 *Burn Notice* (Knuckles finds the wire — on-foot escape,
grab any car, survive a 3★ GANG chase) · S13 **Choose Your Lane** — three
endings: **A Clean Streets** (police ≥60): *Harbor Storm* — lead the raid at
the Docks map, stop Vex's armored truck; Dane busted; debt burned. **B
Serpent King** (gang ≥60): *Evidence Room* — on-foot infiltrate the precinct
lot, steal the evidence van, outrun a 5★ lockdown to the docks; Vex wipes the
debt. **C Vanishing Act** (both ≥55, exposure < 60): *Snake vs. Snake* — tip
both sides, steal Dane's money truck ($250k) during the shoot-out, reach the
airfield on a timer; pay Rico, vanish. · S14 epilogue free-roam (boards stay
open, ending-flavoured).

## Systems

- **Trust** (police/gang 0–100, start 35/35) — gates story branches; <15 →
  faction hostile on sight. **Exposure** (hidden, 0–100) — conflict missions
  add it; ≥60 forces confrontation beats and locks ending C.
- **Wanted heat** 0–5★: crimes raise it (ramming traffic, gunfire, cops hit);
  spawns cruisers → roadblocks → SWAT trucks (shooters) → **helicopter** at
  5★. Out-of-sight decay. Endless mode heat never decays.
- **Economy**: cash from missions, smashed props, coins, endless payouts.
  **Vega Motors** lot (buy cars) + **Rico's Rides** (upgrades: Engine/Armor/
  Tires ×3 lvls, Nitro unlock, paint) — both are signposted hotspots outside
  buildings; garage also reachable from the title screen (out-of-game).
- **Vehicles** (14): beater, sedan, taxi, pickup, van, hippie van, sport,
  formula, police cruiser (mild disguise), tow truck, school bus, firetruck
  (water-cannon knockback), military truck (mounted MG), golf cart. Stats:
  top/accel/grip/armor + price. Defs in `js/vehicles.js`.
- **Weapons** (unlimited ammo, cooldowns): pistol, SMG, shotgun, rifle,
  rockets (AOE), flamer (particle cone). No models shown — muzzle FX from
  hands (arms-out pose) or car nose. Floating icon pickups; cars and people
  both grab them.
- **Controls**: left half = floating joystick (car steers toward stick,
  pull-back = brake/reverse; on foot = move). Right-bottom buttons: ENTER/EXIT
  + FIRE (below by default) + NITRO when owned. Cog ⚙ top-right: swap sides,
  fire above/below, button size, zoom, shake, quality, SFX/music, reset save.
  Desktop: WASD/arrows, Space fire, E enter/exit, Shift nitro.

## Level & map format (shared by game + editor)

`levels/*.json` (built-ins `palmbay`, `docks` are generated by
`tools/gen_map.py` — regenerate, don't hand-edit): `{ id, name, w, h, tile,
ground: [row strings: g grass, d dirt, r road, p pavement, s sand, w water],
objects: [{m,x,z,rot,s}], cars: [{t,x,z,rot,locked}], guns: [{w,x,z}],
hotspots: [{id,kind: giver|shop|garage|diner|story|portal|race, x,z,r,label,
icon,faction,story,map,missions:[…]}], spawn: {x,z,rot} }`. Custom levels:
localStorage `hotwire.levels`, played via `?level=custom:<id>`; portals/story
hotspots may name custom maps, so whole new story chapters can be authored
in-editor (kind:story + `story:` custom node JSON).

## Files

`js/config.js` tuning + settings · `js/save.js` profile · `js/assets.js` pack
loader · `js/utils.js` · `js/audio.js` synth (engine/siren/guns/crash/radio) ·
`js/world.js` level loader, tile ground texture, colliders, smashables,
hotspots · `js/levels.js` registry (+custom) · `js/vehicles.js` defs, arcade
physics, damage/smoke/fire, enter/exit, AI driver · `js/hero.js` rig driver ·
`js/player.js` foot/car state machine · `js/weapons.js` projectiles/AOE ·
`js/police.js` heat + escalation · `js/gangs.js` · `js/traffic.js` cars+peds ·
`js/missions.js` engine (goto/deliver/destroy/tail/race/survive/steal/escort/
infiltrate/smash) · `js/story.js` nodes+cutscenes+endings · `js/shop.js`
dealer/garage · `js/minimap.js` · `js/ui.js` HUD/menus/popups (popups NEVER
alerts) · `js/fx.js` particles · `js/controls.js` joystick/buttons/iso cam ·
`js/main.js` boot+loop · `editor.html`+`js/editor.js` the designer.

## Testing

Serve site root: `python3 -m http.server 8810` →
`/gms/3d/hotwire/?nosave&level=palmbay`. URL flags: `?nosave` `?shot`
(thumbnail stage) `?lite` `?auto` (soak-drive) `?mode=endless|free`
`?m=<storyId>` (jump to node) `?cash=9999`. Headless Chrome via
puppeteer-core (`--use-angle=swiftshader --enable-unsafe-swiftshader`); poll
`window.__state` (fps/pos/mode/car/heat/errors), drive `window.__game`.
Headless rAF ≈20 fps — use real waits. Screenshot: 1280×800 `?shot` →
`assets/screenshots/hotwire.jpg` at site root.

## ROADMAP (later sessions)

Done in S1 (2026-07-08): everything above — full loop, 14-node story, 3
endings, both boards, endless mode, editor, shops/upgrades, helicopter.
Next ideas: ① tail/escort mission polish (real AI convoys) ② water splash +
drowning cars ③ day/night + headlights ④ ACE-Step radio stations ⑤ ramps +
airborne physics + stunt cash ⑥ more maps (desert, winter — pack has assets)
⑦ photo mode ⑧ gamepad support ⑨ car paint shop UI with live preview ⑩
editor: prop multi-select + copy/paste, heightmap hills.
