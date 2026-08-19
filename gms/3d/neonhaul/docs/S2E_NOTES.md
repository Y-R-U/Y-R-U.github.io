# S2-E — the story, the debt arc and the hire loop

Built in the order the brief specified, because each piece depends on the one before it: the debt
state machine and its pace signal → the warmth gauge → both act-one endings → the hire loop → the
intro cutscene → the voice.

---

## 1. The debt state machine and the pace signal — `js/story.js`

Pure, like `economy.js` and `ranks.js`: no three.js, no DOM, no `Date.now()`. Every clock is a sim
time in seconds passed as an argument, which is what lets `tools/sim_s2e.mjs` run the whole arc in
node.

**$50,000. No day counter, no visible clock, and no countdown anywhere in the UI.** The Boss never
names a number. Pressure is four escalating messages keyed on **pace**, not on elapsed time.

```
projection = credits + (trailing earning rate x time remaining)
ratio      = projection / DEBT
warmth     = 1 at ratio <= 0.75  ·  0.5 at ratio 1.00  ·  0 at ratio >= 1.25
```

The trailing rate is an EWMA over 300 s, **seeded at exactly `DEBT / WINDOW`**, so a fresh profile
opens with the needle at half scale and it stays there while the player earns precisely the rate the
debt requires. That is the property a countdown cannot have, and `gates_s2e` A2 measures it against
a countdown control: on-pace warmth at 5 / 40 / 80 minutes reads **0.5000 / 0.5000 / 0.5000**, where
a timer over the same three marks reads 0.06 / 0.48 / 0.95.

**Progress is `credits`, never `lifetime`.** The crew take what is in the account, so spending is a
real risk — and on the borrowed hull it is a trap, which the sweep measured rather than asserted.

### The window: 84 minutes of play, SWEPT

`node tools/sim_s2e.mjs --seeds=12`, output committed at `docs/s2e_balance.json`. 12 world seeds ×
5 pilot classes through the real economy and the real mission generator in a borrowed `kestrel`;
the recorded quantity is the first moment each career's **liquid** balance reaches 50,000.

| pilot | CRD/min | payAt p10/p50/p90 (min) | | window | focused | normal | casual | invest | dawdle |
|---|---|---|---|---|---|---|---|---|---|
| focused | 737.9 | 61.4 / 69.4 / 73.7 | | 72 m | 75.0 | 83.3 | 0.0 | 100.0 | 0.0 |
| normal | 733.3 | 67.3 / 69.9 / 72.1 | | 76 m | 91.7 | 100.0 | 0.0 | 100.0 | 0.0 |
| casual | 595.3 | 81.9 / 85.0 / 90.4 | | **84 m** | **91.7** | **100.0** | **33.3** | **100.0** | **0.0** |
| invest | 952.0 | 62.6 / 64.6 / 65.8 | | 88 m | 100.0 | 100.0 | 66.7 | 100.0 | 0.0 |
| dawdle | 490.0 | 106.1 / 109.6 / 112.8 | | 108 m | 100.0 | 100.0 | 100.0 | 100.0 | 41.7 |

84 minutes is the row where the brief's target distribution holds: a focused player who routes well
keeps the car on most runs, a dawdler loses it on every one, and the swing class is a one-in-three
coin flip.

**`kestrel`, not `nocturne`.** The same sweep run on a borrowed nocturne gives focused/normal 100 %
at every window from 68 minutes and the `invest` pilot **0 % at every window** — upgrades priced off
a 20,000 list never earn back inside act one. The kestrel version is the tenser game and the one
where investing in the borrowed car is a real decision rather than a guaranteed loss.

**Stated limitation, and then measured.** `sim_p7a`'s flight model prices a leg as distance over
cruise speed and cannot see a wall, so every figure above should be an **upper** bound on a real
pilot. `tools/courier_rate.mjs` (new) closes that by flying `?courier=1` — the real flight model,
real collision, the real 0.6 s docking hold, real boards — and measuring gross per SIM minute:

| | |
|---|---|
| 9.03 sim min · 12 deliveries · tier 2 · 0 tows | |
| **real game** | **737.3 CRD/min gross · 742.7 bankable** |
| sim_s2e's `normal` pilot | 733.3 CRD/min |
| optimism ratio | **0.995 — the analytic model is not optimistic at all** |
| projected time to hold 50,000 at that rate | **67.3 min**, against a shipped window of **84** |

So the window is real rather than an artefact of the harness. Two honest caveats: `?courier=1` is a
machine flying the nearest-job policy with no dwell for reading a panel, so it sits between the
`focused` and `normal` pilots and NOT at the casual end; and nine minutes at tier 1–2 does not see
the later, better-paying tiers in either direction. The 17 minutes of slack it leaves is the
focused player's margin, which is exactly what the sweep predicted (`focused` 91.7 % at 84 min).
`Story.WINDOW_S` is one constant to move if Aaron reports it as unwinnable rather than tense.

