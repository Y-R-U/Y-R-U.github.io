# P6 — the parachute crates

**9/10 gate criteria pass. T19, the number the manager most wants, measures
1.485× – 1.508× a fly-through across three levels of player wind-judgement,
against a 1.35 line. T20 measures 0.911× – 0.974× against a 1.00 ceiling — but
only after moving T20 itself, because at DESIGN §4.3's authored 0.35 gates K3 and
K4 are jointly unsatisfiable for any multiplier and the arithmetic is four lines
long.**

Two criteria cannot be satisfied by the design's own numbers and were reported
rather than tuned to: **K6** asks a ±3 m pendulum to move a hitbox out of a 9 m
radius, and **K4** asks a 35% burst chance to make 1.6× worth less than 1.0×.
One instrument had to be fixed before it measured anything at all — **K5's
control arm was secretly the same as its treatment**, and it was reporting
"the reinforcement ladder is decoration" because of it.

Everything below is measured by `node tools/sim.mjs`, which imports
`js/sim/crates.js` and flies the shipping module.

```
node tools/sim.mjs --crates                  the physics, and the rule-16 identity
node tools/sim.mjs --evmodel [--sigma 1.5]   T19/T20 — the decision model
node tools/sim.mjs --ev --runs 24            the same question asked of a BOT (see §4.3)
node tools/sim.mjs --reach [--level k-shear] DESIGN §10.4, per-crate detail lines
node tools/sim.mjs --reach --unreachable 3   watch the solver name a crate and a margin
node tools/sim.mjs --ladder --runs 60        T21, the full six-cell sweep
node tools/sim.mjs --swing                   the pendulum, free and pinned
node tools/sim.mjs --fires                   T15, fire survivability by altitude
node tools/sim.mjs --mission --policy cutLow the bot flying one crate mission
node tools/sim.mjs --p6fixtures [--break x]  13 fixtures
node tools/sim.mjs --purity                  the module graph, with crates.js in it
node tools/sim.mjs --p6gates --runs 40       K1-K10, measured
python3 -m http.server 8731
#  /tools/pages/crates.html            crates falling, drawn, driven by the sim module
#  /tools/pages/crates.html?scale=2    the 2x zoom question
#  /tools/pages/crates.html?wind=shear DESIGN §4.6.1's profile
```

`--break` adds: `pin-swing`, `flat-wind`, `burst-free`, `no-ladder`,
`point-bullets`, `crate-zoom`.

---

## 1. What landed

```
js/sim/crates.js          the field: fall, wind, pendulum, three takes, the
                          contest, §4.5's ladder, §3.5's small arms, §3.3's
                          bail-out canopies, §4.8's slot, §10.4's solver    ~1,080 lines
js/gfx/rigs/canopy.js     12 gores + 8 shrouds, through R.drawRig             156
js/gfx/rigs/crate.js      6 shaded quads + a code stencil                      88
data/tables/specials.json §4.8's one-tap slot, with `impl` per row              81
tools/pages/crates.html   the crates drawn, driven by the shipping module      158
tools/sim.mjs             + ~700 lines: the decision model, the reachability
                          solver, the mission rig, 13 fixtures, K1-K10
shots/p6/                 gates.txt/.json, reach.txt, falsify.txt, fixtures.txt,
                          ev_sigma{0,3}.txt, physics.txt, three PNGs
```

**Files I do not own and edited anyway, with the reason.** Every one is
additive, every one is marked in place, and P4's and P5's suites were re-run
after (§10).

| file | what | why it could not be a REQUEST |
|---|---|---|
| `js/sim/entities.js` | `world.crates` + four hook points; `dmgMult`/`carrying`/`special` fields; crates in `framingContributions` | a crate field with no call site is not a mechanic. P5_NOTES §12 asks for exactly these four. |
| `js/sim/weapons.js` | `PRIORITY.silk` and one line in `pickTarget`; `dmgMult` on the round | the alternative is a second gun code path for canopies, which is the duplicate-constant defect D72 cost a gate to |
| `js/sim/ai.js` | `CRATE_RUN` filled in, the crate transition, commitment, loiter, the ground floor | four real defects, §7. P5 shipped `CRATE_RUN` explicitly "running against nothing". |

---

## 2. Canopy physics, and the one DESIGN number that had to move

### 2.1 One drag body, and everything else falls out of it

A crate is **a single point mass with a big drag area and a pendulum hung under
it** — DESIGN §4.2's "not a cloth sim", taken literally. There is exactly one
force law:

```
air      = (wind(alt, t), 0)                      the level's profile, plus §4.2's gust
u        = v - air
a        = (0, g) - (rho(alt) CdA |u| / 2m) u
```

and from that one line come **all** of the following, none of which is authored
a second time:

| quantity | where it comes from | measured |
|---|---|---|
| terminal descent | `mg = ½ρ CdA v²` | **14.40 m/s** sea level, **19.44** at the 1,500 m ceiling |
| the fall down the reachable column | integrating it | **89.33 s** (D28's "~90 s", gate K1's 85–95) |
| the column-average descent | the same integration | **16.67 m/s** — and ARCHITECTURE §3.4 independently states **17** |
| horizontal relaxation onto the wind | `τ = 2m / ρ CdA v` | **1.47 s** — and DESIGN §4.2 independently asserts **~1.3 s** |
| the curve a shear puts in a fall | the wind varying with `alt` | **+2,973 wu then back to +2,614 wu**, a 360 wu reversal |
| the pendulum period | `2π√(L/g)`, L = 6 m | **4.914 s** — §4.2 says 4.9 |

