# TINPOT — build checklist

**This file is the source of truth for what is done.** Tick a box only when the thing is
actually working in the browser and you have looked at it. Any agent picking this project up
cold reads `BRIEF.md` → `ARCHITECTURE.md` → this file → `STATE.md`, in that order, and then
starts at the first unticked box.

Target for v1: **a fully playable slice** — two maps, six or seven missions, rifle + grenade,
a working upgrade screen with a thin catalogue, title screen with live autoplay behind it.
Deliberately not the full campaign. We are finding out whether the core is fun.

---

# 0.01 — the shipped slice

> **Version note.** We are at very early concept stage, so the milestones are numbered from
> 0.01. This block (M0–M9) is **0.01**, the playtest pass below is **0.02**, and the first human
> playtest is **0.03**. The `M0`…`M9` headings inside this block keep their letters on purpose:
> `m2`…`m8` are live suite names (`node tools/browser.mjs m5`) and `m1b-portrait.png` and friends
> are live evidence filenames. Only the top-level version labels changed.
> The live build number is one string, `VERSION` in `js/version.mjs`, printed on the title screen
> as `PATTERN 0.03` and exposed as `window.tinpot.version`.

## M0 — Shell that cannot silently fail
- [x] `index.html` with the exact vendored importmap and the inline boot watchdog
- [x] Portrait-first `style.css`: safe-area insets, no page scroll, no rubber-band, fixed canvas
- [x] Three.js renderer boots, clears to a colour, reports first frame; DPR capped sensibly
- [x] Deliberately break a module import and confirm a readable panel appears, not a hang
- [x] `tools/cdp.mjs` + `tools/browser.mjs` take a screenshot of the running page

## M1 — The look
- [x] Ground: the long grass corridor with forest either side, readable at portrait aspect
- [x] Camera rig at ~16° off vertical, narrow FOV, correct framing on a 390×844 phone
- [x] Lighting: one warm key with soft shadows, sky/ground hemisphere fill, bloom composer
- [x] Instanced tree canopy — a few thousand instances, one draw call per species, cheap
- [x] Grass detail: moving, cheap, does not shimmer when the camera pans
- [x] **Screenshot gate:** a still of an empty map that looks like a game worth playing

## M1.5 — Art direction pass (added after reviewing the first M1 frame)
**Read `docs/ART_NOTES.md` before starting this.**
> **These boxes were previously ticked without the work being done.** `m2-portrait.png` was
> measured at **0.69% different** from the frame under critique. They were unticked and given a
> mechanical gate. Done for real on 2026-09-22 across two relay sessions; the new frame is
> `docs/evidence/m1b-portrait.png`, it measures **99.01% different** from `m1-portrait.png`, and
> `tools/artgate.py` passes all seven checks. Thumbnails side by side:
> `docs/evidence/m1-vs-m1b-thumbnails.png` (left old, right new).

The first M1 frame was competent and boring; these are the specific fixes.
- [x] Camera actually sits ~16 deg off vertical — tree canopies and helmets show a lit side
- [x] 3-4 tree species: different silhouettes, hues, heights, canopy radii, some bare/dead
- [x] Ground broken up by a noise mask: dry straw, trampled mud, damp hollows, treeline moss
- [x] Commit to the hour on the clock — low warm key, long cool shadows, canopy rim light
- [x] Treeline interior goes genuinely dark; >=3:1 value range against the lit corridor
- [x] Distance haze, vignette, visible bloom on lit canopy tops before anything is on fire
- [x] Corridor bends, pinches and opens into bays; islands of trees stand in the open ground
- [x] Cover and clutter in the open: boulders, logs, stumps, bramble, cart, wall, craters
- [x] Soft treeline edge: scrub, saplings, bracken, trees loosening out into the open
- [x] Grass blades lighter than the ground, varied, thinned by the noise mask, moving in wind
- [x] Path has ruts, gravel edge, puddles, wanders, occasionally leaves frame
- [x] **Soldiers read as little men, not dots.** Aaron asked for "a little bit of body/legs"
      under the helmet. Right now they are a helmet sphere and a rifle stick. Give them
      shoulders, a torso, two boots that actually swing, and enough silhouette that a
      standing man, a running man and a firing man are distinguishable from above.
