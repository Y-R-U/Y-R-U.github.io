# KITEHAWK — voice audition · the local Kokoro pipeline, proven

Written 2026-08-24 by agent F. Owns `docs/vo_audition/` and this file. Nothing else was touched.

**The pipeline works end to end.** Fifteen clips, one per speaking part, generated from real
scripted lines in `STORY.md`, in **18 seconds wall clock** on the first attempt. No GPU contention,
no OOM, no retry. Every clip was then measured and transcribed independently of the tool that made
it, and all fifteen passed.

Open `docs/vo_audition/` and play the mp3s in filename order. Filenames are
`<who>_<voice>_<speed>.mp3`, so the assignment being auditioned is legible without this document.

---

## 1. The command that works

`SUNO.md` §3.1's endpoint correction is **confirmed and important**: `192.168.0.236:8808` is
Abogen's *web* UI, htmx against `/wizard/upload`, with **no HTTP TTS API on it**. Do not build
against it. The working path is Abogen's own interpreter, driven locally:

```sh
cd gms/2d/kitehawk/docs/vo_audition
python3 gen_audition.py            # ← this is the whole thing
```

which does exactly one interesting thing:

```sh
/Users/aaronair/.local/share/uv/tools/abogen/bin/python  kokoro_say.py  jobs.json
```

`jobs.json` is a list of `{voice, speed, text, out}`. `kokoro_say.py` is **NEONHAUL's file, copied
verbatim** from `gms/3d/neonhaul/tools/vo/kokoro_say.py` — the one that made its 207 clips. It was
not modified and it should not be forked; when KITEHAWK builds `tools/vo/`, take it from NEONHAUL
again rather than from here.

**Batching is not an optimisation, it is the design.** `KPipeline` loads an 82 M model and a
phonemiser once; measured here that is ~6 s of the 18 s run, and each of the fifteen lines then
costs ~0.8 s. A process per clip would have spent 90 s of a 100 s run loading the same weights
fifteen times, and at the real script's scale (fourteen parts plus ~100 pooled barks) it is the
difference between two minutes and half an hour. **Collect every line the build needs, hand them
over once.**

Two details that will bite the next agent:

- **`lang_code` is the first letter of the voice name.** `b*` = GB English, `a*` = US English.
  `kokoro_say.py` caches one pipeline per letter, so a jobs list that mixes British and American
  voices pays the ~6 s load **twice**. Sort jobs by voice prefix if you ever care.
- **Kokoro writes 24 kHz wav.** The mp3 conversion is a separate `ffmpeg` step
  (`-codec:a libmp3lame -b:a 128k -ar 24000`). Everything downstream — radio treatment, the −16 LUFS
  shelf, the −1.5 dBTP ceiling — happens on the wav, not the mp3. These audition mp3s are **dry**:
  no radio chain, no loudness normalisation, no room. That is deliberate — an audition judges the
  voice, and running `SUNO.md` §3.1's `own`/`air`/`ground` band-limit over it would hide exactly the
  thing Aaron is being asked to listen for.

### Verification

```sh
/Users/aaronair/cc/yru/site/gms/3d/neonhaul/tools/vo/vw/bin/python verify.py
```

Duration + EBU R128 integrated loudness + true peak per file, then `mlx-community/whisper-small.en-mlx`
transcribes each clip and scores the word sequence against the scripted line. Takes ~40 s.

**Why a transcript and not just a level check.** A 0-byte mp3 that exists is this repo's classic
failure, and loudness alone catches it — but loudness cannot tell you the phonemiser dropped a word
or said the wrong one. `kokoro_say.py` already refuses to write anything under −60 dBFS RMS or
0.20 s, which is the first gate; `verify.py` re-measures **the mp3 rather than the wav**, so the
ffmpeg stage is inside the test rather than trusted. Read the whisper score as a **ranking**, never
a pass mark — see §4.

`wav/` is deleted after each run. It is 6.5 MB of regenerable intermediate and should not go in git;
re-running `gen_audition.py` rebuilds it in 18 s.

---

## 2. What was generated

One line each, all fifteen assigned parts. Katrin Sohl correctly has nothing — `SUNO.md` says she
has no voice by design, and that was honoured. Lines are the real scripted ones with their
`STORY.md` ids, chosen to be the line that most shows the character rather than the longest.

