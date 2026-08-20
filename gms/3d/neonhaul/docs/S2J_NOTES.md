# S2-J — companies, and the shady branch

Aaron's brief: *"at some point you would need to start a company for your employees to work under
etc. I am thinking you may be able to work different sides - e.g. the default side is legit/a
transport business, but a shady business option may open up performing dodgy trades - it may be a
tab to switch between them, at some point it won't be just a single company - you may own multiple,
so the layout for all these things will have to look good, it should all look futuristic."*

Four things, and none of them is a new module. **S2-I built the company; this phase wraps a
registry, a second side and a door around it.**

| | |
|---|---|
| `js/company.js` | extended. The registry (`newGroup`, `foundCompany`), the off-book branch (`EXPOSURE`, the run resolution inside `creditDelivery`, `playerRun`), and a group save with a v1 migration. Still PURE and node-runnable. |
| `js/ranks.js` | `SHADY_TIERS` + `shadyState` — Aaron's six names with thresholds — and one new `STANDING_FLAGS` entry. |
| `js/story.js` | the two doors: `REMARKS`, `nextRemark`/`hearRemark`, `askDad`, `shadyDoor`. |
| `js/companyui.js` | the group chip strip, the FOUND screen, the branch tabs, and three off-book screens. Built entirely from S2-D's primitives. |
| `js/ui.js` | the RECORD tab's other side: sealed → a live thread → a real ladder. |
| `js/storyui.js` | `ThreadPanel` — four lines and a key. |
| `tools/sim_s2j.mjs` · `tools/gates_s2j.mjs` · `tools/cap_s2j.mjs` | the sweep (two experiments, nine properties), 17 checks x 2 orientations, and the capture pass. |

---

## THE ONE THING THIS PHASE HAD TO GET RIGHT

The brief: *"A shady trade must be a real trade-off, not a better payout. If the dodgy option
simply pays more, nobody will ever run the legit side and half the game dies."*

An off-book delivery pays **1.70×** what the same parcel pays on the books. It buys that with five
costs, and every one of them is a number on the screen:

1. **THE FILE.** Each run adds to the charter's exposure. It decays exponentially (900 s), so one
   driver running is a steady state and four is saturation.
2. **LEGIT PAY.** Above 0.20 the charter's ORDINARY deliveries pay less, down to 0.55× at the top.
   This is the term that makes it hurt a *fleet*: it lands on drivers who never went near a run.
3. **WAGES.** The whole payroll costs up to 1.30×. Charged on the drivers who are not running.
4. **SEIZURES.** `0.04 + 0.26 × exposure` per run. A seizure pays nothing, fines 2.5× the load, and
   adds exposure on top. At 1.0 the charter is **suspended for four minutes** — it earns nothing at
   all, legit or otherwise, and the payroll keeps running.
5. **THE CHARTER LADDER.** Off-book gross does **not** touch `company.gross`. That is the axis the
   driver cap sits on and the axis `LANE MARSHAL` and `SPIRE HAULIER` open on. A run is a hull you
   are not buying yet.

### Swept, not picked — `node tools/sim_s2j.mjs`, committed at `docs/s2j_balance.json`

Twelve worlds × 90 minutes, seven policies, **all of it through the shipped `js/company.js` on a
real one-second clock** with the delivery logs `sim_p7a.runCareer` actually produced. Nothing here
is an equation about a delivery; `payWages` runs every second and `creditDelivery` runs at every
receipt, exactly as the frame loop calls them.

| policy | net CRD/min p50 | charter gross | off-book gross | seizures | suspensions | fines |
|---|---|---|---|---|---|---|
| `clean` | 264.3 | 168 088 | 0 | 0 | 0 | 0 |
| **`one_off`** | **472.5** | 100 274 | 103 190 | 0.1 | 0 | 14 966 |
| `two_off` | 47.0 | 52 945 | 153 057 | 0.2 | 0 | 45 187 |
| `all_off` | **−635.8** | **0** | 206 472 | 0.2 | **2** | 92 063 |
| `burst` | 420.9 | 113 065 | 83 287 | 0.1 | 0 | 13 627 |
| `shell` | 346.7 | 101 263 | 97 571 | 0.1 | 0 | 20 737 |
| `shell2` | 278.6 | 60 878 | 163 705 | 0.1 | 0 | 29 816 |

