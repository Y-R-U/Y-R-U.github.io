# Recipe — finding where each line starts in a Suno voice take

How the Sunderfall intro VO was cut up. Hand this to any session that has a generated
spoken-word take and needs per-line timings out of it.

The job: you have one MP3 containing a character's whole part, and you need
`[offset, length]` for each line so the game can play one line at a time.

---

## The trap

**Silence detection does not work on Suno output.** Suno puts a quiet music bed under
spoken word, so there is never any silence — `ffmpeg silencedetect` finds one gap in a
15-second file with seven lines in it. Energy thresholding does not work either: the bed
sits only ~10dB under the voice and changes level between sections, so any single
threshold either merges phrases or loses them. Both were tried; both failed.

**Whisper's timestamps drift.** Two runs over the same audio put "Hold." at 1.20s and
3.40s. Word-level timings inside a merged segment are the worst offenders, and the bias is
consistently *early* — measured onsets ran 0.2–0.6s after whisper's word starts.

What is reliable: **whisper knows which phrase and in what order.** The envelope does not
drift. So use whisper for identity and rough position, the envelope only for local checks,
and never let either one make a decision alone.

---

## Steps

**1. Transcribe with word timestamps.** No local whisper on this machine by default:

```bash
python3 -m venv vw && ./vw/bin/pip install -q mlx-whisper
```

```python
import mlx_whisper
r = mlx_whisper.transcribe(PATH, path_or_hf_repo='mlx-community/whisper-small.en-mlx',
                           word_timestamps=True, condition_on_previous_text=False)
for s in r['segments']:
    print(f"[{s['start']:6.2f} -> {s['end']:6.2f}] {s['text'].strip()}")
```

`small.en` was enough. Print word-level too and mark every gap > 0.45s — that is where a
new line begins when whisper merges several into one segment.

**2. Sanity-check every line with characters-per-second.** English at a normal pace is
**11–22 cps**. Compute `len(text) / (end - start)` for each line. Anything outside that
range is a mis-located edge, not a short line. This is the single most useful check in the
whole process — it caught every bad boundary.

**3. Confirm anything suspicious against the envelope.** Decode to mono, band-limit to the
voice range, take a 50ms RMS envelope and print it as dB with a bar. Speech stands 10–25dB
above the bed and is obvious by eye:

```python
raw = subprocess.run(['ffmpeg','-v','error','-i',PATH,'-map','0:a','-ac','1','-ar','16000',
                      '-af','highpass=f=250,lowpass=f=3400','-f','s16le','-'],
                     capture_output=True, check=True).stdout
```

Then RMS per window, convert to dB relative to peak, and print `f'{t:4.2f} {d:6.1f} ' + '#'*int((d+45)/1.6)`.
This is what settled "Hold." — an isolated spike at 1.65–1.95s, with bed either side.

**4. Only trim the lead-in where you can prove it.** Rule that worked: take whisper's
window, and replace its start with a measured onset **only if** the onset is >0.3s later
*and* the resulting cps stays ≤24. Otherwise keep whisper. That kept all seven of Rook's
lines (whisper was tight there) and trimmed five of Vayne's (whisper ran early).

**5. Pad, then verify against the script.**

```
clip_start = speech_start - 0.10     # pre-roll so a fade-in cannot clip the first consonant
clip_end   = whisper_end   + 0.15    # tail, whisper's ends are accurate but tight
```

Then check every clip finishes before the next line is due:
`beat[i].t + length[i] < beat[i+1].t`, with at least ~0.25s to spare for the fade.

**When in doubt, cut wide.** A little bed before the word is inaudible under a fade. A
clipped consonant is instantly audible and sounds broken.

**6. Round-trip every cut.** This is the step that replaces having ears, and it is worth
more than all the envelope work above: cut each clip out with ffmpeg, transcribe *that
clip on its own*, and compare against the line you meant to cut. A clip whose first and
last words come back right cannot be missing a syllable at either end.

```python
subprocess.run(['ffmpeg','-v','error','-y','-i',SRC,'-ss',f'{start:.3f}','-t',f'{length:.3f}',
                '-ar','16000','-ac','1','c.wav'], check=True)
got = mlx_whisper.transcribe('c.wav', path_or_hf_repo=MODEL,
                             condition_on_previous_text=False)['text'].strip()
```

Compare on normalised words — lowercase, strip punctuation — and only assert the **first
word, the last word, and the length within one**. Whisper will hand back "I'm" for "I am"
and "gonna" for "going to", and those are the take telling you the truth: change the game's
text to match the recording, not the other way round.

Do it against the **shipped** file, after trimming and encoding, and it doubles as proof
that neither operation moved the timeline.

A second, cheaper trap this catches: when a line is generated but the model ran out of
room, the round trip returns half of it. That is how `blocked[1]` was found to be a
fragment rather than a line, and left unvoiced.

---

## Encoding

Speech takes heavy compression well — 1.2MB of Suno output went to 253KB with no
meaningful loss:

```bash
ffmpeg -i in.mp3 -map 0:a -ac 1 -ar 32000 -c:a libmp3lame -q:a 8 out.mp3
```

`-map 0:a` matters: Suno embeds cover art, and without it ffmpeg processes the picture
stream and `volumedetect` reports `n_samples: 0`.

**Re-encoding does not shift the timeline** — verified by comparing envelopes of the source
and the encoded file, which were identical. So measure timings on whichever you like.

---

## One take, or many files?

One take, always. Twenty-two barks as twenty-two files is twenty-two requests, twenty-two
decodes, and twenty-two chances for the generator to drift voice between them — Suno's
consistency across a single continuation is the whole reason the barks sound like the same
person as the intro. Ask for the extension to start a few seconds inside the previous take
so the model has its own voice to copy, then simply never play that lead-in.

Trimming that lead-in before shipping is worth it (it was 12% of the file here) — subtract
the trim from every offset, and let step 6 prove the shift was exact.

## Playback

Play the slice rather than pre-cutting the lines into files: one decode per take, and the
fade lengths stay tunable without re-encoding. See `game/js/intro/vo.js` for the cinematic
and `game/js/core/audio/vo.js` for the barks.

- Fade in ~0.10s, out ~0.18s. The bed makes a hard cut click.
- Ask for `len + 0.03` in `start(when, offset, duration)` so the fade-out lands on real
  samples rather than on the silence past a stopped buffer.
- Route voice **past** the music bus, then duck the bus while a line runs — a voice routed
  through the thing being ducked ducks itself.

Verify it headlessly by patching `AudioBufferSourceNode.prototype.start` before page
scripts run and recording `(offset, duration)`: a synthesised score plays whole buffers, so
any call with both arguments is a VO clip. See `tools/` and the votest script in HANDOFF.
