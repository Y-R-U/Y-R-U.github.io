# UI layer (`js/ui/*`, `css/ui.css`) — owner: ui

A DOM/CSS overlay that sits on top of the canvas. It uses no framework and no build step. Every screen and state can be
reached from buttons in `tools/ui_kit.html`. To screenshot a single state, use `?state=a,b,c&kit=0` (add `&touch=1`
for the touch layout). Press ` (backtick) to toggle the kit bar.

```js
import { ui } from './ui/ui.js'
ui.mount(document.getElementById('ui-root'))   // injects css/ui.css (if not linked) + the Fredoka Google Font link
```

## Files
| file | what |
|---|---|
| `ui.js` | the `ui` object, settings state, fullscreen, screens, Esc handling |
| `menu.js` | title (logo, chapter buttons, unlock animation) + chapter/level select |
| `hud.js` | objectives, belly meter, chase timer, ⏸, desktop key prompt / hint bar, tutorial cards |
| `touch.js` | joystick, look-drag layer, Jump / Scratch / Interact buttons (multi-touch) |
| `talk.js` | speech bubbles (Jon), thought clouds (Garfield), subtitle fallback |
| `panels.js` | modal stack, popup/confirm, pause, settings, level complete, chapter complete |
| `fx.js` | fade, letterbox + Skip, toasts, confetti |
| `icons.js` | inline SVG icons: food (steak/lasagna/meatloaf), lock, claw, paw, belly, etc. |

## Screens
`ui.screen('title'|'menu'|'chapter'|'hud'|'level'|'none')`. `menu` is an alias for `title`, and `level` is an alias
for `hud`. Title and chapter block the canvas. The HUD only takes pointer events on its buttons, plus the look layer
in touch mode.

- `ui.menu.show({chapters:[{id, title, subtitle, locked, justUnlocked}], see3D})` → Promise (resolves after the unlock
  animation). `justUnlocked` plays the sequence: padlock wiggles, the shackle pops, the lock flies off, sparkles, then
  `: Food` types in, then the locked 'Coming Soon' button pops in. Without `justUnlocked`, Coming Soon is shown
  straight away. A press emits `'chapter'` with the id. `see3D:true` makes the backdrop translucent so the 3D scene
  shows through.
- `ui.chapter.show({levels:[{n, locked, done, justUnlocked, food?}], onPick, title?, see3D})`. It shows 10 buttons
  plus a locked Coming Soon button. `food` defaults to the brief's mapping (1, 2, 7 steak; 3, 5, 6, 10 lasagna; 4, 8,
  9 meatloaf). A press calls `onPick(n)` and emits `'level'` with n. The back button emits `'back'`. Locked buttons
  shake and emit `sfx 'boing'`.

## HUD
`ui.hud.set(partial)` takes any subset of:
`{objectives:[{text, done}], belly:0..1, interactLabel:string|null, chaseTimer:seconds|null, hints:bool}`.
- When an objective flips to done, its tick pops and the row flashes.
- The belly icon fills from the bottom, scales up, and does a "gulp" wobble when the value increases.
- `interactLabel` shows the green Interact button (touch) or the floating "E / Space · Eat!" prompt (desktop, which is
  clickable).
- `chaseTimer` shows the red "Run! N" pill; null hides it.
- `hints` shows the desktop key-hint bar (default on). Turn it off after the tutorial if you like.

`ui.tutorial.show({id, text, icon, keys:['W','A','S','D'], touch:'joystick'|'jump'|'scratch'|'interact'|[...], dur?})` and
`ui.tutorial.hide(id?)`. `icon` is a name in `icons.js` (`'paw'|'claw'|'jump'|'hand'|...`) or an SVG string. Desktop
shows key caps. Touch hides the key caps and makes the named touch control glow instead.

## Talk
`ui.say({who:'jon'|'garfield', text, thought?, dur?, anchor?, until?})` → Promise. The Promise resolves when the line
closes and has `.close()` on it.
- `thought` defaults to true for Garfield, which gives a cloud with trailing circles. Jon gets a speech bubble with a tail.
- `anchor` is `{x,y}` in CSS px or a function `() => ({x,y}|null)` that is re-read every frame (project the head
  socket). Null, offscreen, or `{behind:true}` means the line goes to the bottom subtitle strip. The subtitle strip is
  hidden when the Subtitles setting is off.
- `dur` is in seconds and defaults to `1.6 + 0.055 × chars` (max 7). `until: Promise` closes the line early (e.g. when
  the VO ends).
- A new line from the same speaker replaces the old one.
- `{garfield}` / `{jon}` in any text (bubbles, objectives, toasts, tutorials) is replaced with the player's names.
  `ui.names.get(who)` and `ui.names.fill(text)`.

## Cutscene / fx
`ui.letterbox(on, {skippable=true})` shows the bars and the Skip button and hides the HUD. `ui.skip.show(bool)` shows
Skip on its own. Skip emits `'skip'`. `ui.fade(toBlack, durSec)` → Promise. `ui.toast(text, {dur, icon})`.

## Panels (modal stack; Esc closes the top one, captured before game handlers)
- `ui.pause.open()` emits `'pause'`. The panel has **Start Over** (`'restart'`), **Exit** (`'exit'`), **Resume**
  (`'resume'`) in that order, plus small ⚙ and ⛶ buttons. `ui.pause.close()`, `.toggle()`, `.isOpen`.
- `ui.settings.open()`: Fullscreen (big), Music on/off + volume, SFX, Voices, Subtitles, Graphics
  (auto/high/medium/low), Camera speed, Invert Y, Character names (+ reset), Replay intro (`'replayIntro'`), Reset
  progress (styled confirm → `'resetProgress'`).
- `ui.popup({title, text, icon, buttons:[{label, value, style:'primary'|'orange'|'cream'|'danger'}], cancelValue})` →
  Promise<value>. `ui.confirm(text, {title, yes, no})` → Promise<bool>.
- `ui.complete.show({level, food, nextUnlocked, title?})` → Promise<'next'|'replay'|'menu'>. It has confetti.
  `nextUnlocked:false` hides Next.
- `ui.chapterComplete.show({chapter, subtitle})` → Promise<'menu'|'replay'>.

## Settings state
```js
{ musicOn:true, music:0.35, sfx:0.8, voice:0.9, subtitles:true, quality:'auto', camSens:1, invertY:false,
  names:{garfield:'Garfield', jon:'Jon'} }
