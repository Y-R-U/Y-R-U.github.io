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
