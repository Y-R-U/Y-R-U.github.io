# NEONHAUL — SUNO prompts

Everything to generate, in one file. **Aaron: you should never need to open `BUILD_PLAN.md` to use
this.**

Each entry gives you three things: the **filename** to save as, the **Style** field, and (where
there is one) the **Lyrics** field. Copy the Style block into SUNO's Style/Description box and the
Lyrics block into its Lyrics box. Nothing needs editing first.

**Where the files go**

```
gms/3d/neonhaul/assets/audio/music/<name>.mp3
gms/3d/neonhaul/assets/audio/chatter/<name>.mp3
```

Drop them in with exactly the filenames below and they work. No code change, no manifest edit, no
rebuild. **The game is fully playable and correct with this entire folder empty** — every missing
line still appears as a text popup, and the synthesised radio bed still runs. So generate in any
order, stop whenever, and come back later.

**One track can be several slots.** Every chatter prompt in §2–§3 contains several lines separated
by `[pause]`, so one SUNO generation gives you a whole group. Cut it with **`tools/vo/split_take.py`**,
which aligns the known script against whisper's word stream. There is no `tools/split_chatter.py` —
BUILD_PLAN §11 specified one, and then explained why silence-splitting fails on SUNO output (it puts
a musical bed under spoken word, so `silencedetect` finds ~7 gaps where a 22-line take needs 21).
`split_take.py` is the tool that was built instead and it is the one that produced the 22 dispatch
lines on disk.

**Since S2-B you almost certainly do not want SUNO for chatter at all.** The whole pool is generated
locally — see the STATUS block below — and a SUNO take now has to be *worse* on purpose to match the
rest. The prompts in §2 and §3 are kept because they are still the best description of what each
group is FOR, and because the music prompts in §1 are unchanged and still live.

---

## STATUS — rewritten by S2-B (radio voices), 2026-08-20

**Every chatter slot now has audio.** The pool went from 64 declared slots with 26 files on disk to
**203 slots with 203 files** — 179 foreground, 24 background — spoken by **31 voice
identities over 16 installed macOS voices**. Aaron's complaint was *"there is only a couple of
random chatter that loop frequently"*, and the cause was that 38 of the 64 declared slots had never
been generated: the player was hearing four dispatch groups on rotation and nothing else existed.

| | now | was |
|---|---|---|
| chatter slots | 203 | 64 declared, 26 on disk |
| foreground lines | 179 | 22 on disk |
| distinct voices | 31 identities / 16 base voices | 1 (a single SUNO operator) |
| total bytes | **2283 KB** | 841 KB across the 26 — 7.8x the clips for 2.71x the bytes |
| mean clip | 11.2 KB | 32.4 KB |
| the same 26 slots | 291 KB re-encoded | 841 KB |
| encode | mono, 16 kHz, 16 kbps mp3 | mono, 32 kHz, ~51 kbps |

**How it is built.** `tools/vo/lines.json` holds every line, its voice and its group. `python3
tools/vo/gen_chatter.py` synthesises the ones that need synthesising with macOS `say`, passes every
clip — the SUNO takes included — through `tools/radio_fx.sh`, rewrites `assets/audio/manifest.json`,
and verifies the result. **The SUNO originals are the only input that cannot be rebuilt**; they are
kept in `tools/vo/raw/suno/` (gitignored) and the generator refuses to overwrite them. This file's
generated halves come from `tools/vo/write_suno_md.py`.

**The radio character is in ffmpeg, not in a prompt.** `tools/radio_fx.sh` is a filter chain:
300–3400 Hz band-limit at 36 dB/oct, a 1.8 kHz intelligibility lift, two stages of hard compression,
a pink-noise carrier floor, and a squelch burst keying on at the head and decaying at the tail.
Measured with white noise in (flat to 0.1 dB), the chain reads **−30.8 dB at 50–150 Hz, −17.0 dB at
150–300 Hz, flat across 600–3400 Hz, −14.1 dB at 3400–4500 Hz and −31.5 dB at 4500–7000 Hz**,
relative to the passband. Four profiles — `close`, `distant`, `loud`, `thin` — are the four physical
situations the lines are written for, not four EQ presets.

**Verification.** Because the chain deliberately mixes hiss into every clip, *whole-file* RMS would
pass a clip in which nobody spoke. So `gen_chatter.py --verify` measures the **speech window**
between the two squelch bursts against a floor derived by running a no-speech control through the
identical chain, and checks each clip's duration against what its script and its voice's own
words-per-minute predict. `--falsify` proves both go red. Over all 203 clips: speech window
**-20.2 to -13.6 dBFS** against a floor of **-26.5 dBFS**, 0 rejected.

`tools/gates_p8.mjs` B5 checks decoded energy again in the browser that will actually decode it, B6
proves that check can fail, and **B5b** measures the same speech window in the browser — B5 alone
stopped being sufficient the moment the assets acquired a deliberate noise floor, and B5b's
falsification demonstrates exactly that: a clip with its speech zeroed and its squelch kept still
reads −33 dBFS whole-file, well above MIN_RMS.

**And the words actually arrive.** `tools/vo/intelligibility.py` transcribes every foreground clip with whisper and scores it against the line it is supposed to say. Mean word-sequence match **90.7%** over 179 clips; the weakest group is `ad` at 82% and the strongest is `dispatch_confirm` at 96%. Read that number
as a RANKING, not as a percentage a human would score — whisper is degraded by the same band-limit and has
never heard of the Ninefold Approach. What it is good for is finding the mush, and it found it: three of the
MacinTalk-era voices were losing their consonants under the band-limit and were replaced off a controlled
A/B (the same four lines through every candidate), which moved the pool from 86.4% to 90.7%.

### The `tag` field

Every slot carries `tag`, and the vocabulary is exactly three values — this is the contract with the
dashboard work (S2-A), which styles the chatter ticker off it and never touches this file:

| `tag` | groups | rendered |
|---|---|---|
| `bg` | `bg_net` `bg_dock` | faded — background wash, not addressed to the player |
| `info` | `ad` `pirate` `weather` `life` | normal — ordinary traffic |
| `alert` | `dispatch` `dispatch_confirm` `dispatch_pay` `police` `distress` | bright / highlighted |

### Music is unchanged

Five of nine music slots have a file. `chase`, `storm`, `first_flight` and `pirate` are still
unfilled and still optional; their pools fall through to `cruise`. `menu.mp3` still has nothing to
play it — the game has no menu screen. Both are unchanged from P8.

### The correction P8 made to the repeat arithmetic still stands

"5 × 7 × 36 s ≈ 21 minutes before any foreground line repeats" is one shuffle-bag *cycle*, i.e. the
mean interval, not a floor. The code adds a per-slot **cooldown** (1500 s ambient, 660 s on the two
job pools) as the hard time floor. Gates A4, A5, A6. With the pool at 179 foreground lines those
bags are 2–4x longer, so the cycle length rises with them; the cooldown floor is unchanged.

## The three rules every chatter prompt here follows

These are yours and every prompt below already obeys them. If you edit a prompt, keep them.

1. **Spoken word only.** No singing, no melody, no musical bed. The Style field says so explicitly.
2. **The Lyrics field is a single prompt** containing the lines plus **simple instructions in
   [square brackets]**.
3. **Shouted words get BOTH a bracket tag AND capitalised text** — e.g.
   `[Man Shouting] PULL UP. PULL UP.` Never one without the other.

---

## What to generate first

**Required** — these are the ones whose absence you'd actually notice. Fifteen generations.

| | group | why |
|---|---|---|
| M1 | `menu` | the first thing anyone hears |
| M2 | `cruise_a` | the default flying track |
| M5 | `docked` | plays under the main UI of the game |
| B1 | `bg_net` | the ambient radio murmur the whole city sits on |
| C1 | `dispatch` | general dispatch |
| **C2** | **`dispatch_confirm`** | **fires on every job you accept** |
| **C3** | **`dispatch_pay`** | **fires on every job you complete** |

C2 and C3 are the two most-heard things in the game by a wide margin — roughly every ninety seconds
of play, forever. They get eight lines each for that reason.

**Optional** — everything else. All of it improves the game and none of it blocks anything.

---
---

# 1. MUSIC — 9 slots

Seven instrumental, two with lyrics. The reasoning for the two is given, because vocals over
gameplay compete with the radio chatter that is doing the heavy lifting.

---

### M1 · `menu` — "Standing By"
**File:** `music/menu.mp3` · instrumental · **required**

> **Style:** dark cinematic synthwave, slow, instrumental, no vocals, 78 BPM, deep analog sub bass, a single detuned Juno pad held for bars, sparse tape-delayed guitar harmonic, distant siren-like sine tone, vinyl hiss and rain noise floor, Blade Runner, patient, unresolved, lots of space, no drums until the second half then only a soft brushed kick

---

