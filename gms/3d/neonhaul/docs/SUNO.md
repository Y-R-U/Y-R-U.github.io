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

**One track can be several slots.** Every chatter prompt contains several lines separated by
`[pause]`, so one generation gives you a whole group. `tools/split_chatter.py` silence-splits the
returned file and writes the numbered slots **in the order they are written here** — so don't
reorder the lines. If the split comes out wrong the tool tells you and leaves the whole file as
`_unsplit_<group>.mp3` for you to cut by hand; it never writes wrong files silently. If you'd rather
generate one line at a time, that works too — the manifest lists every line individually.

---

## STATUS — updated by P8 (the audio code), 2026-08-18

**The player-facing half of this file is done.** Every *required* slot is generated and every one of
them has been verified to contain real sound — not "the file exists", but decoded sample energy,
measured in the browser that will actually decode it. All 31 present clips read between **−18.5 and
−6.9 dBFS RMS**; the check that produced those numbers was proved able to fail by running it against
a deliberately silenced encode of `dispatch_01.mp3` (same duration, same codec, same byte size,
flagged silent). `tools/gates_p8.mjs` B5 and B6.

| | group | slots | on disk | note |
|---|---|---|---|---|
| M1 | `menu` | 1 | ✅ | see the caveat below — nothing plays it yet |
| M2 | `cruise_a` | 1 | ✅ | |
| M3 | `cruise_b` | 1 | ✅ | |
| M4 | `cruise_day` | 1 | ✅ | |
| M5 | `docked` | 1 | ✅ | |
| M6 | `chase` | 1 | — | optional; the `rush` pool is empty and falls through to cruise |
| M7 | `storm` | 1 | — | optional; `storm` falls through to cruise |
| M8 | `first_flight` | 1 | — | optional; `intro` falls through to cruise |
| M9 | `pirate` | 1 | — | optional; the diegetic station has nothing to play |
| B1 | `bg_net` | 4 | ✅ | |
| B2 | `bg_dock` | 3 | — | optional |
| C1 | `dispatch` | 6 | ✅ | |
| C2 | `dispatch_confirm` | 8 | ✅ | |
| C3 | `dispatch_pay` | 8 | ✅ | |
| C4–C9 | `police` `pirate` `ad` `distress` `weather` `life` | 35 | — | all optional |

**31 of 73 slots have a file. The other 42 are wired, listed, and behave correctly.** Every one of
them still speaks: an absent foreground line fires as a text-only popup on exactly the same schedule,
using the `text` in the manifest, which is this file's line copied character for character (asserted
against this document by gate A3). Deleting `assets/audio/` in its entirety was run as a test — the
game boots, renders, and the synthesised radio bed still plays (gates E1, E2).

**`assets/audio/manifest.json` now exists** with all 73 slots, generated from *this file* so the
popup text and the audio can never drift apart. You still do not need to touch it: drop an mp3 in
with the filename below and it plays. That was tested by staging one file into a slot that had none
(gate C1) — it decoded, played, ducked the music to 0.37×, and showed its popup for the computed
9.6 s hold, with no code change and no rebuild.

### Corrections to the arithmetic further down this file

- **"5 × 7 × 36 s ≈ 21 minutes before any foreground line repeats" is not right.** 21 minutes is the
  length of one shuffle-bag *cycle* — the mean interval — not a floor. A bag guarantees each line is
  heard once per cycle, which still allows the last line of one bag to come back near the front of
  the next. Measured over 200 seeded 25-minute runs with the bags alone: **0 of 200 were repeat-free,
  and the earliest repeat landed at 280 s.** The code therefore adds a per-slot **cooldown** (1500 s
  on ambient lines, 660 s on the two job pools) as a hard time floor on top of the bag. Measured over
  60 seeded *hour-long* runs, the shortest gap between two plays of any line is **1500.0 s exactly**
  — the floor, doing its job. Gates A4, A5 and A6.
- **The pool sizes in the table below are still exactly right** and are asserted by gate A2. The
  reason to generate the full eight lines of `life` rather than four is unchanged.

### Two things worth knowing before you generate more

1. **`menu.mp3` currently has nothing to play it.** The game has no menu screen — `main.js` runs
   `free | shot | auto | fly` and shows a boot overlay — so the music state machine resolves straight
   to `cruise`. The track is generated and correct; it needs a menu, or it stays unused. Flagged in
   `docs/P8_WIRING.md`, not silently wired to something else.
2. **Use `tools/vo/split_take.py`, not the `tools/split_chatter.py` §11 describes.** §11 specifies a
   silence-splitter and then explains why silence-splitting fails — SUNO puts a musical bed under
   spoken word, so `silencedetect` finds ~7 gaps where a 22-line take needs 21. `split_take.py`
   already exists, already solved this by aligning the known script against whisper's word stream,
   and already produced the 22 dispatch lines on disk. Writing the tool §11 asks for would be
   replacing a working tool with the algorithm it was built to escape. Its input is one small JSON
   per group, and those can be generated straight out of the manifest — the text is already there,
   in order:

   ```bash
   node -e '
   const m=require("./assets/audio/manifest.json"), g=process.argv[1];
   const lines=m.chatter.filter(c=>c.group===g).map(c=>({file:c.slot+".mp3",text:c.text}));
   require("fs").writeFileSync(`tools/vo/script_${g}.json`,JSON.stringify({group:g,lines},null,1));
   console.log(g,lines.length,"lines");' police
   ```

---

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

# 2. BACKGROUND CHATTER — 7 slots

Ambient, low in the mix, **never shown on screen**. Half-intelligible on purpose — these sit under
the synthesised traffic-net bed and make the city sound busy.

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

# 3. FOREGROUND CHATTER — 57 slots

These play at full radio gain **and** pop up on the HUD. Nine groups.

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

# 4. Slot summary

| group | slots | on screen | generations | required |
|---|---|---|---|---|
| music | 9 | — | 9 | M1, M2, M5 |
| `bg_net` | 4 | no | 1 | ✓ |
| `bg_dock` | 3 | no | 1 | |
| `dispatch` | 6 | yes | 1 | ✓ |
| **`dispatch_confirm`** | **8** | yes | 1 | **✓** |
| **`dispatch_pay`** | **8** | yes | 1 | **✓** |
| `police` | 6 | yes | 1 | |
| `pirate` | 5 | yes | 1 | |
| `ad` | 6 | yes | 1 | |
| `distress` | 5 | yes | 1 | |
| `weather` | 5 | yes | 1 | |
| `life` | 8 | yes | 1 | |
| **total** | **73** | 57 foreground | **21 generations** | 7 of them |

**How often you'll hear a repeat.** An ambient foreground line fires every 22–50 seconds (mean 36).
Lines are drawn from a **shuffle bag** per group — without replacement, reshuffled only when the bag
is empty — so no line can come back until its whole group has been heard. The binding case is a
five-line group, drawn roughly every seventh line: `5 × 7 × 36 s` ≈ **21 minutes** before any
foreground line repeats. The two job-event pools are separate: eight lines each, one per job at
~90 s, so a confirm or pay line repeats no sooner than **12 minutes**.

That is the arithmetic the pool sizes above were chosen against. **If you generate fewer lines in a
group than are listed here, tell the manager** — the numbers shrink proportionally and the game
starts sounding like a loop.
