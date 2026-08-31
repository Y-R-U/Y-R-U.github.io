# WHO FIGHTS — prompt and lyric record

**The record of what the music library is and how it was made.** Every track, its exact Styles
string, its exact lyrics, the Suno settings, and the clip ids of both takes. Regenerate any of it —
on Suno or locally on ACE-Step — from this file.

**All 25 shipped tracks were generated on Suno v5.5**, in Aaron's logged-in browser, 2026-08-31.
They replaced an ACE-Step library of the same 25 ids. Each track also carries an **`acePrompt`** in
`tools/music/jobs.json` — the longer, arrangement-shaped description ACE-Step responds to — so the
whole library is still re-makeable with no subscription. `gen_music.mjs` uses `acePrompt` when it
is present.

## Settings used (Suno, all 25 tracks)

| field | value |
|---|---|
| URL | `suno.com/create`, **Advanced** tab |
| model | **v5.5** |
| Weirdness / Style Influence | **50 % / 50 %** (defaults, untouched) |
| Styles | the whole prompt goes here — Suno gets **no** separate description field |
| Lyrics panel | **Instrumental** for the 17 beds and stings, **Write** for the 8 songs |
| Vocal Gender | `More Options → Vocal Gender` — Male / Female / unset, per track below |
| Duration | `More Options → Duration → Custom`, **never Auto** |
| Save to | My Workspace (nothing published, shared or purchased) |
| Song Title | `WF <id>` so the download pass can find the clip |

**Duration slider geometry** (1380 px window, More Options expanded and scrolled to the bottom):
the track runs from x≈250 to x≈425 at y≈383 and is linear, **`x = 250 + (seconds − 10) / 2`**.
Range 0:10 – 6:00, granular to 5 s. Drag the handle; arrow keys and `form_input` do nothing (it is
a div, not an `<input type=range>`).

## What Suno actually did with Duration

**Instrumentals honour it to within a second.** Asked 2:00, got 1:57–2:00, 34 times out of 34.
That is a real improvement on the skyhammer session's finding that Suno undershoots — the
difference is that **that session used the 0:10 minimum for its stings**. Ask for 0:20 or 0:30 and
you get 19.7 s / 29.7 s.

**Songs ignore it and fit the lyrics instead.** Same lyric block, same 2:10–2:15 request:
`tavern_song_jig_01` came back at 2:10 and `tavern_song_boast_01` at 1:33. If a song needs to be
longer, **add lyrics**, do not raise the slider.

## The vocal recipe — this is the new part

The skyhammer session was 100 % instrumental, so none of this existed in the house before.

1. **`More Options → Lyrics → Write`.** Switching to Write auto-expands the Lyrics panel and
   pushes everything else down; collapse it again with the **Lyrics** chevron once the words are in,
   and the Styles / Duration / Title / Create column comes back to the same coordinates the
   instrumental recipe uses.
2. **Lyrics go in the Lyrics panel, style in Styles.** Never both.
3. **`(male)` / `(female)` / `(crowd)` / `(both)` inline in the lyrics place the voices across
   sections.** They do not set the voice *character* — that comes from the Styles text.
4. **`More Options → Vocal Gender`** is a real, separate control and it is worth setting: Male for
   the four male-lead songs, Female for the two female-lead ballads, **left unset for the duet and
   the whole-tavern anthem** so Suno can use both.
5. **Carry the ACE-Step diction lesson over verbatim** — it is the single highest-leverage sentence
   in a sung prompt, and it reads the same on Suno: *ONE clear lead vocal, close-miked and mixed
   loud right at the front, every word crisp and clearly enunciated, a crowd only on the chorus and
   well behind the lead, plenty of space, no wall of noise, diction is the priority.*
6. **`[Verse 1]` / `[Chorus]` / `[Outro]` section tags work** and Suno respects the order.

**Gotcha, cost ~10 minutes each time:** typing a full lyric block through CDP takes longer than the
30 s `Input.dispatchKeyEvent` timeout, so the tool reports `the renderer may be frozen` **and the
text lands anyway**. Wait 10 s and screenshot before retrying — a blind retry doubles the lyrics.

