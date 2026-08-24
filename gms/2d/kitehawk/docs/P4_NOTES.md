# P4 — the flight model and the envelope

**14/14 gate criteria pass. 9/9 regression fixtures pass. The two immovable numbers held:
the combat turn is 263 wu against a 286 ceiling, and the dive recovery is 585 wu against
a 1,111 ceiling — both with more margin than the ruling assumed.**

Everything below is measured by `node tools/sim.mjs`, which imports `js/sim/` and
`js/data/` directly and flies the shipping model. Where a figure could have been
computed in closed form it deliberately is not, except where this file says so.

---

## 1. What landed

```
js/sim/aero.js        atmosphere, lift curve, drag polar, the force resolve      175 lines
js/sim/physics.js     integration, SI -> wu, the per-tick invariants              90
js/sim/flight.js      the aircraft: limiter, stall, roll, throttle, stress       230
js/sim/pilot.js       the virtual pilot at three tiers                           110
js/data/tables.js     every constant, in SI, with the band assertions            215
data/tables/airframes.json   GENERATED mirror for tooling
tools/sim.mjs         the headless game: envelope, gates, fixtures, run summary  760
tools/pages/envelope.html    the envelope drawn, in the browser, from the same modules
tools/BLESSED.md / BLESSED.json   the anti-mock record and the blessed hashes
```

`js/core/bands.js` already carried R-02's canonical six-band table (P2 wrote it and
flagged it for us). `js/data/tables.js` re-exports it and **asserts ARCHITECTURE §3.3's
four constraints at module load** rather than duplicating the table — a second copy is
a divergence waiting to happen, and gate F13 reads the assertion, not a restatement.

---

## 2. The coefficient fit, in SI, with the arithmetic

### 2.1 The finding that shapes everything: an airframe has four numbers, not six

In a point-mass model every force divides by weight, so the flight path depends only on

| observable | reference value | what it sets |
|---|---|---|
| `Vs` = √(2W / ρ S CLmax) | **15.59 m/s** | the whole speed scale |
| `t` = T0 / W | **0.6287** | climb, top speed, sustained turn |
| `p0` = CD0 / CLmax | **0.04041** | parasite drag, i.e. top speed and the dive |
| `κ` = kInd · CLmax | **0.09966** | induced drag, i.e. what a turn costs |

`m`, `S`, `CLmax`, `CD0`, `kInd` and `T0` are a **redundant parameterisation of those
four**: a two-parameter family of SI sets gives the identical aeroplane. So the SI
column below was chosen to *read* like an aeroplane; nothing in flight can tell it from
any other set with the same four. Both are printed by `--envelope`, and if anyone ever
"tunes" `S` without moving `CD0` and `kInd` with it, the four are what will show it.

This is also why the fit is tractable at all: the system looked over-determined with six
unknowns and is in fact four unknowns against six targets.

### 2.2 The reference airframe — "Kite B.1"

```
m        = 520 kg          W = 5101.2 N
S        = 23.498 m^2      W/S = 217.1 N/m^2
CLmax    = 1.459           DESIGN §1.3's curve, unchanged: CL0 0.15 + CLa 5.00/rad x 15 deg
CD0      = 0.05896         DESIGN §1.4 guessed 0.060. It survived the re-derivation to 1.7%
kInd     = 0.06831         = 1/(pi x AR x e) with e 0.80 -> AR 5.82. DESIGN §1.3 used AR 5.5
T0       = 3207 N          T/W 0.629 (DESIGN's 2300 N gave 0.451 and cannot climb 13.5 m/s)
Vne      = 93 m/s          ARCHITECTURE §3.4's figure, top of R-01's permitted 86-93
cFlutter = 0.161           CD0_eff = CD0 (1 + 0.161 ((v-70)/40)^2) for v > 70. DESIGN T2 was 1.8
agility margin = 1.5747    §3 below
pitch envelope = 95 -> 67 deg/s at Vne, x the (v/32)^2 authority term
stress limit  = 1.00       §4 below
```

Checks, in SI:

