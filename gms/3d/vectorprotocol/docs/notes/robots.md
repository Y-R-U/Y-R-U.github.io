# robots — notes (kit owner + art lead)

Owns: `js/actors/*` (kit), `tools/gallery.html`, `docs/MODEL_GUIDE.md`. Sculptor agents own one `js/actors/models/<id>.js` each.

## Layout
- `units.js` — public API: `createUnit, MODELS, LAUNCH_IDS, registerModel, ANIMS, unitStats, renderPortrait, createTurntable, FACTIONS`.
- `models/index.js` registry (one file per unit, 14 launch stubs) · `kit.js` barrel for model files · `archetypes/*` templates
  (tank, archer, warrior, brawler, mage, gunner, spider, tracked) · `rig.js` (23 bones, aux re-parenting) · `parts.js` PartBuilder
  (+cbox, ext) · `shapes.js` (+plate, shell, fin, deform) · `mech.js` limb kits · `materials.js` (faction palettes, object-space panel
  lines + emissive seams, shield bubble) · `anims.js` (biped weapon styles, hover, quad IK, tracked; ACTIONS/EVENTS; LIB) · `portrait.js`.

## API (TEAM_BRIEF contract + extras)
`createUnit({model, rarity, faction, rank 0..5, seed, quality, role?, loco?})` → `{root, body, mesh, bones, update(dt), play(name,{loop,speed,fade}) → duration (Infinity for loops),
setFacing(yaw), hitFlash(color?), setShield(0..1), sockets:{muzzle, muzzleL?, head, core, hand, handL, orbL?, orbR?}, height, radius, walkSpeed,
onEvent(fn(type, {anim, socket, index, unit})) → unsubscribe, dead, state, palette {paint, accent, glow, eye, plate}, fxHints, drawCalls, tris, realm, role, rank, dispose()}`.
- Unknown model ids get a stand-in archetype from `role`/`loco` hints (so every roster id renders today).
- Facing: +Z at yaw 0. Player (left, x<0) faces +x → `setFacing(Math.PI/2 - k)`, enemy `-(Math.PI/2 - k)`; k≈0.45 turns them toward the camera like the ref.
- `deploy` drops the inner `body` from 7 m (root untouched); events `land` 0.4, `ready` 0.85.
- `die` holds the last pose; `dead` true at the end; emissive flickers to 0. Any `play()` revives.
- Units need `root.traverse(o => o.layers.enable(REFLECT_LAYER))` to appear in the planar mirror (battle owns this).

## DONE
- Kit: rig (23 bones, aux re-parenting), PartBuilder (+cbox, ext, composing scopes), shapes (plate/shell/fin/deform), mech kit
  (legs w/ slot options, arms, fists, visor, thrusters, halo, flair, **poseFrame**), materials (faction palettes, per-slot overrides,
  bump-shaded panel grooves + rivets + grime/brushed noise, rank ladder for seams/emissive/rim/grime, shield bubble, GPU motes R3+),
  anims (biped weapon styles, hover, quad IK, tracked; ACTIONS/EVENTS; LIB with **fkBone/fkPoint/armIK/twoHand**), units.js
  (model files, rank, overrides, post/tick hooks, style.grip, stand-ins for unknown ids), portrait.js (renderPortrait, createTurntable).
- Model files: 14 launch stubs + `drone` (grunt). Exemplars **bulwark.js** (v2, 15k tris) and **lancer.js** (v2, 8k) done.
- Gallery views: lineup/single/tiers/ranks/factions/sheet/battle (real arena + battle camera + role scaling, &pranks)/turntable/portraits;
  &arena=1, &u=, &rank=; `__gallery.testAll()` (all models × rarity × rank × quality × anims) passes.
- docs/MODEL_GUIDE.md (contract, rigs, kit, materials, anims, budgets, quality bar §9, gallery, checklist).

## IN PROGRESS
- Nothing half-done in files. Review loop for sculptor units (gunner/scrapper by sculptor-1 on :9410; first review sent via manager).
- Perf: `unit.useProxy(MIRROR_ONLY_LAYER)` (merged 1-dc skinned proxy for mirror + shadow) measured 257 -> 125 calls in 6v6; battle must adopt
  (call useProxy, enable that layer on key.shadow.camera, stop enabling REFLECT_LAYER on unit meshes). Gallery: view=battle&proxy=1.
