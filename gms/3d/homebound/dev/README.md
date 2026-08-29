# HOMEBOUND dev harness

Serve the repo, then grab deterministic frames.

```bash
# once
python3 -m http.server 8899 --directory ~/cc/yru/site &

# a frame, 240 fixed steps in (== 4 s of game time)
export NODE_PATH=/private/tmp/claude-501/-Users-aaronair-cc-airon/f6272d31-c09c-4a64-9903-c4dd2f32a4f2/scratchpad/pup/node_modules
node dev/shot.mjs '?dev&level=3' /tmp/hb/l3.png --steps 240
```

Exits **2** if the page logged an error, so a build script can gate on it.

Flags: `--steps N` `--dt 0.0166` `--w 430` `--h 932`.
Env: `HB_CHROME`, `HB_BASE`, `HB_PUPPETEER`.

The page must publish `window.__hb = { ready, step(dt), state, ... }` under
`?dev` — see `js/main.js`. **Never rely on the page's own rAF**: a headless
page is hidden and its rAF is throttled to a crawl.

puppeteer-core lives outside the repo at:
`/private/tmp/claude-501/-Users-aaronair-cc-airon/f6272d31-c09c-4a64-9903-c4dd2f32a4f2/scratchpad/pup/node_modules`
