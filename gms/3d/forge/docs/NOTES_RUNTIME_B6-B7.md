# NOTES — B6/B7 doc reconciliation, Truths catalogue, journal render check

Live working record. Written as the work happens so a killed session is recoverable from this
file alone. Owner files: `docs/RUNTIME.md`, `data/truths.json`, `js/game/journalscreen.js`,
`js/game/journal.js` (+ test), the B6/B7 row of `docs/BUILD_PLAN.md`.

## State on arrival

- Forge is **committed** at `923b775` — `BUILD_PLAN.md`'s "nothing is committed" line is stale.
  `git status` shows no local modifications inside `forge/`.
- `RUNTIME.md` is **already partly reconciled**. The B6/B7 agent got further than its last words
  suggested: §4.3, §6.1–6.7 all carry a bold **Built** paragraph. The three stale Truth counts the
  brief points at (lines ~849, ~876, ~1315) are **already 34** in the committed file. Grep for
  `of 18` / `of 31` / `Eighteen`/`Thirty-one` across the doc finds no surviving stale Truth count;
  line 1513's "Eighteen sounds" is the audio list, not Truths, and is a separate check.
- **The gap is §7 (onboarding), §8 (audio), §9 (accessibility)** — no Built notes at all — plus
  §10.6, whose "Deferred: `body.playing` hiding the dev row … belongs with B6" is contradicted by
  §6.4, which says B6 did it.
- §4.3 already claims the two wide chains "both render correctly (verified on screen at 844 × 390;
  the block is five and six rows tall)". Per the brief that render check **never happened**, and
  `data/truths.json` is behind §8.5, so at minimum that sentence was written against data that does
  not exist yet. Treat it as unverified until step 4 says otherwise.

## Plan

