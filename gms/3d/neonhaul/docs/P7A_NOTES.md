# P7a — measurements, findings and plan defects

Everything here is measured by `tools/sim_p7a.mjs` (240 careers × 20 min × 7 policies, 12 world
seeds) or by `tools/gates_p7a.mjs` (30/30 including 6/6 falsification). Raw data:
`shots/p7a/sim.json`, `shots/p7a/_gates.json`.

---

## 1. The balance, measured

| policy | what it is | CRD/min p05/p50/p95 | CRD/job | jobs/20 min | tier 2 (min) | idle | fuel |
|---|---|---|---|---|---|---|---|
| `chain` | fill the hold, deliver nearest-first | 706 / **813** / 981 | 703 | 24 | 2.63 | 2 % | 4 % |
| `hop` | take a job from the pad you landed on | 684 / **786** / 905 | 693 | 23 | 2.92 | 3 % | 4 % |
| `greedy` | always the highest base pay on the board | 646 / **770** / 852 | 763 | 20 | 3.05 | 3 % | 5 % |
| `dawdle` | `hop` at 0.72 skill, 2.4× dwell | 524 / **552** / 605 | 659 | 17 | 4.26 | 3 % | 5 % |
| `hubcamp` | always fly back to the HUB, take the shortest | 435 / **495** / 550 | 521 | 20 | 4.59 | 0 % | 7 % |
| `repeat` | **grind one pad forever** | 405 / **459** / 508 | 634 | 15 | 4.86 | 0 % | 8 % |
| `reckless` | never charge; live on free tows | 197 / **243** / 296 | 574 | 10 | 2.92 | 0 % | 0 % |

**Pay per delivery** (all policies, n ≈ 5,500): p05 **415**, p50 **677**, p95 **980**, max 2,110
(a chained rush job).

**No route dominates.** The three legitimate strategies sit inside a **1.07×** spread, and both
degenerate strategies are worse than all of them: grinding one pad returns **59 %** of varied play
and camping the HUB **61 %**. That falls out of the geometry rather than from a rule — the pickup
is the pad you are standing on, so the natural loop never flies an empty leg, while both grind
strategies pay a return trip on every job. Nothing was tuned to achieve it; `repeat` and `hubcamp`
exist in the harness purely to ask the question, and gate T23 keeps asking it.

**Time to afford** (non-buying `hop` career, 8 seeds, median minute):
`kestrel` 3.0 · `lance` 9.4 · `drayman` 22.2 · `nocturne` 50.3 · `mammoth` beyond 90.
Craft affordability tracks the licence ladder closely — `nocturne` becomes affordable at ~50 min
and tier 5 unlocks it at ~46 min — which is the right relationship and was not designed, it is
what §7.4.4's and §7.4.9's numbers happen to produce together.

**Upgrade path** (a career that buys the cheapest available line the moment it can afford it):
all four L1 lines by **2.1 min**, all four L2 by **5.0 min**, all four L3 by **11.7 min**
(300 / 700 / 1400 CRD each on a `wisp`).

**Never stranded.** 1,680 careers, 0 events of 0 credits *and* 0 cell. The tow fired 1,527 times
across the sweep (almost all of them in `reckless`), always free, always +15 units. F4 proves the
gate catches a broken tow.

**Unreachable jobs: 0.** Exhaustively, not sampled: every board slot at every courier pad in a
29×29-chunk block, at all six licence tiers — **0 of 1,590** failed to resolve a destination.

**Idle with nothing to do: 3 %** of wall time on the natural loop, 6 % worst-case on any policy.
That is the time spent flying to another pad because the board at this one held nothing
acceptable. It is never zero because a 2-slot `wisp` holding a 2-slot crate can legitimately be
offered nothing it can carry.

---

## 2. Plan defects found — reported, not silently resolved

### D1. RESOLVED AT INTEGRATION — the time bonus is now a bonus.

**Everything below this box is P7a's original report and its numbers are PRE-FIX.** Read it for the
diagnosis, not for the constants.