**That inverted U is the design.** One driver running is the sweet spot, two is roughly break-even,
and running everybody is ruinous — `all_off` suspends its charter twice in ninety minutes and pays
92,063 CRD of fines to do it, for a charter gross of **zero**.

`HEAT.PAY` (now `EXPOSURE.PAY`) was chosen against exactly that curve and not before it: at **1.9**
`one_off` came out **2.5× clean**, which is not a decision; at **1.5** the branch was not worth the
seizure risk at all. **1.70** is where the curve has a peak the player can miss.

### The second experiment, and why it is a second experiment

Experiment 1 hands every arm a fixed four-driver fleet on a top-tier charter, which is a fixture and
is said out loud in the file. What that fixture cannot see is the largest cost the branch has: **the
driver cap is a company tier, company tiers are reached on charter gross, and a charter running off
the books never grows.**

So `ladderSweep()` starts every arm at SOLE TRADER with 20,000 CRD and nothing wound on, and hires
the moment the shipped `driverCap()` allows and the shipped `signingFee()` is affordable:

| arm | net/min | drivers hired | charter tier | charter gross | off-book gross |
|---|---|---|---|---|---|
| `clean` | 143.1 | 3 | 3 | 112 075 | 0 |
| `last_off` | 300.5 | 3 | 3 | 72 564 | 49 170 |
| `first_off` | 359.4 | **1** | **1** | **0** | 103 190 |
| `shell` | 252.6 | **4** | 3 | 112 075 | 62 323 |

`first_off` — the naive "it just pays more" policy — earns the most per minute and ends the hour
**with one driver on a tier-1 charter, forever.** It has frozen its own fleet.

**The first version of this sweep folded the two experiments together and produced three
byte-identical rows**: with staged hiring, `one_off`, `two_off` and `all_off` were the same run,
because the first off-book hire froze the cap at one and no second driver was ever hired in any of
them. A table with three identical rows in it is not a measurement of the thing that made them
identical.

### Why you would own more than one company, in a number

`shell` ends the hour with **four drivers across two charters** against `clean`'s three across one,
and its legit charter still reaches tier 3 **with an empty file**. That is the positive reason for
`GROUP_MAX`, and it is not a rule anybody wrote: a shell charter can never hold more than one
driver, because the cap is a company tier, tiers are reached on charter gross, and a run produces
none. **Laundering is capped at one hull per registration.**

### The number this sweep refused to bank

The first version of check 6 asserted that the shell's *operating net* beat `one_off`'s. It does
not, and the reason is instructive. At one runner the exposure saving is worth a few per cent, while
the seizure sequence — deterministic per charter seed, and it **feeds back**, because a seizure adds
exposure which raises the next seizure's chance — swings the arm by hundreds of CRD/min. Measured at
8 worlds × 60 min: the shell came out **121 CRD/min BELOW** `one_off` against a p10–p90 spread of
**375 on the same arm.**

A difference smaller than its own noise. So the check is the MECHANISM instead, which has no dice in
it: under a shell the legit charter loses **0** to `legitMult` and its payroll carries no premium;
under `one_off`, running the *same driver* (roster slot 0, and getting that wrong the first time is
recorded below), it loses both. The net difference is printed and explicitly not banked.

**A confound that read exactly like a result:** the first `shell` arm put the GREEN driver on the
shell and `one_off` put the SEASONED one off-book, so "the shell earns a third of what one_off
earns" was a statement about which driver was flying.

---

## Founding a company

`newCompany()` gained a name, a registration time and a fee; `newGroup()` holds up to three of them
and which one the screens are showing. **A driver cannot be on your books until there are books** —
with an empty registry the FOUND screen *is* the panel, the ROSTER and RECRUIT tabs render nothing
even when explicitly asked for, and `__game.hireGrade()` returns `null`.

