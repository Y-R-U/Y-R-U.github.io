# NEONHAUL — Season 2 brief

NEONHAUL shipped 2026-08-18 and Aaron has played it. Verdict: *"excellent/fun to test."* This file
holds the decisions taken in the 2026-08-19 design session and the phase plan that follows from
them. **Read `MANAGER_STATE.md` and `CLAUDE.md` first** — everything in them still applies,
especially the gate discipline and the eighteen recorded instances of measurements that silently
measure nothing.

---

## What the session found before deciding anything

Three findings changed the shape of the work. Each is evidence, not impression.

1. **The cockpit dashboard already exists and Aaron had never seen it.** `js/save.js:42` ships
   `camera: 'chase'`, and the only switch is a **View** row inside the cog panel
   (`js/settings.js:35`). `shots/cockpit.png` shows what he was missing: physical dash geometry, a
   needle speed dial, ALT / CELL / CARGO, the district name on the lip, two holo panels, window
   pillars. `ChaseStrip` (`js/hud.js:812`) — the DOM row of three chips he called "pretty crappy"
   — exists *only* because chase was defaulted to and the dash sits behind the camera there.

2. **38 of 64 chatter clips were never generated.** `assets/audio/manifest.json` declares 64 slots
   across 11 groups; 26 files exist, all of them dispatch (`dispatch`, `dispatch_confirm`,
   `dispatch_pay`, `bg_net`). Entirely missing: `life` 8, `police` 6, `ad` 6, `pirate` 5,
   `distress` 5, `weather` 5, `bg_dock` 3. That is the whole cause of "only a couple of random
   chatter that loop frequently." **The prompts for all 38 are already written in `docs/SUNO.md`**,
   with a distinct voice specced per group.

3. **Traffic has two civilian silhouettes.** `js/traffic.js:67` — `taxi_ai` 60 %, `hauler_ai` 32 %,
   `patrol` 8 %. The per-craft colour variety Aaron asked for last time *did* land (three seeded
   bytes at `traffic.js:201`) but it is painting two shapes. Meanwhile `CRAFT_DEFS`
   (`js/craft.js:79`) already holds six player hulls from a 5.4 m `wisp` to a 10.5 m `mammoth`.

And one that shapes a later phase: **`js/autopilot.js` already has a `Courier` class that navigates
to arbitrary targets** via `setTarget(t)`, by emitting the same synthetic input struct `controls.js`
emits. `flight.js` cannot distinguish it from a thumb. The player-facing autopilot upgrade is
largely written, and inherits a free property: the player can take the stick back mid-flight with
no mode switch.

---

## Decisions taken

### Views

- **Cockpit becomes the default.** On-screen toggle button switches to chase; it is not a cog row.
- **`ChaseStrip` is deleted, not restyled.** Chase view gets a proper HUD in Aaron's sense of the
  word (below).
- **HUD vs dashboard — Aaron's definitions, use them exactly.**
  - **HUD** = a semi-transparent neon *frame* with a transparent background of the same or similar
    colour. Like something reflected onto a windscreen. A futuristic floating window.
  - **Dashboard** = physically part of the car. Should look high-tech and expensive.
  - These are two different presentations, not one skin over both.

### The dash itself

Aaron: *"The dash does look good btw"* — the direction is right, the execution reads basic.

- **Reduce dash height by almost half.** It currently eats the bottom third.
- **Add a thin top bar** carrying money / current job / timers.
- **Rounded corners.** No hard rectangles. This is called out explicitly.
- **Additional buttons around the sides**, so the cabin reads as an instrumented vehicle.
- **Small high-tech touches** — the gap between "good for basic" and "expensive".
- Aaron floated **generating a cockpit image** (90 % green-screen) and noted himself it gives far
  less flexibility. **Do not bake a full cockpit image.** The cabin geometry is a function of the
  viewport ASPECT (`main.js:318`), and the dash face is a live-redrawn canvas — a baked plate can
  do neither. The middle path, which is the recommendation: keep the geometry procedural and
  generate a **bezel / greeble texture sheet** for the shell via MFLUX at `:7867`. That buys the
  high-tech surface detail without losing the responsiveness.

### Instruments the dash must carry

- Cash.
- Current job: `$amount + $bonus`, **with a countdown against each**. The bonus and its countdown
  **disappear** once the bonus window is missed.
- **Variety of readouts** — circular indicators, rectangular power/speed bars, not all one form.
- **Minimap moves to the top-right corner**, and the **cog sits under it and slightly overlapping**,
  so it reads as part of the minimap housing.
- **Chatter becomes a scrolling chat box embedded in the dashboard.** The current floating
  rectangle is gone. Background chatter renders **faded**; important lines render **bright /
  highlighted**.
- **An FPS / simple stats toggle in the cog.** The `?perf` overlay already exists; this is a
  settings row that turns it on, not a new overlay.

### Controls

- The blue **▲/▼ chevrons keep their function** but move **into the dashboard** as a physical
  collective/throttle lever. They are not floating buttons.
- **Why they are worth keeping, in Aaron's own words:** he had been *aiming* the craft to gain
  height, and only realised on reflection that *"going up/down without forward/back motion does make
  sense."* That is the affordance failure to fix. Their value is not "climb" — the nose does that —
  it is **rising and sinking on the spot**. Label and shape them for that, because a player who
  reads them as "climb" correctly concludes they are redundant, which is exactly what happened.
- **`>>` is the boost button** (`index.html:37`, `btn-boost`). Aaron did not know what it did. It
  needs a real label or an unmistakable affordance.

### Time pressure — there are no days

Aaron: *"i actually like the idea of no days in the game."* The player plays as long as they like
and never sleeps. Game time exists for delivery clocks and bonuses; there is no day counter.

The debt deadline is therefore **soft and dramatised, not a clock the player watches**:

- The Boss never names a number of days. He says the money will be called in *soon*.
- Pressure is delivered as **escalating messages from the leader**, e.g. *"Better make money fast."*
  → *"Will be needing the money soon."* → *"Ensure you have the money ready."* → *"We are on our
  way, better have the money ready!"*
- Aaron also suggested **a "warmth" indicator on the dash** for time running out. Design it as a
  temperature/pressure gauge rather than a countdown — it should feel like something rising, not a
  timer expiring.
- **Debt: $50,000.** Calibration: a job pays roughly 650–1,115 (`js/economy.js` `payout()`), and the
  licence ladder's tier 5 is 36,000 lifetime and tier 6 is 80,000. So $50k is ~50–70 deliveries — a
  real arc without a grind.