- [x] The mission view gets the title screen's treatment. `m9-title-final.png` has a
      vignette, a real grade and a burning treeline in warm orange that looks great. The
      mission view has none of it. Bring it across.
- [x] `python3 tools/artgate.py docs/evidence/m1b-portrait.png` **passes**. It is a mechanical
      gate and it already fails the frame you are replacing (5 of 6). Do not edit its thresholds.
- [x] **Gate:** old and new frames side by side, distinguishable as thumbnails. Say which is which.

## M2 — One man who walks
- [x] `core/grid.mjs` walkability field from the map data + flow-field pathing
- [x] `core/units.mjs` soldier state machine; `core/world.mjs` fixed-step tick
- [x] Procedural soldier mesh: helmet, shoulders, boots, rifle. Team colour on the helmet.
- [x] Procedural walk animation — bob, boot swing, rifle held out. Readable from above.
- [x] Tap ground → he walks there, paths around trees, arrives, idles
- [x] `tools/sim.mjs` runs the same walk headlessly and asserts he gets there

## M3 — One man who shoots
- [x] `data/weapons.mjs` rifle: range, cadence, accuracy, damage
- [x] Auto-engage: acquires anything hostile in range, faces it, fires, no player input
- [x] Tracers, muzzle flash, impact puff, shell casings
- [x] Enemy soldiers with `core/ai.mjs`: patrol → alert → advance → fire
- [x] Death: ragdoll-ish flop, exaggerated claret spray, a stain that persists on the grass
- [x] **Feel gate:** is a one-on-one firefight in a treeline already a bit tense? Say so honestly.

## M4 — The squad and the UI
- [x] Up to 4 unit cards along the bottom: helmet, name, HP, active/inactive toggle
- [x] Tap-to-toggle with a hard minimum of one active unit; clear lit/dim states
- [x] Loose formation move order for all active units; no conga lines, no shoving
- [x] Left rail: up to 3 weapon buttons, bottom-up, only rendered if unlocked+equipped
- [x] Rail button in-mission = set that weapon for every unit, one tap
- [x] Per-card weapon pips (up to 3, top edge of each card) = set that one man's weapon
- [x] Objective banner, kill/loss counters, pause — all on edges, centre stays clear
- [x] **Thumb gate:** every control reachable one-handed on a 390×844 phone; nothing under 44px

## M5 — Grenades and a forest that burns
- [x] Grenade: arc to a tapped point, cook time, blast radius, friendly fire on
- [x] Trees take damage, fall over, leave a stump; walkability field updates live
- [x] `core/forestSim.mjs`: fire spreads tree-to-tree with wind, burns for a while, goes out
- [x] Burned ground becomes charred, walkable, and visibly different
- [x] Fire/smoke/ember VFX that justify the bloom pass
- [x] Headless: burn a hole in a treeline in `sim.mjs` and assert a new route opens through it
- [x] **Gate:** blowing a hole in the forest and walking through it is satisfying

## M6 — A mission, then a campaign
- [x] `core/mission.mjs`: objective types — clear the area, reach the point, hold for N, escort
- [x] Win/lose, mission timer, a debrief that counts the dead with unseemly enthusiasm
- [x] `core/roster.mjs`: named men, permadeath, promotion, recruits queueing up behind
- [x] Map reuse: mission 2 on map 1 shows the sandbags mission 1 earned, and mission 1's burn scars
- [x] `data/missions.mjs` — the first 6–7: 1 man, then 2, then 4; teaches one idea each
- [x] Save/load a campaign in progress through `platform/storage.mjs`