> **Resolution (2026-08-18).** `PAY.LIMIT_BASE` 60 → **20**, `PAY.LIMIT_PER_KM` 77.78 → **26**,
> `PAY.RUSH_LIMIT_MUL` 0.6 → **0.85**. Not hand-picked: swept with `tools/sim_p7a.mjs` against a
> target *distribution* — fully saturated on 50–60 % of deliveries, fully lost under 10 % — over
> ~13,100 deliveries, six policies, twelve seeds.
>
> P7a's own suggestion of `LIMIT_PER_KM ≈ 31` **would not have worked, and not for the reason
> P7a gave.** Swept alone it still leaves the bonus saturated on **97.2 %** of deliveries, because
> `LIMIT_BASE = 60` dominates the arithmetic for the 0.6–2.4 km tier-1 band: a 1.4 km job is
> `60 + 31×1.4 = 103 s`, saturating at 67 s against ~35 s of flight. **Both constants had to move.**
>
> | | sat | fully lost | mean bonus |
> |---|---|---|---|
> | all deliveries | **56.5 %** | **2.9 %** | 0.383 |
> | normal jobs | 57.6 % | 2.6 % | 0.386 |
> | RUSH jobs | 6.7 % | 18.4 % | 0.242 |
> | `hop` (the natural loop) | 71 % | 0.8 % | 0.428 |
> | `chain` | 54 % | **13.1 %** | 0.356 |
> | `dawdle` (0.72 skill, 2.4× dwell) | **0 %** | 1.0 % | 0.213 |
>
> The last two rows are the point. `dawdle` — a player still learning the sticks — now sits **on
> the ramp** rather than at either end, and `chain` pays for its own bonus with a 13 % chance of
> losing the time bonus on the parcel waiting in the hold. That is the routing decision §7.4.2 says
> the chain bonus exists to create, and it did not exist before.
>
> `RUSH_LIMIT_MUL` had to move too: against the new limits, P7a's 0.6 makes a rush bonus **72 %
> fully lost and 0 % saturated** — the same defect with the sign flipped.
>
> **Cost, stated plainly:** §7.4.6's *payout* of **650** and §7.4.7's method survive; the *clocks*
> do not. 3:20 → 1:05, 2:10 → 0:42, and §7.4.7's payout moves one round5 step, 1,115 → 1,120.
> `docs/BUILD_PLAN.md` §7.3, §7.4.6, §7.4.7 and §13 are updated; gates T2/T3/F1 assert the new
> numbers. **This is reversible and it is Aaron's call if he wants the flat markup instead.**

#### D1 (original text). The time bonus is not a bonus. It is a constant +45 % markup.

**Measured: `timeBonusMean` = 0.4500 and `overdueRate` = 0.000 across every policy that charges
normally.** Not "usually saturated" — saturated on 100 % of ~5,500 deliveries.

The cause is arithmetic in §7 itself. §7.3's panel mock and §7.4.6/§7.4.7 pin the time limit to
two points (1.8 km → 200 s, 3.6 km → 340 s), which is `limit = 60 + 77.8 · km`. The bonus saturates
at 65 % of that, so a 1.8 km job must be delivered inside 130 s. At §6.2's 62 m/s cruise, 1.8 km is
**29 s of flight**. The player has 4.5× the time they need, so the bonus is unmissable.

The only measured way to lose it is to run the cell flat: `reckless` is the one policy with a
non-saturated mean (0.41) and a non-zero overdue rate (9.7 %), because the limp tow costs real
minutes.

**Not fixed, deliberately.** §13 makes "a 1.8 km risk-0 job shows base 415, and delivering it at
2:05 with one chained parcel pays 650" a done-criterion, and that number *is* the saturated bonus.
Any fix changes a number the plan states twice. The one-line options, for the manager:

- `PAY.LIMIT_PER_KM` 77.8 → ~31 (limit ≈ 60 + 31·km, saturation ≈ the actual flight time). Breaks
  the mock's "3:20" and §7.4.6's payout of 650.
- Start the limit clock when the job appears on the board rather than at accept. §7.4.6 half
  implies this already — see D2.
