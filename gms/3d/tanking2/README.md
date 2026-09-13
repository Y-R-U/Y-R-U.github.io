# Tanking II

**One fish. A little care. A whole world to grow.**

A separate sequel to [Tanking](../tanking/), built as a small collection of readable, vanilla ES modules. Open **http://localhost:8888/gms/3d/tanking2/** locally, or **https://y-r-u.github.io/gms/3d/tanking2/** after Pages deployment. No build step, account, API keys, or runtime CDN requests.

## Start small

The game opens straight into a planted aquarium. One button welcomes a single betta; the next gives it a meal. Finishing that first chapter opens and selects a second tank, unlocks neon tetras, and grants enough coins for their whole school. The original fish keeps living and earning, with a permanent caretaker handling its meals.

Thirteen guided chapters introduce plants, community fish, water care, automation, keepsakes, a reef, short adventures, and conservation. Fish and features are gated by the simulation as well as the interface. Mission actions find their intended tank even if the player has been looking elsewhere.

Coins arrive automatically from healthy, appealing aquariums. Six permanent tanks can keep earning together. Local saves accrue up to eight hours of reduced offline income, with safe caretaker care. Earlier chapters protect fish while the player learns; later poor care reduces health and earnings and puts fish into a recovery shelter. Predation remains a real risk in incompatible communities. Rehoming is available from an individual fish’s follow card once the collection is unlocked.

Keepsakes give permanent collection-wide bonuses. Choose one of three after milestones, or spend 20 adventure/conservation pearls on another choice after reaching the reef. Examples include slower hunger, better plants, more efficient bacteria, greater earnings, and improved offline income. Journeys use their own balance and return rewards to the permanent gallery.

## What unfolds

| Chapters | Discoveries                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------- |
| 1–2      | One betta, its first meal, a funded second tank, a complete neon school                                 |
| 3–4      | Planting, care journal, photography, corys, nerites, rasboras, water changes, filtration, time controls |
| 5–6      | Autofeeding, permanent keepsakes, new tanks, guppies, angelfish, Pocket expedition                      |
| 7–8      | A funded reef, clownfish, chromis, anemones, shrimp, puffer, skimmer                                    |
| 9–10     | Rescue room, goldfish, discus, Lantern weekend, seahorses, cardinalfish, patient feeding                |
| 11–13    | Nursery releases, lionfish, UV, thermostat, Daily current, lighting, Still water sandbox, keeper’s star |

The 16 species have separate silhouettes, group sizes, diets, temperaments, habitat needs, bioload, and appeal. Compatibility previews explain schools, space, water type, fin nipping, predation, and feeding competition. Field observations become journal entries.

The nitrogen cycle converts waste through ammonia and nitrite to nitrate. Plants, filters, cleanup species, oxygen, temperature, algae, disease, hunger, stress, and fin damage affect the ecosystem. This is a deliberately compressed game model, not a real husbandry guide.

## Journeys

- **Pocket expedition:** three species choices over a two-minute draft. Each choice offers three candidates. The clock and expedition tank wait while the player reads; home tanks continue earning.
- **The rescue room:** bring a troubled goldfish aquarium above 85% health with low toxins, and sustain its recovery for 25 seconds within a 150-second visit.
- **Lantern weekend:** keep a temporary reef healthy and attract 160 visitors during a 150-second festival.
- **Daily current:** a two-minute challenge with a shared UTC-date seed and a score for health, visitors, variety, and care. Persistent gallery bonuses do not alter its conditions. Scores are saved locally; there is no online leaderboard.
- **Still water:** a late-game unlimited aquarium with every species and no failure.

Conservation is part of the permanent gallery: feed a cardinalfish pair in clean water, raise young, then release them for reputation and pearls. If a reef is crowded or unsuitable, the chapter points to a new nursery or safe rehoming.

## Controls and saves

Drag to orbit, scroll/pinch to zoom, and click/tap a fish to follow it. Buttons appear as their features unlock. `F` feeds once feeding is available; `Space` pauses after time controls unlock; `Escape` leaves a panel, photo mode, or fish follow. Sound starts only with the sound button. Keyboard navigation stays inside an open drawer.

