# WHO FIGHTS — music library

Everything under `audio/music/`, what each set is for, how to regenerate, and what bit me.

The manifest is **`data/music.json`** (DEV_CONTRACT §9). The game reads that file; nothing reads the
folder. If you add or replace an mp3 you must be in the manifest to be heard.

_Track table and counts are filled in at the bottom of this file by the generation run — see
**Library**._

---

## Where it came from

Generated locally with **ACE-Step 1.5 turbo** on this machine, not SUNO. SUNO is a paid web service
and an agent cannot drive it. ACE-Step is the same class of tool and it is already running here as a
launchd service on `http://localhost:8001` — see `~/cc/airon/audio/CLAUDE.md`.

`docs/SUNO.md` has every prompt and lyric as a copy-paste sheet, so any track can be regenerated on
SUNO if you prefer its take. Save it as `audio/music/<id>.mp3` and it drops straight in.

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

`stings` is the odd one. Its tracks are 20–25 s, they resolve and stop, and they are **not** loop
beds — the runtime should fire one over the top of whatever bed is playing (duck the bed, don't
cross-fade it away) rather than swap sets. Everything else is a loop bed: pick one, play it, and when
it ends pick the next from the set.

**Volumes are set per-set, not per-track**, and they are deliberately low. These are beds under
dialogue. `combat` is the loudest at 0.75 and the tavern songs sit at 0.7 because they are meant to
be the thing you notice when you walk in.

---

## Regenerating

The GPU is a single slot — ACE-Step, Flux and the LLMs cannot co-reside in 24 GB. Do not run a Flux
batch at the same time. The dev server serialises `/api/music` and `/api/flux` for this reason.

```bash
cd ~/cc/yru/site/gms/3d/whofights

node tools/music/gen_music.mjs tools/music/jobs.json --dry          # list jobs, no GPU
node tools/music/gen_music.mjs tools/music/jobs.json                # generate everything missing
node tools/music/gen_music.mjs tools/music/jobs.json --only=combat_01,combat_02
node tools/music/gen_music.mjs tools/music/jobs.json --only=combat_01 --force   # reroll a take
node tools/music/gen_music.mjs tools/music/jobs.json --retries=2    # auto-retry a rejected take

node tools/music/build_manifest.mjs   # jobs.json + results.json -> data/music.json
node tools/music/build_suno_doc.mjs   # jobs.json -> docs/SUNO.md
```

`tools/music/jobs.json` is the single source of truth for prompts and lyrics. Edit it, not
`data/music.json` and not `docs/SUNO.md` — both are generated from it.

`tools/music/results.json` is the measured record of every take: duration, peak, RMS, tail RMS, wall
time, pass/fail and the reject reasons. It is what makes the script resumable — a job with a passing
result and a file on disk is skipped.

`gen_music.mjs` also exports `submit`, `waitFor`, `download`, `measure`, `qc` and `generateOne`, so
the dev server's `POST /api/music` can import it instead of reimplementing the protocol.

### Adding a track

1. Add an entry to `tools/music/jobs.json` — `id`, `title`, `kind`, `mood`, `seconds`, `prompt`,
   `lyrics` (empty string for an instrumental).
2. `node tools/music/gen_music.mjs tools/music/jobs.json --only=<id>`
3. Put the id into a set in the `SETS` table at the top of `tools/music/build_manifest.mjs`.
4. `node tools/music/build_manifest.mjs && node tools/music/build_suno_doc.mjs`

---

## Quality control

**A file existing is not a take succeeding.** Every take is measured with ffprobe and ffmpeg
`volumedetect` before it is accepted. `qc()` in `gen_music.mjs` rejects:

| check | threshold | catches |
|---|---|---|
| duration | within ±30% of requested | the take that ran to the cap, or stopped early |
| peak | below −9 dBFS | the model gave up and produced a whisper |
| peak | above +1 dBFS | real clipping (mp3 decode overshoots a little, hence +1 not 0) |
| RMS | below −34 dBFS | near-silence, an ambient wash with no music in it |
| **last 3 s RMS** | below −45 dBFS | **the specific house failure — a take that stops rather than ends** |

That last row is the one that matters. The known failure mode here is a generation that hits the
server's duration cap and never resolves musically; it just stops, and the tail goes dead. Keeping
`audio_duration` well inside the cap (nothing here is over 135 s against a 480 s cap) is the
prevention; the tail-RMS check is the detection.

A rejected take is retried once (`--retries=1`), and if it fails again the mp3 is deleted and the id
is left out of `data/music.json` entirely. **The manifest never points at a file that failed QC.**

### What QC cannot do

It cannot tell you the song is *good*. It cannot tell you the vocal is singing the words you wrote
rather than a convincing mush that scans like English. Measurement catches broken; it does not catch
mediocre. **Audition the sung tracks before shipping them** — see the honesty note below.

---

## Gotchas

- **`result` comes back from `/query_result` as a JSON string**, not a nested object. `JSON.parse` it
  before you look for `result[0].file`.
- **`thinking: true` for anything with lyrics, `false` for instrumentals.** It runs the 5 Hz LM
  metadata phase and meaningfully improves how the vocal lands on the words. On an instrumental it
  is wasted time.
- **Voice character comes from the `prompt`, not from lyric tags.** There are no real speaker tags.
  `(male)` / `(female)` / `(crowd)` / `(both)` inline in the lyrics are hints that help the model
  place vocals across sections; the actual timbre is whatever the Style prompt asked for. If you want
  a female lead you must say so in the prompt.
- **Say "instrumental, no vocals" in words** in the prompt for instrumentals, even though leaving
  `lyrics` empty already means instrumental. Left implicit, ACE-Step will happily put a wordless
  vocalise over the top of your tavern room-tone.
- **`inference_steps: 4`.** The turbo model is distilled for low step counts; above 6 you pay for
  nothing. Below 4 it gets crunchy.
- **Do not switch to `acestep-v15-xl-sft`.** Better vocals, but lyrics + thinking blows past the
  server's 600 s timeout on nearly every gen. It is only viable for short instrumentals, and it needs
  CPU offload flags to fit at all.
- **Cold start is ~50 s.** The first job of a run pays it; after that the model stays warm as long as
  something is pending. The proxy will not unload while `pending_tasks` is non-empty, so submit-then-
  poll is safe. After a run, `POST /admin/unload` frees the RAM immediately instead of waiting out
  the 120 s idle timer — do that before you go and use Flux.
- **`timeout` is not a command on this machine** (it is GNU coreutils; macOS does not ship it). It
  cost a wasted background task. Use `gtimeout` or a JS-side deadline.
- **ACE-Step normalises every output to peak 0.8913** (`[Normalization] Audio 0 AFTER: Peak=0.8913`
  in the log), which decodes to −1.4 dBFS on literally every file. So the **peak checks in `qc()` can
  never fire** on an ACE-Step take — they are there for hand-dropped and SUNO replacements. **RMS and
  tail-RMS are the only peak/level checks doing real work here.** Do not read "peak −1.4 dB on all 25
  tracks" as 25 healthy mixes; it is one constant reported 25 times.
- Output is 48 kHz stereo 128 kbps mp3. Fine for a browser game; nothing needs transcoding.

---

## Library

_(filled in below by the generation run)_