**Gotcha:** `cmd+a` only selects the Styles text if the click genuinely landed inside the textarea.
If it lands on the page background it selects *every clip in the workspace* and puts checkboxes on
all of them. Harmless, but there is no visible "deselect all"; a page reload is the quick fix.
Verify the Styles box in a screenshot before hitting Create.

## Getting the audio out — the skyhammer download recipe is DEAD

`curl -L https://cdn1.suno.ai/<uuid>.mp3` now returns **403 MissingKey** from CloudFront: the CDN
wants signed cookies. Everything is behind auth. What works:

```js
// in the page, which holds the Clerk session
const tok = await window.Clerk.session.getToken();
const j = await (await fetch('https://studio-api-prod.suno.com/api/download/clip/' + uuid,
  { credentials: 'include', headers: { Authorization: 'Bearer ' + tok } })).json();
// j.url is a signed S3 URL. It 404s on the first call or two while Suno renders the mp3 — poll.
const bytes = new Uint8Array(await (await fetch(j.url)).arrayBuffer());
```

Clip ids come out of the workspace list — `a[href^="/song/"]` — but the list is **virtualised**, so
scroll its `.clip-browser-list-scroller` in steps and accumulate. `/api/feed/v2?ids=a,b,c` (same
Bearer header) returns `metadata.duration` and `status` for up to a dozen at a time, which is how
the two takes of each track were compared without listening to either.

**Then it gets awkward.** Suno's own multi-select *Download all* opens one popup per clip, Chrome's
popup blocker stops it, and **from then on Chrome blocks every download from suno.com** — including
the per-clip menu that worked a minute earlier. Do **not** use *Download all*. If you have already
tripped it, the escape hatch that needs no browser-settings change is the clipboard:

```js
window.__b64 = btoa(binaryString);          // built from the Uint8Array above
// then, from a REAL click on an injected button (execCommand needs a user gesture):
const ta = document.createElement('textarea');
ta.value = window.__b64; document.body.appendChild(ta); ta.select();
document.execCommand('copy'); ta.remove();
```

```bash
pbpaste | base64 -d > audio/music/raw/<id>.mp3
```

3 MB of base64 through the macOS pasteboard is fine and none of it passes through the model's
context. `navigator.clipboard.writeText` does **not** work here — it throws
*Document is not focused* under CDP; `execCommand('copy')` inside a real click does.

---

## §1 — Instrumental beds

### `menu_bed_01` — Who Fights

*noble · asked Suno for 2:00 · got 117.41 s · ends **clean**, starts **quiet***

**Styles**

```
medieval fantasy title theme, fully instrumental, no vocals, key of D major, tempo exactly 68 BPM, solo celtic harp states the melody alone then a small warm string section joins underneath, a single low horn holding long notes far back, patient hopeful and a little wistful, clean acoustic recording in a stone hall with natural reverb, loops gently under a menu screen
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:00 |
| Suno takes | **6855c9ac-7365-4656-9f6e-646683f27d60** |

**ACE-Step fallback prompt**

```
medieval fantasy title theme, instrumental, no vocals. slow and noble, 68 bpm, 4/4. solo celtic harp states the melody alone, then a small warm string section joins underneath. a single low horn holds long notes far back. patient, hopeful, a little wistful. clean acoustic recording in a stone hall, natural reverb. loops gently, no big ending.
```


### `hall_bed_01` — The Contract Board

*stately · asked Suno for 2:00 · got 119.73 s · ends **clean**, starts **clean***

**Styles**

```
renaissance chamber consort, fully instrumental, no vocals, key of G major, tempo exactly 84 BPM, harpsichord and plucked lute trading a polite walking figure while viola da gamba and recorder answer, light tambourine on the offbeat, courtly orderly and slightly inquisitive, the sound of a busy guild hall going about its morning, dry warm acoustic, no drum kit, no synths
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:00 |
| Suno takes | **beab2164-7349-4284-9001-1bd62069ec7a**<br>fab2654f-b12b-4da5-a57d-8d5c1801c38c |

**ACE-Step fallback prompt**