- **What happens when the Boss arrives and the money is not ready: ANSWERED — see the addendum at
  the end of this file.** They take the car and clean out the account, leaving ~$90, and the player
  hires their way back. Still no fail state. The "drop to the starter `wisp`" proposal that was on
  this line is dead; it was circular, because `wisp` is the free hull the player already flies.

### Home and autopilot

- **An AUTO HOME button** that flies the player back to their home hub.
- **Autopilot is a purchasable upgrade** with an intelligence/speed ladder. A **very slow version is
  enabled from the start**. It **respects the travel lanes**, where the player is free to fly
  direct — so the autopilot is the safe, lazy, slower option and hand-flying is the fast one. It can
  be activated for deliveries.
- Build it on the existing `Courier` class in `js/autopilot.js`. Preserve the take-the-stick-back
  property: the player touching the stick must interrupt it immediately, with no mode transition.

### Ranks

Two ladders, moving independently. A `HAULMASTER` who is still a `TENANT` is a story, and so is the
reverse. The **courier ladder hangs on the six existing licence tiers** in `js/economy.js:84`, which
already gate parcel types, districts and hulls on lifetime gross credits — they have thresholds and
no names. The last two open with the company phase.

**Courier licence:**
`UNLISTED` → `RUNNER` → `BONDED COURIER` → `LANEWRIGHT` → `ROUTEMASTER` → `HAULMASTER` →
`LANE MARSHAL` → `SPIRE HAULIER`

**Standing** (net worth + story flags, deliberately slower):
`NONPERSON` → `REGISTERED` → `TENANT` → `CARDHOLDER` → `NAMEHOLDER` → `SHAREHOLDER` → `PATRON` →
`MAGNATE` → `DIRECTOR` → `ASCENDANT`

**The other side**, when that tab opens:
`SMOKE` → `EARNER` → `FIXER` → `BROKER` → `QUIET PARTNER` → `THE HOUSE`

### Story

Opening scene, as Aaron specced it:

1. Camera on the player's craft parked in the hub. **Make the white/coloured transparent docking
   cylinder almost invisible for the cutscene.**
2. A neon line grows up and out of the craft: **"Enter player name"** (auto-name offered), and a
   gender pick **Male | Female | (neutral)**.
3. On skip/auto/confirm, the camera pans out to reveal the craft **surrounded by mob craft**.
4. A line extends from one of them into a speech rectangle. **The Criminal Leader speaks**, with
   audio. He does nearly all the talking; the player manages only *"but—"*, *"wait—"*, *"just
   wait—"* and is talked over.
5. Premise: the player has "borrowed" their parents' car while they are away for a month. The
   parent — Dad — has borrowed money from this crew. The Boss is calling it in. Pay, or they take
   the car and sell it, and break an arm, or sell whoever is driving to the highest bidder.
6. The mob flies off. The player then speaks, so the person playing knows where they stand:
   *"Shit — they wouldn't let me get a word in. What sort of shit has my Dad got himself into? I
   shouldn't even be flying this, but now I'm going to have to. I need to make that money fast."*

**Voice cost decision: the Boss's lines are gender-invariant — generate them once.** Only the
player's few interjections and the closing monologue need three takes (young male ~20, young female
~20, gender-neutral ~20 — a high male or low female read). That is roughly eight short lines × 3,
not a script × 3. Assemble in code.

### Radio voices

- **Generate locally.** Aaron wants to see how the local stack does. He also has a SUNO
  subscription for about another month and is happy to compare, so produce a sample of both where
  it is cheap to do so.
- **Do the radio degradation in ffmpeg, not in the prompt.** Band-limit ~300–3400 Hz, hard
  compression, squelch clicks on head and tail, mono. A prompt asking for "sounds like a cheap
  two-way radio" is a coin flip; a filter chain is not.
- **Encode small.** Mono ~24 kbps. Current clips are ~30 KB each; at that rate they are ~8 KB, so
  the line pool can grow past 150 for less than the present 26 cost. Low quality is *wanted* here.
- **GPU contention is real** — see `~/cc/yru/CLAUDE.md`. Flux (`:7867`) and LTX (`:7866`) cannot
  co-reside in 24 GB. Check `worker_warm` before any heavy local model work and queue rather than
  inventing a lock. A small TTS model is expected to be fine alongside, but check, do not assume.

### Later phases, recorded so they are not re-litigated

- **Living posters.** Some poster sites cycle images every 5–10 s; a few carry ~5 s looping videos
  mixed in with jpgs, the same trick the client portraits already use. Compress hard — posters do
  not need large images. Show only within a distance band and when actually being looked at.
- **Street level.** Shopfronts with lights on inside — simple eateries and food stores. Aaron's own
  rendering proposal, which is a good one: **treat windows like venetian blinds** — a lit face at
  most angles, see-through only at certain angles and distances, so the interior cost is paid rarely.
  Signs on or above most shop windows.
- **Long road vehicles now, street view later.** Buses, trams, long transports travelling the roads
  are wanted before the full street build.
- **The company layer.** Past the initial plot: hire drivers, switch to their vehicle views, pay
  wages automatically, earnings screens. Then found a company for them to work under. A legit
  transport business by default, with a shady branch that may open — tabs to switch between them —
  and eventually multiple companies. **Every one of those screens has to look futuristic and good**,
  which is why the dock HUD is being rebuilt now rather than later: Aaron on the current one, *"it
  looks fine if it was a web form."*

---

## Phase plan

One agent at a time **except the first two**, which run in parallel because they share no files.
Aaron's constraint after that is usage limits, not coordination.

| phase | what | owns |
|---|---|---|
| **S2-A** | Dashboard, views, HUD language, instruments, stats toggle | `hud.js` `ui.js` `settings.js` `minimap.js` `save.js` `camera.js` `main.js` `index.html` `style.css` |
| **S2-B** | Radio voices — the 38 missing clips, expansion past 150, ffmpeg radio chain | `assets/audio/**` `js/radio.js` `docs/SUNO.md` `tools/` (new files only) |
| S2-C | Vehicles — more silhouettes, long road transports, reflective/glassy materials | `traffic.js` `craft.js` `materials.js` |
| S2-D | Ranks + progression UI | `economy.js` and the new rank surfaces |
| S2-E | Story, intro cutscene, the Boss's escalating pressure, debt arc | |
| S2-F | Home button + the autopilot upgrade ladder | `autopilot.js` |
| S2-G | Living posters | `signage.js` |
| S2-H | Street level | |

