# Lane MV: Movie Moments (generated art)

Original illustrations of famous film scenes, made with the local FLUX.2 [klein] and used for "Which movie is this?"
Stretch packs `song-pictures` (song titles drawn literally) and `book-moments` (famous novels) use the same pipeline.

## What's here
| Pack | File | Items | Images | Difficulty-1 items | Kids (facts.kids) |
|---|---|---|---|---|---|
| Movie Moments | `data/packs/movie-moments.json` | 138 films | 300 scenes | 82 | 65 films, 62 with a d1 scene |
| Song Pictures | `data/packs/song-pictures.json` | see below | | | |
| Book Moments | `data/packs/book-moments.json` | see below | | | |

- Media: `media/moments/<film-id>-<n>.webp` (640×432 webp q82, avg 44 KB, 14 MB total), `media/song-pictures/`,
  `media/book-moments/`.
- Pack shape follows CONTRACT.md. `kids` is false at pack level, and `facts.kids` marks family films so kids mode can filter.
  Facts: `year`, `decade`, `director` (movies); `artist`, `year`, `decade` (songs); `author`, `year` (books).
- Each item has 1–3 `media.img` entries sorted easiest first. Additive fields on each image: `difficulty` (1–3,
  per scene) and `caption` (the reveal line, e.g. "The ship that 'could not sink' meets an iceberg"). Item
  `difficulty` is the easiest scene's difficulty.
- Credit `Clued (AI-generated illustration)`, licence `CC0`, page = this notes file's URL on the Pages site.
- Pack prompts: `nameImgPrompt: "Which movie is this scene from?"` (mc reads it), `imgPrompt: "Which scene is from {name}?"`.
- Film ids match C2's `movies` pack where both packs have the film (`close-encounters-of-the-third-kind`,
  `e-t-the-extra-terrestrial`, `harry-potter-and-the-philosopher-s-stone`, `titanic`, `jaws`, …). Years were cross-checked against
  C2's pack: no mismatches.

## House style
Every prompt ends with the same suffix (`style` in `tools/mv_prompts.json`): *painterly gouache illustration in the
style of a vintage film poster, bold simplified shapes, visible brush texture, rich limited colour palette, dramatic
cinematic lighting, cream paper border, no text…*. It gives a consistent look with a cream frame across all three packs.
Content rules applied in every prompt: no real people's likenesses (figures from behind, silhouettes or small and generic),
no logos or titles, no studio character designs (only generic archetypes: "a cowboy rag doll", "a toy spaceman", "a red-haired
mermaid"). Nothing gory.

## Model choice
Compared `flux2-klein-9b-mlx-4bit` with `flux2-klein-4b` on the same prompts. The 9B follows composition better (four funnels on
the liner, all four Oz companions in place) and has more poster-like texture, while the 4B is about 15% faster. Picked **9B
mlx-4bit, 640×432, 4 steps, guidance 1**. 768×512 at 6 steps was no better at thumbnail size and took about twice as long.
Expect 65 s per image on an idle machine, but 110–150 s while other sessions keep memory under pressure (14 GB of swap in use
during this run).

## Review
Every image was looked at in 3×2 review sheets (`python3 tools/mv_sheet.py keys …`). I rejected garbled lettering (shop
signs, tickets, bus destination boards, licence plates), scenes that didn't read (a Death Star drawn as a saucer, a city
street that didn't fold), studio character designs, and anything off-model for kids (a topless mermaid, regenerated with a
shell top). Tiny illegible painter's "signatures" in a corner were accepted.

**Regenerated (attempts):** pinocchio-1, pinocchio-3, dumbo-2, its-a-wonderful-life-1 (3), lady-and-the-tramp-1,
north-by-northwest-2, breakfast-at-tiffanys-1, the-jungle-book-2, willy-wonka-1, star-wars-2, the-terminator-1,
back-to-the-future-1, top-gun-2, big-2, the-little-mermaid-1, home-alone-2, speed-1, jumanji-2, inception-1,
paddington-1, dune-1, encanto-1 (2 each unless noted).

**Dropped scenes (26):**
- godzilla (whole film): the monster always came out as Toho's design.
- cars (whole film): the diner signs were garbled after 3 tries, and the remaining scene (tractor tipping) is unguessable.
- Character-design risk: paddington-2 (the bear in his duffle coat), toy-story-3 (the three-eyed claw-machine aliens),
  mulan-3 (the little red dragon).