```
Vs   = sqrt(2 x 5101.2 / (1.225 x 23.498 x 1.459)) = sqrt(10202.4 / 41.996) = 15.59 m/s
D_parasite(60) = 0.05896 x 0.5 x 1.225 x 3600 x 23.498 = 3055 N   ~ T0, hence Vmax ~ 60

the corner, at the 120 m rig altitude where sigma = 0.9531:
  wing, at the limiter's 0.94 of CLmax   n = 1 + 1.5747 x (0.94 x 0.9531 x (32.7/15.59)^2 - 1)
                                           = 1 + 1.5747 x 2.942 = 5.633
  stick, at the 95 deg/s ceiling         n = sqrt(1 + (1.658 x 32.7 / 9.81)^2) = 5.615
  they meet at 32.7 m/s, and that is the corner speed by definition
  turn diameter = 2 x 32.7 / 1.658 = 39.45 m = 263 wu
```

Derived into world units (D26 — SI first, always):

```
g          9.81 m/s^2   -> 65.4 wu/s^2
Vs         15.59 m/s    -> 103.9 wu/s
Vne        93 m/s       -> 620 wu/s
k (unpowered drag)  = 0.5 rho S CD0 / m = 1.6319e-3 /m  ->  2.4478e-4 /wu
v_term = sqrt(g/k)  = 77.53 m/s, and sqrt(65.4 / 2.4478e-4) = 516.9 wu/s = 77.53 m/s ✓
```

That last identity is checked **in code at module load** (`unitIdentity()` in
`tables.js`, `node tools/sim.mjs --units`), because it is what caught the 9.5× gravity
error at D29 and rule 16 says to check it rather than believe it.

### 2.3 The other four airframes

Same method, fitted against the character DESIGN §1.11 describes. Full table:
`node tools/sim.mjs --envelope`.

| | Vs | Vmax | RoC | corner | turn dia | sustained | Vne | stress |
|---|---|---|---|---|---|---|---|---|
| **Kite B.1** | 16.1 | 61.5 | 14.5 | 32.7 | **263 wu** | 62.6 °/s | 93 | 1.00 |
| **Kite B.2** | 15.9 | 64.1 | 15.5 | 32.8 | 259 wu | 66.0 | 94 | 1.04 |
| **Harrier Tri** | 15.5 | 59.8 | 16.3 | 31.7 | **226 wu** | 75.8 | 86 | 1.09 |
| **Lance Mk.I** | 16.7 | 69.6 | 14.8 | 33.7 | **300 wu** | 54.8 | 99 | 0.91 |
| **Kitehawk** | 16.2 | 74.2 | 20.0 | 32.3 | 236 wu | 73.8 | 100 | 1.11 |

The Act-3 choice survives as a real choice: **the Harrier turns inside everything
(226 wu) and out-sustains it by 38%; the Lance is 10 m/s faster, dives 13 m/s deeper,
and needs a third more sky to turn in.** The Lance's 300 wu circle is over F6's 286, and
that is deliberate — F6 binds the *reference* airframe, and "the Lance cannot turn with
you" is the whole point of it. It is still 65% of portrait's 462 wu width.

---

## 3. R-01, and the one place I could not implement the ruling as written

R-01 item 4 says: *"the aircraft may command a load factor up to `A`-scaled what the
wing physically gives"*, with `A = 2.8`. **Implemented literally, that removes the stall
from the game**, and I could not find a way around it:

- If every unit of lift is multiplied by 2.8, the speed at which the wing can carry the
  aircraft's own weight falls to `Vs / sqrt(2.8)` = **9.9 m/s**. The aeroplane flies,
  turns and holds altitude at 10 m/s. Gate F2's "stall speed 16.5 ± 1.0" then measures
  nothing that exists, and DESIGN §1.9's whole `< 22 m/s` mush regime is unreachable.
- It also flattens the turn envelope: with 2.8× the lift at every speed, the wing meets
  the pitch ceiling at 22 m/s and the maximum turn rate is then **flat from 22 to 45
  m/s**. Speed stops mattering inside the fight band, which is the opposite of what a
  corner speed is for.

