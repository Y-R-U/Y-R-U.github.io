# KITEHAWK — DESIGN

**Agent B (design/systems). Written 2026-08-23. Companion to `MANAGER_BRIEF.md`.**

This document is the systems and content spec. A build agent should be able to implement from it
without inventing a constant. Every number here is either **derived** (the working is shown) or
**[START]** — a starting value with a named test that refines it. The tuning register in §12 lists
every [START] value in one place.

Conventions used throughout, matching the brief:

- **+Y is down.** Gravity is `(0, +9.81)`. Climbing means `y` decreases.
- **Altitude** `alt` is metres above the ground plane; `world.y = -alt`.
- Angles in radians internally, degrees in this document.
- Fixed sim step `DT = 1/60`. Every rate here is per second unless stated.
- Distances in metres, masses in kilograms, forces in newtons.

---

## 0a. UNITS — the contract with agent A's engine

**The sim's canonical unit is the metre.** Agent A's engine expresses the same quantities in **world
units (wu)** with a single conversion constant. Everything in this document converts by that one
constant and nothing else.

```
M_PER_WU = 0.1550          →  1 wu ≈ 6 inches;  WU_PER_M = 6.452
```

That value is derived, not chosen. It is the number that makes A's four fixed envelope constants
agree with the physics in §1:

| A's engine constant | in metres at `M_PER_WU = 0.155` | §1 derives | agreement |
|---|---|---|---|
| stall **110 wu/s** | 17.1 m/s | **17.8 m/s** | 4% |
| cruise **320 wu/s** | 49.6 m/s | 45-50 m/s cruise band | ok |
| Vne **620 wu/s** | 96.1 m/s | **88 m/s** (terminal 90) | 9%, see REQ-B1 |
| structural **4.5 g** | — | **adopted; §1.5 recomputed at 4.5 g** | exact |
| pitch **150°/s → 95°/s at Vne** | — | **adopted; §1.7 rewritten** | exact |

Four of A's five constants land inside 10% of a physically-derived WWI scout. **A's numbers are
good. Only one of them does not fit.**

**REQ-B1 — the altitude column is the one inconsistency, and it is a factor of ~4.**
A specifies `1 wu = 8 ft = 2.4384 m` and a `1500 wu` column. Those two cannot both hold with the
speed constants: at `1 wu = 8 ft` a 110 wu/s stall is **268 m/s**, which is Mach 0.8. At the
speed-derived `1 wu = 0.155 m` a 1500 wu column is **232 m** — and a 232 m sky column deletes this
game's entire thesis, because at a 9.2 m/s climb rate you own the whole column in 25 seconds and
altitude stops being a resource. Three ways out, in order of preference:

1. **Recommended — keep every one of A's speed/pitch/g constants, set `1 wu = 0.155 m`, and restate
   the column as 3900-7100 wu** (600 m Act 1 → 1100 m Acts 3 and 5). One number changes, in one
   file. As a bonus, 6 inches is a far better sprite-authoring unit than 8 feet.
2. Keep `1 wu = 8 ft` and the 1500 wu (3658 m) column, and multiply A's speeds by 15.7. Two changes,
   and a 12,000 ft ceiling is above what a 1917 scout could reach.
3. Keep both as written and accept a 232 m column. **Reject** — it costs the design its thesis.

**REQ-B2 — A's dive-recovery datum is internally inconsistent and the real number is better.**
A reports a full-speed dive recovery as a 748 wu half-loop. Under A's own Vne (620 wu/s) and own
4.5 g limit, the radius is `v²/(g·√(n²−1))` = 1294 wu, so the half-loop is 2588 wu — 3.5x A's
figure. The physics in §1.5 gives **158 m** for a 4.5 g recovery from 58.3 m/s, which is
**1019 wu**. A's *conclusion* survives intact and gets stronger: at 158 m the recovery is 120% of a
portrait screen at base zoom and **366% of a landscape screen** at the same silhouette legibility.
Vertical manoeuvres are what portrait is for, and §2.1 now carries the corrected table.

**No screen-space gameplay constants.** Per D18 and §2.1, every gameplay distance here is in world
metres. `sim.mjs` runs with no camera and no renderer, which is the structural guarantee.

---

## 0b. THE ALTITUDE LADDER — six bands

**Manager call: six bands, named Mud / Belt / Floor / Deck / Lane / Blue, bottom to top.** The names
and the count are fixed (agent D writes them into ~40 briefings and every radio line; agent C has six
treatments). **The edge altitudes are mine, and here they are, with the mechanic that earns each
one — answering agent C's R10: yes, every band is mechanically meaningful, and no band exists as
scenery.**

Canonical edges for a 1000 m column. `Mud`, `Belt` and `Floor` are **absolute** — they are anchored
to physics (rifle range, flak fuse setting, the underside of cloud) and do not move between acts.
`Deck`, `Lane` and `Blue` **scale with the act's cloud deck and ceiling**.

| band | alt (m) | wu | what it *does* |
|---|---|---|---|
| **Mud** | 0 - 110 | 0 - 710 | Small arms bite (`P(hit) = 0.30·e^(−alt/90)·…`, §3.5). A stall below 60 m is fatal (§1.6). **The 1.6x canopy-cut is only reliable below 120 m** (§4.3) — so the best crate money in the game is paid out inside the one band that can kill you for a mistake. Ground clutter, trees, trench smoke that shows you the wind. |
| **Belt** | 110 - 340 | 710 - 2190 | The flak belt. Small arms fade out by 250 m, flak starts at 220 m, so 220-250 is the only overlap and it is the worst 30 m in the game. Flak's lead error scales with range and lags your current velocity, so **jinking defeats the Belt and cruising through it does not** (§3.5). Crossing the lines means crossing this. |
| **Floor** | 340 - 420 | 2190 - 2710 | The underside of the cloud deck. **The ambush shelf**: anything descending out of Deck arrives here with energy and no idea what is under it. Flak still reaches; guns still work; visibility is total. This is where a patient player waits. |
| **Deck** | 420 - 560 | 2710 - 3610 | Inside cloud. **No gun lock, no lead pip, no threat bracket.** You and they are invisible; the altitude ribbon shows a ghost that fades over 2 s (§8.2). Icing lives here in Act 4. Ace A4 lives here always. |
| **Lane** | 560 - 800 | 3610 - 5160 | Clear air above the weather. **Transports, bombers and zeppelins fly here** because it is the only band where a slow aircraft is safe from the ground. Every airdrop starts in Lane and falls through everything below it. |
| **Blue** | 800 - ceiling | 5160+ | Thin air: `rho = 0.726·rho0` at 800 m, `0.641` at 1100 m. Thrust down 20-27%, stall speed up 11%, **sustained turn rate down to ~65% of sea level**. Fastest and worst-turning band in the game. The sun lives here (Act 5). Climbing into it costs 65-90 s and you must want it. |

**Per-act edges** (Mud/Belt/Floor fixed; the top three scale):

| act | ceiling | Deck | Lane | Blue | note |
|---|---|---|---|---|---|
| 1 | 600 m | 400-470 (scattered) | 470-540 | 540-600 | Act 1's Blue is a sliver. **You live in Mud/Belt/Floor.** |
| 2 | 800 m | 420-560 (solid) | 560-720 | 720-800 | Deck and Lane open. The whole act is about the deck. |
| 3 | 1100 m | 500-640 | 640-880 | 880-1100 | Blue opens properly; ridge updrafts are a free lift to it. |
| 4 | 900 m | 420-700 (deep, icing) | 700-820 | 820-900 | Deck becomes hostile; Blue is unreachable while iced. |
| 5 | 1100 m | 560-660 (thin) | 660-860 | 860-1100 | **Blue is the arena.** The sun is up there. |

> **The acts unlock the sky upward.** That is the campaign structure and it is one line of data. Act 1
> is fought in the bottom three bands, Act 2 opens the middle two, Act 3 opens Blue, Act 4 makes the
> middle two hostile, Act 5 makes Blue the arena. A player who reaches Act 5 has learned six distinct
> places to be, and every one of them changed how their aeroplane behaved.

**Agent C's R9 — one forced climb per act — confirmed, and it is the act's prettiest level:**

| act | level | the climb |
|---|---|---|
| 1 | **14** "The Ferry" | dawn, no enemies; the route punches up through the scattered layer into the first sunlight of the game |
| 2 | **25** first zeppelin | you must come up through the solid deck at 420-560 into flat morning light to reach it at 500 m |
| 3 | **58** zeppelin over the mountains | ridge updrafts carry you out of the valley shadow, through the deck, into low autumn sun |
| 4 | **69** "Icing" | climb through cloud above 700 m twice, out of a storm into a clear, freezing, moonlit Blue |
| 5 | **84** "The Sun Run" | the highest race course in the game, finishing in the Blue with the sun disc in frame |

---

## 0. The thesis, stated as a mechanic

Altitude is stored speed. Speed is stored altitude. Everything else in the game — the crates, the
flak band, the cloud deck, the zeppelin, the whole enemy roster — exists to force the player to
*spend* one of those two things to get the other. A level is won by being the pilot who spent
theirs more cleverly.

If a system in this document does not touch that trade, it is decoration and should be cut.

---

## 1. THE FLIGHT MODEL

### 1.1 Model class

A **point-mass aerodynamic model in the vertical plane**. Not a torque/inertia rigid body — those
are miserable on a touchscreen and hide the energy story behind a second-order response. Six state
variables per aircraft:

```
pos   (x, y)      m        world position, y = -alt
vel   (vx, vy)    m/s      velocity
theta             rad      nose direction
q                 rad/s    pitch rate (integrated, rate-limited)
```

Derived every step:

```
v        = |vel|
gamma    = atan2(vel.y, vel.x)          flight path angle; gamma > 0 = descending (+Y down)
alpha    = wrapPi(gamma - theta)        angle of attack; positive = nose above the flight path
f        = (cos theta, sin theta)       body forward
n        = (sin theta, -cos theta)      body "up" (canopy side); = R(theta) * (0,-1)
```

Sanity check on the sign convention: flying right (`theta = 0`) and descending 5° (`gamma = +5°`)
gives `alpha = +5°`, positive lift along `n = (0,-1)` = up the screen. Correct.

### 1.2 Atmosphere

```
rho(alt) = RHO0 * exp(-alt / H)     RHO0 = 1.225 kg/m^3,  H = 2500 m      [START: H]
```

The real scale height is 8500 m; at our 1000 m ceiling that is only an 11% density loss, which the
player cannot feel. **H = 2500 m** gives `rho(1000) = 0.670 * rho0` — a third less lift, a third
less thrust, and a visibly worse turn at the top of the column. That is the whole point of having a
ceiling. *Refined by:* sim.mjs envelope report — target is that the sustained turn rate at 900 m is
between 62% and 72% of the sea-level figure.

Thrust also falls with density (a normally-aspirated rotary):

```
T(alt) = T0 * (rho(alt) / RHO0) ^ 0.7
```

At 1000 m that is `0.670^0.7 = 0.762` — 24% of the thrust gone.

### 1.3 Forces

```
q_dyn = 0.5 * rho * v*v
L     = q_dyn * S * CL(alpha)            along +n
D     = q_dyn * S * CD(alpha, v)         along -vhat
Th    = T(alt) * throttle                along +f
a     = (Th*f + L*n - D*vhat) / m + (0, G)
```

**Lift curve.** Linear to the stall, then a modelled break:

```
CL0     = 0.15        camber, so alpha = 0 still lifts (and inverted flight costs you)
CLa     = 5.00 /rad   lift-curve slope
a_stall = 15 deg
CLmax   = CL0 + CLa * a_stall = 0.15 + 5.00*0.2618 = 1.459
```

| alpha | -10° | -5° | 0° | 5° | 10° | 15° | 18° | 22° | 30° | 45° | 90° |
|---|---|---|---|---|---|---|---|---|---|---|---|
| CL | -0.72 | -0.29 | 0.15 | 0.59 | 1.02 | **1.46** | 1.17 | 0.84 | 0.66 | 0.55 | 0.00 |

Post-stall is a table lookup with linear interpolation, mirrored for negative alpha about the
`CL0` offset (negative stall at -17.4°, `CLmin = -1.16` — inverted you stall earlier and lift less,
which is correct and gives inverted flight a real, felt cost).

**Drag.**

```
AR   = 5.5,  e = 0.80,  k = 1/(pi*AR*e) = 0.0724
CD   = CD0_eff + k*CL*CL + CD_stall
CD0  = 0.060                            a biplane is a kite full of wires
CD_stall = 0.90 * sin^2(alpha - a_stall) for |alpha| > a_stall, else 0
CD0_eff  = CD0 * (1 + 1.8 * ((v - 70)/40)^2)  for v > 70 m/s, else CD0     [START: flutter term]
```

The high-speed drag rise is a stand-in for rigging flutter and slipstream break-up. It is what
gives the dive a terminal speed instead of an unbounded one, and it is why the dive feels like it
is *resisting* you. *Refined by:* the dive fixture in sim.mjs — target terminal dive speed 88-94 m/s.

### 1.4 Act-1 reference airframe — "Kite B.1"

```
m       = 520 kg          (loaded; a Camel was ~670, this is a lighter fiction)
S       = 18 m^2
T0      = 2300 N          T/W = 2300 / (520*9.81) = 0.451
CLmax   = 1.459
CD0     = 0.060
n_lim   = 4.5 g           structural, wire-braced  (fixed by agent A's engine envelope)
n_neg   = -2.5 g
V_NE    = 88 m/s
W       = 5101 N
```

### 1.5 The derived envelope (this is the aircraft's character; the build must reproduce it)

Working, at sea level, so the build agent can verify their implementation against real arithmetic.

```
q_dyn*S at speed v  =  0.5 * 1.225 * 18 * v^2  =  11.025 * v^2
D_parasite          =  0.060 * 11.025 * v^2    =  0.6615 * v^2
D_induced (1g)      =  k*W^2 / (q_dyn*S)       =  0.0724*5101^2 / (11.025 v^2) = 170,900 / v^2
```

**Stall speed (1 g, level).** `L = W` → `v^2 = 2W/(rho*S*CLmax) = 10202/32.19 = 316.9`

> **V_s = 17.8 m/s** (64 km/h)

**Level top speed.** `T = D`: `0.6615 v^2 + 170900/v^2 = 2300`. v=58 → 2225+50.8 = 2276. v=59 →
2303+49.1 = 2352.

> **V_max = 58.3 m/s** (210 km/h)

**Terminal dive.** Vertical, `T + W = D` = 7401 N, with the flutter term. v=88 → CD0_eff = 0.0819,
D = 6992. v=92 → CD0_eff = 0.0927, D = 8650.

> **V_dive_term = 90 m/s**, and **V_NE = 88 m/s** sits just below it — so a sustained vertical dive
> *will* break the aircraft if you hold it. Deliberate.

**Speed band = 17.8 / 58.3 / 90 → a 5.05:1 ratio.** That ratio is the game.

**Best rate of climb.** `RoC = v*(T - D)/W`:

| v (m/s) | D (N) | excess (N) | RoC (m/s) |
|---|---|---|---|
| 26 | 447 + 253 = 700 | 1600 | 8.00 |
| 30 | 595 + 190 = 785 | 1515 | 8.91 |
| **34** | 765 + 148 = 913 | 1387 | **9.24** |
| 40 | 1058 + 107 = 1165 | 1135 | 8.90 |
| 48 | 1524 + 74 = 1598 | 702 | 6.61 |
| 55 | 2001 + 56 = 2057 | 243 | 2.62 |

> **Best climb 9.2 m/s at 34 m/s.** Flat between 30 and 40 — so the player does not need to hit a
> precise number, they just need to not be slow and not be fast. Good for a thumb.

Climb from the deck to the 600 m Act-1 ceiling: **65 s**. That is a long time on purpose. Height
is expensive; that is why you steal it from a dive instead.

**Zoom climb.** From `V_max` to just above the stall, ideal exchange:

```
dh = (58.3^2 - 20^2) / (2*9.81) = (3399 - 400)/19.62 = 153 m ideal
```

Drag during the pull-up and climb eats roughly a quarter: **~115 m of real zoom climb**, about one
portrait screen. So "dive away, come back up on top of him" is a ~115 m manoeuvre with a known
price, and the player learns that number in their hands.

**Dive-for-speed.** Diving 300 m from 30 m/s, ideal: `v^2 = 900 + 2*9.81*300 = 6786` → **82 m/s**.
Real, with drag on a 40° dive: **72-76 m/s**. So a 300 m dive takes you from slow to nearly the
red line. Altitude *is* the throttle.

**Corner speed** — where the aerodynamic g limit meets the structural one:

```
V_c^2 = 2*n_lim*W / (rho*S*CLmax) = 2*4.5*5101 / 32.19 = 1426
```

> **V_c = 37.8 m/s** (244 wu/s). Dead centre of the band. Everything else follows from this.

**Turn rate.** In the vertical plane, `omega = g*sqrt(n^2 - 1)/v` for the sustained-circle
approximation (the sim integrates the real normal acceleration; this table is what it should
produce on average round a loop).

| v | n available (aero) | n used | omega (deg/s) | 360° loop |
|---|---|---|---|---|
| 22 | 1.53 | 1.53 | 29.6 | 12.2 s |
| 26 | 2.13 | 2.13 | 40.7 | 8.8 s |
| 30 | 2.84 | 2.84 | 49.8 | 7.2 s |
| 34 | 3.65 | 3.65 | 58.0 | 6.2 s |
| **37.8** | 4.50 | **4.50** (limit) | **65.2** | **5.5 s** |
| 46 | 6.68 | 4.50 | 53.6 | 6.7 s |
| 52 | 8.54 | 4.50 | 47.4 | 7.6 s |
| 58.3 | 10.7 | 4.50 | 42.3 | 8.5 s |

