# G7 report: match lengths (D20) and rated Last Crowd Standing (D21), 2026-11-17

Both features are built. Nothing is committed or deployed. The server changed, so it needs a deploy (the note is at the end).
The Classic 2:00 path is unchanged: `sim_test` still matches the pinned stub hash `b8a3eae1`.

## Suites (run on the final tree)
All of these were run on the final tree on the M5:
- `node tools/sim_test.mjs`: **PASS** in 78.5 s. The stub hash is still `b8a3eae1`, the pinned Classic 2:00 hash. The new length suite is included.
- `node tools/meta_test.mjs`: **PASS**.
- `node tools/render_map_test.mjs 100`: **ALL PASS**.
- `node tools/threat_test.mjs`: **PASS**.
- `node tools/net_test.mjs`: **PASS** (0 failed). Bandwidth is unchanged: guests 7.5–8.0 kB/s, snapshot 521 B on average.
- `node tools/net_test.mjs --mode=lcs`, `--mode=teams`, `--mode=koth` and `--mode=infection`: each **PASS** (0 failed).
- `node tools/net_test.mjs --break=lobbylen`: FAIL as intended (1 check). `--break=lenmeta`: FAIL as intended (4 checks).
- `(cd server && ./test.sh)`: **ALL PASS** (gofmt, vet, 18 Go test funcs, binary smoke).
- New `sim_test` / `meta_test` break arms each turn the run red: `sim_test --only=length --break=length|taper|lenrestore` and `meta_test --break=marathon|lenpay|lenrated|lcsrated|lcsleave`.

## A. Match lengths (D20)

### What a player sees
- **Private rooms.** Under the mode strip the host gets a 2:00 / 3:00 / 5:00 picker. The tap targets are 52×36 px at 384×692 and 844×390, and 63×36 at 1440×900. The line under it says whether that length goes on the leaderboard. Guests get no picker; they see "**5:00** match · not on the leaderboard". When the mode is Last Crowd Standing, the line says LCS keeps its own clock (about 1:30).
- **The pick sticks.** It is a server room field, `room.len`, kept across matches and through a host change in the lobby. Quick match is always 2:00.
- **Results.** At the end of a 3:00 or 5:00 online match the card says "5:00 match: the leaderboard counts 2:00 matches only".
- **Events.** A new event, **Marathon Wednesday**, runs every Wednesday 19:00–23:00 UTC. While it is on, Teams, King of the Plaza and Infection run 5:00 matches, in both Play and Practice. Classic and LCS are not affected, because they are rated. The rest of the calendar is unchanged.
- **Where the Marathon length shows:**
  - the event card has a "5:00 matches" chip;
  - the menu's Play button reads "PLAY TEAMS 5:00";
  - the pre-match "Finding players" card has a "5:00 match" chip;
  - the results card says "5:00 match: placement pays ×2.5".
- **Ladder Play** stays 2:00 for Classic and LCS. Any match whose clock is not the mode's normal one never moves the rating; `applyMatch` enforces this as well.
- **Practice** gets no picker; it only takes Marathon's length. `?len=180|300` is a Practice-only test hook.

