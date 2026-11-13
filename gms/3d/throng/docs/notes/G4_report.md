# Lane G4 report — M4 gameplay: modes, events, seasons, cloud save, loose ends

Nothing was committed, pushed, deployed or sent to the box. Nothing outside `gms/3d/throng/` was touched;
`/lib/auth/` was only read. No `js/render/**`, `js/world/**` or `server/**` file was edited.

## What exists

| File | What |
|---|---|
| `js/sim/sim.js` | `createSim({ mode })`: `classic` (unchanged, hash-pinned), `teams`, `koth`, `lcs`, `infection`. Mode state lives in `state` + per-crowd `team/score/out/horde/infections/boost`; new events `bleed`, `infect`, `zone`, `shrink`; `elim.by = -1` for a bleed-out; ranks follow the mode's score; `serialize`/`restore` carry it (exact continuation tested per mode). Mode randomness has its own RNG stream (`mode:seed`), so Classic draws nothing extra |
| `js/sim/bots.js` | Mode-aware bots: never fear or hunt allies, fear the horde ×1.4, horde bots hunt humans (chase range ×1.7, score ×2.4), King bots contest or hold the zone (wander inside it while biggest), LCS bots move inside the *next* circle 8 s before a shrink and score anything outside it ×0.05 (flee cells outside −80) |
| `js/sim/match.js` | `applyModeLooks()`: Teams = even crowds Blue / odd Red in four shades each (practice bots renamed "Blue Jays", "Red Foxes"…); Infection = a bot (never you if there is a bot) is patient zero in horde lime `#a4ff1a` |
| `js/config.js` | `MODES` (every mode knob), `MODE_ORDER`, `SIM.recruitValue` (events) |
| `js/meta/events.js` (new) | The event calendar (pure function of UTC time), event sim overrides and looks, Mode of the Day, monthly cup |
| `js/meta/season.js` (new) | 28-day seasons from Mon 2 Nov 2026, rollover reward + trophy + soft reset |
| `js/meta/progress.js`, `save.js`, `leagues.js` | Mode payouts (only Classic rated), cup, seasons, `modeStats`, `trophies`; save fields added with defaults (old saves migrate); Bronze retune |
| `js/net/*` | Mode block in snapshots (Classic snapshots unchanged byte for byte), new events on the wire, emotes guest→host→all inside 5-byte input frames, `meta.mode` + `meta.events`, guests predict with the meta's config, quick-match mode rotation, LCS late joiners never get an out crowd. `SIM_REV` 2. Protocol stays 1. See docs/NET.md |
| `js/ui/hud.js` | Mode pill (King points + holder + move timer; LCS alive count + shrink timer; Infection survivor/horde score; Teams score + merge boost), Teams score bar (landscape/desktop; portrait folds it into the pill), DOM zone rings via `r.project` when the renderer lacks `setZones`, off-screen arrow to the crown zone / to safety, LCS "GET INSIDE THE CIRCLE" banner + red vignette, horde badges/rows, OUT rows, emotes on leaderboard rows for off-screen crowds, mode toasts |
| `js/ui/minimap.js` | Zones (crown filled gold, next dashed; safe circle with the outside tinted red), horde colour |
| `js/ui/menu.js`, `eventsheet.js` (new), `panels.js`, `results.js`, `online.js`, `pause.js`, `sharecard.js` (new) | Mode strip under the logo (Classic first, ×1.5 tag on the featured mode, PLAY says "PLAY KING" etc.), live-event banner with countdown, season banner after a rollover, Events sheet, Events nav button, trophy shelf + per-mode wins in Profile, Vibration toggle, mode-aware results + share card, host mode picker in private rooms, "TAP AGAIN TO LEAVE" in unrated play |
| `js/cloud.js` (new) | br8t account via `/lib/auth/localsync.js` |
| `js/main.js` | All of the above wired; `?mode=`, `?event=`, `?nocloud=1` test hooks |
| `tools/sim_test.mjs`, `meta_test.mjs`, `net_test.mjs`, `net_client.mjs`, `net_cdp.mjs`, `league_tune.mjs` (new) | New suites and arms (below) |
| `docs/CONTRACT.md` (sim section), `docs/NET.md`, `docs/notes/G_requests.md` | Updated |

