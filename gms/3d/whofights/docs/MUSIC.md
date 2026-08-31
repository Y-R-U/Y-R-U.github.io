# WHO FIGHTS — music library

25 tracks, 17.5 MB shipped. Everything under `audio/music/`, what each set is for, how to
regenerate, and what bit me.

The manifest is **`data/music.json`** (DEV_CONTRACT §9). The game reads that file; nothing reads the
folder. An mp3 that is not in the manifest is not heard.

---

## Where it came from — read this first

**Every track in this library was generated on Suno v5.5**, in Aaron's logged-in browser, on
2026-08-31. It replaced an ACE-Step 1.5 turbo library that used the same 25 ids, the same sets and
the same lyrics — Aaron listened to that one and asked for it to be redone:

> *the local ai music doesn't sound very good, it gets ok results sometimes, but should only be used
> (and will be far more work to use to get his results) when we don't have sunoai available.*

So ACE-Step is now the **fallback**, not the default. Every job in `tools/music/jobs.json` still
carries an `acePrompt` — the longer arrangement-shaped description ACE-Step responds to — alongside
the Suno `prompt` that actually made the shipped file. `gen_music.mjs` prefers `acePrompt`, so
`--only=<id> --force` still regenerates any track locally with no subscription. That is the whole
point of keeping both.

The full Suno recipe, every Styles string, every lyric block, the per-track settings and both takes'
clip ids are in **`docs/SUNO.md`**.

### ACE-Step vs Suno — now measured on the same brief

The previous version of this file had to say *"nobody has compared them, because the Suno half never
ran"*. It has now run, on identical prompts, lyrics and targets. Here is what a machine can see.
**None of these rows is about whether the music is any good** — see the next section.

| | ACE-Step 1.5 turbo (local) | Suno v5.5 |
|---|---|---|
| Cost | free | ~10 credits per generation (2 takes) — **250 for the whole library** |
| Wall time | 48.9 min unattended for 25 tracks, one command | ~2 h of a supervised browser session |
| Duration control, **beds** | exact. Asked 120 s, got 120.0 s, 25/25 | **±0.5 s.** Asked 2:00, got 1:57–2:00 |
| Duration control, **stings** | exact | 0:20 → 19.7 s, 0:30 → 29.7 s. Good, *if you do not ask for the 0:10 minimum* |
| Duration control, **songs** | exact | **ignored.** Suno fits the lyrics: same 2:10 request gave 2:10 and 1:33 |
| Endings | fades on 21/25 | fades on **20/25** |
| Starts from silence | 3/25 ramp in | **9/25** ramp in |
| Takes per prompt | 1 | 2, and both are kept |
| Vocals | works, one voice at a time | works, plus a real **Vocal Gender** control |

**The old "on duration ACE-Step is clearly better" line was half wrong and half right.** It is not
better on beds — Suno lands within half a second. It is better on *songs*, where Suno simply
overrides you. And the skyhammer session's "Suno undershoots stings badly" turns out to have been an
artefact of asking for Suno's 0:10 floor; ask for 0:20 and you get 19.7 s.

**Everything else in that table is a tie or close to it, which is exactly why the table cannot
answer the question Aaron actually asked.** He rejected the ACE-Step library by ear, and every row
above was green for ACE-Step at the time.

## Honesty about quality — including the vocals

**Nobody has listened to these either. I cannot hear.** What I can tell you, and no more:

- All 25 are the length they should be, are not silent, are not clipped, do not stop early, and
  land within 2.2 dB of each other on mean level (−16.1 to −18.3 dBFS).
- All 8 songs contain actual singing of the supplied lyrics, in the intended section order.
- **I did not score how good any of them sound, on purpose.** An earlier version of this file quoted
  word-recall percentages per song. That number is worthless as a quality signal and this repo has
  already been burned by it: `../neonhaul/tools/vo/kokoro_say.py` records a voice pool that measured
  **90.7 % intelligible** and that Aaron played and described as *"a computer voice from the 90s"*.
  Both statements were true at once. A recognisability score cannot see prosody, and prosody is the
  whole game.

