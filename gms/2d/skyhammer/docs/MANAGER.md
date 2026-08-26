# SKYHAMMER — MANAGER STATE

**Read this, then `CONTRACTS.md`, then `ART.md`, then whichever `*_NOTES.md` exist.**

## What this is

A mobile-first **landscape** 2D side-scrolling WW2 plane game for the Y-R-U site, at
`gms/2d/skyhammer/`, served from `/gms/2d/skyhammer/`. Shape reference: the mobile game
**Aircraft Evolution** (Satur Entertainment) — Aaron named it as the target and the manager
studied its store screenshots. Fly left to right, main gun auto-fires, bomb ground targets with
4 thumb-button specials, dogfight, collect balloons, land on carriers, spend the money in a
hangar between levels. 100 story levels across 5 acts, plus Survival / Time Attack / Boss Rush /
weekly event. WW2 to start, drifting into jets and light absurdity later — nukes are on the
upgrade tree and you survive your own blast.

## Why it is not KITEHAWK

KITEHAWK (`gms/2d/kitehawk/`) was the previous attempt at "Aaron's plane game" and Aaron has
called it: start from scratch. It was **portrait**, its signature mechanic was parachute supply
crates, and it accumulated ~900 KB of docs and 78 generated art plates before it was fun. What we
took from it: **`tools/cdp.mjs`, `tools/shot.mjs`, `tools/touch.mjs`** — a battle-tested raw-CDP
headless-Chrome harness with two expensive gotchas already solved. Those three files are
**frozen**; nobody edits them. We took nothing else. Its generated art is badly keyed (black
mattes, magenta fringing) and is not reusable.

## The order of work

| Phase | What | State |
|---|---|---|
| P0 | Contracts, art direction, seeded data tables | **done** |
| P1 | Four parallel agents: ENGINE+SIM, ART, DESIGN, UI | running |
| P2 | Manager integrates: real renderer swapped in for `gfx/debug.js`, UI wired to main | |
| P3 | Playtest and tune — the camera numbers and the point-at-finger feel are expected to move | |
| P4 | Audio: music + sfx + haptics | |
| P5 | Modes, attract screen, special events | |
| P6 | Ship: `projects.js` entry with `wip: true`, screenshot, commit, push | |

## How this run works

- The manager **verifies claims rather than accepting reports**. Screenshots get looked at; gates
  get falsified; detail lines get read, not pass counts.
- **Agents do not run git.** The manager stages `gms/2d/skyhammer/`, one `projects.js` hunk and
  the screenshot, explicitly. **Never `git add -A`** — other sessions have live uncommitted work
  in this tree.
- **One owner per file** (CONTRACTS §10). Four agents ran concurrently in P1 only because their
  file sets are disjoint and the world/renderer/hitrect contracts were written first. Cross-file
  contracts are where multi-agent builds die.
- At every playable milestone: commit, push, and make sure the `projects.js` entry exists with
  `wip: true` until the game is finished.

## Open questions for Aaron

1. Music: Suno in the browser as he asked, vs the local ACE-Step generator. Manager is checking
   which is faster; Suno probably wins on quality for the WW2→metal transition he described.
2. Whether the eras past act 2 stay WW2-flavoured or go openly cyberpunk. He said tbd.

## Ship checklist (P6)

1. `projects.js` — add the SKYHAMMER entry with `wip: true` and a real `desc`, `date`, `creator`.
2. Screenshot at `assets/screenshots/skyhammer.jpg`.
3. Re-run the registry walk: parse `projects.js`, confirm entry count and **0 dead paths**. Aaron's
   rule — the registry drives the tiles, so walk it against the filesystem after any path change.
4. Stage **explicitly**: `gms/2d/skyhammer/`, the `projects.js` hunk, the `index.html` hunk, the
   screenshot. **Never `git add -A`** — other sessions have live uncommitted work in this tree.
5. Check behind/ahead before rebasing; several sessions share this checkout and `--autostash`
   would stash someone else's live work.

**Done already (2026-08-26):** KITEHAWK re-tagged from *In progress* to **CANCELLED** at Aaron's
request. Needed a new mechanism — the page only understood `wip: true` → "In progress" — so
`projects.js` entries now support `status: "cancelled"` and `index.html` renders a
`.card-wip-badge.is-cancelled` variant. Two contrast iterations: muted grey was invisible against
KITEHAWK's pale cloud screenshot, so it is now **red on a dark plate with a soft glow**, matching
the site's cyber palette and readable against any thumbnail. KITEHAWK's `desc` tail was updated
too — it read "In active build", which would have contradicted the badge. Registry re-validated:
103 entries, 0 dead paths.

## SHIPPED — first playable, 2026-08-26

`0235792` on `main`, pushed. `projects.js` entry with `wip: true`, screenshot at
`assets/screenshots/skyhammer.jpg`. Registry validated: **104 entries, 0 dead paths.**

It renders, it flies, it bombs, the HUD is correct and both renderers work
(`?gfx=debug` still swaps in the grey box). 18.1 MB shipped, of which 14.9 MB is the
22 music tracks. `shots/`, `docs/refs/` and the 54 MB of raw Suno downloads are gitignored.