## Mode rules as built

Common: 8 crowds, same map, pedestrians, pickups and steal rules as Classic unless stated. Rank (and so the crown and
`state.leader`) follows the mode's score.

- **Classic** — unchanged. sim_test pins the stub-map seed-7 hash `b8a3eae1` (the pre-M4 value). The real-map hash is
  also unchanged (`cc249bd5`), but it is only printed, because lane R owns map.js.
- **Teams (4 v 4, 2:00)** — even crowd indices Blue, odd Red (you are always Blue in practice and on the ladder).
  - Team score = the sum of the side's live counts.
  - Teammates never steal from each other. While two teammates touch, both get a **merge boost** (reach ×1.3,
    held 0.5 s).
  - Rank = team score first, then count, so places 1–4 are the winning side. "Won" on the results screen means
    your side won. Results show the team totals and "You brought N of M".
- **King of the Plaza (2:00)** — the crown zone starts on the plaza nearest the centre and moves every 30 s to a random
  other plaza (more than 25 m away), r = clamp(plaza r, 15, 24).
  - The next zone is announced 6 s ahead (dashed ring + arrow).
  - Each tick the single biggest crowd whose leader is inside the zone scores 1 pt/s. A tie scores nobody.
  - Highest points wins. Crowd size is only the means.
- **Last Crowd Standing (1:30)** — no respawn (`out`).
  - The safe circle starts at r 175 around the city centre and shrinks in four stages: 14–30 s → 110, 44–58 s → 72,
    64–74 s → 42, 78–86 s → 18. Its centre slides to a random non-central plaza.
  - Outside it a crowd bleeds `3 + 5 % of count` people/s (`bleed` events; bleeding to 0 = out, `elim.by = −1`).
  - Last crowd left wins. Otherwise, at the whistle, the biggest alive crowd wins; out crowds rank by how long they
    lasted.
  - Your own knock-out shows "OUT!" and the camera follows the leader.
- **Infection (2:00)** — one bot crowd starts as the horde (50 people, lime, speed ×1.15, reach +4 m, steals ×1.5
  from humans).
  - A human crowd fully absorbed by a horde crowd rises as horde 1.2 s later on the same spot, with ≥ 20 people.
  - Horde crowds never steal from each other. Humans still eat humans (and respawn human).
  - Survivors score 1 pt per second alive, plus 20 at the whistle if never infected. Horde crowds score +8 per
    infection.
  - The match ends at time or when everyone is horde.
  - The renderer recolours an infected crowd through `updateCrowdMeta` (the wave starts at the infecting crowd).

**Rating rule (D-G4-1, for REVIEW):** only Classic moves the ladder rating. The other modes on PLAY pay placement
coins/XP (Mode of the Day ×1.5), count for the monthly cup and per-mode stats, and the results screen says "unrated".
Leaving a non-Classic ladder match costs nothing but the coins ("TAP AGAIN TO LEAVE"). There's no fair placement-to-rating
mapping across modes with different variance: a Teams win is half luck of the draw, and LCS ends with 7 crowds out.

**Online:** private-room hosts pick the mode in the room lobby. Quick match rotates on a shared 10-minute UTC clock:
`classic, teams, classic, koth, classic, lcs, classic, infection`.

## Balance tables (all bots, real map; `node tools/sim_test.mjs`)

12 all-bot matches per mode (seeds 3000 + 23k). "early" = ended before the full time. "p0 place" = the ?auto bot's mean
place. "score(win)": Teams = winning side's total, King = winner's points (s in the zone), LCS = winner's survival s,
Infection = winner's points.

