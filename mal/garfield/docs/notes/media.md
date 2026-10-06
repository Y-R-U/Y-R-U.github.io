# media — notes

## DONE
- Step 1 refs complete (refs/README.md). All lanes messaged.
- VO script: levels' js/game/lines.js (parsed live) + EXTRAS/NN_FIXES in tools/media/vo_lines.py (~387 lines).
  `python3 tools/media/gen_vo.py docs` rebuilds audio/vo/manifest.json + docs/VO_LINES.md.
- Voices (Qwen Voice Studio clone profiles; tools/media/voices.json):
  Garfield = "Hungry Heist · Garfield" 9611963d… (F0≈100 Hz). Jon = "Hungry Heist · Jon (v2 male)" 04254ade… (F0≈110–160 Hz)
  — v1 Jon (F0≈250) rejected by Aaron ("sounds like a girl"), kept as jon_v1_rejected.
- Music (ACE-Step turbo, 6 steps) → audio/music: menu 82 s loop, sneak 82 s loop, chase 69.5 s loop, cutscene 61 s loop,
  victory 9.5 s, fanfare 14.5 s (6.9 MB). Loops = crossfaded head into tail (gen_music.py loop); audio.js MUSIC[].len
  drives loopStart/loopEnd so Safari's MP3 padding doesn't gap. Raw takes in tools/media/scratch/music.
- js/audio/audio.js + sfx.js + tools/audio_test.html; headless-tested (music switching, VO playback, SFX render).
- tools/media/qc_vo.py ASR QC (whisper-small.en mlx).

## IN PROGRESS
- VO batch (Jon all regenerated with v2) — resumable: `cd tools/media && python3 gen_vo.py`. ~8 s/line.

## NEXT
- qc_vo.py → regen LOW lines. Message manager when VO done.
- Optional YuE2 title song: tools/media/song/title_song.json (original lyrics). Unload ACE first (done).

## REQUESTS
- none
