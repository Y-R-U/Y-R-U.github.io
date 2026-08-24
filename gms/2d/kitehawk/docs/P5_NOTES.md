# P5 — combat, the AI and the Duel

**Nine real defects, three of them in the airframe P4 handed me and invisible to every
test P4 ran, because P4 only ever flew ONE aeroplane and only ever flew it to the
right.** The duel is the first time two aircraft have existed at once in this project,
and it found: a force-resolve buffer shared between every aircraft in the world; a
canopy that starts on the wrong side of any aeroplane heading left; a virtual pilot
that flies the exact opposite of what it is told when the canopy is on that side; two
gun ports that diverge instead of converging on half the roster; an aim error applied
in world axes, so "lead" is a lag for anything flying west; a best-of-three that was
best-of-one; a head-on trade that always went to the player; a morale table with two
event rows nothing ever called and two rate rows that buried the rest; and a
lock-stability fixture that could not detect the removal of the thing it tests.

Every one was found by running something and reading the number, not by reading code.

```
node tools/sim.mjs --purity          the module graph, walked
node tools/sim.mjs --combat          the gunnery rig: TTK, aspect, range, tiers
node tools/sim.mjs --p5fixtures      10 combat fixtures
node tools/sim.mjs --p5gates         C1-C10
node tools/sim.mjs --matrix          the duel matrix
node tools/sim.mjs --counterplay [--placebo]
node tools/sim.mjs --flee            the squadron patrol, gate C8
node tools/sim.mjs --duel A5 --runs 200 [--counter neverMerge]
node tools/sim.mjs --break <switch> --p5fixtures
node tools/sim.mjs --colliders span  R-10 read literally, for comparison
node tools/sim.mjs --enemies-json    regenerate data/tables/enemies.json
python3 -m http.server 8731 && open /tools/pages/duel.html
```

---

## 1. What landed, and the three P4 defects underneath it

```
js/sim/entities.js   roster, entity pool, world tick, framing contributions   ~430 lines
js/sim/weapons.js    cone, target priority, projectiles, ballistics            ~330
js/sim/damage.js     colliders, hit allocation, components, death spiral       ~400
js/sim/ai.js         nine states, three dials, morale, formations, 16 aces     ~700
js/modes/duel.js     §7.5's rules, stepped one tick at a time                  ~300
tools/pages/duel.html  the duel drawn, driven by the shipping modules
tools/lab/*.mjs      the isolation experiments this phase needed
data/tables/enemies.json   GENERATED mirror
tools/BLESSED_P5.md  the anti-mock record
```

> **Corrective pass (D80).** All three P4 defects below are now **fixed at root**, not
> worked around, and every workaround has been deleted rather than left alongside the
> fix. `js/sim/aero.js`, `flight.js` and `pilot.js` were transferred to P5 for that pass.
> `pilot.js`'s three tiers are un-quarantined and `k` is monotone across them. What each
> root cause actually was is in §1.1–§1.3 and §4.2; the evidence that the family is
> closed is C7 at **49.6% pooled over 1,200 mirror duels**.

### 1.1 `aero.js` resolves every aircraft's forces into one shared object

`forces()` writes into a module-level `OUT` and `flight.js` keeps the reference as
`e.aero`, reading it back next tick as the `gamma_dot` feed-forward. With one aeroplane
that is correct and cheap. With two, **every aircraft's `aero` is whichever aircraft
updated last**, so the feed-forward is somebody else's.

Measured: a commanded 1.8 g pull produced 0.47 g, alpha sat at −0.5° against a
commanded +1.4°, and the AI could not hold a nose position at all.

**Root cause: an output buffer whose lifetime was longer than its scope.** `forces()`
defaulted `out` to a module singleton, and `flight.js` *retained* the returned reference.
Fixed by making the aircraft own it: `createForces()` allocates one per aeroplane at
`createFlight`, `integrate()` writes into `e.aero` in place, and **`forces()` no longer
has a default `out` at all** — a shared buffer is not something a caller should be able
to get by accident. A `resolved` flag preserves the old `e.aero === null` first-tick
semantics exactly, which is why every P4 gate and fixture hash is unchanged by this fix.
The `keepAero` workaround is deleted.

**The pattern appeared twice.** Going looking for it found the same defect in P5's own
`ai.js`: `createFormation` handed every wingman one shared point object, and
`pilot.setIntent('point', obj)` *retains* it — so every wingman in a formation flew to
whichever station was written last. Now one point per wingman. The other module-level
scratch objects in `js/sim/` (`SEG`, `HIT`, `LEAD`, `EV`) are consumed inside the call
that fills them and are safe; the two that were not are the two that were retained.

### 1.2 `roll` is which side the canopy is on, and every hostile started inverted

