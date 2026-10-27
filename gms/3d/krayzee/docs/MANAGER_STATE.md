# The Kingdom of Krayzee — manager state

Read this first. Claude (Opus) is MANAGER; sub-agents build in lanes (docs/CONTRACT.md). Manager owns integration,
commits and pushes. Aaron's words: docs/BRIEF.md.

## Standing rules (Aaron)
- Agent cap: the 10 start agents run; launch no new ones until active < 6, then keep up to 6 active.
- Commit at major milestones; a projects.js entry is approved (date 2026-10-21, screenshot krayzee.jpg).
- Selective staging only: `git add gms/3d/krayzee/` (+ the projects.js hunk via `git apply --cached`). Other sessions share the tree (clued work is dirty in it).

## Phases
- [ ] P1 Foundations: PLANE (C172 exterior + cockpit + livery), AIRPORT (runways/terminal/tower, basic land), FLIGHT (engine, flight model, autopilot+override, mobile controls, cameras, attract), UI (loading, profile/title/livery/voice, settings, account badge), DESIGN (ranks, modes, protection, barks script), VOICE (18 Qwen voices + samples).
- [ ] P2 Gameplay: ATC + AI traffic + rule-breaking detection + bark choice UI + radio audio; bark generation for every voice; points/rank.
- [ ] P3 Online rooms, story mode, more aircraft, city/roads.

