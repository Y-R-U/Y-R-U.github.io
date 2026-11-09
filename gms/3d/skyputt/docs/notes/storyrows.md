# storyrows: career event rows with long rewards

Follow-up to story7's open question: rows whose reward lists 3-4 helper kinds (ch5 Rival: The Pro / World Tour
Final, ch6 Legends Practice: Back Nine / Legends Cup / Final: Old Mags) squeezed the event name to 45-66 px at
phone widths, so "Final: Old Mags" ran over three lines.

## Fix (css/app.css only, no markup change)
- `.ev` now `flex-wrap: wrap` with `gap: 2px 10px`.
- `.ev-main` is `flex: 1 1 150px` (was `flex: 1`), so the name column never goes under 150 px.
- `.ev-rw` gets `margin-left: auto; max-width: 100%`. When the reward fits beside the name it stays on the row
  (the auto margin resolves to 0 because `.ev-main` grows first). When it does not, it drops onto its own line,
  right-aligned under the row, keeping the reward column's right edge.

No media query: the wrap only happens when the row is actually too narrow, so desktop and landscape are unchanged
(desktop ch5/ch6 crops: ch5 byte-identical, ch6 differs only by sub-threshold anti-aliasing, max channel sum < 30).
At 360 px even a coins-only reward ("80") drops to its own line, since 150 px + icon + reward does not fit; it reads fine.

## Measured (event name width, `docs/notes/storyrows_shots/rows_cdp.mjs`)
| row | before (360/390/412) | after 360 | after 412 |
|---|---|---|---|
| Final: Old Mags | 45 px, 3 lines | 1 line | 1 line |
| Rival: The Pro | 50 px, 3 lines | 1 line | 1 line |
| World Tour Final | 66 px, 3 lines | 1 line | 1 line |
| The Legends Cup | 96 px, 2 lines | 1 line | 1 line |
| Legends Practice: Back Nine | 104 px, 3 lines | 176 px, 2 lines | 1 line |

Remaining 2-line names (Legends Practice: Front Nine, Clinic: Two Loops, One Putt at 360/390) are ordinary word
wrap of long names at full column width, as before.

## Shots
`docs/notes/storyrows_shots/{before,after}/ch{5,6}-{360,390,412,desktop}.png` (tour crops, chapters 1-6 passed,
ch5/ch6 expanded). Re-run: `cdp start --port 9512`, then from the game dir
`node docs/notes/storyrows_shots/rows_cdp.mjs <outdir>`. No console errors in either run.

Tests: tools/story_test.mjs and tools/meta_test.mjs all passed.
