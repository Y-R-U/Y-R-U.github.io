# HEIRFRAME — Decisions (manager-owned)

Numbered, append-only. A later decision may supersede an earlier one by number.

## Aaron's brief (2026-09-26, verbatim essentials)
- New yru Three.js **landscape** game, **Diablo / RuneScape inspired space saga**.
- Look per `refs/ref_plaza_gold.png` + `refs/ref_boulevard_blue.png`: sunlit utopian megacity, gold / chrome / gloss-black humanoid robots, holo billboards ("A BRIGHTER FUTURE TOGETHER"), flying cars, waterfalls, glass, a moon/planet in the sky. **"I want it to look amazing."**
- **Mobile first**; target phone is a **Samsung S22 Ultra** (decent GPU) — quality tiers matter but default should look good.
- Opening: you go out into the world **as a robot**; you start on a **crappy basic rental robot**.
- Missions: transportation, spying, assassination… in parks, buildings, etc. **Large variety, randomised, scaling** with player (characters, locations, names change).
- **Complex, endless**: keep earning money, keep upgrading robots. Own **up to 3 robots, different combat styles**.
- **Extensive main storyline**: discovery of your **family history**, complex, full of unexpected surprises.
- Home base: simple room, OR switch from anywhere to upgrades/warehouse. Make upgrading easy.
- Kills / mission completion give **random rewards scaled by player level / difficulty**.
- **UI must look amazing.**
- **Not all robots are enemies.**
- Music: reuse from our projects (NEONHAUL). VO: **Qwen TTS 1.7B** (Qwen Voice Studio, localhost:7876) voice characters.

## Manager decisions
- **D1 Name/folder**: HEIRFRAME, `gms/3d/heirframe/`. Heir (family saga) + frame (robot chassis).
- **D2 Tech**: Three.js **0.180.0 vendored** at `../../lib/three/0.180.0/` (no CDN — see repo lesson). No build step, ES modules, multi-file `js/`. Classic inline boot watchdog script in index.html.
- **D3 Orientation**: landscape. On portrait phones show a styled "rotate your device" overlay (not a blocker on desktop).
- **D4 Camera**: Diablo-style fixed-yaw 3/4 isometric perspective (~50–55° pitch, moderate FOV), pinch/slider zoom, follows player. Two-finger/drag-rotate optional later.
- **D5 Controls (mobile)**: left-thumb floating joystick for movement AND tap-to-move/tap-to-target (RuneScape). Right side: attack button + 3 skill buttons + dodge. Auto-target nearest hostile in facing cone when attacking. Desktop: WASD/click-to-move, 1-4 skills, space dodge.
- **D6 Robots**: player owns up to 3 frames. Starting frame = beat-up rental ("HireFrame R-1", scuffed grey/orange, rental decals, a cracked visor). Three combat archetypes: **Brawler** (melee, heavy), **Gunner** (ranged), **Ghost** (stealth / hacking / precision). Swap frames at the Warehouse.
- **D7 Warehouse**: accessible from anywhere via a button (a "remote link" in-fiction) — no forced trip home. A home-base room exists as a nice-to-have scene later.
- **D8 Look**: bright, warm, sunlit utopia on the surface with a darker undercity for later acts. PBR with a proper environment map (chrome/gold robots live or die on reflections). Quality tiers `?q=low|med|high`, auto-detected, default **high on S22-class devices**.
- **D9 Friendly robots**: city is populated with neutral civilian robots & humans; some robots are allies/quest givers/vendors; hostility is per-faction and mission-dependent.
- **D10 Process**: multi-agent. Manager (me) owns DECISIONS.md, MANAGER_STATE.md, git. Agents **never commit or push**. Each agent owns a declared set of files.

