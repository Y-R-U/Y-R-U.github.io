# VOICES: lane notes

Owner: VOICE lane. Files: `audio/voices/**`, `tools/voice/**`, this doc.
Audition page: `http://localhost:8888/gms/3d/krayzee/tools/voice/audition.html`

## What exists

| path | what |
|---|---|
| `audio/voices/manifest.json` | per voice: `voiceId` (Qwen Voice Studio saved clone), `design`, `seed`, `pick`, `audition` (the reference transcript), `clone` (exact settings), every scored candidate, `sample`, `quality`, `note` |
| `audio/voices/<id>/sample.mp3` | voice-picker sample, ≤ 4 s, mono 24 kHz 64 kbps, about −16 LUFS, −1.5 dBTP. Clean, with no radio effect (the radio filter is added at runtime) |
| `audio/voices/<id>/design_<tag>.mp3` | the two best design takes (the saved one and one alternate), 48 kbps, for auditioning |
| `audio/voices/barks.json` | `{voice: {barkId: {file, duration, text, intent, maxSeconds, callsign?, rwy?, tier?, say?, subtitle?, airport?, wer, asr, flags?}}}`. `file` is relative to `audio/voices/` |
| `audio/voices/<voice>/<barkId>.mp3` | rendered barks, all 816 script lines |
| `tools/voice/roster.json` | the 18 design descriptions, audition lines, fallback sample lines and expected pitch ranges |
| `tools/voice/design_voices.py` | `design` / `sample` / `promote` / `repost` / `report` |
| `tools/voice/gen_barks.py` | phase-2 bark renderer |
| `tools/voice/vocommon.py` | TTS client (serial, waits for a free GPU), Whisper ASR, WER, YIN pitch, loudness, encode |
| `tools/voice/design_log.json` | every design run, including rejected ones |

Python: `~/.cache/krayzee-asr/bin/python` (uv venv: faster-whisper + numpy, CPU only; Whisper `small.en` and `small` are
cached in `~/.cache/huggingface`). Scratch WAVs: `~/.cache/krayzee-voice/` (outside the repo, disposable). TTS endpoint:
`KRAYZEE_TTS` env var, default `http://192.168.0.236:7876`.

## Process

1. **Design.** Each voice gets 3 seeds (11/23/37) of Qwen *design mode* on a 7–12 s in-character radio line. Accent
   voices get 3 more takes on a phonetically spelled line (see comte/baronin).
2. **Score without listening.** Each take is scored on: Whisper small.en WER against the line (catches garbled,
   truncated or ad-libbed takes); YIN median pitch inside a per-character range (catches the falsetto failure below);
   pitch spread (a small reward for expressive delivery); duration within 3–30 s (the clone-reference limit); and
   integrated loudness (catches silent takes). A take is only saved if it passes WER ≤ 0.2 and lands in its pitch range.
3. **Save.** The best take is saved with `POST /api/voices {job_id, preserve_voice:true}` as `Krayzee · <id>`. Its
   waveform and transcript become the clone reference, so every later line keeps that exact voice.
4. **Sample.** The picker line from DESIGN's `data/voices.json` (`sample`) is rendered with the clone (up to 3 seeds,
   stopping at the first clean one). It is trimmed, normalised and encoded. If a take runs over 4 s it is sped up with
   pitch-preserving atempo (≤ 1.25×). None needed it: all 18 samples are 1.8–3.7 s.

### Lessons (these cost a full re-run)

- **Energy words push Qwen into falsetto.** "loud", "braying", "booming", "jolly", "laughing", "breathless",
  "twinkly", "panicky", "loud-mouthed" all produced 230–370 Hz takes for characters who should sit at 100–150 Hz
  (toff, wingco, tex, prince, charmer, trainee, sheila, heiress). The fix that worked every time was to describe the
  *instrument* and leave the energy out: "a deep, low-pitched … ordinary adult male speaking voice at normal volume",
  then let the line's text carry the attitude. (This matches the Idle Western 2 finding.) DESIGN's `ttsDesign` strings
  in `data/voices.json` contain several of these words, for example toff's "loud … braying … fast and bouncy". That is
  why the roster uses its own descriptions.
- **Plain autocorrelation pitch octave-jumps.** It is now YIN.
- **`loudnorm` leaves peaky takes 4–7 LU quiet,** because it backs off to honour the true-peak ceiling. Now gain plus
  a −1.5 dBTP limiter is iterated to −16 ± 0.6 LUFS. Every sample measures −16.4 to −17.1 LUFS.