```
mode        end s   early  p0 place  score(win)  elims  notes
teams         120    0/12      3.67        2020    3.6  blue won 8, red 4
koth          120    0/12      4.08          40    2.7  zone held 89 % of play time
lcs            81    6/12      4.50          81    6.3  one crowd left in 6/12, 43 bleed events/match
infection     118    2/12      3.83         135    5.2  3.2 infections/match, all-horde 2/12, 4.2 horde crowds at the end
```

As ratios: in King the winner held the zone for 40 s of 120 (33 %), and the zone was contested or empty for 11 % of play.
In LCS the winner lasted 81 s of 90 (90 %).

Asserted per mode by sim_test, and each check is falsified by an arm:
- no mode times out or ends early except LCS (one left) and Infection (all horde);
- no NaN, and people are conserved, with `bleed` events counted;
- no crowd stands still for more than 6 s;
- ranks are 1..8;
- determinism, and an exact serialize → restore continuation in every mode;
- Teams: no steal between allies, score = sum of counts, rank 1 on the winning side, each side wins ≥ 15 %;
- King: total points = held time, never more than play time, held ≥ 50 %, the zone moves, the winner scores > 0;
- LCS: no out crowd comes back, rank 1 is never out while someone lives, ≥ 2 shrinks, ends after ≥ 40 s,
  ≥ 40 % end with one crowd, ≥ 5 bleed events/match;
- Infection: every infected crowd rises as horde and moves, horde count = 1 + infections, no early end without
  all-horde, ≥ 2 infections/match, not all-horde in > 80 % of matches;
- Diamond rosters in every mode don't stall.


Classic personas, the event sweep and the online/restore checks are unchanged in shape; see the full sim_test output.

### League curve (`node tools/league_tune.mjs --matches=24`; the ?auto bot as the player)

```
league     rating  throttle  skill  aggr   mean place  top-3  wins  final count   (24 matches each)
Bronze        20      0.91   0.42  0.95         2.96    71%   33%          557
Silver       206      0.92   0.49  0.98         3.00    54%   42%          577
Gold         440      0.94   0.56  1.01         3.13    58%   33%          529
Platinum     716      0.95   0.63  1.04         4.21    50%   17%          385
Diamond     1080      0.96   0.69  1.06         4.00    46%   21%          435
Master      1632      0.97   0.76  1.09         3.96    50%   17%          423
Champion    2272      0.99   0.83  1.12         3.79    54%   25%          501
Legend      3188      1.00   0.90  1.15         3.88    58%   21%          467
```
Before the retune (same tool, 12 matches): Bronze 1.50 mean place with 83 % wins. G2's number was 1.79.

`botProfile` was skill 0.34→0.90, aggr 0.90→1.15, throttle 0.80→1.00. It is now **skill 0.42→0.90, aggr 0.95→1.15,
throttle 0.91→1.00**. Throttle is the lever, and it is steep: Bronze 0.86 placed 1.88, 0.90 placed 2.38, 0.92 placed 3.31.
At 0.91, Bronze over 120 matches (four seed sets) averages **≈ 2.8**:
- the seed sets gave 2.38, 2.78, 3.16 and 2.96;
- about 37 % wins.

That is winnable, not automatic. Above Silver the curve is flat at 3.5–4.3 because the throttle saturates at 1. sim_test's own 6-match
Bronze sample is noisy (it printed 1.83 once), but its "Legend is ≥ 1 place harder than Bronze" check still passes.

## Events

Shared calendar (`js/meta/events.js`, times UTC; pure function of the date):