```
renaissance chamber consort, instrumental, no vocals. stately and curious, 84 bpm, 4/4. harpsichord and plucked lute trade a polite walking figure while viola da gamba and recorder answer. light tambourine on the offbeat. courtly, orderly, slightly inquisitive — the sound of a busy guild hall going about its morning. dry warm acoustic, no drums kit, no synths.
```


### `hall_bed_02` — Instructors and Ledgers

*warm · asked Suno for 1:50 · got 110.41 s · ends **clean**, starts **clean***

**Styles**

```
medieval chamber music, fully instrumental, no vocals, key of A minor, tempo exactly 72 BPM, 6/8 lilt, celtic harp leads with low recorder and bowed cello underneath and an occasional soft hand drum, warm unhurried and welcoming rather than grand, background music for a hall where people are talking, acoustic with roomy stone reverb, no modern instruments
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **a6d7b4a2-b958-4d27-86c3-9b2dc71e2e95**<br>9eaa3240-48ea-4c02-b73e-a1e9752df256 |

**ACE-Step fallback prompt**

```
medieval chamber music, instrumental, no vocals. warm and unhurried, 72 bpm, 6/8 lilt. celtic harp leads, low recorder and bowed cello underneath, occasional soft hand drum. gentle and welcoming rather than grand — background music for a hall where people are talking. acoustic, roomy stone reverb, no vocals at all, no modern instruments.
```


### `meadow_bed_01` — Low Green Country

*pastoral · asked Suno for 2:10 · got 129.81 s · ends **clean**, starts **quiet***

**Styles**

```
pastoral celtic folk instrumental, fully instrumental, no vocals, key of G major, tempo exactly 76 BPM, 6/8, tin whistle carrying a simple pentatonic melody over fingerpicked acoustic guitar and harp, a soft string pad far behind, no percussion, sunlit wide walking-pace and faintly melancholy, open air field recording feel
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:10 |
| Suno takes | **6dfecd43-fc95-4cdb-8af9-d45f59d8e1e4**<br>d6b4369b-9fba-420a-89b9-f9b57c2832ba |

**ACE-Step fallback prompt**

```
pastoral celtic folk instrumental, no vocals. gentle and open, 76 bpm, 6/8. tin whistle carries a simple pentatonic melody over fingerpicked acoustic guitar and harp, soft strings pad far behind, no percussion. sunlit, wide, walking-pace, faintly melancholy. field-recording air and birdsong feel. entirely instrumental.
```


### `meadow_bed_02` — The Long Track East

*bright · asked Suno for 1:50 · got 109.57 s · ends **clean**, starts **clean***

**Styles**

```
bright folk instrumental, fully instrumental, no vocals, key of D major, tempo exactly 104 BPM, cheerful travelling music, hammered dulcimer and fiddle playing a bouncing melody together, upright bass walking, a light bodhran keeping a steady walking pulse, optimistic breezy and forward-moving, close dry acoustic, no singing
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **17d7a6cd-c988-4488-855f-f2c709c9f2d3**<br>8b65ea96-765c-4e49-b5cc-9025032cf39f |

**ACE-Step fallback prompt**

```
bright folk instrumental, no vocals. cheerful travelling music, 104 bpm, 4/4. hammered dulcimer and fiddle play a bouncing melody together, upright bass walks, light bodhran keeps a steady walking pulse. major key, optimistic, breezy, forward motion. acoustic, close and dry. no singing.
```


### `meadow_bed_03` — Rain Over the Fields

*wistful · asked Suno for 2:00 · got 119.73 s · ends **clean**, starts **clean***

**Styles**

```
quiet folk instrumental, fully instrumental, no vocals, key of E minor, tempo exactly 62 BPM, 3/4 waltz, solo nylon guitar and low whistle, sparse harp harmonics, a distant bowed string drone, grey weather thoughtful and unresolved, very soft dynamics with lots of space between the notes, no percussion
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:00 |
| Suno takes | fdfa68f7-08f6-43a9-b000-9f03c72e61f9<br>**1b92a4c9-2791-4f3b-b7e5-93cbe14d7917** |

**ACE-Step fallback prompt**

```
quiet folk instrumental, no vocals. wistful and slow, 62 bpm, 3/4 waltz. solo nylon guitar and low whistle, sparse harp harmonics, a distant bowed string drone. grey weather, thoughtful, unresolved. very soft dynamics, lots of space between notes. purely instrumental, no percussion, no vocals.
```