- **Foreign accents.** A plain "thick French/German accent" description gave takes Whisper transcribed perfectly, and
  Whisper's language-ID put P(fr)/P(de) ≤ 0.003 on every take. Setting the TTS `language` to French/German on English
  text made no measurable difference. That probe is uncalibrated, so it cannot prove the accent is absent, but it found
  nothing. What does change the sound is **spelling**: the saved comte/baronin voices come from lines like "Zis is ze
  Comte … I will land on eet". Whisper heard "Caesar's Comte" and "eat", so the reference audio really contains those
  sounds. A clone reproduces its reference's accent only partly, so **DESIGN should spell comte/baronin lines lightly
  phonetically** (zis/ze/eet; ze/haff/vill/runvay) for the accent to survive.

## Per-voice notes

Pitch is the YIN median of the saved design take. **2026-10-22: Aaron auditioned all 18 voices and approved every one,
including those flagged weak below.** The quality column is the pre-audition machine guess and is kept only as
history; no voice is to be redesigned.

| id | pre-audition guess | pitch | notes |
|---|---|---|---|
| toff | strong | 105 Hz | RP posh is Qwen's home ground. The first design went falsetto; this is the rewrite. |
| duchess | strong | 182 Hz | Cut-glass RP. All takes clean. |
| bubba | ok | 118 Hz | Southern drawl, strength unverified. WER flags are dialect spellings only. |
| darlene | ok | 246 Hz | Top of her range; 2 of 3 takes were shrill. Listen for screech. |
| wingco | ok | 144 Hz | Second design. Clipped 1940s RP should suit Qwen. |
| geezer | **weak?** | 170 Hz | Cockney unverified. Qwen tends to soften regional British towards generic London/RP. |
| sheila | ok | 222 Hz | Aussie unverified. Second design (the first was 350–370 Hz). |
| laird | **weak?** | 77 Hz | Lovely low gravel, but Whisper heard "heid" as "hide", so the Scots spellings were read as English. Accent probably mild. |
| heiress | **weak?** | 258 Hz | Every take ran high despite "low-pitched, vocal fry". Picked the lowest. Risks shrill rather than bored. |
| comte | **weak** | 115 Hz | Saved from the phonetic take (accent audible to ASR). Plain-spelled lines will sound only mildly French. The sample said "I'm" for "I am". |
| baronin | **weak?** | 211 Hz | Saved from the phonetic take ("Eins. Zwei." landed). Plain lines will be mild. The sample came out at 258 Hz, not low. |
| tex | ok | 120 Hz | Second design (the first was 235–350 Hz). |
| nan | ok | 232 Hz | Sweet elderly delivery is clean. The Yorkshire accent is probably generic northern. |
| prince | ok | 156 Hz | Second design. The stammer survives in the clone. |
| charmer | ok | 106 Hz | Second design. Irish is usually one of Qwen's better accents. |
| tower_m | strong | 115 Hz | Clear on runway numbers and "Crazy Tower" (now "See Tower One", D14). Splice cuts tested. |
| tower_f | strong | 208 Hz | Icy, clear. All takes clean. |
| tower_trainee | ok | 152 Hz | Panic now comes from the text. The picked sample says "go round" (flagged); the other take was 296 Hz. |

To swap in an alternate: audition, then `design_voices.py promote <id> <tag>` followed by
`design_voices.py sample <id>`. Re-render that voice's barks with `gen_barks.py --voice <id>`; resume detects the
new `voiceId`.

## Bark generation (phase 2)

```sh
cd tools/voice
PY=~/.cache/krayzee-asr/bin/python
$PY gen_barks.py --dry-run                       # what would render
$PY gen_barks.py --voice tower_m,tower_f          # a subset; resumable, rerun freely
$PY gen_barks.py                                  # everything (816 lines)
$PY gen_barks.py --only toff.greeting.1 --redo    # force one line
```

- **Sentences:** up to 4 seeds. A take is accepted at the first one with WER ≤ 0.25 that fits `maxSeconds`;
  otherwise the best take is sped up (≤ 1.25×) and flagged `long`/`wer` in barks.json. "Krayzee" is sent to TTS as
  "Crazy", and a lowercase first letter (the callsign-`pre` lines) is capitalised.
- **Splices** (`splice_title`, `splice_digit`): the clone mangles or drops one-word text. So the words are read as
  short lists of ≤ 6 ("Zero, one, two, three, four, five, and so on."). That gives level, non-final intonation, which
  suits splicing. Each word is cut at its Whisper word timestamps, snapped to the quietest point of the pause, then
  re-transcribed on its own. The chunk is retried on another seed if any cut fails. A 23-word single read ran the words
  together, which is why the lists are chunked.