- **3,000 CRD** for the first charter, **×2.4 per charter** after it (7,200, then 17,280).
- The name is **offered, not imposed** — a field with a seeded suggestion as its placeholder and a
  SUGGEST key, which is the same idiom and the same markup S2-E's intro uses for the player's name.
  Never a `prompt()`.
- A duplicate name is refused; `GROUP_MAX` is refused; an unaffordable fee is refused. All four
  refusals are `{ok:false, why}` in the shape `economy.js` already uses, so the panel's refusal path
  is the existing greyed key with its reason on it.
- **`GROUP_LIVE` is 6** and it is enforced inside the shipped `hire()`, not in the wiring, so a gate
  hiring through the hook meets it too. S2-I measured four drivers at +0.025 ms against a 1.304 ms
  within-arm spread; six is the same statement with a margin on it, but it is a ceiling that exists
  rather than one that was assumed away.

**Dissolving a charter is deliberately absent.** A charter with a file on it is a consequence, and
letting the player delete the consequence for a fee would turn the whole branch into a toll.

---

## The two doors — settled design, built as specified

### Seized — immediate
`story.branch === 'seized'` ⟶ `shadyDoor()` returns `'seized'` on the first frame of act two. The
crew already have a hook in you; the relationship *is* the debt you could not pay.

### Paid off — delayed, and earned by curiosity
Four remarks about the player's father are seeded **in ordinary content**:

| slot | speaker | tag |
|---|---|---|
| `life_36` | OPEN CHANNEL | `bg` |
| `pirate_16` | THE UNDERSTACK | `bg` |
| `life_37` | OPEN CHANNEL | `bg` |
| `life_38` | OPEN CHANNEL | `bg` |

They are **real clips**, added to `tools/vo/lines.json` and generated by the same
`gen_chatter.py` → `radio_fx.sh` chain as the other 203 — same voices, same 300–3400 Hz band-limit,
same squelch, same 16 kbps mono. The pool went **203 → 207 slots, 2,283 → 2,333 KB**. Nothing marks
them and the director never draws them on its own: `js/story.js` asks for one by name through a new
`radio.speak(slot, …)`, which goes through the existing `fire()` and therefore inherits the property
that matters — **the popup never waits on the network.**

They fire on DELIVERIES, not on a timer, at 50 % after a 200-second gap, so they land in the moment
the player is reading a board rather than mid-manoeuvre. After the second one the player's own voice
says one line, and **one row appears on the RECORD tab they already read**: *A NAME KEEPS COMING
UP · 2 TIMES NOW*, with **ASK HIM** under it. Pulling it opens `ThreadPanel`, four lines, and
`DEMAND A NAME` is what opens the branch.

**A player who hears every remark and never presses the key stays sealed.** That is a control arm in
`gates_s2j` A7, not a sentence: `shadyOpen()` is false with all four remarks heard.

### Where the row sits, and why it moves
- **sealed** — last on RECORD, where S2-D put it: a rumour at the bottom of your own record.
- **cue** — **first**. It is the one state with something to do in it, it is easy to miss by design,
  and a key you must scroll past two full ladders to reach is a key most players never reach.
- **open** — last again. It is then simply a third ladder and LICENCE is still what that screen is
  about. `gates_s2i` F1 reads the FIRST `.dk-sect.lad` on that tab and asserts it is the licence
  one — a contract worth keeping, and it is what caught this being got wrong.

---

## `heat` was the wrong word, and a gate said so

The mechanic shipped as `heat` and `gates_p7a` **T14 failed with 47 heat references in code.**

T14 enforces `DECISIONS.md` §6: *"No heat system, no pursuit, no combat, no fail state… Nothing in
the flight model or economy may depend on a heat mechanic."* That decision is about **police
pursuit** — Aaron asked for a relaxed transport game and named police only as a vehicle whose lights
differ — and this mechanic is not that: nothing chases anybody, nothing spawns, nothing stops the
player mid-flight, and there is no fail state anywhere in it. It is an **audit file the patrol keeps
on a company charter**, and the honest fix was to stop borrowing the word.

