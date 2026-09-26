# ACTIVE HANDOFF — 0.06 Operation Last Orders

User request 2026-09-26: more move/confirm variation; roughly 80% short plain replies,
20% jokes. Expand beyond training into connected territories, branching story, optional
depots and unobstructed transitions. Keep intro. Maintain checklist during work.
Earlier explicit commit/push authorization persists; only stage Tinpot paths. Other games
and root files have unrelated edits. No delegation authorized.

Current: implementation complete; all local gates complete; publication remains. 0.05 commit bfc381ca pushed; Pages deployment
36018810293 succeeded and public version 0.05 verified. New work not released yet.
Plan: six intro missions unchanged; Operation Last Orders adds an actual mission graph
about missing tea supplies and Ministry fraud. Same-map objectives roll on; cleared-zone
exit markers select routes. Safe depots are optional between objectives; opening pauses,
closing resumes; autosave includes exact field checkpoint. Two routes affect later
reinforcements, rewards and ending. See new 0.06 checklist at END of PLAN.md.

Next: commit/push only Tinpot and verify public version/audio/field flow. Update this handoff
with release evidence.

Implementation checkpoint (2026-09-26):
- Campaign graph and eight procedural territories implemented (24 definitions, 20 played
  per route including intro). Four possible paths, village/ledger and marsh/radio decisions.
- Pure save schema 2 migrates v1, including old completed slice at mission=6.
- Same-map continuation carries actual positions, wounds, map damage. Retry restores field
  deployment snapshot; crossroads have explicit persisted choices.
- Optional world depot opens a scrolling shop/journal, heals 35 HP once per objective,
  saves/exits; brief edge dispatches and seven-second objective changeover.
- 33 new locally generated clips COMPLETE; 148 total, 2,165,076 bytes. 80/20 director
  chooses four plain clips per character, five snarky move variants; excludes Going now
  for hold/equipment. All four full routes pass pure sim with modest upgrades.
- Original sim 24 checks and voice 13+3 mutants pass. New persistence/depot/branch gates
  and voice weighting (including reversed-weight mutant) pass.
- First hardware browser boot and orchard screenshot inspected; zero errors.
Validation checkpoint:
- Reach transitions now use a different destination; all four full paths remain green.
- Real-touch browser played all 14 new objectives on village/radio route to ending, with
  no force wins. Targeted fixtures verified depot purchases affect live HP, settings freeze
  combat, save/exit/reload retains crossroads, and walking+confirming selects the branch.
- 320x568, 390x844, 430x932 depot and route controls exercised. Screenshot review caught
  route overlap and a stale dispatch on scene reset, both fixed. Added overlap gates.
- All new territory screenshots inspected; depot/ending scroll on short phones.
- Original teach 13, voices browser 10, release all six intro missions/retries/mobile checks
  passed; title profile 60.00 fps, p95 16.8ms on M5 ANGLE Metal, CPU4x, 390x844 DPR2.
- Audio audit: all 148 MP3s decode, mono24kHz40kbps, 417.84 seconds, 2,165,076 bytes.
Final local verification complete: story-polish.mjs proves the overlap gate rejects colliding
labels, real touch swipe scrolls depot 167 px, sticky close stays reachable, and the final
320x568 route/ending screenshots are inspected. Ministry battle profile is 60.0035 fps,
p95 16.8ms, 359 calls, 265,126 triangles, 127 geometries (M5 Metal, CPU4x, 390x844 DPR2).
Release checkpoint: gameplay commit 46ce9977 pushed to main; GitHub Pages workflow
36209988568 running. Final depot narration fix follows: speech can play in depot mode while
combat remains paused; verified with a real gesture, story-depot MP3 and zero browser errors.
Next: push that small fix, verify public 0.06 plus all assets and browser field flow, then
record publication and tick the last 0.06 checklist item.

--- Previous handoff follows ---

# TINPOT — living state

> Update this **as you work**, not at the end. You may be cut off mid-sentence by a usage limit.
> The next agent inherits this file and the ticked boxes in `PLAN.md`, and nothing else.

## Now

**Milestone: 0.05 — the lads find the radio (2026-09-25). COMPLETE locally.**
Aaron requested voiced command replies, sarcastic banter and game commentary. The live build
number is now `0.05`. All runtime changes and asset files stay inside this game. Aaron explicitly authorised
committing and pushing this voice release on 2026-09-25, overriding the standing no-git rule
for this change. The soundtrack and simulation balance were not changed.

- **Six locally designed Qwen3-TTS 1.7B characters / 115 lines / 328.08 seconds.** Four squad
  personalities, Headquarters, Inspector Biscuit. Mono 24 kHz / 40 kbps MP3, **1,699,815 bytes**
  for the entire voice pack, plus a 43 KB transcript/provenance manifest. Only played clips
  download; the browser keeps at most 16 decoded buffers. No live AI is required by the game.
- Movement, hold/rejoin, equipment, arming/cancel, combat, friendly fire, burning, idle banter,
  briefings, reinforcement commentary, inspector complaints, results and upgrades are wired.
  Speakers use stable roster identity; dead soldiers cannot speak. One voice at a time,
  three-item expiring queue, category cooldowns and recent-line avoidance. Orders interrupt
  background jokes; urgent warnings can interrupt ordinary replies. Pause, primer, hidden
  page, mute and scene/reset changes stop speech and invalidate late network callbacks.
- Music ducks while speech plays. Separate persistent **Radio chatter** volume in settings.
  Existing cards identify the speaker; no new panel covers the battlefield. Small-phone
  sound controls were fitted at 320x568 with 44px sliders and no heading/footer overlap.
- Reproduction, cast, API workflow and limitations: **`docs/VOICES.md`**. Auditions:
  **`tools/voices-audition.html`**. Source script and resumable generator under `tools/`.
  Raw local WAV takes / service reference IDs are ignored for release, not deleted.

**Validation actually run:**

- `node tools/voices-test.mjs`: **13 checks**, plus three deliberately broken variants
  rejected (dead-speaker guard, priority sort, expiry). The first priority test itself failed
  its falsification check; it was corrected to test an idle queue, then proved to reject
  reversed priorities. Production thresholds were not relaxed.
- `tools/audit-voices.py`: all **115** MP3s decode, are mono 24 kHz, non-silent/finite, and
  match expected durations and byte counts. This is not a subjective accent/quality verdict.
- `node tools/voices-browser.mjs`: **10 browser checks** pass. Real touch -> briefing and
  command MP3s, music ducking, hold speaker identity, death interruption, natural timed idle,
  pause, persisted mute/reload, and 320/390/430px settings. Zero console/network/shader errors;
  no external runtime requests. It caught and then verified a fix for the first movement
  reply being starved by the general's welcome. Failure evidence retained in
  `voices-before-command-fix.json`.
- Existing `node tools/sim.mjs`: **24 checks** pass. `node tools/campaign.mjs`: all six wins.
  `node tools/browser.mjs teach`: **13 scenarios** pass. `node tools/release.mjs`: all six
  missions and phone-width/retry gates pass on the finished pack. Hardware ANGLE Metal,
  390x844 DPR2 / CPU 4x: **60.0 FPS**, **16.8 ms p95**. This is desktop Chrome emulation,
  not a physical-phone or Safari claim.
- Screenshots **looked at**: `voices-speaking-390.png` (speaker highlighted, play field clear)
  and `voices-settings-320.png` (all three sound sliders and footer fit).