### M2 · `cruise_a` — "Lanes Four Through Nine"
**File:** `music/cruise_a.mp3` · instrumental · **required**

> **Style:** instrumental darkwave / slow synth-funk, 92 BPM, no vocals, muted plucked bass on the one, gated analog pad, brushed electronic drums low in the mix, one clean chorused electric guitar figure repeating, wet reverb, cold and forward-moving but relaxed, night driving, mostly minor with one lifting change every eight bars, nothing triumphant

---

### M3 · `cruise_b` — "Sootfields"
**File:** `music/cruise_b.mp3` · instrumental · optional

> **Style:** instrumental dub techno, 88 BPM, no vocals, heavy tape delay, chords played once and left to smear for eight bars, deep round sub bass, dry rim clicks, industrial room tone underneath, occasional metallic clank in the far distance, hypnotic, grimy, no melody line, no build, no drop

---

### M4 · `cruise_day` — "Smoglight"
**File:** `music/cruise_day.mp3` · instrumental · optional

> **Style:** instrumental ambient drone with a slow pulse, 70 BPM, no vocals, bowed metal and detuned strings, a low brass swell every sixteen bars, dust and hiss, almost no percussion — just a soft heartbeat kick, washed out, colourless, oppressive but calm, the sound of a bright grey sky with no sun in it

---

### M5 · `docked` — "Terms"
**File:** `music/docked.mp3` · instrumental · **required**

> **Style:** instrumental noir jazz-electronica, 74 BPM, no vocals, upright bass, brushed snare, a single muted trumpet phrase with heavy plate reverb, Rhodes chords, close and intimate, small room, smoke, low volume background music for a conversation, never busy, leaves gaps

---

### M6 · `chase` — "Under The Wire"
**File:** `music/chase.mp3` · instrumental · optional

Plays when a **RUSH** job has under thirty seconds left on its timer. *(It used to be a police-chase
track called "Blue And Red"; there is no police pursuit in the game, so it is now a clock, not a
threat. The slot id and filename are unchanged.)*

> **Style:** instrumental industrial techno, 138 BPM, no vocals, driving distorted sixteenth-note bass, hard four-on-the-floor, tense rising arpeggio, metallic percussion, a ticking hi-hat figure that never resolves, no breakdown, relentless, high pressure, ends abruptly

---

### M7 · `storm` — "Everything Above Two Hundred"
**File:** `music/storm.mp3` · instrumental · optional

> **Style:** instrumental dark ambient with thunder, 60 BPM, no vocals, enormous low drone, sheets of filtered noise like rain on glass, sub-bass rumbles that swell and fall, one distant detuned bell, no rhythm at all, vast, wet, dangerous, cinematic weather

---

### M8 · `first_flight` — "Nobody Here Is From Here"
**File:** `music/first_flight.mp3` · **with lyrics** · optional

*Why this one has words:* it plays exactly once, on the first take-off of a new save, while the
player is still learning the controls and no chatter is scheduled. It is the only moment in the game
where a vocal is not competing with the radio, and a sung line is what gives a game a signature.

> **Style:** slow dark synth ballad, 76 BPM, one weary female vocal low in the mix, heavy reverb, analog pad, sparse electronic drums entering late, melancholy but not sad, resigned, cinematic, Blade Runner, vocals drenched and slightly indistinct

> **Lyrics:**
> ```
> [Verse]
> Grey came up at seven
> and the sky just went to white
> nobody calls it morning
> we just call it the other night
>
> [Verse]
> I keep a box on the passenger side
> I never ask what's in it
> the meter runs, the lanes divide
> and the city takes a minute
>
> [Chorus]
> Nobody here is from here
> nobody here goes home
> we just keep the cargo moving
> through the neon and the chrome
>
> [Outro]
> Lanes four through nine
> lanes four through nine
> ```

---

### M9 · `pirate` — "The Understack"
**File:** `music/pirate.mp3` · **with lyrics** · optional

*Why this one has words:* it is **diegetic** — a pirate radio station the player can tune to in
settings, so it is supposed to sound like something coming out of a speaker. It plays at 0.30 gain
under the radio bus's bandpass, and being lyrical is the point.

> **Style:** lo-fi bedroom synth-punk broadcast over a bad transmitter, 108 BPM, distorted male vocal, cheap drum machine, buzzing bass synth, band-limited like AM radio, clipping, one finger organ line, defiant and scrappy, sounds recorded in a basement, tape saturation

> **Lyrics:**
> ```
> [Intro]
> [Man Speaking, distorted] You're down in the understack. Nobody's licensing this.
>
> [Verse]
> They built it up so nothing gets in
> they built it up so nothing gets out
> forty floors of somebody's money
> and a light on in every one, no doubt
>
> [Chorus]
> Turn it up in the understack
> turn it up, they can't reach back
> every window is a lie
> every window is a lie
>
> [Verse]
> Six credits for a can of air
> nine to breathe it twice
> smile for the drone on the corner there
> he's only checking your price
>
> [Outro]
> [Man Speaking, distorted] Same time tomorrow. If there is one.
> ```

---
---

# 2. BACKGROUND CHATTER — the original SUNO prompts

Ambient, low in the mix, **never shown on screen**. Half-intelligible on purpose — these sit under
the synthesised traffic-net bed and make the city sound busy.

*These two prompts describe the original 7 slots. The pool is 24 background slots now and all of
them are generated locally — §4 is the current list. Keep this section for what each group is FOR.*

---

### B1 · `bg_net` — traffic net murmur
**Files:** `chatter/bg_net_01.mp3` … `bg_net_04.mp3` — **one generation, 4 slots** · **required**

> **Style:** spoken word only, no music, no melody, several overlapping radio voices at once, heavily band-limited like a cheap two-way radio, squelch clicks and static bursts between transmissions, none of it clearly intelligible, room tone, distant, busy air traffic control room feel

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Several radio voices overlapping, none of them clear. Band-limited, static, squelch clicks. Leave two seconds of silence between each numbered group.]
>
> [Man Speaking, distant, half-buried in static] …copy that, holding at one-forty…
> [Woman Speaking, overlapping] …no, the pad's still cold, tell them to circle…
>
> [pause]
>
> [Man Speaking, bored] …seven-four-two clear of the stack, going down to lane four…
> [Woman Speaking, faint] …say again your last…
>
> [pause]
>
> [Woman Speaking, clipped] …that's a negative on the Ardent beacon, still out…
> [Man Speaking, distant] …been out three weeks…
>
> [pause]
>
> [Man Speaking, tired] …end of shift, somebody else can have it…
> [Woman Speaking, overlapping, faint] …roger, and good luck to them…
> ```

---

### B2 · `bg_dock` — dock-hand chatter
**Files:** `chatter/bg_dock_01.mp3` … `bg_dock_03.mp3` — **one generation, 3 slots** · optional

Plays only while docked.

> **Style:** spoken word only, no music, two or three working voices at a distance across a windy loading deck, echoey concrete, wind and rain, not addressed to the listener, overlapping, casual

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Working voices across a windy deck, not talking to the listener. Echo, wind. Leave two seconds of silence between each group.]
>
> [Man Speaking, distant] Left side, left side — no, the other left.
> [Woman Speaking, distant] It's sealed, don't shake it.
>
> [pause]
>
> [Woman Speaking, casual] Whose is the black one on pad two? It's been there since Tuesday.
> [Man Speaking, casual] Nobody's. That's the whole problem.
>
> [pause]
>
> [Man Shouting, distant] MIND THE EDGE. MIND THE EDGE.
> [Woman Speaking, unbothered] He does that every time.
> ```

---
---

# 3. FOREGROUND CHATTER — the original SUNO prompts

These play at full radio gain **and** pop up on the HUD. Nine groups.

*These prompts describe the original 57 foreground slots and the voice specced for each group. The
pool is 179 foreground slots now, generated locally — §4 is the current list, §5 the current cast.
Kept because the register each group is written in has not changed and this is where it is set out.*

Every line becomes one manifest slot with its text field set to the line exactly as written here, so
the popup and the audio match word for word. **That matters** — a mismatch reads as a bug. If you
change a word when generating, tell the manager so the text can be updated to match.

---

### C1 · `dispatch` — "Haul Control", general
**Files:** `chatter/dispatch_01.mp3` … `dispatch_06.mp3` — **one generation, 6 slots** · **required**

