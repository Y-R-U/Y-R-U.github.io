# SUNDERFALL — voice-over script & music brief

Everything spoken or singable in the game, in one place, plus ready-to-paste Suno prompts.

Text is copied verbatim from the source, so this file and the game agree:

| Content | Source of truth |
|---|---|
| Intro cinematic lines | `game/js/story/script.js` → `BEATS` |
| Act two's four scenes | `game/js/story/scenes.js` → `SCENES` |
| Rook's in-game barks | `game/js/sim/barks.js` → `LINES` |
| Death screen | `game/js/ui/overlays.js` → `showDeath()` |
| Music keys and tempos | `game/js/core/audio/music.js` → `STATES` |

> **Act two has its own file.** The stones scene below (§8) is where it started; the finished
> thing — all four in-world scenes as Who/Line/Direction tables, and the three Suno takes that
> record them (`ostrick.mp3`, `rook2.mp3`, `vayne2.mp3`) — is
> **[`SCRIPTS-ACT-TWO.md`](SCRIPTS-ACT-TWO.md)**, and that file is complete on its own. Generate
> from there, not from here. Two of the three takes must be generated as *continuations* of the
> intro's takes or the voices will not match, and the Seam's is the hardest generation in the
> project: it is Vayne's voice with the life taken out of it, and Suno's instinct is to hand back
> a demon.

**Nothing in the game is a recorded audio file today.** Every sound — score, spells, wind, the bell
over the title — is synthesised at runtime. So anything generated here is *additive*: it either
layers over the procedural score or replaces a state of it. The key/tempo table in §5 exists so that
either choice works without a clash.

> **The intro used to play silent.** Not for want of a score — it has a full one — but because a
> browser refuses to play audio until the page has been touched, and the intro's own first tap was
> wired to skip. The boot card now ends on *tap to begin / sound on*, which buys the gesture.

> **The intro is now voiced.** Two Suno takes (`game/audio/vo/vayne.mp3`, `rook.mp3`) cover all 19
> lines in §2, cut to the timings in `story/script.js` as `vo: [offset, length]`. If you regenerate
> either take, `docs/VO-TIMING-RECIPE.md` is how the timings were found — and it is not obvious,
> because silence detection cannot work on Suno output.
>
> **The barks are voiced too**, from a third take (`game/audio/vo/barks.mp3`) generated as a
> continuation of Rook's, so it is the same voice. Twenty-one of the twenty-two lines in §3; the
> exceptions and the wording changes are listed there.

---

## 1. The two voices

**Elderman Vayne** — a dying wizard, seventies, at the very end of his strength. The single most
important note: **he is not performing.** He has just spent his life closing a tear in the world and
has perhaps four minutes left. Every line is short because a long one would cost too much air. Dry,
gravelled, quiet, breath audible between phrases. No boom, no wizard-voice, no reverb-drenched
prophecy. He is annoyed, and he is running out.

The game types his bubbles at **19 characters/second** with a 1.5px tremble on the outline — that is
the pace to read at. Slow, and unsteady.

**Rook** — fifteen, sulking, the youngest child of a family that has already handed the good things
to his older sister. Flat affect. Sarcastic rather than whiny; he says bleak things in the tone of
someone reading a shopping list. He does not shout, ever — not when frightened, not when hurt. His
bubbles type at **34 characters/second**: clipped, quick, cold.

The joke that the whole opening rests on is that the audience watches a wizard die for eleven
seconds and *then* cuts to a teenager complaining about goats. Rook must be played completely
straight for that to land.

---

## 2. Intro cinematic — the full script

76.2 seconds. `t` is seconds from the first frame, `dur` is how long the bubble stays up. If you cut
generated audio to individual lines, these are your in-points.