| Event | When | Effect (through `createSim({ config })`, so sim_test sweeps it) | Suggested look |
|---|---|---|---|
| Double Crowd Weekend | Sat 00:00 → Mon 00:00, even weeks | `recruitValue: 2` | `festival` / `clear` |
| Night Market | Sat 00:00 → Mon 00:00, odd weeks | 14 pickups, respawn 5 s | `night-neon` / `clear` |
| Rush Hour | Mon/Wed/Fri 07–09 and 17–19 | 1,000 pedestrians (start 900), respawn ×2, pedestrians 1.5–2.8 m/s, leaders 9.4 m/s | `sunny-day` / `clear` |
| Giant Slayer | all day Tue and Thu | +30 coins per absorb of a crowd ranked above you (ladder) | `evening` / `rain` |
| Mode of the Day | every day | featured mode (Teams→King→LCS→Infection by day number), coins ×1.5 in it | — |
| Monthly cup | each UTC month | featured cup mode (rotates monthly; Nov 2026 Infection, Dec Teams). Ladder PLAY results in that mode score 10/7/5/4/3/2/1/0 by place, best 5 count. Bronze 15 pts +200, Silver 28 +450, Gold 40 +900, paid once on reaching; a trophy per month upgraded in place | — |

Event sweep (classic, 4 matches each, vs no event): Double recruits ×2.06, Rush ×1.81, Night Market pickups ×2.93.

The look is passed only through `r.setTheme?.()` / `r.setWeather?.()` (R4 shipped both), on the menu (live events)
and at every match start. Online, the live match-wide events (`double`, `rush`, `market`) travel in the meta, so a
room plays the host's events.

**Next 30 days** (Mode of the Day, special events):

| Day (UTC) | Mode of the Day | Special events |
|---|---|---|
| 2026-11-13 Fri | Last Standing | Rush Hour 07–09 + 17–19 |
| 2026-11-14 Sat | Infection | Night Market (to Mon 00:00) |
| 2026-11-15 Sun | Teams | — |
| 2026-11-16 Mon | King | Rush Hour 07–09 + 17–19 |
| 2026-11-17 Tue | Last Standing | Giant Slayer |
| 2026-11-18 Wed | Infection | Rush Hour 07–09 + 17–19 |
| 2026-11-19 Thu | Teams | Giant Slayer |
| 2026-11-20 Fri | King | Rush Hour 07–09 + 17–19 |
| 2026-11-21 Sat | Last Standing | Double Crowd Weekend (to Mon 00:00) |
| 2026-11-22 Sun | Infection | — |
| 2026-11-23 Mon | Teams | Rush Hour 07–09 + 17–19 |
| 2026-11-24 Tue | King | Giant Slayer |
| 2026-11-25 Wed | Last Standing | Rush Hour 07–09 + 17–19 |
| 2026-11-26 Thu | Infection | Giant Slayer |
| 2026-11-27 Fri | Teams | Rush Hour 07–09 + 17–19 |
| 2026-11-28 Sat | King | Night Market (to Mon 00:00) |
| 2026-11-29 Sun | Last Standing | — |
| 2026-11-30 Mon | Infection | Rush Hour 07–09 + 17–19 |
| 2026-12-01 Tue | Teams | Giant Slayer |
| 2026-12-02 Wed | King | Rush Hour 07–09 + 17–19 |
| 2026-12-03 Thu | Last Standing | Giant Slayer |
| 2026-12-04 Fri | Infection | Rush Hour 07–09 + 17–19 |
| 2026-12-05 Sat | Teams | Double Crowd Weekend (to Mon 00:00) |
| 2026-12-06 Sun | King | — |
| 2026-12-07 Mon | Last Standing | Rush Hour 07–09 + 17–19 |
| 2026-12-08 Tue | Infection | Giant Slayer |
| 2026-12-09 Wed | Teams | Rush Hour 07–09 + 17–19 |
| 2026-12-10 Thu | King | Giant Slayer |
| 2026-12-11 Fri | Last Standing | Rush Hour 07–09 + 17–19 |
| 2026-12-12 Sat | Infection | Night Market (to Mon 00:00) |

A Sunday shows "—" because the weekend event that runs over it started on Saturday.

UI: a live-event banner on the menu with a ticking countdown (non-blocking, taps open the Events sheet). The Events
sheet shows live now, Mode of the Day (Play it), the next 6 events with countdowns and local times, the monthly cup
(points, bar, tiers, Play button) and the season card. The featured mode carries a ×1.5 tag on the mode strip.