Renamed throughout to **`exposure`**, with **THE FILE** as its on-screen name. §6's token gate keeps
guarding the thing it was written to guard.

**§6 is still qualified by this phase and the manager should see that in writing:** the branch's
consequence *is* an economy multiplier, which is the letter of "nothing in the economy may depend on
a heat mechanic". It depends on nothing in the flight model, it cannot end a session, and §6's own
last line is *"Revisit only after Aaron has played it"* — he has, and this is what he asked for. It
is recorded here rather than quietly reinterpreted.

---

## The screens build nothing new

`CabinPanel`, `screen()`, `readout()`, `meter()`, `el()`, `crd()`, `mmss()`. S2-I added no primitive
of its own and neither did this. Aaron's complaint that produced S2-D — *"it looks fine if it was a
web form"* — stays answered by there being **one idiom**, not two.

The one new visual idea is that the off-book branch is **darker and warmer** than the haulage side:
the same instruments under a different light, so a screenshot of one is never mistaken for the
other. Everything else is chamfered plates, corner brackets, letterspaced monospace kickers and
segmented meters.

**The tab pattern is the game's own.** Branch tabs (`HAULAGE` | `OFF BOOK`) sit above section tabs,
and the section tabs are `.fl-tab`s — deliberately not `.dk-tab`, because `gates_wire` presses
`.dk-tab` index 2 and requires the SHOP and `gates_s2d` B6 asserts RECORD is the last one. Both are
contracts about that collection.

**n companies, one layout.** A horizontal chip strip: one chip per charter carrying its tier, its
crew count, its net and a file pip, plus a `+ NEW CHARTER` key that disappears at `GROUP_MAX`. It is
present at n = 1 as well, so a player who owns one charter is already using the control they will use
when they own three. A screen that lists n things never has to be redesigned when n changes.

**The OFF BOOK branch has three screens**, each answering the question the one before raises:

- **RUNS** — the file gauge, the four live multipliers, and the switch. Including **the EDGE**: what
  a run is worth against the same parcel on the books *right now, after the seizure risk*. It goes
  below 1.00 on its own as the file thickens, which is the panel telling the player to stop without
  a warning box.
- **EXPOSURE** — the arithmetic, the same rule the EARNINGS tab is built to. Including
  `LEGIT PAY LOST`, which is money the charter's *ordinary* deliveries did not pay. **A cost the
  player cannot see is not a trade-off, it is a tax.**
- **THE ROOM** — SMOKE → EARNER → FIXER → BROKER → QUIET PARTNER → THE HOUSE, on off-book gross
  **across every charter you hold**, because the contact is a relationship with the person: running
  the work through a shell keeps the file off your registration and does not make you a stranger to
  the people paying you.

The player has their own off-book switch, so a player who reaches act two with nothing to hire
anybody with can still take a dodgy trade. Their parcel is already paid at the on-book rate by
`economy.earn` — running off the books does not make you a better courier and `lifetime` must not
move — so `playerRun()` settles only the difference: the bonus on a clean run, the claw-back and the
fine on a seized one.

---

## At exposure zero, this phase does nothing

The load-bearing compatibility claim, and `gates_s2j` A1 is written against it in both directions:
a charter that has never run a job off the books is **exactly** an S2-I company. `wageOf(driver)`
with one argument is byte-for-byte the S2-I function; `legitMult`, `wageExposure` and
`payMultiplier` all return exactly 1; a delivery credits its raw payout and moves `co.gross`.

That is what keeps every S2-I measurement valid rather than merely re-run — the wage table, the
180-second walk-out, the 24-pairing sweep. The falsification is the same predicate on a charter at
exposure 0.80, where it returns false.

---

## Findings worth keeping

1. **A precondition that queries the DOM is not a precondition about what is on screen.** This
   phase's capture tool found the ASK HIM row in the DOM, asserted it, passed, and photographed act
   one's **ending panel covering the entire board**. The check is now a hit-test on the key's own
   centre — `elementFromPoint`, the same test `gates_s2d` B7 uses. It is the twenty-third instance
   of this project's failure mode and the first where the instrument and the picture disagreed.