> **Style:** spoken word only, no music, no melody, dry close-mic voice through radio compression, calm professional female operator, clipped and unhurried, air traffic control delivery, room tone only, no reverb

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Female operator, calm and clipped, like an air traffic controller. Leave two seconds of silence between each numbered line.]
>
> [Woman Speaking, calm] Haul Control to all couriers — the Vane Street corridor is open again. Lanes four through nine, keep it under two hundred.
>
> [pause]
>
> [Woman Speaking, flat] We have a manifest mismatch on the Kessel drop. If that box is warm, it is not my problem.
>
> [pause]
>
> [Woman Shouting] PULL UP, COURIER. PULL UP. YOU ARE INSIDE THE STACK.
>
> [pause]
>
> [Woman Speaking, tired] Shift change in ten. Whoever is on the roof at Ardent, the beacon is out again. Still.
>
> [pause]
>
> [Woman Speaking, dry] Somebody has parked a freighter across two of my lanes. I am told this is temporary. I am told a lot of things.
>
> [pause]
>
> [Woman Speaking, calm] Weather is closing the upper approach at Pale Terrace. If you are booked up there, you are now booked somewhere else.
> ```

---

### C2 · `dispatch_confirm` — job accepted
**Files:** `chatter/dispatch_confirm_01.mp3` … `dispatch_confirm_08.mp3` — **one generation, 8 slots** · **required**

**One of these fires every single time the player accepts a job**, roughly every ninety seconds of
play. Same operator, same voice as C1. Eight lines means a player hears any given one about every
twelve minutes instead of every ninety seconds.

> **Style:** spoken word only, no music, no melody, dry close-mic voice through radio compression, calm professional female operator, clipped and unhurried, air traffic control delivery, room tone only, no reverb, short transmissions

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Female operator, calm and clipped, like an air traffic controller. Every line is a short separate transmission. Leave two seconds of silence between each numbered line.]
>
> [Woman Speaking, calm] Courier, your parcel is logged and the pad is holding for you. Try not to make them wait.
>
> [pause]
>
> [Woman Speaking, brisk] Logged. Clock's running. Try to look like you've done this before.
>
> [pause]
>
> [Woman Speaking, dry] That's on your manifest now. Whatever it is.
>
> [pause]
>
> [Woman Speaking, flat] Confirmed. Lane's clear as far as I can see, which is not far.
>
> [pause]
>
> [Woman Speaking, calm] You've got it. Sealed, weighed, and none of my business.
>
> [pause]
>
> [Woman Speaking, faintly amused] Accepted. They asked for someone reliable. I sent you anyway.
>
> [pause]
>
> [Woman Speaking, clipped] Booked. Take the high lane, the low one's a car park.
>
> [pause]
>
> [Woman Speaking, tired] On the board and off my desk. Go.
> ```

---

### C3 · `dispatch_pay` — delivery completed
**Files:** `chatter/dispatch_pay_01.mp3` … `dispatch_pay_08.mp3` — **one generation, 8 slots** · **required**

**One of these fires every single time the player completes a delivery.** Same operator again.

> **Style:** spoken word only, no music, no melody, dry close-mic voice through radio compression, calm professional female operator, clipped and unhurried, air traffic control delivery, room tone only, no reverb, short transmissions

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Female operator, calm and clipped, like an air traffic controller. Every line is a short separate transmission. Leave two seconds of silence between each numbered line.]
>
> [Woman Speaking, dry] Nice run. Credits are clearing now. Don't spend it all in the Ribs.
>
> [pause]
>
> [Woman Speaking, calm] Signed for. Money's moving. Slowly, but it's moving.
>
> [pause]
>
> [Woman Speaking, brisk] Delivered and closed. That's one thing today that went where it was supposed to.
>
> [pause]
>
> [Woman Speaking, flat] Paid. They didn't complain, which from them is a compliment.
>
> [pause]
>
> [Woman Speaking, faintly amused] Clean drop. I'm marking you as competent. Don't make me change it.
>
> [pause]
>
> [Woman Speaking, calm] Received in one piece. Credits inbound. Enjoy the four minutes before you need them.
>
> [pause]
>
> [Woman Speaking, tired] Logged, paid, forgotten. That's the job.
>
> [pause]
>
> [Woman Speaking, dry] Done. There's more where that came from, unfortunately.
> ```

---

### C4 · `police` — "City Patrol, Air Division"
**Files:** `chatter/police_01.mp3` … `police_06.mp3` — **one generation, 6 slots** · optional

Ambient flavour only. **Nothing in the game chases the player** — these are other people's problems
on an open band, which is exactly why they work.

> **Style:** spoken word only, no music, no melody, male voice through a hard-limited police radio, bored authority, band-limited, squelch click at the start and end of each transmission, dry

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Male police air-division officer, bored and official. Squelch click at the start and end of each line. Leave two seconds of silence between each numbered line.]
>
> [Man Speaking, bored] Air Division, routine sweep, lanes one through six. Nothing to see. As usual.
>
> [pause]
>
> [Man Speaking, official] Unregistered hauler in the Lantern Quarter, descending. We are aware. We are not interested.
>
> [pause]
>
> [Man Speaking, flat] Courier craft, you are flying a lane you are not licensed for. Consider this the friendly version.
>
> [pause]
>
> [Man Shouting] HOLD YOUR ALTITUDE. HOLD IT. DO NOT DESCEND.
>
> [pause]
>
> [Man Speaking, dry] Cargo seizure at pad nine. Owner declined to attend. Owner never does.
>
> [pause]
>
> [Man Speaking, tired] Break off pursuit, we lost him in the smog band. Log it as weather.
> ```

---

### C5 · `pirate` — "The Understack"
**Files:** `chatter/pirate_01.mp3` … `pirate_05.mp3` — **one generation, 5 slots** · optional

> **Style:** spoken word only, no music, no melody, male voice recorded on cheap equipment, over-modulated and clipping, fast and conspiratorial, tape hiss, sounds transmitted from a basement, band-limited AM

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Male pirate DJ, fast, conspiratorial, over-modulated cheap microphone. Leave two seconds of silence between each numbered line.]
>
> [Man Speaking, fast] You're on the understack. If you can hear me, you're too low, and that's exactly where I want you.
>
> [pause]
>
> [Man Speaking, conspiratorial] They say the Pale Terrace towers are empty. Forty floors, every light on, nobody home. Ask yourself who's paying that bill.
>
> [pause]
>
> [Man Speaking, amused] Couriers — if a client won't tell you what's in the box, that's not a red flag. That's a pay rise. Charge accordingly.
>
> [pause]
>
> [Man Shouting] THEY ARE NOT CLOUDS. THEY HAVE NEVER BEEN CLOUDS. LOOK UP.
>
> [pause]
>
> [Man Speaking, calm again] Anyway. Rain until Thursday. Fly low, fly rude.
> ```

---

### C6 · `ad` — commercial band
**Files:** `chatter/ad_01.mp3` … `ad_06.mp3` — **one generation, 6 slots** · optional

> **Style:** spoken word only, no music, no melody, over-bright commercial announcer, unnaturally cheerful, close-mic'd and heavily compressed, slight digital artefacting as if the ad is being streamed badly, ends each read too abruptly

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Over-bright commercial announcer, unnaturally cheerful, too close to the microphone. Leave two seconds of silence between each numbered line.]
>
> [Woman Speaking, bright] Tallow Nutrient Paste. Nine flavours. All of them are paste.
>
> [pause]
>
> [Man Speaking, bright] Breathing shouldn't be a luxury. At Ardent Air, breathing is a subscription. That's better.
>
> [pause]
>
> [Woman Speaking, bright] Kell's Rest. Sleep four hours, wake up owing nothing. Terms apply. Many terms apply.
>
> [pause]
>
> [Man Speaking, bright, faster] New from Vantage Optics — see the sky the way it used to be, for eleven credits a month, forever.
>
> [pause]
>
> [Woman Shouting, cheerful] EVERY UNIT MUST GO. EVERY UNIT. WE ARE NOT COMING BACK.
>
> [pause]
>
> [Man Speaking, bright] Drownings Reclamation. We buy anything. We do not ask.
> ```

---

### C7 · `distress` — open emergency band
**Files:** `chatter/distress_01.mp3` … `distress_05.mp3` — **one generation, 5 slots** · optional

