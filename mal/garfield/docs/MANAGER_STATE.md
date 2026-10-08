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
- media DONE: 387 VO lines (Jon v2 male ~129 Hz), 7 music tracks (title_song YuE2 sung — manager wired it to the FIRST menu visit per session, then 'menu' loop), 37 SFX. Committed fca19254 + deployed. ALL AGENTS IDLE. :8870 server killed. Awaiting Aaron/child playtest feedback. Open: bark repeats, simultaneous bubbles, hint bar in win shot, L5 swing cam on iPad, synth meow/purr weakest, nobody has listened to the audio.

## WAVE 3 (2026-10-08) — Brief 2 (docs/BRIEF2.md): Ch1 Free Play, Chapter Two "Odie and Lyman", Arena
Aaron: keep game personal/unlisted (declined hub listing). Cap 4. Lanes: cast, world, media, game (TEAM_BRIEF "WAVE 3").
- Wave 3 launched: game (a197979c…, 9407), cast (a5097e0c…, 9402), world (a1c8a0da…, 9404), media (af941136…, 9401). Rule: Ch1 is live — never break it; manager commits+deploys at milestones (Ch1 Free Play first).
- cast DONE (wave 3 v1: Lyman normal/disco, delivery, Odie, mice, new clips; Jon hash identical). Manager peek: Lyman good; Odie tail reads as 3rd ear from behind. Launched cast2 (aec5e04a…, 9402) for in-game polish. Running: game world media cast2 (4).
- DEPLOYED Ch1 Free Play + menus (CH2_READY=false gate in js/core/game.js; flip when Ch2 playable). Suite run by manager: 1-10/fp1/menus PASS.
- world DONE (wave 3): all World additions; Ch1 unchanged (suite PASS). Rough: fur speckles/lumpy pile, carpet lost on rug, Lyman room plain (no ref yet), sock-drawer jump lands on dresser top (game to hop on interact). Running: game media cast2 (3); holding 4th slot for a world2 polish once media's lyman_bedroom ref lands + game integrates.
- cast2 DONE: Odie tail/face/gait fixed, Lyman hair/disco fixed, seethe tail + bald look; sent game stuck_wall spot (3.0,0,0.73 rotY=π) + story staging (Lyman hidden behind door, Odie entrance hidden). Running: game media (2).
- game: Ch2 L1–10 + arena written, each autoplays PASS. Remaining: intro QA skip=0, full regression; manager flips CH2_READY. Launched 'fp2' helper (aae265de…, 9408) owning only js/levels/freeplay2.js + tools/sim/fp2.mjs. Running: game media fp2 (3).
- CH2 LIVE 71ff204a: manager flipped CH2_READY=true, suite all PASS (1-10, catch, fp1, menus, c2:1-10, arena x3, selfTest 14/14). fp2 still building Ch2 Free Play. TODO game: menus test should read CH2_READY.
- game DONE (wave 3). Open polish: sock-drawer camera jams dresser, L5 mice hard to see, Lyman hair brown in warm light, floor lamp blowout. Questions to Aaron: L6 brawl tone, FP1 eating, arena difficulties. Running: media fp2 (2).
- fp2 DONE + DEPLOYED (suite all PASS; fp2 'bad mood' check flaky 1/4 under full run). Open: humanAI ground-floor shut door walk-through (fp2), polish list from game. Running: media (1).
- Launched polish3 (a31cece3…, 9409): real-input Ch2 + arena, door walk-through, cam/mice/hair/lamp, fp2 flake, wire media audio. Running: media polish3 (2).
- media DONE (wave 3): Lyman voice 174b6b2a…, delivery 538b2117…, 799 VO keys, Odie barks from LTX clips (beat synth), arena + sneak2 music, ~29 MB audio. Resumed media for drawn-out 'Goooood moooorrrning' retake. Not yet committed — commit with polish3's work. Needs human ear: Lyman/delivery voices, Odie sounds, aww, arena/sneak2 music.
