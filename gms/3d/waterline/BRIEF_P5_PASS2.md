# P5 pass 2 — the chase beat, and only the chase beat

Pass 1 landed four items. I have reviewed all four independently. **Three are accepted and closed.**
This brief is the fourth.

Read `HANDOFF_P5.md` (your own pass-1 record), `DECISIONS.md` D38/D42/D43/D45 and the standing
rules at the bottom of that file, then `MANAGER.md`.

## What I accepted, so you do not reopen it

- **The hit lands on a hull.** I re-ran my own pre-fix probe unchanged and read the frames back.
  Where the control shows a fireball on open water beside an untouched destroyer, yours shows a
  struck ship with fire burning amidships on the hull. `drama.js` is a clean piece of work and the
  leak argument I care about is the structural one — it imports nothing from `js/sim` and its whole
  input is two public masks plus the cells of ships that have already sunk. Closed.
- **The privacy blank.** Tap-tested with real touch events at 390×844: the eye sets the state and
  does **not** open the editor, the box still opens the editor, the setting persists, and it
  survives a genuine reload and resume. Closed.
- **The notice.** Reads at the top from the first frame. Closed.
- **Cost.** 88–93 draw calls against a 120 ceiling, 60 fps, zero console errors, measured against a
  same-code control. No regression. Closed.

## What is not fixed: the round is still off screen

Aaron asked for **one** thing about this beat — *"when following the bullets/missiles, zoom out a
little more when it travels"*. You made the frame wider, and I can measure that you did. But the
round is not in it.

Measured on the **played** beat, not a posed one, portrait 390×844, sampling every frame of
`shell_chase` and projecting `round.head()` into the live camera:

```
                       frames   round outside the viewport   worst excursion   narrow frame at round
control (pre-P5)         155           100                        225x            3.5 m min / 14.5 mean
yours                    156            80                        4.5x            7.6 m min / 28.2 mean
```

Your distances are real and they match what you reported. But **the round sits outside the frame for
the first half of the beat**, entering at about the 48% mark and only then settling to centre:

```
  through the beat   0%    10%   19%   29%   39%   48%   58%   68%   77%   87%   97%
  round, worst NDC   4.54  2.55  1.83  1.45  1.21  1.04  0.92  0.82  0.74  0.48  0.09
```

Anything above 1.0 is off screen. Screenshots at `chase2_0/1/2.png` in the scratchpad: the first two
frames of the chase are **about 70% flat grey sky with the shell nowhere in them**, and one small
ship in the bottom corner. That is what a player sees for the opening second of every shot they
fire. I captured them twelve seconds after the opening settled, so it is not the dusk blend.

### Why, and where I think your solve went wrong

The station is solved by a binary search over `holds(z)`, which tests

```js
const lead = u => at(start + (end - start) * u, …).sub(at(u, …));
```

`start + (end - start) * u` is the **arc parameter** and `u` is the **beat's normalised time**.
Subtracting a point at one from a point at the other is not the look-ahead vector your comment
describes; it is near zero over the middle of the beat and about 54 m of forward arc at `u = 0`.
So the quantity being searched is not the framing.

That is why the numbers came out right and the picture did not: **you solved the distance and not
the direction.** The camera stands `off` from the round, but it *looks* at
`head.lerp(aim, 0.42 + u*0.3)` where `aim` is up to 0.09 + 0.16u of arc further on — at the start of
a 900 m flight that is tens of metres ahead, which at 21 m of standoff throws the round far outside
a 42° cone no matter how far back you pull.

Fix the beat so the round is **in frame for the whole chase**, and check it the way I did: project
`round.head()` into the live camera every frame of the played beat and report the NDC profile above,
before and after, portrait and landscape. Distance alone will not tell you.

Two things to weigh while you do it. The look-ahead exists for a reason — the original comment says
the impact should already be in frame when the round lands, and that is worth keeping at the end of
the beat, where my profile shows it is working. And **70% sky is not a composition**; the sky is
beautiful in this game when the camera is not pointed at the zenith (see `p5_impact_3.png`), so the
pitch is yours to spend as well as the distance.

If holding both the round and the impact point in one portrait frame turns out to be impossible at
some point in the flight, say so with the number and pick the one that serves the player — but say
which, and why, rather than splitting the difference silently.

## One thing to check, not necessarily to change

You flagged a hull moving 159.5 m in 1.1 s during a re-pack — about 280 knots. I have not verified
whether it is visible. Since you will be in this beat anyway: find out whether the enemy line is in
frame while it happens, and if it is, say what it looks like. A number I cannot see is not a
problem; a ship visibly skating across the horizon is.

## What you own

`js/cine/sequences.js`, and `js/config.js` if the beat needs a knob. Nothing else should need to
move. **Do not touch** `js/sim/`, `js/ui/drama.js` or anything in the three closed items —
they are reviewed and accepted, and reopening them costs me the review again.

`js/main.js` is frozen.

## How to prove it

The harness is in the scratchpad at
`/private/tmp/claude-501/-Users-aaronair-cc/15d17c89-707f-4970-b598-403e046bb422/scratchpad/`:
`wl_cdp.mjs` (boot, portrait phone emulation, cache disabled, fresh profile — `WL_ROOT` env var
picks which tree it serves), `wl_chase.mjs` (**the measurement above — start from this one**),
`wl_chaseshot.mjs` (captures frames from inside the played beat), and `base/` is a pristine copy of
`HEAD` for a same-code control. Copy them, don't edit in place.

Headless frame rate on this machine varies by a factor of five between runs, so a wall-clock
timeout is not a result — I nearly reported a hang that was my own contaminated instrument. Kill
stale Chromes (`pkill -f wl-probe`) before each run and interleave A and B rather than running all
of A then all of B.

Deliver: the NDC profile before and after, portrait and landscape; three frames from inside the
played beat read back with the Read tool; and a statement of what your test could not have caught.

## Budget

This is your second and final pass. Finish and go — no hold. Append to `HANDOFF_P5.md`.
