# audio agent notes (js/audio/*, audio/*, tools/audio_test.html)

## Checkpoint 3 (hand-back, 2026-10-19)
- LIVE in audio/music: hub.mp3 (hub A 57bd722335, 91.2 s loop, 1.46 MB), map.mp3 (f4f5245678, 85.2 s), battle_1.mp3 (02d48ac1f8, 68.4 s),
  battle_4.mp3 (battle_1 B c104e503cf, 72.8 s), battle_2.mp3 (f451cc8c0c, 64.0 s = 32 bars @120, added after hand-back). All about -15 LUFS, so gain stays at 1. The battle rotation is battle_1 + battle_4.
- STILL RENDERING in Music Studio (project 060bf831d2): battle_3 05796495a6, boss 9961675e81, rift 08df28b968,
  sting_victory d22a8fef32, sting_defeat 69d04b7d61, sting_reveal c8058f4c7c, crowd 37e1598708.
- TO FINISH (fresh agent): `cd <scratchpad>/audio && python3 process.py` cuts every finished loop (it picks auto vs nominal bpm by seam_sim)
  into cut/ and cuts.json. Copy to audio/music/<id>.mp3, set `loop` in tracks.js, add battle_2/3 to STATES.battle. Stings are not loops:
  trim the leading silence, keep about 4-8 s, add a 1 s fade, and encode at 128k to audio/music/sting_*.mp3 (crowd -> audio/sfx/crowd.mp3).
  Until then victory/defeat use the synth fallbacks.
- Seam note: the cutter's seam is, by construction, the continuous source audio (the head starts with the continuation at weight 1),
  so the only artifact risk is the 1 s crossfade region; seam_sim (> 0.9) is the metric that matters, not seamcheck's flux at the seam.

## Checkpoint 2 (2026-10-19)
- DONE
  - `js/audio/audio.js` engine (singleton `audio`, also `window.__audio`): buses master/music(+duck)/sting/sfx + compressor;
    music = decoded AudioBuffer looping with loopStart/loopEnd (sample-exact; skips decoder lead padding), crossfades, state
    rotation; stings duck music; `sfx()` throttled per name + global cap 28 voices; unlock on first gesture (+ silent media
    element for the iOS playback session, `navigator.audioSession.type='playback'`); visibility suspend/resume; volumes persist
    in localStorage `vectorprotocol.audio.v1` (try/catch). Missing files warn once and stay silent (D19-safe).
  - Auto hooks inside audio.js (no other edits needed once it is imported): `hashchange` -> route music (ROUTES in tracks.js);
    delegated capture-phase click -> UI sounds (`button, a[href], [role=button], .vp-card, .pc`; back = `.vpm-back` /
    `aria-label=back|close`; `.primary/.go/.cta/.deploy` = confirm; disabled = deny; `data-sfx="name"` overrides, `data-sfx="none"` mutes).
  - `audio.forBattle(sessionBattle)` -> picks battle/boss/rift track (boss if any enemy wave def starts `boss_`; rift if theme/realm
    fantasy or m6) and returns the `opts.audio` object for createBattleScene. Battle hook names mapped (BATTLE table in audio.js).
    victory/defeat = music fade + file sting (+ crowd sample on victory), synth fallback.
  - `js/audio/sfx.js`: 43 synthesized sounds, all render clean (offline-rendered levels checked in headless Chrome).
  - `tools/audio_test.html`: every track (Play / "Seam in 4 s"), sting, battle hook, sfx; volume sliders; status panel.