| t | dur | Who | Line | Direction |
|---|---|---|---|---|
| 3.2 | 1.4 | **Vayne** | Hold. | Mid-fight, being driven back. Not a shout — an order to himself, through his teeth. |
| 19.8 | 2.1 | **Rook** | Cass gets the forge. | Hard cut to dusk. Walking. Bored. |
| 22.0 | 2.1 | **Rook** | Cass gets the name. | Same breath, same flatness. |
| 24.2 | 2.3 | **Rook** | I get the goats. | The punchline. Deadpan — do not sell it. |
| 27.6 | 1.9 | **Rook** | Why is it so quiet? | First flicker of something other than boredom. |
| 30.2 | 2.1 | **Rook** | That's not sunset. | Quieter. He has stopped walking. |
| 36.4 | 2.0 | **Rook** | What is this? | He is looking at a battlefield and does not understand it. Small. |
| 38.8 | 2.7 | **Vayne** | The Darkness found the seam. | On his back. Explaining, because there is no time to be gentle. |
| 41.7 | 1.9 | **Vayne** | I pushed it back. | Flat statement of fact. |
| 43.8 | 2.6 | **Vayne** | It cost me everything I had. | No self-pity. An accounting. |
| 46.6 | 1.8 | **Vayne** | The wards will hold. | Almost reassuring. |
| 48.6 | 1.4 | **Vayne** | Not long. | …and then he takes it back. |
| 50.3 | 2.1 | **Rook** | So get someone else. | Genuine. He is not being brave, he wants out. |
| 52.6 | 1.9 | **Vayne** | You're what's here. | Unkind because it is true. |
| 54.7 | 2.1 | **Vayne** | That's the whole of it. | The end of the argument. |
| 61.8 | 2.2 | **Vayne** | You can hold magic now. | Post-meld. Weaker — the stone took the last of him. |
| 64.2 | 2.5 | **Vayne** | Holding it isn't wielding it. | A warning, delivered as a correction. |
| 67.0 | 2.4 | **Vayne** | I'd have picked anyone else. | The cruellest line in the game. Said gently, which is worse. |
| 69.6 | 2.1 | **Vayne** | Grow up. Quickly. | Last words. Barely voiced. |

Silence is doing real work in this cut. The meld itself (56.0–61.8) has no dialogue at all, and the
gap from 55 to 62 is deliberate — do not fill it.

### 2a. Vayne — one continuous take

Paste into Suno's lyrics box. Ellipses are breath; the bracketed lines are performance cues that
Suno reads as direction, not text.

```
[spoken, old man, breathless, strained]
Hold.

[weaker, lying on his back]
The Darkness found the seam.
I pushed it back.
It cost me... everything I had.

The wards will hold.

[quieter]
Not long.

[flat, unkind, true]
You're what's here.
That's the whole of it.

[very weak now, fading]
You can hold magic now.
Holding it... isn't wielding it.

[gently]
I'd have picked anyone else.

[the last of his breath]
Grow up. Quickly.
```

### 2b. Rook — one continuous take

```
[spoken, teenage boy, flat, bored, deadpan]
Cass gets the forge.
Cass gets the name.
I get the goats.

[slower, unsettled]
Why is it so quiet?
That's not sunset.

[small, frightened, quiet]
What is this?

[trying to get out of it]
So get someone else.
```

### 2c. The trailer cut — both voices, one spoken-word piece

For a title-screen attract loop, a store page, or a share clip. This is not the game script; it is
the game script cut for rhythm, and it is the one worth generating twenty of.

```
[spoken word, low, over slow strings]

The Darkness found the seam.
I pushed it back.
It cost me everything I had.

[flat, young, bored]
Cass gets the forge.
Cass gets the name.
I get the goats.

[old, breaking]
The wards will hold.
Not long.

[young]
So get someone else.

[old]
You're what's here.
That's the whole of it.

[slower, building]
You can hold magic now.
Holding it isn't wielding it.
I'd have picked anyone else.

[almost gone]
Grow up.
Quickly.
```

---

