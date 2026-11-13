# Lane G5 report: follow-ups, balance, hardening (wave 5)

Nothing was committed, pushed, deployed or sent over ssh. Nothing outside `gms/3d/throng/` was touched, and no file
in `js/render/**` or `js/world/**` was edited.

## 0. Aaron's asks this wave (done first)

### A. Desktop mouse: follow the pointer

- **New setting:** Settings → **Mouse: Follow pointer / Drag joystick** (`save.settings.mouse`, default `follow`).
  - The row is hidden on devices with no hover (phones).
  - Follow only ever reacts to `pointerType === 'mouse'` events. Touch and pen always get the floating joystick, so a
    touch laptop gets both.
- **How Follow works** (`js/input.js` `followVector`; knobs `CONFIG.INPUT.followDead/followFull/followTau`):
  - The crowd heads for the point on the ground under the cursor (`renderer.groundPoint`). No button is held.
  - The direction is taken from the leader's **sim** position, not the drawn or look-ahead camera, so the camera
    following the crowd cannot feed back into the heading.
  - The steer vector is low-passed with τ = 0.09 s, which absorbs punch zooms.
  - Speed ramps from 0 at 1.2 m from the leader to full at 4.5 m. A cursor resting on the crowd stops it dead.
  - Keys override while held.
  - When the pointer leaves the window, the crowd keeps its last heading if "Keep moving" is on (the default),
    otherwise it stops.
  - A mouse click in Follow mode does nothing (no joystick).
- **Default, my decision for REVIEW:** Follow is on for everyone, which in practice means every mouse user: it only
  responds to a real mouse, so phones and touch input are unaffected.
- **First-match hint:** with a fine pointer it now says "Point where you want to go, or use WASD".
- **Tested with real CDP mouse moves** (scratchpad `g5/followtest.mjs`, practice match, 1440×900, 844×390 and
  390×844, non-mobile):

  | layout | heading vs bearing to the cursor's ground point, worst per cursor position (5 positions) | cursor resting on the crowd (2.5 s) | W held, cursor to the side | cursor leaves window |
  |---|---|---|---|---|
  | 1440×900 | 0.0° 1.6° 1.4° 1.7° 0.3° | max speed 0.00 m/s, drift 0.00 m | heads "up" (0.0° off) | keeps moving 7.3 m/s |
  | 844×390 | 0.0° 1.4° 1.3° 1.1° 0.3° | 0.00 m/s, 0.00 m | 0.0° off | 7.3 m/s |
  | 390×844 | 0.1° 0.6° 0.9° 0.8° 0.1° | 0.00 m/s, 0.00 m | 0.0° off | 7.4 m/s |

  Zero console errors. Falsified:
  - `drag` arm (Follow off): the heading checks fail in all three layouts.
  - `nodead` arm (no dead zone, no low-pass): resting on the crowd moves it at 7.3–7.5 m/s and 18 m in 2.5 s, so it FAILS.

### B. Popups under the account badge

- **Cause:** a phone browser with its bars showing has a short viewport (390×664 on an iPhone). There the centred
  results card ran up under the br8t avatar.
  - Measured before the fix: 312 px² of the badge over the card's top-right corner, at the spot where a close button
    would be.
  - At 390×844 nothing overlapped, which is why the earlier headless shots never showed it.
- **Fix (CSS only):**
  - In portrait, every popup screen except the menu gets `--br8t-account-space` added to its top padding. That covers
    the results, lobby, room lobby, pause and leave confirm.
  - In landscape, the popup screens and the sheet layer get it as side padding.
  - Short portrait screens (height ≤ 760 px) get a more compact results card, so it still fits without scrolling.
  - The PLAY AGAIN button no longer wraps.