### The Boss's escalation

`b1` at warmth 0.55 → `b2` 0.70 → `b3` 0.84 → `b4` 0.94, ratcheting, once each, in order, with a
105 s hold and a 150 s floor before the first. A fifth line fires once when the account first covers
the debt, and it is the line that tells the player to stop spending. They arrive as chatter tagged
`alert` — the S2 A↔B contract's "addressed to the player and actionable" tier — plus a toast.

---

## 2. The warmth gauge

S2-A left a **42 × 42 bay beside the cell ring** and `dashSlots()` named it `warmth`. It is fitted.

Drawn as a **temperature gauge** — bulb, bent capillary, rising column, graduations, needle — and
not as a fifth ring, because the dash already carries a swept arc, a segmented ring, a linear tape
and outlined pips and a fifth circular fill would have collapsed into the cell ring beside it. The
legend is one of five words: `AHEAD · PACE · BEHIND · HOT · CLEAR`, plus `DUE`. **There is no time
on it anywhere.**

The chase view gets the same signal in its own idiom: a horizontal neon bar with the break-even mark
printed **on** it, so the actionable fact is which side of the pace you are on rather than how full a
bar is. Both disappear entirely in act two.

**The needle is filtered and `__state` is not.** Earnings arrive in ~800 CRD lumps every 60–90 s, so
the raw signal sawtooths by about a tenth of full scale between deliveries — a real property of the
estimator, not noise. The display is low-passed with an 8 s constant (a temperature gauge having
thermal mass is the one kind of smoothing that is diegetically honest). `__state.story.warmth` is
raw and `__state.story.shown` is the needle, so no gate can accidentally measure the filter.

---

## 3. Both endings of act one

**Both lose the car.** They differ in starting capital and in what is on the record.

| | paid | seized |
|---|---|---|
| credits | everything above 50,000 | 90 |
| flags | `debt_cleared` `dad_favour` | `car_seized` `crew_hook` |
| standing at 20,000 net worth | 6 SHAREHOLDER | 3 TENANT (4 CARDHOLDER with no flags) |
| the lot | market rates | one wreck at 90 CRD |

`STANDING_FLAGS` in `js/ranks.js` is filled: `debt_cleared` +1, `dad_favour` +1, `car_seized` −1,
`crew_hook` **0**. The zero is a real answer — the crew's hook is worth nothing to the legitimate
city and it is there so the shady ladder in pass 2-B has a flag to open on. `intro_seen` is
deliberately **not** in the registry: a flag that is a plot bookmark and nothing else does not belong
on an axis that hands out rungs.

**The seizure fires at a dock and nowhere else.** `settleDebt()` has exactly one call site, inside
`doDock()`. `gates_s2e` C1 flies 120 frames with `due` true and asserts the stage and the balance do
not move, then docks once and asserts they do. Breaking that — moving the call into `tickStory` —
makes C1 fail for both branches, which was confirmed by doing it.

**No fail state.** Grounded blocks UNDOCK, but the UNDOCK button opens the hire panel instead of
refusing, because a button that does nothing is a bug report and a button that opens the one screen
that fixes the situation is an affordance.

---

## 4. The hire loop