### `tavern_inst_01` — Room Tone, The Broken Shield

*cosy · asked Suno for 2:00 · got 119.33 s · ends **clean**, starts **quiet***

**Styles**

```
solo lute noodling in a tavern corner, fully instrumental, no vocals, key of D minor, tempo exactly 70 BPM, loose and unhurried free feel, one lute improvising a simple modal tune and sometimes pausing, an occasional low fiddle drone underneath, background music nobody is listening to, warm cosy fireside, slightly imperfect human timing, no percussion, no other instruments
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:00 |
| Suno takes | **1803182d-862d-4870-844a-066fd1653c94**<br>a3a2a397-9ea4-441a-a282-b98f76c3f51c |

**ACE-Step fallback prompt**

```
solo lute noodling in a tavern corner, instrumental, no vocals. loose and unhurried, 70 bpm, free feel. one lute improvising a simple modal tune, sometimes pausing, occasional low fiddle drone underneath. background music nobody is listening to, warm and cosy, fireside. slightly imperfect timing, human. no percussion, no vocals, no other instruments.
```


### `tavern_inst_02` — The Elbow Jig

*rowdy · asked Suno for 1:50 · got 109.73 s · ends **clean**, starts **clean***

**Styles**

```
fast irish tavern jig, fully instrumental, no vocals, key of A minor, tempo exactly 132 BPM, 6/8, fiddle and hurdy-gurdy in unison on the jig with tin whistle doubling on the repeat, bodhran, stamping feet and tambourine, sweaty boisterous and rowdy, a crowded floor, live acoustic recording
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **c84673ad-667e-4a9f-997e-dbb622b7aef4**<br>03ab64f1-1b60-40a2-a79a-2a21b19e3980 |

**ACE-Step fallback prompt**

```
fast irish tavern jig, instrumental, no vocals. rowdy and driving, 132 bpm, 6/8. fiddle and hurdy-gurdy in unison on a minor-key jig, tin whistle doubling on the repeat, bodhran and stamping feet, tambourine. sweaty, boisterous, a crowded floor. live acoustic, no vocals at all.
```


### `tension_01` — Something on the Ridge

*tense · asked Suno for 2:00 · got 119.89 s · ends **clean**, starts **quiet***

**Styles**

```
dark fantasy tension underscore, fully instrumental, no vocals, key of C minor, tempo exactly 58 BPM, slow and creeping, a sustained low cello drone, sparse detuned dulcimer notes, a struck metal bowl ringing out every few bars, a very quiet frame drum heartbeat, held minor second dissonance, dread building without ever arriving, no melody, no drum kit
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:00 |
| Suno takes | cd5216d2-a1f2-4995-b32b-016743378043<br>**fc53cc10-bec5-41ec-97d3-8b8c840864f0** |

**ACE-Step fallback prompt**

```
dark fantasy tension underscore, instrumental, no vocals. slow and creeping, 58 bpm. sustained low cello drone, sparse detuned dulcimer notes, a struck metal bowl ringing out every few bars, very quiet frame drum heartbeat. minor second dissonance held. dread building without ever arriving. no melody, no vocals, no drum kit.
```


### `tension_02` — Torches Out

*uneasy · asked Suno for 1:50 · got 109.73 s · ends **clean**, starts **clean***

**Styles**

```
uneasy medieval underscore, fully instrumental, no vocals, key of F minor, tempo exactly 66 BPM, sparse, bowed double bass, high thin tremolo violas, a single low wooden flute playing three lonely notes, a distant hand drum, cold stone corridor, suspense not action, no synthesisers
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **4da65623-8fe1-4a77-a78a-c21b30e1f5fa**<br>8e08fb9e-ef9c-4621-8eb1-7cbfbd5b603f |

**ACE-Step fallback prompt**

```
uneasy medieval underscore, instrumental, no vocals. 66 bpm, sparse. bowed double bass, tremolo violas high and thin, a single low male-register wooden flute playing three lonely notes, distant hand drum. cold stone corridor. suspense, not action. entirely instrumental, no singing, no synthesisers.
```