- Accept it as a markup and delete the bonus row from §7.3's panel, folding +45 % into `PAY.BASE`.
  Honest, and one fewer number on the main UI.

### D2. §7.4.6's flight breakdown contradicts §7.4.5's pickup rule.

§7.4.5: *"Pickup is the pad you are standing on."* §7.4.6: *"flight — ~25 s to the pickup + ~29 s
to the drop."* Both cannot be true; there is no leg to a pickup if the pickup is where you accepted
the job. The implementation follows §7.4.5, because §7.4.5 is the one that describes a mechanism.

### D3. §7.4.0's targets 1–3 are all solved against 60 s of flight per delivery, and the tier-1 band flies in ~30.

§7.4.3 prices fuel as *"a job burns ~60 s of flight = 19.2 units"*. §7.4.5's tier-1 band is
0.6–2.4 km, mean 1.4 km, which at 62 m/s is **23 s**, ~30 s with the accel and climb the harness
charges. Three of §7.4's targets inherit the error:

| target | plan | measured |
|---|---|---|
| 1 — fuel is 8–12 % of base pay | 10.2 % | **5.8 %** of base (4.0 % of gross) |
| 2 — a cell lasts ~5 deliveries | 5.2 | **5.2** ✓ (this one survives, by coincidence: the cargo term and the dock idle make up the difference) |
| 3 — tier 2 at 6 ± 1 jobs, inside 8 min | 5.8 jobs / 8.2 min | **5 jobs (max 6)** ✓ / **2.9 min** (max 3.8) |

Target 3's *job* count lands inside 6 ± 1. Its *minute* count does not — tier 2 arrives about 2.8×
faster than the plan expects, because the plan's §7.4.8 assumes 90 s per job and the measured loop
is ~52 s including docking. §13's gate is a ceiling ("within 9 minutes"), so this passes with a
large margin rather than failing, but the first eight minutes of the game are three times denser
than the document imagines. **This is the single number most worth revisiting after Aaron plays
it** — the harness flies a perfect route, and a real player at 0.72 skill with dwell (`dawdle`)
still reaches tier 2 in 4.3 min.

### D4. §7.4.6's worked example cannot be performed by the craft the player starts in.

The example is a **2-slot** SEALED CRATE delivered *"with one chained parcel held"*. §5.2 gives the
starter `wisp` **2 slots**. Holding a 2-slot crate and anything else needs 3+ slots, so the example
requires a `kestrel`, which is tier 2.

Handled without changing either number: parcel *items* carry slot costs of 1 or 2 within a type, so
`standard` offers DOCUMENT TUBE (1), COLD BOX (1) and SEALED CRATE (2), and both **scripted tutorial
jobs are forced to 1-slot items** so the chain bonus the second job exists to teach is actually
performable on a `wisp`. Gate T2 still reproduces the example's arithmetic exactly.

### D5. `grep -rn "heat" js/` cannot return nothing, and should not.

§13 states this literally as a done-criterion. `js/` contains **6** occurrences of the word, every
one of them a comment recording that there is no heat system (`config.js`, `hud.js`, `traffic.js`,
and two in `economy.js`). Deleting them to satisfy a grep would delete the record of DECISIONS
decision 6 from the code that implements it.

Gate T14 therefore strips comments and string literals and scans the **code**: 0 in code, 6 in
comments, and it reports both so the difference is visible. Same treatment for
`alert(`/`confirm(`/`prompt(` — `settings.js` has one in a comment saying never to use them. F5
injects a real `heat` reference and a real `alert(` into a temp tree and proves the scanner catches
both, and that a comment-only mention adds nothing.

### D6. §7.1 gives RUSH a "tight timer" without giving one, and §5.2 gives no cargo slots to a decision that needs them.

`PAY.RUSH_LIMIT_MUL = 0.6` is **derived, not from the plan**, and is flagged as such in
`economy.js`. It makes the 2.2× multiplier a real decision (a 1.8 km rush job wants 2:00 instead of
3:20) while staying comfortably flyable at 29 s of cruise.

---

## 3. Two things this phase got wrong and caught

### The harness's own tow measured nothing