## Seasons

28 days from Monday 2 Nov 2026 (season 1 ends 30 Nov). The rank pill shows `S1 · 17d`.

At the first boot or rated match after a rollover:
- **Reward**: once, for the peak league reached that season (100/200/300/450/650/900/1,200/1,600 coins,
  Bronze→Legend), plus a trophy. A save that never played that season gets nothing.
- **Soft reset**: rating → `floor + 0.4 × (rating − floor)`, where floor is your league's threshold. You keep your
  league but lose most of the margin.
- Skipped seasons are caught up in one step.

A gold banner on the menu says what happened. Profile has a trophy shelf (season shields, cup trophies) and wins/matches per mode.

## br8t account + cloud save

`js/cloud.js` → `/lib/auth/localsync.js` `syncLocalKeys({ gameId: 'throng', keys: ['throng.save'], nudge: 'callout', canPester })`.

- **Imports**: by absolute path, as a dynamic import from main.js that falls back to a local save if it fails.
  Skipped under `?auto`, `?shot` and `?nocloud`.
- **What syncs**: only the career save. The device id `throng.dev` and live matches never sync.
- **Adoption**: savedAt-based, using localsync's boot stamp, played-save rule and once-guarded reload.
- **Nudge**: `canPester` is true only on the menu with no sheet open, and on results.
- **Name**: a signed-in account's first name (≤ 14 characters, cleaned) becomes the default name when the save has
  none, so it reaches online rooms in `hello`/`rename`.
- **Layout**: the menu top row and the in-match leaderboard step aside by `--br8t-account-space`. Sheets open below
  the avatar, after I found the Events sheet's X under it.
- **Verified**: Firebase reachable on 127.0.0.1 and Firebase blocked (gstatic/googleapis): 0 errors, 1 top-level
  navigation in 12 s (no reload loop), avatar mounted, PLAY tappable, practice starts. The callout pill showed on
  results and never in a match.
- **Not verified**: a real sign-in and cross-device adoption. That needs a popup or Aaron's Chrome.
- **Firestore**: no rule change needed. `users/{uid}/games/throng` is covered by the existing own-uid rule.
- **Hub**: THRONG is not in `games/deploy.sh` or `games/js/games.js` (manager's job, as before).

## Loose ends

- **(a) Toasts**: every toast line sits on its own dark translucent plate, with lighter power-up colours. Floaters
  got a dark outline. Checked on the `sunny-day` light plaza.
- **(b) Bronze**: retuned (above).
- **(c) Emotes online**: a guest's emote reaches the host and comes back to everyone; the host's reaches guests
  (in-process check in net_test). An emote from an off-screen crowd pops on its leaderboard row.
- **(d) Late joiner's look**: other players get it through `renderer.updateCrowdMeta` on the `meta` update (no
  camera snap).
- **(e) Pause/leave**: pause works in every mode in practice (real pause) and on the ladder (autopilot), and leave
  works on the ladder in King and in LCS while out. That covers all four modes in practice and two of them on the
  ladder. The leave confirm says "COUNTS AS LAST" only when it does (rated Classic).
  - LCS out + a hidden-tab catch-up (events skipped) used to leave you without "OUT!" or spectating. That state is
    now derived every frame.
- **A regression of mine, caught and fixed**: for a while Classic's online match length came from
  `CONFIG.MODES.classic`, not `CONFIG.MATCH.duration`. The harness's 60 s override was then ignored, and 60 s
  net_test runs failed "every client reached the end". Classic now reads `CONFIG.MATCH.duration` again, and the 60 s
  run passes.
- **(f) Haptics**: `navigator.vibrate` on absorb (60 ms), absorbed (90-50-90), infected and pickup (25 ms). There is a
  "Vibration" toggle in Settings (on by default).
