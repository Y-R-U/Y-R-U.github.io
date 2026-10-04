# Lane AU — audio + music

## What's built

| File | What |
|---|---|
| `js/audio/ctx.js` | Shared AudioContext, master/sfx/music buses + compressor, mobile unlock (first pointerdown/touchend/keydown, silent buffer, resume on visibility), `setVolume/setSfxVolume/setMusicVolume/mute/applySettings({ sound, muted, volume, sfxVolume, musicVolume })` (0–1 or 0–100), shared reverb IR. |
| `js/audio/sfx.js` | Procedural SFX: `correct wrong tick timerLow reveal streak fanfare button join` + kids set `sparkle star kidsCorrect kidsWrong pop`. `play(name, { level, kids, force })`. Kids skin swaps correct/wrong/streak/button/reveal automatically when `body.kids-on` is set (or `setSkin('kids')`, or `opts.kids`). Wrong in kids mode is a soft two-note "boop", never a fail buzz. `render(name)` for offline tests. |
| `js/audio/piano.js` | Sampled piano (Salamander Grand V3, CC BY 3.0): 26 notes every minor third A0–C7 × 2 velocity layers, 52 mono MP3s, 2.5 MB in `audio/piano/`. Pitch-shifts to the nearest sample, velocity → layer + gain + lowpass, sustain/pedal release, light convolution reverb, per-piece loudness normalisation (quiet pieces lifted, dense ones turned down). `play(piece, { from, seconds, dest })`, `render(piece)` (OfflineAudioContext), `loadPiece(src)`, `preload`, `duration`. |
| `js/audio/clip.js` | One clip player for Apple previews, Commons files, self-hosted audio and piano note JSON (`{ type:'piano', src }`). Fetch + decode once, keep only the slice a question needs (~1 MB of RAM, not 10), play with an analyser; `playLen` plays part of a slice (growing clips share one decode). `stream(a)` plays the whole preview through one `<audio>` for "Keep listening". `pickStart(a, len, rnd)`: Apple skips the first 3 s, Commons honours `minStart/maxStart`, unknown-length clips start at 0 or their `start`. |
| `js/audio/apple.js` | iTunes lookup (CORS; JSONP fallback), stale-preview refresh by trackId, and if Apple has retired the trackId a search by `apple.term` (artist + title). `revealHTML()` = artwork + title/artist/year + black "Listen on Apple Music" badge; `BADGE_CSS`. |
| `js/audio/listen.js` (+ `listen_css.js`) | The `listen` format (registered; appended to `js/formats/index.js` MODULES). See below. |
| `js/audio/bgm.js` | Background music: shuffled playlist of 20 gentle PD/CC piano pieces (Satie Gymnopédies 1–3 and Gnossiennes 1/3, Debussy Clair de lune, Bach Prelude in C, Schumann Träumerei + Von fremden Ländern, Chopin nocturnes/preludes incl. Raindrop, Liszt Consolations 1/3, Field Nocturne 5, Mendelssohn Venetian Boat Song, Tchaikovsky Morning Prayer/Old French Song, Grieg Albumblatt), up to ~150 s each, velocities capped soft, in `data/music/bgm/` (+ `index.json` with credits). `play() stop() pause(reason) resume(reason)` (ref-counted) `duck(on, reason)` `isPlaying() nowPlaying() state()`. Level = music bus × 0.35; 3 s fade in, 5 s tail fade, 3.5 s gap; duck to 15%. Pausing fades out and remembers the spot; resumes 1 s after the other sound stops. |
| `js/audio/ctx.js` busy bus | `begin(tag)/end(tag)` + `duckBegin/duckEnd`, `onBusy(fn)`. Wired: listen (whole question), clip player, piano (except bgm and offline renders), **every `HTMLMediaElement.play()`** (patched prototype: covers A's `audioButton`, Learn, field guide, S, anything) and **`speechSynthesis.speak`** (patched: ducks until the utterance ends or `cancel()`), plus `visibilitychange` hidden. No changes needed in other lanes' files. |
| `js/audio/dev.html` | Audio lab: SFX buttons (kids skin toggle), piano piece player + tappable keyboard, random clips per pack with the Apple reveal, and the real `listen` format with a mock api. `http://localhost:8888/gms/2d/clued/js/audio/dev.html` |

### `listen` format
- Options (A's setup UI shows them; remembered per player via A's `setLast`): **Grow the clip** Online only / On / Off;
  **Clip length** 1/2/3/5/10/15/30 s (default 5; kids 5/10/15, default 10); **Album artwork** Off / Blurred (sharpens as the clip plays) / On;
  **Ask for** Mix / Title / Artist / Decade / Composer / Next line; **Answers** 2/3/4/6 (kids 2/3).
- Everything that matters online is stored in the question: `data.{ a, start, len, art, kind, replays, stageLens, meta, artImg }`, `stages`. Host settings therefore win in rooms.
- Asks by pack shape: songs → title / artist / decade; artists pack → artist; themes → film or TV show (or composer);
  piano + classical → title / composer; anthems → country (`pack.listenPrompt`); animals → "Which animal makes this sound?" / "Which bird is this?";
  instruments → instrument. "Finish the line" only from items with `lyrics`, which exist only on public-domain piano songs (the test enforces it); lines that repeat inside a song are never used as prompts.
- Points (solo/party): `base × clip (1 s ×2 … 30 s ×0.7) × artwork (off 1, blurred 0.85, on 0.65) × 0.85 per replay`. 2 replays (kids unlimited).
- **Progressive stages:** with Grow on, `stages: 5`, clip 1 → 2 → 4 → 8 → 15 s; blurred artwork sharpens by stage. Reads `api.stage`, re-plays on `api.onStage(cb)`, never advances itself. Until the runner draws the shared vote button (it should set `api.moreButton = true`), listen shows its own "Longer clip 👀" button calling `api.requestMore()` (or advancing locally when there is no runner support). In staged mode it omits `points`, so the runner's stage multiplier applies.
- Kids (`kids` from generate / `api.kids`): ≤ 3 answers, picture answers whenever every option has an image (animals), never lookalike distractors, artwork on, unlimited replays, longer clips. Easy difficulty doubles clips under 5 s.
- Reveal (via `api.reveal`): artwork + title + artist/year + "Listen on Apple Music" + "Keep listening" (streams the full preview / piece).
- Optional hook `prepare(questions)` (also on the format object) HEAD-checks Apple previews and re-resolves stale ones before preflight.

## Background music (setting `bgm`, wired by the manager in `js/ui/toggles.js`)
- Starts on the first pointerdown (`armBgm`), 🎵/🔇 toggles `play()/stop()`; `applyAudioSettings` already drives the music-bus volume and mute live (bgm sits on the music bus).
- Rebuild the playlist: `node tools/au_pieces.mjs bgm`. Test: `node tools/au_bgm.mjs` (real click → plays; listen question → paused for the whole question; resumes ~1 s after the run stops; any `<audio>` pauses it; `duck()` and speech duck it; turning it off stops it). All pass.
- Online countdown stingers: they go through `sfx`, which deliberately does not pause bgm (short UI sounds). If S adds longer sounds, wrap them in `begin('stinger')`/`end('stinger')` from `js/audio/ctx.js` or use `<audio>` (auto-covered).

## Music packs (`data/music/*.json`, theme `music`)

| Pack | Items | Source |
|---|---|---|
| hits-1960s … hits-2020s | 55 / 58 / 62 / 56 / 61 / 56 / 48 | Apple previews; songs chosen from Billboard Year-End Hot 100 and UK year-end best sellers; `facts { artist, year (original release), decade }` |
| music-artists | 86 artists, 193 previews | 2–3 signature songs each; `facts { origin, decade (breakthrough), songs }` |
| screen-themes | 44 | Film/TV themes from the original soundtracks; item = the film/show; `facts { composer, year (film/show year), track, type }` |
| kids-film-tv (`kids: true`) | 22 | Disney/Pixar/kids TV songs, all difficulty 1 |
| one-hit-wonders | 34 | Acts with a single US top-40 hit (UK where noted) |
| classical-piano | 32 | 29 Mutopia MIDI pieces (truncated to 25–40 s) + Ode to Joy, Eine kleine Nachtmusik, Canon in D transcribed |
| pd-melodies | 10 | Carols, hymns, Foster, music hall, Take Me Out to the Ball Game (all pre-1931 or traditional) |
| nursery-rhymes (`kids: true`) | 10 | Twinkle, Mary, Row, Frère Jacques, London Bridge, Old MacDonald, Hot Cross Buns, Happy Birthday, Yankee Doodle, Ode to Joy, with PD lyrics |
| anthems | 173 countries | Wikidata country → anthem → audio, mostly US Navy Band (US government, PD); 14 easy, 42 medium |
| classical-recordings | 18 | Commons: Musopen, US Marine/Army/Air Force bands (PD), PDP-CH (PD), Kevin MacLeod / CC BY |
| instruments | 46 | Wikidata instrument → audio + image (images let kids pick pictures) |

Audio in the repo: `audio/piano/` 2.5 MB only (budget 15 MB). Apple previews are streamed, never stored. Commons files are hotlinked as Commons' MP3 transcodes (CORS `*`, checked reachable at build).

## Licences / credits
- Every audio object has `credit`, `license`, `page`. Allowed: PD, CC0, PDM, CC BY, CC BY-SA. Apple items use `license: "Apple Music preview (streamed, not stored)"`, `page` = the Apple link, `apple { trackId, url, art, term }`.
- Piano credit: composer + "MIDI from the Mutopia Project, maintained by …" (licence per piece: PD, CC BY 3.0, or CC BY-SA 2.5/3.0/4.0, so the derived note files carry the same licence) or "transcribed by Clued from public-domain sources" + Salamander (CC BY 3.0, Alexander Holm).
- Commons licences come from each file's extmetadata at build time; rejected ones (EEF OAL, GFDL-only) are dropped and printed.

## Apple: what works (tested 2026-10-05)
- `itunes.apple.com/search` and `/lookup` send `Access-Control-Allow-Origin: *`; JSONP `callback=` also works.
- Previews (`audio-ssl.itunes.apple.com/…m4a`) send `ACAO: *`, `accept-ranges`, `cache-control: max-age≈300 days`. They play in `<audio>` and decode with `decodeAudioData` (so the visualiser has real data). **No proxy needed from lane S.**
- Stability: preview files are long-lived, but **trackIds change when labels re-issue catalogues** (Queen's 1975 tracks now have 2026 ids). Runtime: lookup by trackId → if gone, search by `apple.term`. Tested in Chrome with a dead preview URL and a retired trackId: both recovered. Re-run `au_resolve` every few months anyway.
- Release dates in iTunes are unreliable (compilations carry bogus dates such as 1974 for a 1982 song). The resolver therefore only accepts a match whose Apple date is within ±1 year of the curated year, prefers exact titles and original albums, prints every disagreement (`CHECK`) and drops rows with no near match. I reviewed every CHECK line and fixed the list years (Without You 1971, Come and Get Your Love 1973, Jump 1983, Man in the Mirror 1987, Hollaback Girl / You're Beautiful 2004, You've Lost That Lovin' Feelin' 1964); I Got You (I Feel Good) was dropped because Apple returns the 1964 recording; Breakfast at Tiffany's was dropped (1993 album vs 1995 single).
- Theme years are film/show years, not checked against Apple's (later) soundtrack dates.

## How to rebuild
```sh
tools/au_piano_samples.sh [workdir]     # Salamander FLACs → audio/piano/*.mp3 (ffmpeg)
node tools/au_pieces.mjs                # Mutopia MIDI + tools/au_melodies.mjs → data/music/notes/*.json + the 3 piano packs
node tools/au_resolve.mjs [list…] [--refresh] [--report]   # tools/au_lists/*.txt → Apple packs (+ <id>.check.json)
node tools/au_commons.mjs [anthems|instruments|classical]
node tools/au_mutopia.mjs "search term"  # find more Mutopia pieces
```
Caches live outside the repo: `~/.cache/clued-au/itunes.json` (≈20 MB of search results) and `~/.cache/clued-au/midi/`.
The resolver is rate-limited to one call per 3.3 s (a cold run of all lists takes ~40 min; warm runs take seconds).

## How to test
- `node tools/au_test.mjs`: pack schema, licences, Apple fields, every list row resolved or reported, note files, melody bar lengths, and the listen format on every pack (determinism, answer correctness, kids limits, stages, lyric rule). Verified to fail on a wrong answer index (946 failures) and on an NC licence.
- `~/.claude/bin/cdp start --port 9405 -- --autoplay-policy=no-user-gesture-required`, then
  - `node tools/au_browser.mjs [--out DIR] [--pieces …] [--skip-media]`: renders piano pieces offline, checks top-voice pitch and onset timing against the notes and counts clicks (onset-aware), writes WAVs; plays a sample of Apple/Commons clips (media events, `currentTime` advancing, decode path) and decodes all 52 piano samples; runs the real listen render. Falsified: a wrong pitch shift, a 0.75× tempo and hard note cut-offs all fail it.
  - `node tools/au_bgm.mjs`: background music behaviour in the real shell.
  - `node tools/au_shell.mjs [outDir]`: plays `listen` inside A's real shell (music packs injected) in portrait, landscape, desktop and kids; screenshots.

## Open issues
- Music packs are not loaded by the shell yet (see Requests); `au_shell.mjs` injects them for testing.
- Low-register and organ textures (Mountain King bass, Toccata) score lower in the automatic pitch check (still above the 75% threshold); that's the analysis window, not the notes.
- Several packs have fewer than 15 difficulty-1 items (classical-recordings 5, pd-melodies 5, one-hit-wonders 8, screen-themes 9, instruments 10, nursery 10). Kids still get ≥ 15 from nursery + kids-film-tv + C1's animal sounds.
- C1's bird sounds include one generic "bird song, grassy woodlands" file for Crimson rosella; C1 might want a species recording.
- Year-end chart picks are from memory and verified against Apple release years, not against the chart tables themselves; blurbs therefore only claim the release year.
- Not yet human-listened on a phone.

## Requests
- **A (runner, important):** `ctrl.destroy()` is only called in `finish()`, never between questions, so every format's timers/RAF loops and audio from earlier questions keep running. listen now self-destroys when its DOM is detached, but please call `ctrl?.destroy()` before rendering the next question (all formats benefit).
- **A (`js/core/packs.js`)**: load packs from `data/music/` too: use `index.packs[id].path` when present (or try `data/music/<id>.json` after `data/packs/`), and include `data/music/` in the dev directory scan.
- **C1 (`tools/build_index.mjs`)**: also index `data/music/*.json` and write `path: 'data/music/<id>.json'` for those packs; pass through `listenPrompt` if you like (it's in the pack file).
- **A**: before media preflight, call `fmt.prepare?.(questions)` for formats that have it (listen refreshes stale Apple previews there).
- **A/S (runner)**: when the runner draws the shared Show-more/vote button, set `api.moreButton = true` so listen hides its own. For online rooms please pass `online: true` (or `spec.online`) to `generate()` so Grow-the-clip "Online only" switches on; until then hosts can pick "On".
- **A**: SFX names you use are all implemented; kids variants switch automatically from `body.kids-on`.
