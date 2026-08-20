# Creatures — the vermin rig, the raider, and the school-column linter

Owned files: `js/world/vermin.js` (new), `js/sim/tables.js`, `tools/lintQuests.mjs`,
`js/world/zones.js` (additive `vermin` block only), and three lines at the bottom of `js/main.js`.

The engineering reference is `../forge_test/NOTES_PEOPLE.md` and `js/world/chicken.js`. Everything
below follows the chicken: procedural geometry, one `InstancedMesh` per geometry, all animation in
the vertex shader off a per-instance `vec4`, contact occlusion as a separate instanced decal, every
number a `quality.register` knob. **No glTF, no skinning, no animation library.**

---

## 1. One rig, three animals, six bestiary rows

`js/sim/tables.js` had six rows saying `geo: 'rat'` and there was no rat. They are now:

| row | `geo` | scale | note |
|---|---|---|---|
| `grain_rat` | rat | 1.00 | L01, the first thing the player ever fights |
| `mire_rat` | rat | 1.22 | |
| `rat_knot` | rat | 0.86 | `pack: 4` |
| `brood_mother` | rat | 2.40 | boss |
| `creek_crab` | crab | 1.00 | |
| `blight_boar` | boar | 1.00 | |

`CREATURES` in `vermin.js` is that mapping. `KINDS` holds the three body specs. Nothing about a
row's *size* lives in `tables.js` — that is art data and it lives with the art.

**The boar shares the rig. The crab shares it too, and that was the marginal call.**

- The **boar** is a quadruped with a different profile: it needed no new code at all, only ring
  data plus two optional parts the builder already had to support (`crest`, `tusk`). Sharing was
  never in question.
- The **crab** genuinely is a different animal — six legs, no neck, sideways gait, pincers. It
  shares the rig because the *parts* generalise, not because a crab is a rodent: `legs` is a list
  of hip/foot pairs rather than a fixed four, each leg carries its own gait phase and a swing
  **axis** (0 = fore-aft, 1 = lateral) in the `aGait` attribute, and the whole instance takes a
  per-kind `yaw` offset so the crab walks sideways with no shader change. What would have justified
  a second rig is a second *animation model* — and it did not need one: three legs a side on
  alternating phases is a tripod gait for free, and the eyestalks ride the `head` part so the
  idle sniff becomes an eyestalk waver.
  The honest cost of that decision is in §6: the crab is the weakest of the three to look at.

The three vermin are **one geometry family differentiated only from `zones.js`**, per the
non-negotiable. The additive `vermin` block carries colour plus three shape multipliers:

| zone | label | `ear` | `tail` | `bulk` |
|---|---|---|---|---|
| light | granary rat | 1.00 | 1.00 | 1.00 |
| neutral | field vole | 0.60 | 0.42 | 1.14 |
| dark | shaft rat | 1.18 | 1.12 | 0.92 |

A vole is a rat with small ears, a stub tail and a fatter body, and that is exactly what those
three numbers say. There is no `if (zone === …)` anywhere in `vermin.js`; a rat picks up its town
from `zoneAt()` at spawn.

`verminName(zoneId)` exports the label for whoever writes the kill feed.

## 2. Cost — measured, not estimated

`__forge.vermin.cost()`, at `vermin_cast` with 32 creatures live:

| geometry | triangles |
|---|---|
| rat (any zone) | **198** |
| boar | **192** |
| crab | **172** |

- 32 creatures = **5,646 triangles in 5 draw calls** (one per kind × zone in view), plus **609**
  for the contact discs in one more call.
- A 24-rat crowd — the realistic granary/nest number — is **4,752 triangles, one draw call.**
- Textures: **one** 96×96 fur map, `vermin:fur`, **0.047 MB**, tracked through `budget.js`
  (verified in `texBreakdown()`, not assumed).
- `wall_day` before and after this pass: **77 calls / 186,542 triangles, unchanged.**

That last line is deliberate. **The default population is 0.** Nothing places vermin yet — the
spawner is Track D's — and the gate profile is already 47 % over. The five critic scenarios and the
budget tool are therefore bit-identical to before. The `vermin` knob raises the count; the `?dev=1`
scenarios raise it themselves.

Geometry and materials are built **lazily per (kind, zone)**: at count 0 no mesh, material or
geometry exists at all. Only the fur texture and the agent list are built at boot.

## 3. Animation — five states, all in the vertex shader

Per-instance `aInst = (cyc, speed, act, at)`, exactly chicken's contract. `act` is
0 none / 1 attack / 2 hurt / 3 die; `at` is 0–1 through that act. Per-vertex `aPart`, `aPivot` and
`aGait (phase, swing, axis)`.

- **idle** — breathing scale, a sniff that dips the head on a sine, slow head yaw, tail flick.
  Amplitudes are per-instance-seeded so a nest does not pulse in unison.