- Portraits verified (view=portraits): bbox framing, quads fall back to full body. Gold material warmed (metal 0.78 + faint warm self-light).


## Round 2 (art-lead + kit polish) — progress
Robots now uses CDP port **9420** (9403 was being shared by a sculptor that copied the old driver default).
- [x] 1 panel speckle: screen-size fades for grooves / rivets / seams / per-panel tone + grime octaves (materials.js vpPan2/vpGrime).
- [x] 2 tier ladder: rank-driven finish (R0 matte primer + auto scuff texture, R1 satin, R2+ gloss), seam coverage+brightness (pulse R3+),
      emissive ladder, motes from R2, ground aura ring R4+ (createAura, +1 dc). Verified in view=battle&pranks / view=ranks.
- [x] 3 darkness: battle-2 lighting (warm key 3.1, fill) reads fine now; gunner's dullness is its palette (noted for its sculptor).
- [x] 4 detail texture hook (mats.<slot>.detail; detailTexture('scuff'|'grime'|'scratch'|fn)).
- [x] 5 b.symLocal / b.mono; sym() on off-centre unpaired bones mirrors locally (lancer's aux1 fins now mirror correctly too).
- [x] 6 turntable: plate ring hue-shift (orange x3 -> gold) fixed (x1.35 + glow disc), neutral pedestal, neutral cool rim (no purple), brighter studio.
- [x] kit: shield bubble now rim-only like battle-2's vfx bubble; legs() outerSlot/heelSlot (sculptor-3 req a).
- [x] gallery battle view mirrors battle.js D23 board scale (BOARD.unitScale) + useProxy by default (&proxy=0 off, &scale=role|natural|k).
- [x] guide: detail textures, symLocal/mono, legs slots, melee lunge <= 0.4 m, rank ladder list, own CDP port.
- [x] 7 reviews: gunner/scrapper/paladin/halo/riot/barb noted below; WIP reviews sent to sculptors 4 (tarantula/jammer), 5 (phase/prism), 6 (oracle/patch).
- [x] sculptor-4 handover: applied its scratch tarantula.js (G 0.8, taller, heavier barrels + muzzle brakes, turret vent glow) and jammer.js
      (dish glow ring) after diff review; old live copies saved in scratchpad r2/*.live.js. testAll 0; battle fit OK.
- [x] kit: `unit.setPowerScale(k)` + `unit.flickerPower(dur)`; js/fx/units/jammer.js blackout now uses flickerPower (no material writes).
- [x] 8 D21: 'beast' rig + anims_beast.js; organic material set + fantasy factions (order/wild/horde) + optional 'skin' slot;
      organic.js kits (buildHumanoid/buildBrute/buildBeast); stub models knight, elf_ranger, elf_sage, treant, minotaur, shaman, wolf
      (ids match js/data/enemies.js `model`). Guide §3 documents them.

### Review notes for a future sculptor pass (finished units)
- GUNNER: reads neutral grey at battle size; corporate identity weak. Needs cyan accent panels/stripe (helm, shoulder, drum), brighter eye lamps.
- SCRAPPER: good. Brown accent can go muddy next to red; a dark gunmetal accent would separate better.
- PALADIN: strong; blade emissive blows out to pure white under bloom (lower blade glow ei ~30%).
- HALO: good; the figure is thin inside the bubble; slightly bulkier shoulders/arms would read better at battle size.
- RIOT: excellent shield read (skull stencil). Fine.
- BARB: spines are a great silhouette; body is very dark/thin; add orange-red emissive slit lights along the spine roots.
- Sculptor-3 note (b): battle runs a unit's attack FX hook only on the FIRST fire/impact event (multi-shot bursts lose FX) — battle owner.

## Round 3 (kit) — DONE
- glow2: second emissive slot (def.glow2 / mats.<f>.glow2), counts as a slot when used, power/death/flicker aware, proxy-safe.
- Rarity cue: rim light takes RARITY_COLORS (common 0x9aa4b0 / rare 0x3d9bff / epic 0xb05cff / legendary 0xffb43a) with a strength floor per
  rarity (wider falloff so it shows from the top-down camera); glow intensity steps x0.85/1/1.15/1.3 by rarity. Exports RARITY_COLORS,
  unit.rarityColor. Proposed plate pips/trim ring in rarity colour to battle-4 (js/battle is theirs).
- noDrop (def flag + unit.noDrop): kit deploy skips the body drop; phase.js sets noDrop: true. battle-4 told to skip its root drop.
- Named sockets: any extra def.sockets entry ['bone',[x,y,z]] -> unit.sockets[name] / unit.socket(name).
- Also: def.bodyScale, def.extraDrawCalls, def.motes.color, unit.setMirror(on) + def.mirrorSide (battle-4 asked to apply for WARDEN player side).
- Noted for battle-4: dark normal-blended particle kind (sculptor-8/6 request).
- Touch-ups: GUNNER accent -> steel-blue 0x34709e; PALADIN glow 0xffb030 ei 2.8 (blade keeps gold hue); HALO bodyScale [1.18,1,1.12];
  BARB spine-root glow sockets from R1; ORACLE orb cores on glow2 0x5530ff ei 1.9 (violet, not pink-white) — oracle is now 7 slots;
  WARDEN mirrorSide 'player'. PATCH R0/R1 now separated by the kit finish ladder (matte primer + scuff at R0). PRISM: sculptor-5 already
  raised it (6.6k R1 / 9.4k R2); remaining budget note stays with its file.
- Gallery battle view: &prar= / &erar= per-slot rarities (alongside &pranks= / &eranks=).
- testAll 0 fails.
- Still open: ORACLE upper body small (needs sculpt); HALO tris 10k vs 14–20k target (needs sculpt); per-part emissive via vertex colour (glow2 covers the asks).

## Round 4 (kit) — DONE
1 boss/unitId: createUnit({boss, unitId}) -> build o.boss/o.unitId, cache key, unit.boss/unitId; battle.js spawn passes boss + unitId
  (battle-6 told). singularity.js: Prime form (rank-5 geometry, lens colours, V tracking) only when o.boss / unit.boss.
2 def.rim { color (false = no tint), tint, strength } -> applyRim() in both material sets.
3 unit.drawCalls includes extraDrawCalls (number or fn(unit)) + hoverBeam (2).
4 makeRig resolves dims.parents recursively in any order; unknown bone / cycle / missing offset throw clear errors.
5 legs({ shinGlow: false }).
6 mats.all + mats.<faction> now MERGE per slot and per panel option (faction wins key by key); documented.
7 organic.js fur kit: scatterFur, tuftGeo, blob, orient (+ kit exports), detail map 'fur'.
8 gallery &theme=fantasy (battle-6 arena) for single/tiers/ranks/battle.
9 touch-ups: KNIGHT paint matte (metal .45 rough .6 env .5); fx/units/monolith.js lean -> fx.lean; SERAPH pearl darker (0xb4acc4,
  coat .4, env .7); NEEDLE head pitched -0.6 in post so the lens faces the camera; WOLF common furK .74 -> .64 (12.3k);
  MERIDIAN hoverBeam (new kit createHoverBeam: additive cone + contact blob).
testAll 0 (high+low); module syntax checks pass.

## Sculptors (send reviews DIRECTLY via SendMessage; copy manager only for decisions)
- sculptor-1 `a81e55f06be5efdf8`: gunner + scrapper (CDP 9410). First review sent (gunner: value/cyan pop, drum visible; scrapper: +detail, darker accent than brown).
- sculptor-2 `a0f4f9fe66ba023a5`: paladin + halo (CDP 9411). Orientation pointers sent.

## NEXT
1. Review sculptor units as they land (view=single&arena=1, view=ranks, view=battle); keep roster coherent; feed back via manager.
2. Verify renderPortrait output (view=portraits) and turntable; perf: 12 units live fps in view=battle&live=1.
3. Tracked/hover stubs (jammer, phase, prism, patch, halo, oracle) are rough archetypes: sculptors replace them.
4. Fantasy (D21): organic humanoid/quadruped/brute on the same rigs later (`realm: 'fantasy'`).

## Model table (high quality, default rank)
| model | status | dc | tris | height m | notes |
|---|---|---|---|---|---|
| bulwark | exemplar v2 | 6 (+motes R3+) | ~15k | 2.0 | hunch post, poseFrame shield, pistons, Aegis Wall OD |
| lancer | exemplar v2 | 6 | ~8k | 1.72 | IK aim, root-space rifle, style.grip, fin unfold OD |
| drone | robots | 6 | ~2k | 1.0 | grunt; spinning rotors via tick |
| tarantula | sculptor-4 (+robots applied final) | 7 | ~16k | 1.04 | G 0.8 |
| knight/elf_ranger/elf_sage/treant/minotaur/shaman/wolf | D21 stubs | 5–7 | 4–6k | 1.05–2.45 | organic kits |
| others | sculpted or stubs | 6 | 3.5–6.7k | 1.25–2.05 | archetype stand-ins until sculptors replace |

## Findings / requests
- **battle — ROLE_H** normalises every unit to its role height, which erases ROSTER size classes (tarantula 2.4x, patch = lancer). Suggested a
  constant board scale (~1.6) instead. Sent to manager.
- **battle — arena light** is very blue; a warmer/whiter key or fill on units would help materials read (gold, gunmetal).
- **battle / manager — unit scale (superseded: battle scales per role)**: at the battle camera (BOARD hexR 1.3) a 2 m unit is ~5% of screen height; in ref_02 units are ~11–13%.
  Set `BOARD.unitScale` ≈ 1.9–2.1 (or shrink the board). Model heights are metres in model space: S 1.0–1.2, M 1.4–1.7, L 1.8–2.1, XL 2.2–2.6.
- Battle camera pitch 49° shows a lot of head-top; the ref feels ~35–40°. Up to battle.

## Screenshot driver (copy into your scratchpad as shot.mjs)
`node shot.mjs out.png "view=single&model=bulwark" 412 915 2` (CDP_PORT env, required: your own port). Source: see the block below.
```js
// node shot.mjs out.png "query" [w h dpr waitMs evalExpr]
const [,, out, query, W = '412', H = '915', DPR = '2', WAIT = '0', EVAL = ''] = process.argv;
const port = process.env.CDP_PORT; if (!port) throw new Error('set CDP_PORT to YOUR port');
const fs = await import('fs');
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let tgt = list.find((t) => t.type === 'page');
if (!tgt) tgt = await (await fetch(`http://127.0.0.1:${port}/json/new`, { method: 'PUT' })).json();
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const pend = new Map(); const logs = [];
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } else if (d.method === 'Runtime.consoleAPICalled') logs.push(d.params.type + ': ' + d.params.args.map((a) => a.value ?? a.description).join(' ')); else if (d.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + JSON.stringify(d.params.exceptionDetails).slice(0, 600)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +DPR, mobile: +W < 800 });
await send('Page.navigate', { url: 'http://localhost:8888/gms/3d/vectorprotocol/tools/gallery.html?' + query });
const t0 = Date.now();
while (Date.now() - t0 < 60000) {
  const r = await send('Runtime.evaluate', { expression: 'window.__gallery && window.__gallery.ready', returnByValue: true });
  if (r.result?.result?.value) break;
  await new Promise((r) => setTimeout(r, 200));
}
if (+WAIT) await new Promise((r) => setTimeout(r, +WAIT));
if (EVAL) { const r = await send('Runtime.evaluate', { expression: EVAL, returnByValue: true, awaitPromise: true }); console.log(JSON.stringify(r.result?.result?.value ?? r.result)); }
const s = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
const st = await send('Runtime.evaluate', { expression: 'JSON.stringify({err: window.__gallery?.errors, st: window.__gallery?.stats?.()})', returnByValue: true });
console.log(String(st.result?.result?.value).slice(0, 1500));
if (logs.length) console.log(logs.slice(0, 15).join('\n'));
ws.close();
```

## Contact-sheet script (sheet.sh, next to shot.mjs)
`./sheet.sh out.png <model> "extra query" idle,attack 0.2,0.5,0.8`
```bash
#!/bin/bash
# sheet.sh out.png model "extra query" [anims] [us]
out=$1; model=$2; extra=$3; anims=${4:-idle,advance,attack,attack_alt,cast,overdrive,hit,die,victory,deploy}; us=${5:-0.15,0.35,0.55,0.75,0.95}
files=()
for a in ${anims//,/ }; do for u in ${us//,/ }; do f=shots/_k_${model}_${a}_$u.png; node shot.mjs $f "view=single&model=$model&clean=1&anim=$a&u=$u&$extra" 240 280 1 >/dev/null; files+=($f); done; done
n=$(echo $us | tr ',' '\n' | wc -l | tr -d ' ')
python3 -c "
import sys
from PIL import Image, ImageDraw
n=int(sys.argv[2]); fs=sys.argv[3:]; ims=[Image.open(f) for f in fs]
w,h=ims[0].size; rows=len(ims)//n
M=Image.new('RGB',(w*n,h*rows)); d=ImageDraw.Draw(M)
for i,im in enumerate(ims): M.paste(im,((i%n)*w,(i//n)*h))
M.save(sys.argv[1])" $out $n "${files[@]}"
```

## Round 5 (robots) — checkpoint 1
- DONE 1 (Q19 profile clipping): portrait.js `createTurntable` now measures the idle pose (`unitBands`: per-height-band max radius about
  the spin axis, all visible meshes incl. aura bubble / R4 ring) and fits the camera with `fitCamera` (aspect-independent, units = frame
  height at zoom 1; defaults halfH .29 / halfW .37 / cy -.045 tuned for scr_unit's zoom 0.6 + setViewOffset stage). Pedestal is sized to
  the footprint (radius x1.45, ground parts, clamp 0.7..1.6). API unchanged; additive 3rd arg `createTurntable(engine, unitOpts, view)`
  takes fitCamera opts + `offsetX`; honours `tt.spinPaused` (scr_unit sets it on drag). Gallery `view=turntable` now mimics scr_unit's
  resize (`&ui=0` = raw) and draws the stage guide; `&rank=`. All 44 fit at R0 and R5 (portrait) and in landscape.
  `renderPortrait`: bust only for upright bipeds (quad/beast/hover/tracked frame whole), width fit tighter.
  Shots: scratchpad robots5/shots/b0_sheet.png (before, in-game) -> a3_sheet.png (after), a2_r0.png / a2_r5.png / a2_land.png,
  b0_portraits.png -> a4_portraits.png.
- NEXT: 2 HALO aura by rank, 3 MINOTAUR attack sideways travel, 4 touch-ups.
- DONE 2 (HALO aura by rank): kit `units.js`: `def.aura` x [0.55, 0.7, 0.85, 1, 1.1, 1.2][rank] (or `aura: (rank) => v`), bubble swells
  2%/rank, setShield floors at the ranked value. HALO's local setShield wrapper removed (it pinned the floor at 0.38 for every rank).
  Shot: shots/b_halo_ranks.png.
- DONE 3 (MINOTAUR rail): measured rail-ward reach (player back = max(-0.43x - 0.9z), enemy = max(0.43x - 0.9z), model m, battle yaw
  ±(π/2-0.45)); idle 0.57. Before: attack 1.15, attack_alt 1.56, victory 1.18. After: attack 0.79/0.87, attack_alt 0.76, victory 0.98,
  overdrive 0.66-0.72 (all ≤ +0.4 over idle). Smaller wind-up twist, coil arm forward, overhead heave raised over the horns instead of
  dropping behind the back. Script: robots5/reach.mjs <model> <anims>. Contact sheet shots/mino_after.png.
- NEXT: testAll, then touch-ups (two weakest of arbiter / wisp / oracle faceplate / halo face R0 / elf cloak lining).
- DONE 4 touch-ups (two weakest at battle size, judged in view=battle 412x915: shots/c1_battle.png -> c2_battle.png):
  WISP read smallest on the board: bodyScale 1.5 -> 1.8, height 1.35, radius 0.48 (now Patch-sized). ARBITER (~5.5) read as a
  scatter of white drones with glowing rotor rings: drone orbit 0.56 -> 0.5, drones ~15% smaller, rotor rings trim (glow only R4+).
  Honest: arbiter is still busy from the top camera (maybe 6/10); a real fix is a bigger, darker coat mass + fewer drones (sculpt job).
- Gate: testAll 0 fails (high and q=low). Module syntax checks pass (portrait.js, units.js, halo.js, minotaur.js, arbiter.js, wisp.js).
- OPEN: oracle faceplate, halo face/R0, elf cloak lining not touched. Specter is small on the turntable (rifle radius 2.17 m forces
  the fit); Halo's aura bubble pokes past the card-portrait edge (shield not in the bust box). Paladin's sword glare blooms on the plate.
  Request (ui): none needed; scr_unit's resize wrapper keeps working (fit is aspect-independent, computed in setUnit).

## Round 6 (robots) — checkpoint 1
- DONE 2 (renderPortrait perf): cause was not the render itself but shader **recompiles**: `unit.dispose()` disposed the materials,
  three released their programs (usedTimes 0), so every portrait recompiled ~6 programs (getProgramInfoLog = ~28 ms of each call).
  portrait.js now keeps one live material per compiled program per renderer (`keepPrograms`), reuses one studio scene + the two
  render targets, computes the framing box with one matrix per bone (rigid skin) instead of three's per-vertex skinning (`unitBox`,
  exact), splits build | render into two tasks (`setTimeout(0)` between, `opts.split:false` to disable) and reads back with
  `readRenderTargetPixelsAsync` (fence polled; sync fallback). Output pixel-identical (cmp vs the old module: 0 diff, except
  motes/time noise that the old module also has run to run). `portraitStats.last` = {build, render, canvas, wall} ms.
  M5, 44 models cold, wall per call: before median 52 / p90 60-65 / max 74-77; after median 22 / p90 35 / max 52 (first call only:
  compiles the shared programs once); longest single task now ~22 ms (build of a cold template), warm calls 12-18 ms.
  `PORTRAIT_STYLE` exported from portrait.js + units.js (= 2: ARBITER re-sculpt).
- DONE 1 (turntable backdrop): `createBackdrop()` in portrait.js, on by default (`view.backdrop:false` = old black). Dome (lit
  gradient + halo behind the subject sized to its angular height + vignette, sci-fi scan bands / fantasy dusk mottling) + floor disc
  (plate-colour glow pooled under the plate, hex lines sci-fi, flagstones fantasy) fading into the dome. 2 dc, dim (under bloom).
  Fantasy (`realm:'fantasy'`): torch-warm faction-leaning tint, grey stone / mossy dusk. Shots robots6/shots/a2_sheet.png (b0_tt_sheet = before).
- DONE 3 (hover on turntable): hover-rig units whose mesh floats > 0.28 m above the plate are lowered (mesh.position, not root, so
  aura ring/motes stay) to `view.hoverMax` 0.24 m, and get a kit hover beam (createHoverBeam) when the def has none. Battle untouched.
  Needle drop 0.26, Wisp 0.35 (`tt.hoverDrop`).
- DONE 4 (ARBITER sculpt): flared navy frock-coat lathe skirt (open front, white piping, gold hem R2, glow hem R3), bigger coat
  block, navy mantle + navy shoulder boards (white only as piping; the old gold/white board tops were what read as beige slabs
  from above), knees metal, corporate navy darker (0x1c2f66); drones 2/3/4 (R0 / R1-4 / R5) at 1.85-2.05x, navy shells + white
  equator band, rotors dark (glow R4+); d0..d5 sockets re-placed per rank onto the real drones (FX relay unchanged). 14.6k tris epic,
  dc 6+motes. Shots robots6/shots/arb_battle_ba.png (before | after, battle 412x915), a_arb_r025.png, a_arb_sheet.png.
- Gate: testAll 0 fails.
- Checked: hover drops for all hover models (drone 0.49, wisp 0.35, needle 0.26, meridian 0.18, phase 0.16, prism 0.15, husk 0.13;
  units with auras/low hovers 0); shots a3_sheet.png (15 units incl. fantasy elf_sage, rogue scrapper), landscape a4_land_game.png,
  in-game profile ?dev=1&fresh g2_profile.png (backdrop under ui's halo). Rogue dome tint gets 18% warm white (orange went red).
- NEXT (open): oracle faceplate, halo face/R0, elf cloak lining (carried from round 5).

## Requests (round 6)
- ui: the turntable now has its own lit backdrop (createTurntable view.backdrop, default on). Remove `.up-stage::before` (the navy
  halo, css/screens.css) — with both, the top of the stage is double-lit.
- ui: fold `units.PORTRAIT_STYLE` (now 2, ARBITER re-sculpt) into portraits.js's IndexedDB key (e.g. `v${PORTRAIT_VERSION}.${units.PORTRAIT_STYLE ?? 0}`)
  so cached arbiter cards refresh; I bump it whenever card art changes.
- ui (optional): renderPortrait is now two tasks per call (build | render, ~22 ms max each on the M5) plus an async readback; no
  API change. The ~8 ms per-job budget in portraits.js can stay.
