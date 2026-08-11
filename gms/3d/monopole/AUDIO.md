# MONOPOLE — audio briefs

Track 1 is **recorded, timed and wired**. Everything below it is still a brief.

The game has no general audio system — no Web Audio, no mixer, no asset manifest. What it has is
one `Audio` element in `js/ui/verdict.js` that plays one file, and a cold open whose captions read
that file's `currentTime` rather than a timer of their own. Anything else (music beds, stings) is a
system that does not exist yet, not a file that is missing.

---

## Track 1 — "Finding 44-119" (the cold open) — DONE

`assets/audio/verdict.mp3` · **2:17.8** · 758 kB · mono 32 kHz VBR ≈ 44 kbps

Generated in Suno from the brief below, then re-encoded and measured. It plays behind the whole
front of the game: the gate card, the ruling, the hard cut, and the tail fades under the origin
screen.

**What it does that the brief did not ask for, and that the sequence was rebuilt around:** it runs
2:18 rather than 0:49, and it has a **sixteen-second instrumental break** from 104.05 s to 119.8 s
between the sentence and the naming of Tamber Reach. That break is now the best thing in the cold
open — it is where the fleet is thrown away and the Reach is revealed with nothing written over it.
A re-roll that loses the break costs the reveal.

### The beat map

Every caption's second is in `content/verdict.js` as `at`, and `tools/front.mjs --flow=coldopen
--sound` checks each one against the file as it plays. Worst slip measured: **0.10 s**.

| At | Beat | On screen |
|---|---|---|
| 0.0 | seal | Universal Alliance · **Competition Division** |
| 7.6 | docket | Finding 44 · 119 — The Alliance v. the Meridian Combine |
| 16.0 / 19.4 / 22.9 | years / lanes / carrier | Sixty-one years. · Four hundred lanes. · One carrier. |
| 27.0 / 32.2 | method / bought | findings 1 of 3, in two cards |
| 38.3 / 43.4 | wait / dock | findings 2 of 3, in two cards |
| 48.9 / 54.5 | ration / burns | findings 3 of 3, in two cards |
| 64.0 / 73.0 | kalsa / aboard | the Kalsa relay |
| 80.6 | guilty | **GUILTY** — on all forty counts |
| 85.7 / 92.8 / 98.2 | sentence / twelve / ready | order of divestiture, in three cards |
| **104.05** | open | **hard cut.** Fleet gone, Reach revealed, no caption |
| 104.6 / 109.6 / 114.0 | drift / station / rocks | the instrumental, in three moves and no words |
| 119.6 | reach | Tamber Reach was released this year. |
| 123.5 | corvain | Corvain Drayage took seventy-one per cent of it in nine weeks. |
| 131.4 | late | You got here late. |
| 136.4 | — | hand over to the origin screen, audio fades out over 2.2 s |

Two of those rows carry no words at all. `station` and `rocks` exist only to give the camera
somewhere to go during the instrumental — a beat is the unit the camera moves on, so a fifteen-
second stretch with nothing said in it needs beats in it or it is one fifteen-second ease.

### If you re-record it

Every one of those numbers is true of **this file only**. A new take needs re-measuring, and the
method matters because Suno output defeats the obvious approaches:

- **Silence detection cannot work.** There is a music bed under the voice, so there are no gaps —
  `ffmpeg silencedetect` found one gap in the whole track. Energy thresholding alone fails too: the
  bed sits about 10 dB under the voice and changes level between sections.
- **Whisper gets the words right and the clock wrong.** `mlx-whisper` with
  `mlx-community/whisper-small.en-mlx` and `word_timestamps=True` never once mis-ordered a line, but
  its starts run **0.3–0.9 s early** and occasionally 1.5 s out.
- **So: whisper for what and in what order, an RMS envelope for where.** Decode to raw PCM
  (`-ac 1 -ar 16000 -f s16le`), take RMS over 50 ms hops, and read the onset near whisper's guess.
- **Then err early on purpose.** A caption that lands after its line reads as a bug; one that lands
  a third of a second before reads as a record being followed. Whisper's own early starts are used
  as authored, and only `guilty` — a stamp, which has to hit *on* the word — was pushed back to the
  envelope onset.
- **The cps check catches bad boundaries.** English runs 11–22 characters per second. Anything
  outside that band is a wrong boundary rather than a short line.

Compression, which does not move the timeline (verified by cross-correlating the envelopes before
and after — lag 0.00 s):

```
ffmpeg -i in.mp3 -map 0:a -ac 1 -ar 32000 -c:a libmp3lame -q:a 8 out.mp3
```

`-map 0:a` is not optional. Suno embeds cover art, and without it ffmpeg processes the picture
stream and `volumedetect` reports `n_samples: 0`.

### The brief it was generated from

**Suno style prompt:**

```
solemn spoken word, single male voice, dry and unhurried, courtroom recitation,
sparse orchestral underscore, low strings and a single struck piano note,
deep sub drone, no drums until the final third, cold and vast, Blade Runner 2049,
Jóhann Jóhannsson, 70 bpm, no melody in the voice, generous silence between lines
```

**Lyrics (paste verbatim — every line is in the game):**

```
[Spoken Word]
Universal Alliance.
Competition Division.

Finding forty-four, one nineteen.
The Alliance versus the Meridian Combine.

Sixty-one years.
Four hundred lanes.
One carrier.

[Spoken Word]
Findings of fact. One of three.
Meridian never out-carried anyone.
It bought the yards, then the lanes,
then the people who set the tariffs.

Findings of fact. Two of three.
Where it could not buy, it waited.
A rival that cannot dock
does not have to be beaten.