- **move** — diagonal-pair leg swing off the gait phase, foot lift, body bob at 2× stride, spine
  sway, tail sway, head bob. `cyc` is advanced on the CPU by *distance / stride*, so the feet do
  not skate whatever the speed.
- **attack** — windup (crouch, gather) 0–0.26, drive 0.28–0.56, settle to 0.86. Body rears, head
  thrusts, forelegs kick, tail lifts.
- **hurt** — a 0.45 s recoil: pitch back, shove backwards, head up.
- **die** — 1.3 s roll onto the flank (`rotZ` 1.45 rad), sink by half the hip height, legs curl,
  head drops. Holds at `at = 1` forever.

`verminPose` pins every agent to a named state and `verminPhase` scrubs it, which is how the pose
shots are taken; `verminFace` forces a heading so a pose can be framed from a chosen side.

### Two bugs a render found and no number would have

1. **The body was animating as the tail.** The part chain read
   `if (part > 0.5 && part < 1.5) {head} else if (part < 2.5) {tail}` — part 0 is *less than 2.5*,
   so the body took the tail's rotation about the origin: a 31° swing on top of the lunge pitch,
   with the head and legs (correctly branched) staying put. It looked exactly like the creature
   coming apart. `chicken.js` guards both ends of every branch; copy that, always.
2. **The boar's bristle crest floated 44 cm above its back**, as three dark sails visible from
   across the field. Two causes: a stale `+0.44` in the crest builder, and — the interesting one —
   the crest was authored against the *analytic* ellipse while the mesh is a hexagonal prism whose
   topmost vertex sits at `0.866 r`. `backY()` now samples the same top the loft actually builds.

### One design rule that came out of it

**Every translation in the shader is authored in rat metres and multiplied by `uKind.w`.** A 5 cm
head thrust is a third of a rat's head and invisible on a boar. Sizes: rat 1, crab 1.3, boar 3.4.
Rotations are not scaled — an angle is an angle.

## 4. What the renders actually looked like

`?dev=1` registers eight scenarios: `vermin_close`, `vermin_nest`, `vermin_play`, `vermin_cast`,
`vermin_boar`, `vermin_crab`, `vermin_attack`, `vermin_die`.

```bash
node tools/shot.mjs --shot=vermin_nest --set="dev=1" --w=1280 --h=720 --dpr=1
```

- **`vermin_nest` (3 m, the shot that matters)** — reads as rats without hesitation: dark spine
  stripe over pale flanks, pointed snout, pink tail, ears breaking the outline.
- **`vermin_play` (gameplay camera, ~7 m)** — reads as small brown animals with tails. Legible,
  not identifiable. The tail and the countershaded spine are doing all of the work at that range;
  the ears are gone. This is the honest limit of a 200-triangle creature 32 cm long.
- **`vermin_close` (0.8 m)** — faceted, on-style, and the head is the best part of it.
- **`vermin_die`** — flat on the flank, legs tucked, tail out. Good.
- **`vermin_attack`** — a rear-and-lunge that reads as intent. Needs a playtest, not more sanding.
- **`vermin_boar`** — reads as *a large hunched beast*, not yet as *a boar* (§6).
- **`vermin_crab`** — reads as an arthropod: flat shell, six legs, two pincers (§6).

Three geometry fixes came only from looking:

- 6 segments around a rat's body puts a **flat plate across the spine** and the animal reads as a
  beetle. The rat is 8; the boar keeps 6 because the crest hides the seam and the crab keeps 6
  because a flat carapace is correct.
- The first ears were **rectangles floating beside the head**, because only the tip was shaped and
  the base was not on the skull. Both base corners now sit on the surface.
- The body cap vertices called the colour function with no dorsal argument and got **`NaN`
  colours** — a black wedge on the rump of every rat, and the whole front of every crab.

## 5. The `raider`, and what it exposed

`STORY.md` §L18 is "robed casters with black staffs". No such enemy existed, so
`data/quests/light.json`'s `light.18` substitutes **`hollow`** — a level-10 enemy, in a level-8
act, that is `immune: ['cull']` — alongside a crow flock. Added:

```
raider: level 8, hp 226, armour 21, damage 23.3, geo 'people',
        xp { cull 180, kindle 250, ward 90 }, drops [['staff_shard', 1]], mk 20
```

- `hp` and `damage` are the level-8 formula values, which `combat.test.js` checks for every
  non-boss row; `armour` 21 sits between `blight_boar` 20 and `hollow` 22.
- XP totals **520**, the same as `blight_boar` at the same level, redistributed toward the caster
  schools — Kindle up, Cull down, because a robed caster is not vermin.
- `staff_shard` is valued **50**, between `boar_tusk` 40 and `hollow_ash` 60.
- Added to `REGION_ENEMIES.whitewall_upper`, which is L18's region. Nothing consumes that table
  yet (`soak.mjs` has its own band pool), so this is data, not a balance change.