`inverted = roll * cos(theta) < 0`, so an aeroplane heading −x is upright at
`roll = −1`. Everything hostile in this game flies −x. The pool seeded `roll = 1`, so
every opponent spawned upside down and spent the merge rolling out of it.

### 1.3 The virtual pilot cannot fly an upright aeroplane heading left — and neither can four of its six intents

Two separate faults in `pilot.js`, both invisible to P4 because every fixture flies +x:

- **The load-factor conversion mis-signs `roll`.** It computes
  `nWant = cos(gamma)*roll − v*gd/g`; the correct relation is
  `roll*(cos(gamma) − v*gd/g)` — the `roll` belongs on both terms. At `roll = −1` the
  turn-rate term inverts and the pilot flies the opposite of its command. Isolated in
  `tools/lab/roll.mjs`: told to climb 300 m, a +x aeroplane reaches **738 m** and a −x
  one reaches **312 m**, having dived.
- **`level`, `hold`, `climb` and `speed` return ABSOLUTE flight-path angles**, so
  `level` means "fly east", not "fly level"; and `turnUp` returns `−pi`, whose error
  against `gamma = pi` wraps to exactly zero, so **a hard break is a no-op for half the
  roster**.

Cost, measured before it was found: in a perfectly symmetric mirror fight the aircraft
that started flying +x won **79 of 80**.

**Both fixed at root.** The load-factor conversion is now `nWant = s·(cos γ − v·gd/g)`,
with the `roll` on both terms where the algebra puts it. The flight-path intents are
expressed as a **climb angle about the aircraft's own horizontal direction** and
converted once (`headed()`): eastbound `γ = −χ`, westbound `γ = χ − π`. `dive` keeps its
absolute angle, because straight down is straight down whichever way you were going.
`turnUp`/`turnDown` are relative to the current flight path and signed by `roll`, so they
saturate from any attitude instead of wrapping to a zero error.

Verified by the isolation that found it: told to climb 300 m, eastbound reaches **739 m**
and westbound **736 m** (was 312 m, having dived). `hold 600` now flies a mirrored path
either way (606.1 m east, 607.4 m west). P5's mirrored-bearing workaround is deleted —
and it is worth recording that with the root fix in, the old workaround *breaks* the
same test (309 m), which is what a workaround should do once the thing it worked around
is gone.

---

## 2. The hit model

### 2.1 Geometry, and the ruling I could not implement as written

Three capsules and four fuselage sub-rects, in a body frame where `bx` is forward from
the CG and `bn` is the body normal with **positive = belly** (DESIGN §3.1 writes the
upper wing at `−0.9 n`, so its `n` already points at the ground).

R-10 gives *"upper wing 11.0 × 1.17 m offset −1.17 n, lower wing 10.4 × 1.17 m offset
+0.91 n"*, rescaled from DESIGN §3.1's 8.5 and 8.0 m. **Those are wingspans** — a
Camel's span is 8.5 m against a 5.7 m fuselage — and this is a side-view game, where a
wing is seen edge-on and is one chord long.

Taken literally the set does not merely misrepresent the aeroplane, **it deletes a
mechanic**: capsules 11 m long roof and floor the whole 9.6 m fuselage, so the tank and
the pilot cannot be hit from any aspect, and "six o'clock low" becomes identical to
"six o'clock". Both sets ship. `--colliders span` selects the literal reading and
`--combat` prints the component histogram for each. T2 Vickers, 45 m, everything on
target, damage by component:

| aspect | set | structure | engine | wingU | wingL | tail | fuel | pilot |
|---|---|---|---|---|---|---|---|---|
| dead astern | profile | 65.7 | — | — | 6.0 | **12.3** | 10.9 | 8.2 |
| astern low | profile | 62.7 | — | — | 19.1 | 12.0 | **10.9** | — |
| astern high | profile | 60.8 | — | 6.0 | — | 12.3 | — | **8.2** |
| head-on | profile | 61.4 | **16.4** | — | — | — | — | — |
| above | profile | 65.6 | — | **19.1** | — | — | — | — |
| astern low | **span** | 62.4 | — | — | 19.1 | — | — | — |
| astern high | **span** | 62.4 | — | 19.1 | — | — | — | — |
| above | **span** | 62.4 | — | 19.1 | — | — | — | — |

Under R-10 read literally, astern-low, astern-high, abeam and above are **the same
row**. Shipped is the profile set. It is recorded here rather than as an OBJECTION in
`HANDOFF.md` because I do not own that file; the manager should treat this paragraph
as one.

