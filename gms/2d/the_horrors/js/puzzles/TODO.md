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
  - `word_order`: tap words in order; available for the per-run monster challenge.
  - `symbol_equation`: solve a tiny symbol arithmetic clue; available for the per-run monster challenge.
- Intended runtime behavior:
  - Each run adds exactly two mandatory challenge tasks in addition to the existing task count.
  - One challenge is derived from the selected run location.
  - One challenge is derived from the selected monster/presence.
  - Solving a challenge completes the task without spending a turn.
  - Timeout or wrong flow failure costs one turn and leaves the task incomplete.
  - Backing out does not spend a turn.

## Next Puzzle Ideas

- Add `wire_match`: connect 3-4 symbols in matching pairs.
- Add `image_tiles`: simple 2x2 or 3x3 tile reorder using room stills or generated puzzle art.
- Add `pressure_order`: tap valves/levers in a clue-derived order.

## Integration Notes

- `story.js` should call `window.HubPuzzles.createChallengeGroups(...)` after run location and monster/presence are selected.
- `game.js` should pass `state` to `Story.resolveStep(ref, state)` so saved challenge groups can be resolved.
- Challenge steps are plain serializable objects. Keep functions out of generated challenge groups so saves survive reloads.
- If a new puzzle type needs assets, keep the engine code shared but put game-specific assets beside each game.