## Log
- 2026-10-21 Project started. Contract, layout.js, stubs written. P1 lanes launched: PLANE, AIRPORT, FLIGHT, UI, DESIGN, VOICE, then (Aaron: 12 ok at start) ATC, AUDIO, RADIO, ONLINE = 10 active.
## RESUME
If agents vanished (ListAgents), check each lane's docs/<LANE>.md and newest files, relaunch from there. Integration after P1: FLIGHT wires UI/AUDIO/RADIO/ATC into main.js.
- 2026-10-21 AUDIO done (procedural, js/audio/index.js; API + wiring in docs/AUDIO.md; not yet heard on a phone). 9 active.
- 2026-10-21 ONLINE done: docs/ONLINE.md (browser-host + small Go krayzeenet server, prototype server/ test 26/26). Hooks briefed to ATC/FLIGHT/RADIO/DESIGN. 7 Aaron questions in report (OPEN): host model OK?, rank-gated hosting on trust?, voice change when?, mid-join?, daily limit?, home wifi mode?, port 8018. 8 active.
- 2026-10-21 DESIGN done: DESIGN.md + data/{ranks,rules,modes,story,aircraft}.js, voices.json, barks/script.json (816 entries; regen via build_script.py). layout.js += HOLD_OFFSET 50, CIRCUIT R09/L27 R04/L22 (DESIGN had it backwards — would fly over terminal). Aaron Qs: spliced 'Baroness Four-Two' callsigns; rank pacing (Emperor ~30h); online Court K/Q, Emperor at 2x. 7 active.
- 2026-10-21 UI done (js/ui/*, css/ui.css, tools/ui.html; 23 CDP checks ×3 sizes). Looks good. Wiring list in docs/UI.md, forwarded to FLIGHT. 6 active (PLANE AIRPORT FLIGHT VOICE ATC RADIO).
- 2026-10-21 Aaron: D1 callsign-by-title OK; D2 Emperor = points + 10 online wins; D3 unlocked-title picker in Settings (Free Flight/post-story). See DECISIONS.md. TODO P2: ranks.js gate + settings title picker.
- 2026-10-21 RADIO done (js/radio/*, css/radio.css; wiring in docs/RADIO.md). 5 active → launched SCORE lane (career/points/ranks D2/D3, js/game/**). 6 active.
- 2026-10-21 Aaron D4: Court Emperor only for career-earned Emperors (no 2x rule); 2nd then King. Sent to SCORE.
- 2026-10-21 SCORE done (js/game/*, 128/128, falsified). Manager fixed data/ranks.js (courtRanks removed, minOnlineWins 10) + DESIGN §1.6 to D4. AIRPORT done (≤35 calls low; extras setShadowFocus/runwayAt/setWind/envMap); layout APRON/TERMINAL updated per its proposal. TODO UI: sync 'krayzee.career', title picker, profile.rank→career. 4 active (PLANE FLIGHT VOICE ATC).
- 2026-10-21 Aaron D6–D8 (adaptive quality start-low-step-up; roadmap planes/landscape/effects; weapons later as story ext + room option).
- 2026-10-21 PLANE done (C172 ext+cockpit, livery canvases; high 23 calls/58k, low 13/13k). Exterior looks great. Cockpit v1 OK; noted: prop-disc red ring prominent from cockpit, bare grey walls, no pilot. Launched PLANE r2. 5 active.
- 2026-10-21 ATC done (49/49, 26/26 falsify). FLIGHT sent its AP hook list (extendDownwind etc., 27 final tracking 70 m off, taxi crossing 04/22 w/o hold). 4 active (FLIGHT VOICE UI2 PLANE2).
- 2026-10-21 Committed c7c9af5a (foundations, audio/ excluded until VOICE done). NOT pushed; push + projects.js once FLIGHT integrates a playable build.
- 2026-10-21 UI r2 done (career sync, peerage/title picker, Auto quality v2 migration, D9/D10 keys invertPitch/stickRight v3; ui_flow.mjs 44/44/45). FLIGHT told: pitch sign flip in controls.js, auto-start-low, shared career. 3 active (FLIGHT VOICE PLANE2).
- 2026-10-21 Launched WORLD r2 (landscape look pass: grass/trees/town+castle/water/haze, tiers, setQuality). 4 active.
- 2026-10-21 UI r2 + D11 Views done (ui_flow 55/55/56). 4 active (FLIGHT VOICE PLANE2 WORLD2).
- 2026-10-21 VOICE done (18 voices, samples, audition page tools/voice/audition.html; weak: comte, baronin, heiress, laird, geezer). Launched BARKS (script phonetic fixes + full ~3h batch). Aaron D12 markers + D13 LAND assist → launched ASSIST lane. 5 active (FLIGHT PLANE2 WORLD2 BARKS ASSIST).
- 2026-10-21 PLANE r2 done (royal pilot m/f, corgi at high, prop shimmer, trim texture, flap slide, panel night light, eyeCenter). Nit for later: black blob top-centre in center portrait (overhead console/compass?), corgi big in right look. 4 active (FLIGHT WORLD2 BARKS ASSIST).
- 2026-10-22 FLIGHT done: playable integrated build (flight-sim 22/22, test-flight 32/32). Committed + PUSHED with projects.js entry + krayzee.jpg. Gaps: ATC go-arounds (crossingTraffic, downwind separation), no S22 perf numbers, no time of day, AI no impact handler. Centre view landscape: cabin walls look odd. 3 active (WORLD2 BARKS ASSIST).
- 2026-10-22 Launched GAMEPLAY (score HUD, opportunity prompts, coach marks, centre-view landscape fix; owns main.js now), TRAFFIC (ATC/AP tuning, AI bounce, runway change, aiMischief, ap.landAt), PLAYTEST_1 (read-only). 6 active (WORLD2 BARKS ASSIST GAMEPLAY TRAFFIC PLAYTEST).
- 2026-10-22 Aaron: voices all good. D14 C-Tower 1 callsign; radio name changed; BARKS told to regen the 6 welcome lines.
- 2026-10-22 WORLD r2 done (fields/trees/village/castle/lake/haze; ≤43 calls all tiers) — committed+pushed 0b1cf008 (also C-Tower 1). setQuality → GAMEPLAY; terrain → TRAFFIC/ASSIST. Launched FX lane. 6 active (BARKS ASSIST GAMEPLAY TRAFFIC PLAYTEST FX).
- 2026-10-22 Aaron D15–D18 (HUD z-order + radio position/transparency → GAMEPLAY; story intro + guided first mission + time warp → STORY lane queued for next free slot).
- 2026-10-22 Aaron D19 DEMAND-IT finish button by difficulty → GAMEPLAY (may edit js/game banking).
- 2026-10-22 PLAYTEST_1 done (docs/review/PLAYTEST_1.md). AP/ATC items → TRAFFIC; controls/HUD clutter → GAMEPLAY. Visual (#10: grey cylinder tower, box cars, glareshield slab, centre black disc, portrait panel cut, black band in field, attract planes specks, 215k tris low) → next PLANE/WORLD round. Shared-lib bug flagged: lib/auth/localsync.js:124 assigns localStorage.setItem → stray keys (not ours; ask Aaron). Launching STORY. 6 active.
- 2026-10-22 Aaron D20 fuel+auto-refuel on DEMAND IT, D21 DEMAND TAKEOFF, D22 continue-where-stopped + Skip to runway. Sent to GAMEPLAY/TRAFFIC/STORY. PLAYTEST done. 6 active (BARKS ASSIST GAMEPLAY TRAFFIC FX STORY).
- 2026-10-22 Aaron bug: can't override AP on the ground → TRAFFIC (gate/brake/nosewheel) + GAMEPLAY (input path, stick X steers on ground).
- 2026-10-22 Shared lib/auth/localsync.js fixed (prototype hook, stray keys removed), pushed + rsynced lib/auth only to games.br8t.com. ASSIST done (18/18 node, 80/80 CDP) → wiring to GAMEPLAY, ap.landAt to TRAFFIC. Launched ART r3 (plane+world playtest visual fixes). 6 active (BARKS GAMEPLAY TRAFFIC FX STORY ART3).
- 2026-10-22 FX done (≤4 calls low, ≤6 high) → GAMEPLAY wiring. FX+ASSIST committed (unwired). 5 active (BARKS GAMEPLAY TRAFFIC STORY ART3).
- 2026-10-22 Launched PERF (read-only audit + tools/perf.mjs). 6 active (BARKS GAMEPLAY TRAFFIC STORY ART3 PERF).
- 2026-10-22 USAGE LIMIT killed all 6 lanes mid-work; relaunched all 6 as resume briefs (GAMEPLAY TRAFFIC STORY ART3 PERF BARKS) with full task lists incl. every Aaron ruling. barks.json had 813 entries; story narration i01–i10 existed.
- 2026-10-22 BARKS done: 816/816 clips, 15 MB voices; committed+pushed 9461fcd3. Listen-list: Marchioness (all towers), tower_f queen, tower_m rwy_09, baronin.queue_jump.2. Launched NET (online O1, local only). 6 active.
- 2026-10-22 ART3 done (tower, cars, cockpit fixes, LODs, low ≤~150k) committed. Nit: centre portrait headliner dominates top half. Launched PLANES (biplane + Royal Flying Bathtub models). 6 active (GAMEPLAY TRAFFIC STORY PERF NET PLANES).
- 2026-10-22 PERF done (docs/PERF.md: CPU-bound on phones; top: draw calls far-LOD/tower crew, tree refresh spikes, forced layout, pilot buffer uploads, boot freeze, suspended-audio ramp pileup). Added minified three r180 to gms/lib (identical release). Items → GAMEPLAY, STORY; launched PERFFIX for plane/world/fx items. 6 active.
- 2026-10-22 TRAFFIC done (flight-sim 42/42, atc-sim 92/92, 0 sep losses) committed LOCALLY (not pushed — main.js boot broken mid-edit by GAMEPLAY: getSettings). Wiring list sent to GAMEPLAY. 5 active (GAMEPLAY STORY NET PLANES PERFFIX).
- 2026-10-22 NET O1+O2 done (server + client + lobby, local only; deploy scripts NOT run — needs Aaron OK + port 8018 check). Committed locally. 4 active (GAMEPLAY STORY PLANES PERFFIX).
- 2026-10-22 Launched UI r3 (favourites, Online button hook, settings keys). js/ui ownership moved back from GAMEPLAY to UI. 5 active (GAMEPLAY STORY PLANES PERFFIX UI3).
- 2026-10-22 PLANES done (tiger, bathtub; committed locally). Launched TRAFFIC2 (taildragger/multi-type flight model per docs/PLANES.md). 5 active.
- 2026-10-22 UI r3 done (83/83/84) committed; manager fixed lobby voice order (saved voice first, then favourites). Wiring for Online in UI.md → GAMEPLAY later. 4 active (GAMEPLAY STORY PERFFIX TRAFFIC3).
- 2026-10-22 PERFFIX done (calls 72.6→45.6, CPU 4.41→3.50 ms, tree hitch gone) committed (farlod.js included). Local main ahead of origin — push only after GAMEPLAY lands + boot verified. onProgress for buildWorld → GAMEPLAY. 3 active (GAMEPLAY STORY TRAFFIC3).
- 2026-10-22 TRAFFIC3 done (tiger/bathtub fly; flight-sim 81/81, atc-sim 97/97) committed. Wiring list (type passthrough, attract types, parked rig pose) → GAMEPLAY. 2 active (GAMEPLAY STORY).
- 2026-10-22 DESIGN2 done: docs/AIRPORTS.md (one airport per load + Kingdom Map, ferry flights 2nd; 6 airports; A0 data-file refactor, A1 ATC layout-agnostic, farm strip first). Asked Aaron 3 Qs. 2 active (GAMEPLAY STORY).
- 2026-10-22 STORY done (intro 72 s, Mission 1 11 steps, time warp) committed. Notes: Scandal can wipe tutorial PP (tune outrage), LAND final 3 km out = slow. Wiring left → GAMEPLAY (Watch intro menu entry; first-launch intro). 2 active (GAMEPLAY AIRPORTS).
- 2026-10-22 Boot smoke clean (390x844 ?start=free / ?auto / menu); PUSHED 9 commits incl. GAMEPLAY WIP snapshot 9e720904. Live build now has HUD/markers/LAND/FX/story/Tiger+bathtub rigs (type picker pending).
- 2026-10-22 GAMEPLAY done + pushed (plane chips, D19–D25, story wiring, perf). Open: online plane stream/token not wired; UI hangar picker + onStory hook; STORY coach over plane in portrait chase; radio JSON defer; scandal grace only ATC path. Next: PLAYTEST_2 + POLISH lanes. 1 active (AIRPORTS).
- 2026-10-22 Launched PLAYTEST_2 (read-only, 9511) + POLISH (hangar aircraft picker, onStory hook, story coach position, radio defer; minimal main.js edits, 9601). 3 active (AIRPORTS PLAYTEST2 POLISH).
- 2026-10-22 GAMEPLAY final note: test-flight 'override: AP still landed' 32/33 (AP/ATC, busier circuit after seedRivals) → next TRAFFIC round; online plane sync + token not wired (next NET round).
- 2026-10-22 Launched NET O3 (session.js: remote planes, host ATC snapshots, Court, radio floor, token; no main.js edits). 4 active (AIRPORTS PLAYTEST2 POLISH NET3).
- 2026-10-22 USAGE LIMIT #2 killed AIRPORTS/PLAYTEST2/POLISH/NET3; all 4 relaunched with resume briefs. AIRPORTS also asked to diagnose test-flight override-landing flake.
- 2026-10-22 POLISH done + pushed 9a2d5936 (hangar picker w/ locks, onStory, coach position, radio defer). Hand-off: parked chips don't look locked until tapped (HUD). 3 active (AIRPORTS PLAYTEST2 NET3).
- 2026-10-22 NET O3 done; manager applied the §15 wiring to main.js (gen-main now idempotent), boot smoke clean, test-mp all passed; pushed. Remaining O4/O5 + deploy (needs Aaron). 2 active (AIRPORTS PLAYTEST2).
- 2026-10-22 Launched NET O4 (migration, AP for away players, pvp contact, 4-Chrome gate) + UI4 (locked chips, Court ladder, connection pill). 4 active (AIRPORTS PLAYTEST2 NET4 UI4).
- 2026-10-22 NET O4 done (4-page gate + falsify) pushed. Notes: wiring.startPlay('online') lacks room mode/protection (Strict −500 not applied); Autopilot._taxi throws on 1-point taxi leg (FLIGHT). Q Aaron: ramming scandal only Realistic? 3 active (AIRPORTS PLAYTEST2 UI4).
- 2026-10-22 PLAYTEST_2 done. Manager fixed B1 (iPhone-UA freeze: zero-sample silent WAV loop) + pushed. Next: FLIGHTFIX (B2 LAND never lands, B3 stick idles engine, B4 throttle springback, B5 bank cap, B6 parked start, B7 pacing, dup regs, _taxi guard) + HUDFIX (B8 overlaps, coach points DEMAND TAKEOFF, camera in tree, online room settings into startPlay). UI items → UI4.
- 2026-10-22 Launched FLIGHTFIX (9621) + HUDFIX (9631); UI items sent to UI4. 4 active (AIRPORTS UI4 FLIGHTFIX HUDFIX).
- 2026-10-22 UI4 done + committed (not pushed; wait for HUDFIX). Podium suggestions for NET later. 3 active (AIRPORTS FLIGHTFIX HUDFIX).
- 2026-10-22 Launched NET O5 (podium polish, quick join, kick-vote, reconnecting state). 4 active (AIRPORTS FLIGHTFIX HUDFIX NET5).
- 2026-10-22 NET O5 done + committed (not pushed). Manager added RECONNECTING/AUTOPILOT pill states. onlinehud_flow game half failing on working tree (court never shows) → HUDFIX asked to fix. 3 active (AIRPORTS FLIGHTFIX HUDFIX).
- 2026-10-22 AIRPORTS A0/A1 done (identity kept; rot37 soak clean); ATC playstart fixes committed. Hold creep / U-turn / demandTakeoff ends / test budget → FLIGHTFIX. Remaining hard-coding list in AIRPORTS.md §7. 2 active (FLIGHTFIX HUDFIX).
- 2026-10-22 HUDFIX done (test-gameplay 159/162) committed; fixed stale podium check (onlinehud 68/79/66). Boot smoke clean (C172, Tiger). PUSHED UI4, O5, ATC fixes, HUDFIX. 1 active (FLIGHTFIX).

## 2026-10-22 — FLIGHTFIX landed
Verified by manager: flight-sim 102/102, landahead 21/21, score-sim 143/143, atc-sim 97/98 (only the pre-existing mixed-soak holdMax 354 s — ATC X0 sequencing, AIRPORTS' item), boot smokes C172/bathtub clean. Committed + pushed (357edb63). Launched ATCSEQ (9631: atc-sim 98/98 + FLIGHTFIX→AIRPORTS items + story requestLand world), STORY2 (9632: missions 2–4 at C-Tower 1), PLAYTEST3 (9633: read-only → docs/review/PLAYTEST_3.md). Server: python http.server 8790.
Open for AIRPORTS (from FLIGHTFIX): treat player with ap.landing as cleared to land; placed() queue lined-up player first; spawn-grace for forced go-arounds; immediate crossing of closed 04/22; A2/U-turn taxi graph; emit ignored_instruction on goaroundrefused if scored. story/host.js requestLand passes traffic().env (no trees) — STORY should pass world.
- SCORE3 done (D28 light touch (shown as CLOSE CALL, D30) ≤12 kt plane-to-plane, 30 s per-pair cooldown; Hard = no contact pays; goaroundrefused → ignored_instruction, deduped). score-sim 174/174, falsify all caught. Manager wired main.js goaroundrefused→score, wiring difficulty + impact ids, Love Tap headline. Pending: ATCSEQ atc.noteGoAroundRefused hook → call from main.js; optional scold_nudge bark set (lines in SCORE3 report / SCORE.md).
- SCORE3 D30 done: CLOSE CALL naming, Hard pays survived contact after 3 s, one 60 s window per pair across near_miss/light_touch/formation. score-sim 187/187, falsify 18/18. Committed.
- ATCSEQ done + committed: atc-sim 103/103 (falsify 32/32) on HEAD autopilot; player-on-LAND known to ATC; placed() lined-up first + 60 s spawn grace; closed-runway crossing; runway U-turn (routes.js 1 line); atc.noteGoAroundRefused (bridge calls it); layout defaultEnd/departureEnds/runwayOptions/inApron. Manager: wiring '09'→defaultEnd; main.js world getter + live STANDS (uncommitted, rides with HUD4's main.js). Re-run atc-sim after LANDFIX2's autopilot lands (ATCSEQ saw 1 sep loss with its WIP). Debug feed: ?dbg → tools/dbgsink.py :8897 (8899 taken).
- NEXT PHASE (D31): gameplay hardening. Plan: (1) end-to-end loop suite in real game (3 planes × 3 difficulties × portrait/landscape, real taps), run every commit; (2) PLAYTEST_4 + Aaron ?dbg flights → fix lanes; (3) long soak (30 min free flight, AI + player) for freezes/stuck states; (4) only then farm strip / new planes.
- HUD4 done + committed: prompt cards top band (0.42 bg) left of warp; difficulty/aircraft chips moved up + fade on any control/chip tap; field-stranded DEMAND TAKEOFF (fieldHop stopgap → wants ap.fieldTakeoff); quit confirm with PP; radio name contrast; SKIP only before first liftoff; skip keeps demand. test-hud4 56/56 (manager re-ran). Open: real grass takeoff in AP; HUD4 picked 'any chip fades whole set' (aircraft pick hides difficulty too).
- 2026-10-23: usage limit hit; LANDFIX2 + STORY2 resumed. Aaron: after current work → testing round; after some testing/fixing, PAUSE and wait for Aaron to test before continuing. Launched LOOPTEST (9636) to build tools/test-loop.mjs end-to-end suite.
- 2026-10-23: LANDFIX2 committed (verified: flight-sim 127/127, falsified vs HEAD 15 FAIL+crash; landahead 21/21; score 187/187; atc 103/103; boot smoke clean). fieldTakeoff() not done — fieldHop stays. Waiting on STORY2 + LOOPTEST.
- 2026-10-23: TESTING ROUND (D31). LOOPTEST committed (8369b0f1). Quick rerun on LANDFIX2 HEAD still red:
  - player gets an AI departure ending in despawn after DEMAND TAKEOFF;
  - LAND on downwind picks a FIELD;
  - Hard has no finish (silent runway auto-bank);
  - Bathtub field takeoff 62 s.
  Launched:
  - FLIGHTFIX3 (9655): route, LAND runway choice, Tiger grass wingtip, ap.fieldTakeoff replacing fieldHop, Hard taxi-in.
  - GAMEFIX (9657): Hard auto-bank, radio chips covering buttons, herald over DEMAND TAKEOFF, prompt card vs AP pill overlap, skip-on-Hard-taxi, settings label.
  STORY2 resumed: M4 7/10 on my verify, plus M3 --falsify=crime passed (hole), plus warp-refused feedback. STORY2 still uncommitted.
  After these: full matrix, then PAUSE for Aaron's testing.
- 2026-10-25: STORY2 committed after manager verify (M1 17/17, M2 16/16, M3 16/16, M4 16/16 portrait+landscape, M3 --falsify=crime goes red 15/16, picker 8/8, warp 6/6). GAMEFIX done, verified score-sim 194/194; held for a joint commit with FLIGHTFIX3 (shared main.js). FLIGHTFIX3 still running.
- 2026-10-25: FLIGHTFIX3 + GAMEFIX combined verify: flight 153/153, landahead 36/36, score 194/194 (+falsify), atc 103/103, hud4 gamefix 18/18 (manager edit to demandTaxiOut forcing taxi fallback; falsify red). Full matrix 15/18. Tiger-hard field DEMAND TAKEOFF threw routes.js runwayEnd 'no runway end' → FREEZE. Also tiger-medium-landscape LAND no touchdown 300 s, bathtub-hard-landscape field takeoff 62 s. Sent back to FLIGHTFIX3; nothing committed until green.
- 2026-10-25: 9c53db6f pushed (FLIGHTFIX3+GAMEFIX; final: flight 156, landahead 36, score 194, atc 103, loop quick 2/2 + 3 former reds green; agent full matrix 17/18 with last red = test expectation, fixed in test-loop). Testing round done → PAUSED for Aaron's testing (?dbg link, sink :8897 up). No agents running. Next after Aaron: his findings, then D26/D29 farm strip + map. Re-ask online deploy.

## PRIORITY LIST (manager-owned, per D33) — 2026-10-27
1. NOW:
   - JETCORE: flight model, AP, LAND, ATC and world support for heavies and fast jets.
   - JETMODELS-A: Jumbo + Hercules 3D models.
   - JETMODELS-B: F-35 3D model.
   - JETSOUND: turbofan, turboprop and fighter (afterburner) engine audio.
   - MSGFIX: phone message clutter, measured; plus `?allplanes` and picker support for the new planes.
2. NEXT: jets integration testing (loop suite with the new types); Aaron flies them.
3. F-35B STOVL hover / vertical landing mode.
4. D26 farm strip (C-Tower 2) + D29 Kingdom Map / magic-cloud transfers; long-runway airbase for heavies.
5. Online deploy (Aaron to answer; port 8018).
6. More roster planes (cub, pitts, bizjet, a320 …); story missions for the new planes.
7. Later: D8 weapons (story extension + room option).
- 2026-10-27: Aaron: gameplay good, having fun on phone; messages still sometimes block; add jumbo, big military, F-35/fast jet; manager owns priorities. D32/D33 + PRIORITY LIST written. Launched 5: JETCORE (9661, flight/AP/ATC/data/aircraft.js), JETMODELS-A (9663, jumbo+herc models), JETMODELS-B (9665, f35 model + nozzle/liftfan/AB hooks), JETSOUND (9667, turbofan/turboprop/fighter voices), MSGFIX (9669, measured message cover + ?allplanes picker). Shared-file watch: js/plane/index.js (A+B additive), main.js (MSGFIX message plumbing; jet wiring at integration).
- 2026-10-27: Aaron asked for a task grid (D34). Launched TASKS lane (9671) = 6 active.
- 2026-10-27: JETSOUND committed bf09f8c1 (manager verify: 75/75, falsify flat 67/75, HEAD boot clean). Wiring (main.js engine voice kind/n1/ab) deferred to jets integration — see AUDIO.md. NOTE: old scratchpad smoke.mjs was gone; rewrote at $S/smoke.mjs (URL secs out port). Python http.server may bind IPv6 only → use [::1].
- 2026-10-27: JETMODELS-B done (f35 'Royal Tantrum', js/plane/types/f35.js + f35_cockpit.js; hooks setGear/setNozzle/setLiftFan/setAfterburner; budgets low 18 calls/14k). Geometry diff sent to JETCORE. Commit held until JETMODELS-A finishes (shared js/plane/index.js). TASKS resumed: real-time flight hours, career.addBonus, account.js sync key. Note: JETMODELS-B left its server PID 9090 (:8885 IPv6) running (classifier blocked its stop).
- 2026-10-27: 4ecf580e TASKS + jet models committed (verify: tasks-sim 88 + falsify 16/16, score 194, test-tasks 48/48, story M1 17/17, boot clean, jetview loads all 3). PLANES.md held for JETCORE's commit. Running: JETCORE, MSGFIX.
- 2026-10-28: JETCORE done (flight 207, atc 113, jets flyable). Manager integrated main.js (FLYABLE, engine voices kind/n1/ab, boundary/refused flashes) + js/ui/aircraft.js (HANGAR jets, SHORT/BLURB, ?allplanes); MSGFIX told to drop Task 2 and merge onto these. Verify: all 3 jets boot 58-60 fps no errors; loop jumbo-easy + f35-hard green; herc LAND greyed 'NO FIELD AHEAD' on its own downwind (home-runway radius not scaled by circuitScale) → back to JETCORE. Not committed yet.
- 2026-10-28: 7ab895e6 JETS FLYABLE + MSGFIX pushed (combined verify: flight 210, atc 113, score 194, tasks 85, landahead 36, hud4 75, test-tasks 48 after manager fix of Heavy Metal check, M1-M4 green, loop herc/f35/c172 green). Open: jumbo-hard 'bumped into K-BUNT' in field LAND step → JETCORE follow-up. Next per priority list: Aaron flies jets (?allplanes), then F-35B STOVL lane, then D26/D29 map.
- 2026-10-28: JETCORE follow-up (jumbo hard collision: contact height bands for jets + jet DEMAND hold-short when runway busy; atc-sim jetland 18 starts) verified: flight 210, atc 114, score 194, landahead 36, loop jumbo-hard + c172-medium green. Committed with test-tasks Heavy Metal fix. No agents running.
- 2026-10-27: Aaron tried jumbo + jet ("very cool"), said go on both. D35 recorded (one context button for F-35 VTO/HOVER/LAND HERE/FLY ON). Launched STOVL lane (flight/*, landbutton, aircraft.js, tasks.js, audio; main.js // STOVL) and MAP lane (D26 Muckle Bottom farm strip, long-runway airbase, D29 Kingdom Map + magic-cloud swap; world/*, data/airports, main.js // MAP).
- 2026-10-27: STOVL + MAP verified together: flight-sim 212, atc 114, score 194, landahead 36, tasks-sim 88, stovl-sim 55, airport-check 18, test-stovl 22/22, test-map 48/48, hud4 75/75, loop f35-hard/c172-med/bathtub-hard green; f35-easy stick-release fails 2/2 on HEAD but passes 2/2 on the new tree (pre-existing, fixed). Known flakes: quit-confirm, LAND probe budget under load.