**Next:** play the local build at `http://192.168.0.236:8888/gms/3d/tinpot/` and audition the
cast. Aaron tests at https://yru.br8t.com/gms/3d/tinpot/; release this authorised change to main
and verify that public URL reports PATTERN 0.05 and plays the shipped MP3s. Future agents can
extend the lines using the manifest/generator without touching the music.

### Previous handoff (0.04)

**Milestone: 0.04.** 0.01 (the shipped slice), 0.02 (the playtest pass) and 0.03 (the first human
playtest) are done. **0.04 — Aaron's SECOND human playtest — is this session's work.**
The live build number is `VERSION` in `js/version.mjs`; it prints on the title screen as
`PATTERN 0.04` and is on `window.tinpot.version`.

**Versioning note:** headings are numbered 0.01 / 0.02 / 0.03 / 0.04 because we are at very early
concept stage. **No code identifier was renamed** — the browser suites are still
`node tools/browser.mjs v1 v3 v4 v6 m2…m8 art teach` and the evidence filenames are unchanged.
The new 0.04 evidence shots are named `v4-*.png`, which collides in spirit with the `v4` SUITE
(three kinds of enemy) but not in fact: no file was renamed and no suite was added. 0.04's gates
all live in the `teach` suite.

**Aaron has now played it twice.** His 0.04 note, in one line: *the teaching furniture works and
it is in the way, and the armed-grenade state leaves him unsure whether his next tap moves the
squad or throws another grenade.* The theme is **screen real estate and modal clarity**.

## 0.04 — second human playtest pass (2026-09-22, sixth relay session)

Working `PLAN.md`'s **0.04** section only. Nothing above it is being touched.

### What 0.04 changed

**0.04.4 — throwing a grenade puts the rifle back in his hands.** `revertToRifle(w,u)` in
`core/combat.mjs`; `stepArmed` calls it on every man it just threw for. Cancelling does not.
See **D36** for the one real decision inside this (auto-lobs).

**0.04.1 — the armed grenade takes over the mission banner.** `coachModel()` no longer returns
an armed card at all; `armedModel()` feeds `hud.update({armed})`, and `hud.mjs` toggles an
`armed` class on `.mission-header`, hides `.banner-text` and shows `.armed-panel` — a red eyebrow
(`GRENADE ARMED`, or `GRENADE ARMED · OUT OF REACH`), a big countdown digit and one line of copy.
Out of reach the whole banner goes cold grey to match the marker on the ground. **Nothing about
the armed state floats over the battlefield any more.** Same box, same top strip, no new space.

**0.04.2 — the banner collapses to the pause button.** `BANNER_OPEN=7` sim seconds from the start
of a mission, then `.mission-header` gets a `collapsed` class: the card's background, border and
shadow fade out and `.banner-text` fades to zero. Tapping pause expands it and pauses; unpausing
gives it `BANNER_AFTER_PAUSE=6` more seconds and then it folds again. Both are **sim** seconds,
so a paused game never counts down while he is reading it. It is a class toggle and two CSS
transitions — **the HUD markup is never rebuilt for it** (see D32; that bug has eaten a tap here).

**The pause button no longer moves, at all, ever.** It is `position:absolute` against the
header's own top-right corner, so it is identical to the pixel in the open, collapsed and armed
states at 320/390/430. The gate asserts `deepEqual` on its rect across all three.

**0.04.3 — the grenade briefing pauses the war, once, ever.** The first time any living blue
soldier is actually holding a grenade, `main.mjs` sets `primer=true; paused=true` and `hud.mjs`
shows `.primer`, a centred card: tap to arm / tap the marker to cancel / walk away and it falls
short. Any tap dismisses it, the war resumes, and `teach('grenade')` writes the same
`campaign.taught` ledger the rest of the coaching uses — so it survives a reload and never
returns. It **replaces** the old non-blocking "Tap to ARM, not to throw" card, which is gone. The
"Hand out the grenades" card stays: that one teaches the pips, which is what gets him here.

### Gates (all falsified against a build with the bug still in it)

* `tools/sim.mjs` — new block *"throwing a grenade puts the rifle back in his hands; cancelling
  does not"*: rail-wide revert, per-man revert, cancel keeps it, and an unprompted auto-lob does
  NOT change the weapon under him. Falsified: neutering `revertToRifle` reddens it on
  `["grenade","grenade","grenade","grenade"]`.
* `tools/browser.mjs teach` — **13 scenarios** (was 9). Four new ones:
  *the mission banner folds down to the pause button, and the pause button never moves*;
  *the pause button is a 44 px target inside the top edge at every width, collapsed or not*
  (three widths x three states);
  *the armed banner reads at every width, and the grenade goes back to a rifle after it is
  thrown* (three widths, plus the rail, the pips and the order hint following it);
  *cancelling leaves the grenade in his hand, and the briefing never comes back* (including
  across a reload).

**Each one was run against a build with the bug still in it and watched go red:**

| falsification | what reddened |
|---|---|
| `revertToRifle` neutered | *throwing it puts the rifle back in every thrower's hands at 320* — `["grenade","grenade","grenade","grenade"]` |
| the briefing never fires | *the first grenade must pause the war to explain itself* |
| the briefing ignores the ledger | *one tap dismisses it* (it comes straight back) |
| `parseSave` wipes `taught` | *nor after a reload* |
| `collapsed` forced false | *and within ten seconds it has folded away* |
| pause button put back in the flow | *armed at 320: not in the top edge strip* |
| armed panel floated 190 px down again | *and it lives INSIDE the mission banner* |
| `paused`/`collapsed` put back in the rebuild signature | *collapsing must not replace the pause button in the DOM* |
  The two existing grenade scenarios were rewritten to assert the NEW correct behaviour: the
  countdown and the fall-short warning are read off `.armed-panel` inside `.mission-header`, and
  the arm/cancel lesson is asserted as the paused briefing.

### Two things that came out of doing it, worth keeping

**The pause button is no longer part of the rebuilt markup at all.** `model.paused` has been
taken OUT of the HUD's rebuild signature, alongside `armed` and `collapsed`. The glyph and the
`aria-label` are written into the cached node and `.pause-label` is a permanent element toggled
by a class. So the three states the banner can be in now produce **zero** `innerHTML` rebuilds,
and a gate marks the live DOM node (`dataset.mark`) and requires *that* node — not an identical
replacement — to still be there after collapsing, pausing, unpausing and re-collapsing.
Falsified by putting `paused`/`collapsed` back in the signature: reddens immediately.

**The coach card climbs into the space the banner gave back.** When the banner is collapsed and
no telegram is up, `.coach` gets a `high` class and slides from `top:150px` to `top:88px`, and
`#hud` gets `coach-high` which fades the kill tally out from under it. Without this the folded
banner just left an empty strip with the lesson still hanging over the grass below it.

### Everything green, this session, on ANGLE Metal

```
node tools/sim.mjs                                    OK (new 0.04.4 block)
node tools/campaign.mjs                               OK (all six missions, unchanged)
node tools/browser.mjs shell m2 m3 m4 m5 m6 m7 m8     OK 2 scenarios each
node tools/browser.mjs art v1 v3 v4 v6                OK 2 scenarios each
node tools/browser.mjs teach                          OK 13 scenarios
node tools/release.mjs                                OK, build 0.04, 60.0 fps, p95 16.7 ms
python3 tools/artgate.py docs/evidence/m1b-portrait.png   PASS all 7, exit 0, unedited
```

`teach` was run **five times end to end** for flake after the last code change: 13/13 every time.