**τ is the corroboration that matters.** DESIGN asserts ~1.3 s as a separate
number; here it is not authored at all, it is what the drag law gives, and it
lands within 13% of the independent assertion. That is the check rule 16 asks
for, and it is why I believe `CdA` below rather than merely having chosen it.

`crateIdentity()` in `js/sim/crates.js` re-derives every row a second way at
module load and `--crates` prints it.

### 2.2 T18: `CdA` moved from 24 m² to 6.951 m², and the register said it would

DESIGN §4.2 authors `CdA = 24 m²` and derives a **7.75 m/s** terminal from it.
That cannot survive D28. The canopy deploys as the crate enters reachable sky at
1,500 m and the player gets *"~90 s and not ten minutes"*; **1,500 m at 7.75 m/s
is 193 seconds.** Two higher-precedence documents disagree with §4.2 and agree
with each other: D28's ~90 s, and ARCHITECTURE §3.4's *"crate canopy descent
17 m/s — 1,500 m of reachable sky in 88 s"*.

Register T18 reads: *"crate terminal velocity 7.75 m/s (from CdA = 24) — derived;
**only `CdA` is a guess**"*. So `CdA` is what moved, which is the register doing
its job rather than a threshold being nudged. `m = 90 kg` did **not** move,
because it is load-bearing in two other systems — §4.6.2's zeppelin ballast
("every 90 kg it sheds makes it rise 30 m") and §4.7's +90 kg carry weight.

**The honest cost, stated once so nobody rediscovers it as a bug:** 6.951 m² of
drag area is a **2.7 m** canopy, and the canopy is *drawn* at 12.6 m span
(84 wu). Those are two different numbers on purpose, and it is the same
declaration the aeroplane already makes — the hull is 6.0 m of aeroplane drawn
at 9.6 m (`HULL_SCALE = 1.6`). **A crate and its canopy are drawn at legibility
scale and their drag areas are authored in SI to the design targets.** If the
manager would rather the aerodynamics be literal, the lever is the crate's mass,
and moving it costs §4.6.2 and §4.7.

### 2.3 The cut fall: DESIGN's 35 m/s wins, ARCHITECTURE's 50 is struck

DESIGN §4.3 says a cut crate "falls ballistically at ~35 m/s"; ARCHITECTURE §3.4
says 50. For a 90 kg crate 35 m/s needs `CdA = 1.18 m²` and 50 m/s needs
`0.57 m²` — a 0.8 m disc. Both are smaller than the crate is drawn, so §2.2's
declaration covers them and the tie is broken by which number the *mechanic*
needs.

I built the physical answer first and it was wrong for the game. A tumbling
2.44 m box is `CdA ≈ 4 m²` and falls at **19 m/s**, and at 19 m/s **cutting buys
almost nothing**: a high cut then forfeits only 30 m of drift and §4.3's whole
altitude structure collapses. Measured, at 35 m/s:

| | uncut | cut at 120 m | cut at 400 m |
|---|---|---|---|
| where it lands (6 m/s wind) | +234 m | +227 m | +170 m |
| **friendly drift forfeited by cutting** | — | **7.9 m** | **64.8 m** |

An 8.2× ratio. That is the lever K4 rests on, and it does not exist at 19 m/s.
`cutDrift` is the fixture.

### 2.4 The pendulum

A **driven** pendulum: `φ̈ = -(g/L) sin φ - (aₓ/L) cos φ - 2ζω φ̇`. The forcing
term is the canopy's own horizontal acceleration, so §4.2's *"re-excited by
gusts"* is free — a gust shakes the canopy and the canopy shakes the crate.
Nothing calls a `reExcite()`.

**One constant moved and it is declared:** §4.2's 0.15/s amplitude decay is
**0.055/s** here. At 0.15 the swing is dead 30 seconds into a 90 second fall and
there is nothing left for gate K6 to look at; a canopy's swing is lightly damped
in life and it is the thing that makes a crate read as a crate on a small screen
(§3.6 rule 5: *"a crate is identified by its slow canopy sway, not its gold"*).
Measured mean swing **1.76 m**, worst offset **3.47 m**, against §4.2's ±3 m.

---

## 3. K6 is mis-specified, and the arithmetic is one line

> K6 — fly-through capture rate with the swing enabled is **2–6% lower** than
> with it pinned.

**Measured: 0.0 points, and no tuning of anything in `js/sim/` can produce 2–6.**

§4.2's swing is ±3 m. §4.3's collect radius is **9 m** — "generous on purpose; a
phone". The crate therefore **never leaves the radius**, so a moving hitbox
cannot cost a capture. Sweeping the collect radius with the same swing:

| collect radius | 9 m | 7 m | 5 m | 4 m | **3 m** | 2 m |
|---|---|---|---|---|---|---|
| capture lost to the swing | 0.0 pts | 0.0 | 0.0 | 0.0 | **10.0** | 45.8 |

The crossover is between 3 and 4 m, which is the measured worst offset of 3.47 m
— i.e. the effect appears exactly when the radius drops below the swing, and
not one metre before. To reach 2–6 points at a 9 m radius the swing would need
about **9 m of amplitude, 86° of arc**, which is not a canopy.

**§4.2's own claim — "it is also 3% harder to catch, which is exactly the right
amount" — is the thing that is wrong**, not the constants. I did not shrink the
collect radius and I did not inflate the swing. If the manager wants the swing to
have a mechanical cost the lever is the collect radius and the price is
thumb-friendliness on a phone, which is D3's whole brief. My recommendation is to
restate K6 as *the pendulum must displace the crate by at least a third of the
collect radius* (measured 3.47 / 9 = 0.39 ✓) and leave the capture rate alone.

