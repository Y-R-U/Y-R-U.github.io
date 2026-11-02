# polish agent

Status 2026-11-03: all three tasks done. The node tests (physics, store, story, events, meta) pass, and
`tools/sound_preview_cdp.mjs` passes (on its own Chrome, port 9541).

## 1. Candy Land music: "Sugar Rush Waltz"
`js/audio/music.js` has a new `CANDY` entry in `THEMES`. The game picks it automatically: `main.js` already calls
`audio.music.start(themeId)`, and the id is `candy`. The preview page lists it on its own, because
`MUSIC_THEMES = Object.keys(THEMES)`.
- 3/4 at 150 bpm in F major, with excursions to C and G. Chords are I, IV, V7, ii, vi and II7 (a secondary
  dominant), each lasting 2 or 4 bars.
- **Oom-pah-pah**: beat 1 is a soft triangle "tuba" through a closing lowpass, alternating root and the fifth
  below. Beats 2 and 3 are pizzicato dyads, using the cached Karplus-Strong `pizz` buffers.
- **Lead**: a celesta (FM 4:1) on the beat, with occasional eighth-note pickups. A glockenspiel sparkles on the
  off-beats. The strings pad is light and has a short attack.
- **Extras**: a slide-whistle swoop, a sugar-tinkle glockenspiel run, and faint, distant chocolate-river bubbles.
- **CPU cost**: one oscillator per "oom", buffer sources for "pah", and a quieter delay send. This is about the
  cost of frost.
- **Generic Player options** (other themes are unchanged): `meter` (when set, steps start on a downbeat, so
  `n % 6 === 0` is beat 1), `chordBars`, `delaySend`, `leadStep` and `waltz`.
- **Levels** (90 s offline render): peak 0.257, RMS -28.3 dB. That sits in line with sky, spooky and frost at
  -27 to -28 dB.
- **Not auditioned by ear.** Aaron should listen on the preview page and check the tuba level, the waltz bounce
  and the slide whistle.
- `tools/sound_preview_cdp.mjs` now also switches to candy live and writes `music_candy.wav` with `--wav`.

## 2. Landscape framing (all themes, camera only)
**Cause.** In landscape the camera tilted down about 21° with a 50° vertical FOV, so the top edge sat only
about 4° above the horizon. The palace, moon, castle and rainbow reach 12–18°.

**Fix.** The fix is camera-side, so it works on every theme and on a live rotate with no theme rebuild:
- `js/game/camera.js` exports `LAND = { pitch: -0.12, dist: 1.05, shift: 0.12 }`.
  - `pitch` makes the view a little flatter.
  - `dist` adjusts the distance so that, with the wider FOV, the course stays the same size on screen.
  - `shift` is a **lens shift** (`camera.setViewOffset`). It slides the frame up without extra tilt, so the ball
    sits at about 78% of the height.
- The shift is cleared in title orbit mode and in portrait. Gotcha: `setViewOffset` sets
  `camera.aspect = fullWidth / fullHeight`, so the code passes the real aspect.
- `js/app/main.js`: the landscape FOV goes from 50 to 60 (one number).
- The top edge is now about 17° above the horizon. The moon and sleigh, the ice palace, the candy castle and the
  whole rainbow, the sky castle and the spooky moon and mansion are all in frame.

**Portrait is untouched.** Measured: fov 62, top edge 7.9°, the same before and after.

**Hint pill.** On a landscape phone the "Drag back…" pill is now smaller and sits lower (`css/app.css`, max-height
500 block), so it clears the tee.

Aim and putting were checked in landscape: aim uses the drag vector and doesn't depend on screen projection.

## 3. Landscape-phone title (844x390)
- `index.html`: the title card's children are grouped into `.t-left` (logo, tagline, progress, theme chips) and
  `.t-right` (Career, Online, Events, Ladder/Shop, Play/Map). `.t-foot` stays after both. Portrait and desktop
  layouts are unchanged, because the wrappers are plain blocks.
- `css/app.css` (`landscape and max-height: 500px`): a two-column grid with areas `"left right" / "foot right"`,
  and settings/fullscreen under the chips.
- The card is 268–274 px tall, so it fits at 844x390 and at 740x360 with no scroll. The Online subtitle is
  visible again.
- `css/online.css`: the rule that hid the subtitle was removed. `overflow-y: auto` is kept as a fallback for very
  short screens.
- Checked at 412x915 (2x2 theme chips, unchanged) and 1440x900 (right-hand card, unchanged).

## Tools
`tools/candy_shots.mjs` gained two options:
- `--sizes=lp` adds an 844x390 landscape phone.
- `--eval='js'` runs JS after the fly-over and prints any returned value; useful for camera tuning.

It works for any `--theme=`. Example:
```
~/.claude/bin/cdp start --port 9512
for th in sky spooky frost candy; do node tools/candy_shots.mjs --theme=$th --holes=3-3 --sizes=p,l,lp --out=docs/notes/polish_shots --tag=after-$th; done
```

## Shots (`docs/notes/polish_shots/`, gitignored)
- `before-<theme>-{p,l,lp}-hole3.png` and `after-<theme>-{p,l,lp}-hole3.png`, for sky, spooky, frost and candy
- `after-frost-t22-{l,lp}-hole9.png`: the sleigh over the moon
- `after-candy-{p,l,lp}-hole9.png`
- `shoot-lp-hole3*.png`: a putt in landscape-phone
- `before-title-{p,l,lp,lp2}.png` and `after-title-{p,l,lp,lp2}.png` (lp2 = 740x360; the after title set is on
  the candy theme)

## Known issues / proposals
- **Helper rail overflow (not fixed).** On a landscape phone the right-hand helper rail (8 buttons) is taller than
  390 px, so the last button (ghost) is cut off at the bottom. This happened before my change too. It needs a
  compact rail, for example 2 columns or smaller buttons under max-height 500 (hud.js/app.css).
- **Fly-over.** The fly-over in landscape uses the same lens shift. It looked fine, but I didn't review it frame by
  frame.
- **Proposal for D13.** Landscape framing = flatter pitch + 60° FOV + a 12% lens shift, so the top edge sits about
  17° above the horizon. Themes may place hero backdrop pieces up to about 15° above the horizon along `viewDir`.