- **Measured:** scratchpad `g5/badgecheck.mjs` checks 12 popups (locker, ladder, daily, events, settings, profile,
  online, lobby, pause, leave confirm, results, room lobby) at 6 sizes: 390×844, 844×390, 390×664, 664×390, 360×640
  and 640×360.
  - It records badge-vs-card overlap, whether the card fits, and whether it needs scrolling.
  - Before: 1 bad of 72 (results at 390×664).
  - After: **72 of 72 clear, 0 need scrolling.**
- **Screenshots** in `scratchpad/g5/badge/`: `before_*` and `after_*` for every popup and size. `ba_ios_results.png`
  shows the results before and after side by side.

### C. Fullscreen (manager item)

- **Settings → Fullscreen** toggle (`js/ui/fullscreen.js`):
  - It calls the Fullscreen API on `document.documentElement` (with the webkit fallback) inside the tap handler.
  - Its state follows `fullscreenchange`, not a saved flag.
  - It never auto-enters, and it does not lock orientation.
- **iPhone (no element fullscreen):** the toggle is hidden and Settings shows one quiet line: "On iPhone: Share → Add
  to Home Screen for fullscreen". When the game already runs standalone, nothing shows.
- **Meta tags:** `index.html` already had `apple-mobile-web-app-capable`, `mobile-web-app-capable` and
  `viewport-fit=cover`.
- **Menu button:** not added. The portrait top row is already the profile, the coin pill and the badge.
- **CDP test** (`g5/fstest.mjs`, 390×844 and 844×390, touch):
  - not fullscreen on load;
  - the toggle is visible, and a tap gives `document.fullscreenElement` with the toggle on;
  - `exitFullscreen()` from outside (like back or Escape) flips the toggle off;
  - with the API stubbed out, the toggle is hidden and the hint shows;
  - 0 console errors.
- PLAYTEST.md steps 9b and 9c cover fullscreen and the mouse.

## 1. Render-lane asks (R_requests 20–29)

| # | Ask | Done | Verified |
|---|---|---|---|
| 21 | Never send `'clear'` over a snow theme | `setLook` sends the look's weather, `null` when there is none, and never `clear` over snow | Clock shifted to Wed 23 Dec 2026: menu and match `theme snow, weather snow` (renderer `stats()`), shot `ui/winter_match_p.png` |
| 20 | Snow theme unused | New seasonal look: when no event has a look, 18 Dec – 6 Jan UTC uses `snow` + its own weather (`events.js winterLook`; no sim change, no coins) | Same as 21. Sat 20 Dec is a Double Crowd weekend, so it stays festival (events win) |
| 22 | `progress` + `color` in the `pushZones` change key; stable ids | Key = id, x, z, r, style, color, progress. Crown and next share a plaza-keyed id (`k<x>,<z>`), so the preview turns into the crown in place; `safe` / `safe-next` ids | King, 40 samples over 16 s with holders 0, 2, 5 and none: crown colour ≠ holder colour in **0 of 33** (7 came before the first call after the probe was installed) |
| 28 (1b) | Holder colour on the crown zone as `z.color` | `zonesOf(state, colors)`: the holder's crowd colour, gold when nobody holds it | Same; shots `ui/koth_holder_{p,l,d}.png` (teal holder's zone glows teal) |
| 24 | Bigger attract crowds behind the title | Attract match: start 40, recruits ×2, bots lean toward the central plaza (`createBots({ focus })`, attract only), FF 20 s, and FF again when it restarts after 2 min. More FF was rejected: 18 s of sim already costs ~200 ms on an M5 in node, so ~40 s would be over 1 s on a phone at every menu entry | Top three at the menu **320/314/296** (was about 100/90/85 at 18 s); 10 s later 480/458/328. Ready 426–446 ms. Shots `ui/menu_{p,l,d}.png` |
| 27 | Festival fireworks before results | Results wait 3.2 s after the whistle on the festival theme (1.7 s otherwise) | Code path only, not watched |
| 23 | No theme switch mid-match | Already true: `setLook` only at match start / attract start; same id = no rebuild | — |
| 25, 26 | Remote ring, recolour `from` | Already wired by G4 | — |
| 29 | "0 hats" flake | Not a bug (R4). Harness left as is | net_cdp: hats 2, leader figures 2 this run |