**What I implemented instead — the multiplier applies to the manoeuvring margin:**

```
n_available(v) = 1 + AGILITY_MARGIN x (n_aero(v) - 1)          AGILITY_MARGIN = 1.5747
lift           = L_wing                       when L_wing <= W
               = W + AGILITY_MARGIN (L_wing - W)   when L_wing > W
```

Continuous, monotone, and **exactly 1 g at the stall speed**, so the stall stays a real
measurable thing (F2 measures 16.08 m/s) while the aircraft can still pull 5.5 g at
32 m/s where a 1917 wing gives 3.9.

**Being honest about what `A` ended up being.** §3.0 and §3.5 define it as the ratio of
our turn rate to a real 1917 one; §3.5's reference is a Camel turning 360° in 8 s,
`ω = 0.785 rad/s`. Ours at corner is `1.658 rad/s`, so the shipped ratio is **2.11×, not
2.8×**. I am not going to claim otherwise. What the 2.8 was *for* is preserved exactly:
§3.5 chose it so the turn circle would be 273 wu and fit portrait, and the shipped circle
is **263 wu**. The factor was always a means to that number, and the number is better than
it asked for.

### The pitch ceiling moved from 126 °/s to 95 °/s, and that is the other half of R-01

R-01's whole premise is that ARCHITECTURE §3.4's 126 °/s at 45 m/s is a **10.1 physical
g** turn that DESIGN's wing cannot produce. The ruling frees `m`, `S`, `CLmax`, `CD0`,
`T0` and the flutter coefficient to fix that — but no combination of those six can, because
the offending number is *kinematic*: `n = sqrt(1 + (ω v / g)^2)` depends on ω and v alone.
The only ways out are to move ω or to move the speed at which it is available, and the
turn diameter `2v/ω` — the immovable one — pins their ratio.

So the pitch envelope itself is what had to move: **95 °/s below 45 m/s, falling to
67 °/s at Vne** (ARCHITECTURE's high-speed figure is unchanged, and it is what the dive
recovery rests on). The load factor at corner is then **5.5 g**, which is inside a
believable airframe and — see §4 — is what makes the stress scale mean anything.

Two consequences worth stating plainly:

- **A 360° turn takes 3.8 s, not ARCHITECTURE's 2.86 s.** It is still much faster than
  DESIGN §1.5's 5.5 s. The two documents bracket the shipped number, which is what a
  reconciliation should look like.
- **The turn circle got smaller, not bigger** (263 wu against 273), because the corner
  speed came down with the rate. Portrait is better off than the gate assumed.

### The minimum turn radius has a floor, and it is set by DESIGN §1.7's authority term

`q_max(v) = ceiling(v) x clamp((v/32)^2, 0.25, 1)`, so below 32 m/s the pitch rate falls
faster than the speed does and the circle grows again. The tightest circle any airframe
can draw is therefore `2 x 32 / omegaLo`, at 32 m/s. For the reference that is 263 wu;
`omegaLo` below **85.5 °/s** makes F6 unreachable at any wing loading. That is the real
floor the P8 gate rests on — not `A`.

---

## 4. D32 closed — the stress scale, and what enforces it

**"4.5 g structural" is deleted.** R-07's diagnosis stands: nothing in the corrected
envelope respects it. What replaces it:

```
STRESS = |n| / N_REF          N_REF = 11.13 g
```

**N_REF is not the corner turn.** R-07 recommends anchoring there; I measured what that
does and it cannot be right: the corner turn is 5.5 g, so the *ordinary sustained combat
turn* (5.1 g) would read 0.91 stress and trip ARCHITECTURE §3.4's blackout (0.88 held
0.8 s) in normal fighting. The anchor that works is **the hardest pull the airframe can
be asked for — a full-deflection recovery at Vne, 11.13 g** — so 1.00 stress means
"everything there is", which is also what a HUD reading of 1.00 should mean.

ARCHITECTURE §3.4's greyout and blackout then apply completely unchanged, and they land
exactly where a dogfight wants them:

| speed | max commandable | stress | pilot |
|---|---|---|---|
| 26 m/s | 3.07 g | 0.28 | — |
| **32 (corner)** | **5.50 g** | **0.49** | — |
| 40 | 6.83 g | 0.61 | — |
| 50 | 8.25 g | 0.74 | greyout after 1.2 s |
| 60 | 9.26 g | 0.83 | greyout |
| 75 | 10.39 g | 0.93 | **blackout after 0.8 s** |
| 93 (Vne) | 11.13 g | 1.00 | blackout |

**Full stick is free in the fight and expensive at speed.** That is a legible rule a
player learns without a tutorial, and it gives the fast regime a cost that is not just
"turns go wide".

**What enforces the airframe limit** (D32's actual complaint — do not leave a constant
looking load-bearing when nothing enforces it): commanding above the airframe's
`stressLimit` **does structural damage**, 200 HP/s per unit of excess. Nothing is
silently clamped; you can pull it, and it costs you hull. Measured in the `diveRecover`
fixture: a full pull-out from Vne peaks at **1.059 stress and takes 14.7 HP** off a
220 HP structure. DESIGN §1.11's per-airframe spread becomes the stress limits in §2.3,
so the Lance (0.91) loses roughly 50 HP doing what the Harrier (1.09) does for free.
`Iron Neck` becomes **+0.09 stress**, per R-07.

**The HUD prints STRESS, never G.** `flight.js` exposes `stress`, `stressPeak`,
`greyout`, `blackout` and `lag`; there is no `g` field to print by accident.

---

## 5. D33 and R-08 closed — and a third drag bug behind them

R-08 is right that D33 conflated two quantities. Both are now in the table with their
defining conditions, and both are measured:

| quantity | condition | reference airframe |
|---|---|---|
| **unpowered terminal** | vertical, throttle 0, flutter term on | **77.32 m/s** (`√(g/k)` without the flutter term is 77.53) |
| **powered terminal** | vertical, full power, flutter term on | **95.79 m/s = Vne × 1.030** ✓ F5 |

R-08's bug is fixed: terminal is now **above** Vne, so a held dive *does* overspeed the
airframe and DESIGN §1.9's over-the-red regime is reachable. `flight.js` applies its
6 HP/s + 1 HP/s per m/s over.

**The flutter coefficient fell from DESIGN T2's 1.8 to 0.161, and that is not a tuning
choice.** With `terminal = Vne × 1.02–1.05` required, the terminal without any flutter
term is already 98.9 m/s = Vne × 1.064, so the term only has 3% of drag to remove. There
is no room for a dramatic high-speed drag hump under R-08's constraint, and I would
rather say so than leave a number that looks like it is doing work. **What actually makes
the dive resist you is the pitch envelope collapsing from 95 to 67 °/s**, plus the
airframe damage. The flutter term still exists (F5 goes red without it, per BLESSED) and
P15 can hang the airframe groan on it.

### The third bug: lift was resolved on the wrong axis, and it cost the turn 5×

DESIGN §1.3 writes `L = q S CL(alpha)` **along +n** — the body normal — with drag
separately along `-vhat`. That is not a simplification, it is wrong, and it is the
believable-wrong kind: everything looks fine in level flight because alpha is ~1°.

At the 14° alpha of a max-rate turn it puts `L sin(alpha) = 0.24 L` straight back down
the flight path. Induced drag is *already* modelled as `k CL²`; the projection adds it a
second time and then some. Measured, with everything else identical:

| | corner bleed | sustained turn | 360° loop | glide L/D |
|---|---|---|---|---|
| lift along the body normal (as §1.3 is written) | **−45 m/s** | 42.3 °/s | 12.3 s, alpha 146° | **2.44** |
| lift in wind axes (shipped) | **−7.2 m/s** | 74.0 °/s | 5.4 s, alpha 14.3° | **7.89** |

A glide ratio of 2.4 is a brick. `js/sim/aero.js` therefore resolves lift perpendicular
to the free stream and drag along it, which is the standard definition, and ships the
forbidden version behind `--break lift-body-axis` so the difference stays measurable.

