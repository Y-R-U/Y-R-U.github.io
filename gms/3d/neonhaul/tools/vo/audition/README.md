# NEONHAUL — VO audition

A local page for rating voice takes, because a concatenated mp3 is a fine way to *send* audio and a
useless way to collect an opinion about a hundred separate clips.

```bash
python3 tools/vo/audition/build.py      # only if the clips need rebuilding
python3 tools/vo/audition/serve.py      # http://127.0.0.1:8788
```

`serve.py` exists only because `python3 -m http.server` cannot accept the POST. It binds to
127.0.0.1, writes `votes.json` beside itself on every change, and the page also keeps a copy in
localStorage — so a server that is not running loses nothing and **Copy answers** still works.

## What is on it

| section | what it answers |
|---|---|
| What is in the game now | the three shipping player voices, male/female/neutral — the bar |
| Which male voice? | all 11 installed male voices, same four lines, script exactly as it ships |
| Fixing the interruptions | four treatments of the carrier idea, on four voices |

`space` plays, `g` good, `b` bad, `↑ ↓` move. A vote auto-advances and plays the next clip.

## Two things the first attempt got wrong

**Spoken labels.** The first tape announced each voice with macOS `say -v Samantha`. Aaron: *"the
female voice sounds electronic and hard to understand (the one introducing the voices)"* — that was
the formant synthesiser Kokoro replaced, introducing the pool that replaced it. **There is no spoken
labelling here at all.**

**Untreated audio.** The first tape auditioned raw Kokoro output. The game runs every take through
`gen_story.room()` — pitch, compressor, cabin echo, −16 LUFS — and all of that changes how a voice
reads. Every clip here goes through the shipped chain, so what you hear is what would ship.

## Not a score

`build.py` only copies and indexes audio that already exists; it measures nothing. CLAUDE.md's rule
holds: the acceptance test for a voice is a person listening. This project has already been fooled
once by whisper scoring the 1990s `say` pool at 90.7 %, and again during §S2-S by a pitch-range
screen that said the male take moves MORE than the female one (12.8 semitones against 10.1). Both
numbers were real and neither measured the complaint.