2. **A backtick inside a template literal ends the template literal.** A comment reading
   ``the chip strip is its own `overflow-x: auto` scroller`` sat inside an `evalJSON` template and
   produced `SyntaxError: missing ) after argument list` 120 lines away. Exactly S2-D's `*/`-inside-
   a-CSS-comment bug in a different language.
3. **A spread that overwrites the field it is spread into.** `shadyState` returned
   `{ at, ...here }`, and the rung row also has an `at` — so the screen captioned itself
   *"45 000 CRD OFF THE BOOKS"* using the threshold it had just crossed rather than what the player
   had earned. Caught by A5 asserting the total.
4. **`&&`-chained shell commands hid a stale log.** `node --check A && node --check B && node gates`
   with the checks failing meant the gate never ran, and the log I read was the **previous run's**.
   Sixteen PASS lines that described a tree that no longer existed. The same shape as reading a gate
   file mid-write.
5. **`find -newermt '-15 minutes'` errors to stderr and exits 0**, so "how many audio files did the
   regeneration touch" answered **0** when the answer was 54. An ISO timestamp answers correctly.
6. **`--only life --only pirate` re-encodes the whole group at the CLI default bitrate.** The four
   new clips went in at 24 kbps and took 54 existing clips with them: 2,283 → 2,673 KB. Re-run with
   `--bitrate 16k` and the pool is 2,333 KB at an 11.3 KB mean, which is S2-B's 11.2 KB.
7. **`write_suno_md.py` without `--intel` rewrites `docs/SUNO.md` and loses the music section and
   every original SUNO prompt** — 68.7 KB → 62.4 KB. Restored from a backup and the four new rows
   patched into the verbatim pool by hand. **Back that file up before regenerating it.**
8. **A control arm that is not controlled.** `gates_s2j` A4's first "cold charter" arm ran 30 runs at
   exposure 0 — except each run *adds* exposure, so it finished at 0.42 and a 15 % seizure rate, and
   read like a broken isolation. It pins the exposure between runs now and says why.
9. **The RECORD tab kept a stale thread.** `setFleet` was called only when the FLEET key's caption
   changed, and a remark landing does not change that caption — so on a board that was already open
   the row never appeared. The change test is a signature over the thread state now. **A stale
   surface that renders perfectly is the hardest kind to notice.**
10. **Panel close order is load-bearing.** The ending panel's GO ON re-opens the hire panel, so
    closing the hire panel first and the ending panel second leaves the hire panel back on top.
11. **A fifth Chrome session in one node process fails to come up**, and the symptom is
    `timed out waiting for window.__ready` — which reads like a boot break in the page and is not
    one. Four sessions per process is the observed ceiling here; `--only=thread` exists for that.

---

## Cost

**Zero extra draw calls and zero extra assets in the render path.** Nothing this phase added draws:
it is DOM screens and arithmetic. `budget.mjs --headed` is green on both presets after it —
worst **58 draws / 180.0 k tris / 6.40 ms** on `auto` HIGH, **44 draws / 71.9 k tris / 6.50 ms** on
`auto` LOW, which is where S2-I left it.

`determinism` **9/9, golden `f29beaf9` / 25,039 buildings unchanged.**

**+50 KB of assets** — the four chatter clips.

`GROUP_LIVE` raises the fleet ceiling from four drivers to six. That is +2 `Flight.update`s, +2
`Courier.read`s and +2 `aabbsNear` queries a frame and **no fill at all**, which is the one case
where `budget.mjs`'s CPU milliseconds are the right instrument — but **six drivers were not measured
in isolation**, only inside a green budget run. Stated rather than claimed.

---

## Verified

`gates_s2j` **17/17 portrait and 17/17 landscape.** The suite declares its own count and writes it
into the JSON, and it exits non-zero on any total that is not 17 — `25/25` is the shape of a partial
run and this file will not produce one silently.