- IN PROGRESS: music. Music Studio project "VECTOR PROTOCOL" id 060bf831d2; 10 prompts x 2 variations + crowd x2 queued
  (job ids/prompts: scratchpad audio/jobs.json). ACE is very slow right now (machine swapping 29 GB, many headless Chromes).
  Loop cutter: scratchpad audio/loopcut.py (tempo + bar grid from onset autocorrelation, best-matching bar-aligned seam,
  waveform refine +-15 ms, equal-power 1 s crossfade of the continuation baked into the head, lame 128k).
  - Cancelled the 2nd variation of everything except hub + battle_1 (each ACE job is taking ~10 min under swap pressure,
    normally ~2 min). Still queued: hub B, map, battle_1 A+B, battle_2, battle_3, boss, rift, 3 stings, crowd.
  - hub A cut + live: audio/music/hub.mp3, start 12.588 s, loop 91.205 s = 38 bars @ 100 bpm exactly (ACE honours the bpm
    param exactly; the fine search lands on the nominal tempo). Seam check (scratchpad audio/seamcheck.py): flux/HF jump at the seam
    below the track's own p95. Chrome decodes the 128k mp3 to exactly 91.205 s, first sample non-silent (LAME gapless honoured).
  - Batch: scratchpad audio/process.py cuts every finished loop job into cut/<name>_<id>.mp3 and logs cuts.json.
- NEXT: when tracks land: pick variation, `ace-step/.venv/bin/python loopcut.py master.flac audio/music/<id>.mp3 <bpm>`,
  put `loop` seconds into tracks.js, set gains (loudness match), verify seam in tools/audio_test.html.

## Integration requests (manager: please route)
- **ui (js/main.js)**: `import './audio/audio.js';` once at boot (static import is fine: it has no deps outside js/audio and
  never throws). That alone turns on route music, UI tap sounds and unlock-on-first-gesture.
- **ui (js/ui/scr_battle.js:47)**: pass `audio: audioMod.forBattle(B)` in the createBattleScene opts (`import { audio as audioMod } from '../audio/audio.js'`).
  Without it the battle is silent except the route fallback track. For the tactical-feed fallback the same object works: `a.sfx(name)`.
- **ui (settings)**: sliders -> `audio.setVolumes({music, sfx})` (0..1), read with `audio.getVolumes()`; a mute toggle -> `audio.mute(bool)`.
- **ui (explicit sounds; all optional)**: recruit reveal `audio.sfx('rarity_reveal', {rarity})` per card + `audio.sting('reveal')`
  for epic/legendary; card flip `audio.sfx('card_flip')`; level up `audio.sfx('level_up')`; rank up / reward `audio.sfx('reward')`;
  currency count-up `audio.sfx('currency_tick')` per step (throttled internally); results stars `audio.sfx('reward')`.
  Add `data-sfx="none"` to buttons that already play their own sound.
- **battle (js/battle/battle.js, optional but much better)**: pass a context object as the second arg:
  `audio.sfx('fire_' + e.delivery, { ability: e.ability, x: a.x })`, `audio.sfx(e.crit ? 'hit_crit' : 'hit', { x: dst.x, melee: src?.v.role !== 'mage' && e.delivery === 'melee', absorbed: e.absorbed, amount: e.amount })`,
  `x` for heal/death/deploy too (pans left/right: player side is negative x). Abilities then get their own weapon sound
  (rail, shotgun, minigun, arrow, blade, bolt, EMP...). Also call `audio.sfx('overdrive_fire')` in overdriveFire if you want the
  release on the actual fire frame (today 'overdrive' plays charge + release as one ~1.7 s sound), and `audio.sfx('shield_break')`
  when `e.broken` in the shield case.

# audio-2

## Checkpoint 1 (2026-10-19)
- DONE: all 7 remaining renders processed. Loops in audio/music: battle_3 79.12 s (start 9.70), boss 47.99 s (start 41.5),
  rift 54.00 s (start 26.2, gain 0.8: it is -13 LUFS). boss + rift renders have a 2-3 s near-silent break at ~22 s (and boss at 96 s);
  the first auto cut looped straight through it, so loopcut.py got `--skip/--end/--starts` and both were recut after the break.
  Stings trimmed + faded + limited: victory 8.0 s, defeat 9.5 s (keeps its final hit), reveal 6.0 s (from 4 s in, impact lands ~4 s).
  crowd -> audio/sfx/crowd.mp3 (6 s, 96k).
- DONE: js/audio/manifest.js (GENERATED by `node js/audio/gen_manifest.mjs`); tracks.js only exports entries whose file ships.