> **Style:** spoken word only, no music, no melody, panicked voices over a failing radio link, heavy static, dropouts mid-sentence, wind and alarms behind the voice, genuinely urgent, not theatrical

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Panicked voices on a failing radio link, static and dropouts, alarms behind them. Leave two seconds of silence between each numbered line.]
>
> [Man Speaking, urgent] Mayday, mayday — cell's gone, I'm at ninety metres and dropping, anyone on this band —
>
> [pause]
>
> [Woman Shouting] I AM IN THE SMOG BAND. I CANNOT SEE THE LANE. I CANNOT SEE THE LANE.
>
> [pause]
>
> [Woman Speaking, shaky] It's not an emergency yet. I'm just saying it might be. In about a minute.
>
> [pause]
>
> [Man Shouting, distorted] GET OFF THE PAD. GET OFF THE PAD NOW.
>
> [pause]
>
> [Man Speaking, quiet, resigned] Cancel the mayday. I found a ledge. It'll do.
> ```

---

### C8 · `weather` — "Atmospheric Bulletin"
**Files:** `chatter/weather_01.mp3` … `weather_05.mp3` — **one generation, 5 slots** · optional

> **Style:** spoken word only, no music, no melody, synthetic neutral announcer voice, slightly robotic and evenly paced, clean signal with a faint digital hum, no emotion whatsoever

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Synthetic neutral announcer, evenly paced, no emotion, faint digital hum. Leave two seconds of silence between each numbered line.]
>
> [Woman Speaking, synthetic] Atmospheric bulletin. Particulate density high below one hundred metres. Visibility, four hundred. Conditions are within normal.
>
> [pause]
>
> [Woman Speaking, synthetic] Precipitation across all districts for the next nine hours. Surface reflectivity elevated. Reduce approach speed.
>
> [pause]
>
> [Woman Speaking, synthetic] Daylight index, zero point two. This is the maximum for today.
>
> [pause]
>
> [Woman Speaking, synthetic] Electrical activity above three hundred metres. Craft in the upper lanes should descend. Craft that cannot descend should continue.
>
> [pause]
>
> [Woman Speaking, synthetic] The smog band has lifted to one hundred and forty metres. Enjoy the view.
> ```

---

### C9 · `life` — the city talking to itself
**Files:** `chatter/life_01.mp3` … `life_08.mp3` — **one generation, 8 slots** · optional

Not dispatch, not police, not adverts — just other people using the air. There are no people
anywhere in the 3D world by design, so this group is a lot of what makes the city feel inhabited,
and it is one generation.

> **Style:** spoken word only, no music, no melody, a range of ordinary working voices on an open civilian channel, varied ages and accents, band-limited two-way radio, some close and some distant, unhurried, nobody performing, room tone and background noise behind each one

> **Lyrics:**
> ```
> [Spoken word only. No singing. No music. Ordinary civilian voices on an open radio channel, each one a different person, nobody performing. Leave two seconds of silence between each numbered line.]
>
> [Man Speaking, weary] Third time at this pad and the lift's still out. I'm carrying it up. Forty floors. Somebody owes me a drink.
>
> [pause]
>
> [Woman Speaking, brisk] Market's open on the Gantry until two. Bring your own light, the strip's been dead since spring.
>
> [pause]
>
> [Man Speaking, casual] Anyone flying past Sixteen Low — is that a fire or is that just Tuesday?
>
> [pause]
>
> [Woman Speaking, flat] Tower maintenance, block nine. We are aware the beacon is out. We have been aware for some time.
>
> [pause]
>
> [Man Speaking, cheerful] Taxi four-one-one, off shift, going home. Whoever's got the Lantern run tonight — good luck, and I mean that.
>
> [pause]
>
> [Woman Speaking, amused] My kid asked what the sky looks like. I said grey. She said what's grey. Fair question.
>
> [pause]
>
> [Man Shouting, distant, over wind] GET IT OFF THE EDGE. OFF THE EDGE. IT IS NOT SECURED.
>
> [pause]
>
> [Woman Speaking, quiet] Understack, if you're listening — play the one about the windows again. It's been a week.
> ```

---
---

# 4. THE FULL LINE POOL — every slot, verbatim

Generated from `tools/vo/lines.json`; this is what `assets/audio/manifest.json` says, line for
line. `gates_p8` A3 asserts that every foreground slot's popup text appears in THIS FILE verbatim,
so the two cannot drift. **Do not hand-edit the tables** — edit `lines.json`, re-run
`python3 tools/vo/gen_chatter.py`, then `python3 tools/vo/write_suno_md.py`.

`voice` is a key in §5's cast table. A `SUNO` row is one of the 26 original SUNO takes, kept and
only re-processed through the radio chain.

---

## `dispatch` — general Haul Control traffic

**19 slots** · `fore` · `tag: alert` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **HAUL CONTROL**

| slot | voice | line |
|---|---|---|
| `dispatch_01` | *SUNO* | Haul Control to all couriers — the Vane Street corridor is open again. Lanes four through nine, keep it under two hundred. |
| `dispatch_02` | *SUNO* | We have a manifest mismatch on the Kessel drop. If that box is warm, it is not my problem. |
| `dispatch_03` | *SUNO* | PULL UP, COURIER. PULL UP. YOU ARE INSIDE THE STACK. |
| `dispatch_04` | *SUNO* | Shift change in ten. Whoever is on the roof at Ardent, the beacon is out again. Still. |
| `dispatch_05` | *SUNO* | Somebody has parked a freighter across two of my lanes. I am told this is temporary. I am told a lot of things. |
| `dispatch_06` | *SUNO* | Weather is closing the upper approach at Pale Terrace. If you are booked up there, you are now booked somewhere else. |
| `dispatch_07` | `ctrl_b` | Haul Control, all couriers. Vault Row has closed its low approach for the night. Come in high or come in tomorrow. |
| `dispatch_08` | `ctrl_c` | Advisory for the Ninefold Approach. The beacon is reading. The beacon is lying. Fly it by eye. |
| `dispatch_09` | `ctrl_a` | Anyone still holding for Sixteen Low, the pad has been reassigned. I would tell you to whom, but nobody told me. |
| `dispatch_10` | `ctrl_b` | Reminder to the lane. Sootfields is a corridor, not a shortcut. I can see all of you. |
| `dispatch_11` | `ctrl_c` | We have a stalled hauler across Gantry Row. Go around it, go under it, go home. Do not go through it. |
| `dispatch_12` | `ctrl_a` | Cinder Step is stacking six deep. If your parcel is not warm, take the long way and enjoy the quiet. |
| `dispatch_13` | `ctrl_b` | That is the third transponder failure over The Drownings this shift. If you go dark down there, nobody is coming. |
| `dispatch_14` | `ctrl_c` | Haul Control. Marrow Landing has power again. Everything standing on it does not. |
| `dispatch_15` | `ctrl_a` | Lanes four through nine are yours until the weather turns. The weather always turns. |
| `dispatch_16` | `ctrl_b` | Somebody on this band is broadcasting music. It is not good music. Please stop. |
| `dispatch_17` | `ctrl_c` | The Spindle deck is closed to unlicensed traffic. Yes, that means you. It has always meant you. |
| `dispatch_18` | `ctrl_a` | Courier traffic, stay off Pale Terrace for the next hour. There is a thing happening and I am not being told what. |
| `dispatch_19` | `ctrl_b` | SEPARATE. SEPARATE. TWO OF YOU ARE IN THE SAME LANE AT THE SAME HEIGHT. |

---

## `dispatch_confirm` — fires every time the player accepts a job

**20 slots** · `fore` · `tag: alert` · gain 0.9 · cooldown 660 s

Speaker label on screen: **HAUL CONTROL**

| slot | voice | line |
|---|---|---|
| `dispatch_confirm_01` | *SUNO* | Courier, your parcel is logged and the pad is holding for you. Try not to make them wait. |
| `dispatch_confirm_02` | *SUNO* | Logged. Clock's running. Try to look like you've done this before. |
| `dispatch_confirm_03` | *SUNO* | That's on your manifest now. Whatever it is. |
| `dispatch_confirm_04` | *SUNO* | Confirmed. Lane's clear as far as I can see, which is not far. |
| `dispatch_confirm_05` | *SUNO* | You've got it. Sealed, weighed, and none of my business. |
| `dispatch_confirm_06` | *SUNO* | Accepted. They asked for someone reliable. I sent you anyway. |
| `dispatch_confirm_07` | *SUNO* | Booked. Take the high lane, the low one's a car park. |
| `dispatch_confirm_08` | *SUNO* | On the board and off my desk. Go. |
| `dispatch_confirm_09` | `ctrl_b` | Logged. The pad knows you are coming. It is not excited about it. |
| `dispatch_confirm_10` | `ctrl_c` | You have it. The weight is declared, which is not the same as true. |
| `dispatch_confirm_11` | `ctrl_a` | Confirmed. Straight there, and I do mean straight. |
| `dispatch_confirm_12` | `ctrl_b` | On your manifest. Try to arrive with the same number of pieces. |
| `dispatch_confirm_13` | `ctrl_c` | Booked. If it rattles, that is normal. If it stops rattling, hurry. |
| `dispatch_confirm_14` | `ctrl_a` | Accepted. The client is already asking where you are. They asked before you took it. |
| `dispatch_confirm_15` | `ctrl_b` | That is yours. I have put you down as reliable, which was a decision. |
| `dispatch_confirm_16` | `ctrl_c` | Sealed and signed. Do not open it, do not shake it, do not ask. |
| `dispatch_confirm_17` | `ctrl_a` | Logged at this end. The clock started before I finished saying that. |
| `dispatch_confirm_18` | `ctrl_b` | Got it. Lane is busy, weather is turning, and you said yes anyway. |
| `dispatch_confirm_19` | `ctrl_c` | Confirmed. Somebody wanted this yesterday, so today is already late. |
| `dispatch_confirm_20` | `ctrl_a` | You are on it. Nice and boring, please. Boring is the good one. |

