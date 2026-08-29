# HOMEBOUND — a gate runner about getting back to your family

Mobile-first portrait Three.js (0.160, vendored at `../../lib/three/`, importmap,
**no build step**). One thumb. You drag, your squad follows, and everything in
front of you is a choice you make by shooting it.

Art direction: **stylized modern-military**. Chunky low-poly units with thick
outlines, oversized flat-coloured gate signage, olive/steel/sand ground palette
with hot orange muzzle work. Reference frames are in `dev/ref1-3.jpg` — copy the
*readability* (huge signs, dense legible crowd, strong silhouettes), not the
fantasy subject matter.

---

## The one idea everything hangs off

**Every gate is a bet you can rewrite by shooting it.** A `+1` sign you leave
alone is a `+1`. The same sign under fire climbs — `+1 → +7 → +23` — and the
whole game is the tension between *spending your seconds of fire on the gate*
and *spending them on the thing that is currently killing your men*. Your gun
is your economy and your defence at the same time, and there is only one of it.

That is why the squad auto-fires straight ahead and your only input is `x`.
Aiming **is** choosing. Steering left to farm a `+99` means the enemy column on
the right gets a free three seconds into your flank.

Three gate verbs, and the sign always says which:

| verb | panel | what shooting does |
|---|---|---|
| **GROW** | wooden, blue/yellow | the number climbs while you hit it. Run it to bank it. |
| **BREAK** | glass, cracked | shooting destroys it — clears a blocker, or denies a trap gate |
| **PRESS** | red button plate | one hit triggers a thing (drop a bridge, drop a cage, call an airstrike) |

Glass gates cannot be grown. They are the fixed-price option, and they are how a
level says "this one is not negotiable."

---

## Coordinates

Road runs **+Z away from the camera**. The squad advances in world Z at
`RUN.speed`; nothing scrolls, objects sit at absolute z and are culled behind.

- `x` = across the road, `0` = centre, clamped to `±ROAD.halfW` (5.5 → 11 m wide)
- `y` = up, road surface at `y = 0`
- 1 world unit = 1 metre. A soldier is 1.7 m. Units pack at ~0.55 m spacing, so
  300 men is a dense 11 m-wide block ~9 m deep — the reference crowd exactly.
- Camera sits behind and above at `CAM.back` / `CAM.height`, pitched down, FOV
  narrowed for portrait. It pulls back as the squad grows (`CAM.perUnit`).

Either side of the road is a **river/ravine** (dark water plane + rock banks),
which is what makes the road read as a corridor and lets a level kill you by
crowding you off it.

---

## Systems and who owns what

Core is written and frozen: `config.js` `bus.js` `utils.js` `state.js` `save.js`.
**Read them, never edit them** — post a request to the manager instead.

| module | owns |
|---|---|
| `render.js` `world.js` `toon.js` | renderer, camera, lights, quality tiers; road/river/banks/props, segment recycling, sky |
| `units.js` `army.js` | the unit tier ladder and its meshes; your squad — formation, instancing, spawn/kill, steering |
| `signs.js` `gates.js` `barriers.js` | gate panels and their canvas signage, grow/break/press, numbered blocker walls |
| `combat.js` `vfx.js` `enemies.js` | bullets and damage; muzzle flash, tracers, impacts, explosions, shake, floating numbers; enemy columns and bosses |
| `hud.js` `menus.js` `store.js` `house.js` | in-run HUD; main screen + autoplay backdrop + side rail; both stores; the home block |
| `levels.js` `chapters.js` `story.js` | level generation, chapter tables, difficulty curve, story bubbles |
| `game.js` `main.js` | manager-owned: boot, the run orchestrator, wiring |

Every system exports the same lifecycle:

```js
export function initX(ctx)     // ctx = { scene, camera, renderer, quality }
export function resetX(level)  // tear down last run, build this one
export function updateX(dt)    // per frame, dt in seconds, already clamped
export function disposeX()
```

