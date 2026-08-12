# SF-SCRIPT — handoff

Act two's words. Four scenes as playable data, three Suno takes written out for Aaron to
generate, and the nineteen post-stones barks wired up behind a gate that keeps them silent until
their recording exists.

Assume you have none of my context. Start at `docs/SCRIPTS-ACT-TWO.md` if you are here about the
voice, and at `game/js/story/scenes.js` if you are here about the code.

## What I wrote

| file | what |
|---|---|
| `game/js/story/scenes.js` | **new** — `SCENES = {stones, fire, glade, after}`, contract §3.1 shape. 64 beats, 4 scenes. |
| `game/js/story/script.js` | added `SPEAKER.ostrick`, `SPEAKER.seam`, and a new `TAKES` export. Nothing existing changed. |
| `game/js/sim/barks.js` | 19 new lines, `take`-gating, `after`-gating, the `alone` trigger, `setFlag()`. |
| `docs/SCRIPTS-ACT-TWO.md` | **new** — the file Aaron generates from. Four Who/Line/Direction tables + three Suno blocks + what to do with the mp3s. |
| `docs/VOICE-AND-MUSIC.md` | pointer to the above; §8e marked wired. |
| `DESIGN.md` | §5 rewritten to describe the game that now exists. |
| `tools/checkscenes.mjs` | **new** — static consistency check on the scene data. |

I wrote nothing else. `story/runner.js`, `sim/npc.js`, `sim/level.js`, `sim/act.js`, `ui/*` are
other agents'.

## The data, and what consumes it

```js
import { SCENES } from '../story/scenes.js';
import { SPEAKER, TAKES } from '../story/script.js';
```

Each scene: `{ id, duration, letterbox, cast[], cam{x,y,zoom,ease}, beats[], cues[] }`.

- **beats** — `{ t, dur, who, text, anchor, ax, ay, take, vo }`, exactly the shape `ui.say()`
  already eats. `who` is a key in `SPEAKER`; `anchor` is `'rook' | 'ostrick' | 'seam' | 'world'`
  and with `'world'` the `ax`/`ay` are absolute world coordinates rather than an offset.
- **cues** — only names from contract §3.3. The parameter shapes I used, so the runner knows what
  to read: `cam.to {x, y, dur}`, `cam.shake {a, d}`, `rook.walk {x}`, `audio.cue {key}` where key
  is a `core/audio/music.js` state (`explore`, `tension`, `victory` are the three I use). Every
  other cue I fire is bare.
- **cast** — `{ who, x, face, enter }`. `who` is an NPC kind from contract §3.4: `ostrick`,
  `elder`, `staff`.

**`vo` is `null` on all 64 beats and every scene is written to play correctly silent.** Timings
are readable with no audio at all — that is the deliverable, not a placeholder. Each scene's beat
list opens with a `── VO: <take> ──` comment marking the block whose `vo: null` gets replaced when
the mp3s exist. Nothing else changes then: not a `t`, not a `dur`.

Run `node tools/checkscenes.mjs` after touching any of it. It asserts every beat has a known
speaker, a known take, a known anchor, a `dur` long enough for its text at its speaker's cps, no
two bubbles overlapping for one speaker, no beat or cue running past the scene end, and every
`cues[].fx` in contract §3.3. It exits non-zero and prints what is wrong.

## REQUESTS — things I need from other agents

**1. ~~`ui/world.js` needs a `style: 'none'` branch~~ — DONE, verified.** `ui/world.js` now has
`const bare = b.sp.style === 'none'` and the Seam draws exactly as intended: bare glowing letters,
no panel, no tail, no name tag. Confirmed by capturing the UI canvas mid-line at the glade. The
original request is left below for the record; nothing is outstanding.

~~The Seam's whole effect is that it
has **no bubble**: bare letters drifting where the voice is, no panel, no edge, no tail, no name
tag. Every other speaker has a panel and the *absence* is the horror — there is nobody there for a
tail to point at. `createBubbles`' draw path currently branches only on `style === 'sharp'`
(angular) vs everything else (round), so `SPEAKER.seam.style = 'none'` today falls through to the
round parchment shape with the tremble switched off. That is a survivable fallback — it reads as
Vayne's bubble with the life gone out of it, which is the right idea — but it is not the effect.
What 'none' should do: skip the tail, skip the body fill and both strokes, skip the name tag, and
draw the typed text alone with a soft glow, ideally with a slow per-character vertical drift. I
did not touch the file; it is yours.~~

