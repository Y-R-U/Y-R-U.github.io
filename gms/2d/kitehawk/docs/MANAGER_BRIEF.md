# KITEHAWK — manager brief (shared premises)

**Every agent on this project reads this file first, in full, before writing anything.**
It is the shared premise set. If you think something here is wrong, say so in your report —
do not silently redesign around it.

Written 2026-08-23 by the managing session. Aaron is the owner/decider.

---

## 1. The game, in one paragraph

A painterly 2D biplane game where **altitude is the whole fight**. Side-on camera, the plane sits
near the horizontal centre, the world scrolls horizontally past it, and a **portrait phone shows a
tall column of sky**: mud and trenches at the bottom, flak, a cloud deck in the middle, a zeppelin
above that, thin air and sun at the top. Dogfighting is about energy and altitude, so the tall
viewport is the design thesis, not a compromise. Set in a WWI-that-never-was. Supply crates fall
under parachutes and are the entire economy — catch them, or shoot the canopy so they fall to your
airfield instead of the enemy's.

**Working name: KITEHAWK.** Aaron has not ratified it. Do not hardcode the name anywhere it would
be expensive to change — use it in prose, keep it out of identifiers, filenames and CSS classes
where a constant would do.

## 2. Non-negotiables

- **Mobile-first PORTRAIT** (9:19.5). Landscape must also work, and the camera/HUD must be
  orientation-aware from day one so a pivot to landscape-primary is a config change, not a rewrite.
  Aaron: *"it is likely landscape may be more sensible. if we need to we will pivot, but i would
  like to try portrait."* Portrait gets a fair, well-built attempt and a numeric gate at the flight
  phase. Never quietly design a landscape game and letterbox it.
- **Easy to play. One thumb.** Hold-and-slide anywhere on the lower screen is the stick (up/down
  pitches the nose); throttle is automatic; **guns auto-fire** at anything in the nose cone; one tap
  target for the loaded special. Skill expression comes out of the flight model (stall turns,
  Immelmanns, side-slips), NOT out of extra buttons.
- **Stunning is the point.** Aaron asked for a game that *looks stunning/beautiful*. Painted, not
  pixel art. If a choice trades beauty for convenience, beauty wins and you flag the cost.
- **Modes:** Story (100 levels, 5 acts of 20), endless survival ("The Long Patrol"), pylon race /
  time trial with ghosts, Airlift (crates alone), Duel (1v1 vs named aces), Daily seeded challenge.
- **Upgrades:** a hangar between missions — engine, wings (biplane → triplane → sesquiplane), guns,
  armour, fuel, ammo, pilot traits; airframes unlock per act. Crates are the currency.
- **Parachute crates are the signature mechanic** and must be visible in the first playable build.

## 3. Technical non-negotiables

- Vanilla ES modules. **No build step, no bundler, no npm at runtime.**
- **NOTHING loaded from a CDN — ever.** A CDN import has silently hung every other 3D game in this
  repo with zero console errors. Vendor every dependency locally.
- Custom **WebGL2** instanced sprite batcher. Fixed **60 Hz** sim (`DT = 1/60`), uncapped
  interpolated render. Never read wall-clock time inside `update(dt)`.
- **+Y is down.** Say it out loud before you write gravity or a climb.
- Renderer: `gms/2d/sunderfall/game/js/gfx/` is proven (11k sprites, 10k particles, 49 lights, 15
  draw calls). The manager's default is to **port it deliberately** rather than rewrite one.
  Sunderfall's contract forbids copying *into* Sunderfall, not out of it.
- **No alerts, confirms or blocking modals, ever.** In-page popups/callouts only. Aaron hates modals.
- Audio contract: **the game must be fully playable and correct with the audio folder empty.** Every
  spoken line falls back to a text card. Asset generation never blocks a milestone.
- Comments: sparse. Only where the code is genuinely confusing. No comment headers on obvious things.

## 4. Testing philosophy (this repo has been burned before)

- **`sim.mjs`** — flight model and combat resolve headlessly in node, so 100 levels of balance are
  testable without a browser. Node-side sim beats puppeteer for balance work.
- **Headless Chrome over raw CDP** for real touch input. Screenshots alone miss interaction bugs.
- **Blind critics** for art: an agent scores our render against a real reference *without being told
  which is which*. Builders self-score 7-8/10 on work critics score 3.
- **Read detail lines, not pass counts.** A gate that passes because of a workaround inside it has
  hidden a third of a map being unreachable before, in this repo.
- A test that still passes after you revert the fix was never testing the fix.

## 5. How this run is managed

- The managing session spawns agents, **verifies their claims**, then spawns the next batch. Up to 4
  agents may run concurrently *when Aaron opens a window*; the standing default is **one at a time**,
  because of **usage limits** — he needs the 5-hour block to last. Know the reason, not just the
  number.
- **Agents do not run git.** Not `add`, not `commit`, not `status -s` as a basis for staging. Other
  Claude sessions have uncommitted work in this repo; the manager stages selectively (paths under
  `gms/2d/kitehawk/` plus one `projects.js` hunk plus the screenshot). Say in your report what you
  changed; the manager commits.
- **At every playable milestone** the manager commits + pushes and ensures the `projects.js` entry
  exists (`wip: true` until final) with a screenshot at `assets/screenshots/`.
- Repo: `~/cc/yru/site/` → `git@github.com:Y-R-U/Y-R-U.github.io.git`, live at yru.br8t.com.
  This game lives at `gms/2d/kitehawk/`.

## 6. Local generation services (queued — do not invent a lock)

| | | |
|---|---|---|
| `http://localhost:7867` | mflux-queue | stills (txt2img + multi-ref edit), model `flux2-klein-4b`, 10–20 steps |
| `http://localhost:7866` | LTX | video (not expected for a 2D game) |
| `http://192.168.0.236:8808` | Abogen / Kokoro | long-form TTS |

They serialise their own work — several sessions submitting is fine, you just queue. Check
`queue_depth` before planning a batch. Flux and LTX cannot both hold a worker in 24 GB.
**SUNO is Aaron's manual step** — we write copy-paste prompt blocks, he generates and drops files in.

## 7. THIS PHASE IS PLANNING ONLY

**Write documents. Write no game code.** No `js/`, no `index.html`, no engine. The one exception is
a throwaway script under `docs/scratch/` if you need to measure something to answer a question —
say so in your report.

Four agents are running in parallel on four disjoint documents. **Write only the file you own.**
If you need something from another document, state the assumption you made and flag it in your
report as a REQUEST; the manager reconciles.

| agent | owns | must not touch |
|---|---|---|
| A — architecture | `docs/ARCHITECTURE.md` | every other doc |
| B — design/systems | `docs/DESIGN.md` | every other doc |
| C — art direction | `docs/ART.md`, `docs/refs/` | every other doc |
| D — story/audio | `docs/STORY.md`, `docs/SUNO.md` | every other doc |

`MANAGER_BRIEF.md` is the manager's. Nobody edits it.
