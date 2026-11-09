# story7 — notes (Chapter 7 · Grand Tour: Sunken Reef → Star Station → Jungle Temple)

Owner: `story7` agent. Status: **done** (see Tests). Nothing committed (manager commits).
Screenshots: `docs/notes/story7_shots/` (gitignored).

## The chapter
`js/story/data/ch7_grand.js` (pure data, same shape as ch1–6), registered in `chapters.js` after the Legends.
An invitational "for Legends only" that travels Reef → Star → Jungle, a local champion at each stop, then a final.
No rank (Legend is the top): trophy **The Grand Tour Compass**, like the World Tour's globe.

| # | id | kind | holes (theme) | goal | reward |
|---|---|---|---|---|---|
| 1 | gt-qual | round · Invitation Qualifier | fest9, sugar9 (candy) | 4 stars / 2 holes | 120 |
| 2 | gt-reef-l1 | lesson · Ride the Current (Pearl) | reef2 (reef) | ≤ 3 | 80 |
| 3 | gt-reef-r1 | round · Wreck Round | reef1, reef3, reef5 (reef) | 6 stars | 130 |
| 4 | gt-reef-rival | **rival · Pearl Marlowe** | reef4, reef6, reef8, reef9 (reef) | beat her total | 300, +2 Long Sight +2 Magnet, **Glow Ball** |
| 5 | gt-star-l1 | lesson · Rails in Orbit (Nova) | star3 (star) | use Bumper Guard, ≤ 3 (2 granted) | 80 + 1 Guard |
| 6 | gt-star-r1 | round · Docking Round | star1, star2, star5, star6 (star) | 8 stars | 140 |
| 7 | gt-star-rival | **rival · Nova Reyes** | star4, star7, star8, star9 (star) | beat her total | 340, +2 Steady Hands +2 Bumper Guard, **Starry Night ball** |
| 8 | gt-jungle-l1 | lesson · Knock-outs (Tika, sparring ball) | jungle2 (jungle) | ≤ 3 | 80 |
| 9 | gt-jungle-r1 | round · Temple Round | jungle1, jungle3, jungle4 (jungle) | 6 stars | 140 |
| 10 | gt-jungle-rival | **rival · Rocco Thorn, ball hits** | jungle5, jungle6, jungle8, jungle9 (jungle) | beat his total | 380, +2 Mulligan +2 Power Tee, **Rainbow trail** |
| 11 | gt-final | tournament · Grand Tour Final | reef7 reef9 star2 star5 star8 jungle3 jungle6 jungle7 jungle9 (jungle) | top 3 of 12 | 500, +3 Long Sight +3 Ghost Ball |

Rewards sit between chapters 5 and 6 per event (lessons 80 like ch6; rivals 300 / 340 / 380 between The Pro 260 and
Mags 500; the final 500 vs the Legends Cup 400; ~2,290 coins over 11 events vs ch6 1,240 over 5). The three cosmetics
are ones no earlier chapter gives; an owned one pays half its price (existing `grantCosmetic`). Two helper kinds per
reward (not 3–4 like ch5/ch6): at 412 px the reward column squeezed "Rival: Pearl Marlowe" into three lines, so the
rival rows are also named by first name ("Rival: Pearl" / "Nova" / "Rocco"; the goal text has the full name).

### Characters (characters.js) and golfers (golfers.js)
- **Pearl Marlowe** — Sunken Reef champion, free-diver, never in a hurry. `careful`, 0.45.
- **Commander Nova Reyes** — Star Station flight engineer, runs the numbers twice. `professor`, 0.50.
- **Rocco Thorn** — Jungle Temple champion, loves a ball fight. `power`, 0.88 (power is erratic, needs the high number).
- **Tika Thorn** — temple guide, Rocco's sister; her ball is the sparring ball. `professor`, 0.3.
- Final field (11): Rocco, Nova, Sterling Vance, Pearl, Ada Quill, The Professor, Kenji Sato (new), Bertha, Banks,
  Zippy Zoe, Marisol Vega (new); 0.44–0.54, `*_gt` entries so earlier events keep their skills.
- Speakers: sunny, mags, pearl, nova, tika, rocco, pro.

### Difficulty (why the skills restart lower)
The AI plays the reef / star / jungle holes far better per skill point than the sky holes. With the first draft
(Pearl .78, Nova .82, Rocco .86, field mean .785 = just above the Legends) `story_test --difficulty` said you'd need
**−1.9 / −3.6 / +2.9** to beat the rivals and **−6.5** to make the Final podium. Tuned by measurement instead
(`node tools/story_test.mjs --difficulty --seeds=16 --chapters=grand`):

