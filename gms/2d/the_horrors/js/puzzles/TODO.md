# Puzzle Task TODO

Shared puzzle code lives in `js/puzzles/` and should be copied between:

- `/Users/aaronair/cc/yru/site/gms/2d/awake/js/puzzles/`
- `/Users/aaronair/cc/yru/site/gms/2d/the_horrors/js/puzzles/`

## Current Status

- Shared browser module: `puzzles.js`
- Shared styles: `puzzles.css`
- Implemented puzzle types:
  - `code`: short memory/code-entry puzzle, available for the per-run location challenge.
  - `sequence_repeat`: watch a short symbol sequence, then replay it; available for the per-run location challenge.
  - `image_tiles`: swap a 3x3 image puzzle using the current run's room stills; available for the per-run location challenge.
  - `code_order`: memorise and place three random code tokens; available for the per-run monster challenge.
  - `symbol_equation`: solve a tiny symbol arithmetic clue; available for the per-run monster challenge.
  - `wire_match`: match left and right symbol terminals.
  - `pressure_order`: memorise and repeat a valve/control order.
  - `spot_difference`: tap the altered tile in a 3x3 image grid.
  - `memory_grid`: repeat a flashed cell pattern.
  - `dial_align`: rotate three dials to match target symbols.
- Intended runtime behavior:
  - Each run adds exactly two mandatory challenge tasks in addition to the existing task count.
  - One challenge is derived from the selected run location.
  - One challenge is derived from the selected monster/presence.
  - Solving a challenge completes the task without spending a turn.
  - Timeout or wrong flow failure costs one turn and leaves the task incomplete.
  - Backing out does not spend a turn.

## Next Puzzle Ideas

- Add game-specific 256x256 puzzle art packs if the room stills are not distinct enough.

## Integration Notes

- `story.js` should call `window.HubPuzzles.createChallengeGroups(...)` after run location and monster/presence are selected.
- `game.js` should pass `state` to `Story.resolveStep(ref, state)` so saved challenge groups can be resolved.
- Challenge steps are plain serializable objects. Keep functions out of generated challenge groups so saves survive reloads.
- If a new puzzle type needs assets, keep the engine code shared but put game-specific assets beside each game.