## 3. In-game barks — Rook

One line at a time, eleven seconds apart minimum, each triggered by something the player just did.
These are muttered, not announced — half of them are him talking to himself.

**On setting himself on fire** *(his own fire, no enemy involved — the running joke)*
```
This magic stuff sucks.
I set me on fire. Again.
That's my own fire. That's my own fire.
Nobody saw that.
```

**On standing in his own acid**
```
It is eating my boots.
Was that meant to splash?
```

**On taking a real hit**
```
That's a lot of my blood.
Ow. Properly, ow.
Vayne. You picked wrong.
```

**Below a third health** *(the only lines allowed any strain)*
```
I am not built for this.
Still up. Barely.
```

**On breaking something large** — a wall, a pillar, an arch, a tree
```
Nothing in Thornmere ever broke like that.
Cass could never do that.
Oh, that is going to be a problem later.
```

**Three kills in five seconds**
```
Ha. Did you see that?
I am getting good at this. Worryingly good.
```

**On levelling up**
```
Something moved. In me, I mean.
It is getting easier to hold.
```

**On falling down a hole**
```
Not my finest.
The hole was quite obvious, in hindsight.
```

**Blocked by something breakable**
```
It is a rock. I can deal with a rock.
Right. Through it, then.
```

**These are recorded**, as one 45-second take at `game/audio/vo/barks.mp3` — not the individual
files this section originally asked for. One file turned out to be strictly better: a single fetch
and a single decode, and each line is played as a slice (`vo: [offset, length]` beside its text in
`sim/barks.js`), so the cuts and the fades stay tunable without re-encoding anything.

Three lines above differ from what was recorded, and **the text in the game follows the recording**,
not this section — a bubble that disagrees with the voice reads as a bug:

| written here | recorded, and now in `barks.js` |
|---|---|
| That's my own fire. That's my own fire. | That's my own fire. **My own fire!** |
| Ha. Did you see that? | Did you see that? |
| I am getting good at this. Worryingly good. | **I'm** getting good at this. Worryingly good. |
| Right. Through it, then. | **Right!** |

The repeated *"That's my own fire"* was deliberately changed on the second half, because Suno kept
switching voice on the repeat; it still shifts up in pitch, which reads as him panicking and is
better than the flat read would have been.

The last of those is there because the take ran out of room mid-line — only *"Right."* got
generated. Rather than regenerate or suppress it, the fragment **is** the line now: on its own,
*"Right!"* reads as sarcasm or as resolve depending on what just stopped him, which is the same
joke the pool was already telling. **Every line in the game is voiced.**

---

## 4. Screen text

The death screen, which is the only other written voice in the game:

> ### You fell
> *"The wood keeps what it takes."*
>
> Vayne bound a ward to your life. It replays the day and gives back what it can — every spell at
> the rank you took it to, and all but a third of what you had become. Never below level 3.

That epigraph — **"The wood keeps what it takes."** — is the single best line to hand a
spoken-word generation as a hook or a refrain. It is the only line in the game that sounds like a
proverb, and it is the one to repeat.

One more, from the resume toast, if a fourth wall is wanted: *"Right. Where was I."*

---

## 5. Music — what already exists, and what to match

The score is generated live in D natural minor and shifts state with the fight. Any recorded music
must sit in the same key or the two will fight audibly during a transition.

**Key: D natural minor, throughout. No exceptions.**

| State | BPM | Chord loop | When it plays |
|---|---|---|---|
| menu | 56 | i – VI (4 bars each) | Title, pause |
| explore | 62 | i – VI – III – VII (2 bars each) | Walking, nothing hunting you |
| tension | 74 | i – i – VI – v | Enemies aware, not engaged |
| combat | 96 | i – i – VI – VII | Fighting |
| boss | 104 | i – ♭II – i – VI | The Seam. Tempo climbs 6% as it grows |
| victory | 68 | VI – III – VII – i | After the boss |