| event | holes | need ≤ (avg of 16 seeds) | humanish bot |
|---|---|---|---|
| gt-reef-rival (Pearl .45) | 4, par 14 | +1.4 | +0.4 |
| gt-star-rival (Nova .50) | 4, par 16 | +0.3 | +1.3 |
| gt-jungle-rival (Rocco .88) | 4, par 15 | +1.2 | +2.3 |
| gt-final (field .44–.54) | 9, par 33 | +0.1 | +2.9 |
| (for comparison) leg-cup / leg-final | 9 / 4 | +1.3 / 0.0 | +4.5 / +4.6 |

4-hole matches swing ±4 per seed. The story_test ramp check ("rival and field stronger than the tour before") now
skips `grand` with a comment; inside the chapter the rivals still rise (.45 → .50 → .88) and D14 (≤ 0.9) holds.
`--chapters=a,b` was added to `--difficulty`, plus the reef/star/jungle humanish numbers from their notes.

## Ball hits (Battle) in the story
- `gt-jungle-rival` is the first rival match with ball hits. The story **does not force** the mode: the Round uses the
  player's `settings.ballHit` as it always did (Battle by default). An event with `battle: { on, off }` gets extra
  before-lines for the mode in force: Battle explains knocked out of bounds = **+1 to the ball's owner** (and that a
  resting ball can be hit); Classic says "You've got Ball hits set to Classic in Settings, so…" and how to switch.
  The event row shows `· Battle` / `· Classic`, the warm-up card "Ball hits: Battle", the result card the mode
  (Classic adds "change it in Settings"), and the HUD tip uses `tipsClassic` in Classic.
