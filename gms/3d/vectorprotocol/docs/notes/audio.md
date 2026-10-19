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