Systems never import each other sideways. They talk over `bus.js`. Three
exceptions are documented rather than pretended away:

- **`gates.js` and `barriers.js` apply their own damage.** Their hit tests return
  an object with the damage method on it, and that method emits `gate:hit`
  itself. `combat.js` calls the method and must **not** also emit — doing both
  doubles every gate's growth rate. The bus table below reads as if combat were
  the producer; it is not.
- **`army.js` owns `state.troops`** and **`enemies.js` owns `state.bossHp`,
  `state.bossMax` and `state.kills`**, because `applyEffect` and the hit
  resolution hand straight to them.
- **`combat.js` may import `killTroops` from `army.js`.** Enemy fire has to land
  somewhere and a bus round-trip for it would be theatre.

### The bus is the integration surface — these names are exact

```
run:start      {level}
run:end        {win, stats}
army:count     {count, delta, reason}      // gate|kill|barrier|trap|enemy|promote
army:tier      {tier, prev}
gate:hit       {gate, damage}
gate:grow      {gate, value}
gate:pass      {gate, effect}              // effect = {type, value}
gate:break     {gate}
gate:press     {gate, action}
effect:apply   {type, value}               // troops mult tier weapon cash shield power
enemy:killed   {pos, kind}
barrier:broken {pos, value}
boss:hp        {frac}
fx:explosion   {pos, scale, color}
fx:shake       {amount}
fx:number      {pos, text, color}
hud:toast      {text, icon}
story:bubble   {who, text, ms}
```

---

## Performance is the whole art problem

300 friendly + 400 enemy units at 60 fps on a phone means **nothing is a
`Mesh`**. Every crowd is an `InstancedMesh` per tier with a shared geometry, and
the run/idle bob is done **in the vertex shader** from `instanceMatrix` + a
per-instance `aPhase` attribute — the CPU only writes positions. Bullets, muzzle
flashes and impact sparks are pooled instanced quads. Budget: **≤ 40 draw calls**
in a full battle. `?lite` drops shadows and halves crowd caps.

Outlines are **inverted-hull** (a back-face `BackSide` shell scaled along the
normal), not post-process — it survives instancing and costs one extra draw per
tier.

---

## The unit ladder

You always fight as one tier; a `▲` gate promotes the whole squad. Higher tiers
are **fewer, bigger, harder** — promotion converts count at `mergeRatio`, so it
is a real decision, not a free win.

`rifleman → ranger → heavy → jeep → humvee → APC → tank → gunship`

Tanks and above render at roughly 1.3× a soldier, never larger — the reference
crowd stops reading the moment one unit dwarfs the rest.

---

## Story and structure

Short. **One or two bubbles a level, never more.**

1. **THE LONG ROAD HOME** — 24 levels. You are a decorated soldier discharged
   into a country still at war. Ends at the front gate. Unlocks **HOME**.
2. **DEBT** — the house is mortgaged. Missions and events unlock; you grind cash
   and pay it down in the house store.
3. **CONTRACT WORK** — 3 levels, independent operator. Unlocks chapter 4.
4. **TURN OF THE TIDE** — 100+ levels, procedural against an authored curve,
   with hand-written beats every 10.
5. Endless: missions, timed events, house and land upgrades with offline income.

**Levels are gated on power, not just progress.** Each level carries `reqPower`;
your base upgrades produce a `power` score and the level select says plainly
"you are not strong enough yet" rather than letting you fail eleven times.

---

## Screens

- **MAIN** — a level auto-plays behind the UI (real systems, AI thumb). A rail of
  small round buttons down the sides: STORE (locked), STORY, EVENTS (locked),
  HOME (locked). A single big PLAY.
- **HOME** — a small block of land, upgradable, with its own store and offline
  income once it exists.
- Popups are always in-page. **Never `alert()`** — it freezes the run.

