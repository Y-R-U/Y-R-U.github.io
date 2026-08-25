# DRK v0.1 Build Plan

## What We Are Building

`/gms/2d/drk/` is a mobile-first life and dating game inspired by old Flash dating sims. The v0.1 loop is:

- Build wealth through jobs, side hustles, trading, and gambling.
- Improve charm, fitness, intelligence, reputation, and energy.
- Date four adult romance characters, each with different preferences.
- Use generated portrait/card media first, with optional looping videos later.
- Let debug mode regenerate character cards, character scenes, shared backgrounds, looping videos, and transition videos through local Flux/LTX services.

The tone is M-rated but not explicit. Kissing, cuddling, flirting, reduced clothing, and fade-out romance beats are acceptable. Intimate scenes must fade to a safe bedroom-style image or text beat; do not render explicit sexual imagery.

## Files To Look At

- `index.html`  
  Main app shell. It should stay vanilla HTML and load only local CSS/JS.

- `css/style.css`  
  Mobile-first portrait layout. Desktop switches to story/details on the left and media on the right.

- `js/data.js`  
  Source data for the v0.1 game: player, characters, jobs, market assets, date spots, story beats, and initial media prompts.

- `js/game.js`  
  Runtime state, turn loop, jobs, trading, gambling minigames, dating choices, save/load, media switching, and transition-video fallback.

- `js/debug.js`  
  Floating debug toggle and the media-regeneration modal. This is where image clicks open the debug workflow.

- `data/media_manifest.json`  
  Local media source of truth. The helper updates this after generating images/videos.

- `regen_helper.py`  
  Local-only helper for debug generation. Run it from this folder with `python3 regen_helper.py`, then open `http://127.0.0.1:8788/?debug`. If the shared Awake/The Horrors helper is already using `8788`, run `PORT=8789 python3 regen_helper.py` and open `http://127.0.0.1:8789/?debug`.

- `gen_initial_images.py`  
  One-off/reusable local Flux generator for the initial 576x1024 character cards and shared backgrounds.

## Version 0.1 Requirements

1. The first screen must be the playable game, not a marketing page.
2. The layout must be mobile-first portrait. Desktop must show details/story/actions on the left and the portrait media on the right.
3. Initial character reference cards must be generated at `576x1024` with the local `flux2-klein-9b-mlx-4bit` model:
   - Male protagonist: Alex Vale.
   - Four adult romance characters: Mara, Sienna, June, Valentina.
4. Debug mode is a small floating button near the top-right of the screen.
5. In debug mode, clicking the current image/video opens a modal with these tabs:
   - Character / Scene: regenerate `character_card`, or enter a new image name to make a new character scene using the character card plus selected background as references.
   - Background: create a shared background image by name and prompt.
   - Loop Video: generate an LTX video from any character scene as first frame, optional end frame, prompt, size, frame count, and optional seed. Type is `LOOPING`.
   - Transition: generate an LTX transition from image/video A to image/video B with the same video controls. Type is `TRANSITION`.
6. Video options must include:
   - `prompt`
   - `size`: `192x320`, `320x512`, `576x1024`
   - `frames`: default `25`, adjusted by `8`-frame steps
   - `seed`: blank means random
7. Runtime media rules:
   - Image and looping video are treated as the same scene media.
   - If a scene has a looping video, it plays in a loop.
   - If a transition video exists between the current scene and next scene, it plays once before the next scene appears.
   - If a transition does not exist, the game immediately shows the next image/video.

## Local Service Targets

- Flux still images: `http://localhost:7867/api/generate`
  - Model: `flux2-klein-9b-mlx-4bit`
  - Default card/background size: `576x1024`

- LTX video: `http://localhost:7866/api/generate`
  - Valid requested sizes for this game: `192x320`, `320x512`, `576x1024`
  - Frame count will be rounded by LTX to `8n+1` if needed.

## Implementation Notes

- Do not use `alert`, `prompt`, or native `confirm`; use modal panels.
- Keep generated source/runtime media in this project folder. Do not rely on Codex image output folders.
- When adding new debug generation features, update `data/media_manifest.json` and call `window.DRKGame.refreshMediaManifest()` after completion.
- Shared backgrounds are global: every character scene generator should be able to pick any background.
- The helper queues work; browser requests should return quickly with a job id, then the debug modal polls `/api/status`.
- The debug UI defaults to `http://127.0.0.1:8788` for helper calls. To point a normally served page at another helper port, use `?debug&helper=http://127.0.0.1:8789`.