## Checkpoint 2 (audio-2 hand-back, 2026-10-19)
- Track table (all 128k mp3, about -15 LUFS; total audio/ = 9.47 MB, 12 files):
  | id | loop s | MB | source |
  |---|---|---|---|
  | hub | 91.205 | 1.46 | 57bd722335 |
  | map | 85.197 | 1.36 | f4f5245678 |
  | battle_1 | 68.428 | 1.10 | 02d48ac1f8 |
  | battle_2 | 64.007 | 1.03 | f451cc8c0c |
  | battle_3 | 79.121 | 1.27 | 05796495a6 (new, seam_sim 0.90) |
  | battle_4 | 72.830 | 1.17 | c104e503cf |
  | boss | 47.988 | 0.77 | 9961675e81 (new, 22 bars after its 3 s break, seam_sim 1.21) |
  | rift | 54.003 | 0.87 | 08df28b968 (new, gain 0.8, seam_sim 1.37) |
  | sting_victory / defeat / reveal | 8.0 / 9.5 / 6.0 s | 0.13 / 0.15 / 0.10 | d22a8fef32 / 69d04b7d61 / c8058f4c7c |
  | sfx/crowd | 6.0 s | 0.07 | 37e1598708 |
  The renders are not glitched or silent apart from the in-track breaks noted above, which the cuts skip. Mood was judged only from the prompts and
  levels (no listening possible here), so Aaron should give them an ear.
- Manifest: `js/audio/manifest.js` is GENERATED by `node js/audio/gen_manifest.mjs` (re-run after adding/removing any audio file).
  tracks.js filters TRACKS/STINGS/STATES to shipped files (`UNSHIPPED` lists the rest), so nothing unshipped is ever fetched.
  STATES: battle rotates battle_1..4; boss/rift fall back to battle_3/battle_2 if their file is missing.
- Battle context (audio.js battleSfx):
  - per-ability weapon timbres. Melee uses its own table (blade / shotgun / new `swing_heavy` for punch, maul and bash), and ranged uses one with
    rail, minigun, new `shot_heavy` (cannon/rifle), arrow, bolt, emp, explosion, prism or heal beams (pitched `beam`).
  - pan = clamp(x/6.5, ±0.75). Absorbed-only hits -> `shield_hit`; partly absorbed hits -> impact + quiet shield_hit; melee -> melee_impact;
    the amount sets a gentle volume curve.
  - `overdrive` = charge riser only (1.5 s); `overdrive_fire` chokes the riser (30 ms) and plays the release plus the ability's weapon layer.
    If no fire arrives within 1.6 s, it falls back to playing the release on its own.
  - voice groups fire 7 / hit 6 / support 4 / big 4, per-sound caps (minigun 2, emp 2, ...), and each extra voice in a group gets a 1/sqrt gain cut.
    A 60-event barrage at x4 peaked at 17 live voices (fire 5, hit 5).
  - `debug.played` ring buffer (last ~200 voices: name, pan, vol, group) for tests.
- FIX: the app router navigates with history.pushState, which fires no hashchange event, so route music never followed taps. audio.js now
  watches popstate and polls location.hash every 250 ms.
- Verified in game (CDP 9423, 412x915, ?unlockall, m1_l1 at x4): hub -> map crossfade, battle (battle_3) with every context key arriving
  (fire_* ability+x, hit x/melee/absorbed/amount, deploy/death x, overdrive + overdrive_fire), victory sting + crowd, back to hub music.
  Suspend/resume works on visibilitychange. Zero console errors; audio requests were only shipped files, all 200.
  Boss/rift selection and all files were checked on tools/audio_test.html (lists 8 tracks, every state, 4 stings, every context hook, every sfx).
- Open: no live boss/rift battle has been run in game (those levels were locked in the test save). Nobody has listened to the new renders yet.
  The reveal sting is only ever played if ui calls `audio.sting('reveal')`.
- Requests
  - ui: (optional) dispatch a `popstate`/`hashchange` after `router.go` so audio reacts instantly instead of on the 250 ms hash poll.
  - ui: recruit reveal should call `audio.sting('reveal')` for epic/legendary (file now ships).

