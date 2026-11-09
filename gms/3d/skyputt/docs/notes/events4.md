# events4 — notes (Deep Dive, Battle Royale Cup, twist weekends, taster rule)

Owner: `events4` agent. Status: **done** (see Test results). Nothing committed (manager commits).
No Star Station content used (star holes only show up in the working tree because star's registration is there).

## Yearly events (js/events/data/)
| series | name | dates (every year) | theme | holes | currency | twist |
|---|---|---|---|---|---|---|
| deep-dive | Deep Dive | 06-01 → 06-15 (World Ocean Day 06-08) | reef (fallback sky) | reef1 mir-fest3 reef3 mir-sky14 reef5 mir-fest8 reef9 (par 21, 21 pearls) | 🦪 Pearls | Sunken Reef holes + mirrored remixes in the reef theme |
| battle-royale | Battle Royale Cup | 09-03 → 09-26 | sky | sky1 fest5 mir-sky16 wood3 fest2 (par 14) | 👑 Crowns | 3 ghost-AI rivals on every hole, ball hits forced ON |
First runs `deep-dive-2027`, `battle-royale-2027`. Checked 2027–2040: Egg Hunt < Deep Dive < Sky Games < Cup < Spooky Open (late Easter ends ≤ 05-03).

Rewards: Deep Dive 6 goals (rounds, 7/14/21 pearls, 2 under, 800 pts) + 4 rank tiers, top title "Pearl Diver".
Cup 7 goals: play, **knock a rival out**, **finish ahead of 5 rivals** (cumulative), **win a round** (beat all 3),
knock out 5, 30 crowns, 900 pts; top title "Last Ball Standing". Both sit in the big-event budget (~1000+ coins).

### Battle Royale Cup mechanics
- `js/events/rivals.js`: before each round the real AI (`simulateRound`, full mode: worker in the browser, inline in
  node) plays the 5 holes for 3 rivals from a 6-golfer roster (power / banks / careful / lucky / pro / fast), skill
  0.3–0.6. Seed = hash(run id + round number), so **the same round always brings the same rivals and the same
  recorded shots** (quitting and retrying replays it). Rival clocks are staggered +2.6 / 4.6 / 6.6 s so they don't
  leave the tee together. ~0.6 s on the Mac for 3 × 5 holes; a "rivals are warming up" card shows meanwhile.
- `js/game/play.js`: `allGhosts` option puts **every** ghost with shots on the hole (the story still shows one).
  `this.ghost` is now a getter for the first of `ghostList`; the step loop poses / steps / reads events for each.
  Ghost-vs-ghost hits happen too (both go live, deterministic in headless).
- `twist.collide: true` overrides the Ball hits setting. Rules as ballhit.md (knocked out = +1 to the owner).
- `EventRound` counts `hits` (rivals my shot touched) and `knockouts` (a rival my shot struck — or a rival it then
  ran into — goes out of bounds). Hole cards show the rivals' real (knock-adjusted) scores.
- Scoring: `scoring { knockout: 15, beat: 10 }` points; `twist.bonus { knockout: 2, beat: 1 }` crowns on top of pickups.
  Beat = strictly fewer strokes than the rival's round total. Progress gains `knockouts`, `beaten`, `wins`
  (older saves without them read 0 and score as before).

## Remixes (js/events/remix.js)
`mir-<id>` = hole <id> mirrored left↔right as a pure data transform (point x, `at` x, `u`, patch `u0/u1`, wall sides,
banks, loop shift, voids, branches). Windmills turn the other way (sail stays on the same side of its spar); movers
get phase + π. Event-only: not in COURSES, so the map, daily pool, server port, online rooms and AI calibration never
see them; own id → own pickups ledger / records. `holeDef()` resolves the prefix. Tested on all 63 holes: double mirror
= original, straight putt lands on the mirror image (63/63); the AI holes out every remix in use within par + 1.

## Weekend twist kinds (js/events/data/weekends.js)
| kind | name | holes | twist | currency |
|---|---|---|---|---|
| bumper | Bumper Bash | 5 with ≥ 2 bumpers | each bumper bounce of your shot = +1 bonk, max 3 a hole (banner) | 💥 Bonks |
| mirror | Mirror Weekend | 5 par ≤ 4, all `mir-` | every hole mirrored | 🪞 Mirror shards |
| pure | Pure Putt | 5 par ≤ 4 | no helpers (tray hidden), 16 pts per stroke under par | 💠 Pure gems |
Rewards ≤ 175 coins, one wooden chest, ≤ 2 helpers (same budget as the others). New kinds carry
`since: '2026-11-16'`: the weekend already announced (Nov 13, Fewest Strokes) keeps its kind; from Nov 16 seven
kinds rotate, interleaved plain/twist: **Nov 20 Bumper Bash**, Nov 27 Ace Hunt, Jan 8 Mirror, Jan 15 Fewest, Jan 22 Pure Putt…
Mirror skipped by the daily agent ("no mirroring in the engine") is now possible as data.

Also: weekends now respect `dailyFrom` on courses and themes (a course / theme joins weekends from its release date),
so shipping Star Station (dailyFrom 11-23) can't reshuffle weekends already announced or live. Side effect: the
Nov 13 weekend's theme is now frost (was sky) and its holes don't include reef — not live yet, nobody has played it.

## Taster rule (js/events/access.js) — Aaron confirmed 2026-11-09
Events may use holes from locked courses as a one-off **taster**; that never unlocks progress. A hole is a taster when
- its course is still gated (`lockedBy` not finished), or
- it is the gate of another course (sky9 → Hollow Woods, fest9 → Sugar Summit, sugar9 → Reef, reef9 → Star) and the
  player hasn't reached it on the map.
A taster is played and scored for the event (points, currency, ladder points/coins via meta) but records no best/stars,
marks nothing finished (so nothing unlocks) and stays locked on the map. The hole card says so; the event page tags
taster chips. Other holes keep the events2 behaviour; holes that already have a record count as open (old saves).
**This closes an existing leak**: Spooky Open / Frost Fair have sky9, Lunar / Sky Games have fest9 — playing them in an
event used to open Hollow Woods / Sugar Summit. Also applied to the Daily (DailyRound.keepsProgress), whose sky9 days
had the same leak; the daily pick is untouched (no dailypool regen needed).
Not covered: online rooms (host picks any course's holes; their own Round subclass) — flagged.

## Files
New: `js/events/{remix,access,rivals,round}.js`, `js/events/data/{deep_dive,battle_royale}.js`, this file.
Changed: `js/events/{events,calendar,screen}.js`, `js/events/data/{index,weekends}.js`, `js/game/play.js`
(multi-ghost, `keepsProgress` hook), `js/app/main.js` (playEvent → EventRound + extra opts; 3 lines, not star's),
`js/daily/round.js` (taster override), `css/app.css` (2 rules), `tools/events_test.mjs`, `tools/shots_cdp.mjs` (`events4`).

## How to test
```
node tools/events_test.mjs
~/.claude/bin/cdp start --port 9587
node tools/shots_cdp.mjs events4 --port=9587 --own --out=DIR [--only=lists,deep,cup,bumper,mirror,pure]
```
URLs: `?eventdate=2027-06-08` (Deep Dive), `2027-09-10` (Cup), `2026-11-20` (Bumper Bash), `2027-01-08` (Mirror), `2027-01-22` (Pure Putt).