---

## `dispatch_pay` — fires every time the player completes a delivery

**20 slots** · `fore` · `tag: alert` · gain 0.9 · cooldown 660 s

Speaker label on screen: **HAUL CONTROL**

| slot | voice | line |
|---|---|---|
| `dispatch_pay_01` | *SUNO* | Nice run. Credits are clearing now. Don't spend it all in the Ribs. |
| `dispatch_pay_02` | *SUNO* | Signed for. Money's moving. Slowly, but it's moving. |
| `dispatch_pay_03` | *SUNO* | Delivered and closed. That's one thing today that went where it was supposed to. |
| `dispatch_pay_04` | *SUNO* | Paid. They didn't complain, which from them is a compliment. |
| `dispatch_pay_05` | *SUNO* | Clean drop. I'm marking you as competent. Don't make me change it. |
| `dispatch_pay_06` | *SUNO* | Received in one piece. Credits inbound. Enjoy the four minutes before you need them. |
| `dispatch_pay_07` | *SUNO* | Logged, paid, forgotten. That's the job. |
| `dispatch_pay_08` | *SUNO* | Done. There's more where that came from, unfortunately. |
| `dispatch_pay_09` | `ctrl_b` | Delivered. The credits are moving through four systems that all take a cut. What is left is yours. |
| `dispatch_pay_10` | `ctrl_c` | Signed for. They counted it twice in front of you, which is their way of being friendly. |
| `dispatch_pay_11` | `ctrl_a` | Paid. Nothing broken, nothing missing, nobody shouting. Rare. |
| `dispatch_pay_12` | `ctrl_b` | Closed. That parcel is somebody else's problem now, and honestly it always was. |
| `dispatch_pay_13` | `ctrl_c` | Clean drop. I have had worse days, and most of them were this one. |
| `dispatch_pay_14` | `ctrl_a` | Received. Money is in. Spend it on the cell before you spend it on anything fun. |
| `dispatch_pay_15` | `ctrl_b` | Logged. They have asked for you specifically next time, which is either a compliment or a warning. |
| `dispatch_pay_16` | `ctrl_c` | Done and paid. Go and sit somewhere with a roof over it for ten minutes. |
| `dispatch_pay_17` | `ctrl_a` | That has cleared. Small job, small money, still money. |
| `dispatch_pay_18` | `ctrl_b` | Delivered on time, which I have noted, because nobody else will. |
| `dispatch_pay_19` | `ctrl_c` | Paid out. There is a queue of work behind it. There always is. |
| `dispatch_pay_20` | `ctrl_a` | Settled. And before you ask, yes, there is more. |

---

## `police` — City Patrol, Air Division — other people’s problems on an open band

**26 slots** · `fore` · `tag: alert` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **CITY PATROL**

| slot | voice | line |
|---|---|---|
| `police_01` | `patrol_a` | Air Division, routine sweep, lanes one through six. Nothing to see. As usual. |
| `police_02` | `patrol_c` | Unregistered hauler in the Lantern Quarter, descending. We are aware. We are not interested. |
| `police_03` | `patrol_b` | Courier craft, you are flying a lane you are not licensed for. Consider this the friendly version. |
| `police_04` | `patrol_a` | HOLD YOUR ALTITUDE. HOLD IT. DO NOT DESCEND. |
| `police_05` | `patrol_c` | Cargo seizure at pad nine. Owner declined to attend. Owner never does. |
| `police_06` | `patrol_b` | Break off pursuit, we lost him in the smog band. Log it as weather. |
| `police_07` | `patrol_a` | Air Division to all units. Be advised, grey hauler, no transponder, last seen crossing Tallow Yard low and fast. Do not approach it. Just tell us where it went. |
| `police_08` | `patrol_c` | All craft in the Lantern Quarter, this is City Patrol. A vehicle on your band is running a false registry. If it hails you, do not answer it. |
| `police_09` | `patrol_b` | Notice to lane traffic. Pike Deck is a controlled approach from tonight. Fly it without clearance and we will find you. Eventually. Probably. |
| `police_10` | `patrol_a` | Air Division, routine sweep, Vault Row. Nothing. Same as last night. Same as the night before that. |
| `police_11` | `patrol_c` | Security advisory. Two craft are working the Gantry as a pair. One stops you, the other takes the cargo. If you get flagged down over the Gantry, keep flying. |
| `police_12` | `patrol_b` | HOLD YOUR LINE. HOLD IT. YOU ARE CROSSING A CONTROLLED APPROACH. |
| `police_13` | `patrol_a` | We have a craft parked mid lane over Ninefold with its lights off. It has been there two hours. Somebody go and look at it. Not me. |
| `police_14` | `patrol_c` | All units, cargo theft reported at Quill Step. Description of the vehicle, a courier craft. That is the entire description we were given. |
| `police_15` | `patrol_b` | Air Division. If you are the one flying under the Sever Wall, we can see you, we have always been able to see you, and it is not clever. |
| `police_16` | `patrol_a` | Be advised, the smog band is down to sixty metres over Sootfields. If you lose somebody in there, log it as weather and go home. |
| `police_17` | `patrol_c` | Notice. An unlicensed pad is operating somewhere off Low Ferrand. We are told that it moves. Pads do not move. We are looking into it. |
| `police_18` | `patrol_b` | Patrol to control. That hauler we flagged over Marrow Landing has put itself in the water. Recovery is your problem now. |
| `police_19` | `patrol_a` | This is City Patrol, Air Division. The Drownings is not closed. The Drownings is simply not recommended. There is a difference and it is yours. |
| `police_20` | `patrol_c` | Alert to all lanes. A craft matching the theft report was seen at Redoubt Two. It has since been seen at four other places at the same time, which tells you how good the report is. |
| `police_21` | `patrol_b` | CLEAR THE PAD. CLEAR THE PAD. WE HAVE A CRAFT COMING IN WITHOUT POWER. |
| `police_22` | `patrol_a` | Air Division. Somebody has taken the beacon off the Kiln. Not broken it. Taken it. It weighs four hundred kilos. |
| `police_23` | `patrol_c` | Advisory for couriers. If a client meets you out on the pad instead of inside, that is not a client. Log it and fly. |
| `police_24` | `patrol_b` | Routine notice. Speed enforcement is active on the Spine Run tonight. Enforcement means we write it down. |
| `police_25` | `patrol_a` | We have found the craft from the Quill Step report. It was never stolen. Its owner forgot where he parked it. Three days. |
| `police_26` | `patrol_c` | City Patrol to all air traffic. Stand by for a controlled descent over Ashlock Upper. Anyone below three hundred metres, be somewhere else. |

---

## `pirate` — The Understack, the unlicensed station

**15 slots** · `fore` · `tag: info` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **THE UNDERSTACK**

| slot | voice | line |
|---|---|---|
| `pirate_01` | `dj` | You're on the understack. If you can hear me, you're too low, and that's exactly where I want you. |
| `pirate_02` | `dj` | They say the Pale Terrace towers are empty. Forty floors, every light on, nobody home. Ask yourself who's paying that bill. |
| `pirate_03` | `dj` | Couriers — if a client won't tell you what's in the box, that's not a red flag. That's a pay rise. Charge accordingly. |
| `pirate_04` | `dj` | THEY ARE NOT CLOUDS. THEY HAVE NEVER BEEN CLOUDS. LOOK UP. |
| `pirate_05` | `dj` | Anyway. Rain until Thursday. Fly low, fly rude. |
| `pirate_06` | `dj` | You are down in the understack. Nobody licensed this, nobody is paying for this, and nobody can find the transmitter. Yet. |
| `pirate_07` | `dj` | Forty floors at Pale Terrace, every light burning, nobody home. That is not a building. That is a receipt. |
| `pirate_08` | `dj` | Somebody asked me why the sky is grey. Wrong question. Ask who it is grey for. |
| `pirate_09` | `dj` | They put a new sign on the Kiln this week. Same building, same everything, new sign. That is the whole economy, right there. |
| `pirate_10` | `dj` | Message for the patrol craft that has been circling the Ribs for an hour. I can hear your engine through the microphone. Come in and have a cup of something. |
| `pirate_11` | `dj` | If you are flying low enough to hear this clearly, congratulations, you are breaking about four rules. Keep going. |
| `pirate_12` | `dj` | The Market is still open. They will tell you it is not. It is. Go round the back of the Gantry and follow the noise. |
| `pirate_13` | `dj` | Here is a fact they do not put on the boards. Nobody in this city was born in this city. Nobody. Think about who that is convenient for. |
| `pirate_14` | `dj` | TURN IT UP. IF YOUR NEIGHBOUR COMPLAINS, TURN IT UP AGAIN. |
| `pirate_15` | `dj` | Somebody has left a parcel outside the studio. I am not opening it, I am not moving it, and I am broadcasting next to it, which is a decision I am reviewing. |
| `pirate_16` | `dj` | And a quiet one out to the man who borrowed off the wrong room and walked away. Rare. Play him something warm. |