---

## 6. The envelope against its targets

`node tools/sim.mjs --gates` — 14/14. Rig altitude for turn, stall, climb and top-speed
measurements is **120 m** (a max-rate loop is 39 m across and an aircraft cannot fly
through the ground); ρ there is 0.953 of sea level, so those read ~2% pessimistic.

| # | criterion | target | measured | |
|---|---|---|---|---|
| F1 | purity | zero DOM/WebGL/clock/`Math.random`/camera imports | clean; imports only `core/math.js`, `core/bands.js` | ✅ |
| F2 | stall | 16.5 ± 1.0 m/s | **16.08** | ✅ |
| F3 | best climb rate | 13.5 ± 1.0 | **14.46** at 34 m/s, flat 28–38 | ✅ |
| F4 | level top speed | 60 ± 2 | **61.52** | ✅ |
| F5 | terminal > Vne | Vne × 1.02–1.05 | **95.79 = ×1.030** | ✅ |
| F6 | **combat turn diameter** | ≤ 286 wu | **263 wu** at corner 32.7 m/s, 95.0 °/s, 5.61 g | ✅ |
| F7 | **dive recovery extent** | ≤ 1,111 wu | **585 wu** (88 m) | ✅ |
| F8 | instantaneous / sustained | 1.15 – 1.30 | **1.284** (95.0 / 74.0 °/s at 38 m/s) | ✅ |
| F9 | energy bleed at corner | −7 to −9 m/s | **−7.22** | ✅ |
| F10 | thin air, 1350 m / SL | 0.62 – 0.72 | **0.641** | ✅ |
| F11 | zoom climb from Vne | 400–460 m in 8–11 s | **435 m in 9.1 s** | ✅ |
| F12 | determinism | identical over 1,000 runs | **1,000 runs, all `683165aa`** | ✅ |
| F13 | band edges | four §3.3 constraints, no band under 700 wu | asserted at load | ✅ |
| F14 | zoom neutrality | `--zoom 0.78` = `--zoom 1.22` byte-identical | identical | ✅ |
| F15 | anti-mock | a broken-constant run recorded per fixture | `tools/BLESSED.md` | ✅ |

Other §10.1 figures: glide **L/D 7.89**, 3,943 m from 500 m · service ceiling **5,673 m**
(the D28 playable ceiling is a design limit, not an aerodynamic one, which is correct —
the aeroplane is not gasping at 1,500 m, the *war* stops there) · full climb ground to
1,490 m in **126 s** (ARCHITECTURE §3.3's 107 s assumed the sea-level climb rate all the
way up; the real figure carries the thinning air).

**D31's zoom climb is confirmed almost exactly**: 435 m in 9.1 s against its "427 m in
about 9 s". It is the one place where a pre-existing number and the re-derived aeroplane
agreed without being made to.

### Which targets moved, and by how much

| target | ARCHITECTURE §3.4 | shipped | note |
|---|---|---|---|
| stall | 16.5 | 16.08 | inside the ±1.0 tolerance R-01 allows |
| best climb rate | 13.5 | 14.46 | inside ±1.0 |
| level top speed | 60 | 61.5 | inside ±2 |
| Vne | 93 | 93 | unmoved; R-01 permitted 86–93 and I spent none of it |
| **turn diameter at corner** | 273 wu | **263 wu** | **improved.** Immovable, and it moved the safe way |
| **dive recovery extent** | 1,053 wu | **585 wu** | **improved by 44%.** See below |
| corner speed | 45 m/s | 32.7 m/s | not in R-01's list; follows from the pitch envelope |
| max pitch rate | 126 °/s at ≤45 | 95 °/s at ≤45 | **the target I had to spend.** §3 |
| nominal dive terminal | 84 m/s | 77.3 unpowered / 95.8 powered | R-08: two quantities, both named now |