- Garbled text after retries: singin-in-the-rain-2, speed-2, elf-2, luca-2.
- Didn't read as the scene: alien-2, the-great-escape-2, dirty-dancing-2, dune-2, wicked-2, 2001-a-space-odyssey-3,
  titanic-3.
- Pre-dropped as too obscure to be worth the GPU time: mary-poppins-3, the-sound-of-music-3, the-godfather-3,
  the-shawshank-redemption-3, finding-nemo-3, up-3, interstellar-3, matilda-3 (also a child being thrown).

20,000 Leagues Under the Sea, The Princess Bride, Big and Mrs. Doubtfire are in the pack with `kids: false`. They are family-ish
films, but none has a picture obvious enough for kids mode.

## Difficulty and the blind check
**The blind check is still to do: every difficulty is my own judgement.** The vision service (`:7872`) is off by
default (see `~/cc/airon/CLAUDE.md`). Starting it while Flux was generating would have broken the 24 GB rule, and the run
had Flux busy for about 9 hours. `tools/mv_blind.mjs` is ready:
```
# once Flux is idle: ~/cc/airon/vision/start.sh, then
node tools/mv_blind.mjs                      # asks "which film? top 3" for each image, never told the answer; resumable
node tools/mv_blind.mjs --apply              # top-1 → d1, top-3 → d2, missed → d3, written into tools/mv_prompts.json
node tools/mv_build.mjs movie-moments        # rebuild the pack
~/cc/airon/vision/stop.sh
```
It refuses to run while Flux has a job, and unloads the Flux worker first. Use `--pack song-pictures|book-moments` for the others.

Scene difficulty now (movies): 91 d1, 136 d2, 73 d3. Item difficulty: 82 d1, 49 d2, 7 d3. Kids films without a d1 scene:
spirited-away, paddington and luca. Their only obvious ideas were dropped, so they stay in at d2.
Decades: 1930s 4, 1940s 7, 1950s 10, 1960s 11, 1970s 10, 1980s 20, 1990s 27, 2000s 22, 2010s 19, 2020s 8.

## How to regenerate / extend
- `tools/mv_prompts.json` (movies), `tools/mv_prompts_songs.json`, `tools/mv_prompts_books.json`: films → scenes `{p, d, cap, drop?}`.
- `node tools/mv_gen.mjs [--pack song-pictures|book-moments] [--only id,id] [--batch 3]`: resumable (skips existing
  webps). It waits for LTX's worker to unload before submitting, keeps 3 jobs queued on mflux-queue, and re-reads the prompts file
  between passes. Raw PNGs go to `~/.cache/clued-mv/` (not in the repo). SIGTERM cancels its own queued jobs.
- `node tools/mv_fix.mjs edits.json [--pack …]`: `{ "film-n": { p?, d?, cap?, drop?, reject? } }`. A new prompt or
  `reject` deletes the webp and bumps the seed (`tools/mv_state.json` tracks attempts), so the next `mv_gen` run regenerates it.
- `node tools/mv_build.mjs [movie-moments|song-pictures|book-moments|all]` writes the pack JSON from the prompts plus
  the files that exist (w/h read from the webp header).
- `python3 tools/mv_sheet.py contact media/moments out.jpg 15` makes a contact sheet; `review` / `keys` make larger review grids.
- Seeds are deterministic per scene key plus attempt, so a rerun reproduces the same image.

## Requests
- **A (formats/registry):** `imageOf(item, rng)` picks any image at random. For these packs it should prefer images whose
  `difficulty` ≤ the round's difficulty (Easy/Kids → `difficulty: 1` scenes only; images are sorted easiest first, so
  `img[0]` is always the easiest), and the reveal should show the image's `caption` when present. Without this, an
  Easy question can show a d3 scene, since item difficulty is the easiest scene.
- **A / mc:** the mc format already reads `nameImgPrompt`. "Which movie is this scene from?" assumes picture → name.
  The reverse (`imgPrompt`, name → pick the picture) works but is harder, because the scenes are illustrations.
- **Manager:** run the blind check (above) when Flux is idle, then rebuild. Contact sheets are in the lane's final report.

## Open issues
- Difficulties are my judgement until the blind check runs.
- Some scenes depict iconic objects or vehicles generically (a DeLorean-like gull-wing car, a moon-sized battle station with
  a dish, a winged spaceman toy). They are drawn generically with no logos, as the brief allowed. Flag any you want cut.
