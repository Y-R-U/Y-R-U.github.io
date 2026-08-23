# KITEHAWK — everything to generate, in one file

**Aaron: you should never need to open another document to use this.** Every entry gives you the
**filename**, the **Style** block, and — where there is one — the **Lyrics** block. Copy the Style
block into SUNO's Style/Description box and the Lyrics block into its Lyrics box. Nothing needs
editing first.

**Start at §4 if you only want the list of what to do.**

---

## §1 — Where the files go, and the one promise

```
gms/2d/kitehawk/assets/audio/music/<name>.mp3      ← SUNO, by hand. That is you.
gms/2d/kitehawk/assets/audio/vo/<who>/<id>.mp3     ← generated locally. Not your problem.
gms/2d/kitehawk/tools/vo/raw/suno/<name>_take.mp3  ← where a SUNO voice take is dropped before splitting
```

Drop a music file in with exactly the filename below and it works. No code change, no manifest
edit, no rebuild.

**The game is fully playable and correct with this entire folder empty.** Every spoken line falls
back to a text card that is on screen for as long as it takes to read (`STORY.md` §7), and the
music layer simply does not start. So: **generate in any order, generate none of it, stop whenever,
come back in a month.** Nothing here blocks a milestone and nothing here is load-bearing.

**Filenames are the whole interface.** There is no manifest to edit for music — the loader looks
for these exact names. If you rename a download, rename it to the name in the heading.

---

## §2 — MUSIC · 10 slots

### The one tune

There is **one melody** in this game and every act is a version of it. It is called **"The Fall"**,
it is eight bars long, it lives in **B♭ minor** (relative D♭ major), and it resolves — once, at the
very end — into **B♭ major**. Flat keys because brass is pitched in B♭ and this is a village brass
band that ended up in a war.

The instrument that carries it changes with the act, and that is the entire score design:

| act | carried by | what it means |
|---|---|---|
| 1 | **solo cornet**, brass band behind it | a sport, on a green, in spring |
| 2 | **accordion**, in three, over water | it has become a job with a timetable |
| 3 | **muted trumpet**, high strings, no bass | cold, high, thin, beautiful, wrong |
| 4 | **full military band**, and the tune is buried in the middle voices | pageantry over something rotten |
| 5 | **solo cornet again, alone**, then strings | the first tune, plainly, finished |

Every prompt below names the tune's key and tempo so the tracks will crossfade without clashing.
**If SUNO gives you a track in the wrong key, keep it anyway** — the engine crossfades over 1.8 s
and a clash inside a fade is not audible. Do not regenerate for key.

### How they loop, and how the game moves between them

- **Every track self-loops.** The engine does a 2.5 s equal-power crossfade from `duration − 2.5`
  back to `0.0`. **You do not need to trim, top-and-tail, or find a loop point.** Generate a track
  that ends on a fade or a held chord and it will loop cleanly.
- A track wants to be **90 seconds or longer**. Shorter loops audibly.
- **Act changes crossfade over 1.8 s**, on the mission-complete screen where nothing is moving.
- **`tense` is a duck, not a change.** When a fight commits, `act<n>` drops to 0.25 gain and
  `tense` fades in over 0.9 s on top of it; when the fight breaks, `tense` fades out over 2.0 s and
  the act track comes back up. **Both are playing the whole time.** That is why `tense` is in the
  same key at a related tempo — it is a layer, not a replacement, and it is why its prompt asks for
  ostinato and stabs rather than a melody. A `tense` track with its own tune fights the act track
  and sounds like two radios.
- `menu` and `hangar` are hard cuts on screen change. No crossfade, they never overlap anything.
- **There is no victory sting to generate.** A two-second brass figure on mission complete is
  synthesised at runtime from the same three notes as the tune. Not your job.

---

### M1 · `menu` — **"Ferrow Green"**
**File:** `music/menu.mp3` · instrumental · **required**

The first thing anyone hears. A racecourse at dawn with aeroplanes on it.

> **Style:** instrumental, period brass band recorded outdoors on a village green in 1918, solo cornet playing a slow simple melody, B flat minor, 76 BPM, distant euphonium and tuba underneath, no drums at all, audible breath and valve noise, warm and slightly out of tune, faint mist and birdsong in the background, tape wow and surface noise, unhurried, melancholy but not tragic, ends unresolved, loopable

---

### M2 · `hangar` — **"The Judge's Box"**
**File:** `music/hangar.mp3` · instrumental · **required**

Plays under the upgrade screen, which is where the player spends the second-most time in the game
after flying. It must be able to run for ten minutes without becoming annoying, so: no melody in
the front, nothing that resolves, nothing that builds.

