# fixaudio (wave 4) — Odie pitch, "Run Now, Nap Later." VO, music single-track

## DONE
- Measured current Odie samples (tools/media/dogpitch.py, YIN 80–2000 Hz): bark 416–479 Hz, yap_1 959, whimper_1 959,
  whimper_2 519, whine 424/490 (whine_2 = cupboard "muffled" but NOT muffled: centroid 2.1 kHz).

- js/audio/audio.js music race FIXED: strictly single-track (musicToken; every request fades ALL live sources; a load
  that resolves after a newer request is dropped; same-name request while pending is a no-op; unlock() won't double-start
  a pending load); audio.stopMusic(fade); state.liveMusic. Root cause: Ch2 has two chasers → music('chase') twice while
  the buffer was loading → two chase tracks. tools/media/music_race.html (?mod= to test another build) counts live long
  sources independently: OLD build 2/3/5/4/5 leaked tracks, NEW 1/1/1/0/1 PASS.
- VO keys g_runnap_1..3 "Run Now, Nap Later." added to vo_lines.py EXTRAS (fixgame told). Audio pending TTS.
- audio.vo: manifest `files:[…]` → random take per play, never the same twice running (Odie keys).
- sfx.js procedural dog fallbacks lowered (bark 210–250, yap now low barks not yips, whine 460–520, whimper 420–490).
- tools/media/pitchdown.py (WORLD vocoder, time-preserving, optional formant warp). Needs pyworld: scratch venv
  `python3 -m venv pv && pv/bin/pip install pyworld soundfile numpy scipy "setuptools<81"`.

- VO generated: g_runnap_1/2/3 (seeds 7/31/53; 1.64/1.95/1.83 s; whisper score 1.0, F0 ~101–105 Hz) — keys live in
  js/game/lines.js (fixgame). d_l5_bye2 (delivery voice, "Enjoy the telly! Have a lovely evening.", 2.24 s, score 1.0);
  d_l5_bye removed from manifest + audio/vo/d_l5_bye.mp3 deleted (D28).
- Odie regen: 27 LTX clips (gen_dog.py n* prompts, "real medium-sized Labrador"), seeds 11/22/33. Raw LTX dog F0 was still
  ~420–530 Hz, so voiced takes were pitched down with pitchdown.py (WORLD, time-preserving, formant ×0.9) and cut with
  cut_sfx.py (new --lp flag). Per-key mapping lives in gen_vo.py ODIE_FILES → manifest `files` (random take per play).
  BEFORE → AFTER (median F0, Hz; centroid Hz):
    bark 416–479 (c 1.1–1.6k) → 350/350/361 (c ~790)          [whisper still hears "Woof" on all 3]
    yap (happy) 501/959 → 412/306/~340 (c 1.0–1.3k)
    growl_play: was bark_3 (whisper: "Stop. Stop.") → growl_1 356 / growl_2 286
    whine (scared) 424/490 → 345/380/368 (c 0.6–1.1k, was 1.5–2.1k)
    whimper 959/519 → 339/387/380
    whine_muffled (cupboard): was whine_2 490 Hz, centroid 2.1k, NOT muffled → muffled_1/2 339 Hz, low-passed 900 Hz (c ~565)
    pant: centroid 1.6–1.9k → 1.5k, breath rate 2.9 → 3.4–4.3 Hz; pant_loop 3.53 s seamless (len in SAMPLES)
    sniff: new 3 takes (unpitched). shake_off: was the PANT clip → real shake/flap clips shake_1/2
    yip / yip_long: untouched (402–507 Hz) — the son wants those goofy.
  Old samples backed up in tools/media/scratch/fix4/old_sfx/.
- Procedural fallbacks lowered too (only heard before samples decode).
- audio_selftest.html PASS (802 keys, 0 missing files incl. every `files` take, o_whine draws 3 distinct takes,
  liveMusic 1). music_race.html PASS.

## NEEDS A HUMAN EAR
- All new Odie takes (chosen by measured pitch + whisper "woof", nobody has listened). Watch for WORLD-vocoder buzz on
  the pitched-down whines/whimpers, and whether shake_1/2 read as a dog shaking. yap_2/yap_3 whisper heard as speech-ish
  noise (whisper hallucinates on non-speech, but worth a listen). Listen page: tools/audio_test.html.
- g_runnap_1..3 deliveries; d_l5_bye2.

## NEXT
- none unless asked.

## REQUESTS
- none