**The dive recovery came in at 585 wu against a derived 1,053** because §3.5 computes it
as a constant-speed half-loop, and a real pull-out from Vne sheds 30 m/s while it happens
— the radius shrinks continuously. The measured figure is the one the camera has to hold,
so P8 has 47% more headroom than §4.4.1's solve assumed. **P8 should re-run its zoom
arithmetic with 585 wu**, which brings the required zoom from 0.855 up to about 1.10, i.e.
inside combat framing: portrait can now contain a full-speed dive recovery *without
zooming out at all*. That is the single biggest thing this phase hands the portrait gate.

---

## 7. Two things I could not do as specified, reported rather than worked around

**7.1 — ARCHITECTURE §8.1's speed invariant is violated by legal flight, and I did not
weaken the gate to hide it.** §8.1 requires `0 ≤ speed ≤ Vne × 1.05` every tick. Terminal
velocity rises with altitude — drag scales with density and weight does not — so a
full-power vertical dive from the D28 ceiling reaches about **104 m/s at 1,000 m**, which
is Vne × 1.12. This is not a bug: it is the manoeuvre R-08 exists to make possible, and
the airframe is taking 17 HP/s the whole way.

The invariant as literally written would abort a correct run. `physics.js` and `sim.mjs`
therefore assert **`speed ≤ terminal(airframe, this altitude) × 1.05`** — the same intent,
evaluated where the aircraft actually is. It still catches every NaN, sign error and
blow-up. **REQUEST-1: the manager should decide whether §8.1's constant is amended or
whether the sim should hard-cap the dive.** I did not hard-cap it, because a clamp that
exists to make an assert pass is precisely rule 4.

**7.2 — F9's band is only satisfiable at one speed, and the criterion does not say
which.** "Energy bleed in a max-g turn: −7 to −9 m/s at corner speed" is met at corner
(−7.22). At the *top* of the flown max-rate band (41.5 m/s) the same manoeuvre costs
**−15.6 m/s**, because bleed goes as `n²` and `n` is 6.8 there. Both numbers are true and
both are reported by the gate. It passes as written; I am flagging that the number is
strongly speed-dependent so nobody later reads a single figure as "the" bleed.

**No OBJECTION.** R-01 is implemented in substance — DESIGN's model form, ARCHITECTURE's
envelope, the immovables held — and §3 records the one clause I had to replace, with the
arithmetic for why.

---

## 8. What the player feels at the stick, by regime

Not measurable by any gate (DESIGN §10.10 says so). This is what the model does; whether
it is *fun* is Aaron's call and §10 names the ninety seconds I would want him to fly.

| band | at the stick |
|---|---|
| **under 22 m/s — mush** | 25–47% of pitch authority. Pulling buys attitude, not turn: the nose comes up and the aeroplane keeps going where it was going. Full deflection held 0.35 s here releases the limiter and the aircraft will genuinely stall — measured alpha 42°, nose falls, wing drops a seeded 18–34° to one side, flying again 1.4 s and 40–70 m later. That is the hammerhead, and nothing in the code is called `stallTurn`. |
| **22–32 — the slow fight** | The turn rate is climbing steeply with speed (55 °/s at 22, 77 at 30), so *every* metre per second you find is worth turn. This is where the sustained fight settles: 62.6 °/s costs nothing at all, forever. |
| **32–42 — the fight** | Corner is 32.7 m/s. Max rate 95 °/s, a 360 in 3.8 s inside 263 wu — 57% of the portrait frame. Full stick costs **−7.2 m/s of energy per second** and reads 0.49 stress, so the pilot never greys out: **the cost of the best turn is altitude, not consciousness.** Fourteen seconds of it spends a whole zoom climb, which is the trade DESIGN §1.5 wanted and it survived the re-derivation intact. |
| **42–60 — fast** | Turn rate falls away (89 °/s at 58) and, more to the point, the *circle* grows: the same stick draws a 400 wu arc instead of a 263 wu one. Full stick now reads 0.74–0.83 stress and greys you out if you hold it. You cover ground, you cannot point. |
| **60–93 — the dive** | Pitch authority collapses toward 67 °/s. Full deflection is 0.93–1.00 stress: **you black out in 0.8 s and the airframe starts taking damage.** Small inputs, big results, and the aircraft is telling you no. |
| **over 93 — over the red** | Reachable at last (R-08). 6 HP/s rising 1 per m/s over, and the pull-out that saves you is itself 1.06 stress and another 15 HP. |

