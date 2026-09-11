# Tanking

A living aquarium management game, contained in **`index.html`**. Three.js r128 is embedded, with its MIT notice. There are no runtime downloads, external models, textures, fonts, audio files, build tools, or server APIs. The HTML also runs directly from disk.

Play locally at **http://localhost:8888/gms/3d/tanking/** or on Pages at **https://y-r-u.github.io/gms/3d/tanking/**.

## Playing

- Drag to orbit; scroll or pinch to zoom. Select a creature to follow it, or select it from Aquapedia's collection. The follow card can safely rehome it or move it to another tank.
- Livestock previews water suitability, stocking, schools, temperament, and discovered interactions. Red previews permit risky choices, except hostile fish in the peaceful-only puzzle.
- Habitat adds planted shelter, stone refuges, anemones, and six equipment upgrades.
- Feed small meals; Water offers targeted mysis, water exchanges, pH buffering, treatment, temperature/light controls, and event repair.
- Manage expands tanks, opens up to four exhibits, releases nursery fry, shows scoring, and opens photo mode. Photos use a depth texture for focus and export as PNG.
- Pause / 1× / 3× control simulation time. Space toggles pause; F feeds. Escape closes panels or stops following. Dialogs suspend the simulation.
- Audio starts with the sound button. Local storage saves the aquarium automatically; the simulation does not advance while the page is closed or hidden. Starting a new mode replaces the aquarium, while Aquapedia discoveries persist.

The first Career lesson starts with four nervous neon tetras. Introduce two companions, then plant a garden and install a filter. The small school is a recoverable first mistake.

## Modes

| Mode | Rules and completion |
| --- | --- |
| Career | Seven objectives, from a 20-gallon starter to four occupied exhibits, 5,000 visitors, and 85 average health. Grants support expansion. |
| Scenario puzzles | Ten species in two tanks, a zero-loss toxic-water rescue, or 5,000 visitors from peaceful species. |
| Showtime | A 360-second festival with attendance surges, heat pressure, and random events. Finish with 1,500 visitors and 65 average health. |
| Survival | Increasingly frequent power cuts, heater failures, ich, pests, and mystery donations. Ends when the last creature is lost. |
| Draft Run | Every 90 seconds choose one of three species for the active tank. A full minimum group arrives. First loss ends the run. Select the river or reef before the next draft to choose the species pool. |
| Conservation | A mature, fed cardinalfish or seahorse pair breeds in excellent water with sufficient shelter. Release ten nursery fry. |
| Daily Reef | A five-minute run seeded by the UTC date. Fixed simulation steps, seeded events, and a score report; no online leaderboard. |
| Zen Sandbox | Unlimited funds and no deaths. All the habitat tools, free composition, fish following, and photo filters. |

Scores combine time-weighted care, peak appeal, visitors, conservation, and time sustained, with a 400-point penalty per lost creature. Stars reward healthy, appealing, loss-free exhibits.

## Simulation and rendering

The 16 species include freshwater schools, angelfish, bettas, goldfish, corydoras, nerites, clownfish, chromis, lionfish, puffers, cleaner shrimp, seahorses, cardinalfish, and a stylized bioluminescent lanternfish. Each carries water type, zone, temperament, adult size, bioload, minimum group, diet, temperature/pH ranges, and appeal.

All tanks advance boids and water chemistry on a deterministic 50 ms step, including exhibits outside the current view. Waste becomes ammonia, then nitrite, then nitrate through separate bacterial colonies. Plants, aeration, filtration, cleanup animals, algae, temperature, disease, hunger, stress, age, and fin damage interact. Time and husbandry parameters are compressed and tuned for the game.

Predators stalk and pursue smaller species after a warning window. Adult angelfish hunt tetras; bettas damage long fins; puffers eat snails; anemones calm clownfish; cleaner shrimp lower disease; heavy goldfish bioload stresses filtration; seahorses require targeted feeding when outcompeted. Discoveries persist in Aquapedia.

Fish combine procedural bodies, fins, rays, eyes, markings, and special silhouettes into **one instanced mesh per species**. GPU shaders animate body waves, fins, and instanced plants. The environment uses procedural sand, rocks, coral, caustics, translucent glass, depth fog, light shafts, particles, bubbles, and a blue night cycle. A compact postprocessing pass provides bloom, grain, vignette, filters, and depth-based focus.

## Verification

The browser regression is in `tests/browser.mjs`. It uses a temporary Playwright install and the installed Chrome browser:

```sh
npm install --prefix /private/tmp/tanking-tools playwright
cd /Users/aaronair/cc/yru/site
node gms/3d/tanking/tests/browser.mjs
```

Override `PLAYWRIGHT_MODULE`, `CHROME_PATH`, or `TANKING_URL` for other environments. The explicit `window.tanking` interface exposes state and deterministic stepping for test fixtures.

Verified in hardware-accelerated Chrome on this Mac: tutorial and purchases, nitrogen conversion, successful rescue, predation and fin damage, ten-young conservation completion, draft advancement, deterministic daily runs, timed score reports, backup power, multi-tank movement, fish selection, PNG downloads, local save restoration, and five viewport sizes. The procedural scene measured about 60 fps at 1440×960 / DPR 1, including a scene with all 16 species, with 33–43 scene draw calls. This does not establish physical-phone performance or a frame-rate guarantee at maximum stocking.

The standalone file was also opened successfully through `file://`, and day/night, following, and mobile shop screens were inspected. No shader, JavaScript, or failed HTTP requests remained in these checks.