---

## `ad` — the commercial band

**16 slots** · `fore` · `tag: info` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **COMMERCIAL BAND**

| slot | voice | line |
|---|---|---|
| `ad_01` | `ad_f` | Tallow Nutrient Paste. Nine flavours. All of them are paste. |
| `ad_02` | `ad_m` | Breathing shouldn't be a luxury. At Ardent Air, breathing is a subscription. That's better. |
| `ad_03` | `ad_f` | Kell's Rest. Sleep four hours, wake up owing nothing. Terms apply. Many terms apply. |
| `ad_04` | `ad_m` | New from Vantage Optics — see the sky the way it used to be, for eleven credits a month, forever. |
| `ad_05` | `ad_f` | EVERY UNIT MUST GO. EVERY UNIT. WE ARE NOT COMING BACK. |
| `ad_06` | `ad_m` | Drownings Reclamation. We buy anything. We do not ask. |
| `ad_07` | `ad_f` | Cinder Step Storage. Your things, somewhere else, forever, for less. |
| `ad_08` | `ad_m` | Feeling slow? Feeling grey? That is your body asking for Bright. Bright is a drink. Bright is a choice. Bright is nine credits. |
| `ad_09` | `ad_f` | The Gantry Market. Everything you need and eleven things you do not. Bring a light. |
| `ad_10` | `ad_m` | Halyard Nine Clinic. Walk in with a problem. Walk out with a payment plan. |
| `ad_11` | `ad_f` | CLOSING DOWN. CLOSING DOWN. AGAIN. |
| `ad_12` | `ad_m` | Pike Deck Fuel. The cheapest on the approach, because we are the furthest from anywhere. |
| `ad_13` | `ad_f` | New from Vantage Optics. The Clear filter. See the city the way the architects intended it, with none of the people in it. |
| `ad_14` | `ad_m` | Sunder Rest Insurance. We cover everything except what happens. |
| `ad_15` | `ad_f` | Kell's Rest Noodles. Open all night, because the night is also open. |
| `ad_16` | `ad_m` | Own a piece of Pale Terrace. Forty floors, one owner, and it could be you. It will not be you. |

---

## `distress` — the open emergency band

**14 slots** · `fore` · `tag: alert` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **EMERGENCY BAND**

| slot | voice | line |
|---|---|---|
| `distress_01` | `dis_b` | Mayday, mayday — cell's gone, I'm at ninety metres and dropping, anyone on this band — |
| `distress_02` | `dis_c` | I AM IN THE SMOG BAND. I CANNOT SEE THE LANE. I CANNOT SEE THE LANE. |
| `distress_03` | `dis_a` | It's not an emergency yet. I'm just saying it might be. In about a minute. |
| `distress_04` | `dis_d` | GET OFF THE PAD. GET OFF THE PAD NOW. |
| `distress_05` | `dis_f` | Cancel the mayday. I found a ledge. It'll do. |
| `distress_06` | `dis_b` | Anyone on this band, I have a cargo fire, repeat, cargo fire, I am putting it down on the first flat thing I can see. |
| `distress_07` | `dis_c` | IT IS COMING OFF. THE WHOLE PANEL IS COMING OFF. GET CLEAR OF ME. |
| `distress_08` | `dis_a` | This is not an emergency. I am formally declaring that it is not an emergency. Please stay on this channel anyway. |
| `distress_09` | `dis_f` | I have lost the lane markers over Sootfields. I am flying on the instruments and the instruments have opinions. |
| `distress_10` | `dis_e` | SOMEBODY IS IN THE WATER. SOMEBODY IS IN THE WATER OFF THE DROWNINGS. |
| `distress_11` | `dis_d` | Cell at eight per cent. Eight. I am nine minutes from anywhere. Please tell me somebody is nearer than that. |
| `distress_12` | `dis_b` | My passenger has stopped answering me. I do not know what to do about that at four hundred metres. |
| `distress_13` | `dis_a` | Correction to my last. Correction. I have it back. I have it back. Stand down. Thank you. Thank you. |
| `distress_14` | `dis_f` | Mayday relay, mayday relay. I am not the one in trouble. I am just the one who can still transmit. |

---

## `weather` — the Atmospheric Bulletin

**14 slots** · `fore` · `tag: info` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **ATMOSPHERIC**

| slot | voice | line |
|---|---|---|
| `weather_01` | `bulletin` | Atmospheric bulletin. Particulate density high below one hundred metres. Visibility, four hundred. Conditions are within normal. |
| `weather_02` | `bulletin` | Precipitation across all districts for the next nine hours. Surface reflectivity elevated. Reduce approach speed. |
| `weather_03` | `bulletin` | Daylight index, zero point two. This is the maximum for today. |
| `weather_04` | `bulletin` | Electrical activity above three hundred metres. Craft in the upper lanes should descend. Craft that cannot descend should continue. |
| `weather_05` | `bulletin` | The smog band has lifted to one hundred and forty metres. Enjoy the view. |
| `weather_06` | `bulletin` | Atmospheric bulletin. Wind shear across the upper lanes above two hundred metres. Craft under six tonnes should not be up there. Craft over six tonnes are not our concern. |
| `weather_07` | `bulletin` | Rainfall total for the period, forty one millimetres. Rainfall total for the year, unavailable. The instrument is under water. |
| `weather_08` | `bulletin` | Bulletin. Temperature, eleven degrees. Temperature at street level, unknown. Nobody is measuring street level. |
| `weather_09` | `bulletin` | Visibility at the Spine, two hundred metres. Visibility at Sootfields, one hundred. Visibility at the Drownings, not applicable. |
| `weather_10` | `bulletin` | Advisory. Ice is forming on approach surfaces above three hundred and twenty metres. Descend, or accept the ice. |
| `weather_11` | `bulletin` | Atmospheric bulletin. The particulate index has been revised. It has not improved. The index has been revised. |
| `weather_12` | `bulletin` | Daylight index, zero point one. Sunrise occurred. Sunset will occur. Neither will be visible. |
| `weather_13` | `bulletin` | Bulletin. A pressure front is crossing Vault Row. Expect turbulence, expect delay, expect the usual. |
| `weather_14` | `bulletin` | Conditions are within normal. Normal has been revised twice this year. |

---

## `life` — the city talking to itself

**35 slots** · `fore` · `tag: info` · gain 0.9 · cooldown 1500 s

Speaker label on screen: **OPEN CHANNEL**