**2. Cast `enter` values (SF-STORY).** I use three: `'stand'` (spawn in place, already posed),
`'west'` (spawn where declared, off-screen to the west, and **do not move until told** — the
`after` scene declares Ostrick at x 9350 and moves him with `ostrick.arrive` at t=13), and none
other. If `enter` is not implemented, `'west'` failing open means Ostrick is standing in the
victory shot from frame one, which is wrong — please honour it or tell me and I will move him
further off-screen. The three elders are **not** in any `cast`; contract §3.3 says `elders.arrive`
spawns them, so that cue owns them entirely.

**3. `audio.hasTake(name)` and a `take` option on `audio.voice()` (SF-STORY).** `barks.js` already
calls `audio.voice(offset, length, { take })` and null-checks `audio.hasTake`; the current
`core/audio.js` ignores the third argument's `take` harmlessly. Take names are the keys of `TAKES`
in `story/script.js`: `vayne`, `rook`, `barks`, `ostrick`, `rook2`, `vayne2`.

**4. Progress → bark flags (SF-ACT).** `barks.js` sets story flags from `story:done`, so a player
who *reloads* after the stones scene loses the two Ostrick callbacks for the rest of the run.
There is a `barks.setFlag('stones')` for exactly that — call it when `progress` restores an act
state at or past `stones`. Not fatal if you do not; two lines out of ~45 go quiet.

## Notes on things that will look wrong

- **Scene durations are not 44s.** Contract §3.1 shows `duration: 44` in its example; that was
  illustrative. The real lengths are stones 67, fire 29, glade 63.5, after 54. The stones scene is
  25 lines of dialogue and cannot be said in 44 seconds by anyone.
- **The gaps are not slack.** Three silences are load-bearing and shortening any of them breaks
  the scene it is in: the 2.8s hold after "Take it. Just take it." (Ostrick has to be visibly
  thrown before he answers), the 2s dark after the brazier goes out, and the 6s of nothing that
  opens the `after` scene. There is also a 1.4s gap in `fire` where Rook casts and nothing
  happens — that gap *is* the plot point.
- **Every Seam bubble holds for exactly 2.4s** regardless of length, including the one-word
  `Rook.`. A thing reading from a card does not vary its pace. `checkscenes.mjs` only enforces a
  minimum, so this passes; do not "fix" it by trimming the short ones.
- **`SPEAKER.seam` has no `name`.** A name tag would be the game agreeing that somebody is
  speaking. Leave it empty.
- **`VOICES` is still the intro's two files and must stay that way.** `intro/index.js` fetches
  every entry in it on boot, so adding act two's takes there would be four 404s under the cold
  open. Act two's map is the new `TAKES` export, keyed by **take** rather than by speaker — Rook
  has two takes and Vayne has two, one of which is the Seam wearing his.

## The barks

Nineteen new lines from `VOICE-AND-MUSIC.md` §8e, plus the new `alone` trigger.

- **`take` gate.** Every line in this game is voiced, so a line whose recording does not exist is
  not selectable at all — one silent line in a pool of voiced ones reads as a bug, not restraint.
  `voiced(line)` asks `ctx.audio.hasTake(line.take)` and, where that does not exist, falls back to
  "does this line have real `vo` offsets", which is the same answer for the not-yet-recorded ones.
  **All nineteen new lines are therefore inert until `audio/vo/rook2.mp3` lands.** That is
  correct, and it is the single most likely thing for a future session to "fix" by mistake.
- **`after` gate.** A number is a player level, a string is a story flag. Level is read from
  `ctx.spellSystem.level` when present rather than counted from `player:level`, because a resume
  restores the level without emitting an event. Both Ostrick callbacks are gated on the `'stones'`
  flag.
- **The used-line cycle** is now "every line he is *currently allowed*", not every line in the
  pool — otherwise unlocking one line at level 6 silently re-opens all the ones he has just said.
- **`alone`** fires at priority 1 when there has been no bark for 40s *and* nothing alive and
  hostile within a screen (`world.halfW` × `world.halfH`·1.2) for 40s. The scan walks
  `world.entities` twice a second; nothing about it is urgent. It is suppressed entirely while
  `world.playerControl` is false, so it cannot talk over a cutscene.

Verified in the real game headlessly: `?nointro&nosave&autostart&scene=play`, emit `player:pit`,
get `"Not my finest."` — a `barks.mp3` line — and no `rook2` line is reachable. The `alone`
timing, the flag gate and the enemy suppression were verified against a stub world; that script
was scratch and is not committed, but it is ten lines and `createBarks` takes a plain object.

## Correction pass — `cam.y` against the real terrain

Done after SF-LEVEL finished, when the ground under all four scenes became measurable. Every
`cam.y` is now **derived**, not eyeballed: `cam.y = groundAt(cam.x) − K`, K in 280–335.