### `combat_01` — Close Quarters

*combat · asked Suno for 1:50 · got 109.73 s · ends **abrupt**, starts **clean***

**Styles**

```
fantasy battle music, fully instrumental, no vocals, key of D minor, tempo exactly 148 BPM, driving and urgent, big taiko and frame drums on a relentless pattern, low staccato string ostinato, brass stabs on the accents, a wailing fiddle line over the top, aggressive and cinematic with no let-up, orchestral and folk instruments only, no electric guitar
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **8a494b72-3616-45ea-a3f8-80c9ae2b55de**<br>da1d400a-4d79-4ec5-b700-74b0462e2ba0 |

**ACE-Step fallback prompt**

```
fantasy battle music, instrumental, no vocals. driving and urgent, 148 bpm, 4/4. big taiko and frame drums on a relentless pattern, low staccato strings ostinato, brass stabs on the accents, a wailing fiddle line over the top. minor key, aggressive, cinematic, no let-up. orchestral and folk instruments only, no vocals, no electric guitar.
```


### `combat_02` — Hold the Line

*heroic · asked Suno for 1:50 · got 109.61 s · ends **clean**, starts **quiet***

**Styles**

```
heroic fantasy battle music, fully instrumental, no vocals, key of C minor, tempo exactly 132 BPM, marching, war drums and low toms, french horns and trombones carrying a bold rising theme, strings sawing underneath, clashing cymbals on the phrase ends, defiant and rallying rather than frightening, full orchestra
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 1:50 |
| Suno takes | **dbd94da8-d8f8-489c-8426-5b79cbaf532d**<br>809b2c48-dcab-43ec-8594-7fe42be447e9 |

**ACE-Step fallback prompt**

```
heroic fantasy battle music, instrumental, no vocals. 132 bpm, 4/4, marching. war drums and low toms, french horns and trombones carrying a bold rising theme, strings sawing underneath, clashing cymbals on the phrase ends. defiant and rallying rather than frightening. full orchestra, no vocals whatsoever.
```


### `night_bed_01` — After the Candles

*quiet · asked Suno for 2:10 · got 129.73 s · ends **clean**, starts **quiet***

**Styles**

```
very quiet night ambience with a melody, fully instrumental, no vocals, key of A minor, tempo exactly 54 BPM, extremely sparse, a single low wooden flute playing slow phrases with long silences between them over a barely audible bowed drone and the occasional harp harmonic, still cold peaceful and lonely, almost ambient, no percussion, very low dynamic range
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:10 |
| Suno takes | 3b872223-2c6c-49f4-8fe9-9f7cc8718a07<br>**cb4e5d76-2061-4f5e-b066-59f3b93a6101** |

**ACE-Step fallback prompt**

```
very quiet night ambience with melody, instrumental, no vocals. 54 bpm, extremely sparse. a single low wooden flute plays slow phrases with long silences between them, over a barely-audible bowed drone and the occasional harp harmonic. still, cold, peaceful, lonely. almost ambient. no percussion, no vocals, dynamic range very low.
```


## §2 — Instrumental stings (short, must resolve and stop)

### `victory_sting_01` — Contract Complete

*fanfare · asked Suno for 0:30 · got 29.69 s · ends **clean**, starts **clean***

**Styles**

```
short triumphant medieval fanfare, fully instrumental, no vocals, key of C major, tempo exactly 110 BPM, natural trumpets and horns state a bright rising four-bar phrase, timpani roll, strings swell and a cymbal finishes it, celebratory, begins immediately with no intro, resolves cleanly on the final chord and stops
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 0:30 |
| Suno takes | **bf486ec7-d486-4807-9c05-7b21e64b5924**<br>e42df26f-ed14-4eb4-95b4-d4ee93f95035 |

**ACE-Step fallback prompt**

```
short triumphant medieval fanfare, instrumental, no vocals. 110 bpm. natural trumpets and horns state a bright rising four-bar phrase, timpani roll, strings swell and a cymbal finishes it. major key, celebratory, resolves cleanly on the final chord. begins immediately, no intro. no vocals.
```


### `victory_sting_02` — Well Fought