## 2. Server (not deployed)

- **`plausible()` early-end branch**: new Go test `TestPlausibilityEarlyEndModes` with 12 cases.
  - LCS at 72 s and 41 s: accepted. LCS at 30 s: refused.
  - Infection at 64 s: accepted. Infection at 35 s: refused.
  - Classic, `""`, Teams, King and an unknown mode, each at 64 s: **refused**.
  - Full-length Classic and LCS: accepted.
  - Falsified: with the branch removed, 3 cases fail (LCS ×2, Infection). With an early end allowed for every mode,
    5 fail (classic, "", teams, koth, bogus) plus the old `TestPlausibility`.
  - The branch now uses `boardMode(r.Mode)`, so an unknown mode counts as Classic.
- **Lobby shows the host's mode:**
  - New client message `mode {mode}`: private room, host only, lobby only, mode whitelisted.
  - `room.mode` is in every room view. It survives a match and a host change; a new host adopts it.
  - `welcome.feat = ['mode', 'boards-mode']`. New clients only send `mode` to a server that lists it, so a new client
    on the old server never gets an error.
  - Old clients ignore `room.mode`. No protocol bump: the change is purely additive.
  - The guest's lobby shows the pick (icon, name, blurb).
  - Tests: Go `TestLobbyModePick` checks that a guest sees it, a guest can't change it, an unknown mode is refused, a
    late joiner sees it, it can't change mid-match, it survives the match, and nobody picks in quick rooms. Also
    `TestWelcomeFeatures`.
  - net_test checks that "both guests see the host's mode pick in the lobby"; `--break=lobbymode` FAILS.
  - net_cdp `--mode=koth`: the guest tab shows "King of the Plaza…" by real touch, PASS.
- **Per-mode boards:**
  - `results.mode` (default 'classic') and a new `alltime_mode (pid, mode)` table; `alltime` stays the all-modes
    total.
  - Migration in `db.go migrate()`. It is idempotent, gated by `settings.schema = 2`, and copies `alltime` into
    `alltime_mode` as Classic.
  - `GET /boards?...&mode=all|classic|teams|koth|lcs|infection` (no mode = all, as before; anything else = 400).
  - The client's Online board has a mode chip row: All modes / Classic / Teams / King / Last Standing / Infection. On a
    server without per-mode boards it says "This server has one board for every mode for now".
  - Tests: Go `TestBoardsPerMode` (9 queries) and `TestMigrateOldDatabase`, which builds an M3/M4-schema file with rows,
    opens it twice, records afterwards, and checks the classic copy, idempotence and per-mode totals.
  - Falsified: with the migration copying nothing, `TestMigrateOldDatabase` fails. With day/week ignoring mode,
    `TestBoardsPerMode` fails 3 queries. Without `room.mode` in the view, `TestLobbyModePick` fails.
- `server/test.sh`: ALL PASS (gofmt, vet, 16 test funcs incl. the 5 new ones, binary smoke).

### Deploy note for the manager

1. **Deploy the server first, then the static files.** `cd server && CONFIRM=yes RUN_TESTS=1 ./deploy.sh`.
   - On its first start the new binary migrates `/srv/data/throng/throng.db`. It logs
     `db: migrated to schema 2 (per-mode boards; existing rows are Classic)`.
   - The migration adds one column with a default and copies `alltime` (small). It runs in one transaction and is
     safe to re-run.
   - **Back up first:** `cp /srv/data/throng/throng.db{,.bak-g5}` plus the `-wal`/`-shm` files if present, with the
     service stopped (or run `sqlite3 .backup`).
2. **Old clients keep working during the roll-out:**
   - The protocol is still 1, and `room.mode` and `feat` are extra fields that old clients ignore.
   - Old clients ask for boards without `mode` and get the all-modes board as before.
   - Old hosts' results are recorded with their `meta.mode` (M4 clients already send it).
   - **But `simVersion()` changed** (`CONFIG.MODES` changed: Infection scoring and the Teams knob), so new and old
     *clients* never share a room. Players on a cached old page just get separate rooms until they reload. This
     happens with any balance change.
