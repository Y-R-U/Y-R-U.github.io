# media — notes

## DONE
- Step 1 refs complete: refs/ garfield_front/_b/3q/side/sit, jon_front/3q, kitchen, living_room, bedroom,
  culdesac_exterior, food_steak/lasagna/meatloaf + refs/README.md (ui_mood dropped per manager). All lanes messaged.
  Flux unloaded after.
- VO script: levels' js/game/lines.js (parsed live) + EXTRAS/NN_FIXES in tools/media/vo_lines.py (~387 lines).
  `python3 tools/media/gen_vo.py docs` rebuilds audio/vo/manifest.json + docs/VO_LINES.md.
- Voices saved in Qwen Voice Studio (clone profiles): "Hungry Heist · Garfield" 9611963d… (design v1 seed 7, F0≈100 Hz),
  "Hungry Heist · Jon" a5bbe2ed… (design v1 seed 7, F0≈250 Hz). tools/media/voices.json holds both.
- js/audio/audio.js + js/audio/sfx.js (37 procedural SFX) + tools/audio_test.html. core messaged.
- ASR QC works: tools/media/qc_vo.py (whisper-small.en mlx + openai tokenizer files downloaded to HF cache).

## IN PROGRESS
- Full VO batch (started 02:01, ~9 s/line → ~1 h). Resumable: `cd tools/media && python3 gen_vo.py` skips done lines.
  Log: scratchpad vo.log.

## NEXT
- qc_vo.py over all lines → regenerate LOW ones (gen_vo.py <key>… regenerates exactly those).
- Music: after VO, `~/cc/airon/audio/yue2/.venv/bin/python tools/media/gen_music.py gen` then loop/oneshot → audio/music.
- Optional YuE2 title song.

## REQUESTS
- none