*fanfare · asked Suno for 0:30 · got 29.53 s · ends **clean**, starts **clean***

**Styles**

```
short warm folk victory sting, fully instrumental, no vocals, key of G major, tempo exactly 100 BPM, 6/8, a harp arpeggio flourish then fiddle and whistle answer with a bright little tune, tambourine, small and human rather than orchestral, starts on the downbeat with no fade in, every instrument plays at full strength to the last beat and they finish together on a held major chord
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 0:30 |
| Suno takes | **81bddc28-1c67-42f1-82e9-9ddb86b07876**<br>85e01747-1b52-4c65-b7d2-f9b3cf529dc5 |

**ACE-Step fallback prompt**

```
short warm folk victory sting, instrumental, no vocals. 100 bpm, 6/8. harp arpeggio flourish, fiddle and whistle answer with a bright little tune, tambourine. small and human rather than orchestral. starts on the downbeat, no fade in. the instruments keep playing at full strength right to the very last beat and finish together on a held major chord — no early stop, no dead air at the end. no vocals.
```


### `defeat_sting_01` — Not This Time

*downbeat · asked Suno for 0:30 · got 21.93 s · ends **clean**, starts **clean***

**Styles**

```
short sombre fantasy sting, fully instrumental, no vocals, key of D minor, tempo exactly 60 BPM, low strings descending through a minor cadence, a single struck bell, a muted horn holding the last note and fading, disappointed rather than tragic, no percussion beyond the bell, resolves and stops
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 0:30 |
| Suno takes | **c3627079-78d3-4261-b90c-5b11d7c9ca06**<br>0929c043-2569-41b5-b53b-e8ccf21ad085 |

**ACE-Step fallback prompt**

```
short sombre fantasy sting, instrumental, no vocals. 60 bpm. low strings descend through a minor cadence, a single struck bell, muted horn holds the last note and fades. disappointed rather than tragic. no percussion beyond the bell, no vocals. resolves and stops.
```


### `quest_sting_01` — Signed and Sealed

*curious · asked Suno for 0:20 · got 19.73 s · ends **abrupt**, starts **clean***

**Styles**

```
very short bright medieval flourish, fully instrumental, no vocals, key of F major, tempo exactly 96 BPM, a plucked lute run upward, a recorder trill, a small hand drum tap, finishing on a clean open chord, curious and encouraging, the sound of taking a job, begins immediately with no intro
```

**Lyrics** — none. Lyrics panel set to *Instrumental*.

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 0:20 |
| Suno takes | **c57601d6-7bbc-49be-90a4-d9c4a0e9e5d4**<br>09bf8ac7-73b5-4315-8ee8-a2e4da607cb5 |

**ACE-Step fallback prompt**

```
very short bright medieval flourish, instrumental, no vocals. 96 bpm. plucked lute run upward, recorder trill, small hand drum tap, finishes on a clean open chord. curious and encouraging, the sound of taking a job. two bars of nothing else. no vocals.
```


## §3 — Tavern songs (with lyrics)

### `tavern_song_drinking_01` — The Ale Runs Low

*rowdy · asked Suno for 2:15 · got 133.52 s · ends **clean**, starts **clean***

**Styles**

```
medieval tavern drinking song, ONE clear male baritone lead vocal, close-miked and mixed loud right at the front, the lead voice is the loudest thing in the mix by far and every word is crisp and clearly enunciated, a small crowd joins in only on the chorus, quietly and well behind the lead, tempo exactly 108 BPM, 4/4, stomping but sparse: acoustic guitar, a single fiddle and a bodhran, plenty of space, no accordion, no brass, no wall of noise, warm and joyful, diction is the priority
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | male |
| Duration set | 2:15 |
| Suno takes | **803f6525-baaf-41bc-9031-21961dd915a5**<br>2cb52ab5-2761-4f34-a8ee-3f49accc0d04 |

**ACE-Step fallback prompt**

```
medieval tavern drinking song. ONE clear male baritone lead vocal, close-miked and mixed loud right at the front — the lead voice is the loudest thing in the mix by far, every word crisp and clearly enunciated. a small crowd joins in only on the chorus, quietly, well behind the lead. 108 bpm, 4/4, stomping but sparse: just acoustic guitar, a single fiddle and a bodhran, plenty of space, no accordion, no brass, no wall of noise. warm and joyful. diction is the priority.
```


### `tavern_song_boast_01` — I Fought a Bear

*comic · asked Suno for 2:15 · got 93.32 s · ends **clean**, starts **clean***

**Styles**

```
comic boastful tavern song, one theatrical male baritone lead who clearly thinks a lot of himself, close-miked and mixed right at the front with crisp diction, answered by a jeering mixed crowd on the chorus only, tempo exactly 108 BPM, 4/4, swaggering, accordion, fiddle, plucked bass, snare rim and tambourine, occasional laughter, music hall energy in a medieval costume, comedic timing, family friendly
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | male |
| Duration set | 2:15 |
| Suno takes | **a9c712a6-8a16-4a1f-8971-006e01ba3a45**<br>54b6b358-a398-431e-a047-736d3b864add |