> **Style:** instrumental, solo accordion and upright bass in a corrugated-iron shed, 88 BPM, B flat minor lifting to D flat major, rain on a metal roof, a workbench and quiet tools somewhere behind it, soft brushed snare and nothing else for percussion, the same simple melody as the cornet theme but shabbier and played half-remembered, warm, patient, no build, no climax, loopable

---

### M3 · `act1` — **"The Fall"**
**File:** `music/act1.mp3` · instrumental · **required**

The signature track. Twenty missions play over this and it is the tune the last act reprises.

> **Style:** instrumental, warm period orchestra with a village brass band at its heart, 84 BPM, B flat minor, solo cornet carrying a simple singable melody over pizzicato strings and low woodwind, plenty of air under it, one lifting change into D flat major every sixteen bars, no percussion until a soft military side drum late in the piece, Studio Ghibli, hopeful and a little shabby, spring, green fields and standing water, loopable

---

### M4 · `act2` — **"Sufficiency"**
**File:** `music/act2.mp3` · instrumental · optional

The same tune, in three, over the Kettle Sea. Seasick.

> **Style:** instrumental slow waltz in three-four, 96 BPM, B flat minor, solo accordion carrying the melody over sustained low strings and a distant tuba, wind and water noise underneath, one muted trumpet answering the accordion at the end of each phrase, no drums, gently seasick, never resolving, the same melody as before but sadder and turning, loopable

---

### M5 · `act3` — **"Above The Deck"**
**File:** `music/act3.mp3` · instrumental · optional

Sunlight with nothing underneath it. This is the prettiest and least friendly track in the game.

> **Style:** instrumental, cold and thin, 78 BPM, B flat minor, muted trumpet with a lot of air in the tone, extremely high sustained strings near the edge of hearing, glass harmonica, no bass at all for the first minute, no percussion, enormous empty reverb like a cathedral with no walls, beautiful and unwelcoming, the melody stretched out to half speed, loopable

---

### M6 · `act4` — **"The Grey And The Brass"**
**File:** `music/act4.mp3` · instrumental · optional

A parade for something nobody wants to look at.

> **Style:** instrumental, full military brass band playing a march that keeps losing its footing, 108 BPM, B flat minor, side drums and bass drum, cornets and trombones in unison, the melody buried in the middle voices and very slightly out of tune, recorded from two streets away on a parade ground, grand and hollow, pompous and hopeless, loopable

---

### M7 · `act5` — **"Nineteen Days"**
**File:** `music/act5.mp3` · instrumental · optional

The tune comes back plainly and finishes. This is the only track in the game that resolves.

> **Style:** instrumental, 72 BPM, a solo cornet completely alone for the first thirty seconds with nothing but room tone behind it, then low strings entering underneath, B flat minor resolving at last into B flat major, no percussion whatsoever, church acoustic, the first melody of the score returning plain and unornamented and finally coming to rest, restrained, do not swell, loopable

---

### M8 · `tense` — **"Under The Canopy"**
**File:** `music/tense.mp3` · instrumental · **required**

The combat layer. **It plays on top of the act track, so it must not have a tune of its own** —
ostinato and stabs only. This is the most-heard track in the game after `act1`.

> **Style:** instrumental, 112 BPM, B flat minor, driving low strings in a repeating ostinato with brass stabs on the off beat, timpani and side drum, tremolo violins high above, a rising figure that never arrives anywhere, period orchestral and never modern, no synthesisers, no melody line, relentless and clipped, dry close recording, ends abruptly, loopable

---

### M9 · `credits` — **"The Post"** · **with lyrics**
**File:** `music/credits.mp3` · **required if you generate only one thing with words**

*Why this one has words:* it plays once, over the epilogue cards at the end of level 100, and it is
the only moment in the game with no gameplay under it. It is also the piece to put on the projects
page.

> **Style:** slow English folk ballad, one weary female voice close and unpolished, 72 BPM, B flat minor, solo concertina and upright bass, a single cornet answering the vocal at the end of each verse, no drums at all, field-recording room sound, unhurried, melancholy, never soars, the vocal slightly ahead of the beat like someone who is tired

> **Lyrics:**
> ```
> [Verse]
> They dropped it at eleven
> through a cloud they never saw
> and whoever got beneath it
> got to call it theirs, and law
>
> [Verse]
> There were letters in the flour
> there were names I used to know
> Hoy and Weir and Marrender
> all of them below
>
> [Chorus]
> And it falls, and it falls
> and the silk comes down so slow
> and we never asked who paid for it
> we only asked who'd go
>
> [Verse]
> Now the war's nineteen days over
> and the crates come down the same
> somebody signed a quarter
> and the quarter has a name
>
> [Chorus]
> And it falls, and it falls
> and the silk comes down so slow
> and we never asked who paid for it
> we only asked who'd go
>
> [Outro]
> I'll take the post to Marrender
> whatever's left of it
> ```