```
COLLIDERS_PROFILE  fuselage 9.60 x 1.82 at (0, 0)
                   wingU    5.40 x 1.10 at (+1.00, -1.30)
                   wingL    5.00 x 1.10 at (+0.80, +0.95)
SUBRECTS           engine  bx [+1.60, +4.80]  full depth
                   pilot   bx [-2.50, +0.70]  bn [-0.91, 0.00]   (upper half)
                   fuel    bx [-2.50, -0.95]  bn [ 0.00, +0.91]  (belly, aft of the wing)
                   tail    bx [-4.80, -2.50]  full depth
```

### 2.2 Entry point, not closest approach

A round covers 7 m in a tick against a 3.25 m target, so the step is traced as a
**segment** against the capsules. The first version used the closest approach to the
capsule axis, which is degenerate for a round fired from dead astern — its distance to
the axis is constant, the solver returned `s = 0`, and the impact point came out
*behind the aeroplane*. Every astern hit was allocated to bare structure and **the tail
took zero damage in every test**. The bench looked entirely reasonable while measuring
the wrong thing. Fixed with a bisection for the true entry point.

### 2.3 Over-penetration is what makes the numbers work

DESIGN §3.1 says a round does its damage to the component **and** 35% to Structure, and
in the same section computes a time-to-kill of 0.56 s from `60 / 108` — which is the
arithmetic you get with **no** spill at all. The two statements cannot both be true and
gate C2's 0.4–0.8 s band is derived from the second.

What is implemented is §3.1's rule plus two consequences of it that are physically
forced, not tuned:

- a component at zero absorbs nothing, so the round's **full** damage goes to Structure;
- **overkill carries** — a round that takes the last 2 HP off a spar puts the other 4
  through.

Concentrated fire therefore punches one hole and bores through, while fire spread
across three components is soaked by all three. That is the same fact as "six o'clock
is the deadly position", and it is what the two-gun straddle costs you inside 40 m.

**Measured, T2 Vickers on a 60 HP Kestrel, 50 m, every round on target: 0.87 s.**
Gate C2 wants 0.4–0.8. The band is only reachable with the spill set to zero, i.e. with
components deleted. **I did not move the threshold and I did not delete the spill.**
See §8.

---

## 3. Guns

Ruling R-09 verbatim. SI is authored, wu derived.

```
cone half-angle    +-11 deg      no close-range snap bonus
effective range    66 m = 440 wu
tracer             105 m = 700 wu
convergence        40 m = 267 wu
acquire delay      0.08 s
muzzle             420 m/s + own forward speed
dispersion         0.6 deg, 1 sigma, per round
drop               0.35 g
gun ports          +-0.55 m on the body normal
```

**The assist decides when, never where.** `pickTarget` uses the ±11° acquisition cone
and §2.5's scoring and 0.40 s hysteresis verbatim; `updateGun` squeezes only when the
**true lead solution** is inside a separate, stricter *trigger* cone. `Cool Hand` sets
that to 2°. An AI's `k` sets it to `11° × (1 − 0.25k)`. Nothing anywhere moves a bullet.

Falsification: `--break hitscan` puts the round on the target instantly. Every aspect
in the table above then produces the **identical** histogram (pilot only), which is what
deleting the geometry looks like.

### 3.1 Register T11: the close-range straddle does not discourage ramming, and I can prove it

DESIGN §2.6 claims that because the streams converge at 40 m they straddle a small
target inside that, so the hit rate *drops* when you ram. Measured, dead astern, time
to kill a Kestrel:

| range | two guns | one gun |
|---|---|---|
| 5 m | **0.55 s** | 2.18 s |
| 8 m | 0.78 | 2.63 |
| 20 m | 0.80 | 2.82 |
| 40 m | 0.85 | 3.45 |
| 55 m | 1.02 | 3.50 |
| 66 m | 1.03 | 3.22 |

Ramming is **1.6× faster**, not slower, and it is faster with one gun too — so it is
time-of-flight, not convergence. A 1.1 m gun separation cannot straddle a 1.82 m
fuselage at any range; to make the claim true the ports would have to sit at ±0.95 m,
i.e. on the wings. **T11 as stated is refuted.** The disincentive to ramming in this
game is the collision (60 damage each, §3.4) and the auto-throttle's anti-overshoot
cut, both of which are real. The fixture stays red on purpose.

---

## 4. The nine states

`PATROL CLIMB ENGAGE ATTACK_RUN EXTEND DEFEND CRATE_RUN BUG_OUT WRECK`, chosen on a
**fixed 0.40 s cadence for every pilot**, driven by `E_rel = E(self) − E(player)` in
metres.