Production path checked by hand with no `?test=1`: zero console/network errors,
`window.tinpotTest` is `undefined`, `window.tinpot.version` is `0.04`, and the title footer
reads `EST. THIS MORNING · PATTERN 0.04` (`docs/evidence/v4-title-version.png`).

**Two harnesses had to be corrected, both to the NEW truth rather than loosened:**
* `m5`'s *"nothing is in the air during the arming window"* was a sky-is-empty assertion. The
  0.04.3 briefing pauses the war for a moment, which gives the lads time to spot somebody and
  auto-lob before he taps. It now asserts nothing has been thrown **at the point he tapped**,
  which is the same reading the `teach` suite already used.
* `m5` also read the reverted weapon off `window.tinpot`, which is written on the next **rAF**
  while `advance()` returns immediately — the previous-frame trap in this file's gotcha list,
  and it applies to `window.tinpot`, not only to DOM text. Read the snapshot `advance()` returns.

### Evidence looked at (not just run)

`v4-banner-open.png` · `v4-banner-collapsed.png` · `v4-banner-paused.png` ·
`v4-collapsed-320/390/430.png` · `v4-armed-320/390/430.png` · `v4-grenade-primer.png` ·
`v4-reverted-to-rifle.png` · `v4-cancel-keeps-grenade.png` · `v4-title-version.png`.

## 0.03 — first human playtest pass (2026-09-22, fifth relay session)

Working `PLAN.md`'s **0.03 — first human playtest**. Nothing above that section is being touched.
Aaron's through-line: *the opening minute teaches nothing.* Everything here is a teaching
device; none of it makes the game safer.

### What 0.03 changed

**0.03.1 — room to learn.**
`data/missions.mjs` gained two fields, on missions 1 and 2 only:
* `enemyZ` — where the enemy line starts. Mission 1 went from `-8` (18 m from the player) to
  `-21` (31 m); mission 2 from `-8` (11 m) to `-18` (21 m).
* `holdLine` — a **z the player must reach** before the enemies already on the map will move at
  all. `beginMission` stamps `u.holds=true` on every red already present; `stepMission` clears
  it the moment any living blue soldier crosses the line; `ai.mjs` answers `u.ai='holds'` and
  keeps `u.path` empty until then. It is a trigger on his progress, never a timer.
  Both are `0` — roughly the sandbag line on Bramble Common (the bags sit at z ≈ -1).
* **Wave reinforcements are deliberately NOT gated.** A hold mission still has to be held; the
  gate only stops the men who were standing there when he arrived.
* Measured: `campaignWorld(newCampaign())` then 20 s of `tick` with no orders leaves the squad
  on 100 HP and both reds still at z = -20.5 with `ai:'holds'`.

**0.03.2 — the tap is visible.** `orderMove` emits an `order` event and `render/vfx.mjs` drops a
pond ripple at the point: two rings (cream + green) that expand and fade over ~0.7 s, with a red
pair for an armed grenade and a grey contracting one for calling it off. Materials are per-ripple
and disposed; the pool is capped at 26. `tinpot.vfx.ripples` is asserted non-zero right after a
real CDP touch. The instruction card is described under V3.6 below — it is one shared component.

**0.03.3 — the upgrade arrow.** `main.mjs firstAffordable()` picks the first unlocked, unmaxed,
affordable offer and `screens.mjs` hangs a bouncing `▼` over that shop button plus the line
*"Tap to upgrade units?"* in gold. It appears only from mission 2 onward, only while he has bought
nothing at all, and retires the instant `purchase()` succeeds.

**0.03.4 — the armed grenade.** `world.mjs` now owns `w.armed` and `stepArmed(w)`:
* `groundOrder` returns `'arm' | 'move' | 'disarm'` so the UI can tell what a tap actually did.
* Tap with a grenade selected → `w.armed={x,z,ready:time+2.4}`; a red ring pulses on the ground
  with a disc inside it that drains away as the clock runs down.
* **Tapping elsewhere does NOT cancel.** It is a march order and the grenade still goes, thrown
  by `throwGrenade` from wherever the man is standing — which already clamps to the weapon's
  16 m reach, so walking away makes it fall short. Measured: 16.00 m thrown, 7.22 m short.
* Cancelling is a deliberate tap inside `CANCEL_RADIUS` (2.2 m ≈ a 66 px target at this camera).
  Outside that radius the same tap is a march, and there is a negative control for it.
* If every thrower is mid-cadence the order **waits** rather than evaporating; if they are all
  dead or stood down it clears with a `disarm` event.
* Selecting the grenade shows a reach ring for 2.6 s, and again for the whole arming window.
* **The out-of-reach state is visible before it lands**: the marker goes cold grey and the card
  reads *"You have walked out of range. It will fall short."* Evidence
  `docs/evidence/v3-falls-short-warning.png`.
* Friendly fire is untouched. Nothing here defuses it; it only makes it legible.
* Gotcha worth keeping: grenadiers still **auto-lob** at anything in range, so a harness cannot
  assert "nothing is in the air" during the arming window. Assert on `grenadeTargets` near the
  tapped point instead — `tools/browser.mjs teach` does.
* Render gotcha: `terrain.mjs` only ever RAISES the forest floor, so a 16 m ring drawn at y=0.06
  is buried outside the corridor and reads as a dashed bug. The armed marker and the reach ring
  are UI affordances and are drawn with `depthTest:false` at renderOrder 6/7.

**0.03.5 — `'Onward, unfortunately →'` is now `'Next mission →'`.** Every other joke is untouched,
and the `teach` suite asserts the exact new string.

**0.03.6 — the split.** `toggleUnit` records `w.split` (0 → 1 when a man is stood down → 2 when he
is brought back). Mission 2 gets a card plus a gold `▼` hanging over the card it wants tapped;
the card's own text changes to *"Now bring him back"* after the first toggle, and the whole thing
retires at `w.split===2`.

**The coaching component itself.** `hud.mjs` appends one `.coach` element beside the existing
`.eulogy` — deliberately NOT part of the HUD markup, because rebuilding that innerHTML mid-gesture
eats taps (the bug that cost the m5 rail gate). Priority: the live armed countdown outranks
everything, then move → grenades → split. `campaign.taught` is the ledger, persisted in the save,
so nothing he has already demonstrated is ever explained to him again. It is `pointer-events:none`
and asserted inside the top edge strip at 320/390/430.