Every suite green on disk, none failing. **Every suite that renders the dock or the company layer
was re-run AFTER the last source edit** (`js/companyui.js`, 16:22) — `s2a`, `s2d`, `s2e`, `s2f`,
`s2i`, `s2j`, `p7b`, `wire`. The rest were run after the substantive rename at 16:01 and reach
nothing this phase changed after it. **`p1a`, `p2`, `p3a`, `p3b`, `p4`, `p11` and the `_low`
variants of `p5`/`p6`/`s2c`/`s2g` were NOT run by this phase** — their files on disk are from
earlier today and are listed here as unchanged, not as re-verified.

| | | | |
|---|---|---|---|
| `determinism` **9/9** — golden `f29beaf9`, 25,039 buildings | `wire` 11/11 | `s2a` 13/13 ×2 | `s2c` 17/17 |
| `s2d` 14/14 ×2 | `s2e` 30/30 ×2 | `s2f` 11/11 ×2 | `s2g` 9/9 |
| `s2h` 14/14 HIGH **and** LOW, both `--falsify` | `s2i` 18/18 ×2 | `s2j` **17/17 ×2** | `p5` 16/16 |
| `p6` 19/19 | `p7a` **30/30** and `p7b` **20/20** (falsify totals) | `p8` 32/32 | `budget --headed` green on both presets |
| `sim_s2j` **9/9 properties** | `sim_s2i` re-run, its four properties still hold | | |

**`gates_s2d` A3 was edited, deliberately, and it is the only gate this phase changed.** It asserts
a COUNT on `STANDING_FLAGS` — `=== 4` — and this phase adds a fifth, `marked`. The count is the
point of the check (it is what makes a flag added without anybody deciding to add it show up), so it
moves when the registry legitimately does; the new entry is named in the detail line.

**Looked at, portrait and landscape**: `found`, `group`, `runs`, `exposure`, `room`, `earnings`,
`roster`, `suspended`, `record_cue`, `thread`, `thread_answer` in `shots/s2j/`. Three defects came
out of the pictures and out of nothing else: the ending panel covering the RECORD tab (finding 1),
three toasts stacking over the company rail in a capture taken a second after an action, and **the
file gauge rendering cyan instead of amber at WATCHED** — a class the JS built as `fl-exposure` and
the stylesheet spelled `fl-file`, which nothing failed on because a wrong colour is not an error.

---

## Left undone

- **Nobody has flown this on a phone, founded a company by hand, or run a delivery off the books by
  hand.** Every band, price and threshold is Mac-measured.
- **Six drivers were never measured in isolation.** `GROUP_LIVE` is 6 on the strength of S2-I's
  four-driver measurement plus a margin, inside a green budget run. It is a reasoned ceiling, not a
  measured one.
- **`one_off` is strong.** At 90 minutes it nets 1.8× `clean`, and the counterweight is the charter
  ladder rather than the credit column — 100,274 charter gross against 168,088, which is the driver
  cap and both reserved licence rungs arriving much later. Experiment 2 shows the extreme version of
  that compounding; the moderate version is not directly measured, and if Aaron finds one dirty
  driver obviously correct in play, `EXPOSURE.PAY` is the single constant to move and the sweep
  re-runs in three seconds.
- **A suspended charter's drivers keep flying and keep earning nothing.** That is the punishment
  working, but nothing tells them to stand down and the wages keep going out. A player who does not
  read the banner will not understand where the money went.
- **The remarks only fire on the PAID branch.** On the seized branch the door is already open and
  the thread would be noise — but it also means three of the four clips are unreachable in that
  playthrough, which is 34 KB nobody hears.
- **The `marked` flag never clears**, by design (the file is the record, not the temperature). It is
  one standing rung, permanently, and no gate measures how that feels over a long career.
- Drivers on a second charter are not distinguishable in the sky or on the minimap; neither were
  drivers at all, per S2-I.
- **The client deal panel still got a skin and not a rebuild** — S2-D's item, still open.
- `?fleet=n`, `?cos=n` and `?expose=` all wind fixtures on and top the account up to do it. They say
  so; any measurement that reads an absolute balance rather than a delta is reading the fixture.
