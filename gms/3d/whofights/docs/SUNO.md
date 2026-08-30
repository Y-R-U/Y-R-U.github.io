# WHO FIGHTS — SUNO prompt sheet

Every track in the game's music library, as a **Style** block and (for the sung ones) a **Lyrics**
block. Paste the Style block into SUNO's *Style / Description* box and the Lyrics block into its
*Lyrics* box. Nothing needs editing first.

**You do not need this file.** The whole library already exists, generated locally with ACE-Step —
see `docs/MUSIC.md`. This sheet is here so you can regenerate any track on SUNO if you prefer its
take on it.

**Where a replacement goes**

```
gms/3d/whofights/audio/music/<id>.mp3
```

Save it under exactly the `<id>` shown in each section heading and it drops straight in — the game
reads `data/music.json`, which points at that filename. If your SUNO take is a different length,
fix the `seconds` field for that track in `data/music.json` (or re-run
`node tools/music/build_manifest.mjs` after updating `tools/music/results.json`); the fade/loop
runtime uses it.

**Instrumentals**: tick SUNO's *Instrumental* switch and leave Lyrics empty. Every instrumental
Style block below also says "no vocals" in words, because ACE-Step needed telling twice and SUNO
occasionally does too.

**Lengths.** Beds are 100–135 s and are meant to loop, not to be sat through. The stings are 20–25 s
and must resolve and stop. Do not let SUNO give you an 8-minute version of a bed — a take that runs
to the length cap stops rather than ends, and it will sound broken in game.

---

## §1 — Instrumental beds

### `menu_bed_01` — Who Fights

*noble, target 120s — local take: 120s*

**Style**

```
medieval fantasy title theme, instrumental, no vocals. slow and noble, 68 bpm, 4/4. solo celtic harp states the melody alone, then a small warm string section joins underneath. a single low horn holds long notes far back. patient, hopeful, a little wistful. clean acoustic recording in a stone hall, natural reverb. loops gently, no big ending.
```

**Lyrics** — none. Instrumental.


### `hall_bed_01` — The Contract Board

*stately, target 120s — local take: 120s*

**Style**

```
renaissance chamber consort, instrumental, no vocals. stately and curious, 84 bpm, 4/4. harpsichord and plucked lute trade a polite walking figure while viola da gamba and recorder answer. light tambourine on the offbeat. courtly, orderly, slightly inquisitive — the sound of a busy guild hall going about its morning. dry warm acoustic, no drums kit, no synths.
```

**Lyrics** — none. Instrumental.


### `hall_bed_02` — Instructors and Ledgers

*warm, target 110s — local take: 110s*

**Style**

```
medieval chamber music, instrumental, no vocals. warm and unhurried, 72 bpm, 6/8 lilt. celtic harp leads, low recorder and bowed cello underneath, occasional soft hand drum. gentle and welcoming rather than grand — background music for a hall where people are talking. acoustic, roomy stone reverb, no vocals at all, no modern instruments.
```

**Lyrics** — none. Instrumental.


### `meadow_bed_01` — Low Green Country

*pastoral, target 125s — local take: 125s*

**Style**

```
pastoral celtic folk instrumental, no vocals. gentle and open, 76 bpm, 6/8. tin whistle carries a simple pentatonic melody over fingerpicked acoustic guitar and harp, soft strings pad far behind, no percussion. sunlit, wide, walking-pace, faintly melancholy. field-recording air and birdsong feel. entirely instrumental.
```

**Lyrics** — none. Instrumental.


### `meadow_bed_02` — The Long Track East

*bright, target 110s — local take: 110s*

**Style**

```
bright folk instrumental, no vocals. cheerful travelling music, 104 bpm, 4/4. hammered dulcimer and fiddle play a bouncing melody together, upright bass walks, light bodhran keeps a steady walking pulse. major key, optimistic, breezy, forward motion. acoustic, close and dry. no singing.
```

**Lyrics** — none. Instrumental.


### `meadow_bed_03` — Rain Over the Fields

*wistful, target 115s — local take: 115s*

**Style**

```
quiet folk instrumental, no vocals. wistful and slow, 62 bpm, 3/4 waltz. solo nylon guitar and low whistle, sparse harp harmonics, a distant bowed string drone. grey weather, thoughtful, unresolved. very soft dynamics, lots of space between notes. purely instrumental, no percussion, no vocals.
```

**Lyrics** — none. Instrumental.


### `tavern_inst_01` — Room Tone, The Broken Shield

*cosy, target 120s — local take: 120s*

**Style**

```
solo lute noodling in a tavern corner, instrumental, no vocals. loose and unhurried, 70 bpm, free feel. one lute improvising a simple modal tune, sometimes pausing, occasional low fiddle drone underneath. background music nobody is listening to, warm and cosy, fireside. slightly imperfect timing, human. no percussion, no vocals, no other instruments.
```

