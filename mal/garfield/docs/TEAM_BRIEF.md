# GARFIELD: HUNGRY HEIST — Team brief (every agent reads this first)

Game folder: `/Users/aaronair/cc/yru/site/mal/garfield/` (inside the yru GitHub Pages repo; deployed later to
`https://br8t.com/mal/garfield/`). Read `docs/BRIEF.md` (the child's spec — it IS the design; follow it closely) and
`docs/DECISIONS.md` before starting. Once the media agent has produced them, look at the images in `refs/`.

## Hard rules
- **Never `git commit/push/add/stash/rebase/checkout/reset`.** Other sessions share this repo. The manager commits.
- **Only edit files you own** (listed in your launch prompt). Need a change elsewhere? Write it under "REQUESTS" in
  your notes file and SendMessage the owner (or the manager). Don't edit their file.
- Three.js **0.180.0, vendored inside this game** at `vendor/three/` (the core agent creates it by copying from
  `/Users/aaronair/cc/yru/site/gms/lib/three/0.180.0/`). Import as `../vendor/three/three.module.js` /
  `../vendor/three/addons/...` relative to `js/`. If you need an addon, copy it plus its relative imports into
  `vendor/three/addons/` and note it. The site at br8t.com does NOT have `/gms/lib`, so **nothing may reference paths
  outside `mal/garfield/`**, and no CDN imports. Google Fonts `<link>` is OK, but the game must degrade gracefully
  without it.
- No `alert/confirm/prompt`: use styled in-game popups only. Never use blocking nag modals.
- **Landscape.** Priority order: desktop (mouse+keyboard) first, tablet (iPad-size touch) second, and phone uses the
  tablet layout scaled. A touch UI appears automatically on touch devices (`pointer: coarse`) and can be forced with
  `?touch=1`.
- Art bar: **soft movie-style 3D** (warm, rounded, Pixar/Illumination-like; the 2024 Garfield film is the mood).
  Original models only. No official art, logos, the theme song, or imitation of real voice actors.
- Everything is original procedural or local-generated. No external model downloads.
- Comments: sparse, only where genuinely confusing. Keep files small and sensible (ES modules, no build step).
- Kid audience (young Garfield fan): slapstick, cheeky, never mean or scary. Nothing negative ever happens to Garfield
  beyond a cutscene delay.
- Keep notes in `docs/notes/<your-name>.md` with **DONE / IN PROGRESS / NEXT / REQUESTS** sections, and update it at
  least every ~15 minutes. A usage limit can kill you mid-task, and the next agent resumes from that file.

## Testing
- Local server (site root) is already running: `http://localhost:8888/mal/garfield/`
- Headless Chrome: `~/.claude/bin/cdp start --port <your port> -- --use-angle=metal` (without `--use-angle=metal` it
  software-renders and fps numbers are fiction). Drive it with a raw CDP WebSocket from node (v24 has fetch +
  WebSocket built in). Send `Network.setCacheDisabled {cacheDisabled:true}` or ES-module edits are served stale.
  **Run `cdp stop <port>` right after EVERY test run; never leave Chrome idling.** The box has 24 GB, and
  Flux/TTS/music need ~20 GB. Idle Chromes pushed it into swap (Flux went from 1 to 14 min per image). Max one
  Chrome per lane.
- Ports: media 9401, garfield 9402, jon 9403, house 9404, props 9405, ui 9406, core 9407, levels 9408.
- Screenshot at 1280x720 (desktop) and 1024x768 + 1180x820 (tablet), and use 844x390 for the phone sanity check.
  **Look at your screenshots with the Read tool** and judge them honestly. Self-scores run 1.5–2 points high.
- Turntable/gallery pages under `tools/` are encouraged for isolated testing of your piece.
- Expose debug state on `window.__game` (core) and give each module a testable entry point.

## Pause protocol
If the manager messages **PAUSE N** (minutes): reach a safe point, update your notes, then wait N minutes using
`python3 -c "import time;time.sleep(S)"` with S ≤ 540 per call, repeated, then continue.

## GPU / generation
Only the **media** agent runs generation (Flux stills via the mflux-queue :7867, Qwen TTS :7876, ACE-Step/YuE2 music).
Others: request images or audio through media's notes/SendMessage. Don't call those services yourself.

---

# Shared contracts v0 (propose changes in your notes; don't silently diverge)

**Units:** 1 unit = 1 metre, Y up. The house origin is (0,0,0) at the ground-floor front-left corner (house agent
documents the real layout in `js/world/README.md`). Garfield is roughly 0.42 m tall at the back and 0.75 m long, with
a capsule radius of ~0.22. Jon is 1.82 m tall.

### Characters (`js/actors/`)
```js
import { createGarfield } from './actors/garfield.js'   // owner: garfield
import { createJon } from './actors/jon.js'             // owner: jon
const g = await createGarfield({ quality })  // quality: 'high'|'medium'|'low'
const j = await createJon({ quality })
// common:
a.root            // Object3D; place/rotate this. Faces +Z at rotation 0. Feet at y=0.
a.update(dt)      // advances animation/mixer + secondary motion
a.play(name, { loop=true, speed=1, fade=0.15, once=false }) → Promise (resolves when a once-clip ends)
a.setMove(speed)  // m/s along facing → blends idle/walk/run for locomotion (controller calls this)
a.lookAt(worldVec3|null)   // head-turn target
a.sockets         // named Object3Ds: Garfield {head, mouth, pawR, pawL, belly}; Jon {head, handR, handL, hips, face, butt}
a.height, a.radius
a.anims           // array of clip names available
a.dispose()
// Garfield extras:
g.setBelly(t)     // 0 = chubby .. 1 = enormous; smooth; also widens radius slightly
g.claw(on)        // claws visible/extended (Scratch)
g.setExpression('smug'|'happy'|'disgust'|'shock'|'sleepy'|'chew')
// Jon extras:
j.hitZone(worldPoint) → 'face'|'butt'|'leg'|'body'   // for scratch reactions
j.setExpression('happy'|'angry'|'pain'|'shock'|'dizzy'|'sad'|'talk')
j.holdProp(name|null, Object3D?)  // 'newspaper'|'fork'|'plate'|'pan'|'bowl' attaches to handR
```
**Garfield clips:** idle, idle_bored (yawn/stretch/scratch ear), walk, run, jump_up, fall, land, scratch (swipe;
claws out), eat (gobble, head down), spit, pounce, knockback, whacked (squashed flat comic hit), sit, sleep,
interact (paw tap), push, belly_bounce (jumps under the table), smug, chew, celebrate.
**Jon clips:** idle, walk, run (chase), sit (on a chair), sit_eat, stand_up, hop_leg (holding his leg, hopping),
cover_face, cover_butt, throw_newspaper, whack (newspaper swing down), give_bowl (bend down, place bowl), serve
(spoon lasagna onto his plate), carry, talk, talk_angry, fall_back_chair, investigate (hands on hips, looking
around), close_window, slip_faceplant, lie_still, stunned_shake, open_fridge, put_in_fridge, scratch_head, sigh,
pound_door (trapped).

### World (`js/world/`, owner: house; props owner: props)
```js
import { createWorld } from './world/world.js'
const world = await createWorld({ renderer, quality })
world.scene            // add actors to this
world.update(dt, camera)
world.colliders        // array of {id, min:Vector3, max:Vector3, kind:'solid'|'surface', enabled:true}. AABBs; 'surface' = walk-on-top only
world.addCollider(c) / world.removeCollider(id)
world.anchors          // Map name → {pos:Vector3, rotY, ...}: jonChair, jonSeat, tableTop, plateSpot, catBowl, fridgeFront,
                       // fridgeTop, windowsill, vase, curtains, window, frontDoor, tv, sofa, loungeChair, stairsBottom,
                       // stairsTop, bedroomDoor, jonBed, garfieldBed, kitchenBench, playerSpawn, jonSpawn, underTable, plus cam_* shots
world.nav.path(fromVec3, toVec3) → Vector3[]   // Jon's walk graph (doors/stairs aware; respects closed bedroom door)
world.groundAt(x, z, fromY) → y of the highest walkable surface at or below fromY (+0.3 step)
world.exterior.show(bool)    // cul-de-sac for the intro; hidden in-level for perf
world.props            // Map id → prop object (below)
world.setFood(kind)    // 'steak' | 'lasagna' | 'meatloaf' — plate + (lasagna) pan on table
world.reset()          // all props back to initial state
```
**Props** (`js/world/props/*.js`, owner: props). Each prop: `{id, root, colliders:[], state, update(dt), reset(),
...actions}`. The world agent places them at anchors. Needed props and actions:
- `chair` (Jon's): `breakLeg()` → `fallBack()` animation (with Jon riding it), and `bounce()` (L9).
- `table`: `bump(strength)` (rattles plates; L9). `bench` is static.
- `plate`: `setFood(kind)`, `fling(toPos)` (arc onto floor, splat; L6), `eaten(t)` (food shrinks 1→0), `pos`.
- `pan` (lasagna): `serveScoop()`, `toFridge()`, `swingCatch()`, `eaten(t)`.
- `catBowl`: biscuits; `spitBits()` small particles.
- `vase`: `knock()` → falls off the sill, shatters, leaves `fragments` (area L3/L10 that Jon can slip on).
- `curtains`: `shred(stage)` 0..3 (cloth sim or vertex wobble + torn strips), `wave()` for the breeze (L7).
- `window`: `open()`, `close()` → breeze particles/curtain blow while open.
- `fridge`: `open()`, `close()`, `top` surface, `lightOn`.
- `vine` (hanging plant on top of the fridge): `grab()`, `swing(t)`, which exposes the swing tip position for the
  catch check.
- `bedroomDoor`: `open()`, `close()` (enables a blocker collider + nav cut), `rattle()` (Jon pounding).
- `jonBed`: `shred(stage)`. `garfieldBed`: has a blanket.
- `tv` (old CRT with flicker), `newspaper` (spawnable, throwable mesh), `frontDoor` (locked; `rattle()`).
- Food models: steak + peas + mashed potato (gravy), lasagna slice + pan, meatloaf slab. These must look appetising
  in the soft-3D style, since they are the stars.

### Engine / game (`index.html`, `js/main.js`, `js/core/*`, owner: core)
- `js/core/controller.js`: 3rd-person Garfield controller. Camera-relative WASD/joystick, jump (variable height, coyote
  time, jump buffer), AABB collision vs `world.colliders`, step-up, landing on surfaces (table, chairs, sill, counters,
  fridge top, beds, sofa). Max jump apex ~0.95 m so table (0.76) and sill (~0.9) are reachable but the fridge (1.85)
  needs a route.
- `js/core/camera.js`: orbit follow cam (mouse drag/pointer-lock-free right-drag on desktop; touch-drag on the right
  half), collision pull-in against walls, smooth. Also `cam.shot({pos, look, dur, ease})` for cutscenes.
- `js/core/director.js`: cutscene/timeline runner: `await director.run(async (d) => { await d.cam(...); await
  d.walk(jon, 'jonChair'); await d.say('jon', 'key'); ... })`, skippable, letterbox bars, controls locked.
- `js/core/input.js`: keyboard (WASD/arrows, Space jump, J or mouse-left = Scratch, E/F or click-on-target =
  Interact, Esc = pause) merged with `ui.controls`. Note: the brief says "space/click on food": while standing on/at an
  interactable, **Space = interact** (takes priority over jump), and clicking/tapping the highlighted object also
  interacts. Show a prompt bubble.
- `js/core/interact.js`: proximity interactables registry: `register({id, pos|getPos, radius, heightTol, label, enabled(),
  onInteract})`, highlights the nearest with an outline/glow ring.
- `js/core/scratch.js`: claw swipe hit test (cone in front of Garfield, ~0.55 m) vs Jon hit zones and scratchable props.
- `js/core/game.js`: the state machine (boot → intro (first time) → menu → chapter → level → complete), plus save via
  `js/core/save.js` (localStorage key `garfield_hh_v1`: {introSeen, levelsUnlocked, levelsDone, belly, settings,
  names}).
- Belly mechanic: eating Jon's food grows the belly (+0.15); running/jumping slowly shrinks it (to a floor of 0.25).
  It is saved across levels. It's purely cosmetic plus a ±10% move speed. Show it on the HUD as a little belly meter.
- Quality: auto (desktop high, touch medium) + override in settings. Target 60 fps desktop and 45+ on an iPad.
- `window.__game` exposes state, `skipCutscene()`, `goLevel(n)`, `win()`, and a dev teleport.
- URL hooks: `?level=N` (straight into a level, skip menus), `?skip=1` (skip cutscenes), `?touch=1`, `?q=low|med|high`,
  `?dev=1` (dev panel), `?shot=1`.

### Jon AI + levels (`js/game/*`, `js/levels/*`, owner: levels)
- `js/game/jonAI.js`: behaviour states: wander (tutorial: walks the house for 30 s), goEat/sitEat, investigate(anchor),
  chase (10 s or until caught; slower than a running Garfield but corners well; can't jump onto furniture, so Garfield
  can escape onto the table/sofa, and Jon then waits/glares and gives up), react(zone) (leg → hop_leg ~2.5 s → chase;
  face → cover_face ~2 s → throw newspaper (projectile; knockback on hit); butt → cover_butt → chase), caught →
  catch-cutscene (whack with newspaper, comic squash, Jon walks off), trapped (L8), stunned (L9), faceplant (L10).
- `js/levels/common.js`: the chapter-one opening cutscene (bowl → Jon's meal for that level's food → Garfield bites
  biscuits, spits); L10 extra cutscene.
- `js/levels/l01.js` … `l10.js`: each exports `{id, food, title, objectiveText, setup(ctx), update(ctx,dt), hints}`.
  Objectives show as a short checklist in the HUD (e.g. "☐ Scratch Jon's face / ☐ Eat his steak"). The win
  condition is a "Level Complete!" celebration plus belly growth.
- `js/game/barks.js`: random cheeky idle/context barks for Garfield (thought bubbles, voiced) and Jon (spoken):
  idle >8 s, near food, failed jump, after a scratch, while being chased, on escape, when Jon is caught, and so on.
  Rate-limited and never repeating back-to-back. Lots of variety (Aaron explicitly wants lots).

### UI (`js/ui/*`, `css/*`, owner: ui)
```js
import { ui } from './ui/ui.js'
ui.mount(rootEl)
ui.screen('title'|'menu'|'chapter'|'level'|'hud'|'none')
ui.menu.show({chapters:[{id:1,title:'Chapter One',subtitle:'Food',locked,justUnlocked}]}) // unlock anim when justUnlocked
ui.chapter.show({levels:[{n,locked,done,justUnlocked,food}], onPick})                     // 10 + locked 'Coming Soon'
ui.controls.move   // {x,y} in -1..1 from the fixed bottom-left joystick (touch); look deltas from right-side drag
ui.on('jump'|'scratch'|'interact'|'pause'|'resume'|'restart'|'exit'|'skip', fn)
ui.hud.set({objectives:[{text,done}], belly, interactLabel, chaseTimer})
ui.say({who:'jon'|'garfield', text, thought:bool, dur, anchor:screenXY?}) → Promise   // speech/thought bubbles + subtitles
ui.toast(text), ui.tutorial.show({id, text, icon, keys}) / hide(), ui.letterbox(on), ui.fade(toBlack, dur) → Promise
ui.pause.open()   // top-right ⏸ → panel: 'Start Over', 'Exit', 'Resume' (that order) + Settings
ui.settings.open() // music on/off + volume (default 0.35), sfx vol, voice vol, subtitles, fullscreen toggle (big,
                   // also a quick ⛶ button on title + pause), quality, camera sensitivity, invert-Y, character names
                   // (Garfield/Jon defaults, editable), replay intro, reset progress (styled confirm)
ui.complete.show({level, food, nextUnlocked}) → Promise<'next'|'replay'|'menu'>
```
Touch layout: fixed joystick bottom-left; Jump button middle-right; **Scratch** button bottom-right (claw icon);
Interact appears contextually above Scratch when something is in range; ⏸ top-right. Big, friendly, rounded,
warm cartoon UI (think Garfield-orange, cream, chocolate brown). Readable for a young child.

### Audio (`js/audio/*`, owner: media)
```js
import { audio } from './audio/audio.js'
audio.unlock()                       // first user gesture
audio.music('menu'|'sneak'|'chase'|'cutscene'|'victory'|null, {fade})
audio.sfx(name, {vol, rate, pos})    // procedural Web Audio or small files: step, jump, land, swipe, hit, crash, shatter,
                                     // rip, chomp, gulp, spit, whack, boing, creak, door, fridge, wind, unlock, click, pop, purr, meow, yowl
audio.vo(key) → Promise<{dur}>       // plays audio/vo/<key>.mp3 (resolves when done); falls back to a timed silence if missing
audio.voLines                         // manifest: key → {who, text, file, dur}
audio.setVolumes({music, sfx, voice}), audio.setMusicOn(bool)
```
VO keys and text live in `docs/VO_LINES.md` + `audio/vo/manifest.json` (media owns them; levels/barks request lines).

---

# WAVE 3 (2026-10-08): Brief 2 — read docs/BRIEF2.md + DECISIONS D14–D22

Everything above still applies. The game is LIVE (br8t.com/mal/garfield/) and the child plays it: **never break
Chapter One.** `node tools/sim/play.mjs 1-10`, `play.mjs catch` and `__game.selfTest()` must keep passing. Existing
contracts stay; additions below. Lanes: **cast** (port 9402), **world** (9404), **media** (9401), **game** (9407).

### Cast additions (`js/actors/`, owner: cast)
```js
createOdie({quality})   // same common API as Garfield (root/update/play/setMove/lookAt/sockets{head,mouth,tail,back}/height/radius/anims)
  // clips: idle, idle_pant (tongue out, panting loop), walk, run, gallop_goofy, sit, sit_pant, jump_up, fall, land,
  // land_head (lands head-first, dazed), yip_flee (startled hop then run), bark, eat (from bowl), tackle (arena lunge),
  // hit (arena knockback), dizzy, flattened (pancake under TV, legs out), launched (tumbling flight), shake_scared
  // (trembling, dog whistle), lick (big slobbery lick), sniff, hug_pile (L9), walk_socked (socks on ears/tail/mouth),
  // stuck_wall (splat on wall, slide down)
  // extras: setSocks(bool), setExpression('dopey'|'happy'|'dazed'|'scared'), tongue secondary motion
createLyman({quality, outfit:'normal'|'disco'})   // Jon's API + body; black hair, moustache
  // all relevant Jon clips + watch_tv (seated on sofa), drink_coffee (seated, mug), spill (jolt), brawl_* (slapstick
  // fight loop with Jon: slap, kick, dodge, tangled cartoon dust-cloud fight is fine), chase, catch_mouse (lunge + miss),
  // hug, eat (seated), give_bowl, carry_suitcase, dramatic (I'm cold... arms flung), walk_in
createHuman({kind:'delivery'})   // delivery man; carry_box, hand_over, walk, idle
createMice({count})              // tiny instanced mice: scurry along nav or random floor paths
Jon gains: watch_tv, eat_soup (spoon), brawl_*, catch_mouse, hug, spilled_on, eyes_widen (shock + lean back), poked
  (face poke pain), sing_morning (cheery wave), frightened (cower), unbox (kneel, open box, lift TV), carry_tv
Garfield gains: setBald(bool) (pink skin, no fur stripes — same mesh), shed (shake, fur puff), head_in_corner (sulk),
  startled_jump (straight up, fur puffed), meow_loud, poke (paw jab upward), seethe (hold-to-build furious glare,
  0..1 intensity param), loved (melts, huge smile, hearts ok), pull (grip and yank backward), play_socks (rolling in
  drawer), blow_whistle (cheeks puffed), throw_behind, sit_table (sits upright on table), hug_squeezed
```
Lyman/delivery reuse Jon's rig and code paths — don't fork Jon's whole codebase; factor shared human code (e.g.
`js/actors/human*.js`) without breaking `createJon`.

### World additions (`js/world/`, owner: world)
- House: **Lyman's bedroom** upstairs next to Jon's (bed, suitcase spot, door), nav + anchors (`lymanRoom`,
  `lymanDoor`, `lymanBed`); **under-stair cupboard** enterable with a door prop (`cupboardDoor`, `cupboardInside`);
  Jon's room **dresser** (`dresser`, `sockDrawer`, `breakDrawer`), **sofa seats** anchors for two humans
  (`sofaSeatL`, `sofaSeatR`, `sofaFoot`), second dining seat for Lyman (`lymanChair`, `lymanSeat`, `plateSpot2`),
  `odieBowl` spot, `mouseHoles` (3–4 anchors), `cheeseSpots` (4–6), `carpetEdge` (behind the TV stand), `doorStep`
  (front door outside for visitors), arena bounds in Jon's room (`arenaCentre`, `arenaBounds`).
- Props (API style as before, Promises for animated actions): second chair + plate + Odie's bowl (dog biscuits),
  `soupBowl` (`splash()` → splatter decals around the table), `newTv` (identical CRT) + `tvBox` (`open()`), the old
  TV can sit on the living-room carpet; `carpet` (`pull()` → slides and the TV on it launches in an arc → lands at a
  target), `cupboardDoor` (open/close/blocker), `biscuitBox` (`burst()` → dog biscuits spill), `dresser` with
  `sockDrawer.open()/close()` (Garfield can stand in it: surface collider) and `breakDrawer.break()` revealing a
  `spitballLauncher` (pickup), `whistle` (pickup on floor), `coffeeMug`, `suitcase`, `cheese` (placeable wedges),
  `mouseHole` decals, `furPile` (heap of hair) + `shedDecals` (hair coverage on bed/sofa/armchair/table, progressive),
  `table.warp(t)` (L4: the middle sags down to the floor under the fat cat, then springs back), `window` already
  exists (Odie must fly out of it in L4), `bedroomDoor` (Garfield opens/closes — also Lyman's door), `fridge` open/close
  by Garfield. Socks (small cloth props to stick on Odie's ears/tail/mouth).

### Media additions (owner: media)
Lyman voice (designed, male, dramatic theatrical moocher; clearly different from Jon), delivery man voice (any male
preset is fine), Odie sounds (yip, bark, pant loop, whimper, happy yap, scared whine — synthesised or generated; must
sound like a goofy dog, not a beep), mouse squeaks, dog-whistle (silent joke — maybe a faint airy puff), TV thud,
carpet rip/whoosh, soup splash, spit-ball 'thwip', brawl dust-cloud cartoon sfx, doorbell, hug 'aww', shed 'poof'.
Music: arena (bouncy comedic battle), ch2 menu/sneak variant optional. Lines come from `js/game/lines.js` (game lane
adds every Ch2 line there; verbatim brief lines must be exact). Refs first: Odie, Lyman, Lyman disco suit, bald
Garfield, Lyman's bedroom, delivery man.

### Game additions (owner: game — owns everything js/game, js/levels, js/core, js/ui, css, index.html, main.js)
`js/levels/c2_*.js` (or `js/levels/ch2/l01..l10.js`), `js/levels/freeplay1.js`, `js/levels/freeplay2.js`,
`js/game/arena.js`, `js/game/humanAI.js` (generalised from jonAI; Jon + Lyman), `js/game/odieAI.js`, menus per D14,
save migration, docs/LEVELS2.md (write it FIRST, then send media every Ch2 line), autoplayer coverage for Ch2
(`play.mjs c2:1-10`, arena, free play smoke tests).
