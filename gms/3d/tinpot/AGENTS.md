# TINPOT — standing rules for every builder

**`docs/ART_NOTES.md` is mandatory reading before any work in `render/`.**

**Read in this order before touching anything:** `docs/BRIEF.md` → `docs/ARCHITECTURE.md` →
`docs/PLAN.md` → `docs/STATE.md`. Then start at the first unticked box in `PLAN.md`.

This project is built by a relay of agents, several of which will be cut off mid-task by a usage
limit without warning. Work accordingly:

- **Leave the tree runnable at every step.** Never end a work chunk with the page broken.
- **Update `docs/STATE.md` as you go, not at the end.** Assume you will be killed mid-sentence.
  The next agent's only inheritance is that file plus the ticked boxes in `PLAN.md`.
- **Tick a box only when you have run it and looked at it.** An untrue tick costs the next agent
  more than an unticked one.

## Non-negotiable

1. Write **nothing** outside `gms/3d/tinpot/`.
2. **No git commands.** No add, commit, stash, checkout, rebase. Other sessions have live
   uncommitted work elsewhere in this repo.
3. **Never import `three` from a CDN.** Use the vendored importmap in `docs/ARCHITECTURE.md`
   verbatim. A CDN import hangs the game silently and has cost days here before.
4. No build step, no npm, no dependencies.
5. `js/core/*.mjs` stays pure — no `three`, no DOM — so the Node harness runs real game code.
6. Don't add the `projects.js` entry. That is Aaron's session, at ship time.
7. Don't touch `audio/music/` — the soundtrack is already placed and named.

## How to know it works

The repo root is already served at `http://127.0.0.1:8888` — **do not restart that server**.
The game is `http://127.0.0.1:8888/gms/3d/tinpot/`.

```sh
node tools/sim.mjs
~/.claude/bin/cdp start --port 9223
node tools/browser.mjs
```

Keep the `cdp start` and the harness run in **one shell execution**, separated by a newline.
Disable cache in the CDP driver before navigating — a `?v=` query string does **not** bust a
stale ES module, and stale modules have hidden agents' own edits in this repo more than once.

`tools/` in `gms/3d/sunwake/` has a working `cdp.mjs`/`browser.mjs` to copy from.

## Lessons this repo has already paid for

- **A green test suite is not evidence the screen looks right.** Six times in one project a
  numeric suite passed while an obvious visual bug filled every frame. Take the screenshot and
  look at it.
- **Falsify your own gate.** Run it against a build where the bug still exists. A check never
  proven to fail is not a check.
- **Read detail lines, not pass counts.** A pathing test that "passes" because a unit was
  force-teleported past a gate hid a third of a map being unreachable.
- **Isolate before tuning.** Force a suspect term to a constant; if the output is identical the
  experiment failed, not the hypothesis.

## Tone

It is a silly game. Where a choice is between realistic and funny, it is funny. The blood is the
colour of jam, the explosions are too big, and the debrief is delighted about the casualties.

## Creative freedom

The plan fixes the *shape* of the game — the controls, the UI positions, the tone, the milestone
order. Everything about how it **looks and feels** is yours, and you are expected to push it.

If you have an idea that would make a frame look genuinely great — a better light rig, a sky that
sells the hour of day, heat shimmer over a burning treeline, dust kicked up by boots, canopy
shadow dappling the grass corridor, a colour grade, a tracer that actually reads, a death that is
funnier — **do it**, without asking. Same for small bits of character: a soldier who trips, a
salute, a helmet that pings off and rolls. Overshoot the brief on polish.

Two limits on that freedom, and only two: it must still run at 60fps on a phone, and it must not
move a control off the edge of the screen or clutter the middle of the battlefield. Write what
you added, and why, into the Decisions log in `docs/STATE.md` so the next agent keeps it.

## This has already gone wrong once — read it

On 2026-09-22 all twelve boxes of the M1.5 art pass were ticked in a single pass, and the frame
shot afterwards measured **0.69% different** from the frame the critique was about. Nothing had
been done. The ticks were the only evidence, and they were false.

So: **`tools/artgate.py` is now the gate, not your own judgement.** It is pure stdlib, it prints
JSON, and it already fails the frame you are replacing on five of its six checks. Run it, paste
its output into `docs/STATE.md`, and only then tick the box.

**Do not edit its thresholds, and do not edit it to pass.** They were chosen by running it
against the bad frame. If you genuinely believe a threshold is wrong, write the argument in
`docs/STATE.md` and leave the box unticked for a human.

The general rule, which applies well beyond this one gate: a check that has never been proven to
fail is not a check. Before you trust any gate you write, run it against a build where the bug
still exists and watch it go red.
