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

## State on 2026-08-27

Aaron's brief after the compact: **complete the full requirement list, with regular check-ins so
he can judge the music and the feel.** Plus two of his own: no auto-fullscreen on desktop, and
the plane should roll upright rather than fly inverted after a direction change. Both done.

The dominant discovery of this session is that **most of what was "missing" had been built and
never connected**. In order of how badly each one hurt:

| What | Was | Now |
|---|---|---|
| The entire front end | only loaded behind `?ui=1` | the default; `?level=` still flies straight in so every capture gate still works |
| `css/ui.css`, 894 lines | never linked from `index.html` | linked; every menu had been rendering as unstyled flow content in the top-left |
| Acts 2-5 | generated into `levels_gen.js`, never imported | `CAMPAIGN` export, 102 levels, five acts on the map |
| Level progress | written to `levelsDone`, read from `levels` | one store; nothing would ever have unlocked from flying |
| The Haptics setting | governed only the UI's own tap buzz | `prefs.apply()` now reaches `haptics.setEnabled`; every hit used to buzz regardless |
| `STORY.BOSS_TAUNT`, `ACT_OUTRO` | written, never read | on the briefing and the debrief |
| Act 0 | folded into Act 1 by `l.act \|\| 1` | its own TRAINING section |

### Completability

**102/102 missions are reachable.** They were not. 48 of the 80 generated levels could not be
finished: every fighter objective spawned exactly as many fighters as it demanded, and
`behaviour.js` deleted any fighter 1600 units behind the camera. The structural checker was green
throughout — **it is the instrument that hid the bug**, and that is the lesson to carry, not the
fix. Run `tools/campaign_gate.mjs`, and read the runtime line, not the structural one.

### Still open

1. **Music playback** — 22 tracks, a manifest and settings toggles all exist; `core/audio.js` has
   never played a file. In flight with the AUDIO agent, along with the march→heavy drop.
2. **Biome identity and ground props** — a `city` at dusk draws the same mountains and bushes as
   `farmland` at dawn. In flight with the ART agent, plus three landing defects: no translucent
   green approach box at all (`SHAPES.pad` is aliased to `SHAPES.carrier`), the carrier floating
   ~120 units above the water, and the plane vanishing inside the deck once landed.
3. **Game modes** — Survival / Time Attack / Boss Rush / weekly event are rule tables that
   nothing consumes. In flight with the MODES agent. `createWorld({ ..., mode })` is wired;
   `'story'` must stay a byte-for-byte no-op.
4. **SFX** are procedural stubs. Aaron: "gunfire — is ok for now, could be improved."
5. **The five bosses have still never been looked at.** Only `boss_ironduke` has been seen, and
   only from a distance. Hold the captures until ART reports, or you will be looking at a
   half-edited scene and drawing conclusions from it.
6. ~~Nothing has ever run on a real phone.~~ **MEASURED 2026-08-27, and it is fine.** Aaron, on a
   Samsung S22 Ultra (4.5 years old, high end for its day, 120 Hz panel): **mostly 100-120 fps**,
   with two momentary dips to ~80 and nothing sustained. Read that as riding the display refresh
   rather than being GPU-bound — the sim is a fixed 60 Hz accumulator and the renderer
   interpolates, so anything above 60 is headroom, not wasted work.

   What this does and does not tell us: it says the ceiling is comfortable and the art pass has
   room. It says nothing about the floor — a mid-range or older phone has not been touched, and
   `prefs.reduceFx` exists for exactly that and has never been exercised on hardware. The two
   dips are worth an eye if they ever get worse: the plausible causes are a palette re-bake on a
   biome change and the explosion plate bakes, both of which are one-off costs at a moment the
   player is likely to notice.
7. **Acts 2-5 carry placeholder names** ("Wider War 3") and are untuned beyond being winnable.

### Two things Aaron is owed, personally

- **Listen to the tracks.** Nobody has. They were selected by measurement, not by ear.
- **Try a landing.** It now works end to end, but he has never done one.

## Gates, and what each is actually for

Every one has a sabotage mode. **A gate that has never been seen to fail is not evidence** — and
this session produced a live example of why: the `behaviour.js` recycle fix made
`campaign_gate.mjs`'s own runtime sabotage impossible to trigger, so that half of the gate went
unfalsified the moment the game got better. Good for the game, bad for the instrument.

| gate | proves |
|---|---|
| `tools/gate_boot.mjs` | front end is the default, `?level=` still direct, desktop takes no fullscreen, the wing-levelling roll actually rolls and the sim heading is untouched. `--falsify`, `--falsify-boot` |
| `tools/gate_hangar.mjs` | buy → money leaves → **the sim sees it** → survives a reload. The third link is the one that matters |
| `tools/gate_feel.mjs` | a hit buzzes, and the setting silences it. Stubs `navigator.vibrate` before module evaluation — `haptics.js` latches `typeof navigator.vibrate` at import |
| `tools/campaign_gate.mjs` | every objective still reachable after real autopilot runs. **Read the runtime line first** |
| `tools/tutorial_gate.mjs` | every hint advanced on its trigger, never on a timeout |
| `tools/contrastgate.mjs` | the player reads against sky and ground (ART.md §2) |

A gate caught a false pass in its own first draft this session: `null < 9000` is true, so a bare
comparison passed on a broken read. Type-guard the comparison, not just the value.

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
  how a dead title screen shipped. Verify menus in a real browser, not with `shot.mjs`. For DOM
  screens use `Page.captureScreenshot` through `cdp.send` directly: it works on the 2D attract
  canvas and on menus, and only hangs on an animating WebGL surface under SwiftShader (use
  `--gpu`). That is how every menu screenshot in `shots/mgr/` was taken.
- **Desktop is never put into fullscreen unasked** (Aaron's ruling). Phones and tablets still
  auto-request it. Desktop gets a chip on the first flight and a button on the pause screen,
  because the browser only honours the request from a real gesture. `autoFullscreenDevice()` in
  `core/fullscreen.js` is the single test; don't add a second one.
- **Wing-levelling is visual only.** `FLIP` in `tuning.js`: the model rolls 180° about its nose
  axis once the heading has held the other side of vertical for `dwell`. `e.ang` is never touched
  and the aeroplane flies exactly as it did. The dwell and the near-vertical dead zone are load-
  bearing — without them a loop strobes the model twice per revolution.
- **Tutorials are not graded.** `stars: false`, act 0. Timing a teaching level against par
  punishes the experimenting it exists to encourage. `model.gradedLevels`/`maxStars` keep them out
  of both halves of every star total.
- **`LEVELS` and `CAMPAIGN` are two exports on purpose.** `LEVELS` is the 22 hand-authored
  missions, because `tools/gen_levels.mjs` imports it and appends the generated set itself — one
  merged export makes the generator see 80 duplicate ids. Everything player-facing reads
  `CAMPAIGN`.

## Fixed 2026-08-26, after Aaron's playtest

- **The start button no longer lies during load.** It ships as a disabled, pulsing `LOADING…` and
  `main.js` arms it — enabling it, clearing the class, setting the label — only on the line *after*
  the click handler is attached. Everything above that line can throw, and a button that looks
  ready while its handler does not exist is indistinguishable from a broken game. This is the same
  root cause as the dead TAP TO FLY: markup renders before the module finishes evaluating.
  Verified under 8x CPU throttling, where the load window is actually visible.