| file | character | line | sec | LUFS | peak dBFS | heard |
|---|---|---|---|---|---|---|
| `hurdy_bf_alice_1.02.mp3` | Marla Hurdle | *Lamps are lit. I lit them myself. Twice.* | 3.20 | −23.3 | −5.3 | ✓ |
| `nell_bf_emma_0.98.mp3` | Nell Corrigan | *I used to bring the post in over this hedge.* | 3.03 | −23.3 | −7.6 | ✓ |
| `nell_m_bm_daniel_0.98.mp3` | Nils Corrigan | *(same line, male alternate)* | 3.03 | −24.5 | −8.8 | ✓ |
| `roo_bm_lewis_0.92.mp3` | Ruthven Halke | *Good. Now do that when it is not a nice day.* | 3.58 | −26.4 | −3.7 | ✓ |
| `ferry_bm_fable_0.88.mp3` | Tobin Ferris | *Anything you catch, I can bolt to it. That's the arrangement.* | 4.55 | −24.4 | −4.8 | ✓ |
| `aurie_bf_lily_1.06.mp3` | Aurie Petch | *There's sun up here. Nell. There's sun.* | 2.62 | −24.3 | −7.4 | ✓ |
| `odile_bf_isabella_0.96.mp3` | Odile Sarn | *Twelve crates. Quarter end. After this the Line stops and everyone goes home hungry.* | 5.97 | −21.3 | −5.3 | ✓ |
| `baumgart_am_onyx_0.86.mp3` | Wilhelm Baumgart | *Well flown. I'll take the low road home.* | 3.65 | −25.1 | −8.7 | ✓ |
| `grelle_am_eric_0.92.mp3` | Sabin Grelle | *I am paid whether you live or not.* | 2.77 | −24.6 | −8.3 | ✓ |
| `ferber_y_am_liam_1.02.mp3` | Yannik Ferber | *Take the low one. Take the low one now.* | 2.77 | −24.6 | −8.2 | ✓ |
| `ferber_o_am_fenrir_0.98.mp3` | Ott Ferber | *I am high. I'm always high.* | 2.10 | −22.6 | −3.8 | ✓ |
| `board_am_echo_0.92.mp3` | Verrine Air Board | *The Patience is a legitimate object. This determination has been made.* | 5.45 | −26.0 | −8.2 | ✓ |
| `bulletin_af_alloy_1.00.mp3` | Concord Bulletin | *Concord Line, Patience. We carry no arms.* | 3.77 | −24.7 | −7.6 | ⚠ §4 |
| `countess_af_nova_1.06.mp3` | Ilsabet Kohl-Marren | *That was a pretty turn. It cost you nine hundred feet, but it was pretty.* | 4.33 | −30.0 | −9.8 | ✓ |
| `drach_am_adam_0.90.mp3` | Anselm Drach | *I have cut four hundred canopies. I have never once opened one.* | 4.75 | −21.6 | −4.4 | ✓ |

**Nothing came out wrong.** No zero-byte file, no silent file, no truncation, no clipping. Loudness
runs −30.0 to −21.3 LUFS (silence measures below −70); peaks run −9.8 to −3.7 dBFS so nothing is
near the rail before the ceiling stage even exists. All fifteen wav hashes are distinct, which is
worth stating because `nell` and `nell_m` and again `grelle` and `ferber_y` produced
**byte-identical mp3 sizes** — that is 128 kbps CBR over an identical duration, not a duplicated
file, and I checked rather than assumed.

Line-length note for whoever wires the cards: `odile` at 5.97 s and `board` at 5.45 s are the two
longest, and both are `brief` ctx where the player is stopped. Every `radio` clip came in under
4.8 s, comfortably inside `STORY.md` §5.3's timing.

---

## 3. What I verified, and what I did not

**Verified, mechanically:** that the pipeline runs; that fifteen distinct non-silent files of
plausible duration exist; that their level and peak are sane; and — via whisper — that the words
that came out are the words in the script.

**Not verified, and not verifiable this way: whether any of these voices is right.** I cannot hear
timbre, warmth, age, or whether `am_onyx` sounds like a courteous old man rather than a narrator.
This repo has been burned by exactly this before: a whisper score of 90.7 % was awarded to speech
Aaron described as *"a computer voice from the 90s"*, because whisper measures whether a word is
**recognisable** and nothing in that number can see prosody. **Every judgement in §4 that is about
sound is a hypothesis for Aaron's ear, not a finding.** The only judgements below I will stand
behind are the two measured ones and the one that is a documentation contradiction.

---

## 4. Flags — measured first, then guesses

### 4.1 MEASURED · the speed dial is not doing what the table implies

