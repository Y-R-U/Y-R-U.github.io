# polish3 — notes (2026-11-09)

Owner: `polish3` agent. Status: **done**, nothing committed (manager commits). Screenshots in
`polish3_shots/` (gitignored). Stayed out of js/story/* and the story data/tests (`story7`): the
working tree also holds story7's edits in js/story/*, tools/story_test.mjs and **tools/shots_cdp.mjs**
(not mine), so commit those hunks apart.

## 1. Battle Royale Cup: rivals tee off at once, ~1 s apart
events4 played each rival's round from clock 0 and then **shifted** every recorded shot by 2.6 / 4.6 /
6.6 s. With the AI's 1-2 s of thinking, first putts came at 4-8.6 s, after the fly-over (3.2 s). The shift
also put kinematic replays out of step with movers, because the path was simulated against movers at t, not at t + shift.
Now each rival's record is **simulated** starting at its slot: `STAGGER = [1, 2, 3]` s, with 0.3 s of
thinking before the tee shot (`simulateRound({ start, firstThink })` → worker `round { t0, firstThink }` →
`playHoleSync({ t0, firstThink })`). Measured on the Cup's 5 holes for rounds 0-2: tee shots at
1.00-1.20 / 2.00-2.15 / 3.00-3.42 s. The planner adds any wait it chooses to time a mover. Skip the
fly-over and you watch them tee off. Sit through it and the last one leaves as the camera lands, so there
are balls out there to hit early.
Deterministic as before: same seed and RNG stream, and the rng draw for the first think still happens.
The story's defaults (t0 0, firstThink null) are unchanged, so its rivals record exactly as before.
Shots: `polish3_shots/e4-cup-*`.

## 2. Bumper Bash: bonks pay once per hole per event run
Bonks paid on every replayed round. Now they behave like pickups: `progress.bonks { holeId: most paid }`,
`EventRound` gets `bonked` (from the event screen) and only pays bounces above that number on the hole.
The in-round banner says "paid in an earlier round" for the others, and a replayed hole inside a round
counts its best attempt. That caps a run at 5 × 3 = 15 bonks plus pickups. The g3 goal (pickups + 10) is
still reachable. Rule text: "(up to 3 a hole, paid once per hole per event)"; the blurb says "once per
event". Helpers: `newBonks`, `noteBonks` in js/events/events.js.
Not changed: Battle Royale crowns for knock-outs and beaten rivals still pay every round. Its goals are
cumulative by design ("knock out 5"), and every round brings new rivals.

## 3. Online rooms and course locks: taster rule
Decision: fine. Rooms are social and the host picks any course. `OnlineRound.finishHole` already never
called `recordHole` or `markFinished`, so a room hole never wrote a best or stars and never unlocked
anything. That is the taster rule, made stricter. It is now explicit and documented:
`keepsProgress() { return false; }`, a header note in js/net/round.js, and a hole-card note
"Taster: <course> stays locked on your map" when the hole belongs to a gated course you haven't opened,
or is the gate hole of one (`tasterCourse` from js/events/access.js). Ladder points and star coins pay as
for any hole, the same as event tasters. Guarded by a source check in events_test (taster section).

## 4. Star Station / Jungle Temple backdrops vary per hole
`holeview` now passes `info.id` to themes. `backdropPlan(id)` (FNV hash → seeded rng) in
star/env.js and jungle/env.js picks:
- the side: station/array or pyramid/gorge swap left↔right, staying on opposite sides
- ±5 m sideways, ±10-12 m out, ±2-4 m up
- ±0.4-0.7 rad of yaw, mirrored with the side

That keeps them in a band around the original spots: ≥ ~25 m beyond the course edge and ≥ 58 m past its
far end, never on the line down viewDir. With no id (theme previews) the layout is the original one.
Same meshes and buckets, so the budget is unchanged: star 36-61 calls / 24-32k tris, jungle 50-69 /
22.6-30.6k at high, matching star.md and jungle.md. Before/after: `cmp-star-l.png`, `cmp-jungle-l.png`
(left = old shots from star_shots/jungle_shots, right = now). Not varied: the small isles/ruins and giant
trees. They frame the tee, are symmetric already and are cheap.

## 5. "Update available" banner (protogate), checked in a browser
Script: scratchpad `banner.mjs` (CDP; imports js/net/net.js in the page and calls
`net.noteProtocol(3, 2)` for "update" and `(3, 3)` for "blocked"), title and a hole, at 412x915 and
1440x900. Before: `banner-before-*`. On the title it was fine. **In a round it covered the HUD top bar**
(Hole / Par / Strokes and the pause button) on the phone, and on desktop the text wrapped to 2 lines in
420 px.
Fix (css/online.css): while `#hud` is shown the banner sits under the top bar and gem pill
(`top: 104px + safe area`), and the width is now `min(540px, 100% - 24px)`. After: `banner-after-*`. No
horizontal overflow and no console errors.

## 6. Mirror Weekend icon
`🪞` (Unicode 13) rendered as a blob in headless Chrome and on older phones. The currency is now
**✨** and the rule line uses **↔️**. Both are Unicode 6-era glyphs that are safe on Android and iOS.
The icon goes into both HTML and escaped text, so a glyph is safer than inline SVG.

## Files
js/ai/{round,worker,index}.js (start / firstThink options), js/events/rivals.js, js/events/round.js,
js/events/events.js, js/events/screen.js, js/events/data/weekends.js, js/net/round.js,
js/game/holeview.js (info.id), js/themes/{star,jungle}/env.js, css/online.css, tools/events_test.mjs,
this note.

## Tests (2026-11-09)
physics 25/25 · holes ok · events all passed (new: tee-off timing, bonks once per hole, online taster guard)
· daily 87/87 · meta, store all passed · ballhit 46/46 · online 50/50 · story all passed (with story7's
tree) · boards 26 ALL PASS against tools/server_run.sh (:8098, protocol 2) · server/test.sh ALL PASS.
No daily change, so no daily_pool regen needed (weekend data only touched the Mirror icon and the Bumper blurb).
Browser (CDP, 412x915 + 1440x900, no console errors): star_shots / jungle_shots 1-9 (`bd-*`), the banner
script (`banner-before-*`, `banner-after-*`), `shots_cdp events4 --only=cup,bumper,mirror` (`e4-*`): Cup and Bumper rounds played to the end (Bumper:
1 bonk paid → save `bonks {reef6: 1}`). The Mirror round stalled mid-play in the harness's drag loop (the box
was shared with story7's Chrome) and was stopped after its page, hole-1 and two hole-card shots, so it has no
end-of-run console summary.
Note: the Bumper Bash g3 goal (pickups + 10 bonks; 26 on Nov 20) now needs 10 of the 15 bonks a run
can pay. It is reachable over a weekend but tighter than before. Lower it to pickups + 8 if it feels harsh.