**Versioning and the build stamp (Aaron's second note).** `js/version.mjs` exports `VERSION`
and is the only place to bump it. It prints on the title screen as `EST. THIS MORNING · PATTERN
0.03` and is exposed as `window.tinpot.version`, asserted by both `browser.mjs teach` and
`release.mjs` so a deploy can be checked without a screenshot.

**New test hooks** (test build only): `tinpotTest.mission(n,credits)` deploys straight into a
mission, `tinpotTest.taught()` reads the coaching ledger, and the snapshot gained `armed`,
`split`, `coach`, `markers`, `grenadeTargets`, `explosions`, `version` and `vfx.ripples`.

**New gates, each falsified against a build with the bug still in it:**
* `tools/sim.mjs` — the hold gate, the 20 s idle survival with its negative control, the
  arming semantics (on target when he stays, short when he walks, only the marker cancels), and
  the split ledger. Reverting `holdLine` reddens *"mission one parks the enemy line"*; reverting
  the arming reddens *"nothing is in the air during the arming window"*. Both checked.
* `tools/browser.mjs teach` — nine scenarios (the suite name is `teach`, not a version).
  Run four times end to end for flake: 9/9 every time.

**Also checked by hand, on the production path (no `?test=1`):** the page boots with zero console
or network errors, `window.tinpotTest` is `undefined` (test hooks are gated on the query string),
and the title footer reads `EST. THIS MORNING · PATTERN 0.03`. Evidence
`docs/evidence/v3-title-version.png`.

**Honest verdict on whether the first two minutes now teach the game.** Yes for the three things
Aaron actually tripped over — tapping to move, the card toggle, and that a grenade is a
committed order you can walk away from — and each of those is now stated in words, shown with a
mark on the ground, and retired the moment he has done it. What is still untaught: fire, the
flamer, and the fact that a man left holding keeps firing (the card says HOLDING, the coach says
"keeps shooting", but nothing demonstrates it). And all of this remains a machine's opinion
about legibility; it has not been in front of a thumb. Forcing `coachModel()` to null reddens the first;
  forcing `reachRing.visible=false` reddens the grenade one. Both checked.

## 0.02 — the playtest pass (2026-09-22, fourth relay session)

Working `PLAN.md`'s **0.02 — the playtest pass**, 0.02.1 → 0.02.7 in order. Nothing above that section is
being touched.

### 0.02.1 — fire damage (suite: `node tools/browser.mjs v1`)

`js/core/forestSim.mjs` is now the fire *field*, not just the spread automaton:

* `fireIntensityAt(w,x,z)` → 0..1.35, read off a cached `w.burning` list plus `w.fires`
  (ground fires). Falls off linearly with distance and with `min(1, burn/3)`, so a fresh blaze
  is full strength and the last three seconds taper. A burnt-out tree scores 0 — charred ground
  is safe, which is the whole point of burning a route open.
* `FIRE = {dps:27, selfDps:10, linger:2.8, panic:.14}`. Standing in a fierce cell is ~35 dps;
  crossing a 2 m band at a run costs ~20 HP. A man who catches light keeps burning for ~2.8 s
  after he leaves, runs 1.6x faster while alight, and **sets fire to trees he runs past**.
* `damage()` gained a `cause`. Armour (V4) does not apply to `cause==='fire'` — the heavy is
  meant to be answered with a grenade or a flame, not a rifle.
* `escapeRoute()` + panic: a unit in fire re-paths to the nearest cool walkable cell. Panic is
  suppressed when his current path already leads somewhere cool, or he oscillates on the spot.
* `rebuildFireMask(w)` builds a per-cell danger mask one cell fatter than the damage field.
  `grid.route(from,x,z,danger)` treats it as wall. **The AI routes with it and has no fallback**
  (`ai.mjs` `safeRoute`, `u.ai='waits'`); **the player's orders fall back to the plain route**,
  so marching your own men into a firestorm stays possible and stays your fault.
* Trees gained `charred`. Without it a trunk that outlives its own burn is relit by the ground
  fire it just made and the wood never stops burning. Found by a sim test that hung on it.

Sim evidence (`node tools/sim.mjs`, all green):

```
fire kills the man standing in it and spares the man beside him   parked 0 HP at 4.53 s, beside 100 HP
intensity ramps with distance; burnt-out scar is safe             close .644  far .204  outside 0
a man in fire panics out rather than standing in it politely      72.7 HP, ran 8.25 m
burning treeline is a wall the AI waits behind                    held off 8.0 s, then advanced
the player can march men into a firestorm                         crossed a 9-tree blaze for 23 HP
```

Every one of those has a negative control beside it in `tools/sim.mjs`.

### 0.02.2 — instant retry: done

A losing debrief now leads with **"Again. Nobody saw →"** and keeps "Send in the replacements"
as the secondary. `markDeployment(c)` snapshots roster, slots, credits, upgrades, maps and the
mission index at every deploy; `rewind(c)` restores all of them together and pops the failed
attempt off `history`. Rolling them back *together* matters — restoring only the roster would
let you farm brass off your own casualties.

`tools/release.mjs` now loses a mission on purpose at 320/390/430 (`tinpotTest.smite()`),
asserts the retry button exists and is a ≥44 px on-screen target, taps it, and checks the dead
man is alive again and `history` is empty. Negative controls: he is alive before, and the loss
really does bury him. Evidence: `docs/evidence/v2-defeat-retry.png`.

**One real bug fell out of this.** `platform/audio.mjs` created a fresh `Audio` per cue and set
`src=''` on fade-out. Tapping Retry a second after losing cancels the in-flight `defeat.mp3`
fetch → `net::ERR_ABORTED`, which the release gate counts as a console/network error. Audio
elements are now pooled one per track and never have their src cleared.

### 0.02.3 — flamethrower: done (suite: `node tools/browser.mjs v3`)

`WEAPONS.flamer` — range 6.4 m, `cone` 0.46 rad half-angle, 0.4 s cadence, 8.5 damage a lick.
No projectile and no accuracy roll: `spray()` in `combat.mjs` hits *everything* in the wedge
including your own men, sets them alight, drops a `groundFire` at 72% of range and ignites the
trees around it. `tank:{radius:5.4,damage:150}` cooks off when its owner dies — pushed through
the existing grenade path, which now reads `g.radius`/`g.damage`.

Unlocks with `mission>=3 && upgrades.slots>=2`, so it is live from *A Slight Detour*. Sim:
clears a three-man wedge in 0.83 s, leaves the man standing behind him on 100 HP, takes his own
mate to 0, and burns its owner when the player marches him into his own pool.

**The layout cost of the third weapon, which is the part that nearly broke the release gate:**
three 44 px pips do not fit across a 73 px card. `.weapon-pips` now wraps globally with
`.pip{flex:1 0 44px}` — 3 rows at 320, 2 rows at 390/430 — the card body is compressed under
`max-width:370px`, and `hud.mjs` sets a `kit3` class that lifts the weapon rail and the order
hint clear of the taller cards. Without that the lowest rail button sat on top of the leftmost
card's pips and ate the tap. Measured clear at all three widths; release re-run green with a
flamer carried through missions 4–6.

### 0.02.4 — three kinds of enemy: done (suite: `node tools/browser.mjs v4`)

`data/soldiers.mjs` is now a stat block per type and `units.applyKind(u,kind)` applies it;
`data/missions.mjs` carries a `mix` per mission and per wave, cycled by `pickKind(mix,i)`.

| | hp | speed | armour | weapon |
|---|---|---|---|---|
| grunt  |  65 | 2.5  | 0    | rifle (12 m) |
| heavy  | 170 | 1.5  | 0.46 | rifle, +34% damage |
| rusher |  34 | 5.4  | 0    | bayonet (2.4 m) |

Armour is skipped for `cause==='fire'` and `'flame'`, so a heavy is roughly 315 effective HP
against rifles and 170 against a grenade or the flamer — that is the whole point of him.
`ai.mjs` gives each kind its own sight and hold distance, and **the rusher does not brake**: at
under 7 m he commits to a point 1.9 m *past* you (`ai:'lunge'`) and sorts it out afterwards.

Visually: `KIND` in `actors.mjs` — the heavy is 1.32x wide with a riveted iron chest slab and a
dark red helmet, the rusher 0.83x with a bright amber helmet and a 24° forward lean, and their
leg cadences differ (3.4 / 5.0 / 6.4 per metre) so one plods and one scurries. Measured off the
real meshes by `tinpotTest.actorSizes()` in `tools/browser.mjs v4`, not asserted off the stats.

**Balance, and the mistake worth recording.** My first mix roughly doubled the effective enemy
HP of every mission and `tools/release.mjs` lost *A Slight Detour* outright. Two separate
causes, found by building a 2-second headless loop instead of re-running the 5-minute browser
gate:
1. The mix itself. Mission 4 went from 520 effective HP to 1860.
2. **The flamer.** Handing one of four men a 6.4 m weapon costs a quarter of the squad's
   firepower at rifle range, and in the browser the ravine caught: 146 trees burnt and 51
   ground fires in 37 s. `spray()` was igniting a 3 m circle at 55% every 0.4 s and ground
   fires were re-igniting at 16% a tick. Both are now much lower (`pool*.8` at 28%, and 9%),
   the flamer reaches 7.4 m, and the heavy came down to 170/0.46.

Final: all six missions win on both loadouts with the naive harness pilot, mission 4 being the
pinch (1 man lost with rifles only). `tools/campaign.mjs` and `tools/release.mjs` both green.

### 0.02.5 — the emplacement: done

`fortify(w)` in `core/world.mjs` builds nine sandbag works plus a mortar pit, laid out relative
to `centre(-1, map)` so they sit in the corridor however it bends (D18). They are **low cover**:
never in the pathing grid, so boots walk over them, but `lineClear` stops a bullet that crosses
one — *unless* either end of the shot is within `HUG` (1.6 m) of that bag. So the side holding
the bags fires out and cannot be fired at, which is the entire reason to hold ground.

`blastTrees` flattens them, `props.mjs` now draws them from `w.works` rather than hard-coded
coordinates (so what you can see is exactly what stops a bullet, and a flattened bag vanishes),
and `snapshotWorld` carries them through a save. `ai.mjs` gained one behaviour to go with them:
a red with no line of sight and bags within 7 m goes and hugs the bags instead of standing in
the open. Territory was already persisted by `finishMission`; the sim now asserts it, with a
negative control that nothing is dug in on the first visit and that trees you did not burn are
still trees.

### 0.02.6 — juice: done (suite: `node tools/browser.mjs v6`)

* `platform/haptics.mjs` — 11 ms on a kill, 46 ms on a grenade, 26/40/70 on a flamer cooking
  off, and a triple stutter when one of your own catches light. Feature-checked, try/catch'd,
  rate-limited to one buzz per 60 ms so a firefight is not a doorbell, and muted with the SFX
  slider.
* **Flinch.** `damage()` stamps `u.hurt`; `actors.mjs` gives him 0.2 s of being knocked off his
  axis, arms up. A new `hit` event (non-fire, ≥3 damage) throws jam in the air proportional to
  the damage and stains the grass on a big one.
* **The telegram.** A named man dying puts a small gold-edged card under the mission banner for
  2.8 s: his name, his kills, and one of eight lines ("He owed the mess three shillings."). It
  lives in the top edge strip, is `pointer-events:none`, and is asserted by `browser.mjs v6` to
  sit above 42% of screen height so it never covers the battlefield.

### 0.02.7 — landscape: done (the friendly card)

`@media(orientation:landscape)` puts up a full-screen "Turn me round." card with a tipping
helmet. Pure CSS, so it works even if the module never boots. A `Carry on sideways anyway`
button sets `html.rotate-ok` for anyone on a laptop who cannot rotate anything. Evidence:
`docs/evidence/v7-rotate.png`. The corridor is 26 m across by 55 m along by design; making the
camera fill a landscape window would show the map edge, so this is the honest answer rather
than the lazy one.

## Last done

- 2026-09-22 (managing session, verifying 0.04): all gates re-run independently and green —
  sim, campaign, 14 browser suites, release on build 0.04, artgate unedited. Evidence nit for
  the next agent: `v4-collapsed-{320,390,430}.png` actually capture the **armed** banner, not the
  collapsed one, because the sequence arms a grenade before the width sweep. The collapsed state
  is genuinely correct — see `v4-banner-collapsed.png` — and its geometry is asserted rather than
  eyeballed, so this is a filename problem, not a behaviour one. Worth fixing if that sweep is
  ever touched.

- 2026-09-22 (managing Opus 5 session, verifying V2 before push): the `v6` juice gate was
  **flaky — 1 failure in 3 runs** on "somebody must actually get hit". Its hit-wait loop gave the
  squad only 12x60 ticks to close the distance and land a shot. Raised to 60 iterations; 5 of 5
  green after. Still bounded and still a real assertion, so the gate is not weakened.
  Also note for future sessions: `tools/browser.mjs` takes the suite as a **positional** argument
  (`node tools/browser.mjs v1`). Passing `--suite v1` silently runs only the generic boot
  scenario and prints PASS — a false green that fooled this session once.

### 2026-09-22 — Opus 5 relay session (third agent): M1.5 art pass finished, M9 closed

**Inherited situation.** The agent before me did a large unrecorded slice of M1.5 between 01:54
and 01:57 (`terrain.mjs`, `scene.mjs`, `forest.mjs`, `landscape.mjs`, `props.mjs`, new
`tools/art.mjs`) and was cut off before writing any of it down. The `m9-*.png` evidence predates
that work. **Never judge this build by an old screenshot — reshoot with `node tools/art.mjs`.**

**The camera. This is the one that had failed twice, and the diagnosis was wrong both times.**
The pitch was never the problem: it measured exactly 16.000° and `tan(pitch) = 0.2867` against
the 0.287 the brief implies, in both earlier builds. What made the frame read as a plan view was
the **lens**: a 26° FOV from 110 m up is near-orthographic, so every tree in frame was seen from
the identical angle and none of them showed a side. The tilt is unchanged at 16°; the lens is now
38° and the camera sits at 78.5 m. Measured on the live camera by `tinpotTest.tilt()`:

```
pitchDegrees 16.000   fov 38   cameraHeight 78.54 m   cameraZ 22.52 m
worldOffsetPerMetre (tan pitch) 0.2867      (16 deg implies 0.287)
60 trees >=3 m in frame · canopy-vs-own-trunk-base screen separation:
    median 23.13 css px, min 4.84 px, 96.7% displaced up-screen
foreshortening gradient near-to-far: 8.88x   (1.0 would be orthographic)
```

Two honest caveats on those numbers, both asserted in `tools/browser.mjs art`:
* **96.7%, not 100%.** The camera sits at z = +22.5, so the two sampled trees that are *beyond*
  it project the other way. That flip is the perspective working, not a bug.
* Trees directly under the camera (bottom of frame) are still close to plan view; the ones at
  the top of frame are seen from ~35° and show a lot of side. That 8.88× spread is exactly the
  "a tree at the top and a tree at the bottom foreshorten differently" the critique asked for.

**Bugs found by looking at pixels rather than at pass counts** (each one confirmed by isolating
it, not by guessing):

1. **The white grass slivers were a normal-flip.** A blade is a vertical sliver; seen from above
   roughly half of them are back-facing, and three's `DOUBLE_SIDED` branch in
   `normal_fragment_begin` multiplies the shading normal by `-1` for those. The old grass was
   `MeshBasicMaterial` so it was unlit and glowed everywhere including in deep shade; my first
   lit version went *black* on the back-facing half. Fixed by forcing `normal = vNormal` after
   the chunk. Grass is now Lambert, shadow-receiving, corridor-only, off the track, thinned by
   the same noise mask that colours the ground, and tinted toward `0xaebe72` from whatever the
   ground under it is — so it is always a *lighter* version of its own ground.
2. **The grade was crushing red and blue to literally zero.** The contrast step was a per-channel
   linear ramp about a 0.25 pivot; every channel below 0.048 clipped. Sampled pixels in the lower
   half of the frame were `(0, 82, 0)` — pure green, no red, no blue. That is where the acid
   green and the "flat black ellipses" came from: the ellipses were ordinary lit props whose
   colour had been clipped away. The contrast is now applied to **luminance only** with a
   monotonic S-curve (`P=0.25, K=1.40`) and the chroma ratio is preserved.
3. **`metalness` with no environment map renders black.** The puddles were `metalness: 0.65`,
   which in a scene with no IBL is a black disc. They are dielectric with `roughness 0.09` now
   and get their wet look from the sun's specular.
4. **The HUD rebuilt its whole `innerHTML` every frame during a firefight** (HP and the clock
   both move, and the signature was the whole model). That silently ate taps: a touchstart landed
   on a button, the DOM was replaced before the touchend, and Chrome then had nothing to fire
   `click` on. The m5 weapon-rail gate caught it. Structure is now rebuilt only when the
   *structure* changes; the moving numbers are written into cached nodes.
5. **Hard-coded enemy spawns landed inside the treeline** once the corridor bent properly, and a
   unit standing in a blocked cell can never route out of one. Three enemies sat in the trees for
   the whole of mission 4 and the "clear" objective could not be met. Deployments are now snapped
   to a walkable cell and the enemy line is laid out relative to `centre(z, map)`.
6. **The enemy AI would stop to fire with no line of sight.** Blue on one side of a boulder, red
   on the other, five metres apart, neither able to shoot, for the remaining eighty seconds of
   the mission. `updateAI` now requires `lineClear` before it stops; no shot, no stopping.

**The art pass itself** — camera lens, a real in-engine grade (haze, warm/cool split tone,
luminance S-curve, vignette) replacing the CSS overlay the title screen used to fake it with,
four tree species with a 14% "emergent" size tier, a blended ground palette with straw/mud/damp/
moss, a separate track ribbon mesh so the ruts stay crisp and the edge feathers, scrub + saplings
at the treeline, craters with real bowls and upthrown clods, a warm ground pool under burning
trees, boot dust, and soldiers with bodies.

**Soldiers.** Rebuilt in `render/actors.mjs` as four merged meshes (body, helmet, each leg,
arms+rifle) so a full squad is ~30 draw calls instead of ~200. Shoulders, chest, webbing, pack,
boots that swing, a rifle held out in front, three readable silhouettes (idle compact with the
rifle down, running with legs fore and aft and a forward lean, firing with a braced stance and
recoil driven off `u.cooldown`). The helmet was deliberately shrunk to 0.63 m across: at 16° a
Cannon-Fodder-sized tin hat eclipses the entire man.

**Final art gate** (`python3 tools/artgate.py docs/evidence/m1b-portrait.png`, exit 0):

```json
{"file":"docs/evidence/m1b-portrait.png","w":780,"h":1688,
 "hi_frac":0.0077,"lum_p05":0.1083,"lum_p50":0.3104,"lum_p95":0.6634,
 "lum_std":0.1615,"contrast_ratio":4.508,"hue_buckets":6,"warm_frac":0.1628,
 "sampled":188092,"diff_pct":99.01,
 "gates":{"redrawn_vs_baseline>=50%":true,"contrast_ratio>=3.0":true,
          "dark_anchor lum_p05<=0.16":true,"lum_std>=0.16":true,
          "hue_buckets>=6":true,"warm_frac>=0.05":true,
          "midtone 0.28<=p50<=0.52":true},
 "PASS":true}
```

`tools/artgate.py` was not edited. Thumbnails side by side in
`docs/evidence/m1-vs-m1b-thumbnails.png` — **left is the old `m1-portrait.png`, right is the new
`m1b-portrait.png`**, and they are trivially distinguishable at 150 px wide.

**M9.** `node tools/release.mjs` plays all six missions with real touch input, buys three
upgrades between them, checks every HUD control at 320/390/430 px wide for 44 px targets and for
soldiers not hiding behind the cards, and asserts zero console/network/shader errors and no
external requests. Green.

### Earlier sessions

- M8: live AI-vs-AI title, procedural insignia, supplied context music with crossfades, synthesised SFX and persistent music/SFX sliders. No soundtrack files changed.
- M7: infantry armour/rifle tiers, progress-gated extra weapon slot, working roster assignment, funny skippable briefings. Test storage uses `tinpot.test.campaign`, separate from player saves.
- M6 browser miss was stale frame state after test reset/advance. Harness allows reset to paint and reads returned simulation snapshots.
- M5: grenade arcs/fuses/friendly fire, falling canopy and stumps, wind-biased fire, live grid rebuild, instanced fire/smoke/embers/scars.
- M4: four cards, per-card pips and squad rail, edge banner/counters/pause.
- M3: auto targeting, line-of-sight, flight/cadence, patrol/advance AI, helmet pop, persistent jam. Feel gate: readable and silly; first duel forgiving, not tense yet (83.75 HP survivor).
- M2: fixed-step pure simulation, blocked-cell grid and flow routes, tap-to-move; deterministic replay, negative arrival control.
- M1: local bloom composer, instanced canopy, moving grass, winding track.
- M0: boot at DPR 2, no scroll, no console errors; blocked import shows a readable reload panel.
- 2026-09-22 — first Opus 5 session: folder tree, ten music tracks from SKYHAMMER into
  `audio/music/` with `tracks.json`, `BRIEF.md`, `ARCHITECTURE.md`, `PLAN.md`, `AGENTS.md`.

## Measured performance — read the profile, not the number

```
Apple M5, headless Chrome 153 with ANGLE Metal, 390x844 at DPR 2,
CPU throttled 4x, real-time live title battle (the heaviest scene in the game):
    60.00 fps · median frame 16.7 ms · p95 16.8 ms
    355 draw calls · 276 017 triangles · 116 geometries
```

That is **pinned to vsync**, not headroom — the p95 of 16.8 ms means the frame never overran, but
it does not tell you how much slack there is, because the measurement cannot see below 16.7 ms.
It is an M5 desktop GPU with a 4× CPU throttle, which models a slow *CPU* and a fast *GPU*; a
real mid-range phone has the opposite shape. **Nobody has run this on a phone.** Treat "60 fps on
a phone" as unproven; what is proven is that the CPU side has 4× of margin and the geometry
budget (276 k triangles, 355 calls) is modest.

### The harness GPU trap — this cost an hour

`~/.claude/bin/cdp start` hardcodes `--use-angle=swiftshader`, so the default headless Chrome
here **software-renders** and this game runs at roughly 9 fps in it. That is not a perf problem
in the game; it is the launcher. Two consequences:

* Any fps number taken without overriding it is meaningless.
* Tests that wait a fixed number of milliseconds for `window.tinpot` to refresh (it is written
  once per `requestAnimationFrame`) become flaky, because a "frame" is 110 ms.

Start it like this instead, and keep the launch and the harness run in one shell execution:

```sh
~/.claude/bin/cdp stop 9223; ~/.claude/bin/cdp start --port 9223 -- --use-angle=metal
node tools/release.mjs
```

## Next

0. **What 0.02 left undone, honestly:**
   * Difficulty. The harness pilot now wins all six missions losing **one** man in total (on
     *A Slight Detour*, rifles only). That pilot plays better than a thumb does, but if Aaron
     finds it soft the levers are `heavy.damageBonus`, the `mix`/`count` in `data/missions.mjs`,
     and the red damage multiplier `.65` in `combat.mjs`. `tools/campaign.mjs` re-tests in two
     seconds.
   * Nobody actively seeks cover except a blocked red near sandbags. Blue never takes cover on
     its own; the player has to put them there.
   * The flamer is only exercised by the harness on missions 4–6 with one carrier. A squad of
     four flamers has never been played.
   * Grenade and flamer ids diverge by *id only* across a save/reload (`eventId` is not in the
     snapshot). Positions, lives and propagation are identical; asserted above.

0b. **What 0.03 left undone, honestly:**
   * The **reach ring is weak**. A 16 m grenade reach is nearly the whole 26 m viewport, so the
     ring reads as a faint line across the screen rather than a circle. It is correct and it is
     gated, but if Aaron does not notice it, the cheap fix is a shorter grenade reach (which is
     also a balance change) rather than a louder ring.
   * Coaching is **per campaign, not per player**: `campaign.taught` lives in the save, so
     starting a new campaign teaches everything again. That is probably right, but it has not
     been asked about.
   * There is **no coaching for fire or the flamer**, which are the two things most likely to
     kill his own men after grenades.
   * The arming delay is **2.4 s + the 1.7 s grenade fuse**, so tap-to-bang is ~4 s. It has only
     been felt by a harness. If it drags, `ARM_SECONDS` in `js/core/world.mjs` is the one knob.
   * Grenadiers still **auto-lob** at anything in range without arming. That predates 0.03 and
     it is arguably now inconsistent with the deliberate-tap flow.

0c. **What 0.04 left undone, honestly:**
   * The collapse is **time-based only** (7 s). It does not re-open for anything except pause
     and the armed grenade — not for an objective change, not for the last thirty seconds of a
     hold. If he ever wants to re-read the objective he has to pause.
   * The **kill tally is untouched** and still sits at `top:100px` over the grass whenever no
     high coach card is fading it out. It is 9 px text at the right edge; nobody has complained.
   * The **briefing has only ever been dismissed by a machine.** It is a full-screen modal on a
     game whose owner dislikes modals — it is here because he asked for a pause, and it is
     once-ever, but it is the single most likely thing in 0.04 for him to bounce off.
   * Grenadiers still auto-lob without arming, and **deliberately still keep the grenade when
     they do** (D36). So a man can throw one without the player's order and the pips will still
     say grenade. That is consistent with "the order you gave has been carried out", but it is a
     second rule the player is never told.
   * The armed banner shows **one** line of copy. Out of reach, it drops the "tap anywhere else
     and they march" half to make room for the warning. Both facts are never on screen at once.

1. **Put it in front of a human with a phone again.** Ask specifically: is the battlefield clear
   now; does the folded banner ever leave him unsure what the mission is; did the one-time
   grenade briefing help or annoy; and after a grenade goes off, is it obvious the next tap is a
   march?
2. Aaron's `projects.js` entry, and copy `docs/evidence/tinpot.jpg` to
   `/assets/screenshots/tinpot.jpg`. Both are deliberately not an agent's job.
3. Optional polish that was considered and not done: true screen-space heat shimmer over burning
   trees (the warm ground pool covers most of the win for none of the cost); a taper on the
   soldier torso, which from above still reads slightly boxy; more hue separation in the canopy
   (`hue_buckets` is 6, exactly on the gate).

## Known broken / open questions

- **Nothing is known broken.** `node tools/sim.mjs`, `node tools/campaign.mjs`,
  `node tools/browser.mjs <shell|m2..m8|art|v1|v3|v4|v6|teach>`, `node tools/release.mjs` and
  `python3 tools/artgate.py docs/evidence/m1b-portrait.png` are all green on ANGLE Metal as of
  the 0.03 session. `teach` was run 4x for flake and was 9/9 every time.
- **The HUD is written on the next rAF, not inside `advance()`.** A gate that advances the sim
  and then immediately reads DOM text gets the *previous* frame's text. This bit the
  falls-short scenario once; the fix is `await sleep(150)` after the advance, and it is the
  first thing to suspect in a new UI gate that reads a countdown.
- The `art` suite's `minPx` assertion filters to trees ≥3 m tall. Bushes are 1–3 m and legitimately
  project only 4–5 px, which is not evidence about the camera.
- `tinpotTest.advance(n)` runs sim steps synchronously while the rAF loop is *also* stepping, so
  a test that mixes `advance()` with wall-clock `sleep()` is mildly non-deterministic. It has not
  caused a failure since the HUD fix, but it is the first thing to suspect in a flaky gate.
- The corridor is wider and bendier than it was, which changed where hard-coded test coordinates
  land. `tools/browser.mjs m5` now lobs at `(-7, 12)` instead of `(8, 12)`, because `(8, 12)` is
  open meadow on the new clearing map. No assertion was weakened to make anything pass.

## Decisions log

Append one line per decision that a later agent would otherwise re-litigate.

- **D1** Three.js 0.180.0, shared vendored copy at `gms/lib/three/0.180.0/`, never a CDN.
- **D2** Soldiers are procedural Three.js meshes with procedural animation, not rigged GLBs. At
  this camera height the helmet is 12 px across; a rig is cost with no visible return, and the
  repo's rigged PolyPerfect characters are aimed at a far closer camera.
- **D3** `js/core/*` is pure and Node-importable. Balance is tuned in `tools/sim.mjs`, not in the
  browser.
- **D4** Permadeath with a named roster is in from M6. It is the heart of the genre, not a
  hardcore mode.
- **D5** Maps are territory reused across missions; mission N's destruction and fortifications
  persist into mission N+1 on the same map.
- **D6** Warm ochre sunlight against cool teal forest shade; winding meadow has a dirt footpath and clustered broadleaf canopy. All landscape assets are procedural.
- **D7** First duel teaches automatic shooting gently. Formation separation, grenades and later waves provide risk. Pips have real 44 px hit areas; narrow phones may stack pips vertically rather than shrink targets.
- **D8** Grenadiers auto-throw at enemies; with grenade selected, tapping ground designates one volley there. Switch to rifle to issue a march.
- **D9** Six missions across Bramble Common and The Unnecessary Cut. Inspector Biscuit wears gold and follows nearby soldiers. Save schema 1 preserves active combat, RNG state, deaths, promotions, burn scars and fortifications.
- **D10** Grenades unlock after mission 2, and Extra pockets equips the second rail slot. Only infantry is in this slice, so armour applies to that class.
- **D11** Browser touch-release unlocks audio. Title stays silent until interaction. Attract mode is a separate real simulation and never writes campaign progress.
- **D12** Southern deployment moved to z=10 so all four soldiers sit above even stacked 320 px weapon cards. A Slight Detour gets two timed reinforcements.
- **D13** Escort follows within 1.3 m, avoiding a stable 2 m gap behind the formation tail. Save snapshots include the fire automaton substep clock and destination marker.
- **D14** **The camera keeps the brief's 16° tilt and gets a 38° lens.** The tilt was never what
  made the frame read top-down — a narrow lens from 110 m was. Do not "fix" the camera by
  increasing the pitch; measure it with `tinpotTest.tilt()` first.
- **D15** **Soldiers lean 11° toward the camera inside their own group** (`lean` group in
  `actors.mjs`, between position and yaw). It is a character trick, not a camera one, and it
  nearly doubles how far up-screen the helmet sits from the boots. Without it the tin hat covers
  the whole man and you are back to dragging counters. The helmet is 0.63 m across for the same
  reason.
- **D16** **The grade lives in one shader pass in `scene.mjs`, and its contrast step is applied
  to luminance, never per channel.** A per-channel curve clips red and blue to zero in the
  shadows and turns the frame flat green. The title screen's `.title-vignette` CSS overlay stays,
  but it is now decoration on top of a real grade rather than the only grade in the game.
- **D17** **Grass is lit (`MeshLambertMaterial`), with the `DOUBLE_SIDED` normal flip undone in
  `onBeforeCompile`.** Unlit grass glows in shadow; lit grass with the default double-sided
  normal goes black on half the blades. Both have shipped in this project and both looked awful.
- **D18** **Nothing spawns at a hard-coded `x`.** Deployments snap to a walkable cell
  (`snapTo` in `world.mjs`) and enemy lines are laid out relative to `centre(z, map)`. A unit in
  a blocked cell can never path out of one, and `route` is deliberately left strict about that so
  the bug stays visible instead of being papered over with a teleport.
- **D20** **Fire is a field, not a flag.** `fireIntensityAt(w,x,z)` is the single source of
  truth for "how much is this point burning", read by damage, by panic and by the route mask.
  Anything new that burns adds to `w.burning` or `w.fires`; nothing gets its own damage rule.
- **D21** **The AI has no fallback through fire; the player does.** `ai.mjs safeRoute` returns
  an empty path and the unit waits (`u.ai='waits'`). `orderMove` falls back to the plain route.
  Marching your own men into a firestorm must stay possible and must stay the player's idea.
- **D22** **A tree burns once (`t.charred`).** Otherwise the ground fire a tree leaves behind
  relights the tree, and the wood never stops burning. A sim test hung on exactly this.
- **D23** **Armour is skipped for `cause==='fire'` and `'flame'`.** That is the heavy's whole
  design: rifles are the wrong answer, a grenade or a flame is the right one.
- **D24** **A man who is alight ignores new orders until he stops burning** (`u.panicking`).
  Without it, a player (or a harness) tapping once a second drives burning men back into the
  fire they are running out of.
- **D25** **Sandbags are LOW cover: never in the pathing grid, always in `lineClear`, and
  transparent to anyone within `HUG` = 1.6 m.** Blocking the cells would wall the corridor off;
  blocking shots without the hug rule would make the bags useless to their owner.
- **D26** **Retry rolls the whole deployment back together** — roster, slots, credits,
  upgrades, maps and the mission index. Restoring only the roster would let you farm brass off
  your own casualties.
- **D27** **Audio elements are pooled one per track and never have `src` cleared.** Clearing it
  aborts an in-flight media fetch, which the release gate counts as an error and instant retry
  triggers every time.
- **D28** **Landscape gets a card, not a camera.** The corridor is 26 m x 55 m by design; a
  landscape camera shows the map edge and the empty world past it.
- **D29** **A grenade tap ARMS; only a tap on the marker cancels.** Tapping elsewhere is a march
  order and the grenade still goes, thrown from wherever the man ends up — so walking away makes
  it fall short. That asymmetry is the design: it makes abandoning your own grenade a decision
  rather than an accident. `ARM_SECONDS=2.4`, `CANCEL_RADIUS=2.2` m (~66 px at this camera).
- **D30** **Nothing in 0.03 makes the game safer.** Friendly fire, fire damage and the enemy mix
  are untouched. Every item is legibility: the danger stays, the surprise goes.
- **D31** **`campaign.taught` is the coaching ledger and lives in the save.** A lesson is shown
  until the player has DONE the thing and then never again. Anything new that teaches must
  retire itself the same way, or it becomes nagging.
- **D32** **The coach card is a sibling of `#hud`, not part of its markup.** `hud.mjs` rebuilds
  its innerHTML only when the *structure* changes, because rebuilding mid-gesture eats taps;
  the coach changes every frame while a grenade is armed, so it must stay outside that markup.
- **D33** **The armed marker and the reach ring draw with `depthTest:false`.** `terrain.mjs`
  only ever RAISES the forest floor, so a wide ring at ground level is buried outside the
  corridor and reads as a dashed bug. They are UI affordances, so they go on top.
- **D34** **`holdLine` and `enemyZ` are on missions 1 and 2 only.** They are a teaching device,
  not a difficulty change, and `tools/sim.mjs` asserts missions 3-6 have no `holdLine`. Wave
  reinforcements are never gated — a hold mission still has to be held.
- **D35** **The build number is one string, `VERSION` in `js/version.mjs`.** It prints on the
  title screen (`PATTERN 0.03`) and on `window.tinpot.version`, and `release.mjs` asserts both,
  so a deploy can be verified without a screenshot. Doc headings are versioned 0.01/0.02/0.03;
  **no suite, fixture, function or evidence filename was renamed to match.**
- **D36** **A grenade reverts its thrower to the rifle, but only when the player ORDERED the
  throw.** `stepArmed` reverts everyone it threw for; a cancel does not (he never spent it); and
  an **auto-lob does not revert either**. Reverting on auto-lobs was built first and thrown away:
  a grenadier lobs at the first thing inside 16 m, so selecting the grenade handed the rifle back
  a second later with no tap from the player, which reads as the weapon changing by itself. It
  also made a browser gate non-deterministic — a man who has just auto-lobbed is mid-cadence, so
  he is not in the set `stepArmed` throws for. The rule is *"the order you gave has been carried
  out"*, not *"a grenade left the map"*. The known 0.03 inconsistency (grenadiers auto-lob without
  arming) therefore stands, deliberately.