5-minute blocks (Aaron's number). **The price was swept, and the brief's own arithmetic for it was
wrong by about a factor of four** — worth recording, because the wrong figure is what the "$90 buys
five minutes" proposal was built on.

The addendum estimates *"~2,000 CRD in a deliberately slow clunker"* over twenty minutes. Measured
over 72 non-overlapping five-minute windows per pilot class flown in a `wisp`:

| pilot | block gross p10 / p50 / p90 | first block p10 / p50 |
|---|---|---|
| focused | 3359 / 4112 / 4925 | 3983 / 4212 |
| normal | 2923 / 3532 / 4124 | 3691 / 3825 |
| casual | 2442 / 2950 / 3474 | 2839 / 3110 |
| dawdle | 1886 / 2282 / 2643 | 2302 / 2530 |

A five-minute block in the free starter hull is worth ~3,500 CRD to a normal pilot, not ~500. So
**$90 is not 2–4 % of a block, it is 0.6 %**, and it cannot be a market price at any block length.
The addendum's two ways out are therefore not alternatives — the answer is both:

- **Market rate: 1,425 CRD / 5 min**, swept. Burn against the median block: focused 34.7 %, normal
  40.3 %, casual 48.3 %, dawdle 62.4 %. Blocks not covered: **0 % for every class**. That is the
  30–50 % target with the dawdler having teeth and nobody priced out.
- **$90 is a one-off story price** — a wreck nobody else wants, granted once at the seizure, one
  block, no extensions.

Better hulls scale as `1425 × (1 + 0.35 × (list/2000 − 1))`: kestrel 1425, lance 2050, drayman 3170,
nocturne 5915, mammoth 11900. So the big hull for one job you cannot otherwise carry is winnable and
holding it all session is not. Discounts for committing: −4 % at 2 blocks, −10 % at 4, −17 % at 8,
−21 % at 12.

**Extending happens from inside the cabin.** `#btn-hire` — S2-A's reserved slot — un-hides the
moment there is a hire on the meter, and opens the same `HirePanel` the dock's HIRE key opens.
Extending **adds** a block to what is left rather than restarting it.

**A lapsed hire limps** at §7.4.3's 12 m/s tow speed rather than stranding anybody, and extending
from the cabin restores the hull. Measured: 62 → 12 → 62 m/s on the same hull.

**Hiring is available early**, not only after the seizure: any licensed hull, any time, from a dock.
A hire sets `econ.borrowed`, so `ranks.assetValue()` returns 0 and renting never pays net worth —
without it, hiring a nocturne would have credited the player 11,000 CRD of somebody else's vehicle.

---

## 5. The intro cutscene

Six beats on a sim clock, so a slow phone sees the same scene as a fast one and a gate can step it
deterministically: `park → name → pullout → boss → leave → close`.

- The parked craft, **docking cylinder dimmed to 0.03** (cylinder 0.55 → 0.0165, ring 0.9 → 0.027,
  glyphs 0.85 → 0.0255, restored exactly on exit). 0.03 and not 0.06 because the pull-out ends
  *outside* the cylinder and `zones.js` only skips the near wall when the camera is inside one — so
  from out there both walls draw and an additive material contributes twice.
- A neon line grows out of the hull into the name / gender panel. Auto-name offered, three gender
  buttons, CONFIRM and SKIP.
- The camera pulls out over 3.4 s and six crew hulls settle in around the player.
- The Boss talks; the player's three interjections appear **beside** his line rather than instead of
  it, and his next line starts while theirs is still on screen. That is the difference between being
  interrupted and being talked over, and it is why `cut` bubbles live 2.4 s against a 1.0 s hold.
- The crew accelerate away and the player's closing monologue lands, verbatim from Aaron's spec.

**Zero extra draw calls.** The seven hulls are written into the same four instanced craft fields
everything else in the game uses: 49 draws with the scene parked, 50 with all seven in frame.

Speech is DOM + SVG anchored to **world points** and re-projected every frame, because Aaron's spec
is a line extending from a craft into a rectangle, and because the text has to be crisp at any dpr
and reflow on a 390 px phone.

**The cutscene does not run for a harness.** `?nosave`, `?auto`, `?courier`, `?shot` and `?nohud`
silently complete it through the same `beginDebt()` the CONFIRM button calls, so eleven gate suites
do not boot behind a speech bubble and there is no state reachable only one way. `?intro=1` forces
it, `?intro=0` skips it.

---

## 6. The voice

`tools/vo/gen_story.py` — `say` → a **room** treatment, deliberately **not** `tools/radio_fx.sh`.
The Boss is in the room, not on a radio, and a band-limited Boss sounds like dispatch.

| | gen_chatter.py | gen_story.py |
|---|---|---|
| band | 300–3400 Hz | full |
| character | hiss bed, squelch head/tail | 34 ms room reflection, gentle 4:1 |
| loudness | as recorded | EBU R128 −16 LUFS / −1.5 dBTP |
| encode | 16 kHz 16 kbps | 22 kHz 48 kbps |

19 clips, 497 KB, mean 26 KB: **7 Boss takes (gender-invariant, generated once)** and 4 player lines
× 3 takes (young male, young female, neutral). A session fetches 11 of them, because
`StoryVoice.preload(gender)` asks for the Boss plus one gender. Playback goes through the **sfx**
bus with squelch off — `radio.js` is not involved at any point.

Measured: −15.4 to −18.4 dBFS mean, peaks −1.0 to −5.3, no clipping. The first pass shipped at
−35 dBFS / −17 peak, 17 dB under the radio it is supposed to be interrupting; `loudnorm` fixed it.

SUNO prompts for all seven Boss lines, the four escalation messages and the three monologue takes
are in `docs/SUNO.md` §6, with the drop-in rule (same filename, adjust `hold` in `storyui.js` if the
take is longer) and an explicit instruction **not** to run them through the radio chain.

### A verifier that flattered itself

The first `--falsify` "proved" the energy check by pushing silence through the chain and watching it
be rejected. It *was* rejected — by the **clipping** check, because `loudnorm` had amplified the
noise floor to −6.4 dBFS. The energy check could not see silence at all and would have passed a
silent take. Silence is now caught by `check_raw()` **before** the treatment, where it is still
silent (−200 dBFS against a −55 floor and a measured −23.7 for a real take), and `--falsify` now
asserts *both* that `check_raw` rejects it and that the post-chain check **cannot** — so nobody
deletes `check_raw` believing the downstream one covers it.

---

## Gates

`tools/gates_s2e.mjs` — **30/30 portrait, 30/30 landscape**, read off disk after the process exited.
Writes both JSON schemas.

Regression suites, all read from `shots/*/\_gates.json` after their processes were confirmed gone:

| suite | result |
|---|---|
| `gates_s2e` | 30/30 portrait · 30/30 landscape |
| `gates_s2a` | 13/13 portrait · 13/13 landscape |
| `gates_s2d` | 14/14 portrait · **13/14 landscape** (B7, proven not S2-E's — see below) |
| `gates_wire` | 11/11 |
| `gates_p7a` | 24/24 (the suite declares 24; see the note below) |
| `gates_p7b` | 14/14 (the suite declares 14) |
| `tools/vo/gen_story.py` | 19/19 clips · `--falsify` green |

Two of the load-bearing checks were proved able to fail by breaking what they guard:

| break | caught by |
|---|---|
| `Story.credit()` removed from the payment path | F1 — "story.earned 0 → 0 while credits moved 465" |
| `settleDebt()` moved into the per-frame tick | C1 both branches — "settlement on the frame path: YES, WHICH IS THE DEFECT" |

The rest carry their falsifier in the check itself (a control reading, a second sample, or the same
selector reading both ways in one session) and print it in the detail line.

---

## Known issues, logged not fixed

- **Nobody has flown any of this on a phone, or by hand.** The 84-minute window is measured through
  an analytic flight model that cannot see a wall. `tools/courier_rate.mjs` (new) closes half of
  that by flying `?courier=1` — the real flight model, real collision, real docking hold, real
  board — and reporting gross per SIM minute against the sweep's 733.3; see the number recorded
  below. It is still a machine flying, not Aaron.
- **The escalation messages have no audio.** They are text in the ticker. Four SUNO prompts are
  written; the wiring is one line in `bossSays()`.
- **The seizure needs a dock and nothing forces one.** The cell drain makes a dock inevitable in
  practice (you cannot stay airborne indefinitely), but a player who parks on a pad without docking
  never triggers it. Deliberately not engineered around: a forced trigger would be exactly the kind
  of "force-" hedge the brief warns about, and never finishing act one is a choice, not a fail state.
- **`grantCredits` (a test hook) does not feed the pace signal** while the real payment path does.
  That asymmetry is what makes `gates_s2e` B2 able to isolate the display filter, and it is why F1
  tests the real delivery rather than the hook.
- **The dash gauge is 42 × 42 canvas px** and its two labels (`DEBT` above, the state word below)
  sit inside the arc. Legible on a 4× crop of the real render; not yet seen on a phone at dpr 3.
- **Boot died once on a `let` in temporal dead zone**, and it is the third time this file has paid
  for that: `controlHint` was declared beside the intro block and assigned ~250 lines above it, so
  `main.js` threw `Cannot access 'controlHint' before initialization` at module evaluation and
  `window.__ready` never went true. It is declared with the other forward `let`s now. **It also
  contaminated a gate run** — `gates_s2d` was re-running against a half-edited tree at the time and
  reported two timeouts that were mine, not its. Do not edit `js/` while a suite is in flight.
- **`gates_s2d` B7 fails in LANDSCAPE and it is not S2-E's.** The dock board's first ACCEPT lands at
  y 362–400 against a 390 px frame: `.dk-body` is a grid row of 242 px holding 441 px of job cards
  with no `overflow`, so the cards spill over the UNDOCK bar. Proved not to be S2-E's by two
  reverts, each re-run in full: hiding the new HIRE key entirely, and putting `save.js` back to
  `wisp` / `borrowed: false`. All three configurations report **byte-identical** geometry
  (`first ACCEPT [54,362,227,38]`). Left alone deliberately — `js/ui.js`'s dock layout is S2-D's
  surface and the fix is a one-line `overflow-y` on a row I did not design. **Portrait is 14/14.**
- **`gates_p7a` declares 24 checks and `gates_p7b` declares 14**, and both files are older than
  S2-D. `CLAUDE.md` and the S2 brief record them as 30/30 and 20/20. Those numbers do not match the
  suites on disk; the suites pass completely (24/24, 14/14, 0 failures, exit 0) but the recorded
  green is wrong and should be corrected rather than carried forward.
