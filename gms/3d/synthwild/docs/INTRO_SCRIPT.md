# SYNTHWILD — Intro script

About 70 s. Two narrators (Qwen Voice Studio clone voices), chosen in Settings → Sound → Narrator voice:
**Male** (default, `Synthwild · Narrator Baritone`: low, rich baritone, rendered at speed 0.9) → `audio/vo/male/`, and
**Female** (`Synthwild · Narrator Female`: warm British storyteller) → `audio/vo/female/`. Each folder has its own `manifest.json`.
Seven key-art stills (Flux) with slow Ken Burns pans and crossfades. Subtitles = the line text.
Source of truth for the text is `tools/vo_script.json`; regenerate with `cd tools && python3 vo_gen.py male|female [key…]`.

| # | Key | Still | Line |
|---|---|---|---|
| 1 | `i01` | `seed` | Not so very long from now, people stopped building things... and started growing them. |
| 2 | `i02` | `seed` | A tiny seed could hold a whole design. Plant it, and the land would grow into its shape, block by block by block. |
| 3 | `i03` | `forest` | Nature and machines grew into each other. Trees grew bark of carbon lattice, and leaves of solar film that drank the sunlight. |
| 4 | `i04` | `shore` | Vines carried data like little rivers of light. The beaches turned to mirror sand... |
| 5 | `i05` | `ocean` | ...and deep in the ocean, the kelp grew into servers, humming softly in the blue. |
| 6 | `i06` | `quiet` | Then, one day, the growers went quiet. Nobody is quite sure where they went. |
| 7 | `i07` | `quiet` | But the wild kept on growing. |
| 8 | `i08` | `wake` | And now, you're awake. You have a fabricator kit, and a suit that runs on light. |
| 9 | `i09` | `night` | When the sun goes down, your power starts to droop, so build somewhere bright before the night comes. |
| 10 | `i10` | `vista` | This whole world is waiting for someone to look after it. Go on, grower. Plant your seed. |

Tone: wondrous, hopeful, a little hushed, never scary. Kid-friendly words; each line is one breath.

## In-game lines
| Key | When | Line |
|---|---|---|
| `n01` | ~60 s before dusk, survival (with a toast + subtitle) | The sun is going down soon. Build a little shelter, and light it up! |