### What is NOT done — the honest list

1. **The art is a foundation, not the reference.** Sky, fog, atmosphere and explosions are
   good — the nuke is the best thing in the build. **Aircraft read as flat grey cutouts**,
   ground props are dark lumps that do not separate from each other, and **biomes do not
   express themselves**: "city at dusk" draws the same mountains and bushes as farmland.
   That gap is the difference between a tech demo and a game and it is the top priority.
2. **Nobody has heard the music.** 22 tracks selected by measurement, not by ear. 14 of them
   end abruptly and need a trim/fade before they can loop. `title_theme` needs ~2 s off the
   front. `battle_groove_heavy` came back at 76 s and should be regenerated.
3. **The music is generated but not wired into the game.** `js/data/music.js` exists and the
   settings screen lists and toggles every track; `core/audio.js` still has no file playback,
   and the march→heavy crossfade is unimplemented.
4. **No device testing.** Every measurement is desktop headless. 60 fps has never been seen
   on a phone, and the thumb controls have never been touched by a thumb.
5. **Balance is unmeasured.** The reference autopilot wins 18/100 levels, which is a weak
   pilot rather than a difficulty reading (D29). Real balance needs Aaron flying it.
6. Act 2-5 levels are generated with placeholder names ("Wider War 7").

---

# THE REMAINING WORK — the full requirement list, 2026-08-26

Aaron has played it on desktop and mobile and is happy with the core: **flying feels good, the
climb-above-the-frame camera works, the aeroplane art is fine** (an earlier note calling it weak
is withdrawn — his words: "I like the look of the current plane"). Build out the rest of the
original brief, **checking in regularly so he can judge the music and the feel**, then playtest
the whole thing again.

## Not built at all — do these first

1. **Title / attract screen.** Auto-playing AI dogfight behind the logo, with smallish buttons
   around the edges for game modes, special events, hangar, settings. Cheapest good version: run
   a real level with the reference autopilot, HUD hidden, UI buttons over the top.
2. **Music playback.** 22 tracks sit in `assets/audio/music/` with a manifest at
   `js/data/music.js` and a full per-track on/off list already in Settings — and `core/audio.js`
   has **no file playback at all**. Honour `prefs.musicOff` via `pickTrack()`; the settings screen
   already calls `audio.setDisabledTracks()` if that method ever appears.
3. **The march → heavy drop.** Aaron asked for this twice and cares about it. Four matched pairs
   share a `pairId`, BPM and key; crossfade on combat intensity. Two pairs are BPM-locked, two
   drift ~2.7 BPM — **crossfade quickly, never beat-sync-layer those two.**
4. **Tutorial levels** (Aaron's idea, and they double as the test harness): one that teaches
   flying and the auto-gun, one that teaches bombs and **landing** — the landing box has never
   been tried by a human.
5. **Game modes.** Survival / Time Attack / Boss Rush / weekly event exist only as data in
   `js/data/modes.js`. Nothing runs them.
6. **Story beats and act intros** — written in `js/data/story.js`, never displayed. Milestones on
   the debrief, act intros on the brief (D35).

## Built but never verified end to end by a human

7. Landing on a carrier, and the TAKE OFF button.
8. Hangar loop: buy plane → buy upgrade → assign bombs to slots → fly with them → money banked.
9. Level select, results screen, stars.
10. **All five bosses. Never once seen.**
11. Haptics on hit.

## Known weak

12. Ground props are dark lumps that do not separate from each other.
13. **Biomes do not express themselves** — `city/dusk` draws the same mountains and bushes as
    farmland. Highest-value art fix.
14. Water and alpine are the least-finished biomes.
15. Sound effects are procedural stubs. Aaron: "gunfire is ok for now, could be improved."
16. Acts 2-5 are generated, with placeholder names ("Wider War 7"), and untuned.
17. 14 music tracks end abruptly and will not loop cleanly; `title_theme` needs ~2 s off the front;
    `battle_groove_heavy` came back at 76 s and should be regenerated.

## Never measured

18. **Real device performance.** Every number is desktop headless. Aaron: "couldn't see an fps but
    it felt fast." Put a real fps readout behind a setting.

## Settled recently, do not re-open

- **Keyboard steering is a RATE control** — hold Right/D and the nose keeps turning clockwise,
  Left/A anticlockwise (`CTRL.kbdRate`). Touch stays the relative position control of §3b.
  `main.js` calls `syncKeyAngle(player.ang)` while no key is held so the first press never snaps.
- **Minimap is 35 px tall**, vertical axis is altitude against the ceiling, ground targets pinned
  to the ground line, objective counter to its right, and it fades to 0.22 when the player's own
  aeroplane or anything worth seeing passes behind it.
- **A "no WebGL" report may be the browser, not the game.** Aaron's desktop Chrome refused a
  context with every attribute set until he updated it. `tools/lab/webgl_probe.html` settles it in
  ten seconds. The renderer's retry ladder stays regardless.
- Capture tooling composites `#gl` and `#hud`; **DOM screens are still invisible to it** — that is
  how a dead title screen shipped. Verify menus in a real browser, not with `shot.mjs`.