```
- `ui.settings.get()` returns a copy.
- `ui.settings.set(patch)` merges silently (use it at boot from save). `ui.settings.set(patch, true)` also emits.
- Every change made in the panel emits `'settings'` with the full object. Persisting it is core's job.
- `ui.settings.defaults`, `ui.settings.reset()`.

## Fullscreen
`ui.fullscreen.toggle()`, `.isOn`, `.supported`. It tries to lock landscape. On iPhone (no Fullscreen API) it shows
an "Add to Home Screen" tip popup. It emits `'fullscreenchange'` (bool).

## Input
- `ui.controls.move` is `{x,y}` in −1..1 from the joystick, with a dead zone of 0.12. **y = +1 means the stick is
  pushed up (forward).**
- `ui.controls.consumeLook()` → `{dx,dy}` in px. These are accumulated from touch drags anywhere that isn't the
  joystick zone or a button, and reading them zeroes the deltas.
- `ui.controls.jumpHeld` is true while Jump is held.
- Events (touch buttons): `'jump'` / `'jumpUp'`, `'scratch'` / `'scratchUp'`, `'interact'` / `'interactUp'`.
  Multi-touch works because each pointer is tracked separately.
- `'tap'` `{x,y}` is a short tap on the bare game view (touch only, never from buttons), for tap-to-interact.
- `ui.isBlocking()` is true while a menu, panel or popup is up, so ignore gameplay input then. `ui.isTyping()` is true
  while a name field has focus.
- Touch mode turns on with `(pointer: coarse)`, `?touch=1`, or the first touchstart. The class `html.ui-touch` is
  `ui.isTouch`.
- Portrait on a touch device shows a "turn your device sideways" card.

## Sounds
The UI never plays audio itself. It emits `'sfx'` with a name (`click`, `pop`, `rattle`, `unlock`, `whoosh`, `sparkle`,
`boing`, `ding`), all of which exist in js/audio/sfx.js. Wire them with
`ui.on('sfx', n => audio.sfx(n))`. Victory music is core's call (`audio.music('victory')`).

## Debug
`window.__ui` is the ui object. CSS scale var `--s` = min(w/1280, h/720), clamped to 0.55..1.5. Touch targets have
px floors (≥ 64 px where it matters on tablet).