### What is tied to the clock and what I did with it
| Thing | Decision |
|---|---|
| Pedestrian refill | **Scaled.** After 120 s of play the street refills at `neutralRespawn × neutralLateMul` (26/s → 13/s; new `CONFIG.SIM` keys `neutralLateAt` 120 and `neutralLateMul` 0.5). A 2:00 match never reaches this. Without the taper, a 5:00 Classic match grew crowds of up to 6,169 people and had 8,900 people on the map. |
| Pickups (respawn 11 s), crown-zone moves (every 30 s), steal / respawn / protection timers | Absolute, deliberately. A longer match simply gets more of them. |
| KOTH score | Absolute (seconds held, highest score wins); there is no target to scale. |
| LCS | **Ignores the length** (`matchDuration`). Its circle schedule is its clock, and it ends at one crowd left. |
| Infection | Length applies. The horde gets more time, so at 5:00 the match ends early on all-horde 50–67% of the time (3–17% at 2:00). Survivors score seconds alive, so their scores grow with the clock. |
| Bots' "late game" (last 30 s), HUD 30 s warning, 10 s countdown ticks, intense music (last 30 s), end hold / punch | Absolute, deliberately: they are about the end of the match, whatever its length. The music is a procedural loop with no length. |
| HUD timer | Already reads `state.duration` / `timeLeft` and shows 5:00 correctly. |
| Server plausibility | Duration may now be 90–300 s (was 180 at most). `best` ≤ 6,000 and `kills` ≤ 60 scale by duration / 120 above 2:00. The minimum wall time already scaled. |
| Leaderboards | **Only matches of 2:00 or less are posted** (LCS's 90 s included). A 3:00 or 5:00 room is settled and confirmed as usual, but `ended.recorded` is false. No schema change. |

### Sizes in 5-minute matches
`node tools/mode_sweep.mjs --modes=classic,teams,koth,infection --len=120,300 --leagues=0,2,7 --matches=30 --sizes`, real map. "People on map" = everyone in crowds plus the pedestrians.

| Mode, length | Peak crowd p50 / p90 / max | People on map, max | Pedestrians, min (p10 over matches) |
|---|---|---|---|
| Classic 2:00 | 818–1,056 / 1,132–1,487 / 1,557 | 4,056 | 443–460 |
| Classic 5:00 | 3,285–3,502 / 4,268–4,493 / 4,814 | 7,071 | 170–190 |
| Teams 5:00 | 1,986–2,207 / 2,750–3,772 / 4,495 | 7,644 | 165–186 |
| King 5:00 | 2,207–2,786 / 3,136–3,806 / 4,140 | 6,510 | 226–254 |
| Infection 5:00 | 2,020–2,602 / 4,064–4,487 / 5,077 | 7,153 | 143–153 |

- **Pedestrians.** The street never runs out. In `sim_test`'s length suite the minimum is 182–311.
- **Biggest crowd.** It stays under ~5,100, well under the scaled server cap of 15,000 at 5:00.
- **Renderer.** It draws at most its budget (5,000 figures at medium, 2,000 at lite), so more people means fewer figures per person, not more figures.
- **Browser check.** A 5:00 Teams practice at 4:41 (leader at 3,036) and a 5:00 Classic practice at 4:36 (leader at 2,536) both rendered normally at 844×390 and 384×692. The HUD and leaderboard handle 4-digit counts. Screenshots are in the scratchpad (paths below).
- **Not measured: frame rate** with ~7,000 people on a phone.

### Coins and XP for non-2:00 matches
- **How the scaling works.** `matchPayout(..., lenMul)` multiplies the per-match parts, placement coins and placement XP, by `lenMul` = length / 120 (×1.5 at 3:00, ×2.5 at 5:00). It also raises the peak-crowd coin and XP caps by the same factor.
  - Kill coins and peak coins grow by themselves with a longer clock.
  - First win of the day, the daily challenge, level-ups and the cup stay per match or per day.
- **The comparison below.** These are the ?auto player's payouts from the same sweep. "Wall" adds 0.6 min per match for the lobby, countdown and results.

| Mode | League | Length | Coins / min of play | XP / min of play | Coins / wall min | XP / wall min |
|---|---|---|---|---|---|---|
| Classic | Bronze | 2:00 → 5:00 | 25.0 → 31.9 | 52.6 → 61.4 | 19.2 → 28.5 | 40.5 → 54.8 |
| Classic | Gold | 2:00 → 5:00 | 26.7 → 26.5 | 55.6 → 54.5 | 20.6 → 23.7 | 42.8 → 48.6 |
| Classic | Legend | 2:00 → 5:00 | 18.8 → 15.8 | 44.6 → 40.5 | 14.4 → 14.1 | 34.3 → 36.2 |
| Teams | Bronze | 2:00 → 5:00 | 21.3 → 22.4 | 48.2 → 48.6 | 16.4 → 20.0 | 37.1 → 43.4 |
| Teams | Gold | 2:00 → 5:00 | 21.6 → 23.5 | 48.0 → 50.2 | 16.6 → 20.9 | 37.0 → 44.9 |
| Teams | Legend | 2:00 → 5:00 | 20.2 → 15.9 | 47.1 → 40.3 | 15.5 → 14.2 | 36.2 → 36.0 |
| King | Bronze | 2:00 → 5:00 | 17.4 → 20.5 | 43.4 → 47.9 | 13.4 → 18.3 | 33.3 → 42.8 |
| King | Gold | 2:00 → 5:00 | 16.7 → 20.4 | 41.5 → 47.1 | 12.8 → 18.2 | 32.0 → 42.0 |
| King | Legend | 2:00 → 5:00 | 14.8 → 15.3 | 39.1 → 40.4 | 11.4 → 13.7 | 30.1 → 36.0 |
| Infection | Bronze | 2:00 → 5:00 | 29.5 → 29.8 | 58.8 → 61.0 | 22.6 → 26.2 | 45.1 → 53.8 |
| Infection | Gold | 2:00 → 5:00 | 23.6 → 24.4 | 52.2 → 57.9 | 18.0 → 21.3 | 40.0 → 50.3 |
| Infection | Legend | 2:00 → 5:00 | 25.7 → 28.0 | 54.7 → 62.6 | 19.7 → 24.1 | 41.9 → 53.8 |

- **Per minute of play,** 5:00 is within about ±20% of 2:00 (King Bronze +18%, Teams Legend −21%). Infection is computed on its real, often shorter, match time.
- **Per wall-clock minute,** 5:00 pays 0–37% more, because there are fewer lobbies per hour. King Bronze is the high end.
- **Why I left it there.** Marathon is 4 hours a week and only covers unrated modes, and 2:00 still collects first-win and daily-challenge rewards faster. Online rooms pay no coins at all, as before.
- **If Aaron wants exact wall-clock parity,** scale placement by `1 + 0.8 × (lenMul − 1)` instead of `lenMul`.
- 30 matches per cell, so each number is about ±10%.

### Online and server (protocol stays 1, additive)
- **Client.**
  - `createOnline({ pickLength })` and `online.setLength(len)` only send `{t:'len', len}` when `welcome.feat` includes `len`.
  - `buildMeta({ len })` puts `duration: matchDuration(mode, len)` in the begin meta.
  - Guests, late joiners and a promoted host already run `meta.duration` / `state.duration`, so nothing else needed to change.
- **Server.**
  - `Room.LobbyLen` is shown as `room.len` when set.
  - The `len` message is host-only, private-room-only and lobby-only, and accepts 120 / 180 / 300 (anything else is `bad_request`).
  - `serverFeatures` gains `len`.
  - `plausible()` now scales its caps with the room's length, and `record()` skips the boards when the duration is over 120 s.

## B. Last Crowd Standing counts for rating (D21)

### Measurement before switching it on
`node tools/mode_sweep.mjs --modes=classic,lcs --leagues=0,1,2,3,4,5,6,7 --matches=320 --rating=only` was run twice, with seed0 20000 and seed0 90000: 640 matches per league per mode in total. The auto player plays against the sim-online roster at each league floor + 20. "pts/min" = mean ladder delta at that rating ÷ mean minutes of play.

| League | Classic mean place | LCS mean place | LCS length | Classic pts/min | LCS pts/min, Classic's points (raw) | LCS pts/min, rated (×0.73 gains / ×0.65 losses) | Difference | z |
|---|---|---|---|---|---|---|---|---|
| Bronze | 2.99 | 3.49 | 75.6 s | 17.32 | 23.42 | 17.21 | −1% | −0.2 |
| Silver | 3.22 | 3.89 | 76.0 s | 15.60 | 19.03 | 14.02 | −10% | −2.2 |
| Gold | 3.58 | 3.90 | 75.3 s | 13.21 | 18.36 | 13.35 | +1% | 0.2 |
| Platinum | 3.57 | 4.04 | 74.9 s | 12.15 | 15.62 | 11.63 | −4% | −0.7 |
| Diamond | 3.77 | 4.09 | 75.2 s | 10.15 | 13.52 | 10.10 | 0% | −0.1 |
| Master | 3.98 | 4.08 | 74.3 s | 8.49 | 12.94 | 10.10 | +19% | 2.2 |
| Champion | 4.19 | 4.33 | 74.2 s | 3.88 | 5.15 | 4.09 | +5% | 0.3 |
| Legend | 4.29 | 4.32 | 74.0 s | −6.79 | −11.22 | −7.20 | −6% | −0.7 |

- **The finding.** The auto player places a little worse in LCS than in Classic: 3.49 vs 2.99 mean place at Bronze, about equal at Legend. Classic in these runs went from 2.99 at Bronze to 4.29 at Legend; the brief's reference was 3.07 → 4.38. But LCS matches last only about 75 s, so with Classic's points LCS paid 22–65% more per minute in every league. It would have been the better farm.
- **Gain vs loss multipliers.** One multiplier fit best at 0.75, but it left Legend 24% worse, losing more per minute in LCS. Separate gain and loss multipliers (0.73 / 0.65) put 7 of 8 leagues within 10%.
- **Master is the exception, at +19%** (+1.6 pts per minute, z 2.2). The two halves of the data disagree there: +25% in run A, +12% in run B. I did not add a per-league correction, because that would be fitting one bot's quirks.
- **Wall-clock time.** Counting 0.6 min of lobby and results per match, LCS earns less per wall-clock minute than Classic in every league.
- **Single runs.** Each 320-match run alone is within ±12% in every league except Master (+25% / +12%) and Champion in run A (+20%, z 0.6, on a base of only 2.9 pts/min).

### What changed
- **Code.**
  - `js/meta/ladder.js`: `RATED = { classic: [1, 1], lcs: [0.73, 0.65] }`.
  - `ratingDelta(rating, place, cfg, gainMul, lossMul)`: the multipliers apply after the clamp, so `[1, 1]` returns exactly the old values (meta_test checks every rating step × place).
  - `progress.applyMatch`: rated = mode is in `RATED` **and** the clock is the mode's own.
- **Place in LCS.** It is the elimination order (the sim's LCS rank). Leaving early still counts as 8th.
- **UI.**
  - Rated LCS results show the rating change like Classic (checked in the browser: a 5th place at rating 0 gave +9).
  - The pause menu says "COUNTS AS LAST" in LCS too.
  - The unrated note now reads "… Classic and Last Crowd Standing move your rating", and the ladder sheet says the same.
- **Online LCS** is unchanged and still unrated.

## Tests added (each with a break arm that turns the run red)
- **`sim_test` length suite** (`--only=length` runs it alone). It checks that:
  - 3:00 and 5:00 Classic / Teams / King / Infection run their clock;
  - LCS ignores the length;
  - the street never drops under 40 pedestrians;
  - peak crowd stays under 80% of the server cap;
  - after 2:00, spawns stay at or below the late refill rate;
  - a state-only restore (host migration) keeps the clock.
  - Break arms: `--break=length`, `taper`, `lenrestore`.
- **`meta_test` §13 (Marathon and length payouts):**
  - Marathon falls on Wednesdays 19–23 UTC and lengthens only the unrated modes;
  - placement and peak caps pay ×2.5;
  - a 5:00 Classic match is unrated;
  - a 2:00 Classic match with an explicit duration pays exactly as before.
  - Break arms: `marathon`, `lenpay`, `lenrated`.
- **`meta_test` §14 (LCS rating):** LCS deltas equal Classic's ×0.73 / ×0.65 at 7 ratings × places, leaving counts as 8th, and Classic is untouched. Break arms: `lcsrated`, `lcsleave`.
- **`net_test` [length], in-process:** host and guest mirror a 300 s clock, LCS ignores the length, and an unknown length falls back to the mode clock.
- **`net_test` [length], through the real server:**
  - the server offers `len`;
  - both guests see the 5:00 pick in the lobby;
  - everyone's begin says 300 s;
  - a late joiner gets 300 s;
  - after a SIGKILL of the host, the new host runs a 300 s clock (297 s left);
  - an old host that never sends `len` gives a room with no `len` and a default clock.
  - Break arms: `--break=lobbylen` (only the lobby check fails) and `--break=lenmeta` (the host ignores the pick).
- **Go:** `TestLobbyLengthPick` and `TestPlausibilityLength`, plus the feature list in `TestWelcomeFeatures`.
  - `TestLobbyLengthPick`: pick → guest sees it, guest refused, bad lengths refused, join reply carries it, refused mid-match, a 5:00 result is settled but not on the boards (no rows), the length survives the match and a lobby host change, refused in quick rooms.
  - `TestPlausibilityLength`: 2:00 caps unchanged, scaled caps at 5:00, a 3:00 room must run its clock, 301 s refused.
  - Break arms, done by hand on a copy of `hub.go`: dropping the board check, the cap scaling or the LobbyLen store each fails its test.
- **Browser (CDP, Chrome with `--use-angle=metal`):**
  - **Room lobby** at 384×692, 844×390 and 1440×900 (the last at dpr 1, because a dpr-2 1440 screenshot hung in headless Chrome). The host picks 5:00 by a real touch or click and the guest sees "5:00 match · not on the leaderboard". Every lobby control is clear of the account badge (read from its shadow root) and inside the viewport, with no sideways scroll; the new text is at least 11 px.
  - **Marathon UI,** with the clock faked to Wednesday 20:00 UTC: the event card chip, the "PLAY TEAMS 5:00" button, the lobby chip, and the match running a 5:00 clock.
  - **Rated LCS results card.** Screenshots of a 5:00 practice late in the match.
  - Scripts and screenshots are in `/private/tmp/claude-501/-Users-aaronair-cc/1267ff84-dfa8-49a0-ac94-34a4b789de19/scratchpad/g7/` (`lobby_cdp.mjs`, `marathon_cdp.mjs`, `lcs_results.mjs`, `long_shot.mjs`, `shots/`). They are not in the repo.

## Files
- **Game code:** `js/config.js`, `js/sim/sim.js`, `js/main.js`, `js/meta/{economy,events,ladder,progress}.js`, `js/net/{netmatch,online}.js`, `js/ui/{eventsheet,lobby,menu,online,panels,results}.js`, `css/ui.css`.
- **Server:** `server/hub.go`, `server/session.go`, `server/integration_test.go`.
- **Tools:** `tools/{sim_test,meta_test,net_test,net_client,mode_sweep}.mjs`.
  - `mode_sweep` gained `--len`, `--sizes` and `--rating[=only]`.
  - With `--rating`, its table shows raw and rated points per minute.
- **Docs:** `docs/DECISIONS.md` (rows D20 and D21 only), `docs/NET.md`, `docs/CONTRACT.md`, this report.

## Server deploy note (not done: no deploy, no ssh)
1. **Schema.** There is no schema change and no migration: `results`, `alltime` and `alltime_mode` are untouched. Non-2:00 matches are simply never written.
2. **Order.** Deploy the server first, then the static site.
   - A new client against the old server: the old server sends no `len` feature, so the client never sends `len`. The host still starts at its own pick, and guests learn the clock at `begin`.
   - A 3:00 or 5:00 begin is accepted by the old server (it allows up to 300 s), but its `plausible()` refuses durations over 180 s, so a 5:00 match is not recorded either way.
   - The order matters only so that guests see the pick in the lobby from the start.
3. **Deploy.** Use the usual `server/deploy.sh` with `RUN_TESTS` (it runs `server/test.sh` against the binary: gofmt, vet, 18 Go test funcs and the smoke run).
4. **Old clients.** `PROTO` is still 1. But `CONFIG.MATCH.lengths` and the two new `CONFIG.SIM` keys change `simVersion()`, so cached old clients and new clients get different room keys:
   - quick match never pairs them;
   - joining a code across builds answers `version_mismatch` and shows the existing reload message.
   - This happens on every balance change, and a reload fixes it. An old client on its own keeps working against the new server; it simply never sends `len`, so its rooms play 2:00.

## Not verified or not done
- **No real phone.** Frame rate with about 7,000 people (5:00 late game) on a phone was not measured. Only headless-Chrome screenshots were taken.
- **No browser online match at 3:00 or 5:00.** `net_test` covers the protocol with real js/net code; `net_cdp.mjs` was not extended or run.
- **Practice has no length picker.** It takes only Marathon's length, plus the `?len=` hook.
- **Daily challenges that count one match** (finish with N, peak N, crown seconds) are easier in a 5:00 Marathon match. Not scaled; it happens once a day.
- **LCS "leave counts as last" also applies after you are knocked out.** A player out in 5th who leaves before the end drops to 8th; staying keeps 5th. That is what the brief says. Aaron may prefer keeping the elimination place once you are out.
- **The LCS multipliers rest on the ?auto bot.** Real players' LCS skill relative to Classic may differ. Rerun `mode_sweep --rating` if the bots change.
- **Not re-run:** `econ_sweep.mjs` (whole careers). The table above uses per-match payouts from `mode_sweep`. Nothing is committed.