In D: **i = Dm, ♭II = E♭, III = F, v = Am, VI = B♭, VII = C.**

The ♭II in the boss loop is the whole trick — E♭ against D is a semitone clash, and it is there
because *the Seam does not sing in tune*. Keep it.

The instrument palette the synth is imitating, worth naming in a prompt so generated tracks sound
like the same game: a plucked string modelled on a lute or dulcimer, bowed low strings, a wordless
choral pad, a frame drum, and a single distant bell.

---

## 6. Suno prompts

Suno wants two things: a **style prompt** (the short description box) and **lyrics** (the big box).
For instrumental tracks, leave the lyrics box empty and tick Instrumental.

### 6a. Voice-over — Vayne

> **Style:** spoken word, no singing, elderly male narrator, gravelled and breathless, close-mic'd
> and intimate, long pauses, sparse dark ambient bed of low bowed strings and a distant bell, no
> drums, no melody, funereal, D minor, 56 bpm

Lyrics: §2a. Generate several — the one you want is whichever take sounds *tired* rather than
*sinister*. Suno reaches for menacing wizard by default; reject those.

### 6b. Voice-over — Rook

> **Style:** spoken word, no singing, teenage male voice, flat and deadpan and unimpressed, dry
> close narration, almost no music, faint wind and distant crickets, D minor

Lyrics: §2b. Reject anything that sounds cute, wry, or knowing. Bored is the target.

### 6c. The trailer piece — both voices

> **Style:** dark folk spoken word, two voices in call and response — an old dying man and a bored
> teenage boy, slow build, lute and bowed strings, frame drum entering late, choral swell at the
> end, D natural minor, 68 bpm, cinematic, no chorus, no rhyme

Lyrics: §2c. Suno will not reliably split two characters across one generation. Two options that do
work: generate it twice with a different style prompt for each voice and cut the halves together, or
accept a single narrator and treat it as one storyteller reciting both parts — which is arguably
better for a trailer anyway.

### 6d. A song built on the epigraph

If you want an actual song rather than narration — end credits, or the store page.

> **Style:** dark medieval folk ballad, solo male voice, lute and bowed cello, no percussion,
> modal, D natural minor, slow, mournful, field-recording room sound

```
[verse]
He was old when the seam came open
He was tired when he closed it up
He gave the last of what he carried
To a boy who never asked

[chorus]
The wood keeps what it takes
The wood keeps what it takes
It gives you back the road
It never gives you back the day

[verse]
I was made for goats and fences
I was made to be the second one
Now there's fire underneath my ribcage
And a old man's work to be done

[chorus]
The wood keeps what it takes
The wood keeps what it takes
It gives you back the road
It never gives you back the day

[outro, spoken]
Grow up.
Quickly.
```

### 6e. Intro score — three cues

The cinematic has three movements and they want three separate instrumental generations, cut at the
shot boundaries in `script.js`.

**Cold open, 0:00–18:4 — Vayne losing**
> **Style:** instrumental, orchestral horror, sustained dissonant low strings, tremolo violins
> climbing, huge irregular percussion hits, no melody, a choir that is not quite in tune, builds to
> a single detonation at 12 seconds then falls to total silence, D minor with an E flat clash

**Thornmere at dusk, 18:4–32:4 — a boy walking**
> **Style:** instrumental, sparse folk, single plucked lute, warm and out of tune, distant village
> drone, crickets, no drums, D natural minor, 62 bpm, gentle and slightly sad, unresolved

**The clearing and the meld, 32:4–76:2**
> **Style:** instrumental, slow and reverent, bowed low strings and wordless choral pad, one distant
> bell, a single warm swell at the halfway point, ending on an unresolved minor chord, D natural
> minor, 56 bpm, no percussion until a soft frame drum in the final twenty seconds

### 6f. Game score — one per state