- `gt-jungle-l1` "Knock-outs" is the teaching moment for the new mechanic: a **sparring ball** (`sparring:
  { golfer: 'tika', seed: 12, park: 1 }`). career.js plays Tika on the hole with a fixed seed and keeps only her first
  shot, so her ball **parks on the Rope Bridge** (wall-less, over the gorge) every try and never moves on its own.
  In Battle you can knock it off for +1 to her (existing GhostSim: it goes live and the AI plays on); Mags says to clip
  it on the side (a head-on hit just pushes it along the bridge). Not claimed in the text: the aim guide's contact
  ring, because play.js `guideTargets()` returns nothing for the tee shot when a ghost is on the hole. Goal is just ≤ 3 strokes; a knock-out adds Tika's "Into the gorge, +1 to me" line
  (`afterKnock`, detected from play.js's hole note "Tika Thorn: knocked out +1"). No board for a lesson.
  story_test checks the seed still parks her ball on the bridge (x≈0, z −5.64; bridge −2.7…−6.5), so an AI change
  that moves it fails loudly — re-pick the seed then (scratch script in this note's history: try seeds 1–12).
- `gt-star-l1` is the helper teaching moment on the new terrain: Bumper Guard on Gantry Walk (wall-less grating over
  the void). The tip names the helper and "the helper column" only (no corner), checked in a 412×915 screenshot.

## Gating and course locks
- **Chapter**: opens when Old Mags (`leg-final`, ch6's rival) is beaten, like every tour. Events inside open in order.
  `rivalOf()` now returns the chapter's **last** rival (Rocco) as the gate for a following chapter; with one rival per
  chapter (1–6) nothing changes. The "<next tour> unlocked!" line only shows for that gate rival; Mags' "head on to the
  next tour any time" line only when a next tour exists; a rival's `tip` overrides Mags' "win and the next tour opens".
- **Courses**: how the existing chapters do it — the story opens a course by **playing its gate hole as a normal,
  progress-keeping story hole**. ch4 `nat-r1` plays sky9 (Hollow Woods opens), ch5 `world-r2` then plays Hollow Woods.
  The story has never used the events4 taster rule (story rounds are plain `Round`s, `keepsProgress` true). The Grand
  Tour follows the same pattern, so the story is the natural path to the three new courses:
  - `gt-qual` plays **fest9 then sugar9**: fest9 opens Sugar Summit, sugar9 opens Sunken Reef (side effect, as ch4 →
    Hollow Woods: Sugar Summit opens too). Festival Isles has no lock.
  - `gt-reef-rival` ends on **reef9** → Star Station opens; `gt-star-rival` ends on **star9** → Jungle Temple opens.
  - New guard `courseLock(unlocked, ev)` (career.js): an event stays locked, with the course's own `lockedBy.note`
    ("Finish Sugar Summit to open Sunken Reef."), while any of its holes is on a course that is still closed
    (holes earlier in the same event count, so the qualifier's fest9 → sugar9 works). In normal story order it never
    triggers (story_test plays every chapter in order from a fresh save and checks each hole's course is open when it
    is played; also that woods opens at nat-r1, sugar + reef at gt-qual, star at gt-reef-rival, jungle at
    gt-star-rival). It only matters for odd saves / dev shortcuts — no story hole of a closed course is ever played,
    so no "played hole on a locked map" leak.
  - The result card names a course the event opened: "Sunken Reef is open on the course map!".
- So yes, the story unlocks progress on Sugar Summit (sugar9), Sunken Reef (reef9) and Star Station (star9) records,
  the same way it records sky9. The taster rule stays events/daily-only.

## Tip fixes in older chapters (found while checking the 412×915 screenshots)
The HUD hint pill is one line (`.hint { white-space: nowrap }`). A 66-char tip lost both ends at 412 px, which
means ch1's two helper tips (67 and 75 chars, the ones fixed after Aaron's "bottom right" report) were clipped on his
phone too. Shortened (story data only, positions unchanged and still correct: Long Sight is the top of the
right-hand helper column, Mulligan second):
- muni-l2 → "Tap Long Sight (top of the helper column) to aim"
- muni-l3 → "Putt, then tap Mulligan (2nd in the helper column)"
- leg-l1 (57) → "Time the windmill, then commit to the loop"
story_test now fails any story tip over 54 chars.

## Files
New: `js/story/data/ch7_grand.js`, this note.
Changed (story only): `js/story/career.js` (`rivalOf` = last rival, `courseLock`, `gatedCourses`, `battleOn`,
`modeName`, `knockedOut`; event rows / warm-up / result card / Mags' tip as above; sparring ghosts; Battle/Classic
lines and tips), `js/story/data/{chapters,characters,golfers}.js`, `tools/story_test.mjs` (Grand Tour checks,
`--chapters=`, humanish table), `tools/shots_cdp.mjs` (career mode: `--chapter=7`, `--classic`; an event marked
passed also finishes its holes, like playing it would — needed now that events check course locks).
**No shared hunks**: nothing in js/app/main.js, menus.js, js/game/, js/events/, js/net/, css or the themes.

## How to test
```
node tools/story_test.mjs
node tools/story_test.mjs --difficulty --seeds=16 --chapters=grand
~/.claude/bin/cdp start --port 9671
node tools/shots_cdp.mjs career --port=9671 --own --chapter=7 --holes1 --out=docs/notes/story7_shots/holes1
node tools/shots_cdp.mjs career --port=9671 --own --chapter=7 --only=gt-jungle-l1 --classic --holes1 --out=DIR
```

## Tests (2026-11-09)
- `story_test`: all passed (new: Grand Tour data, gating, the full-story course-lock chain, Battle/Classic lines and
  tips, knock-out detection, Tika parks on the bridge, rewards, tip length ≤ 54). `--difficulty` table above.
- physics 25/25 · daily 87/87 · events, meta, store: all passed · ballhit 46/46 · online 50/50 · holes_test exit 0 ·
  boards_test 26/26 against the local server on :8098 (already running, started by another agent) · `server/test.sh` ALL PASS.
- Browser (headless Chrome, CDP :9671, 412×915), **no console errors in any run**:
  - `career --chapter=7 --holes1`: all 11 events open in order, intros/before dialogue, warm-up cards, themes
    (candy, reef, star, jungle) and the first hole of each; trophy card. Shots in `story7_shots/holes1/`.
  - Full plays: **gt-reef-rival** (the chapter's first match: 13 vs Pearl 17, ghost knocked live twice, Glow Ball granted),
    **gt-jungle-rival** in Battle (14 vs Rocco 18, card "Ball hits: Battle", Rainbow trail), **gt-qual** (card shows
    "Sugar Summit is open on the course map!" + "Sunken Reef is open…").
  - Knock-out lesson (scratch CDP script): Battle and Classic dialogue, Tika's ball parked at (0, −5.64) in the browser
    too (same as node), tips per mode fit the hint pill; Classic → `collide:false`, no GhostSim. `story7_shots/tika/`.
  - `--only=gt-jungle-rival --classic --holes1`: Classic dialogue + tip. ch1 `muni-l2/l3 --holes1`: shortened tips fit
    and Mulligan is second in the right-hand helper column.

## Open questions
- Difficulty is tuned on 16 AI seeds; 4-hole matches swing ±4. Rocco (power) is erratic: some seeds he picks up on
  Hidden Path / Idol Court. Worth a phone play by Aaron.
- Reward rows with 3–4 helper kinds (ch5 World Final, ch6 Legends final/cup) squeeze the event name at 412 px;
  ch7 avoids it with 2 kinds. A CSS fix (reward column wrap) would be in css/app.css (not touched here).
- The story opens Sugar Summit through the qualifier's fest9 (like ch4 opens Hollow Woods via sky9). If Aaron would
  rather the story never open Sugar Summit, the alternative is to lock gt-qual behind Sugar Summit being open
  (courseLock already says "Finish Festival Isles to open Sugar Summit.") and play only sugar9.