1. Read the B6/B7 code, reconcile §7/§8/§9 (+ §10.6, §4.3's claim).
2. Sweep the doc for stale counts of every kind, not just Truths.
3. Diff `STORY.md` §8.5 against `data/truths.json`, verify the 16-add/4-amend/0-remove delta, apply.
4. Headless-CDP render check of `prices.raids` and `root.longacre` in the journal.

## Step 3 — DONE, and the delta was already zero

Machine-diffed `STORY.md` §8.5's 34-row table against `data/truths.json`, field by field: id, text,
`story`, campaign (derived from the L/D/N quest prefix), and `supersedes` as a set. **Zero
differences**, no extras, no missing, no authored `reward`, and every "later struck by" cell has a
matching `supersedes` on the other side.

Structurally the file is exactly the spec: **34 Truths, 11 connected components, Light 10 · Dark 12
· Neutral 12**, no supersession cycles, no dangling parent, no singleton component. The two wide
components are there — `prices.raids` (6 nodes: `raiders.east → raid.water`, `strike.won →
strike.undone`, `prices.both`, all into `prices.raids`) and `root.longacre` (5 nodes: `yield.falls →
seam.west`, `vermin.field`, `boundary.moves`).

So the brief's "16 to add, 4 to amend" had already been applied before the session died — the
predecessor got the data in and only the RUNTIME.md prose was left. Nothing to change in
`data/truths.json`. Verification script is not kept; re-derivable in ten lines.

Baseline re-confirmed after the check: `node --test` 256 pass / 0 fail, `lintQuests` 9 quests · 25
steps · 12 dialogue nodes · 5 warnings · 0 errors, `lintText` 12 nodes · 40 lines · longest 42/46 ·
0 warnings · 0 errors.

## Step 2 — stale counts found by sweeping the whole doc

Not Truth counts — those were already 34 everywhere. What the sweep did find:

| Where | Says | Actual | Fix |
|---|---|---|---|
| §8.2 line 1513 | "Eighteen sounds" | `sounds.js` maps **18 events + 5 ambience beds = 23**, over **21 distinct bench ids**; the table under the sentence already has **19 rows** | count corrected, and the row/id/event distinction stated |
| §6.7 | "Seven rows, 44 px each" | the sketch under it draws **six**, and `menu.js` `drawPause` adds six buttons | six |
| §7 | "nine lines of four to six words" | `onboard.js` `PROMPTS` is **seven**, plus the `left-handed?` side line = eight | seven prompts + one side line |
| `BUILD_PLAN.md` B7 row | "18 sounds" | same as §8.2 | 23 events / 21 ids |

## Step 4 — the wide-chain render check, and the one real defect it found

**Method.** Headless CDP, house style: a temporary `tools/_truthcheck.html` (deleted afterwards)
mounts the *real* `JournalScreen` and the *real* `game.css` against the *real* `data/truths.json`,
awards a chosen set of Truths with plausible days (Light ≈ 24–37, Dark ≈ 62–83, Neutral ≈ 108–127)
and opens the Truths tab. Driven by a scratch script that imports `open()` and `waitFor()` straight
out of `tools/shot.mjs`. Captured at **844 × 390, dpr 2, mobile emulation**, and again at
`--ui 1.4`. Note for whoever repeats this: `uiScale` is set on the `#game` host, not on `:root` —
`game.css` line 227 declares `--ui: 1` on `#game` itself, so setting it on `:root` silently does
nothing.

**Verdict: it does not look like nonsense.** Both wide blocks fit and read. Measured at 844 × 390:

| Block | Rows | Height | Viewport |
|---|---|---|---|
| `prices.raids` | 6 (5 struck + 1 live) | 167 px | 408 px of list |
| `root.longacre` | 5 (4 struck + 1 live) | 139 px | 408 px |
| whole catalogue, 34 known | 11 blocks | 1160 px, scrolls | — |

At `uiScale` 1.4 the six-row block is 219 px and **no line wraps** — the longest Truth ("The keep
changed hands twice in a winter. Neither town gained a thing.") still fits on one line at 844 px
wide. So §4.3's "five and six rows tall, which fits" is true.

**But the ordering was wrong, and that is the real finding.** §4.3 specified "struck lines come
first in the order they were learned". With real data that interleaves the two arms of
`prices.raids`: Day 32 `raiders.east`, Day 37 `strike.won`, Day 78 `raid.water`, Day 83
`strike.undone`. `raid.water` is the correction of `raiders.east` — and it rendered two rows below
it with an unrelated Truth in between. The whole contract of the screen is "the superseding Truth
sits directly beneath the one it overturns", and in the widest case it did not.

**Fixed in `journal.js`.** `truthChains()` now walks a block lineage-first — one arm at a time,
oldest arm first, and a Truth that overturns several waits until every line it overturns is already
above it — instead of sorting struck lines by day. Straight chains, the two-parent case and every
existing test are unaffected; only wide blocks move. New order for `prices.raids`:

```
✗ Blackstone raids the east water stands.                          Day 32
✗ They came for water. You shot at people carrying buckets.        Day 78
✗ Whitewall holds the Black Keep. That should be the end of it.    Day 37
✗ The keep changed hands twice in a winter. Neither town gained…   Day 83
✗ Longacre keeps both towns' prices on one post.                   Day 112
● Longacre set the prices that caused the raids.                   Day 127
```

Three pairs and a conclusion, which is what the chain actually is. `root.longacre` was already
lineage-compatible and did not move. **The trade-off, taken deliberately:** the Day stamps in a
wide block are no longer monotonic (32, 78, 37, 83…). The day is a faint right-aligned stamp and
lineage is the primary meaning, so grouping wins; if it ever reads badly on a phone the answer is
to drop the day inside a block, not to go back to day order.

Covered by a new test in `journal.test.js` ("a wide block orders by lineage…") plus a tightened
assertion on the shipped catalogue's two wide chains. `node --test` **257 pass / 0 fail**.

## Step 1 — every divergence written into RUNTIME.md

The predecessor had already reconciled §4.3 and §6.1–6.7. What was missing was §7, §8, §9 (no Built
notes at all), the tracker and journal-screen notes in §4, and §10. Each item below is now in the
doc with a short reason, phrased as a divergence rather than a silent rewrite.

| § | Divergence | Why the code is right |
|---|---|---|
| 4.1 | Tracker does **not** hide for 3 s after a combat hit | no combat to hang it off yet; one line in `draw()`'s `hidden` when there is |
| 4.1 | §9.4's lost-chevron lives in the tracker, not as a widget | it is the objective line; a separate arrow would be a second thing to look at |
| 4.2 | Buttons are Track / Reset step / Try again, not Track / Show me / Reset | `Show me` belongs to `I am stuck`; a player who cannot find the objective is not already in the journal |
| 4.2 | Journal header names a part of the day (`Afternoon`), HUD chip names the last bell (`High`) | the journal is the player writing a note, and a note says "afternoon" |
| 4.3 | Blocks ordered by lineage, not by day learned | see step 4 — the whole reason for the render check |
| 6.7 | Six pause rows, not seven; `Wait until…` disabled not hidden; Wait/Stuck open in place with Back; dev panel is a toggle | one sheet on screen at a time; a greyed row still teaches |
| 7 | Seven prompts, not nine lines; `left-handed?` is `side: true` on the move prompt | there was nothing left to teach |
| 8.1 | Voice cap is "over twelve, refuse anything below half", not "drop the quietest pending" | a one-shot fires now or never; there is no pending queue to sort |
| 8.2 | 23 events / 21 ids / 19 rows, not "eighteen sounds" | see step 2 |
| 9.1 | Motion is a toggle in Settings; the knob stays a float | nobody can hear 0.6 of a camera ease; the knob still accepts `prefers-reduced-motion` |
| 9.1 | Slider 0.85–1.4, `save.js` clamps 0.8–1.6 | deliberately wider so a future slider's save is repaired, not rejected |
| 9.3 | Bell pulse, bite inversion, edge notch and suspicion ring are four HUD calls | all visual-only, none of them a setting |
| 9.4 | `Show me where` opens the journal; **no 20 s ground line** | needs per-step world anchors that Track D has not placed; the chevron answers the same question |
| 10.2 | `ui.js` has no `sheet()` / `overlay()` / `setScale()`; the tracker is `questrunner.js`'s | a sheet is a class in the file that needs one; the scale is one `setProperty` |
| 10.6 | `body.playing` is **done**, not deferred | it landed with B6 exactly as §10.6 predicted |

Also cleaned while in there, all of them `CLAUDE.md` canonical-term violations or plain staleness:

- §9.4 said an interrupted Graft ate "30 Focus and **a Cinder Token**" — banned term, deleted.
- §9.4's telegraph said `attunement / 10`; it is `grasp / 10`, and it is built as `sheet.js`
  `outclassed()`. §5.4's derived table said "Attunement"; now Grasp.
- The **`attunement` predicate term id survives in `predicate.js` and is left alone** — it evaluates
  `xp.js` `grasp()`, and renaming it would be a quest-data migration, not a rename. §2.3 now says so
  out loud so the next reader does not "fix" it.
- §4.3's JSON example gave `root.longacre` two parents; it has three.
- §4.3's mockup used invented Truth text ("The Water is dead before it reaches Blackstone", a
  fourth ring glyph `◑`, rings that did not match the campaigns). Redrawn from the real catalogue —
  the river is the **Vail** — with the six-row `prices.raids` block as the last group, so the doc
  shows the case that actually needed checking.
- §11.3's open item 1 (Truth ids and pairs unauthored) is closed.

## Left alone deliberately

- `truthChains()` has no supersession-cycle guard; a cycle in `truths.json` would still terminate
  (the leftover pass at the end of `order()` catches anything the walk could not reach) but would
  render in an arbitrary order. `tools/lintQuests.mjs` is the thing that forbids cycles and it is
  clean, so this is not worth code.
- The block renders **depth flat**: a five-row block does not show that row 2 corrects row 1 while
  row 5 corrects row 4. Lineage ordering recovers the pairing; indentation would recover the depth.
  On 390 px I would not spend the horizontal space, and nobody has asked for it.
- `js/game/journalscreen.js` **was not touched.** The layout is fine; the defect was in the pure
  ordering, which is where the fix went.
- Things in other agents' files that look wrong and were left for them: `predicate.js`'s
  `attunement` term id (above); `session.js:123` `onShow` opening the journal rather than drawing
  §9.4's ground line (documented as a divergence, but if the ground line is wanted it is a
  `session.js` + world job, not a menu one).

## Verification at hand-off

`node --test` **257 pass / 0 fail** (256 before; one test added), measured on a clean tree.

**Caution for the next reader:** a few minutes later the full run went to 247/1 with
`packs.test.js` throwing `TypeError: areaErrors is not a function` from `tools/lintQuests.mjs:87`.
That is a **concurrent agent mid-edit** in `tools/lintQuests.mjs` and `data/areas.json`, not this
work — neither file is mine and neither was touched here. `node --test js/game/journal.test.js`
alone is 14/14. Re-run the full suite once that agent lands.
`node tools/lintQuests.mjs` — 9 quests · 25 steps · 12 dialogue nodes · 5 warnings · 0 errors.
`node tools/lintText.mjs` — 12 nodes · 40 lines · longest 42/46 · 0 warnings · 0 errors.
Files changed: `docs/RUNTIME.md`, `docs/BUILD_PLAN.md` (B6/B7 rows only), `js/game/journal.js`,
`js/game/journal.test.js`, and this file. `data/truths.json` and `js/game/journalscreen.js` are
unchanged, both because nothing in them needed changing. Nothing committed.