---

### M10 · `race` — **"Bring More Engine"**
**File:** `music/race.mp3` · instrumental · optional

Pylon race and time-trial mode. The Countess's music. The only cheerful thing in the game and it is
cheerful because she is an idiot.

> **Style:** instrumental, fast and giddy, 132 BPM, D flat major, solo clarinet and cornet trading a bright chase melody over an oompah brass band, snare and cymbal, a barrel organ somewhere underneath, 1920s air-race newsreel, wind noise, joyful and slightly ridiculous, never menacing, loopable

---
---

## §3 — VOICE

**The honest split: almost all of it is generated locally and you do nothing.** Two takes are
SUNO's, and only the first of those actually matters.

### 3.1 The local cast — Kokoro, nothing for you to do

Twelve of the fourteen speaking parts and every pooled bark are Kokoro-82M, generated by the build
from `data/script.json`. **Note the endpoint correction:** `192.168.0.236:8808` is Abogen's *web*
UI — it is htmx against `/wizard/upload` and there is **no HTTP TTS API on it**. The working path,
proven by NEONHAUL's 207 clips, is Abogen's own interpreter driven locally:

```
/Users/aaronair/.local/share/uv/tools/abogen/bin/python  tools/vo/kokoro_say.py  jobs.json
```

Batch every line into one `jobs.json`. The pipeline loads an 82 M model and a phonemiser once (~6 s)
and then does about a line a second; one process per clip would spend the entire run loading
weights.

**Accent carries nationality, for free.** The British Kokoro voices are Verrine; the American ones
are Kohlgard and the Concord Line. The player never has to be told which side a voice is on.

| who | character | voice | speed | notes |
|---|---|---|---|---|
| `hurdy` | Marla Hurdle — wireless | `bf_alice` | 1.02 | **the most-heard voice in the game.** dry, quick, three jobs behind |
| `nell` | Nell Corrigan — the player (default) | `bf_emma` | 0.98 | speaks rarely and flatly |
| `nell_m` | Nils Corrigan — male alternate | `bm_daniel` | 0.98 | same script, one field in the save |
| `roo` | Ruthven Halke — flight leader | `bm_lewis` | 0.92 | economical, tired, ex-Kohlgard |
| `ferry` | Tobin Ferris — fitter | `bm_fable` | 0.88 | **the hangar voice.** old, slow, deadpan |
| `aurie` | Aurie Petch — 19 | `bf_lily` | 1.06 | bright and fast. **her pool is deleted from level 34** |
| `odile` | Odile Sarn | `bf_isabella` | 0.96 | cold, correct, forty words in three acts |
| `baumgart` | Wilhelm Baumgart — "the Old Man" | `am_onyx` | 0.86 | courteous, unhurried, genuinely warm |
| `grelle` | Sabin Grelle — "the Bailiff" | `am_eric` | 0.92 | flat, professional, contractual |
| `ferber_y` | Yannik Ferber | `am_liam` | 1.02 | young, fast, frightened |
| `ferber_o` | Ott Ferber | `am_fenrir` | 0.98 | slower, and the one who breaks |
| `board` | the Verrine Air Board | `am_echo` | 0.92 | a staff officer reading an order. no colour |
| `bulletin` | the Concord Line's automated release | `af_alloy` | 1.00 | **affectless on purpose.** never inflect this one |
| `countess` | Ilsabet Kohl-Marren | `af_nova` | 1.06 | *(the fallback — see 3.3)* |
| `drach` | Anselm Drach — "the Wire" | `am_adam` | 0.90 | *(the fallback — see 3.2)* |
| — | Katrin Sohl — "the Widow of Marnhault" | — | — | **has no voice and no lines, by design.** Do not generate her anything |

**Radio treatment is in ffmpeg, not in the prompt.** The 1918 wireless character — band-limit,
carrier hiss, squelch, and a rotary-engine rumble under it — is a filter chain applied to every
clip after synthesis, exactly as NEONHAUL's `tools/radio_fx.sh` does. Four profiles, which are four
physical situations and not four EQ presets:

| profile | who is speaking |
|---|---|
| `own` | in your own headset — you, and your own engine behind it |
| `air` | another aeroplane — thinner, more hiss, wind |
| `ground` | Ferrow Green's set — strongest signal, and a paraffin stove and a room behind it |
| `dry` | **no radio at all.** Every `hangar` line. Ferry has never been on a wireless in his life |

