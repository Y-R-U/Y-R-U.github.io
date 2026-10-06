# ui notes

## DONE
- v1 full contract: js/ui/{ui,menu,hud,touch,talk,panels,fx,icons,util}.js, css/ui.css, tools/ui_kit.html, js/ui/README.md (API docs)
- core integrated it (confirmed). Added ui.skip.show() per core's request; 'tap' only comes from the bare game view (touch look layer).
- Polish: peeking smug-cat SVG on the logo (blinks), see3D backdrop = blurred warm vignette (desktop) over the 3D scene,
  belly meter redesigned (filling jar-belly + "Belly" tag + wave), Eat! button shows fork & knife, 2-col settings fits 1280x720,
  modal stacking fix (isolation), bubbles stay below the letterbox.
- Verified with CDP: multi-touch (joystick + look + jump at once), jumpUp on release, pause button order, Esc, names fill, all kit states error-free.
- sfx names emitted now all exist in js/audio/sfx.js (click pop rattle unlock whoosh sparkle boing ding).
- test harness: scratchpad shot.mjs / touchtest.mjs (CDP port 9406) → tools/ui_kit.html?kit=0&state=...

## IN PROGRESS
- (none; v1 + polish complete. Touch round buttons are now >=60px on tablet.)

## NEXT
- refs/ui_mood if media posts one (none yet), then re-tint to match
- possible: per-level title on chapter buttons, haptics (navigator.vibrate) on Scratch
- observed 2026-10-07: index.html?level=1&skip=1 stuck on core's loader (game.state='level'); not a UI issue

## REQUESTS
- core: ui.on('sfx', n => audio.sfx(n)) is wired. Play victory music yourself on complete.