**Two takes exist for all 25 tracks and I chose between them on measured duration alone.** That is
a real limitation, not a rounding error: for 21 of the 25 the two takes are within 2 s of each other
and the choice was effectively arbitrary. Both clip ids are in `docs/SUNO.md`, the rejected take is
still in Aaron's Suno workspace under `WF <id>`, and any of them can be pulled back with the
download recipe there. **A human listening pass may well prefer the other take, and for most tracks
there is no measurement that would have told me so.**

Where duration did decide it, it decided it clearly:

| id | kept | rejected | why |
|---|---|---|---|
| `tavern_song_work_01` | 129.5 s | 88.6 s | the short take drops a whole verse |
| `tavern_song_lament_01` | 129.9 s | 111.4 s | the short take drops the harmony chorus |
| `defeat_sting_01` | 21.9 s | 29.7 s | 22 s was the brief; the long one pads |
| `tension_01`, `night_bed_01`, `meadow_bed_03`, `tavern_song_anthem_01`, `tavern_song_ballad_02` | longer | shorter | margins of 0.1–1.7 s. **Coin flips.** |

**`tavern_song_boast_01` is the one to audition first.** Both takes came back at ~93 s against a
128 s brief — Suno decided the lyrics were done and stopped. It is a complete song with both verses
and both choruses, it is just short. If it wants to be as long as the rest, **add lyrics** (a bridge,
a third verse); raising the Duration slider will not do it.

---

## The sets

A set is what a doorway trigger names: `{"k":"music","set":"tavern"}`. A level can also name one in
its `"music"` field as its default. Sets overlap on purpose — the same bed appears in more than one.

| set | for | fade | vol | shuffle |
|---|---|---|---|---|
| `menu` | title screen, the shell before you are in the world | 2000ms | 0.6 | no |
| `academy_hall` | the castle hall, contract boards, instructors | 1500ms | 0.55 | yes |
| `outdoors` | meadows, roads, anything under sky | 2000ms | 0.55 | yes |
| `tavern` | the tavern — songs and instrumentals mixed | 1200ms | 0.7 | yes |
| `tavern_songs` | tavern, sung tracks only (a big night) | 1200ms | 0.7 | yes |
| `tavern_quiet` | tavern late on, nobody singing | 2500ms | 0.5 | yes |
| `tension` | approaching danger, before anything starts | 900ms | 0.6 | yes |
| `combat` | fighting | 400ms | 0.75 | yes |
| `night` | night, quiet interiors, low ebb | 2500ms | 0.45 | yes |
| `stings` | one-shots — victory, defeat, contract accepted | 200ms | 0.85 | no |