3. **Static deploy:** as before (`git archive HEAD gms/3d/throng | rsync` minus docs/, tools/, server/).
   - Health check after: `curl https://games.br8t.com/gms/3d/throng/api/health`
   - Board check: `curl 'https://games.br8t.com/gms/3d/throng/api/boards?period=all&kind=wins&mode=classic'`
     should return `"mode":"classic"`.
4. **If the static files go first,** nothing breaks:
   - New clients don't send `mode` until the server lists the feature.
   - The board's mode chips fall back to the all-modes board with a note.

## 3. Balance (node sweeps, real map seed 1, the ?auto bot as "you")

Tool: `tools/mode_sweep.mjs` (worker threads, about 0.45 s per match per core). Tables below are from that tool;
`tools/econ_sweep.mjs` does the economy.

### Teams: was there a real bias?

Before (G4's 8 of 12): 70 matches per league, sides as built, "your side" = the auto player's.

| variant | Bronze | Gold | Legend | reading |
|---|---|---|---|---|
| as built (your side) | 73% | 57% | 64% | the side with the auto player wins about 65% |
| flip (you on Red) | 73% | 57% | 64% | identical: side id, colour and order have **no** effect |
| fair (crowd 0 gets a league bot's spec) | 49% | 41% | 46% | plus 100/league more at another seed: 54/53/56 → **50.6% over 510** |

- **Cause:** "you" (the auto player: skill 0.8, throttle 1.0) is stronger than a league bot, and your three teammates
  were a random 3 of the 7 bots. There is no spawn, colour or index effect.
- **Fix:**
  1. A draft in `makePlayers` for Teams. You count as the first pick, so the other side gets the four strongest bots
     (skill × throttle) and your side the three weakest (`teamDraft: 'top'`).
  2. `CONFIG.MODES.teams.oppThrottle = 0.03`: the other side's bots drive 3 % harder. It is capped at 1, so it has no
     effect at Legend, where the bots already match you.

| your side wins | Bronze | Gold | Legend | all |
|---|---|---|---|---|
| before (70/league) | 73% | 57% | 64% | 65% |
| snake draft only (70/league) | 71% | 60% | 49% | 60% |
| top draft only (200/league) | 63% | 57% | 53% | 58% |
| top draft + oppThrottle 0.05 (200/league) | 46% | 39% | (53%) | 46% |
| **top draft + oppThrottle 0.03 (200/league)** | **52%** | **46%** | **53%** | **50.3%** over 600 |

Online rooms are unchanged: humans alternate sides by join order.

**3b. Confirmation with the final config** (fresh seeds 90000+, 200 matches per league): your side wins **52 % /
46 % / 47 %** (Bronze / Gold / Legend), **48.3 % over 600**. The median winning margin is 1.85–2.16×, and 12–19 % of
matches are close (under 1.2×).

### King of the Plaza: no change needed

100 matches per league.

| league | you place | win | lead changes | holder changes | winner = biggest mean crowd | winner = biggest at end | winner's share of points | ≥ 2 crowds in zone | top-2 points ratio |
|---|---|---|---|---|---|---|---|---|---|
| Bronze | 4.43 | 16% | 4.6 | 10.2 | 26% | 16% | 36% | 27% | 1.37 |
| Gold | 4.27 | 11% | 4.6 | 10.5 | 26% | 19% | 36% | 26% | 1.30 |
| Legend | 4.38 | 13% | 4.8 | 10.3 | 25% | 20% | 37% | 27% | 1.43 |

The biggest crowd wins only a quarter of matches, and the lead changes 4–5 times. No catch-up lever was added.

### Last Crowd Standing: no change needed

100 matches per league.

| league | end s p10/med/p90 | ends in 60–90 s | one crowd left | alive at 60 s | alive 15 s before end | lead changes, last 30 s | circle deaths / match | deaths with ≥ 40 people / match | crowd eliminations / match | you place |
|---|---|---|---|---|---|---|---|---|---|---|
| Bronze | 64/73/90 | 96% | 79% | 4.0 | 4.2 | 0.1 | 0.2 | 0.00 | 6.5 | 3.71 |
| Gold | 65/71/90 | 99% | 84% | 3.8 | 4.1 | 0.1 | 0.2 | 0.00 | 6.6 | 4.18 |
| Legend | 63/71/90 | 97% | 88% | 3.5 | 3.9 | 0.0 | 0.1 | 0.00 | 6.8 | 4.29 |

- **Ends:** the match reliably ends inside 60–90 s.
- **The last stretch is a squeeze.** About 4 crowds are still alive 15 s before the end, and they are crushed into the
  42 m circle. Lead changes are rare, because the biggest crowd usually survives.
- **Circle deaths:**
  - Bots almost never die to the circle stupidly: 0.1–0.2 circle deaths a match, all in the final stage, all small
    crowds (median peak 7–13 people while outside), after 2–4 s outside.
  - None had 40 or more people.
- **The final 18 m stage rarely matters:** the median end is 71–73 s.

### Infection: retuned

| | Bronze | Gold | Legend |
|---|---|---|---|
| horde wins, before (60/league) | 3% | 8% | 15% |
| survivor score spread (max − min), before | 3 | 3 | 3 |
| horde wins, after (100/league, seed 31000) | 47% | 44% | 57% |
| horde wins, after (100/league, seed 71000) | 40% | 44% | 60% |
| horde wins, after (100/league, seed 91000, final run) | 34% | 47% | 56% |
| survivor score p10/med/p90, after | 141/154/178 | 142/153/181 | 141/151/185 |
| survivor spread median, after | 30 | 31 | 27 |
| all-horde endings, after | 2–3% | 2–4% | 6–15% |

- **Cause:** survivors all scored about 140 (1/s + 20), and the horde scored only 8 per infection. A horde crowd
  practically never ranked first, and finishers were tied on points.
- **Fix:**
  - `eatScore 0.2`: a horde crowd scores 1 point per 5 survivors it eats.
  - `surviveSize 0.06`: a survivor gets +6 points per 100 people at the whistle.
  - The HUD pill now says "eat survivors", and the mode blurb explains both.
- Grid tried at Gold (72 matches each), as horde wins / spread:
  - eat 0.1 / size 0.03: 7% / 14
  - eat 0.2 / size 0.03: 60% / 16
  - eat 0.2 / size 0.06: 51% / 31
  - eat 0.3 / size 0.05 / infect 15: 78% / 25
  - eat 0.4: 81%
- sim_test asserts survivor spread ≥ 8 (`--break=spread` → spread 4.5, FAIL) and its score cap now includes both terms.

### Classic by league (after G4's Bronze retune; no change)

100 matches per league.

| league | you place | win | top 3 | your final crowd | winner's final crowd |
|---|---|---|---|---|---|
| Bronze | 3.07 | 40% | 65% | 567 | 841 |
| Silver | 3.01 | 30% | 68% | 590 | 887 |
| Gold | 3.56 | 27% | 56% | 527 | 926 |
| Platinum | 3.86 | 22% | 50% | 484 | 949 |
| Diamond | 3.83 | 24% | 52% | 485 | 1025 |
| Master | 3.62 | 22% | 59% | 463 | 967 |
| Champion | 3.84 | 20% | 53% | 447 | 977 |
| Legend | 4.38 | 10% | 40% | 394 | 1031 |

The curve rises Bronze → Legend by 1.3 places. It is flat from Platinum to Champion (bot throttle saturates), as G4
found. Bronze sits at 3.07, just above G4's 2.5–3 target. Left alone.

### Economy (8 careers × 300 matches, 10 a day, every 3rd in the Mode of the Day, login reward claimed daily)

| matches | coins/match (all sources) | coins/hour at 2.6 min/match | league at the end | level |
|---|---|---|---|---|
| 1–10 | 140 | 3,222 | Silver | 6.8 |
| 11–50 | 146 | 3,379 | Platinum | 17.6 |
| 51–100 | 152 | 3,499 | Master | 25.6 |
| 101–200 | 143 | 3,296 | Champion | 36.9 |
| 201–300 | 141 | 3,246 | Champion | 45.5 |

Matches of earnings to afford each priced item from a fresh save:

| slot | prices → matches |
|---|---|
| colour | 250→2, 600→5, 1,500→11 |
| hat | 300→2, 350→2, 2,000→13, 2,500→17 |
| leader | 900→7, 3,000→21 |
| trail | 350→2, 2,200→15 |
| ring | 400→3, 2,000→13 |
| flag | 400→3, 1,800→12 |
| plate | 400→3, 1,500→11 |
| badge | 400→3, 900→7 |
| emote | 300→2, 800→6 |
| toast | 500→4, 900→7 |

- **Whole locker:** 55,450 coins ≈ 387 matches ≈ 17 h. The crowd cosmetics alone are 35,600 coins ≈ 247 matches.
- **FLAGGED under 3 matches:** colour 250, emote 300, hat 300 and 350, trail 350 (2 matches each). Nothing is over 300.
- **Reading (REVIEW, no prices changed):**
  - A first purchase after 2 matches is a good hook.
  - The dearest single item is only 21 matches (about 1 h).
  - Early level-ups (Lv 7 after 10 matches) are a big share of early coins.
  - If the locker should last weeks, raise the top tier (King, Lightning, Halo, Crowns) 3–5× rather than touching the
    cheap items.

## 4. Hardening

### Break-arm audit (every arm run once; all FAIL as they should)

- **sim_test**, 17 arms: determinism, nan, stuck, leak, events, distribution, jitter, league, restore, remote, classic,
  ally, zone, circle, infect, spread, event. All exit 1.
  - **Finding:** for 6 arms (distribution, events, jitter, leak, nan, stuck) the *first* failure printed is the Classic
    hash pin, because those arms change Classic. That could hide a dead dedicated check.
  - I checked each arm's own message:
    - distribution: "city emptied";
    - events: "pickup never occurred";
    - jitter: "jittery steering 5355°/s";
    - leak: "count not conserved at tick 900";
    - nan: "NaN at tick 15";
    - stuck: "a crowd was stationary".
  - All are still live. No arm passes when it should fail.
- **meta_test**, 18 arms: all exit 1.
- **net_test** arms: `counts`, `migrate`, `late`, `bytes`, `rate`, `version` and `emote` all FAIL. The new arms are
  `lobbymode`, `reload`, and `--mode=koth --break=mode`, and each FAILS:
  - `lobbymode`: guests never see the pick.
  - `reload`: no begin after the reload.
  - `mode`: 4 of 23 sampled ticks differ.
- **net_cdp** arms: `rejoin` FAILS (the reloaded guest stays on the menu), and `hidden` FAILS (see below).
- **Follow-pointer** arms: `drag` and `nodead` FAIL (§0A).
- **Go:** each new test was proven to fail with its code removed (§2).

### net_test per mode

| mode | result |
|---|---|
| teams | PASS, after a harness fix (below) |
| koth | PASS |
| lcs | PASS |
| infection | PASS |
| classic | PASS (with the new reload and lobby-mode checks) |

- **Harness bug fixed:** "guests mirrored non-zero mode scores" could never pass in Teams, which has no per-crowd
  score. The samples now carry the side totals.
- **Harness fix for the reload step:** the reloaded client's independent pedestrian checker missed the keyframe
  (pre-begin buffer), giving a false 9.6 m error. It now waits for the next keyframe.

### Guest reload mid-match (was untested; was in fact broken in the browser)

- **Bug:** a reloaded page landed on the menu and only rejoined if the player opened Online again.
- **Fix:**
  - The tab keeps `throng.live` in sessionStorage during an online match.
  - At boot, that marker reconnects with the same `cid`, and the server hands the crowd back.
  - The marker is cleared at results and leave, and after 15 s if no match resumed.
- **net_test [reload]:** the same crowd (not "late"), back within 2 ticks of the host. Sampled counts and pedestrians
  match. `--break=reload` (new cid) FAILS.
- **net_cdp (real `Page.reload`):** "after a reload the guest is back on its own crowd without touching anything (1,
  was 1)" and "the reloaded guest mirrors the host again (4 sampled ticks, 0 differ)". `--break=rejoin` FAILS.

### Host hidden 30 s

- **Setup:** net_cdp hides the host tab for real, by opening and activating another tab in its window. That gives
  `visibilityState hidden` and Chrome's 1 Hz timer throttling.
  - The harness's focus emulation had been keeping the tab "visible" and is switched off for this step.
  - The page is then **frozen** (`Page.setWebLifecycleState`) for most of the 30 s, like a phone.
- **Result:**
  - The guest took over 2 ms after hiding (the client's `handoff`).
  - The match ran at 30 ticks/s for the whole 30 s, and the guest's longest stall was **0 ms**.
  - Back in front, the old host follows as a guest, 4 ticks behind.
- **`--break=hidden`** (no handoff, no freeze): the throttled host keeps the room at 1 Hz bursts. The guest sees a
  895 ms stall and never takes over, so it FAILS.
- No game fix was needed: the M3 handoff already does it. The server's 3 s `hostSilence` covers a host whose handoff
  never left the phone.

## 5. First session (fresh profile, 390×844 touch, no URL params; `scratchpad/g5/firstsession.mjs`, shots `g5/fs1/`)

| moment | measured | verdict |
|---|---|---|
| Boot screen painted | 0.40 s (localhost, M5) | fine |
| Game ready, menu behind the fade | 1.0 s, 73 requests, **2.7 MB of JS** | the JS weight is the phone risk (below) |
| Menu | crowds big behind the title (after this wave's attract change), Daily dot visible, no sign-in nudge | fine |
| Tap PLAY → match screen | **4.4 s** fake "finding players" + 3 s countdown = play 7.4 s after the tap | **too slow for a first match: fixed**, the first match's lobby now lasts 1.3 s |
| Hints | "Drag anywhere to move" at 0 s, "Sweep up the grey people" at 3.2 s, "Bigger crowds absorb…" at 27 s; each left by itself | fine |
| ABSORBED! veil | the sub-line "by NAME — respawning…" wrapped and was hard to read on light paving | **fixed**: dark plate, smaller on phones |
| Whistle → results | 2.55 s | fine |
| Results | clear: place, coins (+19), XP, the daily challenge progress | fine |
| Second match | lobby 2.9 s (normal) | fine |
| First daily reward | only a red dot on the Daily button. After two matches it was still unclaimed (40 coins) | **fixed**: the menu's daily strip says "Daily reward ready · day 1 · 40 CLAIM" with a gold pulse until claimed, then shows the challenge again (verified) |
| Sign-in nudge | never appeared in the first session (the account layer's own pacing). The avatar was there from the first frame | fine as designed |
| Console errors | 0 | — |

**Re-run after the fixes** (`g5/fs2/`, same script):
- First tap → match screen in **1.8 s** (was 4.4 s), and play in **4.9 s** (was 7.4 s). The second match still has
  the normal ~4 s lobby.
- The three hints came at 0.1 s, 3.3 s and 13.1 s.
- The absorbed sub-line now sits on a dark plate and reads cleanly.
- 0 console errors.

**Not fixed: JS weight (for the manager).**
- `index.html` imports the unminified `three.module.js` + `three.core.js` (2.0 MB). Switching the importmap to
  `three.module.min.js` saves ~1.3 MB of parse on phones.
- **But `games.br8t.com/gms/lib/three/0.180.0/three.module.min.js` and `three.core.min.js` return 404 today**, while
  yru.br8t.com has them. The switch would silently hang the game on the box (the CDN-importmap trap).
- So I did **not** change it. To do it:
  1. Copy both `.min.js` files to the box's `/gms/lib/three/0.180.0/`.
  2. Then change the `"three"` line in the importmap to `three.module.min.js`.

**Also noticed, not fixed:**
- When you leave a match early, the results list shows your row at its live sim rank (rank 1 if you were biggest)
  under "LEFT MATCH · Counted as last place".
- At the start of a match your 4-person crowd wears the crown because all crowds are tied.

## 6. Other changes

- `?fps=1` overlay: fps, the 5 % low, quality, DPR, draw calls and triangles. Checked at 390×844, 844×390 and
  1440×900 (`ui/fps_*.png`): 60 fps, medium, 14–16 draws.
- docs/PLAYTEST.md: a 15-minute real-phone checklist (20 numbered steps plus 9b/9c).
- docs/NET.md and docs/CONTRACT.md (test hooks) updated. `docs/notes/G_requests.md` has the wave-5 asks for lane R.

## 7. Files

| | |
|---|---|
| `js/input.js` | follow-pointer mouse steering |
| `js/main.js` | zones key/colour/ids, look weather, festival hold, attract config and focus, rejoin marker, `?fps=1`, first-match lobby length, input wiring |
| `js/ui/hud.js` | `zonesOf(state, colors)`, Infection pill text |
| `js/ui/online.js` | lobby mode push and display, board mode chips |
| `js/net/online.js` | `feat`, `setMode` |
| `js/ui/panels.js` | Mouse and Fullscreen settings |
| `js/ui/fullscreen.js` (new) | the Fullscreen helpers |
| `js/ui/menu.js` | daily strip claim |
| `js/ui/hints.js` | the pointer hint |
| `js/sim/match.js` | Teams draft |
| `js/sim/sim.js` | Infection `eatScore`/`surviveSize` |
| `js/sim/bots.js` | attract `focus` |
| `js/config.js` | Teams `oppThrottle`, Infection knobs and blurb, `INPUT.follow*` |
| `js/meta/events.js` | `winterLook` |
| `js/meta/save.js` | `settings.mouse` |
| `css/ui.css` | popups clear of the badge, compact short results, absorbed plate, daily claim, fps strip, lobby pick, board chips, settings rows |
| `server/hub.go`, `session.go`, `db.go`, `boards.go`, `integration_test.go` | lobby mode, features, schema 2, per-mode boards, tests |
| `tools/sim_test.mjs` | Infection checks + `spread` arm |
| `tools/net_test.mjs`, `net_client.mjs` | lobby mode, reload, Teams sample fix, new arms |
| `tools/net_cdp.mjs` | guest sees the pick, real reload, hidden host, arms, error filter |
| `tools/mode_sweep.mjs`, `tools/econ_sweep.mjs` (new) | the balance sweeps |
| `docs/PLAYTEST.md` (new), `docs/NET.md`, `docs/CONTRACT.md`, `docs/notes/G_requests.md`, this report | docs |

## 8. Known gaps

- Nothing was played by a person this wave, and nothing on a real phone (that is what PLAYTEST.md is for).
- The three.js min-file switch needs the box files first (§5).
- The economy flags are reported, not acted on (§3).
- LCS lead changes in the last 30 s are rare (0–0.1), because the biggest crowd survives. It is tense as a squeeze, not
  as a race.
- Infection is inside the 40–60 % band on average, but at the edges per league: Bronze 34–47 % (mean 40 %) and Legend
  56–60 %, over three seed sets.
- The Classic curve is flat from Platinum to Champion.
- The first-session check drove the match with a scripted touch "player" (it finished 5th twice). It says nothing
  about how fun a first match is for a human.