`hangar` lines going through the radio chain is the single most likely mistake here, and it would
make the warmest scenes in the game sound like traffic control.

---

### 3.2 SUNO take one — **DRACH** ← the one that actually matters

**This is the only thing in this file that is genuinely waiting on you.**

Anselm Drach is a man who has cut four hundred parachutes and never opened one of the crates. He is
not angry, not theatrical, and never raises his voice. Kokoro cannot do him. NEONHAUL settled this
already: *Kokoro is an audiobook reader; there is no dial on it marked menace,* and the closest the
whole voice set gets is a polite man reading a threat. `am_adam` at 0.90 is the fallback and it is
**wired and playable** — if you never generate this, nothing breaks and the villain is merely
civil.

Eleven lines, **one generation**.

**Style**

```
spoken word monologue, no music, no melody, no beat, no instruments at all.
one male voice only. late twenties, flat, dry, unhurried, slightly nasal.
a technician explaining a procedure he has done many times and does not
think about. never shouts, never sneers, never enjoys it. no theatre.
close mic, thin and over-modulated like a bad field radio, faint carrier
hiss, small hard room. bored, patient, entirely reasonable.
```

**Lyrics**

```
[spoken, flat, unhurried, no emotion]
You are all so busy underneath it. Like something at a carcass.
[pause]
I don't shoot the box. The box is worth money. I shoot the silk.
[pause]
It is not cruelty. It is arithmetic. Yours falls short, mine falls right.
[pause]
Ah. The kitehawk. I read about you on a requisition form.
[pause]
Go on. Climb. I will be there when you have nothing left to spend.
[pause]
[slower, completely matter of fact]
I have cut four hundred canopies. I have never once opened one.
[pause]
Your friend was slow. I am told she was slow at school as well.
[pause]
There is no armistice up here. Up here there is only me and the weather.
[pause]
[quieter]
Nineteen days. Nobody has paid me for nineteen days.
[pause]
[small, not self-pitying]
I was going to have a house.
[pause]
[quiet, finished]
Very well. Take it. Take all of it. It was never yours to keep.
```

**Where the download goes**

```
gms/2d/kitehawk/tools/vo/raw/suno/drach_take.mp3      ← any filename is fine, this one is easiest
```

**Splitting it.** Do **not** use silence detection. SUNO puts a quiet musical bed under spoken word,
so `ffmpeg silencedetect` finds about four gaps in an eleven-line take. The tool that works aligns
the *known script* against whisper's word stream — NEONHAUL's `tools/vo/split_take.py`, which is
what produced its 22 dispatch lines, and which this project should port rather than reinvent:

```sh
python3 tools/vo/gen_lines.py --suno-script drach          # writes script_drach.json from script.json
python3 tools/vo/split_take.py tools/vo/raw/suno/drach_take.mp3 \
        tools/vo/script_drach.json tools/vo/raw/suno/       # → drach_01..11.mp3
python3 tools/vo/gen_lines.py --only drach                  # treat, verify, rewrite the manifest
```

A slot with a file in `tools/vo/raw/suno/` is **never synthesised and never overwritten** — a
performance is the only input in this pipeline that cannot be rebuilt. Keep the raw takes out of
git and keep them on disk.

**What the treatment does to it, and does not.** A SUNO take arrives with its own space on it, so it
does **not** get the room/reverb stage — that stage exists to put a synthesiser's placeless output
in a cockpit, and running it over a performance stacks a second reflection on the first. It gets
trim, the band-limit and carrier hiss (Drach is on a radio and must match), the same **−16 LUFS**
shelf as every other clip, and a **−1.5 dBTP** ceiling. NEONHAUL shipped SUNO takes clipping at
**+2.7 dBTP** once; that ceiling exists so this project does not repeat it.

**If a take is nearly right, regenerate — do not tune.** There is no post-processing that adds or
removes menace. The two lines worth re-rolling for are *"I have never once opened one."* and *"I was
going to have a house."* — the first is the character and the second is the only moment anyone is
allowed to feel sorry for him.

**Reject:** anything growled, anything with a laugh in it, anything that sounds like it is enjoying
itself, and anything with a musical swell under the last line. He is a clerk.

---

### 3.3 SUNO take two — **THE COUNTESS** · optional

Ilsabet Kohl-Marren needs *delight*, which Kokoro is as bad at as it is at menace — `af_nova` at
1.06 is the fallback and it reads as pleasant rather than gleeful. This one is genuinely optional;
generate it if you enjoyed doing Drach.