| condition | state |
|---|---|
| dead | `WRECK` |
| leader killed within 2.5 s | frozen, straight, guns cold |
| `nerve < 0.42`, or already fleeing and `nerve < 0.72` | `BUG_OUT` |
| no target, or target beyond 500 m | `PATROL` / `CLIMB` |
| `E_rel > +80` | `ATTACK_RUN` |
| `E_rel < −60`, hostile astern inside 150 m, six checked | `DEFEND` |
| `E_rel < −60`, otherwise | `EXTEND` until 250–400 m of separation, then `CLIMB` |
| −40 … +80, `aggro >= 1` | `ENGAGE` |
| −40 … +80, `aggro < 1` | `EXTEND` → `CLIMB` |

Three deviations from §5.2, each forced by a measurement:

- **A 500 m engagement range.** Without it a formation leader is in `ENGAGE` from the
  first tick of the level, his wingmen never hold station, and §5.2's element split has
  no window to exist in — the fixture that tests it could not have gone green.
- **`EXTEND` terminates.** §5.2 says "run 250-400 m"; the first version read "run", and
  two aeroplanes left the level in opposite directions for sixty seconds at a stretch.
- **A ground floor at `120 + speed` metres.** A defensive spiral "toward the ground" and
  a bug-out "dive for their own line at max speed" are, taken literally, instructions to
  fly into the dirt, and `ground` was the **modal cause of loss in every cell of the
  matrix**. P4 measured the dive recovery at 88 m from Vne and it scales with speed, so
  the floor does too.

### 4.1 Steering

Everything goes through `point` and nothing through `level`, `hold`, `climb`, `speed`,
`turnUp` or `turnDown` — see §1.3. On top of it:

- **The merge break.** Two aircraft in pure pursuit on a head-on fly into each other; a
  pilot breaks, and which way is an energy decision: fast, break **up** and spend the
  excess on angle; slow, break **down** and buy speed back. That one line is most of
  what makes a fight look like a fight, and the scissors falls out of it without
  anybody writing a `scissors()`.
- **Energy discipline.** A pilot below corner speed with no shot available eases the
  pull toward the sustained rate instead of the instantaneous one. F8 and F9 are the
  whole reason: 95 vs 74 °/s, at 7.2 m/s of energy every second. `DISCIPLINE = 0.55`,
  and it is deliberately **not** scaled by `k` — see §5.

### 4.2 `k` had to be made monotone, and it took five attempts

A skill dial that does not order pilots is worse than no dial. Measured on the exact
mirror, player win rate against the same ace at `k` 0.25 and 0.95, two independent seed
sets at the end:

| build | k 0.25 | k 0.95 | gradient |
|---|---|---|---|
| as first written | 78.6% | 90.0% | **−11.4 pts (backwards)** |
| discipline unscaled from `k` | 71.4% | 100% | **−28.6 (worse)** |
| aim clock split from the state clock | 90.9% | 80.0% | +10.9 |
| tiers quarantined (P5's first answer) | 49.1% | 34.0% | +15.2 |
| **tiers restored, both `k` errors on the trigger** | **62.6%** | **46.6%** | **+16.0** |

Five causes, none of them visible in a morale or accuracy trace, and the last two only
findable by pinning one dial at a time (`tools/lab/dials.mjs`, `setDialLock`):

1. **P4's `envelope` divided `nMax` before the stick was solved**, so a *smaller*
   envelope produced a *larger* stick — the novice out-pulled the ace. Fixed at root:
   `envelope` now caps the commanded stick, which is what "the fraction of the envelope
   it will use" says.
2. **A high envelope is then a liability**, because P4's F8/F9 price a max-rate turn at
   7.2 m/s of energy per second and the `ace` tier may command all of it. Fixed with an
   **energy governor** in `pilot.js`: below corner speed every pilot is capped
   identically, so nobody spirals into the deck, and the envelope only differentiates in
   the fast regime where spending it is affordable.
3. **The reaction period was driving state selection.** At `k` 0.95 that is 4.5 decisions
   a second and the AI thrashed. Aim and state are now on separate clocks.
4. **The lead-solution error was perturbing the flight path.** A sloppy aim flies a wider
   pursuit curve, and in this model a wider curve is *free energy* — so a better aim was
   a straight energy penalty. Moved to the trigger, where §5.2's wording puts it.
5. **So was the angular aim error**, and it is worth 14 points on its own. Both now
   perturb what the pilot *believes* the solution to be; the AI always steers at the
   true solution, as well as its tier allows. `k` is then monotone by construction —
   better judgement about when to fire cannot make a pilot worse.

The dial isolation is the transferable part. The control row read −18.9 points; locking
the aim error alone read **+2.3**, while locking the reaction period, the trigger cone or
the check-six period left the inversion untouched. That is a one-line answer to "which of
five things is it", and no amount of reading the code produced it.

**The tiers are un-quarantined.** `k < 0.45` flies `novice`, `< 0.75` `competent`, above
that `ace`, and the ladder contributes about 10 of the 16 points of gradient with the
dials contributing the rest. `tools/lab/sym2.mjs` shows the `ace` tier's 73% heading bias
is gone — it was the same root cause as §1.3, exactly as suspected.

### 4.3 The `k` error is held, not resampled

§5.2's two errors — lead wrong by `N(0, (1−k)·0.9)` aircraft lengths, aim wrong by
`N(0, 6−5k)` degrees — are drawn once per aim decision and **held**. Per-tick noise
averages to zero over a burst and `k` would measure nothing, which is the shape D43
called the believable-wrong metric. `--break aim-noise-per-tick` restores the failure.

They are also applied **about the line of sight**, not as a world `(x, y)` offset. A
world offset is heading-dependent: `+lead` on x is a lead for an aeroplane flying east
and a lag for one flying west, which is a systematic advantage to half the roster that
no summary statistic would ever show.

### 4.4 Morale — four defects, and the flee rate read 0.0%

§5.2's table is six rows. As first implemented the flee rate measured **exactly zero**,
and a per-tick morale trace showed a perfectly healthy number that had simply never
moved. Four things were wrong:

1. **Two rows are events and nothing ever called them.** `onFriendlyLost` and
   `onPlayerKill` existed as methods with no caller.
2. **The death notification looked in the wrong place.** It checked for a transition
   inside the damage pass — but the kill happens in `updateBullets`, which runs *before*
   it, so every aircraft was already flagged dead by the time anything looked.
3. **Two rows are states, not rates.** "+0.20 aura *while* an ace is alive within 600 m"
   and "+0.10 per friendly numerical advantage *step*", integrated per second, add a
   quarter point of nerve every second a squadron is winning and drown every negative
   row. They are now offsets; the flee test reads the sum.
4. **The regen was uncapped.** "+0.05/s regenerating *toward* the unit's base" — toward,
   and no further. Uncapped it adds six whole points over a two-minute patrol.

Then, and only then, was there anything for register **T24** to tune. §5.2's guesses
gave 4.2% against C8's 12–22%. Shipped: `damage −0.90`, `wingmanDied −0.30`,
`playerKill −0.15`, **flee threshold 0.42**, plus a commitment hysteresis — once you
have decided to run you keep running until `nerve > 0.72`, because without it the
regen lifted a fleeing pilot back over the line while he was disengaged and he turned
round and came back (591 bug-out decisions produced 7 aeroplanes that actually left).
**Measured 15.8%** over 40 patrols, 240 hostiles.

### 4.5 Formations

Leader plus wingmen at §5.2's stations, wingmen holding until the leader enters `ENGAGE`
or `ATTACK_RUN`, then splitting. Killing the leader freezes the formation for **2.5 s**
— straight and no shooting — which is the counter to A11 and is worth **+17 points** of
win rate, measured. `--break no-promotion` removes it.

---

## 5. The `ace` pilot tier — quarantined, diagnosed, and released

`tools/lab/sym2.mjs` runs a perfectly symmetric fight — same type, same AI, same `k` —
in both directions, and counts. Before the root fix:

| both sides on | A starts left | A starts right |
|---|---|---|
| `novice` | 22 / 35 | 28 / 28 |
| `competent` | 33 / 24 | 26 / 34 |
| **`ace`** | **16 / 44** | **44 / 14** |

On `ace` the aeroplane that starts flying **left wins 73%** from heading alone; on
`competent` the same fight is even. It was not localisable from inside P5's files,
because the cause was in `pilot.js`: the finer stick quantum of the `ace` tier resolved
the roll-sign error of §1.3 more sharply, so the tier that flew *best* amplified the bias
worst. With the sign fixed the same table reads **30/27 and 25/26** at `k` 0.70 and
**35/16, 28/19** at 0.90 — even, and the residual is the side-order variance that C7
measures properly. The tier is back in service.

---

## 6. The duel

§7.5's rules, stepped one tick at a time so `tools/sim.mjs` and `tools/pages/duel.html`
drive the identical object and there is no second copy of the round logic.

Two rule bugs, both of which flattered the player:

- **Best-of-three was best-of-one.** "Nothing heals between rounds" was applied to a
  shot-down aeroplane as well as a surviving one, so the loser of round 1 started round
  2 with zero structure and died in the first second. It applies to a **survivor**; an
  aeroplane that was destroyed is gone and you fly another one.
- **Every mutual kill went to the player**, because the round-end check tested the ace
  first. Worth **17 points** in the mirror cell — a thumb on the scale in exactly the
  place a mirror duel exists to measure. A mutual kill is a draw.

`swap` puts the player on the right and the ace on the left. Nothing about a duel should
depend on which way round it is set up, and it is the cheapest possible test of that —
it is what would have caught §1.2 and §1.3 on the first day instead of the third. The
matrix alternates it seed by seed.

**Win rate is over decisive duels.** A best-of-three that ends level is not half a loss,
and counting draws in the denominator makes a stalemating ace — S2 exists to stalemate —
read as a beating.

---

## 7. The roster and the sixteen aces

`ENEMY_TYPES` is DESIGN §5.1 in SI. `CD0` is **not** authored: §5.1 gives `m / S / T0 /
V_max` and those four over-determine it, so it is fitted from the declared top speed and
the flutter term from R-08's `terminal = Vne × 1.02–1.05`. Anything hand-typed would be
a fifth number disagreeing with the other four.

Sixteen behaviour profiles: DESIGN §5.3's twelve, plus the four STORY §3.3 asks for that
§5.3 has no profile for. R-11 says the *names* are P11's; these are the behaviours.

| # | implemented | stubbed / needs |
|---|---|---|
| A1 boom-and-zoom | never turns below 45 m/s; will not fight a slow, low opponent at all; re-climbs to `E_rel +150`; attack runs break off at 90 m against a slow target | — |
| A2 flat turner | locks 26–30 m/s, never extends | — |
| A3 energy mirror | samples the player's `E` every 0.5 s and matches it; engages inside 220 m | — |
| A4 cloud ambush | enters the deck, is invisible beyond 150 m inside it, re-emerges | — |
| A5 armoured head-on | 0.55 armour, accepts only head-on merges, heavy merge gun | — |
| A6 bait pair | lead flies predictably and invites the shot; trailer kills | — |
| A7 runs dark | undetectable beyond 200 m unless he fired in the last 1.5 s | the audio half is P15's |
| A8 storm updrafts | authored +6 m/s bands, available to both sides | the rain-streak tell is P16's |
| A9 hunts crate carriers | target filter is live | **needs crates (P6)** |
| A10 no gimmick | — | — |
| A11 commands a finger-four | real formation, 2.5 s promotion delay | — |
| A12 mirrors your loadout | exact airframe/gun/HP mirror | traits at P13 |
| S1 Drach, hunts silk | refuses a turning fight, 90 m cannon | **silk needs crates (P6)** |
| S2 Grelle, blocks | positions between you and the objective, never shoots first, effectively unkillable, wins on the clock | the crate is a **proxy**: a point 70 m across |
| S3 the Ferbers | two-ship, bait and killer | the "drive one off and the other follows him home" bond is the counter, measured |
| S4 Sohl, replay mirror | flies the player's loadout | the recorded flight-profile mirror needs the Long Patrol (P14) |

`k` and `morale` are §5.3's, unchanged — they are the ace's character. What the matrix
set is `hp`: one monotone lever, fitted per ace (`tools/lab/fit.mjs`).

---

## 8. The gates

`node tools/sim.mjs --p5gates --runs 120 --full` — the run behind these numbers is in
`shots/p5/gates.txt` and `shots/p5/gates.json`. **6/10 pass.**

| # | criterion | measured | |
|---|---|---|---|
| C1 | purity across the sim graph | 9 modules walked, 0 violations | ✅ |
| C2 | time-to-kill on target | **0.87 s** on a 60 HP scout; 9.78 s for one Kestrel on the player | ❌ band 0.4–0.8 |
| C3 | player lethality ratio | **11.3×** | ✅ 10–18 |
| C4 | intended tier wins 55–70% | 8 of 16 aces inside | ❌ |
| C5 | sidegrades 45–65% | 14 aces have at least one cell outside, over 51 cells | ❌ |
| C6 | counter-play ≥ 18 pts | 4 of 11 measurable counters clear it | ❌ |
| C7 | the mirror ace at k 0.90 | **48.9% ± 1.8** pooled over all five airframes | ✅ 48–52 |
| C8 | flee rate | **20.0%** (18 of 90) | ✅ 12–22 |
| C9 | zoom neutrality | byte-identical, and now able to fail | ✅ |
| C10 | no allocation after warm-up | warm 536 objects, then **+0** over 200 duels | ✅ |

**C7 is the one to read first.** An exact mirror — same airframe, same guns, same 220
structure, same `k` — sits at a coin flip. Every one of the symmetry defects in §1 and
§6 showed up here first, as a 79-to-1 or a 61-to-39, and this row is what says they are
gone: **49.6% over 1,200 duels** in the dedicated measurement, 48.9% ± 1.8 in the gate.

It is measured across **all five airframes and pooled**, because a single airframe at
n = 120 is an airframe lottery rather than a criterion — the same kitehawk cell reads
39.3%, 48.1% and 52.4% on three seed sets, every one of them inside its own ±4.2. The
gate used to measure one; that is fixed, and it is a mis-specified *instrument* rather
than a mis-specified threshold, so the band is untouched.

**C4, C5 and C6 must be re-fitted and that is P11's, not this pass's.** The root fixes
changed how every aeroplane in the game flies — `k` now orders pilots, all three pilot
tiers are live, and the AI flies the true lead solution — so the ace `hp` values fitted
against the *old* AI are stale, and the counter deltas with them. The harness is
unchanged and runs in about four minutes (`tools/lab/fit.mjs`, `--counterplay`); R-11 and
T23 both place that pass at P11, and re-fitting sixteen aces against an AI that is about
to get crates (P6) would be work done twice.

**C2 is mis-specified and I did not tune to it.** Its 0.4–0.8 s band comes from
DESIGN §3.1's own sanity check, `60 / 108 = 0.56 s`, which assumes **no component
absorption** — in the same section that specifies 35% spill. Measured 0.75 s head-on to
0.98 s dead astern, 0.87 s at the canonical 50 m. To reach the band the spill would have
to be zero, i.e. components would have to be decoration. The criterion that survives is
**C3**, the lethality *ratio*, which is what the brief's own gloss cares about
("difficulty must come from numbers and positioning") and which measures **11.3×**
inside its 10–18 band. Suggested restatement: `0.7–1.1 s` on a 60 HP scout dead astern,
with the ratio unchanged.

### Counter-play, measured

| ace | counter | baseline | with | delta |
|---|---|---|---|---|
| A4 | camp the cloud top | 50.8% | 86.2% | **+35.3** |
| S3 | drive one off | 63.0% | 80.4% | **+28.2** |
| S2 | go past him, do not shoot him | 65.0% | 92.5% | **+27.5** |
| A7 | use your ears | 61.8% | 84.8% | **+23.0** |
| A6 | kill the bait in under 3 s | 49.3% | 71.8% | **+22.5** |
| A8 | use the updrafts yourself | 54.1% | 72.9% | **+18.8** |
| A11 | kill the leader | 69.4% | 86.8% | **+17.3** |
| A1 | force a low, slow fight | 77.4% | 88.9% | +11.5 |
| A2 | out-energy him | 58.7% | 63.6% | +4.9 |
| A5 | never merge | 69.3% | 54.5% | **−14.8** |
| A3 | break the mirror with a stall turn | 61.4% | 44.8% | **−16.6** |
| A9, S1 | — | — | — | **need crates (P6)** |
| A10, A12, S4 | — | — | — | exempt: no tactic by design |

Against the valid control (`placeboB`) these are credible: it never exceeds +4.5 and
averages −29. Against `placeboA` they are not, and §9 says why.

**C6 as written cannot be satisfied by an ace whose baseline is above 82%**, because a
counter worth 18 points needs 18 points of headroom, and C4 simultaneously requires the
baseline to be 55–70%. The two criteria squeeze each other. A ceiling-aware form — *the
counter must close at least half the remaining gap to 100%* — measures the same thing
and is satisfiable everywhere in C4's band.

---

## 9. Falsification — `tools/BLESSED_P5.md`

Nine break switches on `ctx.bug`, the forbidden implementation shipped inside the
module behind a flag no game sets. Two are worth calling out here:

- **`zoom-range` makes gun range scale with `ctx.zoom`.** P4's F14 noted that zoom
  neutrality "cannot fail by construction" and that its green was evidence of nothing.
  It can fail now, and C9 catches it. That is the missing tripwire, built.
- **`no-overpenetration`** doubles the time-to-kill (0.87 → 1.82 s), which is the only
  reason C2 is within 10% of its band at all.

And the placebo control on the counter-play harness found something I did not expect:
`placeboA`, a slow porpoise intended to be meaningless, is worth **+35 points against
A10** — because a porpoise is a lag yo-yo, and a lag yo-yo is a real manoeuvre. It is
not a valid control and I am not claiming it is one. `placeboB` (holding a sinusoidal
altitude) is: across sixteen aces it never exceeds **+4.5** and averages **−29**. The
counter numbers are credible against `placeboB` and the `placeboA` result is a finding
in its own right — the "believable wrong control" is the same failure mode as the
believable wrong metric.

---

## 10. Tuning register (DESIGN §12)

| # | constant | was | now | measured by |
|---|---|---|---|---|
| T10 | auto-fire cone | 8° (+6° inside 50 m) | **±11°, no snap** (R-09) | `coneStrict`: 14 rounds on the nose, 0 at 20° off |
| T11 | gun convergence | 90 m | **40 m (R-09)** — and the straddle claim is **refuted** | §3.1: ramming is 1.6× *faster* |
| T12 | target-priority weights | §2.5 | **unchanged, verbatim** | lock changes 5 per 10 s with four crossers |
| T13 | lock hysteresis | 0.40 s | **unchanged** | differential: 5 with, 6 without |
| T14 | player structure / enemy DPS | 220 vs 28 | **unchanged** | C3 ratio 11.3× |
| T23 | ace `k` | §5.3 | **unchanged — `hp` is the lever instead** | duel matrix, `tools/lab/fit.mjs` |
| T24 | morale coefficients | §5.2 | **damage −0.90, wingman −0.30, kill −0.15, flee 0.42, +commitment hysteresis** | C8 flee rate 15.8% |

New constants P5 introduces: `SPILL 0.35` (DESIGN's), `GUNS.portN 0.55`,
`ENGAGE_RANGE 500 m`, `STATE_PERIOD 0.40 s`, `DISCIPLINE 0.55`, `FLOOR 120 + v` metres,
`FRAMING.bossSectionWu 320`.

One constant was **deleted**: the `2.1 × Vs` corner-speed heuristic that `ai.js` and
`pilot.js` would otherwise both have carried. `aero.js` now derives corner speed from the
envelope itself — the speed that maximises `min(pitchCeiling(v), g√(n_wing²−1)/v)` —
memoised per airframe with a signature so a battle-damaged refit recomputes instead of
returning a stale number for an aeroplane that has lost a wing. It reproduces P4's
independently measured 32.7 m/s for the reference airframe at 33.8, and it is an identity
rather than a fit, which is what D72 asks for.

---

## 11. Requests, closed

The three requests P5 raised against P4 are **resolved in the corrective pass**, at root:

| # | was | now |
|---|---|---|
| REQUEST-1 | `aero.js`'s module-level `OUT`, worked around with `keepAero` | the aircraft owns its resolve; `forces()` has no default `out`; workaround deleted |
| REQUEST-2 | `pilot.js`'s roll sign and absolute-angle intents, worked around by using only `point` with a mirrored bearing | sign corrected, intents made heading-relative, `turnUp`/`turnDown` made saturating from any attitude; workaround deleted |
| REQUEST-3 | `ace` and `novice` tiers quarantined | both in service, ladder monotone, guarded by `kMonotone` and `sym2.mjs` |

Nothing is left with two paths in it.

## 12. What P6 needs

1. **`CRATE_RUN` exists with its transition and its utility hook, and runs against
   nothing.** §5.2's condition is `a crate under canopy is reachable and E_rel > −100`;
   the state is wired, the threshold is `ENERGY.crateFloor`, and P6 supplies the crates.
2. **Two aces cannot be measured without you.** A9 hunts crate *carriers* (`ent.carrying`
   is read and never set) and S1/Drach hunts *silk*. Their counters are in the roster
   and score 0 points today because the thing they counter does not exist.
3. **`Blooded` is implemented as a world flag** (`world.blooded`) that lowers the flee
   threshold by 0.25 and is read by every AI's state choice. Nothing sets it, because
   shooting a canopy needs a canopy. The chute pool exists (`world.chutes`, 8 slots) and
   40% of downed enemies set `ent.bailed`.
4. **The framing box is a pure function**, `framingContributions(world, player, out,
   lockRangeWu)`, returning world-unit entries for `cam.track`. `lockRange` is passed
   **in** — the camera profile is the single declaration of it. A crate contributes when
   contested; add it there, with `weight 0` so it does not arm the zoom lock.
5. **Nothing in `js/sim/**` allocates after warm-up** and C10 measures it over 200 duels
   through one world: **+0**. Keep it that way — take a bullet from `world.takeBullet()`,
   and if you need a pool, build it at world construction.
6. **Gun range is 66 m and the cone is ±11°, in world units, at every zoom.** The
   tripwire that proves it is now able to fail.

---

## 13. What I would want Aaron to fly for ninety seconds

Open `tools/pages/duel.html` and fight **A5** and then **A2**, in that order.

A5 is the armoured one who only wants the head-on. The first three merges will feel
like the right idea and cost you a third of your aeroplane each time. The moment the
fight turns is the one where you refuse the merge, break in the vertical, and come down
behind him — and then discover he cannot turn and you have all afternoon.

A2 is the opposite lesson and the one the whole flight model rests on. He will out-turn
you at 28 m/s all day and you will keep trying, because turning with him *feels* like
winning right up until you are at the bottom with nothing left. The fight is won by
leaving, climbing, and coming back with 120 m in hand.

If those two do not feel like different problems, the AI is not doing its job, and no
number in this file will tell you that.
