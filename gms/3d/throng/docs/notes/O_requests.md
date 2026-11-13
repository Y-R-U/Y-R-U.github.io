# Lane O (real online) → render lane requests

Nothing here blocks online: the renderer already draws an online guest correctly from the state the
guest rebuilds. These are things that would make online look better, plus what the renderer can rely on.

## What an online guest hands the renderer

- A contract-shaped `state` rebuilt from snapshots (`js/net/guest.js`). Crowds and pedestrians are already
  interpolated for the frame, so **`px === x` / `pz === z`** (the neutral `px/pz` arrays are the same
  Float32Arrays as `x/z`) and `frame()` gets **`alpha = 1`**. Please keep the "live" path in
  `crowd.js snapshot()` (it reads `px` when present); the tick-diff fallback would also work, but
  `state.tick` on a guest is the floor of a fractional render tick, so it can repeat for a frame or skip one.
- Events are relayed from the host and released when the guest's view (≈120 ms behind) reaches their tick.
  All contract fields are present; positions are filled in by the guest: `recruit.x/z` = the pedestrian's
  last drawn position (the host's exact spot can differ by a few decimetres), `steal.x/z` = the sim's
  contact-point formula applied to the crowds as drawn, `elim.x/z` = the victim as drawn,
  `pickup.x/z` = the pickup's spot. `steal` events are merged per (from, to) pair per snapshot (15 Hz),
  so a guest sees fewer, bigger `n` steals than the host. `recruit.slot` is exact, and the slot's state is
  already 0 in the same frame's `state`, exactly as offline.
- Your own crowd (`setFocus(me)`) is predicted locally and corrected smoothly; others are 120 ms in the past.
- `me` is no longer always 0 online: `setFocus(i)` with any index.

## Requests (optional, none urgent)

1. **Human vs bot hint in 3D.** Online matches mix real players and bots. A subtle cue on human crowds
   (e.g. a second thin ring, or a small pulse in the ring) would help; `state.crowds[i].remote === true`
   marks every human crowd (yours included) on host and guests. The HUD tags humans "LIVE" on the results
   screen only.
2. **Host change hitch.** When the host leaves, the world freezes for ~2 s and then resumes from the new
   host's keyframe; pedestrians may hop a few decimetres. If a short "hold" look (e.g. slow the follower
   gait while `state.online && no new ticks`) is cheap, it would read as a network pause rather than a bug.
   A guest's state has `online: true`.
3. **Followers when a late joiner takes over a bot crowd**: nothing changes for the renderer (same index,
   same colour), but if the crowd's name is drawn anywhere in 3D, take it from `setCrowds()` again — the HUD
   calls nothing new on the renderer for that today.
4. Please keep `frame()` free of assumptions that every frame advances the sim by ≥ 1 tick or that events
   arrive at 30 Hz: on a guest they arrive in 15 Hz batches.