Nine lines, one generation.

**Style**

```
spoken word only, no music, no melody, no beat, no instruments.
one female voice. English aristocrat, mid forties, fast, light and
delighted. she is having the best afternoon of her life and is being
extremely rude about a war. never cruel, never seductive, never arch —
genuinely happy. open cockpit: wind and a big engine behind the voice,
shouting slightly to be heard over it, close mic, band-limited radio.
```

**Lyrics**

```
[spoken, bright, fast, delighted, over engine noise]
Oh, good. Someone new. Everyone else has learned not to.
[pause]
I am not going to shoot you. I am going to embarrass you.
[pause]
That was a pretty turn. It cost you nine hundred feet, but it was pretty.
[pause]
[gleeful]
Higher. Higher. There you are. Now — catch me.
[pause]
Do you know what I want from this war? For it to be interesting.
[pause]
It is being very rude about it.
[pause]
The crate? Take the crate. I came for the race.
[pause]
Same time next month, kitehawk. Bring more engine.
[pause]
[genuinely outraged, and it is the saddest line she has]
They have grounded me. For fuel. Fuel!
```

**Where it goes:** `tools/vo/raw/suno/countess_take.mp3`, split exactly as §3.2.

---

### 3.4 The three rules every voice prompt here follows

Keep them if you edit anything.

1. **Spoken word only.** No singing, no melody, no musical bed. The Style block says so explicitly
   and in several ways, because SUNO will add one if given room.
2. **The Lyrics box is one prompt** — the lines plus simple instructions in `[square brackets]`,
   with `[pause]` between lines so the take can be split.
3. **A shouted word gets BOTH a bracket tag AND capitals** — `[Woman Shouting] PULL UP. PULL UP.`
   Never one without the other. *(Nothing in KITEHAWK's two takes is shouted. Both characters are
   frightening or delightful precisely because they are not raising their voices. If you add a line
   later, this is the rule.)*

---
---

## §4 — YOUR CHECKLIST

Ordered by how much each one improves the game. Everything below the line is optional and nothing
here blocks anything — the game runs, and runs correctly, with none of it.

### Waiting on you

| # | what | file | why it is where it is |
|---|---|---|---|
| **1** | **`act1`** | `music/act1.mp3` | twenty missions play over it and it is the tune the whole score is variations on. Get this one right and the other five acts are re-dresses of a thing that already works |
| **2** | **`tense`** | `music/tense.mp3` | the most-heard track after `act1`. Every fight in a hundred missions ducks into it |
| **3** | **`menu`** | `music/menu.mp3` | the first thing anyone hears, including anyone Aaron shows it to |
| **4** | **`hangar`** | `music/hangar.mp3` | the upgrade screen, where the player is stopped and listening properly |
| **5** | **DRACH** | `tools/vo/raw/suno/drach_take.mp3` | **the only voice in the game Kokoro cannot do.** Playable without it — the fallback is a polite villain — but he is the antagonist and politeness is the wrong crime |
| **6** | **`credits`** | `music/credits.mp3` | the one sung piece. Plays over the ending and is the track for the projects page |
| 7 | `act5` | `music/act5.mp3` | the reprise. Only lands if `act1` exists first, so do it after 1 |
| 8 | `act3` | `music/act3.mp3` | the prettiest track. Twenty missions in the cold |
| 9 | `act2` | `music/act2.mp3` | |
| 10 | `act4` | `music/act4.mp3` | |
| 11 | `race` | `music/race.mp3` | pylon mode only |
| 12 | THE COUNTESS | `tools/vo/raw/suno/countess_take.mp3` | optional. The Kokoro fallback is fine-not-great |

**If you do exactly two things, do `act1` and `tense`.** Those two carry ninety percent of the
playing time. **If you do one, do `act1`.**

### Not waiting on you — generatable locally, today

- Every line of the script for all fourteen speaking parts: Hurdy, Nell, Roo, Ferry, Aurie, Odile,
  Baumgart, Grelle, both Ferbers, the Air Board, the Bulletin, plus the Kokoro fallbacks for Drach
  and the Countess.
- Every pooled bark — thirteen groups, about a hundred lines (`STORY.md` §5.4).
- The radio treatment, the loudness shelf, the manifest, and the four verification gates.

None of that needs SUNO, none of it needs you, and none of it needs the network.

### Not being generated at all

- **Katrin Sohl** has no voice and no text cards, in any mode. That is the design, not an omission.
- **The victory sting** is synthesised from three notes of the tune at runtime.
- **Sound effects** — engine, guns, wind, flak, silk — are the engine's, not this document's.