- **Status (2026-10-22): complete.** All 816 script ids are in barks.json with an mp3 on disk (0 missing, 0 stale,
  0 extra). 68 takes carry a flag: 39 `wer`, 29 `long`, 3 `listen` (some carry two). Nearly all `wer` flags are Whisper
  mishearing dialect or phonetic spellings ("Landon" for "Landin'", "eat" for comte's "eet", "take off" for
  "takeoff"), which is the accent working. `long` overruns are all ≤ 0.6 s past `maxSeconds` after the 1.25× cap.
  Worth an ear: `tower_*.cs_title_marchioness` (all three tower voices), `tower_f.cs_title_queen` (heard as "Queen
  and..."; the cut may carry a breath of "and"), `tower_m.rwy_09` ("0-9-er"), `baronin.queue_jump.2` ("vape").
  Four broken splice cuts were re-rendered with `--redo` (trainee "Earl" was a 0.23 s fragment; "Four" ×2 and tower_f
  "Countess" had bled cuts); all four now re-transcribe correctly.
- **D14 welcome lines.** The six `tower_*.welcome.1/2` lines say "See Tower One" (`say`) with `text`/`subtitle`
  "C-Tower 1". `AIRPORTS` in build_script.py lists airport numbers; airport n > 1 adds `<voice>.welcome_a<n>.<i>` with
  `airport: n`. Add the number, rebuild the script, then run gen_barks.py; only the new ids render.
- **Subtitles.** `text` is always the normal spelling and is what RADIO shows (js/radio/lines.js reads `text`; it
  never reads `subtitle`, which is fine because `subtitle == text` whenever present). `say` is the TTS spelling.
  barks.json carries `say`, `subtitle` and `airport` from the script.
- **Size:** 870 mp3s, `audio/voices/` totals 15 MB (barks 11.3 MB at 48 kbps mono). Under the 25 MB budget, so no
  re-encode was needed.
- **Playback check:** tools/radio.html over CDP (port 9471), every bench event fired: 48 clip requests, all 200, no
  console errors apart from the server's missing favicon.
- **Cost:** one take is about 8.4 s wall on average (4.6–16.6 s). That is mostly the per-job model load, since the
  studio spawns a fresh worker each time, so short lines cost nearly as much as long ones. Splice lists need about
  4 takes per 6 words. Estimate for the full script: 717 sentences × ~1.4 takes × ~9 s ≈ **2.5 h**, plus splices for
  3 tower voices ≈ 30 min. Never run two at once: the studio returns 409, and the scripts wait for a free GPU (Flux,
  LTX, mlxcel or another TTS job).

## Housekeeping

- Voice Studio has no delete endpoint. Superseded `Krayzee · toff/comte/baronin` entries remain on its shelf; their
  ids are listed under `_superseded` in manifest.json. The manifest is the source of truth.
- Audio total is 15 MB: samples 444 KB, design takes 2.1 MB, barks 11.3 MB.

## New towers (VOICE2, 2026-10-28)

| voice key | who | voice | lines | clips |
|---|---|---|---|---|
| `tower_farm` | Farmer Mudge, C-Tower 2 (Muckle Bottom) | new design, saved as `Krayzee · tower_farm` | `data/airports/farm-lines.js` (65) | 65 lines + 33 own title/digit splices |
| `tower_raf` | Sqn Ldr Imogen Frost, C-Tower 4 (RAF Much Snoring) | **tower_f's saved clone** (manifest `aliasOf`) | `data/airports/airbase-lines.js` (72) | 70 lines + 35 splices copied from tower_f |
| `tower_m/f/trainee` | `scold_nudge` (V1 D2), 4 tiers each | existing | `build_script.py` → script.json | 12 |

- **Why the map towers are not in script.json.** The radio loads them from the airport def (`def.towerLines`, see
  js/core/wiring.js `setTower`). Putting them in script.json as well would load each line twice and double the
  variants. `data/barks/build_towers2.py` turns the two JS line files into `data/barks/towers2.json`, a render-only
  script, adds the farm's splice ids, and copies tower_f's splice clips under `tower_raf` ids:
  ```sh
  python3 data/barks/build_towers2.py
  cd tools/voice && ~/.cache/krayzee-asr/bin/python gen_barks.py --script ../../data/barks/towers2.json
  node data/barks/check_towers.mjs --audio      # gate: every line + splice resolves, loudness/silence/duration
  ```
- **Mudge's design.** "A grumpy old English farmer in his sixties from rural Somerset … burring rolled r's … 'oi' for
  'I'. A low, rough, weathered baritone, an ordinary adult male speaking voice at normal volume, dry, grudging …
  slow". Energy words left out (the falsetto lesson). Six takes: three plain, three on a lightly phonetic audition
  ("This be Mudge … not on moi cows. Oi've a field to cut … dawdlin'"). Saved: `ph23`, 104 Hz, WER 0.10; Whisper
  heard "more cows" / "Or have", so the burr is in the reference. Lines get a light `say` spelling (I → Oi, my → moi;
  build_towers2.py `WEST`); subtitles keep the plain text. His `maxSeconds` assumes ~2.6 words/s, capped at 6 s.
- **Why C-Tower 4 reuses Imogen's voice.** The airbase controller is already written as "Squadron Leader Imogen"
  (airbase.js `controllers: ['imogen']`, kingdom.js LOOKS). A new voice would make one character sound like two
  people. So `tower_raf` is the same clone with its own clipped military script (dispersal, the Air Marshal,
  "filing this in TRIPLICATE"). A separate voice key keeps those lines out of C-Tower 1, where tower_f also works.
  If Aaron wants a different person at the airbase, design a new voice under `tower_raf` and re-render; the lines
  and wiring stay.
- **scold_nudge** is rendered but dormant: `data/rules.js` `light_touch.scold` still says `scold_bump`. Switching it
  to `scold_nudge` is one word for the rules owner; every tower (including farm and RAF) has the set.
- **Status (2026-10-29): complete.** 98 tower_farm clips + sample, 70 tower_raf lines (+35 copied splices), 12
  scold_nudge. `check_towers.mjs --audio` GREEN: 217/217 resolve, lines −18.8 to −16.1 LUFS, no internal silence over
  1 s, no runaway; falsified by moving one clip away (RED, 1 failure). Mudge's gravel overshot the limiter once
  encoded (up to +0.1 dBTP; the originals top out at −1.2), so `build_towers2.py --fix-peaks` turns any new clip
  above −1.2 dBTP down by the excess (13 passes; those few sit nearer −18 LUFS). Retaken: farm digits six/eight
  (0.23 s fragments), two/four, titles countess/archduke/archduchess (the last was missing from the first list read).
  The RAF lines run at Imogen's pace, so 27 of them were sped up 1.04–1.25× to fit `maxSeconds` (3 flagged `long`, all
  ≤ 0.14 s over). Headless: `js/radio/test/tower-audio.mjs` GREEN at the farm (7/7 lines from clips, 8 splice clips
  fetched) and the airbase (5/5, incl. `rwy_27`); `--falsify` (block the voice's mp3s) RED 0/9.
- Render time: the first pass took 2 h 50 min for ~170 takes because five other lanes' headless Chromes had the
  machine at load 290 and swap full (takes went from ~10 s to 5–10 min). On a quiet machine it is ~25 min.

### Mr Fennimore, C-Tower 3 (`tower_butler`, 2026-10-30)
- Design: "An elderly English butler in his seventies with an impeccable, old-fashioned Received Pronunciation accent.
  A low, soft, slightly dry baritone … slow, measured and unflappable, perfectly polite, with very dry understatement."
  Saved `s23`: 96 Hz, WER 0.04, 11.4 s for the 25-word audition (the slowest voice in the cast, as intended).
- 65 lines (data/airports/palace-lines.js) + 33 title/digit splices + sample. build_towers2.py renders him with a
  render-time cap of ~2.4 words/s (the line file says 5 s flat), so no take was sped up. Retaken: countess ("count
  as"), earl ("world"). `cs_title_duke` is short (0.28 s) but clean.
- Headless `tower-audio.mjs --airport=palace` (it boots in the Cub: the 240 m lawn refuses the C172) GREEN 6/6,
  `--falsify` RED 0/6.

### Story lines for missions 5–10 (2026-10-30)
37 lines (12 narrator, 7 Mudge, 6 Imogen, 4 Toby, 2 Gerald, 5 Rupert, 2 Hyacinth) rendered with
`tools/story/narrate.py lines`; `textOnly` dropped from all of them in data/story/lines.js. All at −16.4 to −16.9 LUFS.
The six `wer` flags are Whisper writing numbers ("400", "40 feet") and spellings ("uninviting", "marvelous").
`check_towers.mjs` now also requires every non-textOnly story line to have `audio/story/<id>.mp3` and a narration.json
entry (falsified: moving `m_hover.mp3` away → RED).
- js/story/actors.js copies only *textOnly* tower lines into every tower voice. A voiced line exists in its own voice
  alone, so M8's `t_jumbo` (Toby, said while Gerald holds the tower) would have been dropped. js/radio now borrows
  such a line from the voice that has it and plays it in that voice (RADIO.md "Map towers").