### The A ↔ B contract

They must agree on one thing and nothing else. **Chatter priority travels in the existing `tag`
field**, whose vocabulary is fixed at exactly three values:

| `tag` | meaning | rendered |
|---|---|---|
| `bg` | background wash, not addressed to the player | faded |
| `info` | ordinary traffic | normal |
| `alert` | dispatch, police, distress — matters | bright / highlighted |

**S2-B** sets `tag` on every manifest entry and does not touch the renderer. **S2-A** builds the
ticker and styles on `tag`, and does not touch the manifest. Neither adds a field. The
`ui.chatter({ speaker, text, tag, audio })` signature does not change.

---

## Rules, unchanged from season 1

- **Build agents do not run git and do not commit.** The manager commits.
- **Never `git add -A`, `git add .`, or `git commit -a`.** Other sessions have uncommitted work in
  this repo — at last count 31 dirty paths, 14 of them in `sunderfall`. Stage explicit paths only.
- **No `alert()` / `confirm()` / `prompt()`.** Styled in-game panels only. Aaron dislikes modals.
- **`main.js` is the wiring point and only one agent may own it at a time.** An agent that needs a
  wiring change it does not own writes `docs/<PHASE>_WIRING.md` for the manager to apply.
- **Prove every gate can fail.** Break what it guards and confirm it catches it. A difference of
  exactly zero is a broken experiment far more often than a real result. A test may never use `&&`
  to make its own setup optional.
- **Read the detail lines, not the pass count.** Any hedge in a *passing* gate — "force-",
  "fallback", "skipped", "assumed", "approximated" — is where the bug is. This is how a third of the
  map was found unreachable behind a 12/13 green.
- Gate files use **two JSON schemas** — most write `{results:[…]}`, `p5`/`p7a`/`p8` write
  `{ok:[],fail:[]}`. A parser reading only `results` reports 0/0 on a fully passing suite. That
  mistake has been made three times.

---

## Addendum — repossession, hiring, and the borrowed car (2026-08-20)

Aaron's answer to the open question above. **This replaces the "drop to the starter `wisp`" proposal**, which was circular: `wisp` is the free tier-1 hull the player already flies (`craft.js:80`, `economy.js` `CRAFT.wisp.price: 0`), so falling to it is falling to where you started.

### What happens when the Boss calls it in and the money is not ready

They take the car **and clean out the account.** The player is left with about **$90 stashed away** — not enough for anything except hiring. There is still no game over: hiring is the road back.

### Hiring

- You **hire a vehicle by the hour** (or by a shorter block). Slow, base-model, costs money to hold.
- The loop is *earn more than the burn*. Aaron's target: the hire should cost **roughly 30–50 % of what the player can earn in that time**.
- **Discounts for longer hires**, once the player can afford to commit.
- Eventually you **buy your own craft outright, debt-free**, and the burn disappears. Hiring is the bottom of the ladder, not a permanent tax.

### The $90 does not survive contact with the economy — resolve it by sweeping, not by feel

Measured, not guessed. Tier 1 job band is 0.6–2.4 km (`missions.js:33`) and `base = 180 + 130×km + 60×risk` (`economy.js:32`), so ~260–500 before the time bonus. `economy.js`'s own comment puts a 1.8 km job at **29 s of flight at cruise**; with docking and board time a full cycle is ~75–120 s. Twenty minutes is therefore ~10–16 deliveries, **4,000–6,000 CRD** in a normal hull, ~2,000 in a deliberately slow clunker.

So **$90 for 20 minutes is 2–4 % of the take, not 30–50 %.** A 20-minute block at the target burn would have to cost 600–1,000. Two ways out:

1. **$90 is a story price** — a wreck nobody wants, below market, one-off, narratively justified.
2. **$90 buys about five minutes** — ~18 % burn, and you must land a job or two inside it just to afford the next block.

Recommendation: (2), with the exact pair found by **sweeping, not hand-picking**. `economy.js` already carries the lesson in a comment — the plan's original time-limit constants made the bonus *unlosable* (100 % saturated, overdue rate 0.000) and had to be re-derived by `tools/sim_p7a.mjs` against a target distribution over ~13,100 simulated deliveries across six policies, twelve seeds and a 0.72-skill pilot. **Sweep the hire price and block length the same way.** Target distribution: burn sits at 30–50 % of gross across the early hires, and a reasonably-playing pilot fails to cover a block on under ~10 % of blocks.

### Hiring is a general mechanic, not only a punishment

If hiring exists only in the repossession branch, most players never see a system that cost a phase to build. So it is available from early on: **hire a bigger hull for a job you cannot carry yet, or a fast one for a rush contract**, before you can afford to buy either. The repossession branch then drops the player into a mechanic the game has already taught them.

### The parents' car is NOT the starter hull

A free tier-1 craft is not worth $50k, an arm, or a shakedown. **The player opens the game in a hull above their licence tier** — `kestrel` or `nocturne` — borrowed, insured to someone else. This makes the mob's interest credible and makes the player's own scripted line land: *"I shouldn't even be flying this."* Losing it is a real fall, and the licence ladder becomes the arc of climbing back to what you started with and past it.

Watch the early-economy effect: the player holds an above-tier hull for the opening stretch. That is acceptable because the arc removes it, but S2-D should measure it rather than assume it.

### The deadline is TIGHT — and why that follows from the soft consequence

Aaron: *"because it isn't game over to lose the car - i think that should mean it is pretty tight trying to keep the car. you have a chance but you need to work hard... a real risk of running out of time."*

The softness of the consequence is what licenses the harshness of the challenge. Losing the car must be a **live risk for most players**, not a theoretical branch.

Three things follow, and they are requirements, not colour:

1. **The hire loop is a main path, not an edge case.** If a real fraction of players lose the car, the repossession branch gets as much design and polish as the winning one. This raises its priority and reinforces the decision above that hiring is a general mechanic available early.

2. **The warmth gauge reads PACE, not elapsed time.** A tight deadline is only fair if the player can see they are falling behind *in time to change behaviour*. So the gauge encodes required-earning-rate versus actual: cool when ahead, climbing when drifting behind. A gauge that only counts down tells the player nothing they can act on, and a player who loses the car with no warning will experience it as a game over no matter what the design says.

3. **The Boss's escalation keys off the same pace signal, not off a clock.** He is reading your balance, not the calendar. *"Better make money fast"* arrives because you are behind, and that is what makes it land.