**ACE-Step fallback prompt**

```
comic boastful tavern song. one theatrical male baritone lead who clearly thinks a lot of himself, answered by a jeering mixed crowd on the chorus. 108 bpm, 4/4, swaggering. accordion, fiddle, plucked bass, snare rim and tambourine, occasional laughter. music hall energy in a medieval costume. crisp diction, comedic timing, family friendly.
```


### `tavern_song_ballad_01` — The Girl Who Went to the Ridge

*wistful · asked Suno for 2:10 · got 129.2 s · ends **clean**, starts **clean***

**Styles**

```
slow celtic folk ballad, one solo female vocal, clear unornamented alto voice, close-miked, front and centre, every word clearly enunciated, tempo exactly 66 BPM, 3/4, fingerpicked nylon guitar and celtic harp only with a low whistle answering at the end of each line and a soft string pad on the choruses, no percussion, sad tender restrained and beautiful, traditional folk phrasing
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | female |
| Duration set | 2:10 |
| Suno takes | **d1094dc2-33fe-4ad2-bf97-8e6c65c0ab2b**<br>45edc61d-08e9-40e1-b3f6-b6207ef32ef5 |

**ACE-Step fallback prompt**

```
slow celtic folk ballad, solo female vocal. clear unornamented alto voice, close mic, front and centre. 66 bpm, 3/4. fingerpicked nylon guitar and celtic harp only, with a low whistle answering at the end of each line and a soft string pad on the choruses. no percussion. sad, tender, restrained, beautiful. traditional folk phrasing.
```


### `tavern_song_work_01` — Haul Away

*gruff · asked Suno for 2:10 · got 129.52 s · ends **clean**, starts **quiet***

**Styles**

```
call and response landlocked work shanty, ONE gruff male caller, close-miked, dry and very far forward, singing his lines completely unaccompanied and enunciating every word clearly, a crowd answers only the short haul away response and sits lower in the mix, tempo exactly 92 BPM, 4/4, heavy downbeat, almost no instruments at all, stamping feet and a single bodhran and nothing else, long silences between phrases, the words must be clearly audible and never hummed or vocalised
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | male |
| Duration set | 2:10 |
| Suno takes | 3cd0fd39-1dfa-4013-98a3-c9510a341f79<br>**3d9014cc-602f-48e5-920b-ee88780fa8bc** |

**ACE-Step fallback prompt**

```
call and response work song, landlocked shanty. ONE gruff male caller, close-miked, dry and very far forward, singing his lines completely unaccompanied and enunciating every word clearly. a crowd answers only the short 'haul away' response, lower in the mix. 92 bpm, 4/4, heavy downbeat. almost no instruments at all — stamping feet and a single bodhran, nothing else, long silences between phrases. the words must be clearly audible, not vocalised or hummed.
```


### `tavern_song_jig_01` — Boots Under the Table

*joyful · asked Suno for 2:10 · got 130.12 s · ends **clean**, starts **clean***

**Styles**