- **6 (if time)**: done.
  - **Watch the winner**: when it isn't you, the camera holds on the winner for +1.3 s before results, with a
    "NAME takes it" toast.
  - **Share card**: "Share result" on results draws a 1080×1350 PNG (title, mode, top 8, stats). It uses native
    share with files where the browser supports it, else downloads.

## Verification

Commands (from `gms/3d/throng/`):

```
node tools/sim_test.mjs                    # PASS, ~85 s: classic (stub hash pinned b8a3eae1, real cc249bd5), leagues, online restore, 4 modes, events
node tools/sim_test.mjs --only=modes       # just the mode + event suites
node tools/sim_test.mjs --break=<classic|ally|zone|circle|infect|event>        # new arms, each FAILS
node tools/meta_test.mjs                   # PASS
node tools/meta_test.mjs --break=<events|season|season-slight|cup|unrated>     # new arms, each FAILS (old 10 arms re-run: still FAIL)
node tools/net_test.mjs                    # PASS (classic, 120 s match) + in-process emote/mode check
node tools/net_test.mjs --mode=koth        # PASS: whole online suite in King, incl. host SIGKILL → migration with mode state
node tools/net_test.mjs --mode=koth --break=mode   # FAILS (guests drop the mode block in every 3rd snapshot: 18/23 samples differ)
node tools/net_test.mjs --break=emote      # FAILS (host ignores emote frames)
node tools/net_cdp.mjs --cdp=9284 --cdp2=9285 --mode=infection   # two Chromes, host picks Infection by touch
node tools/league_tune.mjs [--matches=24] [--rows=0,7]            # league difficulty table
```

What I ran and saw:
- **sim_test**: PASS (final run). Both classic determinism hashes equal the pre-M4 baseline I recorded first
  (stub `b8a3eae1`, real `cc249bd5`).
- **sim_test arms** (all FAIL as they should):
  - `classic`: hash 7157f229 ≠ pinned.
  - `ally`: Teams with a wrong side split, 122–505 ally steals.
  - `zone`: King with no scoring, "winner scored 0".
  - `circle`: LCS with no bleed, "bled 0.0 times per match".
  - `infect`: infected crowds never rise.
  - `event`: Double Crowd ×0.
