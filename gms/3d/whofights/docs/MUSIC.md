# WHO FIGHTS — music library

25 tracks, 17.8 MB shipped. Everything under `audio/music/`, what each set is for, how to
regenerate, and what bit me.

The manifest is **`data/music.json`** (DEV_CONTRACT §9). The game reads that file; nothing reads the
folder. An mp3 that is not in the manifest is not heard.

---

## Where it came from — read this first

**Every track in this library was generated locally with ACE-Step 1.5 turbo. None of it is Suno.**

The plan changed twice mid-session. The intent was to generate the shipped library on Suno through
Aaron's logged-in browser (recipe: `../../2d/skyhammer/docs/MUSIC_NOTES.md`) and keep ACE-Step as the
local-iteration route. **That did not happen: the browser automation was refused by the permission
classifier on the very first call** (`tabs_context_mcp`), so no Suno tab was ever opened, no
generation was run, and no credits were spent. The Suno path needs Aaron to approve browser access
before anyone can try again.

So the ACE-Step library is what shipped. That is not the disaster it might have been — see the
comparison below — but **nobody has A/B'd these against a Suno take of the same brief**, and that
comparison is still the most useful thing a future session could do.

### ACE-Step vs Suno — what is actually known

Being straight about the evidence, because this matters for when Aaron's Suno subscription lapses
and ACE-Step becomes the only route:

| | ACE-Step 1.5 turbo (local) | Suno v5.5 (from the skyhammer session) |
|---|---|---|
| Cost | free, runs on the machine | credits, ~10 per generation |
| Speed | **faster than realtime** — 120 s of audio in ~85–110 s wall | ~60–90 s per generation, 2 takes |
| Duration control | exact. Asked for 120 s, got 120.0 s, **25 times out of 25** | undershoots; asked 15 s stings came back 7.5 s |
| Endings | fades out cleanly on 21/25 | "does not produce loop-ready material", most end abruptly |
| Vocals | untested against Suno. See below. | not tested — skyhammer was 100% instrumental |
| Batch of 25 | 48.9 min unattended, one command | a browser session, manual |

**On duration ACE-Step is clearly better**, and duration is where the house failure mode lives.
Suno's stings came back at half the requested length; ACE-Step hit every target exactly. If the only
thing you knew was the measurements, you would pick ACE-Step.

**On musical quality nobody has compared them, because the Suno half never ran.** Do not read the
table above as "ACE-Step wins" — it wins on the things a machine can measure, which is precisely the
set of things that does not tell you whether a track is good.

---

## Honesty about the vocal tracks

Aaron specifically asked for tavern songs with lyrics, and that is the part most likely to
disappoint. **I cannot hear. Nobody has listened to any of these.** What I can tell you:

- All 8 songs are the right length, are not silent, are not clipped, and do not stop early.
- All 8 contain actual singing rather than wordless vocalise — a speech model asked to transcribe
  them comes back with English words, and comes back with `🎵` (no speech) on the instrumentals, so
  that distinction is real.
- Beyond that, **I stopped grading them by measurement on purpose.** An earlier version of this file
  quoted word-recall percentages per song. That number is worthless as a quality signal and this
  repo has already been burned by it: `../neonhaul/tools/vo/kokoro_say.py` records a voice pool that
  measured **90.7 % intelligible** and that Aaron played and described as *"a computer voice from the
  90s"*. Both statements were true at once. A recognisability score cannot see prosody, and prosody
  is the whole game.

One thing worth passing on that came out of the measurement before I dropped it, because it changed
the takes: the first pass at `tavern_song_drinking_01` and `tavern_song_work_01` buried the lead
vocal under a full crowd-and-band mix. Rewriting both prompts to demand **one close-miked lead, the
crowd only on the response, and far fewer instruments** visibly changed the result. That prompt
lesson is in the ACE-Step prompt notes below and it is real regardless of what the score said.

**`tavern_song_drinking_01` is the one I would audition first and expect to redo.** It is the
densest mix in the set and it stayed the murkiest of the eight through two attempts.

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