**Tune by sweeping, not by picking.** Target outcome distribution, to be refined before S2-E: a focused player who routes well keeps the car on most runs; a dawdling player loses it on most; almost nobody coasts to it without noticing. Use `tools/sim_p7a.mjs` and the existing skill-policy pilots (the 0.72-skill "still learning" and 2.4× dwell `dawdle` policies already exist) to find the window. Note the precedent this exists to avoid: the plan's hand-picked time-limit constants produced a bonus that was saturated on 100 % of deliveries with an overdue rate of 0.000 — an unmissable "bonus" that was really a price.

### The hire loop, settled (2026-08-20)

- **Blocks are 5 minutes.** Confirmed by Aaron. Price swept as described above, but the block length is fixed at 5 min.
- **Extending a hire happens from inside the cabin.** One of the dash buttons opens a HUD panel (Aaron's sense of HUD: neon frame, transparent background) offering **+5 minutes, or as many blocks as the player can currently afford**. The player must never have to fly somewhere to keep the meter running.
- **The seizure happens at a dock**, never mid-air, so the player is standing somewhere they can immediately hire. The existing cell mechanic makes this airtight for free: charge runs down, so a player cannot stay airborne to dodge the trigger. It always fires and there is no cheese.

### Both endings of act one lose the car

Aaron: *"either way we lose the car - 1) we pay them off, parents return and you are left in the same situation, but they are very thankful?"*

This is structural, not flavour. **Every player ends act one carless and hiring.** So the hire loop is the spine of the game, built once and built properly, and "buy your own craft, debt-free" is the real arc rather than a consolation prize. The branches differ in **starting capital, not in whether you continue**:

| | paid off | seized |
|---|---|---|
| the car | parents return and take it back, gratefully | taken by the crew |
| money | everything earned above $50k | $90 |
| standing | clean, and **Dad owes you** — a concrete asset later | none |
| contacts | none | **the crew has a hook in you** |

The seized branch is the natural origin of the shady ladder (`SMOKE → EARNER → FIXER → BROKER → QUIET PARTNER → THE HOUSE`). Earning that path by losing act one is far better than offering it as a menu choice. The paid-off branch should get an equivalent concrete asset from Dad's gratitude so the two are balanced rather than one being the "good" ending.

### Both branches can reach the shady side

Aaron: *"the success branch may mean access to the 'shady' side of the story may trigger later - via an interaction with Dad, where you may even demand to know a contact. perhaps triggers off a certain job? perhaps a comment someone makes about your Dad or etc?"*

So the shady ladder is **not** locked behind losing act one. Two doors into the same room:

- **Seized branch** — immediate. The crew already has a hook in you; the relationship is the debt you could not pay.
- **Paid-off branch** — delayed and *earned by curiosity*. Something surfaces later — a particular job, or an offhand remark about your Dad from a client or over the radio — and you go to him and demand to know who he borrowed from. You open the door yourself.

The second is the better version of the story, because the player *chooses* to pull the thread. Seed the remarks in ordinary content — a client line, a `life` or `pirate` chatter slot — so a player who is not paying attention simply never notices, and one who is feels clever. Do not gate it behind a menu.

---

## What counts as PASS 2

Aaron has handed the pass-2 decisions to the manager and will play it when the summary lands. This is the scope. Anything past it is pass 3.

| phase | what | status |
|---|---|---|
| **S2-A** | Dashboard, views, HUD language, instruments, stats toggle | running |
| **S2-B** | Radio voices — the 38 missing clips, expansion past 150, ffmpeg radio chain | running |
| **S2-C** | Vehicles — more silhouettes, long road transports (buses/trams), reflective/glassy materials | |
| **S2-D** | Screens — dock board, shop and progression surfaces rebuilt in the HUD idiom, plus both rank ladders | |
| **S2-E** | Story — intro cutscene, name/gender pick, Boss escalation, warmth gauge, debt arc, both act-one endings, the hire loop | |
| **S2-F** | Home button + the autopilot upgrade ladder | |
| **S2-G** | Living posters — cycling jpgs and short looping videos, distance- and view-gated | |

### PASS 2-B — appended, runs straight on from 2-A without asking

Aaron, 2026-08-20: *"You will be running day and night, so I want your pass 3 to be added to the end of pass 2, feel free to break it into pass 2-a and pass 2-b once pass-2-a is complete, commit/push to git so i can try it from anywhere but continue on without asking."*

So what was pass 3 is now **pass 2-B**, and the table above is **pass 2-A**.

| phase | what |
|---|---|
| **S2-H** | Street level — shopfronts, lit interiors, Aaron's venetian-blind window model, shop signage |
| **S2-I** | The company layer — hire drivers, switch to their vehicle views, automatic wages, earnings screens |
| **S2-J** | Companies — found one, legit/shady tabs, eventually multiple. All of it futuristic. |

**At the end of pass 2-A: commit and push to main**, so Aaron can fly it from anywhere, then **carry straight on into 2-B without waiting for a reply.** His standing instruction: *"its better to get things working and tweak after."*

**S2-D exists because of a direct complaint.** Aaron on the dock panel: *"I mean it looks fine if it was a web form."* Every screen in this game has to look futuristic, and the company layer coming in pass 3 is nothing but screens — so the idiom gets settled now rather than retrofitted across a dozen surfaces later.

**Sequencing:** A and B run in parallel because they share no files. Everything after runs **one agent at a time** — the constraint is Aaron's usage limits, and agents should be told that reason rather than just a number.

---

## S2-B — DONE, verified by the manager 2026-08-20

**Accepted.** A committed, re-runnable local pipeline: `tools/vo/lines.json` → `tools/vo/gen_chatter.py` (macOS `say`) → `tools/radio_fx.sh` (deterministic ffmpeg radio chain) → `assets/audio/chatter/` + regenerated `manifest.json`.

| | before | after |
|---|---|---|
| slots declared / with audio | 64 / 26 | **203 / 203** |
| voices | 1 | **31 identities over 16 base macOS voices** |
| bytes | 841 KB | **2,283 KB** — 7.8× the clips for 2.7× the bytes |
| encode | mono 32 kHz ~51 kbps | mono 16 kHz 16 kbps |

**Verified independently, not taken on report:** 203/203 files present against the manifest; total 2,337,993 B and mean 11.2 KB exactly as claimed; tag vocabulary clean; six sampled clips measure −14.8 to −18.6 dBFS mean with peaks −1.2 to −3.1 (no clipping — the SUNO takes they replace were clipping to +2.7), against a manufactured silence control reading −91.0.

**The near-miss, confirmed fixed.** `gates_p8`'s `legC` used to copy fixtures over `police_01/02` and `rm` them in a `finally`. A run died on an `EINVAL` under load, skipped the `finally`, and left **a silenced clip in the shipped pool as `police_01.mp3`**. The agent added `recoverStaged()` and a C3 assertion that the backups return byte-for-byte. `police_01.mp3` now measures −15.9 dBFS — real speech.

**A gate had grown a hole, and the agent found it.** B5 asks "does this clip contain energy", but the new chain mixes hiss into everything, so a clip where nobody spoke decodes at −33 dBFS and **B5 passes it**. New **B5b** measures the speech window between the squelch bursts.

### Manager corrections applied on top

1. **`gates_wire` is NOT verified.** The agent reported 11/11; `shots/wire/_gates.json` records `total: 3` — a partial run. The suite declares W1–W11. Re-run it once S2-A lands; a wire run taken while S2-A is mid-edit on `main.js`/`hud.js`/`ui.js` measures nothing anyway.
2. **Tag frequency re-ruled.** The agent applied the table literally and got `alert` 99 / `info` 80 / `bg` 24 — **49 % of lines rendering bright, which makes bright mean nothing.** The rule is now **`alert` = addressed to the player and actionable**, not "dramatic": police and distress are somebody else's emergency, which is this game's whole mood. Now **`alert` 40 · `info` 59 · `bg` 104**. Applied to BOTH `manifest.json` and `tools/vo/lines.json` — patching only the manifest would have been silently reverted by the next regeneration.
3. **`gates_p8` A2's tag contract was over-constrained** and my retag broke it, which is how it was found. It asserted `TAGS[tag] === layer`, making the display tier a synonym for the audio bus and collapsing three render tiers onto two. **`layer` is the audio bus** (`back` = the unintelligible 0.22-gain bed, `fore` = a transmission you can make out); **`tag` is how the ticker renders the text.** A `life` line is a clear foreground transmission whose text still belongs in the faded tier. The rule is now one-directional — `back` implies `bg`, `fore` may carry any of the three — which keeps what the assertion actually protected (a bed line can never render bright). Verified against live data (0 illegal) and falsified in both directions (a `back`+`alert` control and a bad-vocabulary control are both rejected). `node --check` clean.

### Open decisions for Aaron

- **2.3 MB of chatter is a real mobile-data cost.** Deferred 1.5 s past ready, 2 concurrent, `saveData` skips — but it is worth a look on his real-device pass. Dropping to 8 kbps halves it at a cost to intelligibility, which currently measures 90.7 % by whisper transcription against the manifest text.
- **Local beat SUNO on this material.** Whisper scores local 90.7 % vs SUNO 88.1 %; local gives 31 voices in 50 seconds, free, and its flatness reads as cheap gear behind a 3.4 kHz band-limit. **Keep SUNO for the Boss's story VO in S2-E**, where performance is the whole point. A/B at `tools/vo/raw/ab_suno_vs_local.mp3`.
- Music untouched: 5 of 9 slots have files; `menu.mp3` still has nothing to play it.

### Note for whoever runs gates next

`tools/split_chatter.py` **does not exist** — BUILD_PLAN §11 specified it, P8 wrote `tools/vo/split_take.py` instead, and `docs/SUNO.md` pointed at the phantom tool until S2-B fixed it. `gates_p8` is now 32/32 (was 30/30).

---

## S2-A — DONE, verified by the manager 2026-08-20

**Accepted.** `ChaseStrip` deleted and replaced by `ChaseHud` in Aaron's neon-frame idiom; the dash rebuilt with a rounded housing, a thin top bar, four *different* readout forms, annunciator lamps, an embedded scrolling chat box, a minimap pod with the cog tucked under it, a labelled BOOST, and a RISE/HOVER/SINK collective lever. Cockpit is now the default view with an on-screen toggle.

**Verified independently:** `p6` 19/19 ×4 · `wire` **11/11 (run 01:40 against the finished tree)** · `p4` 19/19 · new `s2a` 13/13 portrait and 13/13 landscape. I read the JSON on disk rather than the report. **Dash height 30.8 % → 17.6 % portrait, 33.7 % → 17.5 % landscape** — measured through the real perspective divide on every housing corner, not on the quad alone, because in portrait the lip was the larger half.

**Looked at with my own eyes**, portrait and landscape, both views, against the before shots. The black slab is gone and the cabin reads as an instrumented vehicle.

### Three real defects its own gates caught

1. **The view button did nothing** — `#controls`' `touchstart` calls `preventDefault()`, which suppresses the synthesised click. Rebound on `touchend`.
2. **The dash ran off the bottom of the screen in landscape.** Tilting the plane swings its near edge toward the eye and a nearer edge projects further down; the bottom third of the dashboard was below the floor. **A portrait screenshot showed nothing wrong.**
3. **`bg` and `alert` rendered the wrong way round** — `.chat-past{opacity:.42}` then `.k-bg{opacity:.6}` at equal specificity, so the later rule won and a retired *background* line was less faded than a retired ordinary one. The gate now asserts the direction, not merely a difference.

### The two phases converged without needing a wiring change

S2-A warned that `bg` lines could never reach the ticker, because `radio.js:550` only emits chatter for `layer !== 'back'` — so the faded tier had nothing to render. Its recommended fix was to tag some *foreground* entries `bg`. **That is exactly what the manager's retag did**, independently. Now: `fore`+`bg` **80**, `fore`+`info` 59, `fore`+`alert` 40, `back`+`bg` 24. The faded tier has real content. **No pending wiring exists for anything either phase built.**

### Known issues, logged not fixed

- **The holo panels are the weakest surface in the cabin** — heavy scanlines over small text. Checked against `shots/s2a/before_land_cockpit.png`: they were always low-contrast, so this is **not a regression**, but it is now the least legible thing on screen and the panels are the two largest UI objects in the view. **Fix during S2-D**, which owns the visual idiom for screens.
- Screenshots in `shots/s2a/` carry gate state: `gates_s2a.mjs:238` injects `{speaker:'X', text:'y', tag:'nonsense'}` to test tag-normalisation fallback, and the capture caught it. Not a shipping defect.
- **`gates_p8` D3's detail string is stale** — it says foreground lines are text-only "because the optional groups have no files". Every slot has a file now; they are text-only because the deferred prefetch has not landed inside the gate's 200 virtual seconds. The gate is right, its explanation is not.
- `TAG_ALIAS` in `js/ui.js` is dead as of the retag — nothing emits `pay`/`warn`/`bad` any more. **Kept deliberately**: `normTag`'s fallback path is what `gates_s2a` exercises with its `nonsense` fixture, and removing a defensive normaliser to save four lines is a bad trade.
- **Not done:** no MFLUX bezel/greeble texture. The procedural moulding, gradient lip, screws and vents read as a surface in the captures, so the GPU was not spent. Revisit only if the dash still reads flat on a real phone.
- The landscape dash is **85 canvas px tall (~65 screen px at 390)**, halving again on the LOW preset. Not yet seen on a real phone at dpr 3 — one for Aaron's device pass.

---

## S2-C — DONE, verified by the manager 2026-08-20

**Accepted.** Traffic `TYPES` 3 → 6 (`pod_ai` stubby 4.8 m, `limo_ai` long-low 11.2 m, `van_ai` tall-boxy 7.6 m), plus a **second analytic population of road transports** — bus, articulated, three-car tram — running the 51.2 m road lattice with lit window bands. Six seeded edge-light modes with an optional travelling bead. A **procedural city reflection** on hull and canopy: world reflection vector into vertical slabs of window light in a horizon band, fresnel-weighted, modulated by world position so it moves as you fly. No texture, no probe, no render target, no draw call. The canopy previously carried a constant 0.55 alpha and was invisible in every before-shot; its alpha now rides the fresnel, 0.24 head-on to 0.92 grazing.

**Verified independently:** `p5` 16/16 both presets · new `s2c` 17/17 HIGH and 17/17 LOW · `wire` 11/11 · **`determinism` 9/9 run by the manager, golden `f29beaf9` / 25,039 unchanged**, and `git diff` on `data/city_golden.json` is clean.

**Cost, measured not estimated.** Draw calls **did not move** — 5/5 on the vehicle layer both presets; everything new went into geometry and buffers that already existed. Body geometry 392 → 868 tris (~476 collapsed on any given instance, which is the price of holding five draws). `budget.mjs --headed` green on both presets: thresholds are draws ≤ 90 / tris ≤ 260 k / mean frame ≤ 6 ms, and the measured worst is **56 draws, 177,070 tris, 59.7–60 fps across all seven scenarios**.

**Looked at with my own eyes:** the family sheet shows genuinely different silhouettes with glossy canopies and varied hue; `street_probe.png` at 34 m shows the transports' warm window bands sliding along the streets, which is the first time the city has read as alive at street level.

### The find of the phase

**Every forward lamp cone in the game floated 13.6–27.6 m in front of the craft that owned it, and had since P5.** `_lampCone` passed the length negative; the comment described the intent, not the arithmetic. Measured on the live instance matrix at yaw 0: a `kestrel` with its lamp at z −2.73 had its cone apex at **−30.73**. One character. It survived four phases because a faint additive cone in fog reads as haze — it was only visible once a bus, being a slab, had an obvious detached wedge beside it. `gates_s2c` B3 now asserts the apex against the lamp station.

### Honesty worth recording

- The agent's first reflection A/B returned **−0.26 ms, the expensive arm faster**, and it correctly called that noise rather than banking it. Re-run amplified to half-frame coverage over three alternating arms, within-arm spread came out 5× the between-arm difference. Conclusion recorded as *below a ±0.25 ms noise floor* — **not "free"**, and not measured on a phone.
- Its first `wire` wait-loop used `pgrep -cf`, which macOS rejects, so the loop exited instantly and it read a `total: 9` mid-run file. It caught this itself and re-read the completed run. **This is the third instance this run of a gate file being read mid-write** — see also the manager's own 3/3 misread of the same suite.

### Known issues, logged not fixed

- **A large flat panel takes one reflection colour across a face at a grazing camera** — transport roof caps read as painted slabs on the family sheet. It is the reflection behaving correctly (view direction swings ~30° over a 32 m vehicle) but it reads as paint. Confirmed harmless at play altitude by `street_probe.png`. Lever: `uCity.w`.
- **The reflection has no quality gating.** `craftFields.setCityRefl(0)` is the lever and wiring it to `Q` is one line in `main.js`. **Deliberately left unwired**: the measurement does not support spending quality to buy back a cost below the noise floor, and optimising without a measurement is how this project got eighteen of its nineteen silent-measurement bugs. If Aaron's phone stutters, it is one line away.
- Road transports don't stop, turn or queue, and aren't on the minimap (`roadList()` exists for whoever wants them there).
- `shots/_budget.json` was overwritten by a HIGH run; gitignored, nothing committed changed.
- **Nobody has flown any of this on a phone.**

---

## S2-D — DONE, verified by the manager 2026-08-20

**Accepted.** The dock board, shop, hold and a new RECORD tab rebuilt out of web-form territory: chamfered glass sheet, corner brackets, a rank rail on every screen, segmented instrument meters, route graphics, chamfered ACCEPT keys. New `js/ranks.js` with both ladders. Holo panels fixed.

**Verified independently:** every suite green on disk — `s2d` 14/14 portrait and landscape · `p5` 16/16 ×2 · `p6` 19/19 ×5 · `p7a` 30/30 · `p7b` 20/20 · `s2a` 13/13 ×2 · `wire` 11/11 at 04:12, and the agent confirmed the process had exited before reading it, which is the first time this run anyone has closed that trap deliberately.

**Looked at with my own eyes:** `before_board_jobs.png` against `after_board_jobs.png` is the phase in two pictures — the before is precisely the web form Aaron described. The after carries **LICENCE 4 LANEWRIGHT** and **STANDING 3 TENANT** side by side on the rail, which demonstrates the two-ladder independence in the first screenshot rather than claiming it. Holo panels are now dark glass plates with clearly legible text.

### Findings worth keeping

1. **The holo defect was structural, not cosmetic.** The panels were `AdditiveBlending`, which *can never be darker than what is behind it*, so over a lit facade the text had no floor — and the "scanlines" were 30 % black, which under additive subtracts from the glyphs and nothing from the city. Michelson contrast measured **0.424 normal vs 0.062 additive, 6.9×**. Cabin still exactly 5 draw calls.
2. **HUB's zone colour is `0xdfeaff` — near white.** §7.3's "one saturated colour per panel", taken literally, painted the frame, the kicker and the entire ACCEPT key white **on the first board of the game**. New `accentOf()` substitutes cyan below 0.45 saturation.
3. **Standing thresholds were swept, not picked** — 72 careers × 90 min over three spending profiles that gross identically. The median `spend` pilot lands **HAULMASTER but still REGISTERED**, so Aaron's "a HAULMASTER who is still a TENANT" fell out of the simulation rather than being asserted at it.
4. **The borrowed hull measured**: `kestrel` +3.9 %, `nocturne` +13.0 % median gross over `wisp` at 20 min; tier 2 arrives 2.87 → 2.58 min. Real but small — it does not break the early ladder. **`state.borrowed` is the one field S2-E must set**, and it already suppresses `assetValue()`; without it a borrowed nocturne would hand a new player 11,000 CRD of net worth and boot them several standing rungs up the ladder before the story starts.
5. **A near-miss the agent caused and its own gate caught**: `shots/*/` written inside a CSS comment — the `*/` terminated it early, killed the `#ui` padding rule, and the sheet went full-bleed off the bottom of the screen. Found by re-running, not by reading.
6. **One flaky check, reported rather than hidden**: `gates_p6`'s redraw-rate check failed once on mobile+LOW (a 4 s window at 2 fps) and has been 19/19 every run since. Timing-based; expect occasional flake.

### Known issues, logged not fixed

- **The client deal panel got a skin, not a rebuild.** `gates_p7b` P7 pins `.cp-sheet` to three type sizes, one family, ≤2 weights and nothing round, and the sheet is its own scroller so it cannot carry the chamfered pseudo-frame (the frame would scroll away). Corners are square. Belongs to whoever owns `dock.js` next.
- **The board transmits the *static* blur, not live frames.** The gate says so in its own detail line rather than claiming "the live city shows through".
- The landscape tab strip is **36 px, below the 44 pt touch guideline** — the height came out of the job card instead. A real thumb should test it.
- `STANDING_FLAGS` ships empty; the flag axis is proved with a fixture, not content. **S2-E owns the story flags.**
- **Manager's note:** in `shots/s2d/cockpit_390x844.png` — captured docked against a brightly lit pad — the dash reads washed out and low-contrast. In the normal night-city case (`shots/cockpit.png`) it is fine. Low priority because the dock screen covers the view at that moment, but worth a look if Aaron reports it.
- **Nobody has seen any of this on a phone.**

---

## S2-E — DONE, verified by the manager 2026-08-20

**Accepted.** New `js/story.js` (pure, node-runnable: debt, pace signal, warmth maths, Boss escalation, both endings, hire arithmetic) and `js/storyui.js` (`IntroScene`, `HirePanel`, `EndingPanel`, `StoryVoice` — renders only, decides nothing). The warmth gauge fills S2-A's reserved 42×42 bay. 19 story VO clips, 524 KB. `STANDING_FLAGS` filled. `save.js` now starts the player in a **borrowed `kestrel`** with `borrowed: true`.

**Verified:** `s2e` 30/30 portrait and landscape · `s2a` 13/13 ×2 · `wire` 11/11 · `gen_story.py` 19/19.

**Looked at with my own eyes:** `intro_boss_port.png` is Aaron's beat sheet — the ACT ONE title card, the docking cylinder faded almost to nothing, the neon line rising off the player's craft, red crew craft ringing it, and the Boss talking over you. 18 captures in `shots/s2e/`.

### The sweeps, and a correction to Aaron's own arithmetic

**Debt window = 84 minutes**, swept over 12 seeds × 5 pilot classes: focused 91.7 % keep the car, normal 100 %, casual 33.3 %, dawdle 0 %. Then — and this is the part that matters — **validated against the real game**: `courier_rate.mjs` flew `?courier=1` for 9 sim minutes and measured **737.3 CRD/min against the analytic model's 733.3, an optimism ratio of 0.995.** The window is real, not a harness artefact. This is the first time in the project an analytic sweep has been checked against the actual flight model rather than trusted.

**Hire = 1,425 CRD per 5-minute block**, swept. Burn 34.7 / 40.3 / 48.3 / 62.4 % of the median block by pilot class, and **0 % of blocks uncovered** for every class — inside Aaron's 30–50 % target for the classes that matter.

**The brief's own hire arithmetic was wrong by ~4×.** A 5-minute block in a `wisp` grosses ~3,500 CRD, not the ~500 the manager estimated, so **$90 is 0.6 % of a block and cannot be a market price**. It ships as the one-off story wreck it was always going to have to be; the market rate is the swept one.

### Two manager corrections to the agent's report

1. **The agent claims `CLAUDE.md` records `p7a` 30/30 and `p7b` 20/20 while the suites "declare 24 and 14", and that the recorded green is wrong. It is not.** `--falsify` **adds** six checks to each suite — `gates_p7a.mjs:13` says so in as many words: *"`--falsify` breaks what each of six gates guards"*. So 24 + 6 = 30 and 14 + 6 = 20. **The documented numbers are the falsify totals and are correct.** Do not "fix" `CLAUDE.md` downward; that would quietly retire twelve falsification controls.
2. **The failing landscape gate is worse than either of us first said.** The agent called it "a pre-existing `.dk-body` overflow"; I first read it as ACCEPT running off the bottom. The geometry says otherwise. Reproduced independently — `gates_s2d --land` 13/14, same rects:
   - `UNDOCK  [32, 349, 780, 38]` → spans y **349–387**, x 32–812
   - `first ACCEPT [54, 362, 227, 38]` → centre **(167, 381)**, inside UNDOCK's rect

   **The UNDOCK bar sits on top of the first job's ACCEPT button.** In landscape, tapping "accept this job" ejects you from the board instead. That is a mis-tap on the primary action of the main screen, not a cosmetic overflow. Portrait is clean (14/14). The agent did correctly prove it is **not S2-E's doing** — two independent reverts, full re-runs, byte-identical geometry — and it passed 14/14 at 04:04, so it regressed between then and now. **Assigned to S2-F as priority one.**

### Honesty worth recording

- `gen_story.py --falsify` initially gave a **false pass**: it fed silence through the chain and watched it be rejected — but `loudnorm` had amplified the noise floor to −6.4 dBFS and it was the *clipping* check that caught it, not the silence check. The agent found this itself. Silence is now caught before treatment, and the falsifier asserts the post-chain check **cannot** see it. That is the twentieth instance of this project's one failure mode, and the first caught inside a falsifier.
- It broke boot once with a `let` in temporal dead zone — **the third time `main.js` has paid for that exact thing** — and it contaminated a `gates_s2d` re-run in flight. Both re-run clean.
- Three defects found only by looking at pictures: two of six crew craft spawned behind the camera; the docking cylinder read as a solid drum because both walls draw from outside; the chase warmth bar sat under the collective lever in portrait. Two more found by tracing the DOM: interjection bubbles were cleared on the frame they appeared, so "talked over" never rendered.

### Left undone

- The four escalation lines are **text-only**; SUNO prompts written for Aaron.
- The seizure needs a dock and **nothing forces one** — deliberate, because a forced trigger is exactly the hedge-inside-a-gate this project bans.
- The landscape name panel covers the parked craft.
- **Nobody has flown any of this by hand or on a phone.**

---

## S2-F — DONE, verified by the manager 2026-08-20

**Accepted.** New `js/lanes.js` (the lane lattice extracted from `traffic.js`, numbers unchanged, plus a pure route planner) and `LanePilot` in `js/autopilot.js`. AUTO and HOME keys on S2-A's reserved left console. `upgrades.auto` with four rungs, **L0 a working pilot rather than the absence of one**.

**Verified:** every suite on disk green, none failing — `s2f` 11/11 ×2 · `s2d` 14/14 ×2 · `s2e` 30/30 ×2 · `s2a` 13/13 ×2 · `p4` 19/19 · `p5` 16/16 ×2 · `p6` 19/19 · **`p7a` 30/30 and `p7b` 20/20, which confirms the manager's `--falsify` correction** · `p8` 32/32 · `wire` 11/11 · `determinism` 9/9 golden unchanged.

### The priority-one defect: a better diagnosis than the manager's

The manager identified the **symptom** — UNDOCK's rect containing ACCEPT's centre. The agent found the **cause**, and it was not the dock sheet at all. It was **`--toast-h`**.

`js/ui.js`'s `_reserve()` writes the toast rail's height into `--toast-h`, and `#ui`/`#dock` add it to their top padding so the rail can never cover a panel header — a reservation `gates_p7b` B2/F4 actively protect. The rail stacks **downward**, so at its documented maximum of four toasts it reserves **166 px of a 390 px landscape frame — 43 % of the screen.** The sheet shrank 382 → 300 px, the body 242 → 160, and the 211 px job card no longer fit, so ACCEPT rendered below the body's clip, exactly where UNDOCK sits.

**Why it "regressed":** `gates_s2d`'s own A2 grants 60,000 CRD and buys a `nocturne`. Once S2-E made the player start in a **borrowed** hull (`assetValue()` suppressed), that sequence crosses **two** standing rungs instead of one — two toasts, 82 px, never cleared before B7. **The suite had been measuring an accidental toast state.** A quiet rail passed.

Fix: in landscape the toast rail stacks **across** (one 43 px row whatever the count, vertical being the scarce axis there); the landscape job card becomes a grid, 211 → 175 px; and `.dk-note` shares the last row with UNDOCK via an adjacent-sibling selector so it cannot misfire when absent. New `gates_s2f` E1 forces the rail back to a column and watches the same ACCEPT go `self: false` — the defect reproducible on demand.

### Manager's own re-verification, and what it turned up

I re-ran `gates_s2d --land` three times. **Runs 2 and 3: 14/14. Run 1: 13/14.** The agent's own run was 14/14. So roughly **one in four**.

The fix itself is real and is not what flakes — ACCEPT sits at `[54,289,227,38]` and hit-tests to itself in **every** run, against `[54,361,...] false` before. The flake lands on **`reach.tab.self`**, the only term in B7's condition that the detail line does not print. So: **a toast can still transiently cover the first tab in landscape.** That is a smaller instance of the same bug — the reservation is now correct in size but the horizontal rail can still overlap the tab strip at the wrong moment. **Handed to S2-G as a secondary item.** Not a blocker: the primary action is reliably pressable.

### The autopilot ladder, measured

4,000 trips × 4 rungs, wisp at 62 m/s: L0 DRONE 206.9 s (**4.28× slower than hand**), L1 RELAY 129.0 s (2.67×), L2 PILOT 90.1 s (1.86×), L3 LANEWISE 71.6 s (1.48×). **Worst case over 80 in-game routes is still 1.14× slower than a thumb** — hand-flying wins at every rung, which is the design's load-bearing claim, asserted rather than assumed.

**"Respects the lanes" is measured twice, two different ways** — B1 checks planner waypoints against the **live traffic's** occupied corridors (182 waypoints vs 892 live craft, 0 off; the same waypoints shifted 10 m rejected 182/182), and B2 samples the **craft's** actual altitude through a real flight. A planner emitting perfect waypoints the pilot could not hold would pass B1 and fail B2.

**The seize-back property is protected by a control arm, not a mutation**: C3 flies 240 frames, runs 90 more untouched (still active), then dispatches a real touch — pilot off that frame, `mode` is `"fly"` on both sides. There is no mode to cancel.

### Two defects its own probes caught

1. **231 illegal lane legs, every one exactly 6.8 m (`2 × LANE_SEP`) off the lattice** — the corridor side was taken from the direction of the whole trip rather than of the leg.
2. **The escape watchdog measured horizontal distance only**, so on the final vertical drop onto a ledge pad — already overhead, 120 m below — it called the pad a wall, fired an escape whose only action is `climb = 1`, and drove the craft **21 m past it**. Now 3-D and disabled on vertical legs.

### Left undone

- **No autopilot readout on the dash** — state is the lit key plus toasts. The obvious next thing.
- On-lane fraction is ~87–91 % on long trips, much lower on short ones; the gate **prints** `offLane` rather than asserting a threshold the agent had not earned.
- The pilot does not dock for you — it delivers into the 14 m volume at walking pace and hands the stick back. Deliberate.
- **`C4` logged 5 escapes and 2,340 m off-lane of 4,162 m flown on a long L3 flight.** The lanes are over the roads, so an escape on a lane leg means something is standing in a corridor. Reported rather than absorbed; **worth a look.**
- Adding a fifth `UPGRADES` line shifts `sim_p7a`'s spending model slightly; **the S2-E debt sweep was not re-run against it.**
- `CLAUDE.md`'s "Green at ship" line still records `p8` 30/30; it is **32/32**. Fix at commit.
- **Nobody has flown any of this by hand or on a phone.**