I re-ran all fifteen voices on **one identical control sentence** (18 words, *"The crate is coming
down through the cloud deck and we are still four hundred metres under it."*) at their assigned
speeds, so that rate is the only variable. Per-character wpm in §2 is confounded by line content and
should not be compared; this can be.

| | voice | speed | control sec | wpm |
|---|---|---|---|---|
| fastest | `ferber_y` am_liam | 1.02 | 5.15 | 209.7 |
| | `countess` af_nova | 1.06 | 5.22 | 206.7 |
| | `aurie` bf_lily | 1.06 | 5.25 | 205.7 |
| | **`grelle` am_eric** | **0.92** | **5.38** | **200.9** |
| | `nell_m` bm_daniel | 0.98 | 5.45 | 198.2 |
| | `hurdy` bf_alice | 1.02 | 5.50 | 196.4 |
| | `nell` bf_emma | 0.98 | 5.58 | 193.7 |
| | `odile` bf_isabella | 0.96 | 5.60 | 192.9 |
| | `bulletin` af_alloy | 1.00 | 5.70 | 189.5 |
| | `ferber_o` am_fenrir | 0.98 | 5.72 | 188.6 |
| | **`drach` am_adam** | **0.90** | **5.88** | **183.8** |
| | `ferry` bm_fable | 0.88 | 5.95 | 181.5 |
| | `board` am_echo | 0.92 | 5.97 | 180.8 |
| | `baumgart` am_onyx | 0.86 | 6.20 | 174.2 |
| slowest | `roo` bm_lewis | 0.92 | 6.25 | 172.8 |

**Each voice has its own base rate, and it dominates the dial.** The whole cast fits in 172.8–209.7
wpm — a 21 % spread — while the `speed` column spans 0.86–1.06, a 23 % nominal range. The two do
not line up:

- **`grelle` at 0.92 is the 4th *fastest* voice in the game**, ahead of Nell at 0.98 and Hurdy at
  1.02. `am_eric` is intrinsically quick. The Bailiff's direction is *"flat, professional,
  contractual… not a boast, a schedule"* and 201 wpm is brisk for a man reading you a contract.
  Suggest **0.86–0.88** if the intent was measured.
- **`drach` at 0.90 lands mid-pack at 183.8 wpm**, not slow. He is written *unhurried* and the
  fallback is meant to at least be patient. Suggest **0.84**. This only matters if the SUNO take
  never happens — but the fallback is the shipping default until it does.
- **`hurdy` is the most-heard voice in the game and reads as only the 6th fastest** despite the
  highest-but-one speed. If "dry, quick, three jobs behind" should be audible against Aurie's
  brightness, the gap is currently 9 wpm — under 5 %, which I would not expect to register as a
  character trait. Either push Hurdy to ~1.08 or accept that the distinction is timbre, not rate.

**What the table gets right:** Yannik (209.7) vs Ott (188.6) is a 21 wpm gap that will read as
*"young and frightened"* against *"slower, and the one who breaks"* — that assignment is doing real
work. Ferry, Baumgart and Roo occupy the bottom three slots exactly as intended. And Nell/Nils at
193.7 vs 198.2 are close enough that the male alternate will not change any card's timing, which is
the right property for a one-field save swap.

### 4.2 MEASURED · `am_echo` gives the **Verrine** Air Board an American accent

`SUNO.md` §3.1 states the rule three paragraphs above its own table: *"Accent carries nationality,
for free. The British Kokoro voices are Verrine; the American ones are Kohlgard and the Concord
Line."* Every Verrine character honours it — Hurdy, Nell, Roo, Ferry, Aurie and Odile are all `b*`
voices. **`board` is `am_echo`, an American voice, and `STORY.md` calls it the *Verrine* Air Board**
— the player's own high command, the people issuing the order to shoot canopies over Verrine towns
in Act 4. One `a`/`b` character.

This is not a taste call, it is the document contradicting itself, and it is load-bearing: Act 4's
whole turn is *our own side gave this order*. An American Air Board tells the player, for free and
wrongly, that the order came from the enemy. **Suggest `bm_george` or `bm_lewis`** (a second `bm_*`
on the Air Board is fine — it is a staff voice with no colour, and Roo never shares a scene with it).
Agent D owns `SUNO.md`; this is a REQUEST to the manager, not an edit.

**The British bench is four and four, and it is nearly full.** Kokoro-82M ships exactly four GB
female voices — `bf_alice` `bf_emma` `bf_isabella` `bf_lily`, **all four already assigned** — and
four GB male: `bm_daniel` `bm_fable` `bm_lewis` assigned, **`bm_george` the only one left**. So:
moving the Air Board to `bm_george` spends the last British slot, and there is **no British female
voice available at all** for a recast or a new Verrine woman. Any further British part has to
double up an existing voice at a different speed. That is a real constraint on the script and the
manager should know it before agent D writes anyone else. (Verified against the model's own voice
pack, not from memory.)

A milder, related one I would **not** change: Roo is Kohlgard-born (`STORY.md` §3.2) and voiced
British. Twenty years flying for Verre makes that defensible, and it is probably deliberate.

### 4.3 MEASURED · the Countess is 8.7 LU quieter than the loudest clip

`af_nova` rendered at **−30.0 LUFS**, the quietest of the fifteen by 3.6 LU and 8.7 below Odile.
The −16 LUFS shelf will therefore apply ~14 dB of gain to her clips, the most any character needs,
and gain that size lifts whatever noise floor Kokoro leaves under her. Not a defect — flagging it so
the loudness stage is checked on **her** clips specifically rather than on a mid-pack one.

### 4.4 MEASURED · "Concord" does not survive being said

`bulletin` scored 0.71 against its script, the lowest of the fifteen — whisper heard *"Conquered
line patients, we carry no arms."* The other sub-1.0 scores are whisper writing digits (*"12
crates"*, *"900 feet"*, *"400 canopies"*) and are noise; this one is not. **"Concord Line" →
"Conquered line" and "Patience" → "patients"** is a real confusion, and it is the one voice
deliberately delivered flat, on a radio, in the mode where a human listener has fewest prosodic
cues. A player hearing *"Conquered Line"* mishears the antagonist's name.

Whisper is not a human and is itself degraded, so treat this as **the one clip most worth playing
twice**. If it is genuinely unclear, the fix is a beat of separation — `SUNO.md` §3.4's array-of-cards
trick — not a speed change. It is also an argument for the `bulletin` clips getting a light touch on
the band-limit, since the radio chain will make this worse and not better.

### 4.5 GUESS, for the ear only

I cannot hear these. In descending order of how much I would want Aaron to check:

1. **`drach` / `am_adam`.** `SUNO.md` is already clear that Kokoro has no dial marked menace, and
   this clip is the evidence for or against generating the SUNO take. Listen specifically to *"I
   have never once opened one."* — the doc names it as the line that fixes the character. If the
   fallback reads as merely polite, that confirms §3.2 and the SUNO take is worth the effort.
2. **`baumgart` / `am_onyx` at 0.86.** The slowest speed in the cast on a voice already described as
   deep. The risk is not that he sounds wrong — it is that *courteous, unhurried, genuinely warm*
   comes out as *sinister*, which would invert the one enemy the player is supposed to like.
3. **`countess` / `af_nova`.** `SUNO.md` §3.3 asks for *"English aristocrat, mid forties"* in the
   SUNO block while assigning an **American** voice as the Kokoro fallback. One of those two is
   wrong. If she is Kohlgard (her name, Kohl-Marren, says she is), the SUNO style block should say
   so; if she is meant to sound English there is **nowhere to put her** — see the note below.
4. **`ferber_o` / `am_fenrir` vs `ferber_y` / `am_liam`.** They are brothers and must sound related.
   Two unrelated voice models is the standard way to lose that. Play them back to back.
5. **`nell` / `bf_emma` against `hurdy` / `bf_alice`.** Two British female voices, adjacent speeds,
   and Hurdy is the most-heard voice in the game while Nell is the player. If they blur, the radio
   is confusing in exactly the moments it matters.

---

## 5. Files

```
docs/vo_audition/
  <who>_<voice>_<speed>.mp3   15 clips, dry, 24 kHz, 128 kbps         ← play these
  audition.json               the cast: who, character, voice, speed, STORY id, line
  gen_audition.py             builds jobs.json, runs kokoro_say.py, makes the mp3s
  kokoro_say.py               NEONHAUL's, verbatim, unmodified
  verify.py                   duration + R128 + whisper transcript, measured on the mp3
  audition_result.json        what kokoro_say reported per line
  verify.json                 what the mp3s actually measure, plus every transcript
  control_result.json         the §4.1 same-sentence rate test
```

No game code was written. `SUNO.md` and `STORY.md` were read and **not modified**; §4.1, §4.2 and
§4.3 are REQUESTs for the manager to reconcile with agent D.
