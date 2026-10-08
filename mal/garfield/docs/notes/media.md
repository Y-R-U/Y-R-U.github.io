# media — notes

## DONE
- refs: 15 images + refs/README.md (garfield ×5, jon ×2, kitchen, living_room, bedroom, culdesac_exterior, 3 foods).
  Candidates moved to tools/media/scratch/ref_cands (gitignored).
- VO: 387/387 lines in audio/vo/*.mp3 (64 kbps mono, loudnorm −16 LUFS, trimmed; 8.9 MB, 16.9 min total).
  Source = levels' js/game/lines.js + tools/media/vo_lines.py EXTRAS/NN_FIXES. manifest + docs/VO_LINES.md generated
  (`python3 tools/media/gen_vo.py docs`). Every line ASR-checked (tools/media/qc_vo.py → scratch/qc.json); 4 bad takes
  re-rolled with SEED=101. The 10 remaining "LOW" scores are false positives (interjections/homophones: Blech→black,
  Whoa spellings, steak→stake).
- Voices (Qwen Voice Studio clones; tools/media/voices.json): Garfield "Hungry Heist · Garfield" (F0≈100 Hz);
  Jon "Hungry Heist · Jon (v2 male)" (F0≈110–160 Hz). v1 Jon rejected by Aaron.
- Music (audio/music, 9.1 MB): menu/sneak/chase/cutscene seamless loops (ACE-Step), victory 9.5 s, fanfare 14.5 s,
  title_song 88 s (YuE2, original lyrics in tools/media/song/title_song.json; whisper confirms clearly sung lyrics).
- js/audio/audio.js + sfx.js (37 procedural SFX) + tools/audio_test.html. Headless-tested.

## NEXT (if more time)
- Human listen-pass on music + a few VO lines (all QC so far is objective: ASR, F0, loudness — nobody has listened).
- Richer recorded-style SFX (meow/purr are synthesised formants; they work but are the weakest).

## Regenerating
- VO: `cd tools/media && python3 gen_vo.py` (only new/changed lines); `SEED=n python3 gen_vo.py key…` to re-roll.
- QC: `HF_HUB_OFFLINE=1 ~/cc/airon/qwen-tts/.venv/bin/python qc_vo.py`.
- Music: `~/cc/airon/audio/yue2/.venv/bin/python gen_music.py gen <name>` then `loop`/`oneshot`; update MUSIC[].len in audio.js.

---
# WAVE 3 (2026-10-08) — Brief 2 media lane (agent 'media', port 9401)

## DONE
- refs: odie_front, odie_side, odie_front_b, lyman_front promoted (cast is using them).
- js/audio/sfx.js: 19 new procedural SFX with game's names: doorbell knock(existing) yip bark yap pant whine whimper sniff
  squeak(existing) whistle tvthud carpet splash thwip brawl aww poof drawer. LEVEL trims measured offline
  (tools/media/sfx_measure.html + cdp_eval.mjs → scratch/sfx_measure.json), all ≈ −17 dB RMS except whistle (faint joke).
- js/audio/audio.js: SAMPLES layer (sfx.js `SAMPLES[name] = {files:[...], gain, jitter}` → audio/sfx/<f>.mp3, random
  variant, procedural fallback until decoded), `audio.sfxLoop(name,{vol,rate,pos}) → stop(fade)`, `audio.preloadSfx()`
  (called on unlock). sfxNames includes sample-only names.
- tools/media: vo_lines.py parses odie `sfx:` lines; gen_vo.py skips TTS for them and maps manifest file →
  audio/sfx/<clip>.mp3 (ODIE_CLIP); design3.py (Lyman/delivery auditions); gen_dog.py (LTX audio-track dog sounds);
  gen_music.py + arena, sneak2.

- ALL refs done + refs/README.md "Wave 3" table; cast + world matched them (disco shirt added in-game; delivery navy).
- Voices saved (voices.json): lyman = "Hungry Heist · Lyman" 174b6b2ab49a4b0b8e3ca4b7d37af3e0 (design v0 seed 7 of
  design3.py; F0 ~140–250 dramatic, timbre distance to Jon 1.1–1.5 / Garfield 0.9–1.0 vs ~0.5 within a speaker —
  tools/media/timbre.py); delivery = "Hungry Heist · Delivery" 538b211797494cb9a76c6ef968e8ca8a (v1 seed 7).

- VO: 799 manifest keys (785 voiced + 14 odie dog-noise keys). Wave 3 added ~400: game's Ch2/FP1/arena lines, fp2's 83
  fp2_* lines, plus media EXTRAS (50 more bark-family lines) and 18 new _nn name-free takes (vo_lines.py "Wave 3").
  QC pass 1: 6 bad takes re-rolled with SEED=101 (c2_l05_hint_1, d_l5_sign, c2_l_l3_disco, fp1_j_recover_2,
  c2_j_l6_coffee, c2_j_l3_dab). False positives: Jon→John, Lawsey→lausie, moustache→mustache.

## IN PROGRESS
- QC pass 2 (qc_vo.py) on the rest; then LTX dog-sound test, then arena music.

## NEXT
1. Lyman + delivery voices (design3.py → save via POST :7876/api/voices {preserve_voice:true}) → voices.json keys
   'lyman', 'delivery'. Then `python3 gen_vo.py` (new lines only) + qc_vo.py.
2. Dog sounds: small LTX test (bark only) — keep only if clearly better than procedural (manager caution).
3. arena music (ACE-Step).

## REQUESTS
- none