All in D natural minor. Ask for loopable and generate a few of each; the game swaps states on the
bar, so tracks want clean bar-length ends.

**Menu / title** — 56 bpm
> instrumental, medieval fantasy ambient, D natural minor, 56 bpm, slow plucked lute over a
> wordless choral pad, one distant bell, very sparse, patient, loopable, no percussion

**Explore** — 62 bpm
> instrumental, medieval fantasy exploration, D natural minor, 62 bpm, plucked dulcimer melody with
> long rests, soft bowed bass, faint choral pad, occasional distant bell, unhurried, loopable, no
> drums, leaves room to breathe

**Tension** — 74 bpm
> instrumental, D natural minor, 74 bpm, tremolo bowed strings under a sparse plucked line, quiet
> frame drum pulse, rising unease, no resolution, loopable, restrained — this is the calm before,
> not the fight

**Combat** — 96 bpm
> instrumental, medieval battle, D natural minor, 96 bpm, driving frame drum, aggressive bowed low
> strings, tremolo violins, an insistent eighth-note pulse, plucked string almost buried, urgent and
> repetitive, loopable, leave headroom — explosions play over this

**Boss — the Seam** — 104 bpm
> instrumental, apocalyptic medieval, D natural minor with an E flat semitone clash, 104 bpm,
> pounding frame drums, detuned choir, tremolo strings at the top of their register, a bell tolling
> against the beat, oppressive and slightly wrong, loopable

**Victory** — 68 bpm
> instrumental, D natural minor resolving upward, 68 bpm, warm plucked lute and bowed strings, a
> clear bell, relief rather than triumph — tired, not victorious, loopable

---

## 7. If any of this gets used

Nothing in the game currently loads an audio file, so wiring recordings in is real work, not a drop-in:

- **Intro VO** — `game/js/intro/audio.js` owns the cinematic's sound and is entirely synthesis. VO
  would hang off the existing cue system in `script.js` (add `fx: 'vo.hold'` style cues at each
  beat's `t`), which is exactly why the timings in §2 are worth cutting to. The score already plays
  under those beats, so voice has to be mixed against it rather than dropped on silence.
- **Barks** — `game/js/sim/barks.js` emits `bark` on the bus with the trigger name attached, so an
  audio layer can subscribe to that one event and needs no changes to the bark logic itself.
- **Music** — `game/js/core/audio/music.js` is a state machine with named states. Swapping a state
  from synthesis to a file is a per-state decision; the two can also coexist, which is why the key
  and tempo table is not optional.

Keep master levels low on anything generated for combat and boss. The procedural score deliberately
compresses itself so that an explosion still has somewhere to go, and a loud rendered track will eat
that headroom.

---

## 8. The stones — Keeper Ostrick

The scene at 7500, where the road currently stops. It is the first time Rook speaks to another
person since Vayne died, and it is the reason movement 4 happens: Ostrick leaves to fetch the
elders, so Rook is holding the line alone because he was *told* to.

The beat under the dialogue is that **this is the second adult in a row to hand him the job and walk
away** — Vayne did it dying, Ostrick does it with a plan, which is worse. Rook's last two lines are
the whole of his growth so far: he notices, and he admits the boring life he resented was fine.

### 8a. The third voice

**Keeper Ostrick** — sixties, a functionary. *Keeper* is a rank below *Elderman* and he knows
exactly how far below. He does not disbelieve the magic; he disbelieves the **elevation**. Forty
years of rites and service and Vayne turned him down, then melded a farm boy in a panic — so his
outrage is procedural, not moral, and that is what makes it funny before it turns frightening.

He is not a mentor and he is not a villain. He is petty, and then he is scared. No boom, no wisdom,
no menace. Clipped and pedantic, faster than Vayne, harder than Rook. **26 characters/second**, no
tremble — his bubble is rigid where Vayne's shakes.

His crankiness breaks the moment Rook offers the power up. A man who has wanted a thing for forty
years can tell the difference between a boast and a genuine attempt to give it away — and if Vayne
handed it to whoever was standing there, then Vayne had no time left, which means the seam is far
worse than the order has been told.

### 8b. The scene

| Who | Line | Direction |
|---|---|---|
| **Ostrick** | Don't touch the stones. | Re-cutting a ward line into a stone with a knife. Does not look up. |
| **Ostrick** | Who melded you? | Now he looks up. |
| **Rook** | Elderman Vayne. | Flat. |
| **Ostrick** | No. | Not a question. A refusal to accept it. |
| **Ostrick** | There's a Rite. There's a Naming. There's nine years of it. | Reciting regulations at a boy. |
| **Ostrick** | You got a dying man's panic. | |
| **Rook** | Yes. | He agrees. That is the joke. |
| **Ostrick** | Vayne turned down forty years of me. | The real wound, finally out. |
| **Ostrick** | And gave it to what was standing there. | Near-quote of Vayne's "You're what's here" — a stranger arriving at the same verdict. |
| **Rook** | I had goats. Now I've got this. | Deadpan. Not self-pity, a list. |
| **Rook** | Take it. Just take it. | **He never shouts.** This lands because it is flat. |
| — | *(silence — hold it)* | |
| **Ostrick** | …You'd give it up. | Thrown. Nobody who wanted it would say that. |
| **Rook** | Yes. | |
| **Ostrick** | Then he was out of time. | Quiet. The crankiness is gone. |
| **Ostrick** | He'd never. Not unless there was none left. | |
| **Ostrick** | The seam's open. | To himself. |
| **Ostrick** | Boy. Keep the fire lit. | Sharp, decided, already moving. |
| **Ostrick** | Nothing crosses the stones while it burns. | |
| **Ostrick** | I'll bring the elders. | |
| **Rook** | How long? | |
| **Ostrick** | Learn something while you wait. | Over his shoulder. Not kind. |
| — | *(he goes west, fast, and does not look back)* | |
| **Rook** | That's the second one. | To nobody. |
| **Rook** | The goats were fine. | Quieter. The end of the scene, and the first grown-up thing he has said. |

"Keep the fire lit" is a mechanic, not a line: the brazier going out is what opens the Glyphglade, so
movement 4 has a cause instead of just being further to the right.

### 8c. Suno — Ostrick

> **Style:** spoken word, no singing, older male voice, clipped and irritable and pedantic,
> provincial rather than grand, close-mic'd and dry, no reverb, almost no music, one low sustained
> drone and a faint crackling fire, no drums, no melody, D minor

```
[spoken, older man, clipped, irritable, pedantic]
Don't touch the stones.

Who melded you?

[flat, refusing it]
No.

[reciting regulations, offended]
There's a Rite. There's a Naming. There's nine years of it.
You got a dying man's panic.

[bitter, the real wound]
Vayne turned down forty years of me.
And gave it to what was standing there.

[thrown, slower]
You'd give it up.

[quiet, frightened now]
Then he was out of time.
He'd never. Not unless there was none left.

[to himself]
The seam's open.

[sharp, decided, already leaving]
Boy. Keep the fire lit.
Nothing crosses the stones while it burns.
I'll bring the elders.

[over his shoulder, not kind]
Learn something while you wait.
```

Suno's defaults for an old man with a staff are **wise mentor** and **sneering villain**. Reject
both. The target is *petty* — a man complaining about paperwork — right up until "Then he was out of
time", where it should go quiet rather than dramatic.

### 8d. Suno — Rook, take two

Rook's scene lines **and** the new barks in §8e, as **one continuation of the existing Rook take**
(`audio/vo/rook.mp3` → `barks.mp3`). That is what made the first batch of barks sound like the same
person as the cinematic; a fresh generation will not match. Ask for the extension to start a few
seconds inside the previous take so the model has its own voice to copy, then trim that lead-in and
subtract it from every offset — the method is in `docs/VO-TIMING-RECIPE.md`.

> **Style:** spoken word, no singing, teenage male voice, flat and deadpan and unimpressed, dry
> close narration, almost no music, faint wind and distant crickets, D minor

```
[spoken, teenage boy, flat, deadpan, unimpressed]
Elderman Vayne.

Yes.

I had goats. Now I've got this.
Take it. Just take it.

Yes.

How long?

[flat, to nobody]
That's the second one.

[quieter, almost to himself]
The goats were fine.

[muttering, to himself, walking]
Yep. Still flammable.
Every time. Every single time.

Fine. That's fine.
I've had worse. Recently.

[strained, hurt]
Not here. Not for this.
Keep the fire lit, he said.

[deadpan]
Sorry. To whoever built that.
That was somebody's wall.

[uneasy]
That's the stone. Not me.
I don't like how easy that was.

It fits better now. That's worse.
Bigger. Great.

Down again. Fine.
Walls. Use the walls.

I know what to do with rock now.

[quiet, to nobody, a long walk]
Nobody ever needed saving from a goat.
Cass would hate this. Small mercy.
I'd take the goats.
Keep the fire lit.
```

Reject anything cute, wry or knowing — bored is still the target, and the new lines are *tired*
rather than sad. "The goats were fine" is the one line in the game with any warmth in it and it must
not be played for laughs.

### 8e. Barks that unlock after the stones

His voice should widen as the run goes on rather than being one flat pool from minute zero. These
extend the pools in §3 and are gated on progress, so early Rook sulks and late Rook is grimly used
to it.

| trigger | line | note |
|---|---|---|
| `selfBurn` | Yep. Still flammable. | resigned where the early lines are outraged |
| `selfBurn` | Every time. Every single time. | |
| `hurt` | Fine. That's fine. | |
| `hurt` | I've had worse. Recently. | |
| `low` | Not here. Not for this. | |
| `low` | Keep the fire lit, he said. | Ostrick callback — only after the stones |
| `bigBreak` | Sorry. To whoever built that. | the first sign he thinks about consequences |
| `bigBreak` | That was somebody's wall. | |
| `streak` | That's the stone. Not me. | he is unnerved by his own competence |
| `streak` | I don't like how easy that was. | |
| `level` | It fits better now. That's worse. | |
| `level` | Bigger. Great. | |
| `pit` | Down again. Fine. | |
| `pit` | Walls. Use the walls. | teaches the wall climb in his own voice |
| `blocked` | I know what to do with rock now. | rhymes with the early "It is a rock. I can deal with a rock." |
| `alone` | Nobody ever needed saving from a goat. | **new trigger** — fires on a long quiet stretch with nothing near him |
| `alone` | Cass would hate this. Small mercy. | |
| `alone` | I'd take the goats. | |
| `alone` | Keep the fire lit. | him repeating an instruction to himself |

**Wired, 2026-08-12.** All nineteen are in `sim/barks.js` with `after` gating: a number is a player
level, a string is a story flag set from `story:done`, so both Ostrick callbacks need the stones
scene to have happened. The level is read from `ctx.spellSystem.level` when it is there rather than
counted from `player:level` events, because a resume restores the level without emitting one.
`alone` fires at priority 1 after 40s with no bark and nothing hostile within a screen, scanned
twice a second.

**They do not fire yet, and that is correct.** Every line in this game is voiced, so `pick()` drops
any line whose take is not on disk — it asks `ctx.audio.hasTake(take)`, and where that does not
exist it falls back to "does this line have real offsets", which is the same answer. The nineteen
lines above carry `take: 'rook2'` and stay out of the pool until `audio/vo/rook2.mp3` is generated
(§3b of `SCRIPTS-ACT-TWO.md`). One silent line among voiced ones reads as a bug, not as restraint.
