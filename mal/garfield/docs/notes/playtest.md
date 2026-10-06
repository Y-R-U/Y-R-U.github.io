# playtest — notes (wave 3, continues polish)
Owns polish's files, plus js/world/* and props since art2 finished. CDP port 9409.
Harness: scratchpad pt/ (`node run.mjs ./lN.mjs [W H] [touch]`). walker.mjs drives real keys, or the CDP touch joystick
and buttons; lib.mjs; the run logs SAYS (every bubble) and EV (jump/land/BONK/knock).

## DONE
- Real-input runs. Keys at 1280x720: L2–L10 (L8 now runs end to end: stairs → bed → door → eat). Touch at 1024x768:
  L5 and L9. All of them win.
- Controller (js/core/controller.js):
  - Thin tops (table, bench): rising with his centre at or just past the rim goes through it and mantles onto the top.
  - Rim edge escape when he ran in under the rim mid-jump.
  - L9 deep-under-table bumps are unchanged.
  - A blocked move never snaps him back across a box; he slides flush to it.
  - Corner slip at door jambs.
  - `hop(dir, speed)`: a comic dodge.
- art2 shortened upper cabinet h56 to x ≤ 3.98. Before that, counter → microwave bonked forever.
- L2: Garfield leaps clear when the chair topples back. Before, Jon landed on him.
- common.js: Jon's body is solid to the cat (standing, walking or lying). Seated-upright Jon is skipped, which matters
  for the L9 under-chair step.
- L6 and L7: Jon used to walk off in chair-local coordinates (L6: through the walls and out of the house). Now he
  `ai.standUp(t)`s first.
- L6: Jon's rescue is a fair race (cover_face 1.3 s after standing up, walk speed 0.85).
- L7: the shoo pushes him off the front of the sill. It used to push him along it.
- L5: the 'fridge top' tick needs grounded. Touch shows 'GRAB!' and a touch toast instead of 'SPACE!'.
- shared.js vase re-arm race: in L10, the "spare vase" fired while the vase was still falling, which broke the level.
- L8 bed and L4 curtain scratch targets are clamped to their floor. Scratching in the living room shredded the bed
  upstairs.
- L10: Garfield paws the pan out onto the floor to eat it.
- Win camera: cuts to the front and pushes in, and Garfield turns to face the lens. The old 0.9 s dolly swept through
  him.
- Hints pause while the controller is locked and never point at a step that's already done.
- Forced lines (no longer dropped by the bark gap): investigate arrive/look lines, Jon's leg/face/butt reaction,
  j_stunned, the first j_trapped.
- fade.js: merged furniture batches (ground:fabric etc.) fade when within 0.75 m of the lens on the camera→cat rays
  (the sofa-arm case).
- selfTest: pins belly and resets controller timers per case. The flaky "table from floor" came from leftover
  knock/jump state. Added 3 cases (rim, bench from under the table, counter → microwave). 14/14.
- marker.goal() exposed for tests.

## NEXT (not done)
- Real iPad feel and perf. The swing camera on iPad puts Jon's head in the bottom-right corner.
- The keyboard hint bar stays up during the win shot.

## REQUESTS
- none