| slot | voice | line |
|---|---|---|
| `life_01` | `hauler` | Third time at this pad and the lift's still out. I'm carrying it up. Forty floors. Somebody owes me a drink. |
| `life_02` | `life_f` | Market's open on the Gantry until two. Bring your own light, the strip's been dead since spring. |
| `life_03` | `life_c` | Anyone flying past Sixteen Low — is that a fire or is that just Tuesday? |
| `life_04` | `life_l` | Tower maintenance, block nine. We are aware the beacon is out. We have been aware for some time. |
| `life_05` | `life_k` | Taxi four-one-one, off shift, going home. Whoever's got the Lantern run tonight — good luck, and I mean that. |
| `life_06` | `life_n` | My kid asked what the sky looks like. I said grey. She said what's grey. Fair question. |
| `life_07` | `life_c` | GET IT OFF THE EDGE. OFF THE EDGE. IT IS NOT SECURED. |
| `life_08` | `life_g` | Understack, if you're listening — play the one about the windows again. It's been a week. |
| `life_09` | `hauler` | Twenty two hours on this run and I have seen the same advert for paste eleven times. Eleven. I could recite it. I will not, but I could. |
| `life_10` | `hauler` | They have resurfaced the Spine Run and it is worse. I do not know how you make a lane worse, but they have found a way and they should be proud of themselves. |
| `life_11` | `hauler` | Does anybody know a pad that will take a nine tonner after midnight? And before you say Tallow Yard, Tallow Yard says no. Tallow Yard always says no. |
| `life_12` | `hauler` | Cargo is fine, I am fine, and the craft is making a noise it was not making yesterday. That is the whole report. |
| `life_13` | `hauler` | Four hours left, a flask of something brown, and a lane full of couriers who all think they are the only one in it. |
| `life_14` | `hauler` | It says here I am carrying agricultural equipment. There is no agriculture. I have never seen a field. I am carrying something, I will give them that. |
| `life_15` | `life_a` | Anyone at the Bell Yard, the lift is out again. And before you ask, yes, I have told them, and yes, they have noted it. |
| `life_16` | `life_b` | The tea place on Quill Run has closed. Just so everyone knows. I am still processing it. |
| `life_17` | `life_c` | Whoever keeps parking across the Ninefold Approach, I have your registry and I have nothing else to do. |
| `life_18` | `life_d` | I have been flying this city forty years and it has never once been finished. Not once. Always scaffolding. |
| `life_19` | `life_e` | My grandson says he is going to work up on the Spine. I said, lovely. I said, and where will you sleep. He has not answered. |
| `life_20` | `life_f` | Market is on the Gantry until two. Bring your own light. And your own bag. And, honestly, your own opinion about the fish. |
| `life_21` | `life_g` | Is anyone else's beacon showing Cinder Step twice? Mine is showing it twice. There is one Cinder Step. |
| `life_22` | `life_h` | Fourteen years on this band and I still do not know who runs it. I just know it is always on. |
| `life_23` | `life_i` | Somebody's dog is on the Gantry roof again. It is fine. It lives up there now, apparently. |
| `life_24` | `life_j` | First shift tonight. If I sound nervous it is because I am nervous. Be nice to me, lane. |
| `life_25` | `life_k` | Off shift, going down, going home, going to sleep for a very long time. Good luck to whoever has the Lantern run. |
| `life_26` | `life_l` | Tower maintenance, block four. We know about the lights. We have known about the lights since spring. |
| `life_27` | `life_m` | Does anybody actually live in Pale Terrace? I have flown past it every night this month and I have never seen a curtain move. |
| `life_28` | `life_n` | A kid asked me today why the rain is warm. I did not have an answer. I still do not. |
| `life_29` | `life_a` | If the person who found a courier bag at Marrow Landing is listening, there is a photograph in it that matters to somebody. Please. |
| `life_30` | `life_h` | Reminder to whoever is flying the Ribs at fifty metres. There are people under you. You cannot see them. They can definitely hear you. |
| `life_31` | `life_f` | Somebody is playing the understack out loud on Pike Deck and honestly, good. |
| `life_32` | `life_b` | I have worked out that if I take Cinder Mile instead of the Spine Run I save four minutes and lose my mind. It is a trade. |
| `life_33` | `life_g` | The lamps in the Lantern Quarter are on the wrong colour again. Everyone looks ill. Everyone looks like that anyway, but more so. |
| `life_34` | `life_d` | Old Ferrand has gone. Just so you all know. He had that pad thirty years. Somebody put a light on for him. |
| `life_35` | `life_j` | That is me done. First run, delivered, nothing broken. I am going to talk about this for a week. |
| `life_36` | `life_d` | Whoever settled the Vane account — the old boy, not the kid — tell him the desk still has his paper. |
| `life_37` | `hauler` | Somebody was asking after a hauler by that surname at the Tallow desk. Not a friendly ask, if you follow. |
| `life_38` | `life_h` | Second time this month a courier has come in with a name on a docket that should not be on a docket. |

---

## `bg_net` — the traffic-net murmur (background — never shown on screen)

**14 slots** · `back` · `tag: bg` · gain 0.22 · cooldown 0 s

Background lines are **never shown on screen**, so they carry no `text` in the manifest and
nothing here has to match a popup. Each synthesised one is two people talking over each other,
rendered separately and stacked with a 0.9 s offset.

