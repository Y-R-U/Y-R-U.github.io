# S2-I — the company layer

Aaron's brief: *"a later enhancement to the game once you get past the initial story plot will open
up the ability to hire more drivers - and you will be able to switch to their vehicle views, you
will be paying wages (automatically) and there would be earnings screens etc."*

Four things, and each has one module. **Founding a company with legit/shady tabs is S2-J and is
deliberately absent** — this phase builds the drivers and the money.

| | |
|---|---|
| `js/company.js` | PURE. Grades, wages, the lease, arrears, the company ladder, the ledger, the save. Node-runnable, so the wage table is swept rather than picked. |
| `js/fleet.js` | The flying. A driver is a `Courier` at the stick of a real `Flight` working a real `Missions` board. |
| `js/companyui.js` | The screens. `FleetPanel` (ROSTER / RECRUIT / EARNINGS) and `DriverFeed`. Renders only. |
| `js/main.js` | The wiring. Decides nothing. |

---

## A driver is not a formula

`js/autopilot.js`'s `Courier` already flies a complete delivery loop — takes jobs off real boards,
navigates, docks, delivers — and S2-E measured it against the analytic economy at an optimism ratio
of **0.995**. So a hired driver **is** one, at the stick of a real `Flight`, with its own economy
state and its own `Missions` instance. Nothing computes income from a rate.

Its own `Missions` matters and is not tidiness: `Missions.accept()` bumps the pad's board
generation, so a driver sharing the player's instance would refresh the board **under the player's
fingers** from three kilometres away — the one thing §7.4.5 exists to forbid.