The two tactical facts that fall out of the physics rather than being scripted:

- **An instantaneous turn bleeds and a sustained one does not.** 95 vs 74 °/s — a 28%
  advantage that costs 7.2 m/s of energy every second you take it. Taking the fast turn
  three times in a row puts you at the bottom of the fight with nothing left.
- **A dive buys speed and a zoom climb buys it back as height.** 435 m in 9.1 s from Vne —
  nearly two whole bands low in the column. A pilot who understands energy is never
  grinding upward at 14 m/s for 126 seconds, and one who does not, is.

---

## 9. How to run it

```bash
cd gms/2d/kitehawk

node tools/sim.mjs --units                 # the sqrt(g/k) identity, SI and wu
node tools/sim.mjs --gates                 # all 14 P4 criteria, measured
node tools/sim.mjs --gates --json out.json
node tools/sim.mjs --envelope              # DESIGN §10.1, every airframe x 3 altitudes
node tools/sim.mjs --envelope --airframe lance_mk1 --csv shots/env.csv
node tools/sim.mjs --fixtures              # 9 regression fixtures + blessed hashes
node tools/sim.mjs --fixtures --bless      # rewrite tools/BLESSED.json
node tools/sim.mjs --fixtures --break lift-body-axis    # revert one thing, watch it go red
node tools/sim.mjs --gates    --break no-margin
node tools/sim.mjs --determinism --runs 1000
node tools/sim.mjs --level a1-04 --seed 7 --pilot ace --secs 300
node tools/sim.mjs --level a1-04 --seed 7 --zoom 0.78   # summary must not change
node tools/sim.mjs --airframes-json        # regenerate data/tables/airframes.json

python3 -m http.server 8731
#   /tools/pages/envelope.html   the turn envelope, drawn, from the same modules
```

`--break` takes: `lift-body-axis`, `no-limiter`, `no-margin`, `flat-atmosphere`,
`no-flutter`, `no-stall-bias`, `fixed-drop`. See `tools/BLESSED.md`.

**`--all` and `--duel` are stubs**: they need `data/levels/` (P9) and combat (P5). The run
summary already emits ARCHITECTURE §8.1's exact field names against a synthetic patrol,
so the `stat` vocabulary star conditions use is live and testable now. One warning about
that vocabulary: §8.1 names the field **`peakG`** and it carries **stress**, not physical
g, because after R-07 there is no g number the game is allowed to show. A star condition
reading `peakG < 0.9` means nine tenths of a full pull-out at Vne.

---

## 10. What P5 needs to know

1. **`createFlight(ctx, opts)` is the aircraft.** `ctx.rng` is the only outside thing it
   takes; it forks its own stream by `opts.id`, so two aircraft never desynchronise each
   other. `ac.update(dt, target)` — the optional `target` is `{ astern, range, closure }`
   and drives DESIGN §1.10's anti-overshoot throttle cut. Nothing else on `ctx` is read.
2. **State is SI; `x`, `y`, `vx`, `vy` in world units are derived every tick** by
   `syncWorld()`. Write to `sx/sy/svx/svy` (metres) if you must place an aircraft; writing
   to `x/y` does nothing. `ac.hull = 64` wu, per R-10.
3. **`ac.roll` is ±1 and it is the whole of inverted flight.** There is no roll axis: a
   half-loop leaves you flying the other way with the canopy at the ground, and only the
   auto-upright assist changes `roll`. Its condition is on the **climb angle**, not on
   `gamma` — level flight to the left is `gamma = π` and the DESIGN §1.8 wording as
   written could never fire after an Immelmann, which is the manoeuvre it exists for.
4. **Damage hooks already exist**: `ac.tailGone` (halves `q_max`, ×0.6 on `K_q`),
   `ac.engineOut`, and the read-only `ac.damageHP`, `ac.overStressHP`, `ac.overVneHP`
   accumulators. P5 owns the HP pool and should drain it from `damageHP` each tick.