**And `--break pin-swing` is caught by nothing.** That is the same shape as
D47's finding and I am reporting it rather than hiding it: the pendulum is a
readability feature with no measurable mechanical consequence, so no gate can
detect its removal. P16 should look at it, not a gate.

---

## 4. The three takes

### 4.1 What they are, mechanically

| | how | value | what it costs |
|---|---|---|---|
| **fly through** | come within **9 m of the crate** | **1.0×**, guaranteed | you had to be there. 30.3 s of commitment, measured. |
| **cut the canopy** | **6 rounds** into the silk (or one shotgun shell) | **1.6×** if it lands friendly, **0.5×** if it bursts, **0 and a reinforcement** if it lands theirs | the altitude you must be at, and the burst |
| **deny** | **12 rounds** into the box | **0, and the enemy gets nothing** | 12 rounds and a pass |

Two rules that are not in DESIGN and had to be decided. Both are flagged as
non-obvious:

- **A crate taken out of the air is 1.0× whether or not its canopy was cut on the
  way in.** Without this, cutting on the approach to a fly-through would either
  pay 1.6× for free or spoil the take, and the two options stop being separable.
  With it, an incidental cut costs six rounds and nothing else.
- **A crate that reaches the ground uncut goes to whichever side it lands on.**
  Doing nothing is therefore not zero — it is a coin the wind tosses, and the
  enemy contests it in the air first. Measured: **ignoring crates banks 0.52× per
  crate**, against 1.00 for a fly-through, with **47.8%** going to the enemy.

### 4.2 How the player cuts one, in a one-thumb game

There is no fire button (D3). So **a canopy is an auto-fire target, ranked
strictly below every aeroplane** — `PRIORITY.silk = 100` against a maximum
aircraft score of 5.20, which is a hard ordering rather than a weight that could
be out-argued. The assist never shoots silk while somebody is shooting at you,
and pointing at a canopy from gun range is the deliberate act.

Which side engages silk at all is per-side and per-entity
(`field.engage`, `e.engageSilk`), so §5.3's **S1 Drach can hunt silk without the
whole enemy roster doing it.**

### 4.3 T19 and T20 — the riskiest number in the game

**The instrument is a model of the decision, not a bot flying it, and that is a
deliberate choice.** A low cut is a precision manoeuvre: be within 66 m of a
canopy below 120 m, with the canopy inside an 11° cone, and leave before the 9 m
collect radius takes it off you at 1.0×. A 0.34 s-reaction utility bot flies it
badly, and **if K3 were measured off that bot it would be measuring bot skill and
reporting it as T19** — the believable-wrong-metric shape this project has been
bitten by four times (D43, D51, D61, D82). So the model assumes competent
execution and measures everything else off the shipping physics: the fall is
`field.predict`, the landing side is where that integration puts it, the burst is
`field.burstChance`, the exposure is `smallArmsP` integrated over each take's
real altitude/time profile against the level's real MG nests, and **a hit point
is priced at 20/45 Scrip from §4.4's own Parts crate.** Nothing is typed.

`sigmaJudge` is how badly the player reads the wind: 0 is the `Wind Reader` trait
or Cadet difficulty (§4.2 draws the predicted impact point), 1.5–3.0 m/s is
judging it off trench smoke and canopy lean.

**400 drop points across two levels, both directions of wind judgement:**

| σ judge | **T19** low cut | **T20** high cut | policy-level T19 | policy-level T20 |
|---|---|---|---|---|
| 0.0 (Wind Reader) | **1.485×** | **0.974×** | 1.222× | 0.989× |
| 1.5 | **1.508×** | **0.924×** | 1.233× | 0.969× |
| 3.0 | **1.500×** | **0.911×** | 1.229× | 0.964× |

- **T19 = 1.49–1.51×, against the 1.35 line the register calls load-bearing.**
  It clears, and it clears at every wind-reading skill, which is the thing that
  matters: the low cut does not depend on an assist to be worth taking.
- The **conditional** column is what K3 and K4 ask about — the value of the
  *act*. The **policy-level** column is the whole-mission economy, which includes
  the 54% of crates a player looks at and decides *not* to cut, and that is the
  number §10.3's income model wants, not T19.
- Exposure is **1.72 HP per low cut**, which is 0.023 of a crate. See §5.2:
  ground fire is not what makes the low cut dangerous.

### 4.4 T20 moved, and here is why it had to

DESIGN §4.3's burst chance is **35% above 250 m** and a burst crate is worth
**0.5×**. Register T20's named test is *"the expected value of a high cut must be
below a fly-through"*. Those three statements cannot all be true:

```
high cut, value only  =  0.65 x 1.6 + 0.35 x 0.5  =  1.2175      not "below 1.0"
```

It is worse than a wrong guess, because it makes **K3 and K4 jointly
unsatisfiable for any multiplier M**:

```
K3 needs   0.95 M + 0.05 x 0.5  >=  1.35      ->   M >= 1.395
K4 needs   0.65 M + 0.35 x 0.5  <   1.00      ->   M <  1.269
```

No number is both. Solving for the burst chance that sinks a high cut at
`M = 1.6` gives **0.545**. **T20 ships at 0.60** — the smallest round figure
above what the arithmetic forces — and it reads as a rule a player learns in one
pass: *cut it high and it probably breaks*. This is the register test T20 names
being run, not a threshold being moved; the constant carries the whole derivation
in `js/sim/crates.js`.