The first version of `burn()` in `sim_p7a.mjs` discarded the unflown remainder of a leg when the
cell went flat, so **a tow teleported the craft to its destination**. The result: `reckless` — never
pay for fuel, take the free tow every time — came out as the **highest-earning policy in the game
at 852 CRD/min**, beating the intended routing play.

It was not caught by reading the code. It was caught because *a strategy that beats every other
strategy is not a finding, it is a broken experiment*, and the number was checked instead of
reported. With the leg resumed from wherever the tow drops you, `reckless` is now the **worst**
policy at 243 CRD/min with 24 tows per 20 minutes — which is what a mechanic that costs you minutes
should look like. This is instance number ten of this project's dominant failure mode, and the
first one caught inside the same session that created it.

### A falsification test that did not falsify

`F1` originally perturbed `PAY.PER_KM` from 130 to 131 and asserted that gate T2 stopped
reproducing §7.4.6. **It did not fail** — `180 + 131 × 1.8 = 415.8`, which `round5` snaps back to
the same 415. A falsification test that quietly passes is exactly the bug it exists to catch.

F1 now sweeps the perturbation and *reports the gate's resolution*: the smallest detectable error in
`PER_KM` is **2 CRD/km (1.5 %)**, which is the `round5` quantum at 1.8 km. Below that, T2 genuinely
cannot see a constant drift, and that is now written down rather than assumed away.

---

## 4. Design decisions taken where the plan was silent

- **Zone lattices.** CHARGE sits on chunks `(0,0) mod 3` and WORKSHOP on `(1,2) mod 3` — disjoint
  residue classes, so neither lattice ever has to shift out of the other's way. 768 m spacing gives
  a half-diagonal of 543 m; measured worst case over 3,844 sample points including the authored
  core is **473 m**, mean 220 m, comfortably inside §7.1's ~700 m. F6 loosens the lattice to 8
  chunks and the gate catches it at 1,233 m.
- **Pad siting.** A pad is a roof (`h + 1.2 m`) or a ledge (`0.42 h`, 38 % of buildings over 60 m),
  on a non-landmark building whose smaller footprint dimension exceeds `1.6 × VOLUME.radius`, with
  the height index biased by `pow(u, 1 + 0.42·tier)` so high-licence districts put their pads high
  up the towers. Measured over 1,145 courier pads: 25 m to 694 m, median 122 m, **1 % below 30 m and
  13 % above 300 m** — which is what makes §7.4.2's third risk condition fire at all.
- **PICKUP/DROP are roles, not pad types.** §7.1's table mixes intrinsic types (CHARGE, WORKSHOP,
  HUB, RUSH) with roles (PICKUP, DROP). A courier pad reads as DROP when it is an active parcel's
  destination, RUSH when it is flagged and the licence is 3+, and PICKUP otherwise —
  `zones.displayType()`, one function, so a world volume, a minimap dot and a panel cannot disagree.
- **A workshop and the HUB also sell charge.** Otherwise the two lattices have to interleave, and
  the HUB chunk would eat a charge lattice point at the exact spot the player starts.
- **`WISP_NOTIONAL = 2000`.** §7.4.9 prices an upgrade as a fraction of *the current craft's list
  price*, and the `wisp` has no list price, which would make every starter upgrade free.
- **Upgrades reset when you buy a hull.** They were fitted to the old craft, and it is what keeps
  the L3-at-70 %-of-list price honest.
- **Haggle is hashed, not random.** Outcome is `hashf(job)` < 0.55, so it cannot be rerolled by
  re-docking and the harness is reproducible. Measured over 250 clients: **55.6 %**.
- **Board destinations are picked, not enumerated.** A tier-6 job's 6 km band covers 2,209 chunks;
  materialising all of them cost 3.9 ms and blew straight through `city.js`'s 900-entry descriptor
  cache, which clears *wholesale* and would hand the renderer a cold cache. `pickPadInBand` filters
  on chunk coordinates and district (both answerable without generating anything) and materialises
  only survivors: **13 chunk probes and 0.83 ms per cold tier-6 board** (gate T24).