**Lyrics** — none. Instrumental.


### `tavern_inst_02` — The Elbow Jig

*rowdy, target 105s — local take: 105s*

**Style**

```
fast irish tavern jig, instrumental, no vocals. rowdy and driving, 132 bpm, 6/8. fiddle and hurdy-gurdy in unison on a minor-key jig, tin whistle doubling on the repeat, bodhran and stamping feet, tambourine. sweaty, boisterous, a crowded floor. live acoustic, no vocals at all.
```

**Lyrics** — none. Instrumental.


### `tension_01` — Something on the Ridge

*tense, target 115s — local take: 115s*

**Style**

```
dark fantasy tension underscore, instrumental, no vocals. slow and creeping, 58 bpm. sustained low cello drone, sparse detuned dulcimer notes, a struck metal bowl ringing out every few bars, very quiet frame drum heartbeat. minor second dissonance held. dread building without ever arriving. no melody, no vocals, no drum kit.
```

**Lyrics** — none. Instrumental.


### `tension_02` — Torches Out

*uneasy, target 105s — local take: 105s*

**Style**

```
uneasy medieval underscore, instrumental, no vocals. 66 bpm, sparse. bowed double bass, tremolo violas high and thin, a single low male-register wooden flute playing three lonely notes, distant hand drum. cold stone corridor. suspense, not action. entirely instrumental, no singing, no synthesisers.
```

**Lyrics** — none. Instrumental.


### `combat_01` — Close Quarters

*combat, target 110s — local take: 110s*

**Style**

```
fantasy battle music, instrumental, no vocals. driving and urgent, 148 bpm, 4/4. big taiko and frame drums on a relentless pattern, low staccato strings ostinato, brass stabs on the accents, a wailing fiddle line over the top. minor key, aggressive, cinematic, no let-up. orchestral and folk instruments only, no vocals, no electric guitar.
```

**Lyrics** — none. Instrumental.


### `combat_02` — Hold the Line

*heroic, target 105s — local take: 105s*

**Style**

```
heroic fantasy battle music, instrumental, no vocals. 132 bpm, 4/4, marching. war drums and low toms, french horns and trombones carrying a bold rising theme, strings sawing underneath, clashing cymbals on the phrase ends. defiant and rallying rather than frightening. full orchestra, no vocals whatsoever.
```

**Lyrics** — none. Instrumental.


### `night_bed_01` — After the Candles

*quiet, target 130s — local take: 130s*

**Style**

```
very quiet night ambience with melody, instrumental, no vocals. 54 bpm, extremely sparse. a single low wooden flute plays slow phrases with long silences between them, over a barely-audible bowed drone and the occasional harp harmonic. still, cold, peaceful, lonely. almost ambient. no percussion, no vocals, dynamic range very low.
```

**Lyrics** — none. Instrumental.


## §2 — Instrumental stings (short, must resolve and stop)

### `victory_sting_01` — Contract Complete

*fanfare, target 25s — local take: 25s*

**Style**

```
short triumphant medieval fanfare, instrumental, no vocals. 110 bpm. natural trumpets and horns state a bright rising four-bar phrase, timpani roll, strings swell and a cymbal finishes it. major key, celebratory, resolves cleanly on the final chord. begins immediately, no intro. no vocals.
```

**Lyrics** — none. Instrumental.


### `victory_sting_02` — Well Fought

*fanfare, target 22s — local take: 22s*

**Style**

```
short warm folk victory sting, instrumental, no vocals. 100 bpm, 6/8. harp arpeggio flourish, fiddle and whistle answer with a bright little tune, tambourine, ends on a held major chord. small and human rather than orchestral. starts on the downbeat, no fade in. no vocals.
```

**Lyrics** — none. Instrumental.


### `defeat_sting_01` — Not This Time

*downbeat, target 22s — local take: 22s*

**Style**

```
short sombre fantasy sting, instrumental, no vocals. 60 bpm. low strings descend through a minor cadence, a single struck bell, muted horn holds the last note and fades. disappointed rather than tragic. no percussion beyond the bell, no vocals. resolves and stops.
```

**Lyrics** — none. Instrumental.


### `quest_sting_01` — Signed and Sealed

*curious, target 20s — local take: 20s*

**Style**

```
very short bright medieval flourish, instrumental, no vocals. 96 bpm. plucked lute run upward, recorder trill, small hand drum tap, finishes on a clean open chord. curious and encouraging, the sound of taking a job. two bars of nothing else. no vocals.
```

**Lyrics** — none. Instrumental.


## §3 — Tavern songs (with lyrics)

### `tavern_song_drinking_01` — The Ale Runs Low

*rowdy, target 130s — local take: 130s*