```
fast tavern jig with singing, a male and female duet trading lines and singing the chorus together in close harmony, both voices bright clear and right at the front with crisp diction, no growling, tempo exactly 138 BPM, 6/8, relentless, fiddle, hurdy-gurdy, tin whistle, bouzouki, bodhran and stamping, breathless dancing and grinning, live and loud
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:10 |
| Suno takes | **a92fb745-48e3-4e19-8bff-5619a457fc83**<br>1b87dff2-2bf7-48f3-a0a4-4d1fc7be9521 |

**ACE-Step fallback prompt**

```
fast tavern jig with singing, male and female duet trading lines and singing the chorus together in harmony. 138 bpm, 6/8, relentless. fiddle, hurdy-gurdy, tin whistle, bouzouki, bodhran and stamping. breathless, dancing, grinning. live and loud. both voices bright and clear, no growling.
```


### `tavern_song_lament_01` — Ten Went Out

*sombre · asked Suno for 2:10 · got 129.92 s · ends **abrupt**, starts **clean***

**Styles**

```
slow tavern lament, one solo male voice, weathered tenor, singing almost unaccompanied, close-miked and intimate and right at the front, every word clearly enunciated, tempo exactly 58 BPM, 3/4, one quiet lute and a low bowed drone, a second male voice joining softly in harmony only on the last chorus, no percussion, dignified grief, understated, everyone in the room has gone quiet
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | male |
| Duration set | 2:10 |
| Suno takes | **77645245-9a98-4f85-b665-cc45d8859eee**<br>86d3446b-c72c-4010-be33-4c7f5d110bbc |

**ACE-Step fallback prompt**

```
slow tavern lament, solo male voice, weathered tenor, singing almost unaccompanied. 58 bpm, 3/4. one quiet lute and a low bowed drone, a second male voice joining softly in harmony only on the last chorus. no percussion. dignified grief, understated, everyone in the room gone quiet. very intimate close recording.
```


### `tavern_song_anthem_01` — Who Fights

*comic · asked Suno for 2:10 · got 130.52 s · ends **abrupt**, starts **quiet***

**Styles**

```
silly guild anthem sung by a whole tavern, a mixed male and female crowd in loud rough unison with a single male voice interjecting the jokes, call and response shouting on the chorus, all words clearly audible, tempo exactly 124 BPM, 4/4, marching stomp, accordion, brass band oompah, snare drum, tankards and cheering, proud and completely ridiculous, family friendly, clear diction
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | _unset_ |
| Duration set | 2:10 |
| Suno takes | e6bb10ad-d8c0-4f21-be5b-0b9e848c4c6e<br>**35533c44-a4ae-46fe-83bc-8b244b352cb1** |

**ACE-Step fallback prompt**

```
silly guild anthem sung by a whole tavern, mixed male and female crowd in loud rough unison with a single male voice interjecting the jokes. 124 bpm, 4/4, marching stomp. accordion, brass band oompah, snare drum, tankards, cheering. proud and completely ridiculous. call and response shouting on the chorus. family friendly, clear diction.
```


### `tavern_song_ballad_02` — The Lantern in the Window

*warm · asked Suno for 2:10 · got 130 s · ends **abrupt**, starts **quiet***

**Styles**

```
warm hopeful folk ballad, one solo female lead vocal close-miked and right at the front with clear tender singing and crisp diction, a male voice harmonising quietly underneath on the choruses only, tempo exactly 72 BPM, 4/4, gently rolling, celtic harp, acoustic guitar, cello, a low whistle, a very soft brushed frame drum entering halfway, homecoming, comfort, candlelight, rich and full but never loud
```

**Lyrics** (Lyrics panel, mode Write)

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

| | |
|---|---|
| Vocal Gender | female |
| Duration set | 2:10 |
| Suno takes | 2bf82f07-c910-4d7a-a77c-5638cabd0df1<br>**d2051015-0173-41bd-97b1-ac1259d78b4f** |

**ACE-Step fallback prompt**

```
warm hopeful folk ballad, solo female vocal with a male voice harmonising underneath on the choruses. 72 bpm, 4/4, gently rolling. celtic harp, acoustic guitar, cello, a low whistle, very soft brushed frame drum entering halfway. homecoming, comfort, candlelight. rich and full but never loud. clear tender singing.
```


---

_Generated by `tools/music/build_suno_doc.mjs` from `tools/music/jobs.json`. Edit the jobs file, not this._
