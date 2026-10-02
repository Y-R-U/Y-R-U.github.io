# Project discovery graph

Projects → Timeline / Type opens a graph that fills the screen. Time runs left
to right along a horizontal spine; projects branch below each month by credited
model (Timeline) or broad type (Type). Dashed purple links connect documented
sequels and rebuilds. The only overlay controls are Timeline / Type and Close.
Close or Escape returns to the grid and restores its previous month.

Drag with a mouse, swipe/scroll in both directions, or pinch to zoom. A plain
mouse wheel moves along the timeline; Ctrl + wheel / trackpad pinch zooms.
The workspace receives keyboard focus: arrows pan and +/− zoom. Each mode
remembers its camera. Portrait and landscape share the same left-to-right graph,
with the initial zoom adjusted to the screen height.

`projects.js` remains the source of dates, model credits, status, links, and
visibility. `project-taxonomy.js` supplies overlapping genre tags, graphics notes,
and documented successor relationships, keyed by screenshot ID. Model credits
are kept exactly as recorded; parent links identify versions, not just similar
genres. Existing grid filters determine the pool when opening the graph.

Previews are current screenshots, not historical captures or graphics scores.
Each `assets/project-previews/<id>.webp` is a 320×180 crop of the registry JPEG,
encoded with Pillow WebP quality 72, method 6. Generate one after adding or
updating its source screenshot. Preview images use native lazy loading.
The graph has no frame loop; Matrix and home video pause while Projects is active.

```sh
node project-explorer.test.cjs
# Requires Playwright and Chrome; reuse the existing site server on port 8888.
node project-explorer.browser.cjs
# Optional: PLAYWRIGHT_MODULE=/absolute/path/to/playwright
# Optional: YRU_TEST_URL=https://yru.br8t.com/
```

Browser checks cover horizontal branches, fullscreen layout, mode switching,
close/Escape restoration, pan/zoom, actual touch gestures, secret visibility,
preview decoding, and portrait/landscape sizes from 320px to desktop. Captures
are written to the OS temporary directory.