`stings` is the odd one. Its tracks are 20–30 s, they resolve and stop, and they are **not** loop
beds — fire one over the top of whatever bed is playing (duck the bed, don't cross-fade it away)
rather than swapping sets. Everything else is a loop bed.

Volumes are per-set and deliberately low — these are beds under dialogue. `combat` is loudest at
0.75; the tavern songs sit at 0.7 because they are meant to be the thing you notice walking in.

**The set ids and the track ids did not change in this regeneration.** `data/levels/academy.json`
names `academy_hall` and `outdoors`; both still resolve. `node tools/music/build_manifest.mjs`
prints the per-set track counts on every run — walk them, because a dropped id is a silent set.

### `ends` and `starts` are in the manifest now

Both are in `data/music.json` per DEV_CONTRACT §9, and **`build_manifest.mjs` no longer drops them**
— it used to rebuild the file without either field, so re-running it silently reverted whatever had
been hand-added. They now come from `tools/music/results.json`, and a job may pin either by hand
(`"ends"` / `"starts"` on the job) if a human disagrees with the measurement.

They are measured on the **shipped** file, not the raw, because the encode profile's compressor
changes the tail envelope — `tension_01`'s raw take stops dead and its shipped file does not.

- **`ends: "abrupt"` — 5 tracks:** `combat_01`, `quest_sting_01`, `tavern_song_lament_01`,
  `tavern_song_anthem_01`, `tavern_song_ballad_02`. These stop at full level; the runtime must fade
  them itself or they click on loop.
- **`starts: "quiet"` — 9 tracks:** `menu_bed_01`, `meadow_bed_01`, `tavern_inst_01`, `tension_01`,
  `combat_02`, `night_bed_01`, `tavern_song_work_01`, `tavern_song_anthem_01`,
  `tavern_song_ballad_02`. These ramp themselves in; a naive fade-in dips them twice.

`menu_bed_01` is the extreme case — **62 dB down at 0.5 s and still 21 dB down at 2 s.** It is the
title screen. If it opens on near-silence, start it a couple of seconds in.

---

## Compression

Raws are kept at `audio/music/raw/` and are **gitignored** — they never enter the repo, but they stay
on disk (59 MB) so any track can be re-encoded at a different rate later without regenerating it.

Everything ships through the dev server's `POST /api/encode` at the **`full`** profile.
**60,255 KB → 17,947 KB, 3.4×.**

```bash
node tools/devserver.mjs                       # if it is not already up
curl -s -X POST localhost:8796/api/encode -H 'Content-Type: application/json' \
     -d '{"profiles":true}'                    # ← the profile list. Never hard-code these.
curl -s -X POST localhost:8796/api/encode -H 'Content-Type: application/json' \
     -d '{"src":"audio/music/raw/combat_01.mp3","out":"audio/music/combat_01.mp3","profile":"full"}'
```

The encoder is queued; poll `/api/queue` and wait for the encode jobs to leave `queued`/`running`.
**`waiting: 0` is not "finished"** — the running job does not count as waiting, and other agents
share this server. Count `jobs[kind == "encode"]` that are not `done`.

`tools/music/compress_music.sh` is the older direct-ffmpeg path and its profile table is a copy.
**Prefer `/api/encode`**, which is the one place the numbers actually live.

### Gotcha that cost 3 MB — Suno mp3s carry a cover image

Every Suno download has an **embedded PNG** as a second stream, and `ffmpeg -i in.mp3 … out.mp3`
copies it straight through. The `full` profile has no `-vn`, so the artwork survived the encode and
`quest_sting_01` shipped at **332 KB for 20 seconds of 56 kbps mono** — nearly 200 KB of it a
picture nobody will ever see. Strip it from the raw before encoding (audio is copied bit-for-bit,
so this is lossless):

```bash
for f in audio/music/raw/*.mp3; do
  ffmpeg -v error -y -i "$f" -map 0:a -c:a copy -f mp3 "${f%.mp3}.noart.mp3" && mv "${f%.mp3}.noart.mp3" "$f"
done
```

`-f mp3` is required: ffmpeg will not infer the muxer from a `.noart` suffix. The whole library went
**20.5 MB → 17.5 MB** for this, with the audio untouched.

**Which profile sounds right is a human call, not a measurement.** If the songs lose too much diction
at 56 kbps mono, `rich` (96 kbps stereo) is the next rung and would cost about 2.5×. **If the library
is too heavy, the honest lever is dropping tracks, not dropping bitrate.**

---

## Regenerating

### On Suno (the default)

Read `docs/SUNO.md`. It has the browser recipe, the Duration-slider geometry, the vocal recipe, the
download route, and the two clip ids for every track. **The skyhammer download recipe
(`curl https://cdn1.suno.ai/<uuid>.mp3`) is dead** — CloudFront returns 403 MissingKey now.

### Locally on ACE-Step (no subscription needed)

```bash
cd ~/cc/yru/site/gms/3d/whofights
node tools/music/gen_music.mjs tools/music/jobs.json --dry            # list jobs, no GPU
node tools/music/gen_music.mjs tools/music/jobs.json --only=combat_01 --force
```

`gen_music.mjs` sends `acePrompt` when a job has one, so the local path still gets the long,
arrangement-shaped prompt ACE-Step wants rather than the Suno tag string. Everything in the old
ACE-Step notes below still applies to that path.

### Then, either way

```bash
tools/music/compress_music.sh          # or POST /api/encode, above
node tools/music/build_manifest.mjs    # jobs.json + results.json -> data/music.json
node tools/music/build_suno_doc.mjs    # jobs.json -> docs/SUNO.md
```

`tools/music/jobs.json` is the **single source of truth** for every prompt and lyric. Edit it, not
`data/music.json` and not `docs/SUNO.md` — both are generated from it.

`tools/music/results.json` is the measured record of every shipped file — duration, peak, RMS, head
and tail envelope, `ends`, `starts`, pass/fail and reject reasons.

### Adding a track

1. Add an entry to `tools/music/jobs.json` — `id`, `title`, `kind`, `mood`, `seconds`, `prompt`
   (Suno style string), `lyrics` (empty for an instrumental), `acePrompt`, `source`, `suno`.
2. Generate it (Suno or ACE-Step), land the raw at `audio/music/raw/<id>.mp3`, strip the artwork.
3. Encode it to `audio/music/<id>.mp3`.
4. Measure it into `results.json`.
5. Put the id into a set in the `SETS` table at the top of `tools/music/build_manifest.mjs`.
6. `node tools/music/build_manifest.mjs && node tools/music/build_suno_doc.mjs`

---

## Writing prompts

### Suno — short, tag-shaped, but say the numbers

The house pattern, unchanged from `../../2d/skyhammer/docs/MUSIC_NOTES.md` and confirmed again here:

1. **Genre and function** — "renaissance chamber consort", "fast irish tavern jig".
2. **`fully instrumental, no vocals`** in words, *and* the Lyrics panel set to Instrumental. Belt
   and braces; it costs nothing.
3. **The key** — "key of D minor". Suno honours it and it is what makes two tracks in a set sit
   together.
4. **`tempo exactly N BPM`.** The word *exactly* is the skyhammer finding and it still holds.
5. **Three or four named instruments, each doing something** — "harpsichord and plucked lute trading
   a polite walking figure while viola da gamba and recorder answer".
6. **Say what to leave out** — "no drum kit", "no synths", "no electric guitar".
7. **One sentence of mood, one of recording space.**

### Suno — for the songs

The mix instruction is the important part and it transfers verbatim from the ACE-Step lesson:

> ONE clear male baritone lead vocal, close-miked and mixed loud right at the front, the lead voice
> is the loudest thing in the mix by far and every word is crisp and clearly enunciated, a small
> crowd joins in only on the chorus, quietly and well behind the lead […] plenty of space, no
> accordion, no brass, no wall of noise, diction is the priority

Ask for a full band and a crowd in unison and you get mud. Ask for one voice, few instruments and
space, and you get words. **Also set `More Options → Vocal Gender`** — Male for the four male-lead
songs, Female for the two female-lead ballads, and **leave it unset** for the duet
(`tavern_song_jig_01`) and the whole-tavern anthem so Suno can use both.

### ACE-Step — the fallback

ACE-Step wants a **different kind of prompt**: longer, concrete, arrangement-shaped, and it needs
`instrumental, no vocals` said **twice** or it puts a wordless vocalise over the top. Those are the
`acePrompt` fields. The pattern is genre → "instrumental, no vocals" → "84 bpm, 4/4" → named
instruments and what each is doing → what to leave out → mood → recording space. `thinking: true`
for anything with lyrics, `false` for instrumentals; `inference_steps: 4`.

---

## Quality control

**A file existing is not a take succeeding.** Every shipped file is measured with ffprobe, ffmpeg
`volumedetect` and `astats` before it is accepted. These are **build checks** — the defects a machine
genuinely can catch. Nothing here scores how *good* a take is; that is a human call and the tooling
deliberately does not pretend otherwise.

| check | threshold | catches |
|---|---|---|
| duration vs raw | within 1 s | a truncated or mis-copied encode |
| **flat factor** | `> 1` | **real clipping** |
| RMS | below −34 dBFS | near-silence, an ambient wash with no music in it |
| last fifth vs whole | more than 20 dB down | the take that gave up partway and left dead air |
| `ends` | last 0.5 s within 8 dB of body | a take that stops dead and will click on loop |
| `starts` | first 2 s ≥8 dB down, or first 0.5 s ≥20 dB down | a take that ramps itself in |

### Falsification — every one of these has been seen to fail

Six deliberately broken builds were made from `hall_bed_01` and run through the checker:

| falsifier | expected | got |
|---|---|---|
| truncate to 60 s with `-c copy` | `ends: abrupt` | **abrupt** (the real file reads `clean`) |
| 9 s fade-out | `ends: clean` | **clean** |
| 8 s fade-in | `starts: quiet` | **quiet** (the real file reads `clean`) |
| `volume=-40dB` | QC fail, near-silent | **FAIL near-silent** |
| audio muted from 70 % on | QC fail, stops-early | **FAIL stops-early** |
| `volume=12dB` | QC fail, clipped | **FAIL clipped (flat factor 24.3)** |

**The clipping check was rewritten because of that last row.** The old check was
`max_volume > +1 dB`, and `max_volume` cannot exceed 0.0 dB for integer PCM — so it could never
fire, exactly like the `-ss`-on-the-wrong-side bug that this file already carried a warning about.
A `+12 dB` file sailed through it. `astats`' **flat factor** — consecutive identical samples, i.e.
flat-topped waveforms — reads **24.3** on that file and **0.0** on all 25 real ones, including
`tavern_song_boast_01`, whose decoded peak is `+0.03 dBFS`. That peak is mp3 decoder overshoot with
a peak count of 2, not clipping, and the new check says so correctly.

---

## Gotchas

Ordered by how much time they cost.

- **Chrome will stop downloading from suno.com and never tell you.** Suno's multi-select *Download
  all* opens one popup per clip; Chrome's popup blocker eats them, and **from that moment on every
  download from the site is blocked** — including the single-clip menu that worked a minute before,
  including after a reload, and including `<a download>` from a real click. There is no error, the
  toast still says *Preparing your mp3…*, and nothing lands in `~/Downloads`. **Do not use *Download
  all*.** The escape hatch that needs no browser-settings change is in `docs/SUNO.md`: base64 →
  `document.execCommand('copy')` from a real click → `pbpaste | base64 -d`.
- **`curl -L https://cdn1.suno.ai/<uuid>.mp3` is dead.** It returns `403 MissingKey` — CloudFront
  signed cookies. The skyhammer notes say this works; they are a year stale. The live route is
  `GET studio-api-prod.suno.com/api/download/clip/<uuid>` with a Clerk bearer token, which returns a
  signed S3 URL — **and 404s for the first call or two while Suno renders the mp3, so poll it.**
- **Typing a lyric block through CDP outlives the 30 s keystroke timeout.** The tool reports *the
  renderer may be frozen or unresponsive* **and the text lands anyway**. Wait 10 s and screenshot
  before retrying; a blind retry doubles the lyrics.
- **Suno mp3s carry an embedded cover PNG** and ffmpeg copies it into the shipped file. See the
  compression section.
- **`-ss` must come before `-i` in ffmpeg.** This cost the most time of anything in the ACE-Step
  session. The tail-level check had `-ss` on the output side, so `volumedetect` measured the whole
  file every time and the tail figure came back **exactly equal to the whole-file figure on all 25
  tracks** — a check that could never fail, sitting in the code labelled as the important one. The
  tell was the delta being `0.0` on every single row; a real measurement is never that tidy.
- **`max_volume` can never exceed 0 dB**, so a peak-based clip check is decorative. Use `astats`'
  flat factor. See the falsification table.
- **ffmpeg writes `volumedetect` / `astats` to stderr and exits 0**, so `execFileSync` (which only
  hands stderr back on a throw) returns nothing and every measurement comes out `null` — and the
  tooling happily writes a results file full of nulls. Use `spawnSync` and read `.stderr`.
- **`/api/encode`'s queue is shared** with whatever else is running against the dev server, and
  `waiting: 0` does not mean your jobs are done. Count the encode jobs that are not `done`.
- **`timeout` is not a command on macOS** (it is GNU coreutils). Use `gtimeout`, or a deadline
  inside the script.
- ACE-Step notes that still apply to the fallback path: `result` comes back from `/query_result` as
  a JSON **string**, not a nested object; cold start is ~50 s and is charged per *run*, so batch
  rerolls; do not switch to `acestep-v15-xl-sft` (lyrics + thinking blows past the 600 s timeout);
  **ACE-Step normalises every output to peak 0.8913**, so a peak check cannot fire on an ACE-Step
  take either.

---

## Library

25 tracks, 17,947 KB shipped, all `source: "suno"`. *asked* is what the Duration slider was set to;
*got* is the measured shipped file; *ACE* is what the replaced ACE-Step take was.

| id | title | kind | mood | asked | got | ACE | size | ends | starts |
|---|---|---|---|---|---|---|---|---|---|
| `menu_bed_01` | Who Fights | inst | noble | 2:00 | 117.4s | 120s | 803 KB | clean | quiet |
| `hall_bed_01` | The Contract Board | inst | stately | 2:00 | 119.7s | 120s | 819 KB | clean | clean |
| `hall_bed_02` | Instructors and Ledgers | inst | warm | 1:50 | 110.4s | 110s | 755 KB | clean | clean |
| `meadow_bed_01` | Low Green Country | inst | pastoral | 2:10 | 129.8s | 125s | 888 KB | clean | quiet |
| `meadow_bed_02` | The Long Track East | inst | bright | 1:50 | 109.6s | 110s | 749 KB | clean | clean |
| `meadow_bed_03` | Rain Over the Fields | inst | wistful | 2:00 | 119.7s | 115s | 819 KB | clean | clean |
| `tavern_inst_01` | Room Tone, The Broken Shield | inst | cosy | 2:00 | 119.3s | 120s | 816 KB | clean | quiet |
| `tavern_inst_02` | The Elbow Jig | inst | rowdy | 1:50 | 109.7s | 105s | 751 KB | clean | clean |
| `tension_01` | Something on the Ridge | inst | tense | 2:00 | 119.9s | 115s | 820 KB | clean | quiet |
| `tension_02` | Torches Out | inst | uneasy | 1:50 | 109.7s | 105s | 751 KB | clean | clean |
| `combat_01` | Close Quarters | inst | combat | 1:50 | 109.7s | 110s | 751 KB | **abrupt** | clean |
| `combat_02` | Hold the Line | inst | heroic | 1:50 | 109.6s | 105s | 750 KB | clean | quiet |
| `night_bed_01` | After the Candles | inst | quiet | 2:10 | 129.7s | 130s | 887 KB | clean | quiet |
| `victory_sting_01` | Contract Complete | inst | fanfare | 0:30 | 29.7s | 25s | 203 KB | clean | clean |
| `victory_sting_02` | Well Fought | inst | fanfare | 0:30 | 29.5s | 26s | 202 KB | clean | clean |
| `defeat_sting_01` | Not This Time | inst | downbeat | 0:30 | 21.9s | 22s | 150 KB | clean | clean |
| `quest_sting_01` | Signed and Sealed | inst | curious | 0:20 | 19.7s | 20s | 135 KB | **abrupt** | clean |
| `tavern_song_drinking_01` | The Ale Runs Low | song | rowdy | 2:15 | 133.5s | 130s | 914 KB | clean | clean |
| `tavern_song_boast_01` | I Fought a Bear | song | comic | 2:15 | **93.3s** | 128s | 639 KB | clean | clean |
| `tavern_song_ballad_01` | The Girl Who Went to the Ridge | song | wistful | 2:10 | 129.2s | 135s | 884 KB | clean | clean |
| `tavern_song_work_01` | Haul Away | song | gruff | 2:10 | 129.5s | 120s | 886 KB | clean | quiet |
| `tavern_song_jig_01` | Boots Under the Table | song | joyful | 2:10 | 130.1s | 125s | 891 KB | clean | clean |
| `tavern_song_lament_01` | Ten Went Out | song | sombre | 2:10 | 129.9s | 130s | 889 KB | **abrupt** | clean |
| `tavern_song_anthem_01` | Who Fights | song | comic | 2:10 | 130.5s | 122s | 893 KB | **abrupt** | quiet |
| `tavern_song_ballad_02` | The Lantern in the Window | song | warm | 2:10 | 130.0s | 132s | 890 KB | **abrupt** | quiet |

`tavern_song_anthem_01` is the guild anthem and shares its title with the game — the chorus is
"Who fights? We fight."