**Style**

```
rowdy medieval tavern drinking song. gruff male lead vocal with a whole tavern of men and women shouting the chorus back in rough unison. 118 bpm, 4/4, stomping. fiddle, accordion, lute, bodhran, stamping boots and tankards on tables. live, raucous, slightly out of tune and completely joyful. clear diction on the lead vocal.
```

**Lyrics**

```
[Verse 1]
(male) I signed my name on the contract board
(male) For a copper coin and a borrowed sword
(male) And I came back muddy and I came back late
(male) With a story worth twice what they paid

[Chorus]
(crowd) So pour it out, the ale runs low
(crowd) Pour it out, the ale runs low
(crowd) We'll be up at dawn and gone by noon
(crowd) But the ale runs low tonight

[Verse 2]
(male) There's a boy at the Academy learning his letters
(male) He'll be better than me and I hope he does better
(male) But tonight he's here with a cup in his hand
(male) And he sings just as loud as the rest of the band

[Chorus]
(crowd) So pour it out, the ale runs low
(crowd) Pour it out, the ale runs low
(crowd) We'll be up at dawn and gone by noon
(crowd) But the ale runs low tonight

[Outro]
(crowd) The ale runs low tonight
```


### `tavern_song_boast_01` — I Fought a Bear

*comic, target 128s — local take: 128s*

**Style**

```
comic boastful tavern song. one theatrical male baritone lead who clearly thinks a lot of himself, answered by a jeering mixed crowd on the chorus. 108 bpm, 4/4, swaggering. accordion, fiddle, plucked bass, snare rim and tambourine, occasional laughter. music hall energy in a medieval costume. crisp diction, comedic timing, family friendly.
```

**Lyrics**

```
[Verse 1]
(male) I have wrestled a bear, or I nearly did
(male) It was watching me closely from over the ridge
(male) And I looked at the bear and the bear looked at me
(male) And we came to an honourable treaty

[Chorus]
(crowd) He's the bravest man in the guild
(male) I am
(crowd) He has never once run from a fight
(male) Well
(crowd) He's the bravest man in the guild tonight

[Verse 2]
(male) I have swum the cold river with a pack on my back
(male) I have carried three friends and a barrel of tack
(male) I have stood in the doorway when nobody would
(male) And I'd do it again if I thought that I could

[Chorus]
(crowd) He's the bravest man in the guild
(male) I am
(crowd) He has never once run from a fight
(male) Well
(crowd) He's the bravest man in the guild tonight
```


### `tavern_song_ballad_01` — The Girl Who Went to the Ridge

*wistful, target 135s — local take: 135s*

**Style**

```
slow celtic folk ballad, solo female vocal. clear unornamented alto voice, close mic, front and centre. 66 bpm, 3/4. fingerpicked nylon guitar and celtic harp only, with a low whistle answering at the end of each line and a soft string pad on the choruses. no percussion. sad, tender, restrained, beautiful. traditional folk phrasing.
```

**Lyrics**

```
[Verse 1]
(female) She was seventeen and she signed her name
(female) On the lowest line of the contract board
(female) Her mother said the road was long
(female) Her father said no more

[Chorus]
(female) But the ridge was green and the morning wide
(female) And she went up with the sun
(female) And whatever it is you're waiting for
(female) She is halfway there, and gone

[Verse 2]
(female) They say she keeps a lantern lit
(female) In a tower on the eastern side
(female) And every year another one
(female) Goes walking up that ridge

[Chorus]
(female) And the ridge was green and the morning wide
(female) And she went up with the sun
(female) And whatever it is you're waiting for
(female) She is halfway there, and gone
```


### `tavern_song_work_01` — Haul Away

*gruff, target 120s — local take: 120s*

**Style**

```
call and response work song, sea-shanty style but landlocked. one gruff male caller, a big rough crowd of men and women answering in unison. 96 bpm, 4/4, heavy downbeat. almost no instruments — stamping feet, hands on a table, a single low accordion drone and a bodhran. voices carry everything. muscular, communal, unaccompanied feel, recorded in a big wooden room.
```

**Lyrics**

```
[Verse 1]
(male) There's a wagon in the mud
(crowd) Haul away
(male) And it's loaded to the hub
(crowd) Haul away
(male) And the axle's near in two
(crowd) Haul away
(male) And there's nothing else to do
(crowd) Haul away, haul away

[Chorus]
(crowd) Heave, and the wheel comes round
(crowd) Heave, and the rope holds sound
(crowd) One more pull and we're on the road
(crowd) Haul away, haul away

[Verse 2]
(male) I have carried worse than this
(crowd) Haul away
(male) I have carried it uphill
(crowd) Haul away
(male) I have carried it alone
(crowd) Haul away
(male) And I'm glad you're here, you know
(crowd) Haul away, haul away

[Chorus]
(crowd) Heave, and the wheel comes round
(crowd) Heave, and the rope holds sound
(crowd) One more pull and we're on the road
(crowd) Haul away, haul away
```