## After planner hand-back (2026-09-26)
- **D11 Canon = planner docs.** DESIGN/STORY/MISSIONS/ECONOMY are authoritative for names and numbers. Protagonist Wren (silent, gender-neutral), city Halcyon, district Aurum Plaza, fixer Mara Quill, Harmony/Iris, Archon Dray, Seraph/Lyra.
- **D12 Part slots** = chassis, core, weapon, optics, mobility, chip (rental: weapon + chip only). Frame names **Bulwark** (Brawler), **Longarm** (Gunner), **Wisp** (Ghost). Mk I–VI tiers are kept. Systems aligns `js/data/frames.js` to this.
- **D13 Gameplay runtime** `js/game/*` (player controller, enemy AI, mission step runner, combat hookup, spawns, interactables) is owned by the **P1 integration agent**, not systems. `main.js` (world) stays the boot and frame loop and calls into `js/game/`.
- **D14 Interface additions accepted:** `world.sites`, robots `paint` param + `setAlert`, `ui.detect` / `ui.lens` / `ui.boss`, `audio.vo(key)` resolves immediately if the file is missing.
- **D15 Civilians can't be harmed** (a story clue, and it keeps things simple). `scrap_rat` enemy is needed for P1.
- **D16 Camera look (Aaron, 2026-09-26)** supersedes D4's fixed yaw: a one-finger drag on the right side of the screen orbits (yaw 360°, pitch ~35–70°), pinch or wheel zooms a little (~0.7–1.5× default distance), and after release a **Reset view** button appears that eases back to the default Diablo framing. Taps still tap-to-move. Movement is camera-relative.
- **D17 Look up (Aaron approved 2026-09-26)**: pitch range -45°..70° (negative = view above the horizon; below 4° the camera stops orbiting and tilts up). The debug readout is off by default (`?camdbg=1` shows it).
- **D18 Visual/perf principle (Aaron, 2026-09-26)**: current fps on the S22 is fine and the visuals are "very impressive". Standing rule for every agent: keep pushing quality AND efficiency together. Never trade away the look for speed without asking, and never add cost without measuring it. Perf work means "same look, cheaper", not "cheaper look".
- **D19 Pacing**: the first owned frame lands at 45–75 min of play (manager brief; systems tuned to it). BUILD_PLAN P1 test 13's "level 5 in 25–45 min" is amended to **level 5 in 40–55 min**. A slower first frame makes owning one feel earned.
- **D20 Crowd size**: the high tier keeps **32 civilians**, not 40. Aaron's only real S22 fps dip is at the crowd view (D18: efficiency first). P1 test 10 is amended to 32.
- **D21 P1 PLAYABLE (2026-09-26)**: 13/13 acceptance tests pass or are amended; the look score (test 11) is carried into art rounds. **P2 is split**: P2a gameplay (frames, kits, sync, 6 slots, rest of Act 1 staged in Aurum Plaza, Kettle boss, new archetypes/modifiers/twists, heat 5, market, repair kits, family tree v1) runs now; P2b Brightline Boulevard district + relay + drop-pod visuals runs after art round 3.
- **D22 P2 complete (2026-09-27)**: P2a PLAYABLE (frames, kits, Act 1 M2–M5, the Kettle, heat 5★, market, family tree v1) and P2b (Brightline + district API). Leftovers go to P2c inside the P3g gameplay agent. Standing rule: an agent never leaves an import of a file that doesn't exist yet, because the shared tree must boot at every moment. The manager pushes only after a green boot and auto smoke.
- **D23 Fewer graphics passes (Aaron, 2026-09-27)**: the look is already great. No more general art or blind-critic rounds. Visual work goes to (a) things Aaron flags and (b) building areas that don't exist yet. Currently flagged: the **Aurum lake is too still**, so it reads like a photo (needs motion, e.g. ripples from the falls). **The talking-character (speaker portrait) UI element looks strange**, but Aaron says to leave it until the main game is built.
- **D24 Dev mode (Aaron, 2026-09-28)**: one debug path, `?dev=1`. All dev code lives in `js/dev/*`, loaded only by a dynamic import when `?dev` is present, so the normal game fetches none of it and nothing links to it. It uses its own save key (`_dev`) and shows a DEV badge. The panel has god mode, a start-point district picker, a story checkpoint jump, and credits/level/frames/heat/speed controls. `?dev=1&district=X[&mission=Y]` goes straight into play. The yru site has no build step, so the "never in prod" guarantee is this gating, not a separate build.
- **D25 P3 PLAYABLE (2026-09-30)** is accepted, including the agent's balance calls: licence level 4→5 needs 1.5× XP, story-mission Warden kills add no Heat, and the Nexus rep price band runs from +10% to −6%. Known: the Gunner bot fails Arcology defend (line of sight while kiting), and the first Relic lands at 4.5–6.4 h against a 3–5 h target. **Cap 1 agent** while usage is tight: that agent may edit world, actor and gameplay files alike, since no other agent is running.
- **D26 P4 PLAYABLE (2026-10-01)** is accepted with the agent's calls: A4-M3 = 4 countdown boards on Brightline; Act 3–4 boss HP cut hard (Choir Warden 28, Rustmother 30, Spine Keeper 75); A3-M2 on B4; T11 changes only pay and rep; night ≈40% of a shift (`nightAt` in daynight.js); goto radius 12 m.
- **D27 P5 PLAYABLE (2026-10-01)**: the main story is complete. Accepted: the boss cuts (Seraph 24 HP; Dray 22 HP, 3.5 dmg, 30 armor), Choir Angel dmg 20, Seraph spares you once per phase, the Heir Core as a per-frame core, the heirloom grants, story bosses scale with the threat (Nightmare 4.5×). Known: the Ghost bot is weak against bosses; the Helm is dark at play height (art, wait for Aaron's call); the coach 'Tap ATTACK' hint shows after dev jumps; P6 (Landfall, Overclock, Legacy, Succession, Voice Hunts, settings, save export, projects.js) is next.