---

## Dev hooks

`?dev` debug overlay + `window.__hb`; `?lite` low quality; `?auto` AI plays;
`?level=N` jump; `?chapter=N`; `?wipe` clear save; `?shot=<id>` stage a frame for
the screenshot harness; `?speed=N` time scale.

Headless: `node dev/shot.mjs <url-suffix> <out.png>` against
`python3 -m http.server 8899 --directory ~/cc/yru/site`.
**rAF is throttled when the page is hidden** — the harness drives
`window.__hb.step(dt)` manually and then screenshots.

---

## The LevelDef — the contract between `levels.js` and everything it fills

`buildLevel(spec)` returns one plain object. It is **data only**: no Three.js, no
DOM, deterministic from `seed`. Every world system reads it in `resetX(level)`
and builds its own props from the `items` that belong to it.

```js
{
  id: 'c1l7', chapter: 1, level: 7, seed: 1007,
  name: 'RIVER CROSSING',
  theme: 'valley' | 'town' | 'desert' | 'front' | 'home',
  length: 620,              // metres of road; the finish line sits here
  startTroops: 1,           // before base upgrades are folded in
  startTier: 0,
  reqPower: 120,            // save.js:playerPower() must reach this
  reward: 240,
  mode: 'story' | 'mission' | 'event',
  tutorial: null | 'gates' | 'grow' | 'promote' | 'barrier' | 'trap',

  // Sorted ascending by z. Each system filters for its own `kind`.
  items: [
    // gates.js
    { kind:'gate', z, x, w:3.2, panel:'wood'|'glass'|'button',
      effect:{ type:'troops', value:5 }, grow:true, hp:30, action:null },
    // barriers.js
    { kind:'barrier', z, x, w:6, hp:220, value:220 },
    // enemies.js
    { kind:'enemy', z, x, w:8, count:80, tier:0, form:'block'|'column'|'skirmish', speed:0 },
    { kind:'boss', z, hp:4000, name:'THE COLONEL', tier:6 },
    // world.js
    { kind:'narrow', z, len:40, halfW:3.2 },
    { kind:'prop', z, x, id:'sandbags'|'wreck'|'tower'|'crate' },
    // game.js
    { kind:'pickup', z, x, effect:{...} },
    { kind:'bubble', z, who:'ME'|'RADIO'|'FAMILY', text:'...', ms:2600 },
  ],
}
```

Rules the generator must hold to, because the systems assume them:

- `items` is **sorted by `z` ascending**. Systems binary-search it.
- Gates come in **rows of 2 or 3 at the same `z`**, laid on the lane grid at
  `x ∈ {-3.6, 0, +3.6}`. A single gate on its own is a gift, not a choice, and
  should be rare.
- **Never put a good gate and a trap at the same `z` without a visual tell** —
  the sign colour is the tell (`EFFECTS[type].sign`), so a red panel among blue
  ones is fair and an identical-looking trap is not.
- `length` must leave **≥ 60 m of clear road after the last item** so the run
  ends on a finish line and not on a wall.
- A boss item pins the squad (`RUN.speedBoss`) until its hp reaches 0.

---

## Known open issue: the chapter-4 crowd cap

Chapter 4 at `reqPower` pins at `RUN.maxTroops` (900) on most levels, so squad
growth stops mattering across the back half of the game — SQUAD sensitivity
measures 0.0 there. It is the cap doing its job, not a bug: a real run takes the
best of three lanes on every row while the balance model banks one, so runs
saturate even against an end target pulled down to `0.72 × maxTroops`.

Raising the cap is the fix, but it is not a one-line change: every chapter-4
level is written against a 900-man ceiling and would need re-simulating. Note
that `state.troops` and the *rendered* body count are already separate —
`army.js` keeps counting past `ctx.quality.maxCrowd` and widens spacing instead
— so the ceiling that needs raising is the balance one, not the draw one.