# audio-3

## Checkpoint 1 (2026-10-20)
- Music Studio project **"VECTOR PROTOCOL v2" id aa890ebe98**. YuE2 instrumental route (`instrumental:true`: YuE2 plans a song from
  section tags, the worker moves the Vocal line to Ins and renders), `intro: short` (4 bars), cot full, one take per job so A/B
  are separate rows with the same title. Briefs + seeds: scratchpad `audio3/submit.py`, job list `audio3/jobs.json`.
- Round A queued (track ids): hub 671c6ac523, battle_1 092a6ef1b4, boss 75a1854b70, rift ab5ed16a28, map fbf9f592c3,
  battle_2 281e28feec, battle_3 75ed55c8bc, sting_victory 2721cdd75f, sting_defeat 0b5ae6f85a, sting_reveal b78cbb6e9b,
  battle_4 c533b087b4. Round B (seed +2101) to be queued after hub A is checked.
- NEXT: overlap fix in js/audio/audio.js (menu routes share one track; max 2 decks; shorter fade-out).
- hub A 671c6ac523 FAILED (YuE2 plan had a malformed bar: `AbcError ... duration 7/2 quarter notes != meter duration 4`; the
  instrumental converter rejects it). Deleted; resubmitted as hub A 0508d77e5f (seed 7151). Failures get one resubmit with a new seed.
- DONE (code, not yet browser-verified): overlap fix in js/audio/audio.js — `decks[]` tracks every unstopped source; starting a deck
  hard-stops (30 ms) everything except the one it replaces; outgoing fade capped at 0.8 s; same track already playing is never
  restarted; menu route changes settle 350 ms before music changes; forBattle cancels a pending route change. Also fixed: results ->
  hub within 2.2 s left the music silent (music() returned early on the pending state). `__audio.debug.decks()` lists live decks.
  Node mock test (scratchpad audio3/decktest.mjs, fake WebAudio): menu hopping starts 0 new sources, hub/map ping-pong max 2
  audible, results->hub plays hub (the original file fails that case: silent).
- Analysis tools: audio3/analyze.py (ebur128 LUFS/true peak, clipping, silent seconds, bands, onset tempo vs score Q:),
  audio3/tag.py (AudioSet AST tagger, sheetsage venv, CPU). Baseline: the old ACE tracks tag as Electronic/Techno with
  Guitar/Drum kit ~0.00, i.e. the "midi" verdict shows up objectively; a YuE2 blues-rock clip tags Guitar 0.50 / Distortion 0.34.

## Checkpoint 2 (2026-10-20)
- Every instrumental YuE2 plan failed the strict converter (6/6, also after adding placeholder lyrics). Fix outside the game:
  `~/cc/airon/audio/yue2/service/abc_repair.py` + a try/except in `worker.py` (instrumental branch only; backup of the old
  worker in scratchpad audio3/worker.py.orig). Documented in audio/yue2/CLAUDE.md. The salvage keeps the clean prefix of the
  plan and repeats its body to max_seconds, so takes are verse-heavy and repetitive (fine for loops).
- Round A re-queued with the same ids (retry): hub 87da33b74a, battle_1 07f2dee9ba, boss c9c51b4850, rift d6f401c8ed,
  map 14928300ad, battle_2 e6bae75015, battle_3 72e3392185, sting_victory 54c023b2c2, sting_defeat 59936d7cd1,
  sting_reveal c022f9a684, battle_4 19649f2a38 (seeds 7301+index, briefs in scratchpad audio3/submit.py).
- Overlap fix VERIFIED in headless Chrome (port 9407, run while YuE2 was unloaded; audio3/overlap.mjs): hub<->barracks x6 at
  150 ms -> 1 deck, never restarted; all 10 menu screens at 120 ms -> 1 deck; hub<->map x5 at 250 ms -> map never started
  (350 ms settle), 1 deck; hub<->map x3 at 1.2 s -> max 2 audible. No console errors.

