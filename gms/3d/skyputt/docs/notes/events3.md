# events3 — notes (yearly events + weekend events)

Owner: `events3` agent. Status: **done** (see Test results). Nothing committed (manager commits).

## What changed
1. **Yearly recurrence.** The six event files are now *series*: `series`, `since`, `recur: 'yearly'` and a
   `dates` rule instead of `id` / `start` / `end`. `js/events/calendar.js` turns a series into one dated
   **run** per year, id `${series}-${year of its start}`:
   - fixed windows: Spooky Open `10-20 → 11-08`, Frost Fair `12-01 → 01-06` (runs into the next year),
     Sky Games `06-26 → 07-18`;
   - `rule: 'easter'` (Gregorian computus, no table): Egg Hunt = Easter −8 … +8 days;
   - `rule: 'lunar'` (table of Lunar New Year dates 2026–2040, `LUNAR_NEW_YEAR`): Lantern Festival =
     LNY −10 … +15 (covers New Year and the Lantern Festival on day 15);
   - `rule: 'between'`: Candy Carnival = 3 days after the Lantern Festival ends → 3 days before the Egg Hunt,
     at most 24 days (late Easter years: weekends fill the rest).
   For their first year every rule gives exactly the old dates, ids and ladder seeds
   (`spooky-open-2026`, `frost-fair-2026`, `lunar-lanterns-2027`, …), so **old saves and the live 2026
   Spooky Open ladder are unchanged**. Later years get a new ladder seed (`seed + (year − since) × 104729`),
   so new bots, and — because saves are keyed by run id — their own goals, points, pickups ledger and rank
   claim. A run inherits everything else from its series (`Object.create(series)`), so data stays in one place.
   Runs are cached, one object per id. `eventById(id)` rebuilds any run from a save key.
2. **Weekend events** (`js/events/data/weekends.js`): every Fri–Sun with no big event gets one (Sat–Sun or
   Fri–Sat if a big event touches the Friday or Sunday; never under 2 days; never a shared day). Starts
   after the 2026 Spooky Open (`WEEKEND_FIRST = 2026-11-09`). Four kinds take turns in order of the runs
   (so a block of free weekends always cycles all four):
   | kind | name | holes | twist | currency |
   |---|---|---|---|---|
   | windmill | Windmill Weekend | 5 with a windmill or mover (≥ 1 windmill) | — | 🌀 Pinwheels |
   | aces | Ace Hunt | 5 par ≤ 3 | 50 points per ace (25 normally) | 🎯 Bullseyes |
   | fewest | Fewest Strokes | 5 from anywhere | 18 points per stroke under par (12 normally) | ⛳ Flags |
   | crystals | Crystal Rush | 6 par ≤ 4 | "collect all" goal | 💎 Crystals |
   Holes come from **every course in `COURSES`**, read when the run is built (Sky Isles, Festival Isles,
   Hollow Woods today; a new course joins automatically), ranked by a per-weekend hash. Theme rotates through
   `THEME_LIST` (sky, spooky, frost, candy), `themeFallback: 'sky'`. Each has 4 goals and a 15-player ladder
   (14 bots, `pace 2.2`) with 3 rank tiers. Ids: `weekend-<kind>-<friday>`.
   Optional `scoring: { under, ace }` on any event tunes `roundPoints` (additive arg, default 12 / 25).
3. **Events screen**: sections *Live now* (or "Nothing live today. Next up: …, dates"), *Coming up* (next 5
   + the next two big events, with date ranges and countdowns, WEEKEND tag), *Rewards waiting* (any older
   run you played with an unclaimed final rank — found from the save keys), *Recently ended* (21 days).
   The list never creates save entries (it peeks); the page shows the hole names as chips (course on hover).
   Two-column list in landscape ≥ 700 px wide. Date ranges show the year when not this year.
   **Title tile**: the live (or next) event + countdown + a third line "Next: <event> · <dates>".

## Balance
Big events pay ~1000+ coins (goals + top rank) plus silver/gold chests. A perfect weekend pays **≤ 185
coins** (goals 15 + 20 + 25–40 + 30, top rank 80), **one wooden chest** (points goal) and **≤ 2 helpers**.
2027 has 30 weekend runs → ≤ 5550 coins a year if you win every one, ≈ 74 rounds of normal income at
~75 coins a round (meta.md). Realistic play (finish goals, top 10) ≈ 105 coins a weekend.
Ladder: 2 good rounds a day (−2) → median rank 2/15 and the points goal (300); one casual round → ~12/15.