## M7 — Between missions
- [x] Barracks/upgrade screen: buttons on the edges, roster in the middle
- [x] Cog on each unit card (out of mission only) → assign a man from the roster to that slot
- [x] Buy: armour tiers per unit class, weapon upgrades, extra weapon slots
- [x] Unlocks gated on campaign progress; the weapon rail grows as they land
- [x] Briefing screen before each mission — short, funny, skippable

## M8 — Front of house
- [x] Title screen: game buttons around the edges, **live autoplaying battle behind them**
- [x] `ui/attract.mjs` drives real AI-vs-AI on a real map — not a video, not a mock
- [x] Music: title / briefing / barracks / battle / victory / defeat, cross-faded, from `audio/music/`
- [x] Sound effects: rifles, grenades, fire, the noises little men make when they die
- [x] Settings: music + sfx volume, and that is nearly all

## M9 — Ship the slice
- [x] Full playthrough of all missions on a real phone viewport with no console errors
- [x] Perf: comfortable 60fps at DPR 2 on a mid phone profile; document what it actually hits
- [x] `docs/VERIFY.md` written from real evidence, `docs/evidence/` holds the screenshots
- [x] A screenshot for `/assets/screenshots/tinpot.jpg` — staged at `docs/evidence/tinpot.jpg`;
      copying it into `/assets/` is Aaron's, at ship time, like the `projects.js` entry