## Checkpoint 3 (2026-10-20): v2 shipped (partial)
Music Studio project "VECTOR PROTOCOL v2" (aa890ebe98). All 11 round-A takes went through abc_repair salvage (Aaron approved the patch).
AST tags (Guitar / Drum kit / Violin): the old ACE tracks scored about 0.00 / 0.00 / 0.00. No take shows vocals (Singing <= 0.033).

| cue | take | verdict | loop | gain | tags gtr / kit / vln | why |
|---|---|---|---|---|---|---|
| hub | 87da33b74a | SHIPPED | 54.806 s, 20 bars @87.5, from 41.45 s, seam_sim 1.37 | 0.55 (-10.8 LUFS -> about -16) | 0.15 / 0.02 (drum 0.04) / 0.00 | guitar band, steady level |
| battle_2 | e6bae75015 | SHIPPED | 55.400 s, 28 bars @121.6, from 11.87 s, seam 1.12 | 0.55 (-9.8) | 0.33 / 0.02 / 0.00 (metal 0.35) | heaviest; the render saturates after about 75 s, so the loop is cut before that |
| battle_3 | 72e3392185 | SHIPPED | 62.491 s, 39 bars @149.6, from 9.89 s, seam 1.07 | 0.77 (-12.7) | 0.05 / 0.14 (drum 0.18) / 0.03 | live drums strongest |
| rift | d6f401c8ed | SHIPPED | 56.181 s, 14 bars @59.8, from 36.33 s, seam 1.28 | 0.73 (-12.3) | 0.01 / 0.08 / 0.42 | fiddle-led folk; guitar barely registers |
| sting_victory | 54c023b2c2 | SHIPPED | 12-20 s, 1.5 s fade | -15.8 LUFS | 0.16 / 0.02 / 0.00 (metal 0.29) | |
| sting_defeat | 59936d7cd1 | SHIPPED | 0.3-9.8 s, 2.5 s fade | -16.3 | 0.27 / 0.00 / 0.00 | quiet guitar + cello |
| sting_reveal | c022f9a684 | SHIPPED | 13-21 s (build into the hit at 17 s) | -13.7 | 0.29 / 0.01 / 0.00 (dist 0.21) | |
| battle_1 | 07f2dee9ba | REJECTED | | | 0.01 / 0.05 / 0.00 | render runs away to -1.6 LUFS, 1M clipped samples, tags as Electronic |
| battle_4 | 19649f2a38 | REJECTED | | | 0.01 / 0.03 / 0.08 | same runaway (-2.3 LUFS, 459k clipped) |
| boss | c9c51b4850 | REJECTED | | | 0.13 / 0.01 / 0.00 | only 69 s with a silent second at 40 s; best loop 18 s, seam_sim -0.03 |
| map | 14928300ad | REJECTED | | | 0.23 / 0.01 / 0.00 (metal 0.38) | heavier than battle, runaway to -5 RMS; usable span gave a 27 s loop |

- Round B queued at 80 s (the runaway starts 35-75 s in): battle_1 a9ce9dc6b7, battle_4 71a5cba878, boss b849d54b8b, map 26bd2e3494.
- tracks.js: map/chapters/formation now route to 'menu' (the hub track, never restarted). Battle rotation is battle_2 + battle_3; boss falls back to battle_3.
  The old ACE files are removed from audio/music (backup: scratchpad audio3/ace_backup/). audio/ is 8 files, 4.15 MB. gen_manifest re-run.
- In game (CDP 9407, m1_l1): hub plays; hub -> map keeps the hub deck running (no restart); battle plays battle_3 with every hook arriving;
  victory sting + crowd; results -> hub returns to hub. Requests are all 200, no console errors.
- To swap a take: pick another row in Music Studio, then `loopcut.py master.flac out.mp3 <score bpm> --skip <intro s> --end <before runaway> --starts 40`,
  and set loop/gain in tracks.js (gain = 10^((-15 - LUFS)/20)).
- Round B finishing: run analyze.py + tag.py, cut, add the cues back (battle rotation, boss; map only if it is calmer than hub).
