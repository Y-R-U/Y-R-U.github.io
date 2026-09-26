# audio notes

Owner: audio agent. Files: `js/audio/*`, `audio/*`, `tools/vo/*`, `tools/audio_test.html`, this file.

## DONE
- **Engine** `js/audio/audio.js` (+ `tracks.js` catalogue, `sfx.js` synth). API below. Headless test passes (port 9306): all 10 music states play, loop rollover to the next playlist track, stings, 58 SFX names, 7 ambient beds, positional cut-off, emitters, VO promise + ducking, bark cooldown; zero errors.
- **Music**: see `audio/music/README.md`. **`boss.mp3` and `net.mp3` are NOT music** (byte-identical to NEONHAUL's spoken criminal-leader VO take and its radio-chatter murmur). boss.mp3 is unused; net.mp3 is the `comms` bed. Added 7 Skyhammer Suno tracks. Folder total ~15 MB.
- **VO is driven by docs/VO_LINES.md** (canon, manager decision). `tools/vo/import_lines.py` → `tools/vo/story.json` (182 rows: 103 P0, 34 P1, 45 P2). Voice ids = STORY.md cast ids. FX routing: iris "recording" → `iris_rec`, harmony "glitch" → `harmony_glitch`, halloran radio → `halloran_radio`, HIRA in acts 5–6 → `hira_clean`, Dray acts 2+ → `dray_gold`.
- **Voices** designed from STORY §1 prompts and saved in Qwen Voice Studio (source of truth `tools/vo/voices.json`; ids listed below). Aliases (no separate saved voice): `harmony` = Iris ×0.92 + hall reverb/chorus, `seraph` = Lyra + ring-mod/octave-down, `choir` = Lyra ×3 pitch layers, plus the routing aliases above.
- **Extra robot barks** (not in VO_LINES; kept because robot civilians/security robots exist in the game): `tools/vo/script.json` → `b_civbot_*` (12), `b_secbot_*` (14), `b_enforcer_*` (4). Planner may drop them.
- Placeholder sets from before VO_LINES existed (narrator, dispatcher, contract broker, vendor, my PA lines) were **deleted**; their saved voices are parked in `tools/vo/voices_unused.json`.
- **Lullaby motif** composed (`LULLABY` export in `sfx.js`): "Little star, the sky is wide / little star, go see outside" = E5 C#5 A4 | B4 C#5 E5 F#5 | E5 C#5 A4 | B4 C#5 B4 A4. Used by `loot_heirloom` (first phrase on bells), `sfx('lullaby')` (music box), `sfx('lullaby_hum')`.

## IN PROGRESS
- `python3 design.py kettle` (redesign: first Kettle read 216 Hz, too high for a bass) then `python3 gen_vo.py` = all P0 VO_LINES rows + robot extras (133 clips). Log: `tools/vo/scratch/gen3.log`. Manifest is saved after every clip, so an interrupted run just resumes (re-run the same command).

## NEXT
1. After gen: `python3 gen_vo.py --qc` and `asr_check.py`; regenerate genuinely bad keys with `python3 gen_vo.py <key…>`.
2. Rerun `tools/audio_test.html?auto=1` headless (port 9306) against the full manifest.
3. P1 lines: `python3 gen_vo.py --max-p P1` (Act 2, more barks, PA glitches). P2 later.
4. Requests to other agents (below).

## Requests to other agents
- **ui** (`js/ui/dialogue.js`): it plays `voiceUrl` with its own `new Audio()`, which skips music ducking and the volume buses. Preferred: the caller runs `audio.vo(key)` and passes `voiceDuration: audio.voInfo(key)?.duration` (no `voiceUrl`) so the typewriter still syncs. Also forward the settings volumes to `audio.setVolumes({master, music, sfx, vo, ambient})`.
- **systems/main**: call `audio.setListenerCamera(camera, player.x, player.z)` each frame (or `setListener(x, z, yaw)`), `audio.music(state)` on state changes, `audio.ambient(district bed)` on district change, `audio.bark('b_thug_aggro_', {x, z})` etc. Loot drops: `audio.sfx('loot', {rarity, x, z})`.

## API (import { audio } from './audio/audio.js'; also window.__audio)
- `audio.unlock()` → Promise<bool>. Gesture listeners (pointerdown/touchend/keydown/click) are auto-installed and also re-resume after iOS interruptions. Anything requested before unlock (music state, ambient bed) starts on unlock.
- `audio.music(stateOrTrack, {fade, restart})`. States: `menu explore stealth combat warehouse boss boss_final story undercity comms`; `null` stops. Same state twice = no-op. Playlists rotate on each loop; loops crossfade 3 s before each track's `end`. Returning to a track within 2 min resumes where it left off.
- `audio.sting('win'|'lose')` ducks music underneath.
- `audio.sfx(name, {x, z, vol, kind, rarity, minGap, maxVoices})` → length in s (0 if skipped). `sfx('step',{kind:'rental'|'elegant'|'heavy'|'light'})`, `sfx('loot',{rarity:'scrap'…'heirloom'})`. Full list: `audio.debug.sfxNames`.
- `audio.setListener(x, z, yaw?)` or `audio.setListenerCamera(camera, playerX, playerZ)` (uses the camera's right vector for pan). Attenuation: full within 5 m, 1/d-ish, silent past 50 m; lowpass past 18 m.
- `audio.vo(key, {x, z, vol, channel:'main'})` → Promise `{key, ok, duration|reason, interrupted?}`; never rejects. Main VO ducks music to 0.3 and ambience. A new main line interrupts the previous one.
- `audio.bark(prefixOrKeys, {x, z, cooldown=4, force})` → random clip whose key starts with prefix (no immediate repeat); skipped while any VO plays or within cooldown.
- Missing clip → resolves immediately `{ok:false, reason:'missing'}` (manifest is fetched at import). Before unlock → `{ok:false, reason:'locked'}`.
- `audio.stopVo()`, `audio.voUrl(key)`, `audio.voInfo(key)` → `{text, duration, voice}|null`, `audio.hasVo(key)`, `audio.preloadVo([keys])`, `audio.manifestReady()`.
- `audio.ambient('city'|'plaza'|'park'|'boulevard'|'warehouse'|'interior'|'undercity'|null)` procedural beds (traffic hum, crowd murmur, fountain, wind, flybys, civic chimes, birds, drips).
- `audio.emitter(kind,{x,z,level,vol})` → `{setPos, setVolume, stop}` positional loops: fountain, waterfall, machine, holo, traffic, crowd, room, wind. Auto start/stop at 50 m.
- `audio.setVolumes({master,music,sfx,vo,ambient})` (persisted to localStorage), `getVolumes()`, `mute(bool)`.
- Debug: `audio.debug.info()`, `.level()` (master RMS dB), `.errors`, `.seek(t)`.

## Voice pipeline (tools/vo)
- `import_lines.py`: VO_LINES.md → story.json (re-run after planner edits).
- `design.py [ids…]`: designs each cast entry (cast.json + cast_story.json) with up to 5 seeds, scores on duration-vs-text, loudness and a crude pitch range (`f0`), saves the best with `POST /api/voices {job_id, preserve_voice:true}`, writes `voices.json`. Entries with `clone_of` are aliases (same voice, different speed/FX) and are not designed.
- `gen_vo.py` (re-runnable): generates `story.json` lines up to `--max-p` (default P0), then `script.json` extras; skips a key when text+voice+speed+FX are unchanged (`sig`). `gen_vo.py key1 key2` forces keys; `--voice id` forces a voice; `--qc` re-measures everything on disk. Up to 3 seeds per line; keeps the take with the fewest QC flags. Output: trim silence → voice FX → loudnorm −16 LUFS → mono 24 kHz 48 kbps mp3.
- `asr_check.py` (run with `uv run --offline --with faster-whisper python asr_check.py [keys]`, CPU only): transcribes clips with Whisper base.en and scores word similarity against the script (numbers ignored); < 0.75 flagged into `asr_report.json`. Read the `heard` text before regenerating: ASR mishears the HIRA band-pass FX ('brand-safe' → 'Bransafe').
- `qc.py`: flags > 2.5× expected duration, < 0.28×, mean < −35 dB, internal gap > 1.6 s. Manifest carries `qc: []` per clip.
- `tts.py` waits while mflux :7867 / LTX :7866 have a job, queue or warm worker, while `mlxcel-server` runs, or while another TTS job is active.

## Gotchas
- The Python dev server (:8841) has **no HTTP Range support**, so `<audio>` seeks fail there and music restarts from 0 on loops/resume. GitHub Pages supports Range. Not a bug in the engine.
- Qwen Voice Studio has **no delete endpoint**, so a redesign leaves the old voice behind. Superseded (ignore): the first `Heirframe · Contract Broker`, the first `Heirframe · Enforcer`, the first `Heirframe · Big Kettle` (216 Hz), and everything in `voices_unused.json`. `voices.json` is the truth.
- Two design scripts polling at once starve each other (gen polls fast, design every 20 s). Run TTS jobs sequentially in one shell chain.
- Pitch (`qc.f0`) is a crude autocorrelation median; theatrical deliveries read high. Use it as a sanity gate, not a verdict.
- The TTS `style` column in VO_LINES cannot be applied: saved voices are clones, and the Qwen clone model takes no instruction. Delivery comes from the reference take plus punctuation; only the FX routing above uses `style`.
