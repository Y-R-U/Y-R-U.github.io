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

## smoke.mjs — does the game still play?

```bash
export NODE_PATH=/private/tmp/.../scratchpad/pup/node_modules
node dev/smoke.mjs                       # 1,2,6:54,12:108,20:180
node dev/smoke.mjs --levels 1,2 --steps 2600
```

Exits **1** if any level fails. Run it after touching anything in the run loop.

`--levels` takes `lvl` or `lvl:pow`. A bare number is a **cold** run: fresh
save, one man, nothing bought — the real test of the core loop, and only a fair
one on c1l1 and c1l2. `12:108` grants the upgrade spread a player of that power
would own (`?pow`), because the game is *meant* to beat someone who arrives at
c1l12 with one man. The right number is the `req` column of the balance walk.

It drives `?auto` — the same AI thumb as the main screen's attract mode. Do not
remove that: with the stick held straight the squad eats whatever is in the
centre lane, and c1l12 "failed" by taking three gates, banking 336 in cash and
never gaining a man.

**Combat is not seeded.** Level layout is, but bullet spread and enemy fire are
live randomness, so a level near the win/lose boundary flips between runs. If a
level is flaky here, that is a balance finding, not a harness bug.

Drawing is off during the run (`__hb.setDrawing(false)`) — under software GL a
300-man crowd costs ~1.5s a frame. One real frame is drawn at the end so the
draw-call budget is still measured.