Photo mode unlocks after the second fish mission, from Settings. It hides the game interface, applies a depth-based lens, offers moonlight, and exports a PNG. Normal play has a gradual day/night cycle.

Local storage: **`tanking2.save.v1`**, containing a version-2 save. It never reads or overwrites the original Tanking save. Settings exports and restores JSON backups. Corrupt saves are sanitized or fall back to a playable beginning. Journeys pause while the page is hidden; home aquariums receive safe offline care.

## Files

- `index.html` — semantic interface shell.
- `css/style.css` — responsive gallery UI, panels, and dialogs.
- `js/main.js` — startup, frame loop, saves, visibility, and test interface.
- `js/state.js` — deterministic fixed-step simulation, economy, missions, journeys, and save restoration.
- `js/data.js` — species, abilities, keepsakes, chapter descriptions, and compatibility.
- `js/ui.js` — progressive interface and actions, journal, scores, backup files.
- `js/scene.js` — aquarium, room, plants/corals, camera, particles, and light cycle.
- `js/fish.js` — procedural fish meshes, fins, markings, and body-wave shaders.
- `js/post.js` — contact shading, restrained bloom, vignette, and photo depth blur.
- `js/audio.js` — synthesized water ambience and glass-like splash/reward notes.
- `vendor/` — bundled Three.js r160 and MIT license.
- `assets/fonts/` — Instrument Serif, bundled under the SIL Open Font License.
- `tests/` — Node state tests and real Chrome/Playwright integration checks.

The game uses HTTP ES modules. To serve it separately, run `python3 -m http.server 8889` from the site root; it does not need a package install to play. All runtime dependencies are inside this folder.

## Visual direction and credits

The rimless tank, planted slopes, open sand channel, driftwood, and suspended lamp take inspiration from actual [ADA Nature Aquarium layouts](https://www.adana.co.jp/en/contents/process/index.html) and [Green Aqua’s aquarium construction photographs](https://greenaqua.hu/en/akvarium-telepites-lepesrol-lepesre). Reference photographs are not copied into the game. All fish, plants, coral, geometry, markings, caustics, room lighting, and audio are created in code. The finish is a stylized real-time aquarium, not photographic footage.

Three.js: [MIT](vendor/LICENSE). Instrument Serif: [SIL OFL](assets/fonts/OFL.txt).

## Verification

```sh
# From the site root; Node's built-in runner has no dependencies.
node --test gms/3d/tanking2/tests/state.test.mjs

# Temporary browser tooling; the game itself has no npm dependency.
npm install --prefix /private/tmp/tanking-tools playwright
node gms/3d/tanking2/tests/browser.mjs
```

The browser test supports `PLAYWRIGHT_MODULE`, `CHROME_PATH`, and `TANKING2_URL`. It defaults to the installed macOS Chrome and the existing site server on port 8888. `window.tanking2` exposes state, actions, fixed stepping, and renderer metrics for reproducible testing.

State tests cover the complete 13-chapter journey, gameplay gates, economy/keeper bonuses, all unlocks, chemistry, nursery recovery, deterministic Daily conditions, offline caps, and malformed saves. Browser checks cover actual onboarding, chapters, purchases, feed/care, expedition choices and rewards, prior tank earnings, photo PNG export, fish following, sound, time controls, keyboard navigation, saves, and responsive/touch layouts. Measured desktop performance does not establish physical-phone performance.

Final release check: **18 state tests and 43 browser checks passed**, with no JavaScript, shader, or failed asset requests. Freshwater and populated reef captures measured approximately 60 fps at 1440×960 / DPR 1 in hardware Chrome on this Mac (66–82 scene/post draw calls). Earlier runs varied substantially during concurrent software-rendered browser activity, so this is a measured scene result rather than a universal frame-rate promise. Automatic resolution scaling responds to sustained slow frames; physical-phone performance remains unverified.