| slot | voices | said |
|---|---|---|
| `bg_net_01` | *SUNO* | *(overlapping traffic-net murmur — see §2's B1 prompt)* |
| `bg_net_02` | *SUNO* | *(overlapping traffic-net murmur — see §2's B1 prompt)* |
| `bg_net_03` | *SUNO* | *(overlapping traffic-net murmur — see §2's B1 prompt)* |
| `bg_net_04` | *SUNO* | *(overlapping traffic-net murmur — see §2's B1 prompt)* |
| `bg_net_05` | `life_c + life_k` | Seven four two is clear of the stack, going down to lane four. // Say again your last, you are breaking up. |
| `bg_net_06` | `life_h + life_d` | Negative on the Ardent beacon, it is still out. // It has been out three weeks. |
| `bg_net_07` | `life_l + life_b` | Holding at one forty until you clear me. // Nothing moving on pad nine, tell them to circle. |
| `bg_net_08` | `life_g + life_i` | Ninefold approach, one inbound, nine tonnes, wet. // Copy, put him on the outer. |
| `bg_net_09` | `life_n + life_j` | End of shift. Somebody else can have it. // Roger that, and good luck to them. |
| `bg_net_10` | `life_a + life_c` | Anyone got eyes on the lane markers over Sootfields? // Nobody has eyes on anything over Sootfields. |
| `bg_net_11` | `life_m + life_f` | Confirm you are two hundred and descending. // Confirmed, two hundred, descending, all quiet. |
| `bg_net_12` | `life_e + life_h` | Vault Row is closed to the low approach until the morning. // Understood, we will take the high side. |
| `bg_net_13` | `life_k + life_d` | That freighter is still across my lanes. // It is temporary. They told me it is temporary. |
| `bg_net_14` | `life_b + life_g` | Pike Deck, one in, one out, no delay. // Copy Pike Deck, nothing behind him. |

---

## `bg_dock` — dock-hand chatter, only while docked (background — never shown on screen)

**10 slots** · `back` · `tag: bg` · gain 0.22 · cooldown 0 s

Background lines are **never shown on screen**, so they carry no `text` in the manifest and
nothing here has to match a popup. Each synthesised one is two people talking over each other,
rendered separately and stacked with a 0.9 s offset.

| slot | voices | said |
|---|---|---|
| `bg_dock_01` | `life_c + life_f` | Left side. Left side. No, the other left. // It is sealed, do not shake it. |
| `bg_dock_02` | `life_g + life_d` | Whose is the black one on pad two? It has been there since Tuesday. // Nobody's. That is the whole problem. |
| `bg_dock_03` | `life_c + life_a` | MIND THE EDGE. MIND THE EDGE. // He does that every single time. |
| `bg_dock_04` | `life_i + life_l` | Sign for it and it is yours, I am not carrying it back. // I am not signing for something I cannot see inside. |
| `bg_dock_05` | `life_h + life_k` | Straps on, straps on, we are not doing this twice. // It moved last time. I saw it move. |
| `bg_dock_06` | `life_m + life_n` | Pad three has no power again, run it off the cart. // The cart has no power either. Nothing has power. |
| `bg_dock_07` | `life_e + life_j` | Tea is going, last call, I am not asking twice. // Two minutes, I am nearly done here. |
| `bg_dock_08` | `life_b + life_f` | That one goes up the Spine, do not put it with the Ribs run. // It is already with the Ribs run. |
| `bg_dock_09` | `life_d + life_c` | Rain is coming in sideways again, get the covers on. // The covers are wetter than the cargo. |
| `bg_dock_10` | `life_a + life_i` | Whoever is on the roof, we can hear you, and you are very loud. // Then stop listening. |

---
---

# 5. THE CAST

31 voice identities over 16 installed macOS voices. Where two identities share a base
voice they differ in pitch, in words-per-minute and usually in radio profile — a ±7 % pitch shift
moves the formants as well as the pitch, so behind a 3.4 kHz band-limit it reads as a different
person rather than the same person sped up. Listen to the whole cast in one file:
`python3 tools/vo/gen_chatter.py --demo` → `tools/vo/raw/voice_demo.mp3`.

| id | macOS voice | pitch | wpm | profile | who |
|---|---|---|---|---|---|
| `ctrl_a` | Samantha | 1.00 | 208 | `close` | Haul Control, day operator — US female, calm and clipped |
| `ctrl_b` | Karen | 0.97 | 199 | `close` | Haul Control, night operator — AU female, dry |
| `ctrl_c` | Tessa | 1.03 | 220 | `close` | Haul Control, relief operator — ZA female, brisk |
| `patrol_a` | Daniel | 0.93 | 188 | `loud` | City Patrol officer — GB male, bored authority |
| `patrol_b` | Rocko (English (US)) | 1.00 | 179 | `loud` | City Patrol second unit — deep US male |
| `patrol_c` | Tara | 1.00 | 182 | `close` | City Patrol dispatcher — IN female, procedural |
| `dj` | Aman | 1.07 | 235 | `thin` | The Understack pirate DJ — over-modulated, cheap gear |
| `ad_f` | Moira | 1.09 | 208 | `close` | commercial announcer - bright female, too close to the microphone |
| `ad_m` | Daniel | 1.09 | 205 | `close` | commercial announcer - bright male, pitched up and pushed |
| `bulletin` | Karen | 0.99 | 162 | `close` | Atmospheric Bulletin - flat, evenly paced, no emotion whatsoever |
| `hauler` | Ralph | 0.98 | 170 | `distant` | long-haul freight driver — deep, weary, talks to fill the hours |
| `life_a` | Moira | 1.00 | 197 | `close` | IE female |
| `life_b` | Rishi | 1.00 | 188 | `close` | IN male |
| `life_c` | Fred | 1.00 | 168 | `close` | US male, gruff |
| `life_d` | Grandpa (English (US)) | 1.00 | 168 | `distant` | old US male |
| `life_e` | Grandma (English (UK)) | 1.02 | 168 | `close` | old GB female |
| `life_f` | Samantha | 1.06 | 186 | `close` | GB female -> US female, brisk |
| `life_g` | Sandy (English (US)) | 0.96 | 200 | `close` | US female, high |
| `life_h` | Reed (English (UK)) | 1.02 | 193 | `close` | GB male |
| `life_i` | Eddy (English (UK)) | 0.96 | 184 | `close` | GB male, distant |
| `life_j` | Daniel | 1.06 | 228 | `close` | GB male, younger |
| `life_k` | Karen | 1.07 | 215 | `distant` | AU female, younger |
| `life_l` | Tessa | 0.94 | 195 | `close` | ZA female, lower |
| `life_m` | Aman | 0.93 | 186 | `close` | IN male, lower |
| `life_n` | Samantha | 0.92 | 175 | `distant` | US female, lower |
| `dis_a` | Moira | 1.04 | 240 | `thin` | emergency band — IE female |
| `dis_b` | Rishi | 1.05 | 246 | `thin` | emergency band — IN male |
| `dis_c` | Sandy (English (US)) | 1.00 | 210 | `loud` | emergency band — US female |
| `dis_d` | Rocko (English (US)) | 1.03 | 195 | `thin` | emergency band — deep US male |
| `dis_e` | Tara | 1.06 | 253 | `loud` | emergency band — IN female |
| `dis_f` | Daniel | 1.00 | 233 | `thin` | emergency band — GB male |

---

## Slot summary

| group | slots | on screen | tag |
|---|---|---|---|
| music | 9 | — | — |
| `dispatch` | 19 | yes | `alert` |
| `dispatch_confirm` | 20 | yes | `alert` |
| `dispatch_pay` | 20 | yes | `alert` |
| `police` | 26 | yes | `alert` |
| `pirate` | 15 | yes | `info` |
| `ad` | 16 | yes | `info` |
| `distress` | 14 | yes | `alert` |
| `weather` | 14 | yes | `info` |
| `life` | 35 | yes | `info` |
| `bg_net` | 14 | no | `bg` |
| `bg_dock` | 10 | no | `bg` |
| **total** | **212** | **179 foreground** | |

---
---

# 6. THE STORY VO — S2-E's intro cutscene

**This is the one place in NEONHAUL where SUNO is the better tool, and S2-B's verdict is why.**
Whisper transcription scored the local `say` pipeline **90.7 %** against SUNO's **88.1 %** on radio
chatter — but that comparison was made through a 3.4 kHz band-limit, where flatness reads as cheap
gear. The Boss is **not on a radio**. He is sitting in a craft eight metres away with his canopy
open, talking over a twenty-year-old who has just realised what their father has done. There is no
band-limit to hide behind and the whole scene is a performance.

So: **the local takes ship now** (`tools/vo/gen_story.py`, 19 clips, 497 KB, in
`assets/audio/story/`) and the scene is complete and testable today. These prompts exist so Aaron
can upgrade the Boss in one session without anyone having to re-derive the script.

## What to replace, and what not to

| | replace with SUNO? | why |
|---|---|---|
| `boss_01` … `boss_07` | **yes — this is the whole point** | seven lines, gender-invariant, one voice, one session |
| `pc_*_int1/2/3` | no | three words each; there is nothing to perform |
| `pc_*_close` | optional, and it is 3 takes | the monologue is the only player line worth a real read |

**Drop-in rule.** Save the take as `assets/audio/story/boss_0N.mp3` and nothing else changes —
`js/storyui.js`'s `StoryVoice` fetches by slot name and `SCRIPT[n].hold` is the on-screen time. If a
SUNO take is longer than its `hold`, raise the `hold` in `js/storyui.js` to match; the bubble timing
is written in that one table and nowhere else.

**Do NOT run these through `tools/radio_fx.sh`.** That is the radio chain. Run them through
`gen_story.py`'s `room()` treatment instead, or nothing at all — a band-limited Boss sounds like
dispatch, and dispatch is the one thing this scene must not sound like.

## The voice

> **Style:** `spoken word only, no music, no melody, no beat, no background bed. A single male
> voice, mid-fifties, deep and unhurried. Close-mic'd, dry, small room. Completely calm — this is a
> conversation he has had many times and the outcome does not concern him. Never shouts. Slight
> smile in the delivery on the threats.`

The one direction that matters: **he is not angry.** Every draft that plays him angry makes him
smaller. He is bored, and being bored while describing breaking somebody's arm is the character.

## S1 — `boss_01`

> **Lyrics:** `[Man, calm, quiet, unhurried] Don't get out. Don't touch the stick. Just listen.`

## S2 — `boss_02`

> **Lyrics:** `[Man, calm, conversational, faintly amused] That is a very nice craft you are
> flying. [slight pause] Insured to somebody else, I notice.`

## S3 — `boss_03`

> **Lyrics:** `[Man, calm, flat, matter of fact] Your father owes us fifty thousand. [pause] He has
> owed us fifty thousand for a while now.`

## S4 — `boss_04` — spoken OVER the player's "But—"

> **Lyrics:** `[Man, calm, cutting in, not raising his voice] He is away. You are here. That makes
> it yours.`

Direction: come in early and flat. He is not interrupting because he is annoyed, he is interrupting
because he was never going to stop.

## S5 — `boss_05` — spoken OVER the player's "Wait—"

> **Lyrics:** `[Man, calm, patient] Fifty thousand credits. We will come for it, [pause] and I
> would not make us look for you.`

## S6 — `boss_06` — the threat, spoken OVER the player's "Just wait—"

> **Lyrics:** `[Man, calm, almost pleasant, listing things] If it is not ready we take the craft
> and sell it. [pause] Then we break an arm. [pause] Then, [slight pause] if I am in a mood, we
> sell whoever was driving to whoever is buying.`

Direction: the list is the joke and the pauses are the performance. Nothing in it is emphasised.
This is the longest line in the game at 10.9 s locally, and the one worth the most from a real read.

## S7 — `boss_07`

> **Lyrics:** `[Man, calm, finishing a conversation] Make the money. Soon.`

## S8 — the escalation lines (**not** in the cutscene)

The four pressure messages arrive as text in the chatter ticker while the player is flying, keyed
off the warmth gauge's pace signal (`js/story.js` `BOSS_LINES`). **They currently have no audio at
all** and the game is complete without it. If Aaron wants them spoken, they are four more takes in
the same voice, and they would want the RADIO treatment rather than the room one — he is calling in,
not standing there. Slots would be `assets/audio/story/boss_msg1..4.mp3` and the wiring is one line
in `bossSays()`.

> **Lyrics 1:** `[Man, calm, flat] Better make money fast.`
> **Lyrics 2:** `[Man, calm, flat] Will be needing the money soon.`
> **Lyrics 3:** `[Man, calm, harder] Ensure you have the money ready.`
> **Lyrics 4:** `[Man, calm, final] We are on our way. Better have the money ready.`

## S9 — the player's closing monologue, `pc_{m,f,n}_close`

Three takes, ~20 years old, and the only player line long enough to be worth a real performance.

> **Style:** `spoken word only, no music. A twenty-year-old talking to themself in an empty cabin.
> Shaken, then angry, then decided — in that order, inside twelve seconds. Close-mic'd, dry.`
>
> **Lyrics:** `[Young {man/woman/person}, shaken] Shit. [pause] They wouldn't let me get a word in.
> [angrier] What sort of shit has my Dad got himself into? [quieter, looking around the cabin] I
> shouldn't even be flying this. [decided] But now I'm going to have to. I need to make that money
> fast.`

The neutral take is Aaron's own direction: **a high male or low female read**, not a processed one.

## Slot summary — story

| slot | who | takes | local sec | local bytes |
|---|---|---|---|---|
| `boss_01`–`boss_07` | the Boss | 1 each | 2.2–10.9 | 240 KB total |
| `pc_{m,f,n}_int1/2/3` | the player | 3 each | 0.5–0.9 | 44 KB total |
| `pc_{m,f,n}_close` | the player | 3 | 11.9 | 216 KB total |

19 clips · 497 KB · mean 26 KB. Only 11 of them are ever fetched in one session, because
`StoryVoice.preload(gender)` asks for the Boss plus one gender's takes.

### §S2-J — four seeded lines (2026-08-20)

`life_36`, `life_37`, `life_38` and `pirate_16` are the story's remarks about the player's father.
They are ordinary pool entries in every respect — same voices, same `bg` tag, same chain, same
16 kbps mono — because that is the whole point: **a player who is not listening never notices them.**
The director never draws them on its own; `js/story.js` asks for them by name through
`radio.speak()`. Pool 203 → 207 slots, 2 283 → 2 333 KB.