**Sustained turn** (thrust-limited, energy-neutral):

```
D(n) = CD0*q_dyn*S + k*n^2*W^2/(q_dyn*S) ;  solve T = D(n)
```

| v | n sustained | omega_sus (deg/s) | note |
|---|---|---|---|
| 23 | 1.67 (aero-capped) | 27 | stalling out |
| **26** | **2.71** | **54.5** | best sustained |
| 30 | 3.00 | 53.0 | |
| 34 | 3.22 | 50.7 | |
| 40 | 3.41 | 45.8 | |
| 48 | 3.43 | 38.2 | |

> **Instantaneous best: 65°/s at 37.8 m/s, and it costs you.
> Sustained best: 54°/s at 26 m/s, and it costs you nothing but leaves you slow.**

That gap — 65 vs 54 — is the entire tactical decision of a dogfight, and it fell out of the physics
rather than being scripted. Do not flatten it.

**Energy bleed in a hard turn.** At corner speed 37.8 m/s pulling 4.5 g:
`q_dyn*S = 15755`, `D = 0.060*15755 + 0.0724*4.5^2*5101^2/15755 = 945 + 2421 = 3366 N`, excess
`= -1066 N`, so `dv/dt = -2.05 m/s^2` and the specific-energy rate is `-1066*37.8/5101 = -7.9 m/s`.

> **A max-g turn costs about 8 metres of altitude per second.** Fourteen seconds of hard turning is
> a whole zoom climb. Put that number on the HUD (the energy chevron, §2.7) and the player will
> internalise it without a tutorial.

### 1.6 Stall, and how it is forgiving without being fake

Past `a_stall` the lift table breaks, `CD_stall` spikes, and the model does three things:

1. **Pitch-down moment.** An automatic nose-down bias of `-1.6 rad/s^2` on `q` proportional to
   `(alpha - a_stall)`. The nose falls whether you like it or not.
2. **Wing drop.** A one-off impulse: `theta` kicks `18-34°` toward the nose-down side and the sprite
   snaps into a quarter-roll. Random side, seeded.
3. **Authority loss.** `q_max` is already scaled by dynamic pressure (§1.7) so at 16 m/s you have
   25% of your pitch authority. The stick goes dead in your hand.

Recovery is: stop pulling. Alpha reduces as the nose falls, the wing bites at about 0.8 s, flying
speed is back at about 1.5 s, and you have lost **40-70 m**. Above 80 m altitude a stall is an
embarrassment. Below 60 m it is fatal. That is exactly the tension we want at the bottom of the
column where the crates and the ground guns are.

**The forgiveness, precisely.** The stick does not command alpha. It commands a **load factor**,
and a limiter converts that to an alpha inside the envelope:

```
n_cmd   = stick > 0 ?  1 + stick*(n_lim - 1)
                    :  1 + stick*(1 - n_neg)          (stick < 0 → pushes toward -2.5 g)
CL_req  = n_cmd * W / (q_dyn * S)
CL_cap  = CLmax * ALPHA_LIMIT_MARGIN                   ALPHA_LIMIT_MARGIN = 0.94
alpha_cmd = invCL(clamp(CL_req, -CLmin*0.94, CL_cap))
```

With the limiter on, **the player cannot stall by pulling**. They just get everything the wing has.
This is why the game is "easy to play".

The expert's escape hatch: the limiter releases if the player holds **full deflection for >0.35 s
while below 24 m/s**. Then alpha is commanded raw and you can hang the aircraft on the prop, flick
it, and do a hammerhead. Deliberate stalling is a *skill* the model rewards; accidental stalling is
a *bug in the interface* and we removed it.

**Free skill move that emerges, not scripted:** hold the nose vertical until `v < 12 m/s` and the
model's own asymmetry (wing drop + the pitch-down bias) slices the nose over to one side. That is a
stall turn. It reverses your direction in about 1.2 s and costs 0 metres of horizontal room, and
nobody wrote a "stall turn" function.

### 1.7 Pitch control

Agent A fixes the pitch envelope: **150 deg/s, falling to 95 deg/s at Vne.** Adopted verbatim,
with a low-speed authority term on top (elevator effectiveness scales with dynamic pressure, and
without it the mush in §1.9 does not exist):

```
q_ceiling   = lerp(150, 95, clamp((v - 50)/(88 - 50), 0, 1))   deg/s   [A's constants]
q_authority = clamp((v/32)^2, 0.25, 1.0)                        low-speed elevator effectiveness
q_max       = radians(q_ceiling) * q_authority
q_cmd       = clamp(K_q*(alpha_cmd - alpha) + gamma_dot, -q_max, q_max)      K_q = 7.0
theta      += q_cmd * DT
```

At 16 m/s that is `150 * 0.25 = 37 deg/s` — a quarter of your authority, which *is* the mush.
At Vne it is 95 deg/s, which is why the dive feels like it is resisting you.