## Calendar, next 12 months
| dates | event | theme |
|---|---|---|
| 2026-10-20 → 11-08 | Spooky Hollow Open (live now) | spooky |
| 11-13 → 11-15 | Fewest Strokes · wood5 fest2 fest7 fest9 sky18 | sky |
| 11-20 → 11-22 | Crystal Rush | spooky |
| 11-27 → 11-29 | Windmill Weekend | candy |
| 2026-12-01 → 2027-01-06 | Frost Fair Festival | frost |
| 2027-01-08 / 15 / 22 | Ace Hunt · Fewest Strokes · Crystal Rush | sky · spooky · frost |
| 01-27 → 02-21 | Lunar Lantern Festival | frost |
| 02-24 → 03-17 | Candy Carnival | candy |
| 03-20 → 04-05 | Easter Egg Hunt | sky |
| 04-09 → 06-20 | 11 weekends: Windmill, Ace Hunt, Fewest, Crystal Rush, … | rotating |
| 06-26 → 07-18 | Midyear Sky Games | sky |
| 07-23 → 10-17 | 13 weekends | rotating |
| 2027-10-20 → 11-08 | Spooky Hollow Open 2027 (new ladder, fresh goals) | spooky |
Later years e.g. 2028: Lunar 01-16 → 02-10, Candy 02-13 → 03-07, Eggs 04-08 → 04-24 (Easter 04-16).
`node tools/events_test.mjs` prints 2028 and 2035.

## Files
New: `js/events/calendar.js`, `js/events/data/weekends.js`, this file.
Changed: `js/events/data/{spooky_open,frost_fair,lunar_lanterns,candy_carnival,egg_hunt,sky_games}.js`
(series + dates rule), `js/events/data/index.js` (`SERIES`), `js/events/events.js` (re-exports calendar,
`EVENTS` = first runs, `around` / `overview` / `nextUp`, `featured` default list, `scoring`),
`js/events/screen.js` (sections, `eventTileHTML`, `fmtRange` with year, hole chips, peek),
`js/app/main.js` (2 lines: tile uses `eventTileHTML`, import), `css/app.css` (events3 block after `.btn svg`: tile next line, WEEKEND tag, hole chips, 2-line blurbs, goal rewards wrap, two-column list + goals in landscape ≥ 700 px),
`tools/events_test.mjs` (events3 sections; two `featured` checks now compare against big events only),
`tools/shots_cdp.mjs` (`events3` mode).

## How to test
```
node tools/events_test.mjs
~/.claude/bin/cdp start --port 9580
node tools/shots_cdp.mjs events3 --port=9580 --own --out=DIR [--days=2026-11-03,…] [--sizes=p,d,l] [--quick|--no-play]
```
URLs: `?eventdate=2026-11-14` (weekend live), `2026-11-10` (nothing live, next up), `2027-04-24`,
`2028-03-01` (Candy 2028), `2031-10-25` (Spooky 2031).

## Test results (2026-11-03)
- `events_test` 128 checks, all pass (old + events3: series data, first runs = old ids / dates / seeds,
  Easter 2026–2035, every series every year 2027–2035 incl. Easter / Lunar New Year / Lantern Festival,
  Candy 2 weeks – 24 days, no overlaps 2026–2030 and to 2040, per-year ids / seeds / bots, old save with
  `spooky-open-2026` + `frost-fair-2026` keys loads and keeps its progress while 2027 starts fresh and both
  persist, weekend calendar (2–3 days Fri–Sun, never a big-event day, every free Saturday covered, kinds
  cycle, holes from every course, every theme used, ids rebuild), reward balance, weekend ladder, screen data).
  Two old `featured` checks now pass `bigEvents()` as the list (a weekend is now featured between big events).
- `physics` 25/25, `store`, `story`, `meta` all pass; `holes_test` 0 failed; `online_test` 28/28 (:8098 left running).
- Browser (`shots_cdp events3`, Chrome on :9580, `--own`): 2026-11-03 at 412×915, 1440×900 and 844×390
  (title tile with "Next:" line, list sections, Spooky page; no horizontal overflow; two-column list in landscape),
  2026-11-10 (nothing live → next up), 2026-11-14 (weekend live, landscape), 2027-04-24, 2028-03-01 (Candy 2028
  02-13 → 03-07), 2031-10-25 (Spooky 2031). A full Fewest Strokes weekend round played by touch drags on
  wood5 · fest2 · fest7 · fest9 · sky18 in sky: 19 vs par 18, +65 points, +6 flags, rank 5/15, goal claimed,
  save key `weekend-fewest-2026-11-13`, player theme restored. No console errors.

## Known issues / notes
- Weekend holes can come from Hollow Woods before the player has unlocked it (front nine). Playing them in
  an event opens them on the map (events2 rule "a hole already played is open"). Fine as a taster; if not,
  filter `allHoles()` by `lockedBy` in calendar.js.
- A weekend's hole picks and theme are computed from `COURSES` / `THEME_LIST` at load time, so adding a
  course or theme changes the picks of weekends not yet played (and could change a live one after a deploy).
  Saves are unaffected (keyed by id; pickups by hole id).
- Mon–Thu between weekend runs has nothing live (longest gap 5 days). Proposal below.
- Lunar dates are a table to 2040 (`LAST_YEAR`); nothing is generated after that.

## Proposals for DECISIONS
- P1: Events are yearly series; a run's id is `${series}-${year}` and owns its save entry, ladder seed and
  pickups. Old fixed ids are the first runs.
- P2: Weekend events fill every free Fri–Sun with small rewards (≤ ~185 coins, one wooden chest).
- Option: a midweek "Daily Challenge" (one hole a day, tiny reward) would make something live every day.
