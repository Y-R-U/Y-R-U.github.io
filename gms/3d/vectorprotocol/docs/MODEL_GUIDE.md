# VECTOR PROTOCOL: Model Guide (for unit sculptor agents)

Owner: robots (kit owner and art lead). Sculptors: read this whole file, then `docs/ROSTER.md` (your unit's brief), then look at
`refs/ref_battle_02.png` (detail target) and `refs/ref_battle_01.png` (mood). Notes go in `docs/notes/sculptor_<id>.md`.

## 1. The rule: you own exactly one file
Each unit is **`js/actors/models/<id>.js`**. You replace your stub and **touch nothing else**. Everything shared (rig, part builder,
materials, anim framework, units.js, gallery) belongs to the robots agent. If you need a kit change, write it under **Requests** in your
notes file and work around it locally inside your own file (you may define helper functions, extra pose functions and builders there).
Never `git` anything. The tree must boot at every moment (D19), so keep your file importable while you work: write the new version
in your scratchpad, then swap it in once it loads.

## 2. The model file contract
```js
import { fromArch, plate, fin, PS, P, legs, arms, visor, LIB, kf, PI } from '../kit.js';   // kit.js is the only import you need

export default fromArch('tank', {        // optional: start from an archetype preset (see §4); or write every field yourself
  id: 'bulwark', name: 'BULWARK', role: 'tank', faction: 'corporate', rarity: 'rare', realm: 'scifi',
  scheme: 'dark',                        // palette scheme: 'dark' | 'light' | 'bold' (see §6)
  rig: 'biped',                          // 'biped' | 'hover' | 'quad' | 'tracked'
  dims: { ... },                         // bone lengths (§3). Spread the archetype's: dims: { ...ARCH.tank.dims, shin: 0.45 }
  height: 2.05, radius: 0.75,            // metres, model space. radius = footprint for spacing + shield bubble size
  walkSpeed: 1.1, cadence: 0.75,         // 'advance' treadmill (m/s, steps per second)
  style: { weapon: 'shield', heavy: 1, stance: 1.2 },   // drives the stock anims (§7)
  sockets: { muzzle: ['handR', [x, y, z]], muzzleL?: [...], core: [x, y, z], head: [x, y, z], hand?: [...],
             coilL: ['aux2', [0, 0.3, 0]] },  // any extra name: ['bone', [x,y,z]] -> unit.sockets.coilL / unit.socket('coilL')
  orbs: false,                           // true: aux2/aux3 float at the palms (mages); you build orb geometry on aux2/aux3
  aura: 0,                               // 0..1 permanent shield bubble (e.g. HALO)
  glow2: 0x7a22ff,                       // optional second emissive colour for the `glow2` slot
  bodyScale: [1, 1, 1],                  // optional non-uniform bulk tweak of the whole body (no rig change)
  noDrop: false,                         // true: blink/teleport units skip the deploy drop (kit + battle), materialise in place
  mirrorSide: null,                      // 'player' | 'enemy': battle mirrors the unit L<->R on that side (unit.setMirror)
  extraDrawCalls: 0,                     // extra meshes the model adds itself (ghosts etc.) so unit.drawCalls stays honest
  motes: { color: 0xff7a1a },            // optional idle-mote overrides (count, color, size, speed) or false
  rim: { color: false, tint: 0.5, strength: 0.8 },   // optional rim override: false = no rarity tint (warm/dark units), tint scale, overall rim scale
  hoverBeam: { radius: 0.4 },            // high hover units: kit light cone + contact blob on the plate (+2 dc)
  byUnitId: false,                       // true: geometry cache keys on o.unitId too (one model, several boss/unit looks)
  variants: 0,                           // >0: seed % variants is passed to build() as o.variant (geometry is cached per variant)
  build(b, o) { ... },                   // REQUIRED: geometry (§5)
  anims: { attack(P, u, ctx, LIB) {...}, idle(P, t, ctx, LIB) {...} },   // optional overrides, any anim name (§7)
  events: { attack: [['fire', 0.3]] },   // optional per-anim event timings (u = 0..1 through the anim)
  durs: { attack: 0.9 },                 // optional per-anim durations (s)
  post(P, ctx, act) {},                  // optional: edit the final pose every frame (spinning parts, recoil, look-at)
  tick(unit, dt, ctx, bones) {},         // optional: per-frame hook after posing (bone positions, e.g. floating segments on aux bones)
  fxHints: { projectile: 'rail', muzzleColor: 0x8af0ff, impact: 'spark', overdrive: 'hex_wall' },   // free-form, read by the battle VFX
});
```
`build(b, o)` receives `o = { r, rarity, rank, variant, faction, far, quality, opts, def, boss, unitId }`:
- `boss` is true for story bosses (the battle passes rank 5 + boss). Reserve the boss form for `o.boss` so a player's R5 copy differs
  (see singularity.js: a non-boss R5 builds the R4 geometry and keeps the R5 kit cues). `unit.boss` / `unit.unitId` exist at runtime too.
- `r` = rarity index 0..3 (common, rare, epic, legendary); `rank` = visual tier 0..5 (ROSTER "Rank tiers": R0..R5). Default rank
  per rarity: common 0, rare 1, epic 2, legendary 3. **Implement your unit's Rank tiers from ROSTER.md with `o.rank`.**
- `faction` is passed in because players can field any unit in a faction tint; colour comes from materials, but faction-flavour
  geometry (rogue spikes, experimental floating crystals) may key on it (`flair()` helper does this).
- `far` = true at the low quality tier: skip small greebles (`if (!o.far) ...`).

## 3. Rigs and conventions
- **+Z is forward, +Y up, +X is the unit's LEFT** (left bones `*L` sit at +x). Units face +Z at `setFacing(0)`.
- 23 bones: `pelvis spine chest neck head clavL upArmL foreArmL handL clavR upArmR foreArmR handR thighL shinL footL thighR shinR footR aux0 aux1 aux2 aux3`.
  `aux0` = back (on chest), `aux1` = crest (on head), `aux2/aux3` = free floaters (on pelvis). Re-parent aux bones with
  `dims.parents: { aux1: 'handR' }` (e.g. a spinning barrel you rotate in `post`), and place them with `dims.aux0..3: [x,y,z]` (offset from parent).
- Limbs hang along -Y from their joint at rest (arm down, leg down). Bone lengths in `dims`: `thigh shin ankle hipX hipY spine chest neck headOff clavX clavY shoulder upArm foreArm`.
- **biped**: legs use analytic 2-bone IK (feet stay planted). **hover**: `dims.hover` = pelvis height; legs dangle (FK). **tracked**: like hover but the hull never bobs or pitches; leg bones carry no geometry. **quad**: front legs = `clav->upArm->foreArm->hand`, back = `thigh->shin->foot`, every leg's rest points along ±X, `dims.femur/tibia/qreach` + `dims.offsets` (see `archetypes/spider.js`); legs are IK'd to planted feet.
- **beast** (D21 quadruped: wolves): pelvis = hips, spine/chest run forward (+z), front legs `clav->upArm->foreArm->hand` hang down and
  are IK'd with `armIK`, back legs use `legIK`, `aux0` = tail (`parents: { aux0: 'pelvis' }`), `aux1` = jaw. Stock anims in `anims_beast.js`
  (idle, trot, pounce-bite, claw rake, howl, leap overdrive, hit, side-collapse die, howl victory, deploy). See `organic.js` BEAST_DIMS.
- **Fantasy (D21)**: `realm: 'fantasy'` switches to the organic material set (no panel grooves/rivets/seams; noise reads as cloth/fur/bark/hide;
  factions `order` blue / `wild` green / `horde` red). Slots: paint = armour/fur/bark/hide, accent = cloth/leather/moss, metal = steel/bone/claws,
  trim = gold/bronze, **skin** (optional 7th slot for faces/hands: drop another slot to stay at 6 dc), glow = magic, eye = eyes.
  Fur kit (from sculptor-17's wolf): `scatterFur(b, bone, { c, r, n, len, flow, lift, keep, slot, sym, k })`, `tuftGeo`, `blob`, `orient`,
  detail map `'fur'`. Kits in `organic.js` (via kit.js): `buildHumanoid` (knight/elf/sage, sword+kite shield / bow / staff), `buildBrute` (treant/minotaur/shaman,
  gnarled `deform`), `buildBeast` (wolf, ember/frost by faction). Stubs: models/knight, elf_ranger, elf_sage, treant, minotaur, shaman, wolf.

## 4. Archetype presets (templates to copy from)
`js/actors/archetypes/*.js` (+ `ARCH` in `archetypes/index.js`): `tank` (hunched heavy + tower shield), `archer` (sleek rifle), `warrior`
(blade knight), `brawler` (warrior frame + fists), `mage` (hover caster + orbs), `gunner` (heavy rotary gun), `spider` (quad), `tracked`.
Copy the builder **into your own file** and change it freely; do not edit the archetype files (other stubs still use them).
Exemplars (copy these patterns): `models/bulwark.js` (heavy tank: own build, hunch via `post`, shield authored with `poseFrame`,
per-slot material overrides, custom Aegis Wall overdrive) and `models/lancer.js` (sleek archer: IK-built aim pose precomputed at module load,
rifle authored in root space for that pose, off hand locked with `style.grip`, aux bone re-parented to the rifle for unfolding fins, aim-centric anim overrides).

## 5. Building geometry: PartBuilder `b`
Every part is rigid-skinned to one bone; all parts are merged per material slot into ONE SkinnedMesh (draw calls = slots used).
- `b.add(geom, bone, slot, pos, rot, scale)`: `pos` is relative to the bone's joint (world rest position), `rot` Euler XYZ.
- `b.sym(geom, 'upArm', slot, ...)`: author the LEFT part, it is mirrored onto the right bone. On a centre bone (`chest`, `head`, ...)
  `sym` mirrors across x = 0 (use it for paired parts on the torso). On an **off-centre** bone with no L/R pair (aux re-parented to a hand,
  `handR` itself) `sym` now mirrors across that bone's own local x = 0 (= `b.symLocal`). `b.mono(...)` = one part, never mirrored.
- `dims.parents` may re-parent aux bones to any bone in any order (resolved recursively; unknown bones / cycles throw a clear error).
- `b.scope(pos, rot, scale, () => {...})`: pre-transform everything added inside (nested scopes compose).
- **`poseFrame(b.rig, pose, bone)`** (best way to model held things): returns the rotation that maps plain root space (x left, y up, z forward)
  into `bone`'s frame for a given pose `{ bone: [x,y,z] }`. `b.scope([0,0,0], poseFrame(b.rig, HOLD, 'foreArmL'), 1, () => ...)` and model the
  shield/gun as if the unit were standing in that hold pose. See bulwark.js (shield) and lancer.js (rifle, pose built with `LIB.armIK`). **Hold-frame trick**: weapons are authored in the
  frame of their hold pose, e.g. `b.scope([0,-0.08,0], [1.55,0,0], 1, ...)` on `handR` = "the forearm points forward", so you model
  the rifle along +Z as if it were in world space. Compute its muzzle socket with `fr(1.55, [0,-0.08,0], [x,y,z])`.
- Primitives: `b.box b.cbox(w,h,d,chamfer) b.rbox(w,h,d,radius) b.cyl(rt,rb,h,seg) b.sph(ws,hs,...) b.cap b.tor(R,r,ts,rs,arc) b.lathe(pts) b.tube(pts,r) b.ext(pts2d, depth, chamfer)`.
  Segment counts are scaled per quality automatically (`b.n()`).
- Shapes (`kit.js`): `plate(b,w,h,d,{c,tx,tz,sz,bx,bz})` = chamfered armour slab with top/bottom taper (the workhorse), `shell(b,y0,y1,radii)` faceted limb shell,
  `fin(b, pts2d, thick)` blades/spikes/fins, `deform(g, fn)`, `discX`, `ringH`, `hex`, `rod`, `capRod`, `pod`, `band`, `arcH`.
- Mech kits (`kit.js`): `P/PS(b, bone, slot, [w,h,d], pos, rot, plateOpts)` = plate shortcut / mirrored, `legs(b,o,{w,knee:'cap'|'spike',shin:'slim',foot:'wide'|'point'|'claw',
  thighSlot, shellSlot, shinPlateSlot, kneeSlot, footSlot, outerSlot, heelSlot, shinGlow: false})`,
  `arms(b,o,{w,fore})`, `fists(b,o,k,'both'|'L'|'R')`, `openHands`, `visor(b,bone,w,h,pos)`, `thrusters`, `halo(b,bone,pos,R)`, `flair(b,o,{spikes,crystals,antenna})`.

## 6. Materials (6 slots = 6 draw calls max)
| slot | what | look |
|---|---|---|
| `paint` | primary armour | gloss clearcoat paint; object-space **panel lines** + per-panel tone variation; rare+ some seams glow faction colour |
| `accent` | secondary armour | second paint colour (scheme) |
| `metal` | frame, joints, pistons, guns | dark brushed gunmetal |
| `trim` | gold/white trim, rings, emblems | polished; legendary rarity = gold |
| `glow` | emissive faction colour | blooms; fades on death, surges on overdrive |
| `glow2` | optional 2nd emissive colour | def `glow2: 0x…` (or `mats.<f>.glow2 { color, ei }`): strobes, orbs, warning lights; +1 draw call when used |
| `eye` | visors, lenses | dark glass + bright emissive core |
Per-slot material overrides (`mats.all` and `mats.<faction>` **merge** per slot and per `panel` option; the faction entry wins key by key): `mats: { all: { paint: { rough: 0.25 } }, corporate: { trim: { emissive: 0xff9a1a, ei: 0.35 } } }`.
**Detail textures** (triplanar in object space, no UVs needed): `mats: { all: { paint: { detail: { map: 'scuff'|'grime'|'scratch'|Texture|(ctx2d,w,h,rand)=>{}, scale: 2, albedo: 0.6, rough: 0.5, scratch: 0.4 } } } }`.
Texture convention: rgb 0.5 = neutral albedo (×2 multiplier), alpha 0.5 = neutral roughness (`detailTexture()` in materials.js builds the alpha from brightness).
R0 units get `scuff` on paint/accent automatically. The procedural panel grooves/rivets/grime fade by screen size, so small parts no longer speckle:
don't zero `groove` just to fight aliasing.
Colours come from `FACTIONS[faction][scheme]` (corporate cyan, rogue orange/red, experimental violet, legendary gold) so any unit
re-tints by faction. Want custom colours for your unit? `paint: { corporate: { paint: 0x.., accent: 0x.., trim: 0x.. }, rogue: {...} }` on the def.
Panel lines are automatic (bind-pose object space), so large flat plates already read as panelled. Small emissive dots (`glow` discs) are cheap
and match the refs' dotted armour lights: use them.

## 7. Animation
Power hooks for FX: `unit.setPowerScale(k)` (persistent emissive multiplier, 0 = lights out) and `unit.flickerPower(dur)` (EMP blackout
stutter). Never write unit materials directly from FX code.

Ten anims, all required to look right: `idle advance attack attack_alt cast overdrive hit die victory deploy`.
Stock procedural anims come from `style`: `weapon: 'shield'|'rifle'|'blade'|'fists'|'cannon'|'orbs'`, `heavy 0..1` (crouch, stomp),
`stance` (foot width). Hover/quad/tracked rigs have their own stock sets. Override any anim with `anims[name]`:
- loops (`idle advance victory`): `fn(P, t, ctx, LIB)`, t = seconds since start. One-shots: `fn(P, u, ctx, LIB)`, u = 0..1.
- `P` = pose (3 Euler channels per bone + pelvis offset at `LIB.PX`). Helpers: `LIB.R(P,'bone',x,y,z)` set, `LIB.A` add,
  `LIB.RS(P,'upArm','L'|'R',x,y,z)` side-mirrored, `LIB.pel(P,x,y,z)`, `LIB.kf(u, [[u0,v0],[u1,v1],...])` smooth keys,
  `LIB.plant(P,ctx,zl,zr,wide)` IK feet, `LIB.hold(P,ctx,k)` weapon hold. Call a stock anim first and layer on top:
  `attack(P,u,ctx,L) { L.aimFire(P,u,ctx); L.A(P,'chest',-0.1*L.kf(u,[[0,0],[0.3,1],[1,0]]),0,0); }`.
- `ctx` has `D` (dims), `rig`, `boneIndex`, `t` (clock), `style`, `st` (glance state), `move` (gait phase).
- IK/FK: `LIB.armIK(P, ctx, 'L'|'R', target)` puts a hand on a root-space point; `LIB.fkPoint(P, ctx, bone, local)`; `LIB.legIK`, `LIB.plant`.
  **`style.grip: [x,y,z]`** (a point in handR space) makes the left hand hold that point after every anim (two-handed guns); `style.freeHand: ['cast']` opts anims out.
- **Events** (battle VFX sync): `fire` (projectile leaves `sockets.muzzle`, alternates with `muzzleL`; mages alternate orbs),
  `impact` (melee contact), `cast` (from `sockets.core`), plus `down` (die hits the floor), `land` / `ready` (deploy), `end`.
  Defaults per weapon style are in `anims.js` `EVENTS`; set `events` on your def to match your poses. Multi-shot bursts = several `fire` events.
- Emissive power is automatic: overdrive surges to ~3×, die flickers out to 0, deploy powers on. `hitFlash()` and `setShield()` are handled.
- **Melee lunges**: keep forward travel of the pelvis/body within ~0.4 model metres (the board scales units ×1.9; more than that and
  units punch through neighbouring plates). The battle moves the root for long dashes itself.
- Overdrive must be **big and readable** at 120 px: a pose change visible in silhouette (leap, plant, spread arms, rear up).

## 8. Budgets (D17, per unit at quality `high`)
| rarity | draw calls | tris high | notes |
|---|---|---|---|
| common | ≤ 6 | 8–12k | |
| rare | ≤ 6 | 10–16k | |
| epic | ≤ 6 (+1 motes) | 14–20k | |
| legendary | ≤ 6 (+1 motes, +1 aura) | 18–25k | |
`med` ≈ 0.75× and `low` ≈ 0.5× of these automatically (segment scaling + `o.far` skips). Shadow pass doubles draw calls: keep slots ≤ 6.
Sizes (model space metres; the battle scales the whole board): **S 1.0–1.2, M 1.4–1.7, L 1.8–2.1, XL 2.2–2.6** tall.

## 9. The quality bar (judge against refs/ref_battle_02.png, and aim ABOVE the current exemplars)
The manager's verdict on the first exemplars was "architecture good, look clearly below the ref". These are the reasons. Fix all of them in your unit.
1. **Value contrast, not one hue.** The ref tank is mostly *dark gunmetal* armour with *saturated paint panels* on the big read-shapes,
   *bare brushed metal* at joints/pistons, *warm accents* (gold/orange markers), and *bright emissives* (eyes, cores, vents, seams).
   Use the slots for value: `accent` = dark armour base (most of the surface for dark units), `paint` = the faction/brand colour on
   selected plates only, `metal` = joints and greebles, `trim` = small warm or contrasting markers, `glow`/`eye` = lights.
   Light units (LANCER) invert it: white `paint` dominant, blue `accent` panels, dark `metal` undersuit at every joint.
   Test: take a screenshot, desaturate it in your head. If the unit is one flat value, it fails.
2. **Detail density: use the budget.** 4–8k-tri units read as low-poly boxes. Targets at `high`: common 8–12k, rare 10–16k, epic 14–20k,
   legendary 18–25k. Spend it on: layered plates (2–3 deep on shoulders, chest, shins), chamfered/rounded edges (`plate`, `cbox`, `rbox`),
   **hydraulic pistons** across elbows/knees (cylinder on one bone, rod on the next; see `piston()` in bulwark.js), vents/grilles
   (`vent()`), rivets, round lamps with bezels (`lamp()`), cables (`b.tube`) on a single bone, antennas, exhausts, small marker blocks.
   The shader adds panel grooves (bump-shaded), rivets, grime and brushed-metal breakup automatically, so you don't need to model panel lines.
3. **Tier ladder that reads at battle size.** `o.rank` 0..5 (ROSTER "Rank tiers"). Each step must be visible from the battle camera:
   - R0 battered: the kit adds heavy grime; you may remove plates / add a mismatched part.
   - R1 base · R2 extra armour layers (bigger silhouette: pauldron crest plates, skirt plates), more vents.
   - R3 emissive cores and edge lights on the signature part (shield edge, blade, barrel), idle motes appear (kit).
   - R4 a **silhouette change**: hardlight fins/wings, crest, extra weapon part; rim strips; denser motes.
   - R5 crown element: halo/ring/sigil above or behind the unit, the most emissive state.
   **Rarity** additionally tints the rim light (common steel, rare blue, epic violet, legendary gold; `RARITY_COLORS`) and steps glow
   intensity; the battle adds rarity pips on the plate. The kit already ramps (by rank): R0 matte primer finish + scuff texture + heavy grime, R1 satin, R2+ gloss; seam glow coverage and
   brightness (pulsing energy at R3+); emissive strength; rim light; idle motes from R2; a ground **aura ring** from R4 (double at R5); adds gold trim + gold rim/motes at legendary rarity
   (legendary faction units are gold primary). Check with `view=ranks&model=<id>&arena=1` and in `view=battle&pranks=0,1,2,3,4,5`.
4. **Silhouette first.** At 120 px could anyone name the role and the unit? The ref units read through 2–3 oversized shapes
   (BULWARK: pauldrons + tower shield; LANCER: long rifle + swept blades; ORACLE: horn fins + two orbs). Exaggerate them 1.3–2×.
   The battle camera looks down at ~49°: shoulders, head tops, weapon tops and back parts dominate. Make them interesting.
5. **Emissive is an accent.** Eyes, cores, a few dots/strips, seams. If the unit reads "Tron", there is too much `glow`.
6. **Judge under battle light.** The gallery default lights are generic; always confirm with `&arena=1` (single/tiers/ranks) and
   `view=battle` (true camera, true light, true size), at 412×915.
7. Every anim reads at battle size; feet don't slide; held items follow the hands; overdrive is big and unit-specific.

## 10. Viewing your unit (gallery)
`http://localhost:8888/gms/3d/vectorprotocol/tools/gallery.html?` plus:
- `view=single&model=<id>` (`&rarity=&faction=&rank=&anim=attack&t=0.4&yaw=0.5&pitch=0.18&dist=5`)
- `view=tiers&model=<id>` (4 rarities) · `view=ranks&model=<id>` (R0..R5) · `view=factions&model=<id>` (4 tints)
- `view=sheet&model=<id>` anim contact sheet (`&anims=attack,overdrive&times=0.1,0.3,0.5,0.7,0.9`)
- `view=battle&player=<6 ids>&enemy=<6 ids>&pranks=0,1,2,3,4,5` true battle camera + arena + battle.js role scaling (empty entry = empty slot) · `view=turntable&model=<id>` · `view=portraits&models=<ids>`
- `&theme=fantasy` uses battle-6's fantasy arena (single/tiers/ranks/battle views).
- `&arena=1` lights single/tiers/factions views with the real battle arena (judge materials in context). `&u=0..1` poses a one-shot at a normalised time
  (contact sheets: loop `view=single&anim=X&u=Y` screenshots and tile them; robots notes has `sheet.sh`).
- `&live=1` animates; `&clean=1` hides labels; `&q=med|low` quality tiers.
- `window.__gallery`: `{ ready, units, stats(), step(dt, n), play(name), events, errors }`. `stats().units[i]` gives `dc / tris / height`.
Screenshot via CDP (**your own port from the manager; never 9403**, two agents on one browser fight over the tab): `~/.claude/bin/cdp start --port <p> --idle 900 -- --use-angle=metal`, then a node
script that navigates, waits for `__gallery.ready`, `Page.captureScreenshot`. A working driver: `docs/notes/robots.md` → "Screenshot driver" (copy the script into your scratchpad).

## 11. Self-review checklist (do it every round, look at the PNGs with the Read tool; self-scores run 1.5–2 points high)
1. `view=single` 3/4 front at 600 px: does it match its ROSTER brief and the ref's level of plating/detail?
2. `view=battle` at 412×915: identifiable at true size next to the other units? Role readable? Not lost against the floor?
3. `view=tiers`: does each rarity look clearly better (plates, emissive detail, crown at legendary)? Ranks R0..R5 implemented?
4. `view=factions`: still reads well in all 4 tints?
5. `view=sheet` for all 10 anims: poses strong, no foot slide, weapons follow hands, overdrive big, die collapses and fades.
6. `__gallery.events` after playing attack/attack_alt/cast/overdrive: events fire at the visual moment, muzzle socket sits at the barrel tip.
7. `__gallery.testAll()` returns `{ fails: [] }` (every model × rarity × rank × quality builds and runs all anims). Run it before every checkpoint.
8. `stats()`: dc ≤ 6, tris within budget at high; `&q=low` still looks like the same unit.
9. Write the result table + screenshot paths into your notes.

## Kit notes added by the manager (2026-10-19)
- `unit.setShield(v)` now floors at the model's permanent `aura` (`Math.max(M.aura || 0, v)`), so battle hits no longer wipe a permanent bubble. HALO's local workaround is no longer needed.
- **`b.sym()` gotcha**: on an off-centre bone with no L/R pair (an aux bone re-parented to `handR`, or `handR` itself), it mirrors across body x = 0 and leaves a stray copy on the other side. Add such parts once without sym (see the local `addM()` helper in `models/paladin.js`).
- **`dims.parents` order gotcha** (sculptor-14): a bone can only be parented to a bone that comes EARLIER in the bone list (e.g. aux1 cannot parent to aux3). Otherwise `makeRig` crashes and breaks the whole tree. Check the order before re-parenting aux bones.