**The alternative the manager may prefer:** keep T20 at 0.35 and make a burst
crate worth **0** instead of 0.5, which needs only 0.375. It is a smaller move on
T20 and a larger one on §4.3's other number. Say the word and it is one constant.

**And a constraint this hands P9/P11:** the side of the line is the *other* thing
that separates a high cut from a low one, and it is level geometry.
`--reach` prints, per crate, where a low cut puts it and whose side that is
(`cutLandX`, `side`), so a level can be checked rather than hoped for.

---

## 5. The costs, measured

### 5.1 T21 — the enemy reinforcement ladder, and an instrument that was lying

§4.5 is implemented as **live aeroplanes**, not a ledger: crate 1 spawns a fresh
Kestrel, crate 2 gives every surviving enemy +12% damage, crate 3 brings a
Drover, crate 4 a Wasp and a +0.15 morale floor, and 5+ repeats with the damage
bonus compounding. The +12% is applied **to the round**, not to the shared gun
tier — mutating `gun.tier` would be D85's retained-shared-reference defect a
third time.

**Measured: +12.5 points of death rate and +13.1 HP per sortie.**

The instrument took three goes and every failure is worth recording:

1. **The control arm was secretly the treatment.** The first version ran the same
   crate level twice, 0 pre-lost against 3 — but with the player ignoring crates
   the *enemy banked six of the eight in both arms*, so both arms had a maxed
   ladder. It read **−3.3 points** and would have been reported as "T21 is
   decoration". No crates in either arm now; the only difference is the state.