Findings of fact. Three of three.
Coil filament was rationed to hold its price.
Every lamp, every drive coil, every relay beacon
in the outer systems burns filament.

[Spoken Word]
Kalsa relay. The ninth year of the ration.
The Kalsa beacon went dark
and stayed dark for nine days.
Two thousand three hundred people
were aboard the ships that could not see it.

[Spoken Word]
Guilty.
On all forty counts.

[Spoken Word]
Order of divestiture.
Meridian is reduced to one tenth of what it holds.
Twelve years.
Lane by lane, system by system,
whether or not there is anyone ready to take them.

[Instrumental Break]

[Spoken Word]
Tamber Reach was released this year.
Corvain Drayage took seventy-one per cent of it in nine weeks.

You got here late.
```

**Notes for the generation:** the line that has to land is *"You got here late."* — it is the last
thing said before the player takes control. Ask for a hard stop after it, not a fade. If Suno
insists on singing, add `absolutely no singing, narration only` to the style prompt and re-roll;
it usually takes two or three goes.

The brief originally carried a table of 49-second beat timings taken from the pre-audio sequence,
on the theory that the track would be cut to the game. That is not what happened and not what
should happen: the take came back at 2:18 and the game was retimed to it. The live table is the
one at the top of this section.

The one musical event that matters is the change into the instrumental break — everything before it
is a court record about somebody else and everything after it is about you. In the delivered take
it is at 104.05 s, a 12 dB downbeat on a single frame, and the sequence's one hard cut is bolted to
it.

---

## Track 2 — "Lane by Lane" (end card / credits)

Sung, not spoken. Plays over the verdict card when a run ends, so it has to work for both a player
who won clean and one who got caught. Write it ambiguous.

**Style prompt:**

```
slow melancholic space folk, female vocal, close-mic'd and dry, minor key,
brushed drums entering late, upright bass, distant pedal steel, analogue tape warmth,
60 bpm, spacious, resigned rather than triumphant
```

**Lyrics:**

```
[Verse]
They wrote it down in forty counts
and read it to an empty room,
took a fleet of sixty years
and gave it twelve to come undone.

[Verse]
I came in on a rented berth
with two hulls and a name to sign,
and every tonne I ever moved
came off somebody else's line.

[Chorus]
Lane by lane, system by system,
whether or not there's anyone ready.
Lane by lane, that's how it goes —
somebody's holding, somebody's steady.

[Verse]
There's a way to do it in the light
and a way that never sees a court,
and the only difference anyone recalls
is which one of them got caught.

[Chorus]
Lane by lane, system by system,
whether or not there's anyone ready.
Lane by lane, that's how it goes —
somebody's holding, somebody's steady.

[Outro]
You got here late.
So did they.
```

---

## Instrumental beds

Short loopable pieces. Every one should sit *under* dialogue and never pull focus — the game is
read, not watched.

**None of these can be wired up as things stand.** The cold open works because one file plays once
against a fixed beat list; beds need a mixer, crossfades between states, a volume control, and a
mute the game remembers. That is a session's work and it should be its own session — do not bolt a
second `Audio` element onto `verdict.js`.

**The system view** (the default state, minutes at a time — this is the one that must not annoy):
```
ambient space drone, slow evolving pads, no percussion, no melody,
distant metallic resonances, tape hiss, very low harmonic movement, 2-minute seamless loop,
Homeworld ambient, cold blue, patient
```

**Your quarters** (a small rented room on a station, close and warm against all that vacuum):
```
quiet interior ambience, warm low synth pad, faint hum of station machinery,
a distant bulkhead creak, no drums, no melody, intimate and close, seamless loop
```

**Ledger Yard** (a sales floor — should feel like being worked on, slightly too friendly):
```
lounge synth, lazy rhodes chords, brushed shaker, muted trumpet stab,
retro corporate showroom muzak but in space, slightly too pleased with itself,
85 bpm, loopable, low mix
```

**The belt** (mining, working, out at the edge):
```
industrial ambient, deep metallic groans, slow sub pulses, rock-on-hull impacts,
no melody, sparse, cavernous reverb, unhurried, seamless loop
```

**Quarterly results** (13 weeks land, the share curve draws):
```
tense minimal underscore, single repeating piano figure, rising string swell,
ticking mechanical percussion, 40 seconds, builds once and resolves, no drums
```

**Heat / the regulator is reading** (plays when the investigation gauge moves):
```
uneasy low drone, detuned strings, irregular clicks like a recording device,
almost subliminal, no beat, no resolution, short loop
```

**A hull arrives / contract signed** (short stings, three or four seconds):
```
short positive sting, warm synth swell, single bell, analogue, no drums, three seconds
```

**Busted** (the bank closes you):
```
one long descending cello note, tape stop, room tone, four seconds, no music after
```

---

## If you want more spoken word

The voice engine (`content/voice.js`) has hundreds of lines that resolve against who the player
made themselves, so a "character" track is possible but would only ever be one of many variants.
Better candidates for a second spoken piece:

- **The six tactic case studies** — each unlocks a real-world story (Bunnings–Ryobi, Ford's River
  Rouge, FTC v Meta, Boral, the Phoebus Cartel). They are already written as short prose in
  `content/stories.js` and read very well aloud. A Phoebus Cartel track would be genuinely good:
  it is the true story of a light-bulb cartel that agreed to make bulbs *worse*, and `filament`
  exists in this game as its descendant.
- **The end verdicts** in `content/verdict.js` — one per way of finishing, so five or six short
  pieces rather than one.