- **D37** **The pause button is positioned absolutely against the mission banner's own top-right
  corner.** The banner now changes shape three ways (open / collapsed / armed) and it carries the
  game's most-tapped control; a control that moves is a control that gets missed. Its rect is
  asserted identical across all three states at all three widths.
- **D38** **The armed-grenade readout takes the mission banner's space rather than new space.**
  `.banner-text` is hidden and `.armed-panel` shown, by class. Aaron's complaint about the 0.03
  warning card was not that it was illegible — it was that it was legible and in the way.
- **D39** **The banner collapse timer runs on SIM seconds, not wall clock.** A paused game must
  never count down while he is reading the objective.
- **D19** **Perf must be measured with `-- --use-angle=metal`.** The default `cdp` launcher is
  SwiftShader; see the performance section above.

- **D40** Speech is shipped Qwen MP3 assets, never a runtime call to the local AI server. The
  six designed references and transcripts preserve the cast for future generation.
- **D41** Voice identity follows `rosterId % 4`, not squad slot or current rank. Living-speaker
  checks apply both to queue selection and playback completion; no ghost acknowledgements.
- **D42** Commands supersede background welcome/idle remarks; urgent warnings can preempt them.
  This was driven by a real browser failure where the general delayed the first move reply.
- **D43** The radio gets its own volume and ducks music. Speaker feedback reuses existing cards;
  no new caption panel competes with the play field after the 0.04 screen-space feedback.

- **D44** Six training operations retain their modals. Field operations auto-continue on a shared
  map after seven seconds; territory exits and route forks require walking and confirming.
- **D45** Schema 2 keeps a cleared-field snapshot at crossroads; the saved world ID can differ
  from the provisional next mission. Route selection is validated and never inferred on reload.
- **D46** Same-territory transitions preserve live positions, HP and damage; new territories
  redeploy/heal. Retry uses the field deployment snapshot, including branches and prior history.
- **D47** Four plain acknowledgements receive 80% probability independently of joke count.
  Going now is movement-only. Existing radio priorities and living-speaker checks still apply.
- **D48** Depots are optional safe stops. A +35 HP dressing is once per objective, upgrades affect
  the live squad, and shop/journal/ending scroll on short phones. Exit labels must not overlap
  one another or weapon controls; numeric bounds alone missed this in screenshot review.