`stings` is the odd one. Its tracks are 20–26 s, they resolve and stop, and they are **not** loop
beds — fire one over the top of whatever bed is playing (duck the bed, don't cross-fade it away)
rather than swapping sets. Everything else is a loop bed.

Volumes are per-set and deliberately low — these are beds under dialogue. `combat` is loudest at
0.75; the tavern songs sit at 0.7 because they are meant to be the thing you notice walking in.

### For whoever builds the music box

Two things the manifest does not carry, both measured and both in `tools/music/results.json`:

- **`ends`** — `fade` or `abrupt`. Four tracks stop at full volume rather than fading:
  `meadow_bed_01`, `meadow_bed_03`, `quest_sting_01`, `tavern_song_lament_01`. The runtime should
  fade those out itself or they will click on loop. I kept this out of `data/music.json` to stay on
  the §9 schema — **if you want it in the manifest, say so and §9 can gain an `ends` field.**
- **`headRmsDb`** — several tracks ramp in from quiet (`tension_02` at −33.8 dB, `tavern_inst_01` at
  −32.0, `combat_01` at −32.1). A naive loop dips in volume every pass. Trim the first ~2 s of those
  or cross-fade the seam.

---

## Compression

Raws are kept at `audio/music/raw/` and are **gitignored** — they never enter the repo, but they stay
on disk so any track can be re-encoded at a different rate later without regenerating it.

Everything ships at the **`full`** profile: **56 kbps mono @ 32 kHz**. 40.7 MB → 17.8 MB, **2.2×**.

```bash
tools/music/compress_music.sh                       # all raws -> audio/music/ at the default
tools/music/compress_music.sh vocal                 # re-encode everything at the vocal profile
tools/music/compress_music.sh vocal tavern_song_jig_01   # one track, one profile
```

| profile | encode | for |
|---|---|---|
| **`full`** (default) | `-ac 1 -ar 32000 -b:a 56k` | everything. Near the floor for this material. |
| `vocal` | `-ac 1 -ar 32000 -b:a 80k` | the tavern songs if 56 k costs too much diction |
| `bed` | `-ac 1 -ar 24000 -b:a 40k` + `lowpass=f=11000` | quiet beds where nobody is listening closely |
| `hifi` | `-ac 2 -ar 44100 -b:a 128k` | near-transparent, for A/B against the raw |

Full ffmpeg lines are in `tools/music/compress_music.sh`; keep that table and the script in sync.

**Which profile sounds right is a human call, not a measurement.** Play a track at two rates and keep
the one you prefer. **If the library is still too heavy, the honest lever is dropping tracks, not
dropping bitrate** — 56 kbps mono is already near the floor, and shaving it degrades all 25 tracks to
save a couple of MB. Cutting `tavern_songs` to five and `outdoors` to two saves far more and costs
nothing that is left.

---

## Regenerating

The GPU is a single slot — ACE-Step, Flux and the LLMs cannot co-reside in 24 GB. Do not run a Flux
batch at the same time. The dev server serialises `/api/music` and `/api/flux` for this reason.
**When you finish a run, `POST http://localhost:8001/admin/unload`** — otherwise the next Flux job
waits out the 120 s idle timer.

```bash
cd ~/cc/yru/site/gms/3d/whofights

node tools/music/gen_music.mjs tools/music/jobs.json --dry          # list jobs, no GPU
node tools/music/gen_music.mjs tools/music/jobs.json                # generate everything missing
node tools/music/gen_music.mjs tools/music/jobs.json --only=combat_01,combat_02
node tools/music/gen_music.mjs tools/music/jobs.json --only=combat_01 --force   # reroll a take
node tools/music/gen_music.mjs tools/music/jobs.json --retries=2    # auto-retry a rejected take

tools/music/compress_music.sh          # raw -> shipped
node tools/music/build_manifest.mjs    # jobs.json + results.json -> data/music.json
node tools/music/build_suno_doc.mjs    # jobs.json -> docs/SUNO.md
```

`tools/music/jobs.json` is the **single source of truth** for every prompt and lyric. Edit it, not
`data/music.json` and not `docs/SUNO.md` — both are generated from it. Because every track's full
intent is recorded there, **any track in this library can be re-made from scratch without Suno**,
which is the point: `--only=<id> --force` and you have it back.

`tools/music/results.json` is the measured record of every take — duration, peak, RMS, head, tail,
how it ends, wall time, pass/fail and reject reasons. It is what makes the run resumable: a job with
a passing result and a file on disk is skipped.

`gen_music.mjs` exports `submit`, `waitFor`, `download`, `measure`, `qc` and `generateOne`, so the
dev server's `POST /api/music` can import it rather than reimplementing the protocol.

### Adding a track

1. Add an entry to `tools/music/jobs.json` — `id`, `title`, `kind`, `mood`, `seconds`, `prompt`,
   `lyrics` (empty string for an instrumental), optional `source`.
2. `node tools/music/gen_music.mjs tools/music/jobs.json --only=<id>`
3. `tools/music/compress_music.sh full <id>`
4. Put the id into a set in the `SETS` table at the top of `tools/music/build_manifest.mjs`.
5. `node tools/music/build_manifest.mjs && node tools/music/build_suno_doc.mjs`

---

## Writing ACE-Step prompts — what actually worked

ACE-Step wants a **different kind of prompt from Suno**, and when the Suno subscription lapses these
are what has to be reproduced. Suno takes a short style tag list; ACE-Step responds to a longer,
concrete description of the arrangement. The pattern that worked, in order:

1. **Genre and function** — "renaissance chamber consort", "fast irish tavern jig", "dark fantasy
   tension underscore".
2. **`instrumental, no vocals`, in words**, for every instrumental. An empty `lyrics` field already
   means instrumental, and it is *still* not enough — left implicit, ACE-Step puts a wordless
   vocalise over the top. Say it twice if it is a mood piece.
3. **Tempo and metre as numbers** — "84 bpm, 4/4", "132 bpm, 6/8". It honours these.
4. **Name the actual instruments**, three or four of them, and say what each is doing: "harpsichord
   and plucked lute trade a polite walking figure while viola da gamba and recorder answer".
   Naming instruments is the single highest-leverage part of the prompt.
5. **Say what to leave out** — "no drum kit", "no synths", "no electric guitar", "no percussion".
   Negative constraints land.
6. **One sentence of mood and one of recording space** — "courtly, orderly, slightly inquisitive",
   "dry warm acoustic", "natural stone reverb".

**For vocals, the mix instruction is the important part.** The voice character comes from the prompt,
not the lyric tags — `(male)` / `(female)` / `(crowd)` inline in the lyrics only help place vocals
across sections. Two of eight songs came back with the lead buried, and both were fixed by rewriting
the prompt to say, explicitly:

> ONE clear male baritone lead vocal, close-miked and mixed loud right at the front — the lead voice
> is the loudest thing in the mix by far, every word crisp and clearly enunciated. a small crowd
> joins in only on the chorus, quietly, well behind the lead. […] plenty of space, no accordion, no
> brass, no wall of noise. diction is the priority.

Ask for a full band and a crowd in unison and you get mud. Ask for one voice, few instruments and
space, and you get words. Every prompt is in `docs/SUNO.md` and in `tools/music/jobs.json`.

---

## Quality control

**A file existing is not a take succeeding.** Every take is measured with ffprobe and ffmpeg
`volumedetect` before it is accepted. These are **build checks** — silent, truncated, clipped,
zero-length — the defects a machine genuinely can catch. Nothing here scores how *good* a take is;
that is a human call and the tooling deliberately does not pretend otherwise.

| check | threshold | catches |
|---|---|---|
| duration | within ±30% of requested | a take that ran to the cap, or stopped early |
| peak | below −9 dBFS / above +1 dBFS | dead quiet / real clipping |
| RMS | below −34 dBFS | near-silence, an ambient wash with no music in it |
| **last fifth vs whole** | more than 20 dB down | **the take that gave up partway and left dead air** |

`qc()` was falsified against three deliberately broken builds before being trusted: a file whose
audio stops at 70 s of 120, a file attenuated 40 dB, and a normal file with a 4 s fade. It rejects
the first two and passes the third. **A check never proven to fail is not evidence.**

A rejected take is retried (`--retries=N`); if it still fails the mp3 is deleted and the id is left
out of `data/music.json` entirely. **The manifest never points at a file that failed QC.**

---

## Gotchas

- **`-ss` must come before `-i` in ffmpeg.** This cost the most time of anything in the session. The
  tail-level check had `-ss` on the output side, so `volumedetect` measured the whole file every
  time and the tail figure came back **exactly equal to the whole-file figure on all 25 tracks** —
  a check that could never fail, sitting in the code labelled as the important one. The tell was the
  delta being `0.0` on every single row; a real measurement is never that tidy. When it was fixed it
  immediately caught a genuine defect the broken version had waved through: `victory_sting_02` was
  playing for ~17 s of 22 s and then dying.
- **ACE-Step normalises every output to peak 0.8913** (`[Normalization] Audio 0 AFTER: Peak=0.8913`
  in the log), which decodes to −1.4 dBFS on every raw file. The peak checks in `qc()` therefore
  **cannot fire on an ACE-Step take** — they are there for hand-dropped and Suno replacements. Do not
  read "peak −1.4 dB on all 25" as 25 healthy mixes; it is one constant reported 25 times.
- **`result` comes back from `/query_result` as a JSON string**, not a nested object. `JSON.parse` it
  before looking for `result[0].file`.
- **`thinking: true` for anything with lyrics, `false` for instrumentals.** It runs the 5 Hz LM
  metadata phase and meaningfully improves how the vocal lands on the words. Wasted on instrumentals.
- **`inference_steps: 4`.** Turbo is distilled for low step counts; above 6 you pay for nothing,
  below 4 it gets crunchy.
- **Do not switch to `acestep-v15-xl-sft`.** Better vocals, but lyrics + thinking blows past the
  server's 600 s timeout on nearly every gen, and it needs CPU-offload flags to fit at all.
- **Cold start is ~50 s** and it is charged per *run*, not per job — the first track of a batch pays
  it. One 25-job run took 48.9 min; a single-track rerun of a 26 s sting took 6.5 min, almost all of
  it reload. **Batch your rerolls.**
- **The proxy will not unload while a task is pending**, so submit-then-poll is safe. But it also
  will not unload for 120 s after you finish, so unload explicitly if something else needs the GPU.
- **Running CPU work alongside a generation slows it measurably** — wall time per track went from
  ~86 s to ~160 s while a CPU transcription job was running, and back down when it stopped. The GPU
  is the single slot, but the CPU is not free either.
- **`timeout` is not a command on macOS** (it is GNU coreutils). It silently cost a wasted background
  task. Use `gtimeout`, or a deadline inside the script.
- Raw output is 48 kHz stereo 128 kbps mp3; shipped is 32 kHz mono 56 kbps.

---

## Library

25 tracks, 17,824 KB shipped. `ends` is `abrupt` where the runtime must apply its own fade-out.

| id | title | kind | mood | len | size | ends |
|---|---|---|---|---|---|---|
| `menu_bed_01` | Who Fights | inst | noble | 120s | 821 KB | fade |
| `hall_bed_01` | The Contract Board | inst | stately | 120s | 821 KB | fade |
| `hall_bed_02` | Instructors and Ledgers | inst | warm | 110s | 753 KB | fade |
| `meadow_bed_01` | Low Green Country | inst | pastoral | 125s | 855 KB | abrupt |
| `meadow_bed_02` | The Long Track East | inst | bright | 110s | 753 KB | fade |
| `meadow_bed_03` | Rain Over the Fields | inst | wistful | 115s | 787 KB | abrupt |
| `tavern_inst_01` | Room Tone, The Broken Shield | inst | cosy | 120s | 821 KB | fade |
| `tavern_inst_02` | The Elbow Jig | inst | rowdy | 105s | 718 KB | fade |
| `tension_01` | Something on the Ridge | inst | tense | 115s | 787 KB | fade |
| `tension_02` | Torches Out | inst | uneasy | 105s | 718 KB | fade |
| `combat_01` | Close Quarters | inst | combat | 110s | 753 KB | fade |
| `combat_02` | Hold the Line | inst | heroic | 105s | 718 KB | fade |
| `night_bed_01` | After the Candles | inst | quiet | 130s | 889 KB | fade |
| `victory_sting_01` | Contract Complete | inst | fanfare | 25s | 172 KB | fade |
| `victory_sting_02` | Well Fought | inst | fanfare | 26s | 178 KB | fade |
| `defeat_sting_01` | Not This Time | inst | downbeat | 22s | 151 KB | fade |
| `quest_sting_01` | Signed and Sealed | inst | curious | 20s | 137 KB | abrupt |
| `tavern_song_drinking_01` | The Ale Runs Low | song | rowdy | 130s | 889 KB | fade |
| `tavern_song_boast_01` | I Fought a Bear | song | comic | 128s | 876 KB | fade |
| `tavern_song_ballad_01` | The Girl Who Went to the Ridge | song | wistful | 135s | 923 KB | fade |
| `tavern_song_work_01` | Haul Away | song | gruff | 120s | 821 KB | abrupt |
| `tavern_song_jig_01` | Boots Under the Table | song | joyful | 125s | 855 KB | fade |
| `tavern_song_lament_01` | Ten Went Out | song | sombre | 130s | 889 KB | abrupt |
| `tavern_song_anthem_01` | Who Fights | song | comic | 122s | 835 KB | fade |
| `tavern_song_ballad_02` | The Lantern in the Window | song | warm | 132s | 903 KB | fade |

`tavern_song_anthem_01` is the guild anthem and shares its title with the game — the chorus is
"Who fights? We fight."