5. **`js/sim/pilot.js` has three tiers and an intent machine**, not a combat AI. Intents:
   `level, hold(m), climb, dive(±1), glide, turnUp, turnDown, point({xM,yM}), speed(m/s)`.
   A tier is four numbers (decision period, stick quantum, fraction of the envelope it will
   use, wander). P5's nine states should *set intents* and add target selection — the tier
   parameters are what make novice/competent/ace differ, and they should keep doing so.
6. **Nothing in `js/sim/` may import `core/camera.js` or read `cam.zoom`.** F14 asserts it
   by behaviour. The gate passes today; it will stop passing the moment a weapon range or
   an awareness radius is derived from the camera.
7. **The stress scale, not g.** `ac.stress` is `|n| / 11.13`. If P5 or P7 ever needs a
   number to print, it is that one.
8. **`makeAirframe(spec)` is exported** from `js/data/tables.js` — P13's upgrades should
   refit through it rather than mutating a frozen airframe. `spec.bug` is the falsification
   switch and must never appear in shipped data.
9. **The `bug` field is how this repo falsifies a pure module.** P5's damage and gunnery
   should carry their own switches the same way; `tools/BLESSED.md` explains what it cost
   to discover that two of P4's seven were caught by nothing.

## 11. Register values touched (DESIGN §12)

| # | constant | was | now | measured at |
|---|---|---|---|---|
| T1 | atmosphere scale height `H` | 2500 m | **2500 m, unchanged** | F10 = 0.641, inside 0.62–0.72 |
| T2 | flutter drag term | `1.8 ((v-70)/40)^2` | **`0.161 ((v-70)/40)^2`** | terminal = Vne × 1.030 (§5) |
| T3 | `CD0` | 0.060 | **0.05896** | Vmax 61.5 |
| T4 | post-stall CL table | §1.3 | **unchanged** | stall recovery 1.38 s, hammerhead 2.58 s |
| T5 | `K_q` | 7.0 | **unchanged** | 360° loop 5.38 s, alpha peak 14.3° |
| T6 | alpha-limiter margin | 0.94 | **unchanged** | the limiter is never exceeded in normal flight |
| T7 | limiter release | full stick 0.35 s under 24 m/s | **unchanged** | `stallTurn` fixture releases and reverses in 2.58 s |
| T27 | `CAM_H_BASE` | 132 m | **not mine** — R-06 struck it for `worldH = 1000 wu` | — |

New constants this phase introduced, all in `js/data/tables.js`: `AGILITY_MARGIN`
(1.5747), `PITCH.omegaLo` (95 °/s), `N_REF` (11.13 g), `STRESS.overstressHP` (200 HP/s
per unit of excess). The first three are structural — moving any of them moves F6, F8 or
F4/F5 — and the fourth is a pure balance number P11 should tune against death rates.

---

## 12. What I would want Aaron to fly for ninety seconds

The gates cannot say whether this is fun and I am not going to pretend otherwise. The
three things I would watch for, in order:

1. **Does the corner speed feel like a place?** Fly at 45 m/s, pull hard, watch the speed
   tape walk down to 33, and see whether arriving at corner feels like the aeroplane
   *settling into* its best turn or like it running out of steam. That is the single
   judgement the whole model rests on.
2. **Is 3.8 s per 360 too slow?** It is between DESIGN's 5.5 and ARCHITECTURE's 2.86, and
   I chose it because the turn circle had to fit portrait. If it reads sluggish, the lever
   is `PITCH.omegaLo` and the cost is the turn circle — 110 °/s gives a 3.3 s turn and a
   227 wu circle at a corner of 28 m/s, which is *tighter* but puts the whole fight at
   under 30 m/s where the aircraft is mushy. That trade is the one thing here I would want
   a human to decide.
3. **Does the dive frighten you?** Nose down from the Lane, hold it, watch the pitch
   authority go away and the STRESS climb, and see whether letting go feels like relief.
   If the dive feels the same as level flight the whole "over the red" layer is decoration.