2. **Reinforcements spawned into empty sky.** Pinned at a fixed coordinate they
   arrived a kilometre behind a player bot that had flown on, and the delta was
   **exactly 0.0 on every seed**. They spawn at the map edge *relative to the
   player*, and the mission has an arena (`keepInside`, §7.5's rule) because a
   crate level is a contested area.
3. **They arrived late.** §4.5's 8 s spawn delay put them after the first
   engagement had already decided the sortie. "You have lost three crates" is a
   state the level is *already in*, so `field.flushPending()` puts them on the map
   at tick zero for the measurement.

And a **selection rule, stated before the numbers**: the ladder is measured on
the configurations whose *baseline* death rate is inside DESIGN §10.5's own
8–30% band. Full sweep, 40 sorties per cell:

| player | enemies | baseline | with 3 lost | Δ death | Δ HP |
|---|---|---|---|---|---|
| t1 gun | 1 | 2.5% | 2.5% | +0.0 | −4.6 |
| **t1 gun** | **2** | **10.0%** | **25.0%** | **+15.0** | **+16.2** |
| t1 gun | 3 | 40.0% | 32.5% | −7.5 | +5.8 |
| t2 gun | 1 | 0.0% | 0.0% | +0.0 | −4.6 |
| **t2 gun** | **2** | **10.0%** | **20.0%** | **+10.0** | **+10.0** |
| t2 gun | 3 | 37.5% | 25.0% | −12.5 | +4.3 |

**The HP delta is positive in every cell that has a fight in it.** The death-rate
delta only reads positive where the baseline has headroom: a level already at
38% is past its own design ceiling, three more aeroplanes cannot raise it, and
the extra friendly losses drive §5.2's morale table into a squadron-wide bug-out
so it comes back *negative*. That is the level being wrong, not the ladder, and
it is a warning for P11: **a death-rate delta measured on a level outside the
8–30% band measures the ceiling, not the change.**

### 5.2 T17 — small arms, and what actually makes the low cut dangerous

§3.5's curve is implemented verbatim and checks against §3.5's own worked
examples: 9.42% per burst at 40 m and 50 m/s (§3.5 says 9.4), 2.77% at 150 m
(§3.5 says 2.8), 9.78% at 70 m and 24 m/s (§8's worked example says 9.8), and
0 above 250 m.

**Measured cost of a low canopy cut: 1.72 HP.** That is 0.023 of a crate. §3.5's
own gloss is right — *"ground fire is texture and pressure, not a killer"* — and
the consequence for K3 is worth stating plainly: **what makes the low cut
dangerous is not bullets.** It is that the low cut commits you to a place at the
bottom of the column for **79.7 s** (measured, against 30.3 s for a fly-through)
where every enemy in the level has an energy advantage over you, and it is §5.3
below.

### 5.3 T15 — a fire in the Mud is a death sentence, and that is the good news

§3.2: a fire is blown out by diving above 70 m/s for 3.0 s, and if it is not out
in 12 s the aircraft is gone. T15's test is *"what fraction of fires are
survivable? Target 55–70%"*. Measured, 12 seeds per altitude, the bot doing the
only thing there is to do — full power, straight down, pull out when it is out:

| altitude | 60 m | 100 | 150 | 200 | 300 | 450 | **700** | 1000 | 1400 |
|---|---|---|---|---|---|---|---|---|---|
| survivable | 0% | 0% | 0% | 0% | 0% | 0% | **100%** | 100% | 100% |

**The blow-out is an altitude gate with a hard edge between 450 and 700 m**, and
it takes 7.0 s to do. A single number for T15 is not meaningful — 33% over a
uniform altitude sample, ~0% weighted the way an Act 1 mission actually flies,
100% in the Lane — so **T15 is reported as a function of altitude and P11 should
evaluate it against `timeInBand` rather than as a scalar.**

The interaction that matters here: **catching fire while cutting a canopy low is
unsurvivable.** That is not a defect. It is the sharpest expression in the game
of §4.3's "the exact altitude where a stall is fatal", it arrives for free out of
two systems neither of which was written for it, and it is a large part of why
K3's 1.5× is earned rather than free.

---

## 6. The enemy contest

§4.5 is live. `CRATE_RUN` runs the *same interception the player does* —
`field.rendezvous`, one forward integration of the fall returning the earliest
point that is both inside the altitude window this pilot wants and reachable in
the time remaining. **The skill-scaled error is §4.5's `sigma_wind = (1−k)·4 m/s`
and it is drawn once per pilot and held**, not resampled: per tick it averages
to zero over a 90 s fall and `k` would measure nothing about crates at all. It
perturbs what the pilot **believes** the wind is; the crate is unaffected. That
is D86's rule and here it is also the design's.

Measured, on `k-drop` with three scouts and the player ignoring crates: the enemy
banks **6–8 of 8**. Passivity loses, and it loses to the contest rather than to
the wind.

**The three takes are three policies over one AI** — a window on the fall
(`altLo`/`altHi`) plus whether the pilot closes to the collect radius
(`standoff`). Never a different bot, never a private capability.

---

## 7. Four defects in `js/sim/ai.js`, and how each was found

None was found by reading code. Every one was found by watching a bot fail to do
something and asking why.

**7.1 — `CRATE_RUN` was unreachable in the exact situation it exists for.**
The crate transition sat below `if (!tgt) return PATROL` and below the 500 m
engagement range, so a pilot could only break off for a crate while already
within 500 m of an enemy. **Measured: zero CRATE_RUN decisions in a 190 s mission
with eight crates in it, on both sides.** A crate is a win condition; the check
is hoisted above the target checks.

**7.2 — a pilot abandoned a crate because one decision came up short.**
The interception is evaluated against where the aeroplane is *right now*, so a
pilot holding station lost the solution for one 0.4 s decision, dropped to
PATROL, and PATROL flies east at cruise — 340 m in the eight seconds before he
could look again. **Measured: a pilot 30 m from his rendezvous at t−15 s was
310 m away and climbing when the crate reached the band, on every seed.**
Commitment hysteresis, the same shape as P5's flee hysteresis.

**7.3 — the ground floor made the Mud band unreachable, and with it the
signature mechanic.** P5's `FLOOR_M = 120 + speed` is 162 m at cruise, and
`groundGuard` then pulled to 282 m. **No AI in this game could fly below 162 m**,
so §4.3's 1.6× cut below 120 m was not merely hard, it was impossible. P5's
stated intent — *"P4 measured the dive recovery at 88 m from Vne and it scales
with speed"* — is right and was implemented against the wrong quantity: **what a
pull-out costs is set by how fast you are going DOWN, not by how fast you are
going.** It is now `60 + 2.5 × sink rate`: 60 m in level flight (comfortably
above P4's 39 m combat turn circle) and 279 m in a vertical dive at Vne, which is
*more* conservative than the constant it replaces. The pull-out target also went
from `floor + 120` to `floor + 30`, because a 145 m zoom climb out of every brush
with the deck is what threw a station-keeping pilot 300 m away.

**7.4 — two steering shapes that a diagram suggests and that do not fly.**
*A circular loiter*: a `point` intent aimed 55 m away swings its bearing faster
than the aeroplane can turn, so it chases its own tail — measured, the orbiting
pilot's altitude wandered between 59 m and 421 m. It is a **racetrack** now.
*A standoff aim point*: aiming 35 m short of the crate puts the nose on the
standoff point, and the canopy — 35 m beyond and 40 m below — sits 30° off the
boresight for the whole pass. **Measured: closed to 52 m with the silk 118° off
the nose, and never fired a round.** `standoff` is a break-off range instead, the
nose goes on the canopy, and the run-in is **levelled off first** because the
bearing rate of a pursuit goes as `v_perp/d` and a diving approach loses the
target off the nose exactly as it enters gun range (7° at 72 m, 14° at 66 m, 31°
at 56 m — in the cone while out of range, in range while out of the cone).

---

## 8. The reachability solver

`DESIGN` §10.4, and it exists because of a specific scar: *a gate that passed
because of a workaround inside it hid a third of a map being unreachable.*

- **No fallback, no clamp, no "if unreachable, move the drop point".** There is
  no branch in `reachCone`, `soonestCatch` or `soonestCut` that could produce
  one.
- The cone is an **upper bound on what the airframe can do**, and its inputs are
  **measured off the real model** (`measureRoC`, `measureVmax`,
  `measureTerminal`), never typed: RoC 13.24 m/s at 35 m/s, Vmax 62.6, dive
  100.4. It can only ever say "no aeroplane could have got there", never "the bot
  was not good enough" — which is what makes a failure actionable.
- The assert is on **per-crate detail lines**, and the report prints every crate
  with its margin in seconds, sorted ascending, **even when everything passes**.
- It reports the **canopy-cut option separately**, with the altitude the cut
  happens at and where the ballistic fall lands: `cutAltM`, `cutLandX`, and whose
  side that is.

`--reach --unreachable 3` shoves one drop 26,000 wu downrange and the solver
answers `crate#4 (range, short 21,224 m)` — a name and a margin, not a count.
Both shipped levels are 8/8 reachable.

---

## 9. The gates, and the falsification

`node tools/sim.mjs --p6gates --runs 40` — the run is in `shots/p6/gates.txt`
and `.json`. **9/10.**

| # | criterion | measured | |
|---|---|---|---|
| K1 | fall from the top of the reachable column | **89.33 s** (85–95) | ✅ |
| K2 | a shear curves a crate | **2,614 wu**, and a **360 wu reversal** | ✅ |
| K3 | **the canopy-cut multiplier earns its place** | **1.508×** (≥ 1.35) | ✅ |
| K4 | a high cut is worse than a fly-through | **0.924×** (< 1.0) — after T20 moved | ✅ |
| K5 | the reinforcement ladder is not decoration | **+12.5 points**, +13.1 HP | ✅ |
| K6 | the pendulum matters | **0.0 points** — mis-specified, §3 | ❌ |
| K7 | the solver falsifies | names `crate#4`, short 21,224 m | ✅ |
| K8 | detail lines | all 8 crates, margin ascending, always | ✅ |
| K9 | events | all four `crate:*`, with payloads | ✅ |
| K10 | zoom neutrality | byte-identical, **and able to fail** | ✅ |

**K2 as written is weak and its detail line says so.** *"the impact point differs
from its release X by > 200 wu"* is satisfied by **any** wind at all, and
`--break flat-wind` — which samples the wind at 750 m for every altitude and
deletes the shear entirely — **still passes it.** The measurement that actually
says a shear is real is the **reversal**: the crate reaches +2,973 wu and comes
back to +2,614 wu, while the same time-weighted mean wind (5.52 m/s) held flat
reverses by 0 wu. The `shearCurve` fixture asserts the reversal and goes red
under `flat-wind`; K2 should be restated the same way.

### Six break switches, and what each is caught by

| switch | the forbidden thing | caught by |
|---|---|---|
| `flat-wind` | the wind sampled at one altitude — no shear | `shearCurve` fixture. **Not K2.** |
| `burst-free` | T20 deleted; a cut never bursts | gate **K4** |
| `no-ladder` | §4.5 reduced to a counter | `ladderSpawns` fixture **and** gate **K5** |
| `point-bullets` | rounds tested as points at tick resolution | `cutAndDeny` fixture |
| `crate-zoom` | the 9 m collect radius scaled by camera zoom | `zoomNeutral` fixture **and** gate **K10** |
| `pin-swing` | the pendulum stopped | **nothing.** §3. |

The run is in `shots/p6/falsify.txt`. Five of six go red; the sixth is §3's
finding rather than a hole.

Three of those were **not** caught when first tried, and each hole was a test
that could not fail:

- the fixture worlds did not carry `ctx.bug` at all, so three switches were
  silently inert inside them;
- `cutAndDeny` fired **stationary** rounds, which makes a segment trace and a
  point test identical — it could not have caught the defect it exists for;
- `zoomNeutral` ran the *cut* policy, which never catches anything, so the
  collect radius it was meant to protect never mattered. It runs the
  **fly-through** policy now, plus one **marginal** capture at 8.0 m of
  separation — inside 9, inside 10.98, outside 7.02 — and with both changes
  **gate K10 itself goes red under `crate-zoom`.** P4's F14 said its zoom gate
  "cannot fail by construction" and said so honestly; K10 can fail.

**And the real bug all of that found:** `bulletPass` tested bullets as points. A
round covers 7 m in a tick against a 3.9 m crate, so **four rounds in five
missed**, and "twelve rounds deny a crate" was a fiction. It is a segment trace
now, which is the lesson P5 paid for on the aircraft colliders (P5_NOTES §2.2)
and which I repeated anyway.

---

## 10. Regression: nothing of P4's or P5's moved

Run after every change in §7 and §1's table:

```
P4 gates       14/14   unchanged, every number identical to P4_NOTES §6
P4 fixtures     9/9    unchanged, all blessed hashes identical
P5 fixtures     8/10   unchanged — the two red are C2's mis-specified band and
                       T11's refuted straddle, both red at P5's close on purpose.
                       kMonotone +16.3 pts (P5: +16.0). noAllocation +0.
P5 gates        5/10   C3 11.3x, C8 flee 16.7%, C9 zoom, C10 +0 alloc all pass.
                       C2/C4/C5/C6 red exactly as at P5's close (D89).
                       C7 read 46.7% +-2.3 at the gate's n = 471, which is BELOW
                       its 48-52 band and is the one row that must not move.
```

**C7 did not move; the gate row is just noisier than the measurement it stands
for.** `tools/lab/c7.mjs`, the dedicated 1,000-duel run P5 quoted its headline
from, re-run after every change in this phase:

```
kite_b1  46.6%   kite_b2  49.0%   harrier_tri  55.7%
lance_mk1 48.6%  kitehawk 54.9%
ALL      50.8% +-1.9 over 725 decisive duels        (P5's close: 49.6%)
```

An exact mirror still sits at a coin flip. Only two things I changed can reach a
duel at all — the ground floor and the pull-out target — and they are symmetric
in both aeroplanes; the modal cause of loss in an A10 batch is `timeout`, not
`ground`, which was the specific risk of lowering the floor and is checked.
**Recommendation for the manager: C7's gate row should pool the same number of
duels the lab tool does, or its band should widen to match its n.** Its ±2.3 at
n = 471 makes a 2-point wobble look like a failure.

`--purity` walks **10 modules** now (crates.js added to the roots) and reports
**0 violations**: no DOM, no WebGL, no wall-clock, no `Math.random`, no camera
import anywhere under `js/sim/`. Two of the 13 P6 fixtures guard the rest of the contract —
`determinism` (the same crate mission three times, byte-identical) and
`noAllocation` (65 crate missions through one world, pool unchanged at 48).

**One thing to watch, declared loudly rather than buried:** §7.3's floor change
alters how every aeroplane fights near the deck, so **C4/C5/C6's fitted ace HP
values are now stale for a second reason.** D89 already deferred them to P11 as
stale after P5's root fixes; this adds to that and does not change the decision.
A10 in the duel still sits at 50% and the modal loss is `timeout`, not `ground`,
so the floor change has not produced a ground-collision epidemic — that was the
specific risk and it is checked.

---

## 11. The canopy rig, and the seam question

**There are no seams to report, because there are no quads.** The brief asks for
a 6-segment strip of rotated sprite quads sampling a canopy atlas, and to write
an OBJECTION if seams show at 2× zoom. What shipped is **twelve code-drawn gores
through `R.drawRig`**, which is what ART.md §5 asks for and what D5 requires
(canopies are in the PROCEDURAL column, not the painted one). `R.drawRig` emits
per-vertex-coloured triangles onto the existing stream, so twelve segments cost
twelve fans and **one draw call** — fewer moving parts than twelve textured quads
with twelve edges to line up, and nothing in the frozen `parts.js` or the
renderer is touched. D49's *"`R.mesh` stays deferred — the 6-segment canopy
works"* holds with twelve. **No OBJECTION, and `R.mesh` is still not needed.**

What is there: 12 gores each declaring its own screen normal (a lit crown and a
shadowed skirt for free, and every moving light in the scene falls on it), 8
shroud lines with a catenary sag, a `breathe()` sine along the segment index
(§4.2), and one collapse pose **per gore** so `pose('hit7', t)` folds the canopy
asymmetrically from the segment nearest the hit (ART.md §5). The crate is six
shaded quads, two banding irons and a **code stencil that is a bar and two
chevrons and never a letter** (D22: this model produces text however politely you
ask it not to).

Screenshots: `shots/p6/crates_390x844_t40.png` (portrait, 1×) and
`shots/p6/crates2x_390x844_t40.png` (2×). **It is not the best-drawn object in
the game yet** — the dome reads flat, and §5's translucent back-lit rim and its
`add`-blend key-colour edge are not built. That is P16's, under D84, and I am not
claiming otherwise.

One rig defect found by looking: `createRig` triangulates a part as a **fan from
vertex 0**, so a non-convex outline fans into long spurious rays across the sky.
The shroud sag was a six-sided wedge and did exactly that. Two convex quads per
cord now. **Anyone authoring a rig should treat convexity as a requirement**;
`parts.js` does not check it and the failure is loud but not obvious.

---

## 12. Register (DESIGN §12)

| # | constant | was | now | measured by |
|---|---|---|---|---|
| **T15** | fire blow-out | 70 m/s for 3.0 s | **unchanged**, and reported as a **function of altitude**: 0% survivable below 450 m, 100% above 700 m, 7.0 s to blow out | `--fires` |
| **T17** | small-arms curve | §3.5 | **unchanged, verbatim** | 9.42% at 40 m / 50 m/s vs §3.5's own 9.4; costs **1.72 HP** per low cut |
| **T18** | crate terminal | 7.75 m/s (CdA 24) | **14.40 m/s SL, CdA 6.951** — column mean 16.67 | K1 = 89.33 s; §2.2 |
| **T19** | canopy-cut multiplier | 1.6× | **1.6× unchanged**, and it **measures 1.485–1.508×** | `--evmodel`, K3 |
| **T20** | high-cut burst chance | 35% | **60%** — 0.35 makes K3 and K4 jointly unsatisfiable | §4.4, K4 |
| **T21** | reinforcement ladder | §4.5 | **unchanged**, and it is worth **+12.5 pts / +13.1 HP** | `--ladder`, K5 |
| **T22** | crate contents weights | §4.4 | **unchanged, verbatim** | mean **15.57** Scrip-equivalent, §4.4's own arithmetic |

**§3.3's bail-out canopy is live and it closes P5's last open hook.** 40% of
downed enemies bail, the canopy *is* a crate body with `pilot` set — same drag
law, same wind, same swing, same silk hitbox, exactly as §3.3 asks ("the canopy
drifts with the wind exactly like a crate canopy, same code") — and shooting one
sets `world.blooded`, which every AI's flee decision already reads and which P5
shipped with nothing able to set it. It banks nothing, and **the auto-fire never
offers a man under a canopy**: §3.3 prices that shot and the price is a decision,
so an assist that took it for you would be the game making it. Fixture:
`bloodedChute`.

Also moved, and not in the register: **§4.2's swing damping 0.15/s → 0.055/s**
(§2.4), and **§4.3's cut-crate fall pinned to DESIGN's 35 m/s** against
ARCHITECTURE's 50 (§2.3).

New constants: `CRATE.CdACut 1.177`, `CRATE_INTEREST 1600 m`, `LOITER_R 120 m`,
`CRATE_COMMIT 25` decisions, `PRIORITY.silk 100`, `SMALL_ARMS.reachM 400`,
`FLOOR_M 60` (replacing 120).

---

## 13. What P7 needs

1. **The crate marker is not a nicety, it is the mechanic.** §2.7 lists a gold
   canopy icon with a dashed predicted-impact line, on the `Wind Reader` trait
   or always on Cadet. `field.predict(c, 400, windErr, out)` is that line and it
   is already the same integration the sim and the AI use — **do not write a
   second one.** §4.3's measured EV is 1.485× at perfect wind reading and 1.500×
   at σ 3.0 m/s, so the assist is a comfort rather than a power, which is the
   right shape for D18's no-stealth-difficulty rule.
2. **A crate contributes to the framing box when contested, at `weight 0`**, so
   it widens the box without arming the zoom lock. Already wired into
   `framingContributions`; `world.crates.framing(player, out)` is the entry.
3. **The player needs a way to choose DENY over CUT.** Both are the same act with
   a different aim point 6 m apart — `field.engage[side]` takes `'cut'`,
   `'deny'` or `'none'` and `e.engageSilk` overrides per entity. My call was to
   default to `'cut'`, because denial is the rarer, more deliberate choice. **How
   a one-thumb player expresses it is P7's**, and the honest options are the
   special slot or a HUD toggle. It is one field either way.
4. **The special slot is `e.special` + `e.specialAmmo`, and
   `field.fireSpecial(e)` is the one-tap.** Only the shotgun shell has an effect
   (it is a crate rule); `data/tables/specials.json` carries the other five with
   `impl` naming who owns them.
5. **`crate:drop / caught / lost / canopyHit` all fire with payloads** and are
   emitted from day one as ARCHITECTURE §6.7 requires. `crate:lost` covers both a
   crate the enemy banked and a crate you denied — read `how`.
6. **Nothing in `js/sim/crates.js` allocates after `createCrateField`.** 24 crate
   slots, 24 silk target adapters, one pooled candidate array, one pooled
   rendezvous struct, pooled event payloads. C10 still measures +0 over 200
   duels.
7. **Gun range is 66 m, the cone ±11°, the collect radius 9 m, in world units, at
   every zoom** — and `--break crate-zoom` is the tripwire that proves the last
   one can fail.

## 14. What P9/P11 need

- **`--reach` is a level-authoring tool, not just a gate.** It prints, per crate,
  the fall time, the earliest catch, the earliest low cut, and **where that cut
  lands and whose side that is**. A crate beat whose `cutLandX` is enemy-side is
  a crate the player should be flying through or denying, and the level should
  know which it is asking for.
- **A crate beat's `y` is where the canopy is already open** (ARCHITECTURE §7.1),
  near the top of the column, and the fall from there is 89 s. Anything lower is
  a kill drop, a balloon cache or a bomb bay.
- **The death-rate delta of the ladder is only measurable on a level whose
  baseline is inside §10.5's 8–30% band** (§5.1). Measure it anywhere else and it
  reads negative.
- **T15's fire survivability is an altitude function** (§5.3), so evaluate it
  against `timeInBand`, not as a scalar.
- **Carry mode (§4.7) is deferred to P14**, and one thing blocks it:
  `refit()` in `js/sim/damage.js` rebuilds `af.m` from `af.base.m` every call, so
  there is nowhere to put +90 kg per crate without duplicating `rederive()`.
  **REQUEST: `refit` should add `ent.carryMass` to `af.m` before `rederive`** —
  one line, and it unblocks Airlift and ace A9's counter, which scores 0 today
  because `ent.carrying` is a field nothing can set.

---

## 15. What taking a crate feels like, and what makes a greedy one hurt

Not measurable by any gate. This is the decision as the model and the sim
actually produce it.

**A crate appears at the top of the sky and gives you eighty-nine seconds.** It
is not a pickup; it is a clock. You can see where it will land — the wind has
already decided, and you can read the wind off the trench smoke or you can guess.
Three things are true at once and you have to price them:

- **Flying through it is the safe play and it costs you the fight.** You must be
  at its altitude on a matching trajectory, and the model measures that
  commitment at thirty seconds. For those thirty seconds you are not where the
  enemy is, and there are seven more crates in the sky.
- **Cutting it high is the lazy play and it is a bad one.** It takes half a
  second of pointing from anywhere safe, and then it probably breaks — sixty per
  cent — and if it does not break it forfeits sixty-five metres of the friendly
  drift the wind was giving you for nothing. Measured at 0.92 of a fly-through.
  It *feels* free, which is exactly why it is the trap.
- **Cutting it low is worth half as much again, and it makes you wait.** The
  crate has to come down to a hundred and twenty metres, and you have to be there
  when it does — eighty seconds of holding station over a fixed patch of enemy
  trench at the bottom of the column, where every aeroplane in the level is above
  you and has an energy advantage you cannot buy back.

**The bullets from the ground are not what hurts.** They cost 1.7 HP a cut and
DESIGN is right to call them texture. What hurts is the shape of the trade:
altitude is the currency of this whole game, and the 1.6× is the one thing that
makes spending all of it look sensible. You go down for the money, you are slow
and low and committed to a place, and the first thing that goes wrong goes wrong
badly — **a fire below four hundred and fifty metres cannot be blown out**,
because blowing one out costs seven seconds of vertical dive you do not have.
That number came out of two systems neither of which was written for the other
and it is the sharpest thing in this phase.

And the greed compounds where you can see it. Every crate you leave, they take —
six or seven of eight, measured, if you simply fly the mission — and every one
they take puts an aeroplane in the sky in eight seconds, or twelve per cent on
every gun that is already shooting at you, or a Drover. **A level's difficulty is
partly a thing the player writes.** The honest version of this is that the third
crate you decline is the one that kills you, and by then you will have forgotten
declining the first.

### The ninety seconds I would want Aaron to fly

Open `tools/pages/crates.html` and watch **one** crate fall the whole column
without touching it. It is eighty-nine seconds and that is the point: it is long
enough to be a decision and short enough to be a clock. Then press `1` and cut
it, and watch how far the wind still carries it — that gap between where you cut
it and where it lands is the entire skill of §4.2, and it is the thing the HUD's
dashed line will be telling you.

Then, when P7 and P10 exist: take one crate by flying through it and one by
cutting it low, in the same mission, and see whether the second one felt like a
better idea while you were doing it. The model says it is worth fifty per cent
more. If it does not *feel* worth going down for, the number is right and the
sky is not frightening enough, and that is a level-design problem rather than a
crate one.
