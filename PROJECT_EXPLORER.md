# Project discovery tree

Projects → Timeline / Type opens a DOM/SVG world with a vertical date spine,
model or high-level type lanes, and dashed purple links for sequels and rebuilds.
Drag with a mouse, swipe/scroll in both directions, pinch to zoom, or use the
zoom buttons. Focus the workspace for arrow-key panning and +/− zoom.
Origins, Latest, and the month jump move the camera; the existing month chips
filter the data. Returning to Grid restores its previous month.

`projects.js` remains the source of dates, model credits, status, links, and
visibility. `project-taxonomy.js` adds overlapping genre tags, graphics notes,
and documented successor relationships, keyed by screenshot ID. Unknown future
entries get a high-level type from their app/game type and path; add curated tags
when registering a project. Keep model credit exactly as recorded, and reserve
parent links for documented versions rather than genre similarity.

Previews are current screenshots, not historical captures or graphics scores.
Each `assets/project-previews/<id>.webp` is a 320×180 crop of the registry JPEG,
encoded with Pillow WebP quality 72, method 6. Generate one after adding or
updating its source screenshot. All preview images use native lazy loading.
The tree has no frame loop or animation; the existing Matrix and home video
pause while Projects is active.

Validation:

```sh
node project-explorer.test.cjs
# Requires Playwright and Chrome; reuse the existing site server on port 8888.
node project-explorer.browser.cjs
# Optional: PLAYWRIGHT_MODULE=/absolute/path/to/playwright
# Optional: YRU_TEST_URL=https://y-r-u.github.io/
```

Browser checks cover pan/zoom, camera jumps, filter intersections, version links,
rapid switching, secret visibility, preview decoding, and 320/390/430/768/1440px
layouts. Captures are written to the OS temporary directory.