Feeding `gamma_dot` forward means the aircraft *tracks* its own turn instead of lagging it, which
is what makes a loop feel clean rather than mushy. `K_q = 7.0` is a 0.14 s alpha time-constant —
crisp but not instant. **[START: K_q]** (`q_ceiling` is A's, not a [START] value.) *Refined by:* the loop fixture — a full 360° loop
from 40 m/s must complete in 5.0-5.6 s with no alpha overshoot beyond 16°.

Damage modifiers: tail destroyed → `q_max *= 0.5, K_q *= 0.6`, plus a `±2°` trim wander at 0.3 Hz.

### 1.8 Direction reversal, inverted flight, roll

The aircraft has a full 0-360° `theta`. **You reverse direction by pitching through the vertical** —
that is a loop, a wingover, or a stall turn. There is no roll button and there must never be one.

- The sprite flips its facing when `cos(theta)` changes sign, over a 0.18 s roll animation.
- **Inverted** = `n` points down-screen. The camber penalty is real: holding level inverted needs
  `alpha ≈ -1.7°` more than upright, and `CLmin` is 20% weaker than `CLmax`, so an inverted turn is
  measurably worse. Good — split-S is a commitment.
- **Auto-upright assist:** if inverted, `|gamma| < 25°`, and the stick has been neutral for 0.6 s,
  the aircraft half-rolls upright over 0.4 s. A casual player is never stuck upside down. Any touch
  cancels it instantly, so an expert holding an inverted extension is never fought.

### 1.9 What the player feels at the stick, by regime

This table is a design contract for the feel programmer, the audio pass, and the HUD.

| band | name | at the stick | screen / audio tell | the thought |
|---|---|---|---|---|
| < 22 m/s | **mush** | soft, 25-40% authority, pulling buys attitude not turn | buffet shake 3 px @ 11 Hz, wind noise drops away, engine dominant, speed tape red | "I'm out of ideas. Nose down." |
| 22-32 | **slow fight** | responsive, but every pull sinks the aircraft | slight buffet at high pull, prop wash haze | "I'm winning angles and losing the sky." |
| 32-48 | **the fight** (corner 37.8) | crisp, immediate, the strongest turn in the game; a hard pull visibly walks the speed tape down | g-vignette starts at 3.8 g, contrail wisps off the wingtips above 3.6 g | "This is it. How long can I afford this?" |
| 48-70 | **fast** | heavy; turns go wide; you cover ground | wind rises, camera zooms out, world blurs at the edges | "Safe, fast, and I can't point at anything." |
| 70-88 | **the dive** | stiffer still; small inputs, big results | wind roar, edge speed-streaks, airframe groan, structural warning chevron at 82 | "I'm buying this with something." |
| > 88 (V_NE) | **over the red** | still flies, but the wings are dying at 6 HP/s (rising 1 HP/s per m/s over) | rigging howl, fabric flutter, red flash on the wing silhouette | "Let go. Let go now." |

**Greyout:** at `n >= 3.8 g` held 0.8 s a vignette closes to 55% over 1.2 s; at 4.5 g held 1.4 s
control lag of 0.25 s is added. The `Iron Neck` trait removes both. This is the only place the
model punishes the *player* rather than the aircraft, and it is a soft, reversible punishment.

### 1.10 Fuel and auto-throttle

```
burn = 0.85/s at throttle 1.0 ; 0.45/s at 0.55 ; 0.18/s when windmilling/idle
fuel capacity (T1) = 100 units  →  118 s at full, 222 s at cruise
```

Auto-throttle law (there is no throttle control and there must not be one):

```
throttle = 1.0
  * 0.55 if within 30 m astern of the locked target with closure > 12 m/s   (anti-overshoot)
  * 0.00 for 0.4 s during a stall break                                      (recovery aid)
  * override by the stick's horizontal axis (§2.3)
```

The anti-overshoot cut is important: without it the auto-throttle makes the player fly *through*
every gun solution. With it, the aircraft settles into the saddle behind a target and the guns do
their work.

### 1.11 Airframes

Engine/guns/armour/fuel/ammo are owned **globally** and refit to any airframe for free. The
airframe is the purchase, and the airframes are **sidegrades, not a ladder**.

| airframe | act | m | S | CLmax | CD0 | n_lim | base T0 | V_s | V_max | RoC | V_c | character |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Kite B.1** | 1 | 520 | 18 | 1.46 | 0.060 | 4.5 | 2300 | 17.8 | 58.3 | 9.2 | 37.8 | the honest one |
| **Kite B.2 "Scrapper"** | 2 | 540 | 19 | 1.52 | 0.056 | 4.7 | 2600 | 17.4 | 61.9 | 10.6 | 37.6 | B.1 but better everywhere |
| **Harrier Tri** (triplane) | 3 | 575 | 21 | 1.66 | 0.070 | 4.9 | 3050 | 16.4 | 60.2 | 12.4 | 36.5 | climbs and turns; slow; draggy in a dive |
| **Lance Mk.I** (sesquiplane) | 3 | 505 | 17 | 1.44 | 0.046 | 4.1 | 3050 | 18.2 | 70.4 | 11.7 | 37.0 | fast, holds energy, mushy slow |
| **Harrier II / Lance II** | 4 | as above, T0 3500, n_lim +0.3, CD0 -0.004 | | | | | | | | | | refits |
| **Kitehawk** (prototype) | 5 | 530 | 19 | 1.60 | 0.044 | 5.0 | 4000 | 17.0 | 76.5 | 15.1 | 39.5 | the whole envelope at once |

`n_lim` values are anchored on agent A's **4.5 g** for the reference airframe and spread ±0.4
around it; **4.9 g on the triplane is the game's hard ceiling** and A's engine clamp should be set
there, not at 4.5.

The Act-3 choice is the design's centrepiece: **Harrier turns and climbs, Lance runs and dives, and
Act-2 income only affords one of them** (§6.5). Ace A5 "Anvil" is unbeatable-by-turning and easy for
a Lance; ace A4 "Gale" hides in cloud and is easy for a Harrier. Neither choice is wrong and both
levels are winnable either way — just differently.

*Refined by:* the duel matrix (§10.2). Target: every airframe wins 45-65% against every act-
appropriate ace. Any airframe outside that band on more than two aces is mis-tuned.

---

## 2. CONTROLS

### 2.1 Reference resolution and scale

All UI numbers are in **logical pixels on a 432 x 936 portrait canvas** (9:19.5, scaled to the
device). Landscape reference is **936 x 432** and every rect below is defined as an anchor + offset
so the orientation flip is a config change, not a rewrite.

**World scale.** Camera height `camH` metres maps to the 936 px long axis. Per **D18** the zoom is
automatic and framing-driven, clamped to **0.8x - 1.3x of base**:

```
CAM_H_BASE = 132 m
camH       = CAM_H_BASE * z,   z in [0.80, 1.30]   (biased by the tight/normal/wide preference)
pxPerMetre = 936 / camH
```

| z | camH | px/m | Kite B.1 (7.4 m) | visible W x H (portrait) |
|---|---|---|---|---|
| 0.80 (tight) | 105.6 m | 8.86 | **66 px** | 48.8 x 105.6 m |
| 1.00 (base) | 132.0 m | 7.09 | **52 px** | 60.9 x 132.0 m |
| 1.30 (wide) | 171.6 m | 5.45 | **40 px** | 79.2 x 171.6 m |

40 px is the **silhouette legibility floor** and it is what D18's gate measures on a 390x844 screen.
Do not exceed z = 1.3 to solve a framing problem; solve it with a HUD marker instead (§2.9b).

**Turn radius vs viewport — the portrait argument, in numbers.** `r = v / omega`:

| manoeuvre | v | omega | radius | **circle diameter** | fits at |
|---|---|---|---|---|---|
| best sustained turn | 26 m/s | 0.710 rad/s | 36.6 m | **73 m** | base zoom (61 m wide) at z = 1.20 horizontally; base zoom vertically |
| corner-speed instantaneous turn | 37.8 | 1.139 | 33.2 m | **66 m** | z = 1.10 horizontally; base zoom vertically |
| **4.5 g dive recovery from V_max** | 58.3 | 0.738 | 79.0 m | **158 m** (= 1019 wu) | **vertically at z = 1.20**; never horizontally |
| zoom climb from V_max | - | - | - | **115 m of height** | vertically at z = 0.90 |

> The fast manoeuvres in this game are **vertical**, because with no yaw plane a reversal *is* a
> loop. A full-speed dive recovery is **158 m tall** and 158 m wide; portrait shows 132 m of height
> at base zoom and 172 m at z = 1.3, against 61-79 m of width. **Portrait frames the manoeuvre the
> game is actually made of.** A landscape screen at the same silhouette legibility floor shows 43 m
> of height — it could not contain a quarter of one dive recovery.
>
> This is agent A's finding, recomputed against §1.5 (see REQ-B2): A had it at 75% of portrait
> height, it is really 120%, and the landscape comparison goes from 134% to **366%**. The
> conclusion A drew is right and the corrected numbers make it three times stronger.

That is the honest case for portrait and it is a testable claim, not a preference: it is criterion
P3 in §2.9. The flight model was **not** tightened to fit a viewport — the turn rates in §1.5 fall
out of agent A's `n_lim = 4.5` and `CLmax = 1.46`, and the camera was then sized to them.

The full sky column is 600-1100 m depending on act, i.e. **4.5 to 8.3 screens tall at base zoom**.
The camera pans vertically (§2.8) and the **altitude ribbon** (§2.7) carries the strategic picture.

**Invariant, from D18: zoom changes the view and nothing else.** Every distance in this document is
in **world metres**, evaluated in world space, at every zoom level:

- gun cone `RANGE_EFFECTIVE = 140 m`, `CONE_HALF = 8 deg`, `CONE_SNAP_BONUS` inside `50 m` — world.
- crate collect radius `9 m`, canopy-cut geometry, drop-ring `30 m` — world.
- AI awareness/engage/extend ranges, formation station offsets, morale "alone" radius — world.
- flak burst radii, small-arms altitude envelope, balloon blast radius — world.
- the only screen-space numbers in the whole design are the stick radius `R = 90 px`, the deadzone,
  HUD rects, and the camera lead clamp. They are listed here so a reviewer can check the list is
  short. **If a gameplay constant ever needs `pxPerMetre` to evaluate, it is a bug.**

sim.mjs runs with no camera at all (§10), which is the structural guarantee that this holds.

### 2.2 The stick

A **floating relative stick** over the whole screen minus reserved rects.

- Reserved (not stick): top-left 64x64 pause; right-edge ribbon 26 px wide; bottom-right 108 px
  radius special button (mirrored bottom-left if `handedness = left`); safe-area insets.
- `touchstart` anywhere else sets the anchor `(ax, ay)`. **No input is produced on touchdown** —
  putting a thumb down never twitches the aircraft.
- ```
  raw   = (ay - y) / R                         R = 90 px  (0.208 of canvas width)
  s     = clamp(raw, -1, 1)
  dz    = 0.067                                6 px deadzone
  stick = sign(s) * ((|s| - dz)/(1 - dz))^1.35 , 0 if |s| < dz
  ```
  The 1.35 exponent buys precision near centre — 50% thumb travel gives 40% command — without
  making the extremes feel far away.
- **Thumb up = nose up.** Not pull-back-to-climb. A phone player expects drag-up-to-go-up and Aaron
  said easy. `settings.invertPitch` flips it for sim-heads; default **off**.
- **Anchor slide:** if `|ay - y| > R` the anchor is snapped so the thumb sits exactly at `R`. The
  player can never run out of screen at the bottom bezel, which is the single most common failure of
  a fixed virtual stick on a tall phone.
- **Release:** the stick eases to 0 over **0.18 s** (`easeOutCubic`). Instant release reads as
  robotic and makes recovery from a hard pull snap the nose.

### 2.3 The horizontal axis (drag-to-override)

Horizontal deflection past a **0.25 deadzone** is an *optional* override. Neither is ever required
to complete a level; both are how an expert wins a scissors.

```
h = clamp((x - ax)/R, -1, 1)
h < -0.25   (drag behind the aircraft's facing)  →  throttle = 1 - 0.8*((|h|-0.25)/0.75)
                                                    plus airbrake: CD0 *= 1 + 0.9*((|h|-0.25)/0.75)
h > +0.25   (drag ahead)                         →  Emergency Boost, if owned and charged (§4.5)
```

Cutting the throttle and adding drag is the classic "he overshoots, I don't" move, and mapping it to
a direction the thumb is already travelling costs zero buttons. The 0.25 deadzone means a sloppy
diagonal drag never accidentally kills your engine.

Note: "behind"/"ahead" are relative to the aircraft's screen facing, so the gesture stays consistent
after a reversal.

### 2.4 The special

- Dedicated button, bottom-right, 108 px radius, 24 px from the safe area. Ammo count as a ring.
- **Or**: a second finger tapping anywhere fires the loaded special. The flying thumb never moves.
  This is the whole reason there is exactly one special slot.
- Long-press the button (0.5 s) cycles between owned specials if more than one is loaded (Act 4+).
  Long-press never fires.

### 2.5 The auto-fire cone

Guns fire automatically. There is no fire button and there must not be one.

```
CONE_HALF        = 8 deg
CONE_SNAP_BONUS  = +6 deg for targets closer than 50 m       (a cone, not a wedge)
RANGE_EFFECTIVE  = 140 m       (190 m with Long Vickers, 175 m with Eagle Eye)
RANGE_TRACER     = 220 m       visual only
ACQUIRE_DELAY    = 0.08 s      the pilot squeezing; also stops one-frame flickers firing
CONVERGENCE      = 90 m        the two gun streams cross here
V_BULLET         = 420 m/s + own forward speed
DISPERSION       = 0.6 deg (1 sigma, per round)
BULLET_G         = 0.35 * 9.81  (a token drop so long shots need a little elevation)
```

**Target priority** — score every candidate inside the cone and range, pick the max:

```
score =  1.20 * (1 - |ang|/cone_half)            alignment
       + 1.00 * (1 - dist/RANGE_EFFECTIVE)       proximity
       + 0.90 * (is shooting at me ? 1 : 0)      threat
       + 0.60 * (1 - hp/hpMax)                   finish the wounded
       + 1.50 * (is a mission objective ? 1 : 0)
```

Ties broken by lowest absolute HP. **Hysteresis:** a locked target is retained until it leaves the
cone for 0.40 s, dies, or another candidate scores 1.35x higher. Without hysteresis the reticle
strobes between two crossing aircraft and the player cannot read anything.

### 2.6 The assist must not hold a good player back — how

This is the central design rule of the control scheme, stated once, in one sentence:

> **The assist decides *when* to pull the trigger. It never decides *where* the bullets go.**

Bullets are real projectiles: muzzle speed, gravity drop, dispersion, travel time, convergence.
There is no hit-scan, no aim snapping, no soft-lock magnetism, ever. The consequences:

- A lazy player who holds the enemy vaguely in the nose gets a spray and a fraction of the hits.
  They still progress, because enemy HP is tuned around that (§3.1).
- A good player who puts the **lead pip** on the target lands every round. At 100 m against a 50 m/s
  crosser the lead is `0.24 s * 50 = 12 m` — one and a half aircraft lengths. That is a real,
  learnable, rewarding skill and the auto-fire cannot do it for you.
- Inside 40 m the two streams straddle a small target (convergence is 90 m), so hit rate *drops*
  when you ram. Emergent, correct, and it discourages the degenerate strategy.
- The `Cool Hand` trait makes the auto-fire **stricter** — it only fires inside 2° of the true
  solution. It saves 40% of the ammo and raises the hit rate 15%. The expert's upgrade is an assist
  that does *less*. That is the shape every assist in this game should take.

**Lead pip:** iterate twice — `t = d/V_b`, then `t = |target + vel_t*t - gun| / V_b` — and draw a
small open circle at the predicted intercept, plus a faint line from the nose to it. If the pip is
inside the cone, the pip fills. That fill is the "you will hit" signal and it is the whole gunnery
tutorial.

### 2.7 HUD

| element | position | content |
|---|---|---|
| **Speed tape** | left edge, 22 px, full height | airspeed; banded red <22, amber 22-30, green 30-60, amber 60-78, red >78, hard red >88. **Energy chevron**: a second marker showing `E = alt + v^2/(2g)` in metres, i.e. the height you could zoom to. Teaches the core concept with no words. |
| **Altitude ribbon** | right edge, 26 px, full height | 0 to the act ceiling, compressed. Your marker, a dot per contact (red/blue/gold), and shaded bands for small-arms envelope, flak, cloud deck, icing, ceiling. **This is what makes the tall column legible.** |
| ~~Airframe silhouette~~ | — | **Removed. Agent C's R11 is accepted in full: there is no damage bar, no damage diagram, and no health number anywhere on the default HUD.** Damage is read off the aeroplane — oil wisp, black smoke, dead prop, rippling fabric, ribs showing, a snapped strut, a permanent bend, flame. §3.2 is therefore not decoration; it is the entire damage UI and every state in it must be visually distinct at 40 px. Kept only as `settings.damageDiagram`, **default off**, an accessibility option for players who cannot resolve the art at distance (§9.3). |
| **Ammo ring** | around the special button | rounds remaining as an arc; turns amber <25%, red <10% |
| **Fuel arc** | inner ring, same button | only shown when <60% or in Long Patrol/Airlift |
| **Threat bracket** | over the aircraft | a converging red bracket 0.5 s before any enemy with a firing solution opens fire. **The single most important readability feature in the game.** |
| **Edge chevrons** | viewport border | every off-screen contact: size by proximity, colour by allegiance, a tick showing whether it is above or below |
| **Crate marker** | world-space | a gold canopy icon with a dashed predicted-impact line (with the `Wind Reader` trait, or always on Cadet) |
| **Wind** | top-centre, 60x18 | an arrow and a number; a second, smaller arrow if there is a shear layer |
| **Objective** | top-centre banner | never more than 3 words. Every mission line has a 3-word form. |

**Colour law** (constrains agent C): hostile = warm red-orange trim, friendly = pale blue-white,
crates = gold with a 0.7 Hz pulse, objective = white outline. Colour is **never the only channel** —
hostiles also carry a chevron shape and friendlies a roundel, for colour-blind play.

### 2.8 Camera

- Portrait: aircraft at horizontal centre (per the brief), vertically at **58%** when level, easing
  to **42%** when climbing hard and **70%** when diving hard (lead the nose into the sky you are
  about to need).
- Lead the velocity vector by **0.35 s**, clamped to 90 px of offset.
- Vertical pan clamps at the ground (never show below `alt = -8 m`) and at `ceiling + 60 m`.
- Shake: impulse on gun fire (1.5 px), hits taken (4 px), explosions (scaled by distance, max 9 px).
  `settings.reducedMotion` zeroes all of it and removes the kill-cam dilation.
- Time dilation: **none, except** a 0.35 s dip to 0.35x on the killing blow against a named ace, a
  zeppelin, or the last enemy in a level. Style, never assist.

**Zoom controller (D18 — framing-driven, not speed-driven).** Each frame, build the set of
**framing subjects**: the player, the locked gun target, any hostile with a firing solution on the
player, any crate under canopy within 200 m that the player or an enemy is actively running for, and
any objective body (balloon, zeppelin, transport). Compute the bounding box of that set in world
metres, pad it by 18 m, and:

```
z_want = clamp(bbox.h / CAM_H_BASE, 0.80, 1.30)          portrait: height drives it
                                                          landscape: swap to bbox.w / CAM_W_BASE
z_want *= zoomBias                                        tight 0.90 | normal 1.00 | wide 1.12
z_want  = clamp(z_want, 0.80, 1.30)
```

Asymmetric slew with hysteresis, exactly as D18 requires:

```
out: z moves at up to 1.10 /s      (fast — never lose a threat off the top of frame)
in : z moves at up to 0.22 /s      (slow — the painted art is the reward for being close)
hysteresis: only start zooming in once z_want has stayed below z - 0.06 for 0.8 s
```

Story beats, landings, and the results screen force `z = 0.80` over 1.2 s. There is no zoom input
and there must not be one; the tight/normal/wide preference is a persistent setting on the options
screen, never a per-moment control.

**Subject-set discipline:** a distant contact that is merely *present* never enters the bounding
box. Only things that are shooting, being shot at, or being raced for do. Without that rule the
camera sits pinned at 1.3 for the whole level and the game looks like a map.

### 2.9a What must stay readable at maximum zoom-out

At `z = 1.30` the enemy scout is 40 px long and 6 px thick, and its wing rigging, roundel, pilot and
damage detail are all gone. That is acceptable **only** if the following list survives, so the list
is a hard requirement on the HUD and on agent C's silhouette work.

**Must remain readable in the world at z = 1.30:**

| thing | how it survives 40 px |
|---|---|
| that an aircraft is there | silhouette value contrast against its altitude band — hostiles always darker/warmer than sky (§3.6 rule 4) |
| which way it is pointing | the nose/tail asymmetry must read at 40 px; agent C should test every airframe silhouette downsampled to 40 px wide |
| hostile vs friendly | shape channel: hostile chevron tab, friendly roundel dot, both drawn at a fixed **screen** size so they do not shrink |
| that something is dying | the smoke ribbon — a 60-emitter trail is legible at any zoom |
| a crate exists | the canopy is 5 m = 27 px at z=1.3, plus a fixed-size gold pip and the slow sway |
| the ground / cloud deck / ceiling | they are bands, not objects |

**Accepted as illegible at z = 1.30, therefore promoted to a HUD marker:**

| thing | its HUD substitute |
|---|---|
| exact enemy bearing and whether it is a threat | **threat bracket** (fixed screen size, §2.7) and the **edge chevron** |
| enemy aircraft *type* | a 10 px type glyph pinned above the sprite at fixed screen size, only for Drover / Ox / ace |
| enemy damage state | not shown; the player does not need it |
| crate contents | the fixed-size gold pip carries a 1-glyph type mark |
| exact altitudes of everything | the **altitude ribbon** — this is precisely why it exists |
| the lead pip's fine offset | the pip is drawn at fixed **screen** size and its fill state (§2.6) carries the signal |

**Rule:** any HUD element whose job is to survive zoom-out is drawn at a **fixed screen size** and
positioned from a world point. Anything drawn in world units is allowed to become illegible, and if
it is not allowed to become illegible then it belongs in the first category or on the HUD.

### 2.9 The portrait gate (numeric, per the brief, evaluated across the zoom range per D18)

Portrait gets a fair attempt and then a number decides. Proposed gate, all measured at the end of
the flight phase:

| # | criterion | threshold | measured by |
|---|---|---|---|
| P1 | player sprite length across the whole zoom range | 40-96 logical px | static |
| P2 | warning time from an enemy becoming visible to it having a firing solution, at the p90 closure rate | >= 1.4 s | sim.mjs, at the zoom the controller would have chosen |
| P3 | in a Pilot-difficulty 1v1 duel, fraction of time the opponent is on screen | **>= 62%** | 200 headless duels + 20 CDP traces |
| P3b | fraction of duel time spent at `z >= 1.25` (the camera pinned wide) | **<= 20%** | same runs |
| P3c | at the moment of maximum framing demand in each duel, is the enemy both **on screen** and **>= 40 px**? | **>= 90% of duels** | same runs |
| P4 | median thumb travel per minute | <= 2200 px | CDP touch harness |
| P5 | thumb occludes the aircraft | < 3% of the time | CDP touch harness |
| P6 | first-time player completes level 1 | within 3 attempts, n >= 5 | playtest |

**P3 with P3b and P3c together are the real gate**, and D18 is why there are three. Zoom can buy
on-screen time, so P3 alone can now be passed by a camera that sits permanently at 1.3 and turns the
game into a map — that is the exact shape of failure this repo has been burned by before (a gate
that passes because of a workaround inside it). P3b caps the workaround; P3c requires the fight to
fit *and* stay legible at the same instant.

If P3 passes only because P3b fails, portrait has failed and we pivot to landscape-primary. Say all
three numbers out loud before running the test, and read the per-duel detail lines, not the pass
count.

---

## 3. COMBAT

### 3.1 Damage model

Not one bar. **Structure** plus **components**, and where you are shot from decides what breaks.

Player, Kite B.1, no armour:

| component | HP | destroyed effect | hit from |
|---|---|---|---|
| **Structure** | 220 | 0 → wreck | anywhere (spill damage) |
| Engine | 60 | `T *= 0.45`; at 0 the prop windmills, `T = 0`, `CD0 += 0.012` | front, front-quarter |
| Upper wing | 70 | `CLmax *= 0.72`, `n_lim *= 0.60` | above, side |
| Lower wing | 70 | `CLmax *= 0.85`, `n_lim *= 0.80`, +wobble | below, side |
| Tail / elevator | 45 | `q_max *= 0.5`, `K_q *= 0.6`, trim wander | astern |
| Fuel tank | 40 | leak (burn x4); 25% chance of **fire** | below, astern-low |
| Pilot | 30 | greyout permanently on, +0.4 s control lag | above-astern, front |

Hit allocation is geometric, not a roll: three capsule colliders (fuselage 7.4 x 1.4, upper wing
8.5 x 0.9 offset `-0.9 n`, lower wing 8.0 x 0.9 offset `+0.7 n`) and sub-rects along the fuselage for
engine / fuel / pilot / tail. A bullet hits what it geometrically hits. **This is why the six
o'clock low position is the deadly one and why nobody should be told that in a tutorial.**

Damage numbers: a round does its damage to the component *and* 35% of it to Structure.

**Guns.**

| gun tier | count | dmg/round | rate | DPS | notes |
|---|---|---|---|---|---|
| T1 Vickers | 1 | 4 | 7/s | 28 | start |
| T2 Vickers | 2 | 6 | 9/s | 108 | |
| T3 Long Vickers | 2 | 6 | 9/s | 108 | range 190 m |
| T4 Spandau | 2 | 7 | 10/s | 140 | |
| T5 Spandau + incendiary | 2 | 7 | 10/s | 140 | **x2.6 vs balloons, zeppelin cells, fuel tanks, fuel dumps** |

Time-to-kill sanity: T2 guns on a 60 HP Kestrel = **0.56 s on target**. An enemy Kestrel's single
gun on the player = 28 dps against 220 structure = **7.9 s of continuous fire**, and no AI holds a
firing solution for anything like that. **The player is roughly 14x more lethal than any single
enemy**, which is what "easy to play" means numerically. Difficulty comes from *numbers of enemies
and their positioning*, never from turning the player into paper.

**Ammo.** T1 = 500 rounds. At 18 rounds/s a full hold is 27.8 s, but auto-fire only fires with a
target in the cone, so a typical Act-1 level spends 170-260. Running dry: the guns click, the ring
goes red, and you need an Ammunition crate or the level ends. Ammo is a *reason to want crates*,
which is the point.

### 3.2 Damage states, as the player reads them

| state | visual | audio | mechanical |
|---|---|---|---|
| Engine < 50% | thin white oil wisp | roughness, a miss every ~2 s | - |
| Engine < 25% | black smoke trail | heavy misfire | `T *= 0.75` |
| Engine 0 | dead prop, slow windmill, oil streak on the screen edge | wind only — **the game goes quiet**, which is terrifying | `T = 0`, glide |
| Fuel leak | a pale streamer from the belly | a hiss | burn x4 |
| **Fire** | orange flame + heavy black smoke | roar | **-8 structure/s** |
| Upper/lower wing < 40% | fabric ripples, ribs showing | flutter | as table |
| Wing 0 | a strut snaps, the panel tears away | a crack | as table, plus permanent asymmetry |
| Tail damaged | the aircraft wallows | - | as table |
| Structure < 30% | a visible bend, a permanent 3° trim error | groan on every pull | - |

**Fire is put out by diving above 70 m/s for 3.0 s** — slipstream blow-out, which is historically
real and is a *perfect* mechanic for this game: the punishment for catching fire is that you must
spend all of your altitude, immediately, in the middle of a fight. It converts a health problem into
an energy problem. If you do not blow it out within 12 s the aircraft is gone.

### 3.3 The death spiral

One implementation, used by the player and every AI aircraft.

On `structure <= 0` → `WRECK` state:

- Engine dead, control surfaces frozen at a random deflection, all guns silent.
- Induced spin `omega_spin = 220-420 deg/s`, seeded, sign random.
- Descent: the aerodynamic model keeps running with `CL` pinned to the post-stall table and
  `CD0 * 3.2`, so it falls at 28-40 m/s in a flat, tumbling spiral rather than dropping like a
  stone.
- A black smoke ribbon, 60 emitters, spooling out behind — this is the *readable* signal that
  something died, from anywhere on screen.
- Fall time 2.2 s (low) to 9 s (from 800 m). Impact = ground fireball + a 12 m debris scatter.
- **If a wing came off**, the fall is faster and flatter — a tumbling leaf, 0.9x the fall time.
- **Bail-out:** in this WWI-that-never-was parachutes exist (they must — see §4). **40%** of downed
  enemies bail; the canopy drifts with the wind exactly like a crate canopy, same code.
  - Shooting a parachuting pilot: **0 Scrip, and applies "Blooded"** — every surviving enemy in the
    level gains +15% aggression and -0.25 morale-flee threshold (they fight harder and run less),
    and the ace roster remembers it. Not forbidden, not free. Agent D owns the narrative weight.

**Player death** → mission fail. But: with the `Rugged` trait, if `structure <= 0` while
`alt > 120 m`, you get **4.0 s at 1 HP** — the screen desaturates, the engine screams, all inputs
still work — to reach a friendly field or the map edge. Making it counts the mission as *survived at
50% reward*. It is the best 4 seconds in the game and it should be sold hard in the trait screen.

### 3.4 Collisions

| pair | result |
|---|---|
| aircraft x aircraft | 60 damage each, velocities exchange 25 m/s along the contact normal, both spin briefly |
| aircraft x ground, `vy > 12 m/s` | destroyed |
| aircraft x ground, `vy <= 12 m/s` and `|gamma| < 12°` and `v < 26 m/s` | **landing** (see §7.4) |
| aircraft x ground, otherwise | 45 damage, a bounce, and a very bad time |
| aircraft x balloon envelope | 90 damage, you bounce off |
| aircraft x zeppelin envelope | 140 damage |
| aircraft x crate / canopy | pickup or canopy-cut, never damage |
| aircraft x terrain (Act 3) | as ground |

Deliberate ramming is a losing trade (60 vs their 60 when you have 220 and they have 60 — actually
*winning* against a scout) so ramming a Kestrel is a legitimate desperation move and that is fine and
characterful. Ramming a Drover (190 HP) is not.

### 3.5 Ground fire

**Small arms / MG nests** — 0 to ~120 m, tracers that visibly arc:

```
P(hit per burst) = 0.30 * exp(-alt/90) * exp(-|v_rel|/70)
damage 6, burst of 5 rounds every 1.4 s
```

At 40 m and 50 m/s: `0.30 * 0.64 * 0.49 = 9.4%` per burst. At 150 m: `0.30*0.19*0.49 = 2.8%`.
Above 250 m small arms do not reach at all. Ground fire is **texture and pressure, not a killer** —
its job is to make the bottom 100 m of the column expensive, because that is where the canopy-cut
play lives (§4.3).

**Flak** — 220 m to the ceiling:

```
salvo: 4 shells, every 3.2 s per battery
lead error: sigma = 18 m + 0.25*(range/100) m, plus a 0.55 s fuse-setting lag on your current velocity
burst: 32 damage inside 6 m, falling linearly to 0 at 14 m
```

**Flak's design job is not to kill you. It is to price a band of altitude.** A flak belt over the
lines makes 300-500 m expensive, which forces the player either low (small arms, ground clutter,
stall risk) or high (thin air, 65 s of climbing, worse turn). That is an altitude decision every 20
seconds, generated by one system. Because the lead error scales with range and the fuse lags your
*current* velocity, **changing your velocity defeats flak** — a lazy straight cruise gets walked
onto, and a player who jinks every 2 s is nearly immune. Skill, expressed without a button.

### 3.6 How a fight reads on a small screen

Six rules, in priority order. If one of them fights the art direction, this list wins and agent C
is told.

1. **Threat brackets.** 0.5 s of warning before anyone fires at you, always, at every difficulty
   except Ace. Nothing else matters as much.
2. **Edge chevrons** for every off-screen contact, with an above/below tick.
3. **The altitude ribbon** carries the strategic picture the viewport cannot.
4. **Silhouette discipline.** Hostiles are darker and warmer than the sky at every altitude band;
   friendlies are paler and cooler. An aircraft is never allowed to sit at the same value as its
   background — agent C should treat this as a hard constraint on the palette per altitude band.
5. **Motion beats colour.** A dying aircraft is identified by its smoke ribbon, not its tint. A
   crate is identified by its slow canopy sway, not its gold.
6. **One event at a time gets emphasis.** Camera shake, dilation and screen flashes are rate-limited
   to one significant emphasis per 1.2 s, highest-priority wins. A screen where everything is
   emphasised reads as noise.
7. **The fight must read identically at every zoom** (D18). Threat brackets, allegiance glyphs, the
   lead pip and crate pips are drawn at **fixed screen size**; the world sprites are allowed to
   shrink. §2.9a is the full list of what survives and what is promoted to the HUD. A player who
   sets the `tight` zoom preference must not be at a tactical disadvantage, and a player on `wide`
   must not be at an advantage — that is the readability half of the D18 no-stealth-difficulty rule,
   and it is as important as the sim half.

---

## 4. THE PARACHUTE CRATES

The signature mechanic. It is the economy, it is a live battlefield objective, and it is the reason
the vertical axis is contested rather than merely available.

### 4.1 Where crates come from

| source | detail |
|---|---|
| **Airdrop** | An `Ox` transport (friendly or enemy) flies a lane at 300-600 m and pushes crates out on a schedule (one every 4-9 s). This is the routine income and the level designer's dial. |
| **Kill drop** | `Drover` heavy two-seaters and every named ace drop exactly 1 crate on death. |
| **Balloon cache** | A burst observation balloon spills 2-4 crates from its basket. |
| **Zeppelin bomb bay** | A hit on the bay releases 6-10 at once. See §4.6 situation 2 — this is not the free lunch it looks like. |
| **Mistimed drop** | The enemy drops for their own line. Contested by definition; the crate starts on the wrong side and only the wind can save it. |

### 4.2 Canopy physics

A single point mass with a big drag area and a pendulum offset. Not a cloth sim.

```
m_c   = 90 kg
CdA   = 24 m^2                 (a 5 m canopy: Cd 1.2, A 19.6)
terminal: m_c*g = 0.5*rho*CdA*v^2  →  883 = 14.7*v^2  →  v_term = 7.75 m/s
```

> **A crate falls at 7.75 m/s.** From 500 m that is **64 seconds** in the air. That long, slow,
> visible fall is the contested window and it is the whole reason the mechanic works.

**Wind is the skill.** Each level defines a wind profile, piecewise-linear in altitude:

```
wind(alt) = lerp over a table of (alt, vx) nodes,  typically 3-12 m/s
```

A crate under canopy is drag-dominated, so its horizontal velocity relaxes to the local wind with a
time constant of about 1.3 s. It therefore *fully* obeys the wind, and a shear layer (different wind
above and below the cloud deck) makes a falling crate curve. Act 3 and 4 use this heavily.

**Gusts:** `wind *= 1 + 0.25*sin(2*pi*0.08*t + phase) + 0.08*noise(t)`. Enough to make the fall feel
alive and to punish a player who plans to the metre instead of to the region.

**Pendulum:** the crate swings under the canopy, `T = 2*pi*sqrt(L/g)` with `L = 6 m` → **4.9 s
period**, amplitude `±3 m` decaying at 0.15/s and re-excited by gusts. The hitbox actually moves, so
a fly-through interception has to be timed against the swing. This is a beautiful thing to look at
and it is also 3% harder to catch, which is exactly the right amount.

**Wind indicators, in world and on HUD:** trench smoke leaning, the canopies themselves, tattered
flags on the airfield, a HUD arrow with a magnitude, and a *second* arrow when a shear layer exists.
The `Wind Reader` trait draws the predicted impact point as a dashed line to the ground. On Cadet
difficulty that line is always on.

### 4.3 Taking a crate — three ways, and they are a real decision

**1. Fly through it.** Collect radius **9 m** (the crate is 1.5 m — generous on purpose; a phone).

> **1.0x value, guaranteed, and it costs you position.** You had to be at the crate's altitude on a
> matching trajectory, which is 4-10 s you were not fighting.

**2. Cut the canopy.** **6 rounds** into the canopy collapses it (or one Shotgun Shell special).
The crate then falls ballistically at ~35 m/s and lands where the remaining drift puts it.

> **1.6x value** if it lands on your side of the line — the ground crew recovers it whole and you
> never left the fight. But:
> - Cut above 250 m → a long ballistic fall → **35% chance the crate bursts** (0.5x value).
> - Cut below 120 m → **95% survives**, but you have only a few seconds of drift to work with, so
>   you must be at the right place at the right altitude at the right moment in the wind.

**The optimum is to cut low.** That is by design: it drags the player down into the small-arms
envelope, over the trenches, slow and precise, at the exact altitude where a stall is fatal. **The
crate mechanic is what pushes the player into the dangerous part of the sky, and the reward is
1.6x.** This is the best decision in the document; do not soften it.

**3. Deny it.** **12 rounds** into the box destroys it.

> **0 value, but the enemy gets nothing.** Correct whenever you cannot reach a crate that they can.
> A player who understands §4.5 will deny happily, and a player who does not will think it is a
> waste, and both are having the intended experience.

### 4.4 What is in a crate

Rolled on spawn (the level table can force a type). "Scrip" is the currency.

| type | weight | contents | Scrip-equivalent |
|---|---|---|---|
| Supply | 42% | 10-25 Scrip (mean 17) | 17 |
| Ammunition | 18% | +180 rounds, instantly | 8 |
| Fuel | 12% | +35% fuel, instantly | 6 |
| Parts | 12% | repair 45 structure + one destroyed component to 40% | 20 |
| Ordnance | 8% | loads a random special (§4.7) | 14 |
| Intel | 5% | reveals the level's ace position + a story fragment | 10 |
| Contraband | 3% | 60-90 Scrip, **and marks you** — a named ace spawns hunting you in 20 s | 75 |

```
E[Scrip-equivalent per crate]
 = .42*17 + .18*8 + .12*6 + .12*20 + .08*14 + .05*10 + .03*75
 = 7.14 + 1.44 + 0.72 + 2.40 + 1.12 + 0.50 + 2.25  =  15.57  →  15.6 * actMult
```

`actMult` = 1.0 / 1.6 / 2.4 / 3.4 / 4.6 by act. Used throughout §6.

### 4.5 The enemy contests them, and losing hurts *now*

Enemy scouts break off to run the same interception. Their wind maths uses the same solver with a
skill-scaled error (`sigma_wind = (1-k) * 4 m/s`). A `k=0.4` pilot misjudges drift by 2.4 m/s and
misses; a `k=0.9` ace does not.

**When the enemy banks a crate, it is a live reinforcement, not a number on their ledger:**

| enemy crate # (per level) | effect, immediately |
|---|---|
| 1 | a fresh Kestrel spawns at the map edge in 8 s |
| 2 | every surviving enemy gains **+12% damage** for the rest of the level |
| 3 | a `Drover` heavy two-seater joins |
| 4 | a fresh Wasp, and enemy morale floor rises by 0.15 (they stop fleeing) |
| 5+ | repeats from 1, escalating |

> **This is the mechanic that makes the crates a battlefield objective instead of a shop.** The
> player is not choosing between "money" and "fighting". They are choosing between fighting *now*
> and fighting *more people in thirty seconds*.

It also makes **denial** correct, gives the enemy AI something to do other than orbit the player,
and it means a level's difficulty is partly authored by the player's own greed — which is the
cheapest, most honest dynamic difficulty there is.

### 4.6 Three level situations that only work because of crates

These are specified as designs, not as flavour. Each is placed in the level table in §8.

**1. "The Shear" — Act 3, level 48.**
Wind: `+9 m/s at 500 m`, `+2 m/s at 300 m`, `-6 m/s at 150 m`. Eight crates from a transport at
520 m over no-man's-land. Ace A5 loiters at 620 m.
- Take them up high and drift is irrelevant — but you are in the flak belt and A5 has 100 m on you.
- Let them fall and the shear carries them *enemy-side* above the cloud, then back *your side*
  below it. So the only crates you can win by cutting are the ones you cut in the **lower layer, at
  ~130 m, over the enemy trenches, under the guns**.
- There is no dominant answer, and the level is a pure "how much altitude will you spend" question.
  It is only possible because a crate falls slowly through a wind that changes with height.

**2. "Ballast" — Act 2, level 35.**
A zeppelin at 700 m is bombing your field. It cannot be fought efficiently at 700 m: thin air, your
practical ceiling, six gun blisters. Hitting the bomb bay releases crates — and **every 90 kg it
sheds makes it rise 30 m**, up to 940 m, above your ceiling, where it escapes and the level is lost.
- So the greedy play (shoot the bay, collect the fall) *loses you the mission*.
- The correct play is to kill the four engines first, which drops it to 480 m where you can fight,
  and *then* open the bay.
- A player who does it wrong once will never forget that crates have mass. Only possible because
  crates are physical objects that fall out of things.

**3. "Both Sides of the Line" — Act 4, level 65.**
Night. Two transports drop simultaneously, one on each side, twelve crates total. A crate is
visible only within 60 m, or when lit. You have **4 flares**; a flare lights a 180 m radius for 14 s
and **drifts with the wind itself**.
- Four flares cannot cover twelve crates over 90 s. You must choose which drop to illuminate, and
  the enemy AI collects everything you did not light (and gets §4.5's reinforcements for it).
- **Information is the scarce resource**, which is only possible because a crate hangs in the air
  for a minute — long enough for *knowing where it is* to be worth more than being fast.

*(A fourth, "Crate Scramble", is the endless/Daily variant: crates spawn continuously, both sides
contest, score is crates banked, and the enemy reinforcement ladder never resets.)*

### 4.7 Carrying, and where crates go

By default a crate collected by fly-through is **banked instantly** (no carry weight). Two
exceptions, set per mode/level by a `carry: true` flag:

- **Airlift mode** and levels flagged `carry` — you carry up to **3 crates, +90 kg each**. Mass
  520 → 790 kg is a 52% increase: stall speed rises from 17.8 to 21.9 m/s, best climb falls from
  9.2 to 4.1 m/s, corner speed rises to 49 m/s. **A loaded aircraft is a different aeroplane**, and
  that is the whole tension of Airlift. You unload by flying through your field's drop ring (a 30 m
  gate at 0-60 m altitude) or by landing.
- This is also what makes ace **A9 "The Sparrowhawk"** — who only attacks crate-carriers — a real
  and specific threat rather than a re-skin.

### 4.8 Specials (the one-tap slot)

| special | effect | ammo | source |
|---|---|---|---|
| **Le Prieur rockets** | 8 rockets, 45 damage each, straight, 200 m, **x3.5 vs balloons** | 1 salvo | hangar / Ordnance crate |
| **Cooper bombs** | 4 x 90 damage ground, released along the flight path with real gravity | 4 | hangar (Act 1+) |
| **Flare** | lights 180 m radius for 14 s, drifts with the wind | 4 | hangar (Act 4+) |
| **Shotgun shell** | one wide blast, 25 pellets, 8 damage each, 30 m — **cuts a canopy in a single shot** | 3 | Ordnance crate |
| **Emergency boost** | +55% thrust for 5 s; engine takes 3 damage/s while lit | 2 | engine T4+ |
| **Smoke** | a decoy trail; breaks every enemy lock for 4 s | 2 | `Deadstick`-adjacent trait unlock |

One special is loaded at a time. An Ordnance crate swaps it mid-mission, which is a nice reason to
take a crate you did not think you needed.

---

## 5. ENEMIES

### 5.1 Roster

All ranges in world metres (§2.1 invariant). `k` is the skill parameter (§5.2).

| code | name | HP (struct) | guns | m / S / T0 | V_max | role | acts | crate on death |
|---|---|---|---|---|---|---|---|---|
| `k` | **Kestrel** scout | 60 | 1 x 4 dmg @ 7/s | 530 / 18 / 2050 | 52 | fodder; turn-fighter with poor energy sense | 1-5 | - |
| `w` | **Wasp** scout | 55 | 1 x 5 dmg @ 8/s | 495 / 17 / 2500 | 62 | boom-and-zoom; dives, shoots, extends, re-climbs | 2-5 | - |
| `s` | **Shrike** (triplane) | 80 | 2 x 5 dmg @ 8/s | 570 / 21 / 2700 | 55 | elite turner; `n_sus 3.6`; will follow you into a stall fight | 3-5 | - |
| `d` | **Drover** two-seater | 190 | fwd 1 x 5; **rear gunner, 200° arc**, 4 dmg @ 6/s | 980 / 32 / 3100 | 46 | the reason you never sit at six o'clock | 1-5 | **1** |
| `o` | **Ox** transport | 320 | 2 gunners, 180° each | 2100 / 58 / 4200 | 38 | drops crates on a schedule; killing it dumps the whole remaining load at once | 1-5 | remaining load |
| `m` | **Marlin** bomber | 420 | 3 gunners | 3400 / 74 / 6000 | 42 | objective target; cruises 400-650 m | 2-5 | 1 |
| `B` | Observation **balloon** | 240, **x2.6 from incendiary/rockets** | - | static, winch 0-350 m | - | explodes: 60 damage inside 40 m. Defended by 2 `F` + 3 `g` | 1-5 | **2-4** |
| `Z` | **Zeppelin** | 5 gas cells 220 ea + 4 engines 120 ea + bomb bay 180 + 6 blisters 60 = **1800** | 6 blisters, 5 dmg @ 6/s each | 700 m station | 22 | boss-class; see §4.6.2 | 2, 4, 5 | 6-10 from the bay |
| `N` | **Nightjar-class** night bomber | 380 | 2 gunners, **no tracers** | - | 40 | Act 4; invisible except muzzle flash and searchlight | 4-5 | 1 |
| `F` | **Flak battery** (ground) | 90 | see §3.5 | - | - | prices an altitude band | 1-5 | - |
| `g` | **MG nest** (ground) | 40 | see §3.5 | - | - | prices the bottom 120 m | 1-5 | - |
| `T` | **Armoured train / gunboat** | 500 + 4 turrets 60 | 4 flak turrets | - | 14 | moving ground objective | 2-5 | 2 |
| `L` | **Searchlight** | 55 | - | - | - | reveals you in a 30° beam to 700 m; enemy `k` +0.2 while lit | 4-5 | - |
| `X` | **Fuel dump / hangar / factory** | 250 | - | - | - | secondary objective, **x2.6 incendiary** | 1-5 | 1-2 |

### 5.2 AI: one brain, nine states, three dials

**Nine states:** `PATROL, CLIMB, ENGAGE, ATTACK_RUN, EXTEND, DEFEND, CRATE_RUN, BUG_OUT, WRECK`.

**The one number that drives everything** is relative specific energy, expressed in metres so a
designer can reason about it:

```
E(a)   = alt(a) + |v(a)|^2 / (2*g)          "the height this aircraft could zoom to"
E_rel  = E(self) - E(player)                metres
```

| condition | state | behaviour |
|---|---|---|
| `E_rel > +80` | `ATTACK_RUN` | dive on the player, aim for a 40-90 m firing pass, then **extend** — do not merge |
| `-40 < E_rel < +80`, profile = turner | `ENGAGE` | fly to corner speed, pull for lead, accept the energy bleed |
| `-40 < E_rel < +80`, profile = energy | `EXTEND` then `CLIMB` | run 250-400 m, zoom, come back down |
| `E_rel < -60` | `EXTEND` or `DEFEND` | defensive spiral toward the ground if cornered, run if not |
| a crate under canopy is reachable and `E_rel > -100` | `CRATE_RUN` | see §4.5; utility-weighted against the current threat |
| `morale < 0.20` | `BUG_OUT` | dive for their own line at max speed, will not fight, still shootable |
| `structure <= 0` | `WRECK` | §3.3 |

**Three dials per pilot:**

```
k       0..1   skill      aim error sigma = 6 - 5*k deg
                          reaction time   = 0.65 - 0.45*k s
                          lead solution   = truth + N(0, (1-k)*0.9) aircraft-lengths
                          wind estimate   = truth + N(0, (1-k)*4) m/s
                          alpha discipline: below k=0.45 the AI will stall itself out of a fight
                          check-six period = 4.5 - 3.2*k s
morale  0..1   nerve      start 0.50-0.90 by unit and act
aggro   0..2   profile    0 = pure energy fighter, 1 = mixed, 2 = pure turn-fighter
```

**Morale.**

```
-0.20  a wingman dies within 250 m
-0.35 * (damage taken this second / maxStructure)
-0.15  per 10 s alone (no friendly within 400 m)
-0.10  per player kill in the last 15 s (a streak is felt)
+0.20  aura, while a named ace is alive within 600 m
+0.10  per friendly numerical advantage step
+0.05/s  regenerating toward the unit's base while not engaged
```

Below 0.20 the pilot bugs out. **A fled enemy that reaches its own line survives, and returns in the
next level with `k + 0.05` and a grudge marker** — cheap to implement, and it gives agent D a free
recurring-character hook.

**Formations.** A leader plus 1-3 wingmen at station offsets (line astern at 35 m; finger-four at
`(-40, -18)`, `(+45, -10)`, `(+80, +14)` relative, in world metres). Wingmen hold station until the
leader enters `ENGAGE` or `ATTACK_RUN`, then split into element pairs — lead attacks, wing covers
his six. **Killing a leader forces a 2.5 s promotion delay during which the formation flies
straight and does not shoot.** That is a real, discoverable reward for target selection, and it is
the counter to ace A11.

### 5.3 The named aces — the Duel roster

Twelve aces. Each must be **beatable by a specific idea**, not by more DPS. Names are placeholders
and belong to agent D; the behaviours belong here.

| # | placeholder | act | k / morale / aggro | signature behaviour | the counter |
|---|---|---|---|---|---|
| A1 | The Hawk | 1 | 0.60 / 0.85 / 0.2 | Pure boom-and-zoom. Never turns below 45 m/s; always re-climbs to `E_rel +150` before the next pass. | **Force a low, slow fight.** He will not follow you under 45 m/s, so the ground is safe from him. |
| A2 | The Wheel | 2 | 0.65 / 0.90 / 2.0 | Flat sustained turner: locks to 26-30 m/s and never leaves the circle. Will out-turn anything. | **Out-energy him.** Zoom out of the circle, come back down with 120 m in hand. Turning with him is a 90 s stalemate. |
| A3 | Der Falke | 2 | 0.72 / 0.85 / 1.0 | **Energy mirror** — samples your `E` every 0.5 s and matches it, climbing when you climb, diving when you dive. Never gives you an advantage. | **Break the mirror with a stall turn.** He cannot mirror a manoeuvre that goes to zero airspeed; he overshoots and gives you 1.4 s. |
| A4 | Gale | 3 | 0.75 / 0.80 / 1.2 | Uses the cloud deck as cover: enters cloud, changes vector inside, re-emerges behind you. | **Camp the cloud top.** He must exit somewhere; the altitude ribbon shows his fading ghost for 2 s after entry. |
| A5 | Anvil | 3 | 0.70 / 0.95 / 0.0 | 340 HP, armoured, slow (`V_max 48`), **only ever accepts head-on merges** and wants the trade. | **Never merge.** He cannot turn (`n_lim 3.4`); take his six and stay there. Everything about him rewards patience. |
| A6 | The Kestrel Twins | 3 | 0.68 each / 0.75 / 1.5 | Two aircraft in perfect line astern at 35 m. The lead **baits** (flies predictably, invites a shot), the trailer kills. | **Kill the bait in under 3 s** or split them by flying between. Chasing the lead is the trap. |
| A7 | Nightjar | 4 | 0.78 / 0.85 / 1.0 | Night only. Runs completely dark: **no tracers, no exhaust glow**, visible only by muzzle flash and by an audio cue at 200 m. | **Flares, and your ears.** The audio cue is the only reliable channel; this is the one ace who is harder with sound off, and the fallback is a HUD directional tick. |
| A8 | Storm-crow | 4 | 0.80 / 0.90 / 1.3 | Fights inside a storm cell and exploits its updraft bands (+6 m/s) as free altitude. | **Learn the cell map.** The updrafts are authored, visible as rain-streak direction, and available to you too. |
| A9 | The Sparrowhawk | 4 | 0.76 / 0.80 / 1.1 | **Ignores you entirely until you are carrying crates** (§4.7) or have banked 3+ this level, then hunts only you, from above. | **Carry nothing, or bait him** — dump a carry, climb, and take him when he commits to the empty target. |
| A10 | Blackthorn | 5 | 0.90 / 0.95 / 1.0 | Sesquiplane, best available everything, **no gimmick at all**. Perfect energy play, perfect gunnery, perfect discipline. | Genuinely the skill check. He is the level where the player finds out whether they learned §1. |
| A11 | The Balloon Man | 5 | 0.82 / 0.90 / 1.2 | Flies a **finger-four** and actively commands it: calls wingmen onto your six, sets traps. | **Kill the leader** — the 2.5 s promotion delay (§5.2) collapses the formation and the wingmen are ordinary. |
| A12 | "Kitehawk" | 5 | 0.88 / 1.00 / mirrors yours | **Flies your airframe with your upgrades and your equipped traits**, snapshotted at level start. A ghost of your own hangar. | **Your build's own weakness.** A Lance player fights a Lance and discovers it cannot turn. There is no universal counter and that is the point. |

A12 is the final level (100) and is the strongest structural idea in the roster: the reward for a
hundred levels of optimisation is being shown what you optimised away. Flagged to agent D as a story
hook, and to agent A as a requirement that the loadout be serialisable (§11).

---

## 6. UPGRADES AND ECONOMY

### 6.1 Currencies

- **Scrip** — from crates. The only spendable currency. No second currency, no premium currency, no
  timers, no energy.
- **Reputation** — from 3-starring levels and killing aces. Not spendable; it **gates** pilot traits
  and trait slots. Reputation cannot be bought with Scrip and Scrip cannot be bought with anything.

### 6.2 The tree

**Engine** — `T0`, and mass:

| tier | T0 (N) | mass | T/W on B.1 | cost |
|---|---|---|---|---|
| 1 | 2300 | +0 | 0.451 | start |
| 2 | 2650 | +12 | 0.508 | 140 |
| 3 | 3050 | +25 | 0.571 | 380 |
| 4 | 3500 | +40 | 0.637 | 900 |
| 5 | 4000 | +58 | 0.706 | 2000 |

**Wings** — a rigging/refit level, applied on top of the airframe:

| tier | effect | cost |
|---|---|---|
| 1 | base | start |
| 2 "trimmed" | `CLmax +0.04, CD0 -0.006, n_lim +0.2` | 220 |
| 3 "braced" | `CLmax +0.08, CD0 -0.010, n_lim +0.5` | 640 |
| 4 "reworked" | `CLmax +0.12, CD0 -0.014, n_lim +0.8` | 1500 |

(The biplane → triplane → sesquiplane axis is the **airframe** purchase, §1.11 — those are
sidegrades and must never be presented as tiers in the UI.)

**Guns** — §3.1 table. Costs: T1 start, T2 **180**, T3 **420**, T4 **950**, T5 **1900**.

**Armour** — structure and mass: 220 / 270 (+18 kg, **120**) / 330 (+40 kg, **340**) / 400
(+70 kg, **820**). Note 400 HP with the Act-5 engine is still `T/W 0.62` — armour is a real trade,
not a free stat.

**Fuel** — 100 / 130 (+10 kg, **90**) / 165 (+22 kg, **250**) / 210 (+38 kg, **600**).

**Ammo** — 500 / 700 (+8 kg, **80**) / 900 (+18 kg, **220**) / 1200 (+32 kg, **520**).

**Airframes** — §1.11. B.2 **600**, Harrier Tri **1500**, Lance Mk.I **1500**, Mk.II refit **3200**,
Kitehawk prototype **7000**.

### 6.3 Pilot traits (Reputation-gated, not bought)

Slots: **1** at start, **2** at Rep 12, **3** at Rep 30, **4** at Rep 60. All nine are unlockable;
four are equippable. Re-equip is free, any time, in the hangar.

| trait | Rep | effect |
|---|---|---|
| **Scrounger** | 1 | +20% Scrip from crates |
| **Eagle Eye** | 2 | +25% gun range; the lead pip predicts 1.4x further ahead |
| **Wind Reader** | 2 | draws every crate's predicted impact point |
| **Rugged** | 3 | the 4.0 s "hold it together" at 1 HP above 120 m (§3.3) |
| **Cool Hand** | 3 | auto-fire only fires inside 2° of the true solution: **-40% ammo used, +15% hit rate** |
| **Rigger** | 4 | component damage self-repairs 8 HP/s after 5 s below 2 g |
| **Deadstick** | 4 | engine-out glide L/D +30%; 25% chance of an air restart every 8 s |
| **Iron Neck** | 5 | no greyout; effective `n_lim +0.4` |
| **Blooded** | 6 | +10% damage while below 40% structure |

Total Rep available: 100 levels x 1 (3-star) + 12 aces x 2 + 5 bosses x 3 = **139**. Enough to unlock
everything and open all four slots by roughly level 62 for a good player, level 80 for an average
one. The traits are the *identity* layer — they should read as who your pilot is, and agent D should
be told they exist as characterisation.

### 6.4 Crate income per level, per act

```
crates_captured = D(act) * capture_rate + K(act) * 0.85
scrip           = crates_captured * 15.6 * actMult + B(act)
```

`D` = guaranteed drops per level, `K` = expected crate-dropping kills per level, `B` = completion
bonus. Capture rate for a **competent** player falls as contest rises.

| act | actMult | D | capture | K | crates/lvl | Scrip/level | over 20 levels |
|---|---|---|---|---|---|---|---|
| 1 | 1.0 | 4 | 0.70 | 1.2 | 3.82 | 59.6 + 25 = **84.6** | **1692** |
| 2 | 1.6 | 5 | 0.66 | 1.6 | 4.66 | 116.3 + 45 = **161.3** | **3226** |
| 3 | 2.4 | 6 | 0.62 | 2.0 | 5.42 | 202.9 + 75 = **277.9** | **5558** |
| 4 | 3.4 | 7 | 0.58 | 2.3 | 6.02 | 319.0 + 115 = **434.0** | **8680** |
| 5 | 4.6 | 8 | 0.55 | 2.6 | 6.61 | 474.3 + 170 = **644.3** | **12886** |

**Lifetime income (competent): 32,042 Scrip.**

### 6.5 Does it pace? The purchase schedule, checked

| act | what the player should be buying | cost | income | slack |
|---|---|---|---|---|
| 1 | Guns T2 180, Engine T2 140, Armour T2 120, Ammo T2 80, Wings T2 220, **B.2 airframe 600** | **1340** | 1692 | **+352 (26%)** |
| 2 | Engine T3 380, Guns T3 420, Armour T3 340, Ammo T3 220, Fuel T2 250, Wings T3 640, **one Act-3 airframe 1500** | **3750** | 3226 | **-524 (-16%)** |
| 3 | Engine T4 900, Guns T4 950, Armour T4 820, Fuel T3 600, Ammo T4 520, Wings T4 1500, **the other Act-3 airframe 1500** | **6790** | 5558 + 3's Act-2 debt | **-1232** |
| 4 | Engine T5 2000, Guns T5 1900, **Mk.II refit 3200** | **7100** | 8680 | **+1580 (18%)** |
| 5 | **Kitehawk prototype 7000**, consumables/repairs ~1500 | **8500** | 12886 | **+4386 (34%)** |

Read the shape, not the rows:

- **Act 1 is generous (+26%).** A new player is learning; money is never the obstacle.
- **Acts 2 and 3 are a deliberate squeeze.** The player *cannot* buy both Act-3 airframes in Act 2
  and cannot fully kit out in Act 3 either — they run about one tier behind for roughly 25 levels.
  That is the **choice window**: Harrier or Lance, guns or armour, and the answer depends on which
  aces they find hard. This is the only part of the economy with real decisions in it and it is
  placed exactly where the player has learned enough to have opinions.
- **Act 4 relaxes (+18%)** because Act 4's difficulty is night and weather, not money, and stacking
  two scarcities is bad design.
- **Act 5 is a surplus (+34%)** which funds Long Patrol/Duel experimentation and cosmetics. The last
  act should feel like the player has *arrived*.

Total cost of literally everything ≈ **28,600** against 32,042 income → **1.12x**. You can own the
whole tree by the end of the story, just barely. That is the right feeling.

**Skill changes tempo, not access.** Same schedule at three capture rates:

| archetype | capture | Act-1 income | reaches the intended Act-2 kit at |
|---|---|---|---|
| sloppy | 0.50 | 1348 | level 24 (4 levels late) |
| competent | 0.68 | 1692 | level 20 |
| great | 0.85 | 1916 | level 17 (3 levels early) |

A 7-level spread across the whole spectrum of skill. Nobody is walled; good play buys you an
airframe three levels sooner and the pleasure of it.

### 6.6 Failure costs and no-grind guarantees

- Crashing costs a repair fee of **1 Scrip per 4 structure lost, capped at 60**. Never more than
  ~15% of one level's income, at any act.
- A failed mission still banks every crate you took before you died. **You never lose progress.**
- There is no energy, no lives, no timers, no daily cap on Story play.
- **Fake-ad doubler:** implement the hook (`Field Bonus — double this mission's Scrip`, max 3/day,
  an inline card on the results screen, never a modal). **Ship it OFF** behind
  `settings.fieldBonus = false`. It is one line to enable if Aaron wants it. There is never a real
  ad and never a purchase.

---

## 7. THE SIX MODES

Each mode must justify itself by exercising a part of the flight model the others do not. If it
doesn't, it should be a level type inside Story instead.

**Unlock schedule: Duel 18 · Daily 20 · Pylon Race 31 · Long Patrol 40 · Airlift 50.** Agent D's
story beats depend on the first, third and fifth of those; §8.12 carries the reasoning.

### 7.1 Story

- 100 levels, 5 acts of 20. Target **60-200 s** per level (see the table, §8).
- **Win:** objective complete. Returning to base is *not* required — but landing clean at your own
  field within 40 s of the objective gives **+15% Scrip** and is a lovely, optional flourish.
- **Lose:** shot down, or the objective fails (the bomber got through, the balloon survived, the
  transport was lost, the timer expired).
- **Three stars:** (1) objective complete, (2) no component destroyed, (3) crate capture >= the
  level's target. Each star = Reputation as per §6.3.
- **Checkpoint:** levels over 120 s and all bosses have one checkpoint, at 60% of the objective's
  progress. Restart from it, instantly, no modal — a 1.2 s "again" card.

### 7.2 The Long Patrol (endless)

- One continuous sortie. No level boundary, no shop, no pause between waves.
- Waves escalate every **60 s**: composition steps through the roster; by 10 minutes you are facing
  Act-5 mixes.
- **Fuel and ammo are the clock.** You cannot rearm or refuel except from crates, and crates come
  from the waves you defeat. Running dry means gliding, and gliding means dying.
- **Score** = `sum over time of (1 + altBand)` where `altBand` = 0 below 200 m, 1 to 500, 2 to 800,
  3 above — plus 40 per kill, x2 for aces. **Flying high scores more**, which forces the player to
  live in the thin, slow-turning air where they are worst.
- **Why it exists:** it is the only mode where the *efficiency* of the flight model matters — best
  L/D, fuel burn at cruise, the decision to glide. Story never runs a tank dry; this always does.
- Session 3-15 minutes. Local leaderboard, top 10, with the loadout recorded.

### 7.3 Pylon Race

- **No combat at all.** A course of gates through terrain, cloud and the ground clutter.
- Gates must be taken in order; some carry a modifier — `inverted` (must be upside down through it),
  `band` (must be within an altitude window), `slow` (must be under 30 m/s), `hard` (12 m wide).
- **Ghost:** your own best run replayed as a translucent aircraft from a recorded state stream.
- 12 courses, 4 per medal band, with Bronze / Silver / Gold / **Author** times.
- **Mode unlocks at level 31** (§8.12); seven in-story `RCE` levels precede it.
- **Why it exists:** it teaches the flight model with zero threat, and it is the only place a player
  gets to be *fast* without needing to be *safe*. It is also where energy management is legible as a
  number — the same course is 8 s faster if you take the descent instead of the throttle.
- Session 45-90 s per run. The natural home for shared ghosts later.

### 7.4 Airlift

- Crates only. A transport lane, a wind profile, a quota: **deliver N crates to your field in T
  seconds.** `carry: true` (§4.7) — so you fly loaded, at 790 kg, with a 4.1 m/s climb rate.
- Opposition escalates by scenario: scenarios 1-6 ground guns only; 7-14 add interceptors; 15-20 add
  an enemy transport competing for the same crates, and an ace.
- **Landing** counts as a delivery and is worth **1.3x**, but a landing needs `v < 26 m/s`,
  `|gamma| < 12°`, `vy < 12 m/s` on a 90 m strip — which, at 790 kg with a 21.9 m/s stall speed, is
  a genuinely tight approach. This is the game's whole landing system and Airlift is where it lives.
- **Score** = crates x wind-difficulty multiplier (1.0 to 2.4) x time bonus.
- **Mode unlocks at level 50** (§8.12), out of the guns-locked airlift that teaches it (§8.11).
- **Why it exists:** it isolates the signature mechanic so the canopy-cut-and-drift skill can be
  learned and mastered without a dogfight on top. It is simultaneously the mechanic's tutorial and
  its highest skill ceiling. 20 scenarios, 60-120 s each.

### 7.5 Duel

- 1v1 versus a named ace. No ground fire, no crates, no third parties. A neutral arena, 2 km wide,
  with a cloud deck at 420-560 m (the **Deck** band, §0b).
- Both start at **400 m, 40 m/s, 800 m apart, closing**. Best of 3. Between rounds nothing heals —
  damage carries, which makes round 1 matter.
- **The mode unlocks at level 18** with a squadron-mate sparring partner (agent D's dependency,
  §8.12); each ace joins the roster when beaten in Story. The 14th entry is **A12 "Kitehawk"**,
  your mirror, added after level 99.
- **Why it exists:** it is the pure, unconfounded test of the flight model, and it doubles as the
  balance harness's fixture (§10.2). If Duel is not fun, the game is not fun and nothing else will
  save it — which is exactly why it should be built first, in the flight phase, before any level
  content exists.
- Session 40-120 s.

### 7.6 Daily seeded challenge

- One level generated from `seed = YYYYMMDD`. Same for everyone.
- **Fixed loadout** — everyone flies the same airframe, engine, guns, armour and trait set (rotating
  weekly). The hangar is removed from the equation, so it is the only mode where two players' scores
  mean the same thing.
- Random objective from the pool, random wind profile, random enemy mix, all seeded.
- **Three attempts, best score counts.** Not one. Aaron's games do not punish.
- Score posted to a local table plus a **shareable text/emoji score card** (no server, no account).
- Streak counter for consecutive days played, which is the only retention mechanic in the game and
  it costs nothing and gates nothing.

---

## 8. THE 100 LEVELS

### 8.1 How sameness is prevented — stated explicitly, because a 100-level game dies of it

Six mechanisms, all structural, all checkable by a script (§10.6):

1. **Three orthogonal axes.** Ten objective archetypes x four modifiers x roughly six sky states
   (day/dusk/night/overcast/storm/high-sun, each with its own wind profile) = 240 distinct
   combinations for 100 slots. **No archetype repeats within 4 levels**, and no
   (archetype, modifier) pair ever repeats at all.
2. **A five-level rhythm inside every act:** `teach → apply → complicate → breather → test`. Levels
   ending in 4, 9, 14 are **breathers** — short, low threat, high reward, usually a race or a ferry.
   Level 20 of each act is a **boss** — except Act 5, where the boss is **99** and **100 is a
   landing** (agent D's ending: guns unbolted, one mail sack). The player is never more than two
   levels from a change of pace.
3. **One new noun every three levels.** Every third level introduces exactly one new enemy, hazard,
   special, wind feature or terrain type. Nothing is ever introduced twice, and nothing arrives
   without a level built to teach it.
4. **Escalate composition, never numbers.** Average enemy count goes 4 (Act 1) → 5.5 → 7 → 8.5 → 11.
   That is modest. What changes is *what they are and where they are*. **Enemy HP is never raised to
   make a level harder** — if a fight is too easy, change what the enemy does.
5. **Two "left turn" levels per act** — a level that breaks the format entirely. They are listed in
   the table as `SPC` / `AIR` / `SUR` and named. Examples: flying a captured enemy aircraft home
   through your own flak (29); flying the Act-3 airframe you *didn't* buy (49); an airlift with the
   guns unbolted (50); an engine-out glide the length of the map (89); the mail run that ends the
   game (100).
6. **Two levels that change the verb, not the enemy.** L56 is a duel you *survive* rather than win;
   L70 is a duel you *win by taking a crate* rather than by shooting. Both reuse the duel's enemies
   and the duel's arena and ask a completely different question. It is the cheapest variety in the
   game and the most surprising, and §8.9 declares it as the one place the 4-level archetype rule is
   deliberately bent.

### 8.2 Act summaries

| act | levels | theatre | ceiling | new mechanic | airframe | enemy mix | curve |
|---|---|---|---|---|---|---|---|
| **1 — The Mud** | 1-20 | the trench line, spring, low (**Mud/Belt/Floor** only) | 600 m | flight, guns, **crates**, balloons, small arms | Kite B.1 | k, d, o, B, F, g | 1-4 cannot realistically be failed (`k = 0.15`); k rises to 0.45 by L20 |
| **2 — The Deck** | 21-40 | summer, a permanent cloud deck (**Deck** band, 420-560 m) | 800 m | **cloud cover** (invisible inside; ribbon shows a 2 s fading ghost; no gun lock), the **zeppelin**, flak in earnest | Kite B.2 | + w, m, Z, heavier F | `k` 0.40-0.60 |
| **3 — The High Country** | 41-60 | mountains, autumn; valleys and ridges constrain the horizontal | 1100 m (**Blue** opens) | **terrain** — ridges to climb, valleys with no room to loop, ridge-face updrafts/downdrafts (±6 m/s) | **choice:** Harrier Tri or Lance Mk.I | + s, T, mountain F | `k` 0.55-0.72 |
| **4 — The Long Night** | 61-80 | winter, night, storms | 900 m (icing above 700) | **darkness + flares + weather** — rain cuts gun range 30% and adds `CD0 +0.008`; storm cells with ±10 m/s vertical gusts and lightning; **icing** in cloud above 700 m (`m +2 kg/s`, `CLmax -0.004/s`, shed by descending below 500 m) | Mk.II refit | + N, L, night aces | `k` 0.65-0.82 |
| **5 — The Last Summer** | 81-100 | the enemy's own airspace, the highest skies (**Blue** is the arena) | 1100 m | **the sun** — an attack from the sun disc (a 25° cone) is invisible until 90 m, and *you* can use it; massed formations | Kitehawk prototype | everything, plus the ace flight | `k` 0.75-0.92 |

### 8.3 Codebook for the level table

**Objectives:** `PAT` sweep/patrol · `ESC` escort · `INT` intercept · `BAL` balloon-bust ·
`ZEP` zeppelin · `STM` storm crossing · `NGT` night/flare op · `RES` rescue/cover a crash site ·
`DUE` ace duel · `CRT` crate scramble · `BMB` ground strike · `RCE` race/ferry (breather) ·
`DEF` defend the field · `PHO` photo-recon (hold a line at altitude) · `SPC` left-turn level ·
`AIR` in-story airlift (`carry:true`, deliver a quota) · `SUR` survive-don't-win.

**Enemies:** as §5.1 codes; a number prefix is a count. `A#` = ace.
**Sky:** `d` day · `k` dusk · `n` night · `o` overcast/cloud deck · `s` storm · `h` high sun.
**Wind:** `w3` = 3 m/s uniform; `w4/9` = 4 m/s low, 9 m/s high; `w9/-6` = a shear (reversal).
**Cr:** guaranteed crates in the level. `*` = the level's 3-star crate target is >= 70% of them.

### 8.4 ACT 1 — THE MUD (1-20)

| # | Obj | Enemies | New / twist | Sky, wind | Cr | t(s) |
|---|---|---|---|---|---|---|
| 1 | PAT | 2k @k0.15 | **teach:** pitch, and that a dive buys speed | d w2 | 0 | 50 |
| 2 | PAT | 3k @k0.15 | **teach:** auto-fire, the lead pip | d w2 | 1 | 60 |
| 3 | CRT | 2k, 1o | **teach:** fly through a crate | d w3 | 3* | 70 |
| 4 | RCE | — | *breather:* 8 gates; the course makes you stall once, safely, on purpose | d w2 | 0 | 45 |
| 5 | BAL | 1B, 2g | **teach:** balloons, ground fire, the bottom of the column | d w3 | 2 | 75 |
| 6 | PAT | 4k | apply: your first real outnumbered fight | d w4 | 1 | 70 |
| 7 | CRT | 3k, 1o | **teach:** cut the canopy, read the drift | d w6 | 4* | 80 |
| 8 | ESC | 4k vs your o | apply: you are now protecting the thing that pays you | d w4 | 3 | 80 |
| 9 | RCE | — | *breather:* 6 gates over the trenches, low and fast | d w3 | 0 | 45 |
| 10 | INT | 2d, 2k | **teach:** the rear gunner. Six o'clock is now dangerous | d w4 | 2 | 85 |
| 11 | BMB | 5g, 1F | **teach:** the special (Cooper bombs); attacking low without stalling | d w3 | 1 | 80 |
| 12 | CRT | 4k, 2o | **teach:** the enemy takes crates, and gets reinforced for it (§4.5) | d w5 | 6* | 90 |
| 13 | BAL | 2B, 2F, 3k | complicate: balloons defended properly | d w5 | 4 | 90 |
| 14 | SPC | — | ***"The Ferry"*** — dawn, no enemies, carry one crate 3 km. Pure beauty, and the wind is the only opponent | k w7 | 1 | 60 |
| 15 | PAT | 5k, 1d | test: everything Act 1 has taught, at once | d w4 | 2 | 85 |
| 16 | DEF | 4k, 2d | your own field under attack; the ground crew is watching | d w4 | 2 | 90 |
| 17 | CRT | 5k, 2o | **new:** the first wind shear | d w3/8 | 8* | 95 |
| 18 | INT | 3d, 2k | heavy formation; kill the leader (§5.2) | d w5 | 3 | 90 |
| 19 | RES | 4k, 3g | cover a crash site for 60 s, low, under rifles | k w4 | 2 | 80 |
| 20 | **DUE+BAL** | **A1**, 3B, 2F | **BOSS.** He boom-and-zooms; you must burst three balloons *under* his attack passes | d w5 | 5 | 130 |

### 8.5 ACT 2 — THE DECK (21-40)

| # | Obj | Enemies | New / twist | Sky, wind | Cr | t(s) |
|---|---|---|---|---|---|---|
| 21 | PAT | 3k, 2w | **teach:** cloud — they vanish, and so do you | o w5 | 1 | 75 |
| 22 | INT | 4w | **teach:** boom-and-zoom enemies; you cannot turn-fight them | o w5 | 2 | 80 |
| 23 | CRT | 3w, 2o | **teach:** the shear at the deck; crates curve | o w4/9 | 6* | 90 |
| 24 | RCE | — | *breather:* 10 gates through the cloud deck | o w6 | 0 | 50 |
| 25 | ZEP | 1Z (damaged, 500 m), 2k | **teach:** the zeppelin — cells, engines, blisters, bay | o w5 | 3 | 110 |
| 26 | ESC | 5w vs your 1m | your bomber, their fast scouts | o w6 | 2 | 95 |
| 27 | BAL | 3B, 3F | **new:** balloons above the deck; flak in earnest | o w6 | 5 | 90 |
| 28 | PAT | 6k/w | fight in and out of cloud | o w5 | 2 | 85 |
| 29 | SPC | 4F, 6g (**yours**) | ***"Captured"*** — you fly a Kestrel: 1 gun, no upgrades, no armour. Get home through your own flak, which does not know you | k w4 | 0 | 70 |
| 30 | DUE | **A2**, 2k | mini-boss: the flat turner. Turning with him is a stalemate | o w5 | 2 | 100 |
| 31 | CRT | 4w, 2o | **new:** the enemy cuts canopies too | o w7 | 7* | 95 |
| 32 | BMB | 1T, 4F | **new:** the armoured train, moving | d w4 | 3 | 100 |
| 33 | CRT+ESC | 3w, 1o (**yours**), 1d (**yours**) | **STORY BEAT (D).** Your flight escorts a drop. The friendly two-seater's observer **unhooks her harness to take a crate by hand** — see §8.11 for the mechanical spec. She is killed by the crate mechanic, not by an enemy | o w7 | 5 | 100 |
| 34 | RCE | — | *breather:* ferry a crate through the deck, no combat, the light through cloud | o w8 | 1 | 50 |
| 35 | **ZEP** | 1Z, 3w | ***"Ballast"*** (§4.6.2) — every crate shed makes it climb 30 m toward escape. Kill the engines first | o w5 | 8 | 130 |
| 36 | PAT | 5w, 2d | first Drover pair with fast escorts | o w6 | 3 | 90 |
| 37 | DUE | **A3**, 2w | the energy mirror; break it with a stall turn | o w5 | 2 | 110 |
| 38 | CRT | 5w, 2o (theirs+yours) | ***"Both Sides"*** day version — two drops, opposite sides | o w6/-4 | 10* | 110 |
| 39 | DEF | 1Z, 4w | they come for your field with an airship | o w5 | 4 | 120 |
| 40 | **ZEP+DUE** | **1Z (700 m), A3, 4w** | **BOSS.** Thin air, an escort, and an ace who matches your energy | o w7 | 8 | 160 |

### 8.6 ACT 3 — THE HIGH COUNTRY (41-60)

| # | Obj | Enemies | New / twist | Sky, wind | Cr | t(s) |
|---|---|---|---|---|---|---|
| 41 | PAT | 4k | **teach:** terrain. A valley has no room to loop | d w4 | 1 | 85 |
| 42 | CRT | 3w, 1o | **teach:** crates land on ledges; terrain changes drift | d w6 | 5* | 95 |
| 43 | BAL | 2B, 3F | **new:** ridge updrafts (+6 m/s) — free altitude if you find them | d w5 | 4 | 95 |
| 44 | RCE | — | *breather:* ***the Ridge Run***, 14 gates, updrafts are the whole route | d w6 | 0 | 60 |
| 45 | INT | 3s | **teach:** the Shrike. Do not turn-fight a triplane | d w5 | 2 | 100 |
| 46 | BMB | 6F, 8g | **new:** a mountain fort; layered flak you must climb through | d w4 | 3 | 110 |
| 47 | DUE | **A4**, 2s | the cloud/ridge ambusher; camp the top of Deck | o w6 | 2 | 110 |
| 48 | **CRT** | 4s, 2o, **A5** | ***"The Shear"*** (§4.6.1) — layered reversing wind, eight crates, an ace loitering in Lane | o w9/2/-6 | 8* | 120 |
| 49 | SPC | 3s, 2w | ***"The Wrong Aeroplane"*** — you fly the Act-3 airframe you **did not** buy, on loan. The sidegrade you rejected, in your hands, for one level | d w5 | 2 | 95 |
| 50 | **AIR** | 4F, 6g, 2w | **STORY BEAT (D). Airlift with the guns locked.** `carry:true`, no guns at all, deliver 6 crates. Also the **Airlift mode unlock** | d w7 | 8* | 110 |
| 51 | ESC | 5w vs your 1o | through a pass, with the enemy above you | d w7 | 4 | 100 |
| 52 | PHO | 6F, 3w | **new:** hold a straight line in Blue at 880 m for 25 s while flak walks in. Jinking fails the objective | d w6 | 2 | 90 |
| 53 | DUE | **A5**, 2s | the armoured head-on merger; never merge | d w5 | 2 | 110 |
| 54 | RCE | — | *breather:* valley race, 12 gates, tight | d w4 | 0 | 55 |
| 55 | INT | 1T, 4F, 4w | the armoured train, defended properly | k w5 | 4 | 110 |
| 56 | **SUR** | **A10**, 3s | **STORY BEAT (D). A duel you survive, not win.** Blackthorn arrives 30 acts early and you cannot kill him — the objective is to be alive in 70 s. He is `k 0.90` and *unkillable in the window by design*, not by invulnerability: his HP is real, and a perfect player who somehow does it gets a hidden medal | d w5 | 2 | 100 |
| 57 | RES | 5w, 4g | cover a mountain crash site; terrain hides the ground fire | k w6 | 3 | 100 |
| 58 | ZEP | 1Z, 3s | **forced climb (R9).** A zeppelin in Lane — ridge updrafts out of the valley shadow, up through Deck, into low autumn sun | d w6 | 6 | 140 |
| 59 | BAL | 5B, 4F | **new:** timed — all five balloons in 90 s | d w5 | 8 | 90 |
| 60 | **DUE** | **A6 (both)**, 3s | **BOSS.** The Twins, in a box canyon with no room to extend | d w6 | 3 | 150 |

### 8.7 ACT 4 — THE LONG NIGHT (61-80)

| # | Obj | Enemies | New / twist | Sky, wind | Cr | t(s) |
|---|---|---|---|---|---|---|
| 61 | NGT | 3k, 2L | **teach:** darkness, flares, and what a searchlight does to you | n w4 | 2 | 85 |
| 62 | INT | 2N, 4L | **teach:** night bombers; no tracers to follow | n w5 | 2 | 95 |
| 63 | STM | 4w | **teach:** the storm cell — ±10 m/s vertical gusts, lightning, no horizon | s w9 | 2 | 90 |
| 64 | RCE | — | *breather:* ***night ferry***, flare-lit gates, silent | n w5 | 1 | 55 |
| 65 | **CRT** | 4w, 2o, 3L | ***"Both Sides of the Line"*** (§4.6.3) — night, 12 crates, **4 flares**; information is the scarce thing | n w6 | 12* | 120 |
| 66 | BAL | 4B, 4F, 3L | **new:** balloons are invisible until lit by your own flare | n w6 | 6 | 100 |
| 67 | **DUE** | **A7 + 1 elite**, 4L | **STORY BEAT (D). A 2v1 — you, alone, against two.** Duel rules, two opponents, no wingman. The only counter is the formation-split (§5.2): break their element or be sandwiched. The hardest non-boss level in the game and it is *meant* to be lost once | n w5 | 2 | 115 |
| 68 | DEF | 3N, 4w | your field at night; the flares are theirs | n w5 | 3 | 105 |
| 69 | SPC | 4w | ***"Icing"*** — **forced climb (R9).** Punch through Deck above 700 m twice; ice loads the wing (`m +2 kg/s`) until you dive below 500 m to shed it. Out of a storm into a clear, freezing, moonlit Blue | s w8 | 2 | 100 |
| 70 | **CRT** | **A9**, 3w, 1o | **STORY BEAT (D). A duel you win by getting a crate, not by shooting.** One marked crate; banking it ends the level. Sparrowhawk contests it and cannot be killed inside the window with the guns you have. Shooting is the losing plan | n w7 | 4 | 105 |
| 71 | STM | 3w, 5g | cross a storm to reach a downed crew; the gusts are the enemy | s w11 | 3 | 110 |
| 72 | BMB | 1X, 6L, 5F | a night fuel dump under searchlights (incendiary x2.6) | n w5 | 4 | 110 |
| 73 | CRT | 5w, 2o | **new:** crates in a storm drift 3x and unpredictably | s w12 | 8* | 115 |
| 74 | RCE | — | *breather:* ***dawn after the storm***. No combat. This one is for looking at | k w4 | 1 | 50 |
| 75 | DUE | **A8**, 2w | the storm ace, inside the cell, using its updraft bands | s w10 | 2 | 120 |
| 76 | INT | 4N, 4w, 6L | a blacked-out bomber stream | n w6 | 4 | 110 |
| 77 | ZEP | 1Z, 6L, 4w | a zeppelin at night — only the searchlights show you where it is | n w6 | 7 | 150 |
| 78 | CRT | **A9 (rematch)**, 4w, 2o | he hunts crate-carriers. `carry:true`. This time you *can* kill him | n w7 | 9* | 115 |
| 79 | RES | 6w, 5g | a crew on the ice; 90 s of cover in a blizzard, zero visibility | s w11 | 3 | 110 |
| 80 | **DUE+STM** | **A8**, 3N, 4w | **BOSS.** Rematch inside the cell, with lightning and a bomber stream to stop | s w12 | 5 | 170 |

### 8.8 ACT 5 — THE LAST SUMMER (81-100)

| # | Obj | Enemies | New / twist | Sky, wind | Cr | t(s) |
|---|---|---|---|---|---|---|
| 81 | PAT | 6 mixed | **teach:** the sun. An attack out of it is invisible until 90 m — for both of you | h w5 | 2 | 95 |
| 82 | INT | 4w (finger-four) | **teach:** formation AI; kill the leader (§5.2) | h w5 | 3 | 100 |
| 83 | CRT | 5w, 2o | **new:** crates in Blue at 900 m, thin air, where you turn worst | h w8 | 7* | 110 |
| 84 | RCE | — | *breather + **forced climb (R9)**:* ***the Sun Run***, 16 gates, the highest course in the game, finishing in Blue with the sun disc in frame | h w6 | 0 | 60 |
| 85 | BMB | 8F, 6 aircraft **on the ground**, 2X | **new:** strafe an airfield; every aircraft you leave alive takes off | d w4 | 5 | 120 |
| 86 | ESC | 6w, 3s vs your 3m | escort a bomber stream 4 km. Losing one is a partial fail | h w6 | 4 | 130 |
| 87 | DUE | **A10**, 2s | the pure skill check; no gimmick. The rematch for level 56 | h w6 | 2 | 130 |
| 88 | ZEP | 2Z, 4w, 2s | a zeppelin fleet, mutually supporting | o w7 | 10 | 170 |
| 89 | SPC | 8F, 4g | ***"The Long Glide"*** — engine shot out at t=0. Glide 5 km home with no thrust, through the Belt. Pure §1.5 | k w6/-3 | 2 | 120 |
| 90 | **AIR** | 5w, 2s, 3o | **STORY BEAT (D). A 12-crate airlift.** `carry:true`, contested, at the top of the war | d w9/-5 | 12* | 140 |
| 91 | DUE | **A11 + 3w** | the ace flight; break the formation or lose | h w5 | 3 | 140 |
| 92 | STM+NGT | 5N, 6w | night storm over the sea; no ground reference at all | s+n w12 | 3 | 120 |
| 93 | BAL | 7B, 8F | the enemy's whole balloon line; one pass each, no second chances | d w6 | 12 | 110 |
| 94 | RCE | — | *breather:* the last quiet flight. **Agent D's beat goes here** | k w4 | 1 | 50 |
| 95 | INT | **every ace still alive** (2-4) + their squadrons | they all come at once. *Which* ones depends on who fled and lived (§5.2) | h w6 | 4 | 160 |
| 96 | DEF | 14 in waves | they come for your field. Everything you own is on the line | d w7 | 6 | 150 |
| 97 | BMB | 12F, 2T, 3X | the factory. The most defended ground in the game | k w5 | 6 | 130 |
| 98 | ZEP | **1Z flagship (2400 HP, 8 blisters)**, 6w, 2s | the flagship. Two checkpoints | o w8 | 12 | 190 |
| 99 | **DUE** | **A12** | **BOSS. Your mirror.** Your airframe, your upgrades, your traits, three rounds, `k` 0.84 → 0.90 → 0.96. The last fight of the war | h w7 | 3 | 200 |
| 100 | **SPC** | — | **STORY BEAT (D). ***"The Mail"*** — a landing, not a boss.** Guns removed from the airframe entirely (not jammed — *unbolted*). One mail sack, `carry:true`, 1 crate. Fly the length of the map you have fought over for a hundred levels, in daylight, with nothing shooting, and **land clean** (§7.4 landing rules: `v < 26`, `|gamma| < 12°`, `vy < 12`). Failing the landing does not fail the level; it just costs you the clean-landing card | d w5 | 1 | 150 |

### 8.9 Distribution check

| archetype | count | | modifier usage | count |
|---|---|---|---|---|
| CRT | 15 | | time-limited | 9 |
| PAT | 12 | | protect-a-friendly | 11 |
| DUE | 12 | | fuel/ammo-limited | 6 |
| RCE (breather) | 12 | | start-damaged / no-guns / no-engine | 5 |
| INT | 10 | | `carry:true` | 5 |
| BAL | 8 | | | |
| BMB | 8 | | **sky states** | |
| ZEP | 8 | | day | 33 |
| SPC (left turn) | 6 | | overcast/deck | 22 |
| ESC | 5 | | night | 15 |
| DEF | 5 | | dusk/dawn | 12 |
| RES | 4 | | storm | 10 |
| STM | 4 | | high sun | 8 |
| NGT | 2 | | | |
| AIR | 2 | | | |
| PHO | 1 | | | |
| SUR | 1 | | | |

Longest gap without a breather: 5 levels. Longest run of the same archetype: 1 (never adjacent).
Every act has >= 2 left-turn levels (SPC/SUR/AIR) and >= 2 RCE breathers. §10.6 asserts all of this
from the data rather than from this paragraph.

**One deliberate near-miss to declare rather than hide:** duels sit at 53 / 56 / 60 in Act 3 and
67 / 70 in Act 4, which are gaps of 3 not 4. In every case the middle level is a duel with a
*different win condition* — 56 is survive-don't-win, 70 is win-by-crate — so the archetype repeats
but the verb does not. That is the exception, it is the only one, and §10.6 encodes it explicitly
rather than by loosening the rule.

### 8.10 Level data shape (so a generator can be written)

```
{ id: 47, act: 3, obj: "ESC", t: 100, ceiling: 1100,
  sky: "day", wind: [[0,4],[300,6],[700,7]],          // (alt, m/s) nodes
  terrain: "pass_narrow",
  spawns: [ {type:"w", n:5, k:0.62, alt:[600,800], morale:0.8, aggro:1.0, formation:"finger4"} ],
  friendlies: [ {type:"o", route:"pass_lane", mustSurvive:true} ],
  crates: { drops:[{t:12,alt:520},{t:26,alt:520},...], star:0.70, carry:false },
  objective: {kind:"escort", ref:"o0", failIf:"dead"},
  checkpoint: null,
  intro: "story.s47" }
```

Everything in §8.4-8.8 maps onto that shape. The table is the source; the JSON is generated from it,
so the table stays the single place a designer edits.

### 8.11 Agent D's beat levels — the mechanical specs

D's beats are mechanics, not cutscenes. Each one is a flag on an existing system; **nothing here
needs new physics**, which is why none of it required redesigning §1-§7.

**L33 — a named character is killed by the crate mechanic itself.**
D's line: she unhooks her harness to reach a crate. Spec:

- She is the observer in a friendly `Drover`. The AI enters `CRATE_RUN` (§5.2) but with
  `carryByHand: true`, which forces the aircraft into a slow, level, low pass: `v <= 24 m/s`,
  `|gamma| < 4°`, and **altitude inside Mud (below 110 m)** for the 6 s of the reach.
- At 24 m/s the Drover is 2.6 m/s above its own stall and has ~30% pitch authority (§1.7).
- Two things kill her, both of them existing systems and neither of them scripted: the §4.2 gust
  term (`±25%` of an `w7` wind, at 0.08 Hz, is a 1.75 m/s shove at the worst possible moment) and
  the §3.5 small-arms curve, which at 70 m and 24 m/s gives `0.30 · e^(-0.78) · e^(-0.34) = 9.8%`
  per burst — roughly a coin-flip across the 6 s pass.
- She stalls, she is inside Mud, and §1.6 says a stall below 60 m is fatal. **The crate mechanic
  kills her, in the same code path that would kill the player.**
- **It is preventable.** Suppressing the three `g` nests before the drop, or shooting the canopy
  early so the crate lands instead of hanging, removes the reach entirely. **FLAGGED TO D:** I have
  built it preventable because a death the player could have stopped is worth ten a player watched.
  If D wants it unconditional, say so and I will make the gust deterministic — but I would argue
  hard against it.

**L50 — an airlift with the guns locked.** `guns: null` on the airframe (not jammed, *removed* —
the mass comes off too, `-24 kg`). `carry: true`, quota 6 crates, 110 s. Ground guns and two scouts
contest. With no guns the canopy-cut (§4.3) is unavailable, so **every crate must be taken by
fly-through** — which forces the player to fly the crate's altitude and trajectory rather than shoot
a solution, and that is exactly the skill Airlift mode teaches. This level is the Airlift mode
unlock, and it is the best possible tutorial for it.

**L56 — a duel you survive rather than win.** Objective `{kind:"survive", t:70}`. A10 Blackthorn at
`k 0.90` in an Act-3 airframe you cannot match. **He is not invulnerable** — his 240 HP is real and
a player who somehow kills him gets a hidden medal and a changed radio line. He simply cannot be
killed in 70 s with Act-3 guns while also not being killed. Fleeing is the win. Note this is the
only level in the game where `BUG_OUT` (§5.2) is the *player's* correct state.

**L67 — a 2v1.** Duel arena rules (§7.5) with two opponents and no friendly. A7 plus an elite
escort in line astern. The counter is §5.2's element split: kill or scatter the wingman inside the
first 20 s, or accept a sandwich. **Intended to be lost at least once** — §9.4's failure philosophy
covers it (a loss costs a repair fee capped at 60 Scrip and 1.2 s).

**L70 — a duel you win by getting a crate rather than by shooting.**
`objective: {kind:"bank_crate", ref:"crate_marked"}`. One marked crate falls from Lane through
everything; banking it ends the level immediately, win. A9 Sparrowhawk contests it and — per his
own §5.3 profile — attacks *only* the crate-carrier, so the moment you take it he is on you and you
must run 800 m to the field while loaded (`carry:true`, +90 kg, climb rate 4.1 m/s). His HP is real
but he is `k 0.76` in a better airframe: shooting him is not forbidden, it is just the slow plan.

**L90 — a 12-crate airlift.** `carry: true`, cap 3, quota 12, so it is **four full round trips
minimum** under contest, 140 s. This is the mode at full strength inside the story, and it is the
level where the loaded-aircraft envelope (stall 21.9, climb 4.1, corner 49) has to be genuinely
understood.

**L100 — a landing, not a boss.** Guns unbolted (`guns: null`, `-24 kg`), no hostiles at all,
`carry: true` with one mail sack. Fly the map west to east in daylight and land clean. **Failing
the landing does not fail the level** — it costs the clean-landing card and nothing else. The
credits do not care. This replaces the mirror duel as the final level; **A12 moves to L99**, which
is a better place for it anyway: the mirror fight is the climax and the mail sack is the ending, and
those are two different jobs.

**Confirmed to D, unchanged:** "Ballast" stays at **2·35**, "The Shear" stays at **3·48**, "Both
Sides of the Line" stays at **4·65**. Shooting a parachuting pilot stays possible and unforbidden;
§3.3's "Blooded" flag is a change to *enemy behaviour*, not a scolding, and the game never comments.

### 8.12 Mode unlock schedule (agent D's dependency)

| mode | unlocks at | why there |
|---|---|---|
| **Duel** | **level 18** | D needs it by 18. It unlocks with a **squadron-mate sparring partner** rather than an ace, which also gives the player a safe rehearsal two levels before the A1 boss at 20. Each ace joins the roster when beaten in Story. |
| Daily seeded | level 20 | end of the tutorial act; the loadout is fixed so it needs nothing from the hangar |
| **Pylon Race** | **level 31** | D needs it by 31. Seven in-story `RCE` levels precede it, so the player already knows what a gate is. |
| Long Patrol | level 40 | end of Act 2. It needs fuel and ammo to matter, which needs the Act-2 tiers to exist. |
| **Airlift** | **level 50** | D needs it by 50, and level 50 **is** an airlift (§8.11), so the mode unlocks out of the level that teaches it. |

### 8.13 Act theatres and hours — agent C's R8, confirmed

| act | theatre | season | hour | the light |
|---|---|---|---|---|
| 1 | the trench line, flat mud, a river | spring | **midday to mid-afternoon** | high, flat, unromantic; one dawn (L14) |
| 2 | rolling farmland under a permanent deck | summer | **morning** | soft over-deck glare above, flat grey below; the two are different worlds |
| 3 | mountains, valleys, ridgelines | autumn | **late afternoon** | low raking sun, long shadows across the valleys, ridge tops lit and valley floors in shade |
| 4 | forest and frozen marsh | winter | **night, plus one dawn (L74)** | moon, flare, searchlight, lightning — four hard sources and no ambient |
| 5 | the enemy's own country, high | late summer | **high sun, dusk for the finale** | the sun as an object you can hide in (L81+); L99 at dusk; **L100 in plain morning daylight** |

C's five key/shadow relationships survive any reshuffle of theatres because they are anchored to
the **hour**, not the terrain: flat/high (Act 1), diffuse-above vs diffuse-below (Act 2), raking
(Act 3), point-source-in-darkness (Act 4), and hard-sun-with-a-hideable-source (Act 5). If a
theatre must move, move it with its hour attached.

---

## 9. DIFFICULTY AND ACCESSIBILITY

### 9.1 The three presets, and what they are forbidden from touching

```
Cadet   AI k *0.60   count *0.75   crate collect radius 14 m   alpha-limiter hard   all assists on
Pilot   AI k *1.00   count *1.00   collect 9 m                 default
Ace     AI k *1.25   count *1.20   collect 7 m                 alpha-limiter soft   no threat brackets
```

**Difficulty changes AI skill, enemy count, and assist strength. It never changes player damage,
enemy HP, gun damage, crate values or Scrip.** That rule exists so that an upgrade means the same
thing at every difficulty and so `sim.mjs`'s economy model does not need a difficulty axis. If a
level is too hard, the answer is fewer or worse enemies, never a fatter player.

Difficulty is changeable at any time, mid-campaign, with no penalty and no achievement lock-out.

### 9.2 Assists, individually toggleable

| assist | default | what it does | what it costs an expert |
|---|---|---|---|
| alpha-limiter | on | you cannot stall by pulling (§1.6) | releases on held full deflection under 24 m/s, so nothing |
| wings-level | on | with no input for 0.5 s, drives `gamma → 0` at up to 0.35 g | 0.35 g out of a 4.5 g envelope, and any touch cancels it instantly |
| auto-upright | on | half-rolls upright after 0.6 s neutral, inverted (§1.8) | cancelled by touch |
| anti-overshoot throttle | on | cuts to 55% inside 30 m astern (§1.10) | the horizontal drag override beats it |
| threat brackets | on | 0.5 s warning before being fired on | off on Ace, which is the only reason to play Ace |
| lead pip | on | the gunnery solution (§2.6) | nothing — it shows truth, it does not aim |
| crate impact predictor | Cadet only | dashed line to the crate's landing point | it is the `Wind Reader` trait for everyone else |
| dynamic zoom | on | D18 | the tight/normal/wide bias is a preference, not a difficulty |

Every one is independent. There is no "assist level" that bundles them, because the player who wants
no wings-level assist and every threat bracket is a real player.

### 9.3 Accessibility

- **One thumb, either hand.** `settings.handedness` mirrors the special button. Nothing else moves.
- **Colour is never the only channel** (§2.7): hostile chevron tab vs friendly roundel dot, both at
  fixed screen size; crates identified by their sway as well as their gold.
- **`settings.damageDiagram`** (default off) restores the airframe silhouette for players who cannot
  resolve §3.2's painted damage states. This is the one exception to R11 and it exists only here.
- **`settings.reducedMotion`** zeroes camera shake, the kill-cam dilation, lightning flash and the
  storm-gust camera roll.
- **Audio-optional by contract** (brief §3): every spoken line has a text card, and ace A7
  "Nightjar" — the one enemy whose primary channel is sound — has a HUD directional tick as a
  guaranteed fallback, on at all difficulties when `settings.audio` is off or muted.
- **Text**: every objective has a <= 3-word form for the HUD banner and a full form in the briefing.
  Minimum on-screen text size 15 logical px.
- **No timed reading.** Briefings never auto-advance.
- **`settings.holdToFly`** (default off): the stick latches on release instead of centring, for
  players who cannot maintain a sustained press.

### 9.4 Failure philosophy, stated

> **A mission never costs progress. Failure costs time and a small repair bill, and nothing else.**

- No lives, no energy, no timers, no daily cap on Story play, no ad wall, no purchase.
- A failed mission still banks every crate you collected before dying.
- Repair fee: 1 Scrip per 4 structure lost, **capped at 60** — under 15% of one level's income at
  any act, and the cap means a catastrophic crash costs the same as a bad one.
- Restart is a **1.2 s "again" card**, not a modal, not a menu (brief §3: no modals, ever).
- Levels over 120 s and every boss have one checkpoint at 60% objective progress.
- **After three consecutive failures on the same level**, an inline, dismissible card offers a
  wingman — a friendly AI at `k 0.5` who takes some of the heat. Never forced. **Dismissed twice, it
  is never offered on that level again.** The game does not nag and it does not assume the player
  who failed three times wants help; some of them are enjoying themselves.
- L67 (the 2v1) and L56 (survive-don't-win) are *expected* to be failed. That is not a tuning
  failure, it is the point, and §10.5's death-rate assert carries a per-level exemption for them.

### 9.5 How the game reads to a casual player vs an expert

| | casual | expert |
|---|---|---|
| flying | drag up, drag down; never stalls; the aircraft always comes back to level | stall turns, Immelmanns, side-slipping the throttle override, deliberate departures |
| guns | holds the enemy in the middle of the screen and gets hits | puts the lead pip on the target and gets every round; runs `Cool Hand` for a tighter trigger |
| altitude | "high is safer" | "high is 8 metres per second of turning, and I have 380 of them" |
| crates | flies through them | cuts canopies at 130 m over the enemy trenches for 1.6x |
| economy | buys the next thing that lights up | is 3 levels ahead and chose the Lance because A5 exists |
| difficulty | Cadet, all assists, and finishes the campaign | Ace, no brackets, and the ace roster is the actual game |

Both of those players are playing the same game with the same numbers. The only thing that
separates them is how much of §1 they have discovered in their hands, and **none of it was ever
explained to them in text.**

---

## 10. BALANCE TESTING PLAN — `tools/sim.mjs`

**Hard requirement on agent A's architecture:** the flight model, combat resolution, AI, crate
physics, wind and the economy tables must live in modules with **zero DOM, zero WebGL, zero
`performance.now()` and zero camera imports**, so `node tools/sim.mjs` runs the real game. If
`sim.mjs` has to reimplement any of it, every number below becomes a fiction about a second game
(this repo has been burned by exactly that shape of test before).

Nine measurements. Each one **asserts**, so it fails CI rather than printing something nobody reads.

### 10.1 Envelope report

For every airframe x every upgrade combination x three altitudes (0, 500, 900 m), emit:
`V_s, V_max, V_dive_terminal, best RoC and the speed for it, corner speed, instantaneous and
sustained turn rate at 22/26/30/34/40/46/52/58 m/s, service ceiling, zoom-climb height from V_max,
glide L/D and glide range from 500 m.`

**Asserts** — the declared bands, from §1.5 and §1.11:

```
V_s          17.0 - 18.5 m/s        (reference airframe, no upgrades)
V_max        57   - 60   m/s
V_terminal   88   - 94   m/s
RoC_best      8.8 -  9.6 m/s
V_c          37   - 39   m/s
omega_inst_max  63 - 68 deg/s
omega_sus_max   52 - 57 deg/s
zoom climb     108 - 122 m
turn rate at 900 m / at sea level    0.62 - 0.72     (this is the whole point of §1.2's H = 2500)
```

Any constant change that pushes an airframe out of band fails the build. This is the single
cheapest test in the plan and it should be written first, before there is a game.

### 10.2 Duel matrix — **the best signal in the harness**

Every airframe x every upgrade tier x every ace, **200 headless duels each** under §7.5's rules.
Report win rate, mean and p90 time-to-kill, mean rounds fired, and the modal cause of loss.

**Asserts:**

- The **intended-tier loadout** for an ace's act wins **55-70%** against that ace. Outside that
  band, the ace is mis-tuned, not the aircraft.
- **Every airframe wins 45-65% against every act-appropriate ace.** An airframe outside that band
  on more than two aces means the sidegrades have collapsed into a ladder (§1.11) and the Act-3
  choice has stopped being a choice.
- A12 "Kitehawk", flying a mirror of the player's loadout, wins **48-52%** at `k 0.90`. If the
  mirror does not sit at a coin flip, the ace `k` scaling is wrong.
- **Counter-play check:** each ace's stated counter in §5.3 must measurably work. Run 200 duels with
  a scripted bot executing the counter and 200 without; the counter must be worth **>= 18
  percentage points** of win rate. An ace whose counter is worth 3 points does not have a counter,
  it has a description.

### 10.3 Economy simulation

Replay the whole §8 level table with three archetypes (capture 0.50 / 0.68 / 0.85) against §4.4's
drop table and §6.4's income model, reporting cumulative Scrip against the §6.5 purchase schedule,
per level.

**Asserts:**

- the **competent** player can afford the act's intended kit by level `act*20 - 2`
- the **sloppy** player lags by no more than **6 levels**
- the **great** player leads by no more than **8 levels**
- total lifetime income / total cost of everything lands in **1.05 - 1.20** (§6.5 predicts 1.12)
- no single level's income exceeds 3x the act mean (no runaway crate level)

### 10.4 Crate reachability — **the level that must not be quietly unwinnable**

For every level, for every guaranteed crate, and for the act's airframe: brute-force whether the
crate is physically catchable. Build a reachability cone from the player's spawn using the airframe's
real climb rate, top speed and the level's wind profile, integrate the crate's actual §4.2 fall, and
check for an intersection. Repeat for the canopy-cut option (can the player reach a firing solution
on the canopy in time, and does the resulting ballistic fall land friendly-side?).

**Assert: every guaranteed crate in every one of the 100 levels is reachable by at least one of the
three methods in §4.3, and the level's 3-star crate target is achievable with at least 15% time
margin.**

This test exists because of a specific scar in this repo: **a gate that passed because of a
workaround inside it hid a third of a map being unreachable.** Therefore:

- the assert is on **per-crate detail lines**, never on a pass count
- the report prints every crate with its margin in seconds, sorted ascending, and the ten tightest
  are printed even when everything passes
- the reachability solver may **not** contain any fallback, clamp or "if unreachable, move the drop
  point" convenience. If a crate is unreachable the test fails and a human moves the drop point in
  the level table.

### 10.5 Time-to-complete and death rate

A utility bot at `k 0.70` plays each of the 100 levels 30 times. Report mean, p10 and p90 completion
time, death rate, ammo used, fuel used, crates taken.

**Asserts:**

- mean completion time within **±35%** of the level's target `t`
- death rate between **8% and 30%** — below 8% the level is not a level, above 30% it is a wall
- **exemptions, declared here and encoded in the data, not in the test**: L56 (survive-don't-win,
  expected death rate up to 55%), L67 (the 2v1, up to 60%), and the five boss levels (up to 45%)

### 10.6 Static content audit

A pure data check over the §8 table, no simulation:

- no objective archetype repeats within 4 levels, **except** the two declared exceptions in §8.9,
  which are listed by level id in the test rather than by loosening the rule
- every act has >= 2 left-turn levels and >= 2 breathers
- every "new noun" appears as `new` exactly once across all 100 levels
- every act has exactly one forced climb (§0b, R9) and every one of them terminates in Lane or Blue
- enemy count per act mean is monotonically increasing and within ±1.5 of §8.1's 4 / 5.5 / 7 / 8.5 / 11
- **no enemy's HP differs between acts** (§8.1 rule 4: composition escalates, numbers do not)
- D's fixed beat levels (33, 50, 56, 65, 67, 70, 90, 100) and the three worked crate situations
  (2·35, 3·48, 4·65) are present at exactly those ids — a manifest assert, so a future reshuffle
  that breaks D's script fails loudly

### 10.7 Ammo and fuel audit

Per level, the §10.5 bot's expected rounds fired and fuel burned against the airframe's capacity.

**Assert: at the intended upgrade tier there is >= 15% margin, and at the previous tier the margin
is negative.** The second half is the important one — it is what proves the upgrade was *needed*
rather than merely available. An upgrade tier with positive margin at the tier below it is a tier
nobody had to buy, and it should be deleted or made cheaper and moved earlier.

### 10.8 Regression fixtures, and the anti-mock rule

Twelve recorded input traces replayed against the deterministic sim; the resulting state hash must
match a blessed value:

`a 360° loop from 40 m/s` · `a deliberate stall turn` · `an Immelmann` · `a split-S` ·
`a 500 m glide, engine out` · `a full-speed dive to V_NE and recovery` · `a canopy cut at 130 m in
9 m/s wind` · `a fly-through interception of a swinging crate` · `a fire blown out by a dive` ·
`a 5-crate airlift round trip at 790 kg` · `a landing at 26 m/s` · `a 2v1 element split`

**The anti-mock rule, which is not optional:** every assert in this plan must be validated by
deliberately breaking the constant it guards and confirming the test fails. A test that still passes
after you revert the fix was never testing the fix — that has bitten this repo twice. The validation
runs are recorded in a `tools/BLESSED.md` alongside each fixture: *what I broke, and what failed.*

### 10.9 Determinism

Same seed + same input trace → identical state hash across 1000 runs, on two machines. Required by
the Daily challenge (§7.6), by Pylon Race ghosts (§7.3), and by every fixture above. **`Math.random`
must not appear anywhere in the sim modules** — a single seeded PRNG, threaded explicitly.

### 10.10 What is deliberately not tested here

Feel. `sim.mjs` cannot tell you whether the stick is nice. That is what the Duel mode built in the
flight phase (§7.5) and the CDP touch harness (§2.9) are for, and no amount of green asserts
substitutes for Aaron flying it for ninety seconds.

---

## 11. WHAT THIS DESIGN REQUIRES OF THE ARCHITECTURE

Collected in one place for agent A. Nothing here is a new request beyond the units question; it is
the design's dependencies, stated so they are not discovered late.

1. **Headless sim modules** — §10's hard requirement. Flight, combat, AI, crate physics, wind and
   the economy tables import nothing from the renderer, the DOM, or wall-clock time.
2. **One seeded PRNG**, threaded explicitly. No `Math.random` in sim code (§10.9).
3. **Serialisable loadout** — airframe + every upgrade tier + equipped traits, as a plain object.
   Ace A12 (§5.3) clones it; the Daily (§7.6) overrides it; the Duel matrix (§10.2) enumerates it.
4. **State-stream recording and replay** for Pylon Race ghosts (§7.3) and the §10.8 fixtures. The
   same mechanism serves both.
5. **Geometric hit allocation** — three capsule colliders plus fuselage sub-rects per aircraft
   (§3.1). Not a single hitbox and a damage roll; where you are shot from is a mechanic.
6. **Component damage as a first-class aircraft state**, not a set of booleans on the player —
   every AI aircraft uses the same structure, because §3.3's death spiral and §3.2's smoke are one
   implementation shared by everything that flies.
7. **Per-level wind profile as a piecewise-linear altitude table**, evaluated by both the crate
   solver and the AI's estimator (§4.2, §4.5).
8. **Orientation-aware camera and HUD from day one** (brief §2), with every HUD rect defined as
   anchor + offset, and the D18 zoom controller operating on a world-space bounding box (§2.8).
9. **Fixed-screen-size overlay layer** — threat brackets, allegiance glyphs, the lead pip and crate
   pips must not scale with zoom (§2.9a).
10. **Level data generated from the §8 table**, not hand-authored twice. The table is the source.

---

## 12. TUNING REGISTER — every guessed number in one place

Everything below is a **[START]** value: it is defensible, it is not measured, and the named test
refines it. Everything *not* in this table is either derived arithmetic (§1.5) or a constant fixed
by another agent (§0a).

| # | constant | value | confidence | the test that refines it |
|---|---|---|---|---|
| T1 | atmosphere scale height `H` | 2500 m | med | §10.1 — turn rate at 900 m must be 0.62-0.72 of sea level |
| T2 | high-speed flutter drag term | `1.8*((v-70)/40)^2` | low | §10.1 — terminal dive must land 88-94 m/s |
| T3 | `CD0` reference | 0.060 | med | §10.1 — it sets `V_max`; move it, not thrust, if top speed is wrong |
| T4 | post-stall CL table | §1.3 | low | §10.8 stall-turn fixture — the hammerhead must complete in 1.0-1.5 s |
| T5 | `K_q` pitch gain | 7.0 | med | §10.8 loop fixture — 360° in 5.2-5.8 s, no alpha overshoot past 16° |
| T6 | alpha-limiter margin | 0.94 | med | playtest — can a Cadet-difficulty player stall by accident? Target: no |
| T7 | limiter release threshold | full deflection 0.35 s under 24 m/s | low | expert playtest — can they hammerhead on demand? |
| T8 | stick radius `R` | 90 px | med | §2.9 P4 thumb-travel harness |
| T9 | stick response exponent | 1.35 | low | expert playtest — fine tracking at 100 m |
| T10 | auto-fire cone half-angle | 8° (+6° inside 50 m) | med | §10.5 hit-rate — target 22-32% of rounds hitting, at `k 0.70` |
| T11 | gun convergence | 90 m | med | §10.2 — does the close-range straddle actually discourage ramming? |
| T12 | target-priority weights | §2.5 | low | playtest — does the lock ever pick the wrong aircraft in a 4-way? |
| T13 | lock hysteresis | 0.40 s | med | CDP trace — count reticle changes per 10 s; target < 4 |
| T14 | player structure / enemy DPS ratio | 220 vs 28 | med | §10.5 death rate 8-30% |
| T15 | fire blow-out condition | 70 m/s for 3.0 s | low | §10.5 — what fraction of fires are survivable? Target 55-70% |
| T16 | flak lead error `sigma` | `18 + 0.25*(range/100)` m | low | §10.5 — flak should cause 5-12% of deaths, never more |
| T17 | small-arms hit curve | `0.30*e^(-alt/90)*e^(-v/70)` | med | §10.4 — the canopy-cut play at 130 m must remain worth 1.6x |
| T18 | crate terminal velocity | 7.75 m/s (from `CdA = 24`) | high | derived; only `CdA` is a guess |
| T19 | canopy-cut value multiplier | 1.6x | **low, and load-bearing** | §10.3 — if it is worth less than 1.35x nobody will fly into the Mud for it, and §4.3's whole design collapses |
| T20 | burst chance on a high cut | 35% above 250 m | low | §10.3 — the expected value of a high cut must be *below* a fly-through |
| T21 | enemy crate reinforcement ladder | §4.5 | **low, and load-bearing** | §10.5 — if losing 3 crates does not measurably raise the death rate, the ladder is decoration |
| T22 | crate contents weights | §4.4 | med | §10.3 — mean 15.6 Scrip-equivalent per crate |
| T23 | ace `k` values | §5.3 | med | §10.2 duel matrix — 55-70% intended-tier win rate |
| T24 | morale coefficients | §5.2 | low | §10.5 — what fraction of enemies flee? Target 12-22% |
| T25 | income constants `D`, capture, `B` | §6.4 | med | §10.3 — the 1.05-1.20 lifetime ratio |
| T26 | upgrade costs | §6.2 | med | §10.3 and §10.7 together |
| T27 | camera `CAM_H_BASE` | 132 m | med | §2.9 P1/P3/P3c |
| T28 | zoom slew rates | out 1.10/s, in 0.22/s | low | CDP traces — count zoom reversals per minute; target < 6 |
| T29 | level target times `t` | §8 table | low | §10.5 — mean within ±35% |
| T30 | band edges Mud/Belt/Floor | 110 / 340 / 420 m | med | §10.5 — time spent per band should be non-trivial in all six; a band the bot never enters is a band that does not exist |

**The riskiest three are T19, T21 and T1** — the canopy-cut multiplier, the reinforcement ladder,
and the atmosphere scale height. Those are the three numbers that make the crates a real decision
and the altitude a real resource. If any of them measures wrong, a system in this document is
decoration and should be re-argued rather than nudged.