**`raider` uses the existing robed biped.** `geo: 'people'` — no new rig. What distinguishes it is
`zones.js`'s `dark` robe and `staffTip: { shape: 'spike' }`, which already exist.

**Not fixed, because the quest data belongs to another agent:** `data/quests/light.json` still
sends a Hollow to the raid. Swapping `hollow` → `raider` in `light.18` is now a one-word change.

## 6. Open — in the order I would do them

1. **The boar reads as a heavy wedge-headed beast rather than a boar.** From the side it is right
   (humped shoulder, falling rump, low head, stub tail); from the front the head is a big pale
   panel and the animal reads tapir-ish. The fix is a narrower muzzle and a darker face, not more
   triangles.
2. **The crab's shell reads slightly concave** — a flat carapace whose upper facets catch the sky
   while the rim stays dark. Doming the middle ring is a two-number change.
3. **At gameplay range a rat is a brown lozenge with a tail.** If it needs to be more than that,
   the cheap wins are a lighter rump patch and a higher-contrast tail, not geometry.
4. **Nothing spawns vermin.** `Vermin.spawn()` seeds nests around building footprints and a `?dev`
   cast, but the population knob defaults to 0. Track D's encounter spawner should drive
   `setCount` / place agents by region from `REGION_ENEMIES` and `SPAWN_RADIUS`.
5. **No hit reaction is wired to combat.** `act = 2` (hurt) and `act = 3` (die) exist and are
   correct; nothing calls them yet.
6. **Agents walk through each other.** Building collision is honoured via `walkStep`; creature
   separation is not.

## 7. The linter rule — `schoolPayErrors`

> A quest's school column must not name a school that none of its enemies can pay.

In `tools/lintQuests.mjs`. It checks each `campaign.js` story quest's `schools` against the
enemies its `work` fights, and again against the enemies its *pack* actually fights when the two
lists differ. A school is excused if a non-kill verb in the same quest pays it (`absorb` → Ward,
`evade` → Glamour, `catch` → Line, and so on), and only schools that some enemy somewhere pays are
considered — naming Barter on a fight is not this rule's business.

`paysSchool` is `school in enemy.xp && !enemy.immune.includes(school)`, which is exactly what
`soak.mjs` awards on a kill.

**Verified by mutation.** Copy `data/` to a scratch root, delete `sour_crow` from `light.18`'s
fight so the raid is only the substituted Hollow, and it fires:

```
light.18: school column names cull, but every enemy it fights (hollow) is immune to it or never pays it
```

That is the missing-`raider` signature: the pack substitutes whatever rig exists, and the school
column silently stops meaning anything. In the shipped packs the crows still pay Cull, so the real
tree does not trip on L18 — but it trips on four other quests, and all four complaints are true:

| | |
|---|---|
| **L11** Escort West | names **Ward**, fights only `rat_knot` (Cull/Kindle), and has no `absorb` work. Either give it `['absorb', …]` or drop Ward from the column. |
| **L23** The Strike on Blackstone | names **Cull** against `hollow` (immune) and `watchman` (no Cull). The one the brief predicted. |
| **D19** Below the Bottom | names **Cull** against `hollow` alone. Immune. |
| **D21** The Night We Came Back Up | names **Cull** against `watchman` alone, which never pays it. |

They are reported on their own `school` channel, not as warnings, because `js/game/packs.test.js`
asserts the warning list only ever holds two known strings and all four offenders live in files
this pass does not own. **Fold `schools` into `errors` the moment they are fixed** — that is one
line at the bottom of `lintAll`.

## 8. Wiring, and the one awkward thing about it

`js/main.js` gains three lines at the very bottom:

```js
import { Vermin } from './world/vermin.js';
window.__forge.vermin = app.add(new Vermin(demo.terrain));
refreshPanel();
```

The `import` is hoisted, so `vermin.js` evaluates before `main.js`'s body — which is why the dev
scenarios are **registered at module scope, not from the constructor**: `main.js` resolves
`?shot=` at line 65, long before the bottom of the file, and a scenario defined by the instance
would never be found. `refreshPanel()` is there for the same reason — `buildPanel` runs at line 48
and would otherwise miss every Vermin knob. It is already imported by `main.js`; this is the same
call `play()` makes after the session registers its own knobs.

Consequence worth knowing: **`?vermin=8` on the query string does nothing**, because `applyParams()`
runs before the knob is registered. Use a dev scenario, or the panel.

## 9. Verification at hand-off

```
node --test                      296 pass, 0 fail
node tools/lintQuests.mjs        0 errors, 7 warnings, 4 unpayable school columns
node tools/budget.mjs            clean; vermin contributes nothing at count 0
node tools/shot.mjs --shot=wall_day --w=1280 --h=720 --dpr=1
                                 77 calls / 186,542 tris — identical to before this pass
```

`tools/budget.mjs` rewrites `docs/BUDGET_LATEST.json` as a side effect; whoever owns the culling
pass should re-run it after theirs lands.