- [ ] `projects.js` entry (**by hand, at ship time, by Aaron's session — not by an agent**)

---

## Later (do not start these during v1)
Flamethrower · mortar · rockets · minelayer · jeep, half-track, tank · magic units ·
water and bridges · night missions · the 200-mission story campaign · boss missions ·
a Boot Hill graveyard that grows · daily challenge · games.br8t.com account layer

---

# 0.02 — the playtest pass (added 2026-09-22, after shipping the slice)

Aaron is play-testing on `yru.br8t.com`. These are the gaps found by reading the shipped build.
Ordered by how much each one changes whether the game is fun. Same rules as everything above:
run it, look at it, tick honestly.

## 0.02.1 — Fire has to matter (gate: `node tools/browser.mjs v1`)
Nothing in `core/` damages a unit for standing in fire. You can burn the forest down and then
walk through the flames unharmed. Fire is the thing that makes this game not-Cannon-Fodder, and
right now it is set dressing.
- [x] Burning trees and burning ground damage ANY unit in them — yours, theirs, the tea inspector
- [x] Damage ramps with how fiercely that cell is burning; charred-but-out ground is safe
- [x] Units panic-path out of fire rather than standing in it politely
- [x] The AI will not route through fire, so a burning treeline is a real wall while it burns
- [x] Headless: `sim.mjs` asserts a soldier parked in fire dies, and one beside it does not

## 0.02.2 — Instant retry (gate: `node tools/release.mjs`)
A mission is ninety seconds and permadeath is the hook, so losing must cost a tap, not a reload.
- [x] Defeat debrief has a Retry that restarts the mission with the pre-mission roster intact
- [x] Retry is reachable by touch on all three phone widths; covered by the release harness

## 0.02.3 — The third weapon: flamethrower (gate: `node tools/browser.mjs v3`)
The weapon rail and the card pips were both built for three and only ever hold two.
- [x] `flamer`: short range, a cone rather than a line, ignites everything it touches
- [x] Unlocks at mission 3; appears as the third rail button and a third pip automatically
- [x] It is genuinely dangerous to its owner — this should be funny, not balanced
- [x] Balance it in `tools/sim.mjs`, not the browser

## 0.02.4 — Enemies that are not all the same man (gate: `node tools/browser.mjs v4`)
`SOLDIERS.red` is one stat block and `updateAI` is one behaviour, so every firefight is identical.
- [x] Three types minimum: the current grunt, a slow armoured heavy, a fast low-HP rusher
- [x] Each visually distinguishable from above at this camera height — silhouette and colour
- [x] Mission data picks the mix; later missions get nastier
- [x] The heavy should make you reach for grenades; the rusher should punish a split squad

## 0.02.5 — The fortifications the game keeps promising (gate: `node tools/sim.mjs`)
Mission 2's briefing says "we have installed sandbags and a mortar pit". Neither exists. This is
the map-as-territory promise and it is the reason to reuse a map at all.
- [x] Sandbags are real cover: they block shots and soldiers use them
- [x] A won mission leaves its emplacement behind on that map for later missions
- [x] Burn scars from a previous mission persist into the next mission on the same map

## 0.02.6 — Juice (gate: `node tools/browser.mjs v6`)
- [x] Haptics on a phone: a short buzz on a kill, a longer one on a grenade
- [x] Hit feedback readable at this camera height — flinch, a spray, a number, something
- [x] Losing a named man is dwelt on for a beat. He has a name; make it land.

## 0.02.7 — Landscape
At 1280x800 the play corridor stays portrait-shaped and you can see the map's edge and the empty
background past it. On a phone turned sideways this looks broken.
- [x] Either handle landscape properly, or put up a friendly "turn me round" card

---

# 0.03 — first human playtest (Aaron, on a phone, 2026-09-22)

> **Gate for this whole section:** `node tools/browser.mjs teach` (nine scenarios) plus the new
> blocks in `node tools/sim.mjs`. Both were falsified against a build with the bug still in it.

**The first time a person has played this.** His verdict: "It looks good, and very brief test was
fun." Everything below is his, in his priority order. Treat it as the most valuable input the
project has had — every gate before this was a machine agreeing with a machine.

The through-line: **the opening minute teaches nothing.** He was under fire before he had worked
out that tapping moves you, and he killed one of his own men with his first grenade because
nothing told him he could not move while throwing.

## 0.03.1 — Give the player room to learn (missions 1 and 2)
- [x] Enemies start **considerably further away** in missions 1 and 2
- [x] They **hold position** and do not advance until the player's squad reaches roughly the
      sandbag line — a trigger on player progress, not a timer
- [x] Verify in `sim.mjs` that a player who does nothing for 20 s is still unharmed in mission 1
- [x] Do NOT apply this to missions 3-6; it is a teaching device, not a difficulty change

## 0.03.2 — Make the tap visible
- [x] A pond-ripple animation at the tap point: expanding ring, fades out
- [x] Plain instruction on screen early on — "Tap to move to location" — that retires once used
- [x] It must read at this camera height on a bright phone outdoors

## 0.03.3 — Point at the first upgrade
- [x] After mission 1, an **animated arrow** points at the first affordable upgrade
- [x] With the words "Tap to upgrade units?"
- [x] Retires once he has bought anything. Deliberately crude — upgrades get reworked later.

## 0.03.4 — The grenade needs a moment of thought (the big one)
Right now a grenade tap is instant and irreversible, so his first one killed one of his own men.
He liked that it is dangerous — do not defuse it — but he could not *see* it coming.
- [x] Tapping with grenade selected **arms** it: a red pulsing marker at the target point, with a
      visible 2-3 s countdown before the throw
- [x] The marker carries its own **cancel** affordance — tap the marker to call it off
- [x] Tapping **elsewhere** while armed does NOT cancel: the squad moves there and the grenade is
      still thrown when the timer ends
- [x] The throw goes **as far as the thrower can toward the target** — so if he has walked out of
      range, it falls short, and that is his fault and visible
- [x] Selecting the grenade **briefly shows a range ring** so the reach is knowable before he taps
- [x] A one-off instruction the first time grenades unlock, explaining arm / cancel / move
- [x] Friendly fire stays on. The comedy is the point; only the surprise was the problem.

## 0.03.5 — Drop one joke
- [x] `'Onward, unfortunately →'` becomes a plain next-mission message. His words: "I get the
      idea/humor concept but I don't think that particular one lands."
- [x] Leave every other joke alone. He liked the tone.

## 0.03.6 — Teach the squad split in mission 2
- [x] An arrow and a short instruction prompting him to practise **splitting the squad and
      rejoining it** — the card toggle is the entire tactical game and nothing teaches it
- [x] Fires during mission 2, retires once he has toggled a card off and back on

---

# 0.04 — second human playtest (Aaron, on a phone, 2026-09-22)

His feedback on 0.03. The theme this time is **screen real estate and modal clarity**: the new
teaching furniture works but it covers the battlefield, and the armed-grenade state leaves him
unsure whether his next tap moves the squad or throws another grenade.

## 0.04.1 — The grenade warning must not cover the battlefield
The "GRENADE ARMED / you have walked out of range" card currently sits in the play field. See
`docs/evidence/v3-falls-short-warning.png` — it is legible and it is in the way.
- [x] The armed-grenade state and its warning render **over the mission banner at the top**,
      taking that space rather than adding new space
- [x] The countdown, the out-of-range warning and the "tap the marker to cancel" hint all live
      there; nothing about the armed state floats over the middle of the screen
- [x] Still readable at 320, 390 and 430 px wide

## 0.04.2 — The mission banner collapses to just the pause button
- [x] After 5-10 s of a mission, the banner shrinks down to the **pause button alone**
- [x] Tapping pause expands the banner again (and pauses, as now)
- [x] On unpause the banner stays up a few seconds, then re-collapses on its own
- [x] The collapse/expand must not rebuild the HUD's innerHTML mid-gesture. That bug has already
      eaten a tap once in this project — animate or toggle a class, do not re-render.
- [x] Gate: the pause button stays >=44 px and inside the top edge at all three widths, in both
      the collapsed and expanded state

## 0.04.3 — Pause the game to explain the grenade, once, ever
- [x] The **first ever** time the player selects or throws a grenade, pause and explain the flow:
      tap to arm, tap the marker to cancel, you can walk away and it will fall short
- [x] One tap dismisses it and resumes. It never appears again — same `campaign.taught` ledger
      as the rest of the coaching.
- [x] It replaces the current non-blocking grenade coach card rather than adding to it

## 0.04.4 — Throwing a grenade puts the rifle back in his hands
His exact complaint: "there is confusion on if you will end up running away or throw more
grenades when the timer runs out." This is the fix he proposed and it is a good one — after the
throw, every tap is unambiguously movement again.
- [x] Once a grenade is actually thrown, the squad's weapon **reverts to rifle automatically**
- [x] **Cancelling** an armed grenade leaves the weapon **on grenade**, so he can re-aim. He
      raised this as a question ("cancel grenade toggles back to grenade?"); this is the reading
      being implemented, and it is the consistent one — cancelling means he did not spend it.
- [x] The rail and the pips must visibly follow the change, so the UI never lies about what is
      in his hands
- [x] Per-man throws revert only that man; a rail-wide grenade order reverts everyone who threw
- [x] Note in STATE.md that this interacts with grenadiers still auto-lobbing without arming
      (a known 0.03 inconsistency) and say what you did about it


# 0.05 — the lads find the radio (Aaron, 2026-09-25)
- [x] Distinct local Qwen voices: four squad personalities, general, Inspector Biscuit
- [x] Compressed MP3 command responses, idle banter, situational and campaign commentary
- [x] One speaker at a time, priorities, cooldowns, recent-line avoidance, living speakers only
- [x] Music ducking, separate persistent voice volume, pause/background/reset cancellation
- [x] Voice manifest and resumable asset-generation instructions
- [x] Falsified voice tests, real browser MP3 playback, phone-width controls and screenshots
- [x] Existing sim/campaign/teaching/release gates pass; evidence reviewed
