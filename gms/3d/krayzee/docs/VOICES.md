# VOICES: lane notes

Owner: VOICE lane. Files: `audio/voices/**`, `tools/voice/**`, this doc.
Audition page: `http://localhost:8888/gms/3d/krayzee/tools/voice/audition.html`

## What exists

| path | what |
|---|---|
| `audio/voices/manifest.json` | per voice: `voiceId` (Qwen Voice Studio saved clone), `design`, `seed`, `pick`, `audition` (the reference transcript), `clone` (exact settings), every scored candidate, `sample`, `quality`, `note` |
| `audio/voices/<id>/sample.mp3` | voice-picker sample, ≤ 4 s, mono 24 kHz 64 kbps, about −16 LUFS, −1.5 dBTP. Clean, with no radio effect (the radio filter is added at runtime) |
| `audio/voices/<id>/design_<tag>.mp3` | the two best design takes (the saved one and one alternate), 48 kbps, for auditioning |
| `audio/voices/barks.json` | `{voice: {barkId: {file, duration, text, intent, maxSeconds, callsign?, rwy?, tier?, wer, asr, flags?}}}`. `file` is relative to `audio/voices/` |
| `audio/voices/<voice>/<barkId>.mp3` | rendered barks. Phase-2 test lines only so far (see below) |
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

Pitch is the YIN median of the saved design take. "Accent unverified" means nothing here can measure it, so Aaron's
audition decides.

| id | quality | pitch | notes |
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
| tower_m | strong | 115 Hz | Clear on runway numbers and "Crazy Tower". Splice cuts tested. |
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
- **Tested so far:** toff.greeting.1/2, tower_m.taxi.1, all 10 tower_m digits (all re-transcribe correctly) and all
  23 tower_m titles. Titles: 21/23 clean. "Marchioness" re-heard alone as "Martian S" (it was fine in the list read).
  "Archduchess" is 1.2 s and "Crown Princess" can exceed DESIGN's 1.0 s `maxSeconds`. Four-syllable titles need
  about 1.2 s.
- **Cost:** one take is about 8.4 s wall on average (4.6–16.6 s). That is mostly the per-job model load, since the
  studio spawns a fresh worker each time, so short lines cost nearly as much as long ones. Splice lists need about
  4 takes per 6 words. Estimate for the full script: 717 sentences × ~1.4 takes × ~9 s ≈ **2.5 h**, plus splices for
  3 tower voices ≈ 30 min. Never run two at once: the studio returns 409, and the scripts wait for a free GPU (Flux,
  LTX, mlxcel or another TTS job).

## Housekeeping

- Voice Studio has no delete endpoint. Superseded `Krayzee · toff/comte/baronin` entries remain on its shelf; their
  ids are listed under `_superseded` in manifest.json. The manifest is the source of truth.
- Audio total right now is about 2.9 MB: samples 444 KB, design takes 2.1 MB, test barks the rest.
