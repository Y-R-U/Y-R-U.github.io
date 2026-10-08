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

  QC pass 2: g_c2_idle_1 + fp2_j_tv_1 re-rolled (SEED=202). 29 remaining LOW are homophones/hallucinated tails
  (listed in scratch/qc.json). c2_j_l9_morning comes out as a plain "Good morning" (no long drawn-out vowels) → human ear.
- Odie: LTX-2.3 audio track beats procedural decisively (whisper: LTX bark → "Woof! Woof!", procedural bark → "heal,
  heal", procedural yap → "café café"). tools/media/gen_dog.py (256², 8 steps, ~1–4 min/clip), dogcheck.py (envelope
  + ASR), pantcheck.py (breath periodicity + flatness), cut_sfx.py (burst finder + cutter → audio/sfx/*.mp3).
  Cut so far: bark_1..3, yip_1..3, yip_long, yap_1..2, pant_1, pant_loop (3.45 s seamless, 2.9 Hz breaths).

- Odie samples cut: + whine_1-2, whimper_1-2, sniff_1-2; aww_1 = Jon+Lyman TTS "Awww" ×3 layered (scratch/w3/aww_*).
  SAMPLES registered in sfx.js; sfxLoop('pant') uses pant_loop with gapless loopStart/End. Verified samples are used
  (0 oscillators on sfx('bark'), vs 10 for procedural splash).
- Music: arena (arena_2 take, 140 bpm, 7.5→79.46 s = 42 bars, 69.96 s loop) + sneak2 (76.8 s) in audio/music,
  MUSIC table in audio.js. arena_1 rejected (whisper heard a chant). tools/media/tempo.py for bar-aligned loops.
- tools/media/audio_selftest.html (headless, port 9401): all sfx names, every sample + music decodes, sfxLoop,
  odie/lyman VO, _nn swap, 0 missing VO files of 799. PASS.
- Audio total ≈ 29 MB (music 10, vo 19, sfx 0.3).

## NEEDS A HUMAN EAR
- Lyman voice overall (chosen by objective distance from Jon/Garfield; nobody has listened). Delivery voice.
- c2_j_l9_morning / _nn: FIXED (manager follow-up) — hand-picked sung takes, Jon clone at speed 0.7 with tts text
  "Gooooood moooooorrrrning, Gaaarfield!" (seed 21) / "…kiiitty!" (seed 5): 3.66 s / 2.84 s, one 2.79 s / 1.76 s
  continuous sung run, pitch 143–296 Hz (was 1.67 s, 87–148). Manifest has tts_text/speed; gen_text==text so gen_vo
  won't overwrite them. Candidates + tools/media/stretch.py in scratch/w3/morning. Still worth one listen.
- Odie clips: are bark/yip/yap goofy enough? whine/whimper/sniff/pant were chosen by envelope/flatness only.
- aww_1 (3-voice TTS layer), arena + sneak2 music (sneak2 measured ~140 bpm, maybe too brisk for sneaking).

## NEXT
- (if asked) more fp2/game lines: `cd tools/media && python3 gen_vo.py` then qc_vo.py; dog re-rolls via gen_dog.py
  SEEDS=… + dogcheck.py + cut_sfx.py.

## REQUESTS
- none