### `tavern_song_jig_01` — Boots Under the Table

*joyful, target 125s — local take: 125s*

**Style**

```
fast tavern jig with singing, male and female duet trading lines and singing the chorus together in harmony. 138 bpm, 6/8, relentless. fiddle, hurdy-gurdy, tin whistle, bouzouki, bodhran and stamping. breathless, dancing, grinning. live and loud. both voices bright and clear, no growling.
```

**Lyrics**

```
[Verse 1]
(female) Well the fiddler's got his elbow up
(male) And the floor has got a beat
(both) And there's nobody left sitting down
(both) With their boots beneath the seat

[Chorus]
(both) Boots under the table, boots on the floor
(both) Boots going out through the tavern door
(both) Dance while the candle's tall
(both) We ride at dawn and that's all

[Verse 2]
(male) I've a blister and a broken strap
(female) And a shoulder full of rain
(both) But the fiddler doesn't care for that
(both) So we're up and round again

[Chorus]
(both) Boots under the table, boots on the floor
(both) Boots going out through the tavern door
(both) Dance while the candle's tall
(both) We ride at dawn and that's all
```


### `tavern_song_lament_01` — Ten Went Out

*sombre, target 130s — local take: 130s*

**Style**

```
slow tavern lament, solo male voice, weathered tenor, singing almost unaccompanied. 58 bpm, 3/4. one quiet lute and a low bowed drone, a second male voice joining softly in harmony only on the last chorus. no percussion. dignified grief, understated, everyone in the room gone quiet. very intimate close recording.
```

**Lyrics**

```
[Verse 1]
(male) Ten went out on the northern road
(male) Ten went out in the spring
(male) Nine came back with the wagon and the gold
(male) And nobody wants to sing

[Chorus]
(male) So fill the cup and set it down
(male) At the place we always keep
(male) And say the name, and say it plain
(male) And let the fire burn deep

[Verse 2]
(male) She was better on the rope than me
(male) She was better on the climb
(male) And she'd tell me now to drink it up
(male) And stop wasting good time

[Chorus]
(both) So fill the cup and set it down
(both) At the place we always keep
(both) And say the name, and say it plain
(both) And let the fire burn deep
```


### `tavern_song_anthem_01` — Who Fights

*comic, target 122s — local take: 122s*

**Style**

```
silly guild anthem sung by a whole tavern, mixed male and female crowd in loud rough unison with a single male voice interjecting the jokes. 124 bpm, 4/4, marching stomp. accordion, brass band oompah, snare drum, tankards, cheering. proud and completely ridiculous. call and response shouting on the chorus. family friendly, clear diction.
```

**Lyrics**

```
[Verse 1]
(crowd) We are the finest in the land
(crowd) It says so on the sign
(crowd) We painted it ourselves last week
(crowd) And honestly, it's fine

[Chorus]
(crowd) Who fights? We fight
(crowd) Who pays? They pay
(crowd) Who is going to clean the hall tonight
(male) Not me
(crowd) Hooray

[Verse 2]
(crowd) We've a wizard who has lost his hat
(crowd) A knight who's lost his horse
(crowd) A cook who is a better shot
(crowd) Than anyone, of course

[Chorus]
(crowd) Who fights? We fight
(crowd) Who pays? They pay
(crowd) Who is going to clean the hall tonight
(male) Not me
(crowd) Hooray
```


### `tavern_song_ballad_02` — The Lantern in the Window

*warm, target 132s — local take: 132s*

**Style**

```
warm hopeful folk ballad, solo female vocal with a male voice harmonising underneath on the choruses. 72 bpm, 4/4, gently rolling. celtic harp, acoustic guitar, cello, a low whistle, very soft brushed frame drum entering halfway. homecoming, comfort, candlelight. rich and full but never loud. clear tender singing.
```

**Lyrics**

```
[Verse 1]
(female) Leave a lantern in the window
(female) When the road is dark and long
(female) There's a hundred going out tonight
(female) And they'll all be coming home

[Chorus]
(female) So keep the door upon the latch
(female) Keep the kettle on the coal
(female) I have walked a hundred colder miles
(female) And I know the way home

[Verse 2]
(female) There is nothing on the mountain
(female) That is worth another year
(female) I have carried what they asked me to
(female) And I'm carrying it here

[Chorus]
(both) So keep the door upon the latch
(both) Keep the kettle on the coal
(both) I have walked a hundred colder miles
(both) And I know the way home
```


---

_Generated by `tools/music/build_suno_doc.mjs` from `tools/music/jobs.json`. Edit the jobs file, not this._
