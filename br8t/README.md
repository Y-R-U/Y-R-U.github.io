# 8:20 — the br8t.com base site

The light hitting your screen is eight minutes and twenty seconds old — plus a
hundred-thousand-year prison break. This site tells that story as one
continuous scroll: the Sun's core → the radiative-zone random walk → the
photosphere breakout → Mercury → Venus → Earth's sky → a human retina.

**No images. No video. No libraries.** Every frame is a raw WebGL2 fragment
shader; the soundtrack is synthesized Web Audio. Total payload is a few dozen
KB plus two typefaces.

## Run

Any static server from the repo root, e.g.:

```
python3 -m http.server 8845        # → http://localhost:8845/br8t/
```

## Structure

```
index.html        chapters (copy), HUD, meta
css/style.css     art direction: Instrument Serif display / Space Mono instrument
js/gl.js          tiny WebGL2 harness (fullscreen triangle + point stream)
js/shaders.js     the eight scenes: sun, core, walk, escape, space, sky, iris, outro
js/main.js        scroll engine, scene weights/choreography, walk sim, counters
js/audio.js       synthesized beds: furnace / shimmer / wind / pad + ticks & whoosh
fonts/            Instrument Serif 400 + italic, Space Mono 400/700 (woff2, OFL)
deploy.sh         rsync to the br8t.com box (Caddy static file_server)
```

## How it works

- Scroll progress `p ∈ [0,1]` is the story clock. Scenes are fragment-shader
  programs with `[a,b]` windows and crossfade widths; overlapping scenes are
  alpha-blended over black. Each scene gets `uQ` (local progress), cursor,
  time, and per-scene choreography uniforms from `main.js`.
- The radiative-zone photon is a real random walk simulated in JS (step length
  grows as the plasma thins), rendered as an additive point-stream ring buffer;
  the cursor shoulders trail points aside in the vertex shader.
- The T+ mission clock and km odometer are piecewise-mapped so the flybys hit
  their true light-times (Mercury 3:13, Venus 6:01, Earth 8:20).
- The hero departure clock is literally `now − 500 s`.
- Adaptive resolution: render scale steps down/up against a frame-time EMA,
  pixel count capped ~2.3 MP. Reduced-motion preference damps all idle motion.

## Debug

- `?p=0.47` — jump to any scroll progress (also pins adaptive quality)
- `?diag`   — surface boot/shader errors into the DOM
- `?nocur`  — skip the intro curtain (screenshot rigs)

## Deploy

`./deploy.sh` rsyncs the site to `/srv/apps/br8thome/site` on the `br8t` host
(Caddy already serves br8t.com from there). **It replaces the previous site**
— the old video landing page lives at `~/cc/backup/br8t-old-website/`.
