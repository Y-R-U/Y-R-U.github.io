# GARFIELD: HUNGRY HEIST — Manager State (read first when resuming)

Started 2026-10-07 for Aaron's child (big Garfield fan). Read BRIEF.md (child's spec), DECISIONS.md, TEAM_BRIEF.md.

## Run protocol (Aaron)
- Up to 8 agents initially; Aaron may say a number N → let agents finish down to N, no replacements beyond N.
- "pause X mins" → SendMessage every running agent PAUSE X.
- Manager makes game decisions; tweak/fix after first playable.
- Local: http://192.168.0.236:8888/mal/garfield/ (python http.server on site root, port 8888)
- Live target: https://br8t.com/mal/garfield/ (deploy via mal/garfield/deploy.sh — manager writes it)

## Wave 1 lanes (2026-10-07)
| Agent | Owns |
|---|---|
| media | refs/*, audio/*, js/audio/*, docs/VO_LINES.md, tools/media/*, tools/audio_test.html |
| garfield | js/actors/garfield*.js, js/actors/shared/* (shared rig/anim helpers; jon may import), tools/garfield.html, tools/sculpt/* |
| jon | js/actors/jon*.js, tools/jon.html |
| house | js/world/world.js, js/world/house*.js, js/world/exterior*.js, js/world/nav.js, js/world/lighting*.js, js/world/materials*.js, js/world/README.md, tools/house.html |
| props | js/world/props/*, js/world/food*.js, tools/props.html |
| ui | js/ui/*, css/*, tools/ui_kit.html |
| core | index.html, js/main.js, js/core/*, vendor/*, tools/play.html |
| levels | js/game/*, js/levels/*, docs/LEVELS.md, tools/sim/* |

## Status
- wave 1 launched — see docs/notes/<name>.md
- Agent IDs (SendMessage): media ad9352d2…, garfield aba14270…, jon a2c1c40e…, house a7f5ed5d…, props accbf0bc…, ui a42c1d54…, core a4b273b8…, levels ab6dd95f…
- Deploy: `mal/garfield/deploy.sh` (rsync to br8t:/srv/apps/br8thome/site/mal/garfield/). br8t/deploy.sh's --delete never touches mal/ (excluded paths are protected).
- TODO manager: kill the temporary :8870 http.server once wave 1 agents are done (pkill -f 'http.server 8870'); :8888 is the permanent yru server.
- ui lane DONE (wave 1): full contract + ui_kit; HUD over a real level still unchecked (level boot hang reported to core). Memory: swap pressure from idle Chromes + Flux → Chrome-stop rule added.
- ui DONE → core now owns small fixes in js/ui/* + css/ui.css. Manager peek L1: looks good; level.setup timed out under load; tip/objective overlap; Garfield rear-view tail/bullseye stripes sent to garfield.
- 2026-10-07 Aaron: "4" — let running agents finish; launch nothing new until ≤4 running; max 4 concurrent from then on.
- garfield DONE (wave 1). Rough: belly@1 stretched tris between front legs, pointy ears, modest chomp mouth, whacked lacks dizzy eyes, gait speeds untuned vs controller. Running now: media jon house props core levels (6) → cap 4 reached when 2 more finish.
- core DONE (wave 1): end-to-end boot/levels/win; selfTest() 11 routes; rough: perf unmeasured on real iPad, camera lifts not fades occluders, live quality change needs reload for AA. Running: media jon house props levels (5).
- levels DONE (wave 1): all 10 levels autoplayer-complete (tools/sim/play.mjs 1-10), reaction test passes. Accepted its design calls: only each level's own trick opens the eating window (chases don't); goal marker always shown; L5 swing forgiving.
  Open: garfield 'hang' clip for vine; L6 plate landing vs furniture; tutorial cards at tablet sizes; L2 chair pops upright on reset.
- Running now: media jon house props (=4, the cap). Next wave (≤4) candidates: polish/fix lane (open items above + garfield rough list), perf/iPad lane, playtest-critic lane.
- jon DONE (wave 1). Launched wave-2 'polish' (a02d137b…, port 9409): owns finished lanes' files; rough list + kid playthrough. Running: media house props polish (=4).
- props DONE (wave 1) → polish owns props files + requests (breakLeg idx, vase timeout, mash/vine/TV beige, lasagna recheck); house got TV glow + pendant clearance. Running: media house polish (3). Holding the 4th slot until media/house finish (no clear 4th lane without overlap).
- house DONE (wave 1). Launched wave-2 'art' (aa4bceb5…, port 9411): owns js/world/*, props, food, post.js; props art items moved from polish. Running: media polish art (3).
- art DONE (wave 2): evening grade/lighting, mash, vine, beige TV, stairwell, quilt; medium kitchen 146–149 calls (target 140). Launched 'art2' (a80c474e…, port 9411): cul-de-sac dressing + intro framing, kitchen pendant glow, cheesier lasagna, draw calls. Aaron feedback sent: Jon voice too girly → media redo; Jon nose too long → polish. Running: media polish art2 (3).
- polish DONE (wave 2): rough list + tap-to-play gate + Jon nose. COMMITTED 2dac9691 (first playable, hidden projects entry, screenshot garfield.jpg) + DEPLOYED br8t.com/mal/garfield/ (live verified, all lanes real). .gitignore excludes tools/media/scratch, refs/_cands. Launched 'playtest' (ab80fdb0…, port 9409): real-input L2–L10. Running: media art2 playtest (3). Manager view: warm grade looks fine (not too orange).
- art2 DONE: intro dressing/framing, pendant, lasagna, draw calls ≤135 medium. Committed world files; deploy after playtest finishes. selfTest 'table from floor' flaky 10/11 sometimes — playtest to check. Running: media playtest (2).
- playtest DONE: all levels real-input winnable; fixed L10 softlock, Jon wall-walk L6/L7, L5 bonk, L8/L4 cross-floor scratch; selfTest 14/14. Committed 71d2a054 + deployed. Open: bark repeats ('Lasagna. Hello, gorgeous' 3x/50s), simultaneous bubbles, hint bar in win shot, L5 swing cam on iPad shows Jon's head, real iPad untested, music pending (media). Running: media (1).