Where K comes from: the play scene frames gameplay at `player.y − halfH * lead`
(`LEAD_DEFAULT` 0.38 landscape, `LEAD_PORTRAIT` 0.22), and the player's centre sits 76px above
the ground line (`p.h` 152, measured live: `p.y` −12.8 with `groundY` 64.0). That works out at
ground−304 landscape and ground−271 portrait, so K in that band reproduces the game's own
composition. Measured `groundAt`: 7530 → 104, 7560 → 110, 7625 → 112, 8780 → −91, 10250 → 98.

| scene | was | now | why |
|---|---|---|---|
| `stones` | −180 | −180 | already right (ground 104, K 284). Annotated, not changed. |
| `fire` | −190 | −190 | already right (ground 110, K 300). Annotated. |
| `fire` `cam.to` | 7740, −220 | **7625, −215** | see below — the old target was inside a cliff |
| `glade` | −200 | **−370** | the real error. The glade plateau is 195px higher than the stones (ground −91), so −200 framed the same picture there that it does at the stones and put the ring, the staff and the kneeling shot in the bottom fifth. |
| `after` | −240 | **−220** | ground 98, K 318. Was slightly low on the horizon in landscape. |

**The `fire` pan was aimed at the top of a cliff.** Probing the live level:
`groundY` returns +112 at x=7625 and **−1200 from 7650 all the way to 7900** — the rock face is
solid rock 1300px tall until `openGate` carves it. So a camera sent to the breach centre (7770)
frames a wall, and the runner's ground clamp then drags it a thousand pixels into the sky. The
pan now stops at 7625, the last open air west of the face, which still brings the face into the
right third of the frame in portrait. **Nothing may pan into 7650–7900 before the gate opens**,
and opening it does not help: the breach is carved at ground level and the cliff above it stays.

**Verified by looking, in the real game** (`?nointro&nosave&autostart&scene=play&act=<state>`),
at 1440×900 and 390×844, plus deterministic scrubs through `story-test.html` with `here=0` and
`ctx.act.update` stood down:

| scene | ground line (land / port) | head (land / port) | bubble |
|---|---|---|---|
| `stones` | 0.764 / 0.679 | 0.619 / 0.580 | 0.50 |
| `fire` | 0.786 / 0.693 | 0.634 / 0.591 | 0.46 / 0.47 |
| `glade` | 0.755 / 0.672 | 0.614 / 0.577 | 0.455 / 0.47 |
| `after` | 0.782 / 0.687 | 0.646 / 0.597 | 0.52 / 0.51 |

(fractions down the frame; gameplay itself sits the ground at 0.75 landscape / 0.65 portrait).
All four scenes now play with **zero camera-clamp warnings** in both orientations. Eyeballed the
captures too: Ostrick and Rook both in frame at the stones, Rook centre-frame with the staff and
the lit ring at the glade in portrait, the snuffed brazier and fresh rubble at the fire.

Two things found while doing it, both other people's files:

- **`runner.js`'s `frameY` probe starts at `player.y − 1200` and can catch an overhang.** At the
  stones the rock face's brow hangs at about −1200 to −2100 over x 7380–7900; with the player even
  slightly airborne the probe starts above the brow's underside and reports **−1376 as "the
  ground"**, then clamps a perfectly good `cam.y` a thousand pixels up and warns. Seen live in the
  harness. `act.js` starts the stones scene on `player.x > 7440`, and he can absolutely be
  mid-jump when that fires. Probing downward from `scene.cam.y` (which is always above the ground
  and below the brow) instead of from the player would fix it.
- **Speech bubbles are on a separate 2D canvas, `#sf-canvas`.** `tools/shot.mjs --canvas` grabs
  the WebGL canvas, so no capture taken that way has ever contained a bubble — this cost me a
  detour chasing "bubbles rendering as empty black rectangles", which were props. Capture bubbles
  with `--canvas "#sf-canvas"`, and the world with the default.

## What I would do next

1. **Generate the three takes.** `docs/SCRIPTS-ACT-TWO.md` §3 is paste-ready. Two of them are
   *continuations* — that is not a preference, it is the only thing that kept the voice consistent
   the first time. `vayne2` is the hard one and the failure mode is a demon voice; §3c lists what
   to reject without listening twice.
2. **Paste the offsets** into `scenes.js` and `barks.js`, and run the round-trip check in
   `VO-TIMING-RECIPE.md` step 6. It is what caught a bark being half a line last time.
3. **Play all four scenes with sound on, in both orientations.** A line that reads fine silently
   can still be a second longer than its bubble, and the fix is here, not in the take.
4. **The trailer cut** (`VOICE-AND-MUSIC.md` §2c) is now missing the best line in the game. If it
   is ever regenerated, the Seam replaying "You're what's here." flat, straight after Vayne says
   it properly, is the whole pitch in six seconds.