- **meta_test**: PASS. The 5 new arms and the 10 old ones all FAIL.
- **net_test**: classic PASS and `--mode=koth` PASS, each covering:
  - late join, rate limits, host SIGKILL migration;
  - 46 sampled ticks identical across clients (in King they include each crowd's score/out/horde);
  - pedestrian reconstruction exact;
  - the result recorded on the boards.

  `--break=mode` FAILS, and so does `--break=emote` (the guest emote never comes back). A plain 60 s run passes after
  the duration fix (see Loose ends).
- **net_cdp `--mode=infection`**, two real headless Chromes on Metal, touch taps:
  - the host picked Infection in the room lobby; the guest saw "The host picks the mode";
  - both tabs played Infection; 23 sampled ticks of counts and mode state were identical;
  - the guest's touch drag moved it 18 m, and the host saw it 0.25 m from the prediction;
  - the guest got infected and its crowd recoloured lime;
  - the host tab was closed and the guest took over in 79 ms;
  - results "Saved to the Online leaderboard", board listed Bob;
  - zero console errors on both tabs.

  One check failed by chance: "guest's renderer draws the host's hats" (hats 0, heroes 4) with a 4-person host
  crowd. The classic net_cdp re-run passed it (hats 2). A direct check shows hats in Classic, Infection and Teams.
- **Headless Chrome, real touch** (`Input.dispatchTouchEvent`, checked with `elementFromPoint` first), each mode
  from the menu to results:
  - Flow: tap the mode chip → Practice → touch drag (moved 17–18 m every time) → autopilot fast-forward →
    pause button (PAUSED, real pause) → resume → results with the mode headline.
  - Layouts: Teams, King, LCS and Infection at 390×844, 844×390 and 1440×900, zero errors in all.
  - Ladder PLAY in King and LCS: pause = AUTOPILOT, leave two taps → LEFT MATCH, rating unchanged.
  - LCS knock-out: "OUT!" veil and spectating.
  - **Clock shifted to Sat 14 Nov 12:00 UTC**:
    - the menu banner showed "Night Market · LIVE, ends in 1d 11h";
    - the featured chip had ×1.5;
    - the match used 14 pickups and the `night-neon` theme (seen);
    - results paid "Mode of the Day ×1.5 +28", said "unrated", and showed the cup line;
    - Share result saved a PNG.
- **Account layer** (Firebase reachable, and Firebase blocked): no errors, 1 navigation in 12 s, avatar mounted,
  PLAY tappable, the callout only on results.
- **Screenshots looked at**, in `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g4/shots/`:
  - `menu_{p,l,d}`, `events*_{p,l,d}`, `profile_{p,l,d}`;
  - `mid_<mode>_<WxH>` and `res_<mode>_<WxH>` for all 4 modes × 3 layouts;
  - `menu_event_p`, `mid_event_p`, `res_event_p`, `toast_light_p`, `lcs_out_p`;
  - two-tab shots in `…/g4/netshots/`.
- **Fixed after looking**:
  - the team score bar overlapped the timer in portrait (folded into the pill);
  - Teams practice bots were called "Gold Squad" on the blue side;
  - the Events sheet's X sat under the account avatar (sheets now open below it);
  - hidden OUT rows bled out of the leaderboard panel;
  - the Infection icon was white;
  - the Infection pill was truncated;
  - the Infection results ranked a full-time survivor 7th (+20 survivor bonus);
  - the cup line on results was missing;
  - "COUNTS AS LAST" showed in unrated play;
  - the King zone had no off-screen pointer;
  - the "+2" floater was washed out on light ground.
- **Render lane note**: R4 is paused with partial edits in `js/render/**`. The game booted and played every mode on
  them with zero errors, and `setZones`/`setTheme`/`setWeather`/`updateCrowdMeta` all worked. Nothing misbehaved that
  I could attribute to it.
- **Processes**: every process I started is stopped: headless Chromes 9283/9284/9285, the static servers 8763/8764,
  the Go servers and clients the harnesses start. Another session's Chrome (9277) and a `sim_test` I did not start
  were left alone.

## Known gaps

- **LCS online results are never recorded** (the server's plausibility check wants the full duration).
  Infection's all-horde early end hits the same check. The exact `server/hub.go` change is in
  `G_requests.md` → manager.
- Online boards mix all modes ("best crowd", "wins").
- **Lobby guests don't see the mode the host picked** until the match begins. The server has no field for it, so it
  needs a server change: a `mode` in the room state.
- Real-network and real-phone play are untested: haptics, share sheet, sign-in, mode feel with human players.
- **LCS** median end is about 81 s of 90, and about half the matches end with one crowd left. The circle schedule is
  first-guess.
- **Infection**: the horde averages about 3 infections a match, and everyone ends up horde in about 15 % of matches.
  The +20 survivor bonus decides close survivor-vs-horde rankings.
- **Teams sides**: blue won 8 of 12 in one sim batch. Crowd 0 (the auto bot) is always Blue, but the sim_test side
  check only asks that each side wins at least 15 %.
- Teams practice names are generic. On the ladder the roster names stay, coloured by side.
- `net_cdp.mjs`'s "guest's renderer draws the host's hats" check can fail by chance: the host's crowd is 4 people
  with 60 % hat share at that moment. It failed once in the Infection run and passed in the Classic run. Hats render
  in every mode (checked).
- The Rush Hour keyframe is about 1.5× bigger (1,000 pedestrian slots). That is still well under the 24 KB host cap.
  Bandwidth during Rush Hour was not measured.
- The edge "leader" arrow sometimes duplicates a leader pill pinned at the screen edge. This predates M4.