**Competence is not a new number.** A grade's speed is `lanes.js` `AUTO_LEVELS[n].speed` — the
ladder S2-F measured over 4,000 trips (0.32 / 0.50 / 0.70 / 0.88 of the hull's MAX_FWD) — read
through a new `Courier.speedCap` that **defaults to 1**, so `?courier=1` and `__game.flyTo()` fly
exactly as they did before the field existed. `gates_s2i` C1 measures the cap on the **craft**, not
in the struct: the fastest a capped STEADY reached over 26 samples was **31.38 m/s against a
31.00 m/s allowance**, and the same craft with the cap lifted reached **60.23**.

The route is direct (`Courier`), not lane-following, so `LanePilot`'s corridor detour does not
apply. S2-F's headline "4.28× … 1.48× slower than a thumb" includes that detour and does **not**
describe a driver.

### The honest limitation, stated in `fleet.js`'s own header

`CityRenderer.aabbsNear()` reads `this.live`, which holds only the chunks streamed around the
**camera**. A driver working a pad three kilometres away therefore flies through a world with **no
collision geometry in it** — the same shape as the `solidAt()` trap in `CLAUDE.md`: absence of data
is indistinguishable from open air. It is not worked around, because both fixes are worse (streaming
per driver costs the frame budget; a synthetic collision model is a second physics nobody measures).
What it means is that the wage table is solved against the rate drivers **actually achieve**, never
against the player's. When the player watches a driver, the city streams around *them* and they are
colliding like anybody else.

---

## The money, and the one design rule

**A hire must be able to lose money.** The lever that makes it bite is the **hull**: the lease is a
standing fraction of `story.js`'s already-swept five-minute hire block price, and the hulls are not
equally productive. There is no pairing table on any screen and there should not be one — the roster
prints the live arithmetic per driver, so a losing hire is visible inside a minute.

`node tools/sim_s2i.mjs` — 4 grades × 6 hulls × 6 worlds × 30 minutes, committed at
`docs/s2i_balance.json`. Shipped result:

| grade | wage | best hull | net p50 | margin | worst hull | net p50 |
|---|---|---|---|---|---|---|
| GREEN | 75 | lance | +33.6 | 12 % | mammoth | −785.1 |
| STEADY | 255 | lance | +98.1 | 19 % | mammoth | −876.8 |
| SEASONED | 405 | lance | +179.9 | 24 % | mammoth | −917.4 |
| ACE | 515 | lance | +299.8 | 30 % | mammoth | −908.0 |

- **14 of 24 pairings lose money at the median seed (58 %).**
- The best pairing pays its signing fee back in **11 minutes** — a business, not a jackpot.
- **GREEN's best pairing has a p10 of −0.9 against a p50 of +33.6**: a bad world wipes the margin off
  the hull a player would actually pick. The bottom rung is a bet.
- `STEADY` is profitable in **1 of 6 hulls**. Tight, deliberately.

The sweep asserts those four properties itself and **exits non-zero if they stop holding**, so it is
a test and not a printout. `--solve=1` re-derives the wage table instead of asserting it.

### The calibration, and the number it nearly was

`sim_p7a`'s flight model prices a leg as distance over cruise speed and **cannot see a wall**, so it
is an upper bound. `tools/fleet_rate.mjs` is this phase's `courier_rate.mjs`: it flies one driver of
each grade **in parallel, in one session** and measures fleet gross per sim minute in the running
game.

| world | measured | modelled | ratio |
|---|---|---|---|
| `0x4e454f4e` | 1,457.7 CRD/min | 1,848 | model **1.27×** optimistic |
| `987654321` | 2,175.7 CRD/min | 1,848 | model **0.85×** optimistic |
| **pooled, 77 deliveries** | **1,816.7** | 1,848 | **1.017×** |

**The first world was run first and `CALIBRATION` was briefly set to `1/1.268` on the strength of
it.** The second world is what caught that: the between-world spread is **1.5×**, larger than the
correction it was being asked to justify. Pooled, the analytic model is within 2 % of the game —
the same place S2-E's `courier_rate.mjs` left the player's own courier (0.995). So `CALIBRATION`
ships at **1.0 because it was measured**, and the constant exists so the next person can see that
rather than assume nobody looked.

**The per-grade ratios are not used and must not be.** Pooled they are 1.18 / 0.67 / 0.84 / 1.59;
with 5–15 deliveries per driver the between-driver spread swamps the grade effect they would
describe.

### One thing in that data that is flagged rather than banked

**The ACE under-earned the SEASONED in both worlds** (288.8 and 626.4 against 620.8 and 720.8). Two
of two is not evidence, and n is 5–15 deliveries, but it is not nothing either and the speed cap
makes it hard to explain as a steady state. The plausible mechanism is the cell: drain is
`IDLE + CRUISE_K × speed/maxFwd`, so an ACE at 0.88 burns **2.1×** what a GREEN at 0.32 does, and a
driver only tops up when it happens to land on a charge pad below 55 % or drops under 20 %. **Worth
a longer run before anyone tunes the grade ladder on it.**

---

## Wages are paid every frame, and they can hurt

Not on a timer: a payroll that fires once a minute can be dodged by spending in the gap, and *"paid
automatically"* has to mean it cannot be. `fleet.tick` **pays first and flies second**, so a driver
who cannot be paid walks before they cover another metre.

The shortfall becomes **arrears**, not a skipped payment — a wage that quietly stops when you are
broke is not a wage. A driver owed **3 minutes of their own wage walks out**, and walking is the
whole penalty: no fail state (DECISIONS 6), the player keeps flying, and they have lost the signing
fee. `gates_s2i` A6 measures the walk-out at **t = 180 s exactly**, against a control arm — the same
driver, the same 600 s, a million credits in the account — that produces **0 walk-outs and 2,750 CRD
of wages actually paid**. The control is what shows the cause is the empty account and not the clock.

Being broke also **starves the fleet through a second route**: `chargeDriver` pays what the account
can cover, so a partial charge is a partial charge, and a driver that runs flat limps at the same
12 m/s tow speed §7.4.3 already uses.

**Driver income never touches `economy.lifetime`.** That is the licence ladder's axis and idling to
HAULMASTER on somebody else's flying would make it mean nothing. A5 asserts it against a control
that pushes the same 900 CRD through `economy.earn()` and watches lifetime move — so the zero is a
measurement and not a dead counter.

---

## The two reserved licence rungs, opened

`LANE MARSHAL` and `SPIRE HAULIER` have shipped since S2-D with `lifetime: null` and
`opens: 'company'` precisely so this phase could give them a threshold that is not a lifetime. They
now open on **FLEET LIFETIME GROSS**, via `company.js`'s `COMPANY_TIERS`, and they are found **by
name** rather than by index so an inserted tier cannot silently re-point them.

```
1  SOLE TRADER      0 fleet gross · cap 1
2  TWO-HANDED      18,000 · cap 2
3  LANE HOUSE      60,000 · cap 3 · opens LANE MARSHAL
4  SPIRE CONTRACT 165,000 · cap 4 · opens SPIRE HAULIER
```

**`courierRank(tier)` with one argument is byte-for-byte the pre-S2-I function**, which is why
`gates_s2d` A1's `courierRank(99) === 'HAULMASTER'` is still true and still worth having. The
company rungs are reached only through a second argument that only a caller holding a company can
supply. `rankState` returns an `axis` field (`'lifetime'` | `'fleet'`) so a surface never has to
guess which quantity the number under it is, and the RECORD tab's header changes with it —
`gates_s2i` F1 asserts the header says FLEET GROSS when the axis is fleet.

---

## Switching to their vehicle view

`rig.setFlight(driver.flight)`. **No third rig was built** — a driver is a craft with a `Courier` at
the stick, so `js/camera.js`'s cockpit and chase already describe every viewpoint the feed needs,
boom collision included. D2 measures both arms on a driver: cockpit puts the camera **1.02 m** from
the hull, chase **10.43 m** out on the boom.

D1 asserts the switch by **identity** (`rig.flight === driver.flight`), never by the label the panel
is showing — S2-H's capture tool aimed every camera 180° away from its subject and produced four
districts of frames that read exactly like a dead feature. It also measures the camera **distance**:
during the feed the camera sits **0.49 m from the driver and 726 m from the player's own pad**, which
is what stops `onDriver: true` being a flag nobody moved a camera for. Both the before and after
arms are negative controls.

While the feed is up:

- **the cabin dash is off** and so is the chase HUD. Every instrument on them reads the player's own
  craft — speed, altitude, cell, job, the warmth gauge — and none of them describe what is on screen.
  A dashboard showing the wrong craft's numbers is worse than no dashboard.
- **the dock board is STOWED, not closed.** The feed is reached from inside it, so watching a driver
  from behind it would be watching a job list; closing it instead would throw away the pad, the job
  list and the scroll position and drop the player into the air on undock.
- `#feed` carries that driver's telemetry in Aaron's HUD idiom, with NEXT DRIVER and LEAVE FEED.

**The feed is offered from a pad only.** Watching a driver moves the camera — and with it the city
streamer — kilometres from the player's own hull. Docked that is free; airborne it is flying blind.
`paintFleet` leaves the feed the moment `dockPad` clears, so the state cannot be reached sideways.

---

## The screens build nothing new

`CabinPanel` is the shell and `screen()`, `readout()`, `meter()`, `el()`, `crd()`, `mmss()` are
S2-D's primitives, now **exported** from `js/ui.js` — its own header promised that *"a company
earnings screen in pass 2-B calls `screen(…)` and inherits the frame, the brackets and the ident"*.
They were `const`s only because nothing outside that file existed yet.

**EARNINGS is the one Aaron's note is really about**, and its rule is *show the arithmetic, not just
a total*: every line that goes into the net is on screen with its own sign and a per-minute column
beside it. E1 parses those terms **out of the DOM** and asserts they sum to the NET the screen
prints — a screen whose total does not equal its own workings is lying, and it is the one failure
this tab can have that a screenshot would not reveal. The tolerance is the line count, because every
line is printed through `crd()`, which rounds; it is stated rather than widened until it passed.

The FLEET key on the dock is a **`.dk-key`, never a `.dk-tab`** — `gates_wire` presses `.dk-tab`
index 2 and requires the SHOP, and `gates_s2d` B6 asserts RECORD is the last `.dk-tab`. Adding a
fifth member to that collection broke the second of those on S2-E's first run.

---

## Findings worth keeping

1. **`shot.mjs`'s `cleanup()` kills every Chrome this node process opened.** It pkills on
   `/tmp/neonhaul-cdp-<NODE PID>`, which every session in one script shares — so closing a second
   browser kills the first one's Chrome too, and the next `evalJSON` on it **hangs forever** on a
   dead socket with no timeout. That cost a 25-minute stall that read exactly like a slow gate.
   E4's negative-control session now runs **after** the main `close()`. Any suite that wants two
   pages has this trap.
2. **A derived quantity taken from the uncorrected source.** The first calibrated sweep printed a
   calibrated `gross` column and computed `net` from the **raw** `r.crdPerMin` beside it, so the
   same pairing read 30 % margin in the solver and 57 % in the table. Fixed, and the comment in
   `sim_s2i.mjs` says why.
3. **A geometry check over an empty screen.** E3's first run reported "3 pressable keys" because C2
   had released the whole roster to measure draw calls, so the ROSTER tab had nothing on it. It now
   asserts the roster is non-empty and prints the row count.
4. **A short window over-states a fleet badly.** A 2.88-minute reading gave 1,015 CRD/min for two
   drivers; the same pair over 9 minutes gave 548. Drivers start on full cells at the dense hub, and
   the rate declines for minutes afterwards — it was still falling at 9 minutes (1,595 → 1,458).
5. `gates_s2i`'s `advance()` exists because `settle()` counts **frames** and gives up after 25 s of
   wall time: asking it for 3,600 frames returned `-1` and advanced 26 sim seconds against the 60
   asked for. A window that silently comes back short is a measurement of a smaller window.
6. **The draw-call check was differencing a number with a noisy term in it — and then the fix for
   that broke the other half.** `craftBody` counts the player, the traffic AND the fleet, and the
   traffic population churns by about the size of the +1 the check is about: one landscape run read
   31 / 30 / 30 and passed, the next read 31 / 31 / 31 and failed. Turning the traffic off fixed the
   instance count and immediately made the DRAWS read `4 → 0`, because **a field draws once if it
   holds any instance and not at all if it is empty** — so with nothing else in the scene the
   baseline is an empty field and "the fleet costs 4 draws" is the fields going away. C2 now has two
   arms: **draws with traffic ON** (the shipping case, where the comparison is real) and
   **instances with traffic OFF** (where the noise is). **A check whose effect is the same size as
   its noise is a coin toss with a name on it, and the isolation that removes the noise can remove
   the baseline with it.**
7. **`gates_s2e --land` died mid-suite with `timed out waiting for window.__ready` at check 25 of
   30, writing a file that says `25/25`.** It re-ran clean at 30/30 with nothing changed. That suite
   opens a session per group, and the profile dir is torn down and recreated between them — see
   finding 1. **`25/25` is the shape of a partial run, not of a pass**: read `total` against what the
   suite declares, never the ratio.

---

## Cost

**Zero extra draw calls.** Driver craft are written into the same four instanced fields the player,
the traffic and S2-E's cutscene already write into — C2 measures **4 draws with the fleet on screen
and 4 with the roster released, against craftBody instances 31 → 30.** The instance count moving is
what stops "same draws" being a measurement of nothing.

Per frame a driver costs one `Flight.update` (one `aabbsNear`, arithmetic), one `Courier.read`, and
a decision step only on arrival. The cap is 4.

**Measured, three alternating arms at 844×390: four drivers cost +0.025 ms of frame time against a
worst within-arm spread of 1.304 ms.** So it is *below a ±1.3 ms noise floor on this machine* —
**not "free"**, and the honest form of that sentence matters here.

`CLAUDE.md` warns that `budget.mjs`'s milliseconds are CPU wall time around the loop body and say
nothing about a phone's fragment throughput. **That warning does not weaken this number, it is what
makes it the right one**: a fleet costs four `Flight.update`s, four `Courier.read`s and four
`aabbsNear` queries, and adds **no fill at all**. CPU is exactly what it spends. This is the first
measurement in the project where that instrument is pointed at something it can actually see.

---

## Verified

`gates_s2i` **18/18 portrait and 18/18 landscape**, and the landscape suite was run twice after its
last change because the check that failed on it is the one whose noise was the size of its effect.

Every suite this phase could reach, green on disk, none failing:

| | | | |
|---|---|---|---|
| `determinism` **9/9** — golden `f29beaf9`, 25,039 buildings, `git diff` clean on `city_golden.json` | `wire` 11/11 (full W1–W11) | `s2a` 13/13 ×2 | `s2c` 17/17 |
| `s2d` 14/14 ×2 | `s2e` 30/30 ×2 | `s2f` 11/11 ×2 | `s2g` 9/9 |
| `s2h` 14/14 HIGH **and** 14/14 LOW, both `--falsify` | `p5` 16/16 | `p6` 19/19 | `p7a` **30/30** and `p7b` **20/20**, both `--falsify` totals |
| `p8` 32/32 | `budget --headed` green on both presets — worst 58 draws / 180 k tris / 7.90 ms on `auto` | | |

Every suite that renders the dock (`s2a`, `s2d`, `s2e`, `s2f`, `p7b`, `wire`, `s2i`) was re-run
**after** the last change to `js/ui.js`, so nothing above is claimed on a mixed tree.

**Looked at with my own eyes**, portrait and landscape: `roster_*`, `recruit_*`, `earnings_*`,
`feed_cockpit_*`, `feed_chase_*`, `feed_left_*`, `record_company_*` in `shots/s2i/`. Four defects
came out of that and out of nothing else:

1. The FLEET panel and S2-E's HIRE panel **stacked** — both are `.cabin-layer`s at z 40 and a
   grounded player is exactly the player with both to open. Each now puts the other down.
2. The driver feed opened **behind the hire panel**, so the first frame of act two's feed was a
   picture of the hire screen.
3. The flight consoles stayed up over the feed. Every key on them acts on the player's own craft,
   parked three kilometres behind the camera — AUTO and HOME engage their autopilot, HIRE opens
   their hire panel. Hidden now; `#btn-view` and the cog stay, because switching between the
   driver's cockpit and their chase boom is the one control the feed wants.
4. **The rank rail said HAULMASTER while the ladder six centimetres below it said SPIRE HAULIER** —
   one screen disagreeing with itself about the player's own rank, because `_rankRail` was still
   calling `rankState` without the company.

And two in the capture tool: it named a file `feed_chase` for a shot taken from inside the cockpit
(the default view is cockpit — `save.js`), which is a picture with no craft in it filed under the
name of the picture with the craft in it; and `settle(S, 900)` returned after 25 s, so the "roster
with real numbers on it" was a roster with four zeros.

---

## Left undone

- **Nobody has flown this on a phone**, and nobody has hired a driver by hand.
- The ACE/SEASONED inversion above. Flagged, not tuned.
- A driver that can find no pad within 3 km goes `idle` and sits there **still drawing wages**. It
  is a legitimate failure mode and it is visible on the roster, but nothing recovers from it.
- Drivers do not appear on the minimap. `fleet.live[].flight` has the positions.
- The roster's VIEW key is disabled away from a pad and says so, but there is no way to watch a
  driver while flying. That is a deliberate call (see above) and it is the obvious next request.
- `company.gross` is the only axis the ladder reads. A company that loses money forever still
  climbs it — deliberate, because a ladder that walks back down is a ladder nobody trusts, but it
  means the top two licence rungs can be reached by an unprofitable fleet.
- The `?fleet=n` flag winds `company.gross` on to allow the cap it was asked for. It says so, and it
  hires through the shipped transaction, but any measurement that reads absolute `gross` rather than
  a delta is reading the fixture.
