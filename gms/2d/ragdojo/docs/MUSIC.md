# MUSIC

Twenty-four instrumental tracks — fourteen for the dojo, ten for after dark.

Fourteen instrumental tracks, generated on **Suno v5.5** in Aaron's logged-in browser, 2026-09-01.
Advanced mode, Weirdness 50%, Style Influence 50%, Lyrics → Instrumental, duration set by the
Custom slider (2:00 for everything except `victory` at 1:00). ~70 credits, two takes each.

| id | context | target | shipped | mean vol | take |
|---|---|---|---|---|---|
| `menu` | title / hub / between fights | 2:00 | 119 s, 816 KB | -17.0 dB | menu_1 |
| `fight1` | tiers white–orange | 2:00 | 120 s, 819 KB | -16.8 dB | fight1_2 |
| `fight2` | tiers green–purple | 2:00 | 120 s, 819 KB | -16.1 dB | fight2_1 |
| `fight3` | tiers brown–red | 2:00 | 120 s, 820 KB | -16.0 dB | fight3_2 |
| `boss` | rank champions | 2:00 | 120 s, 820 KB | -16.5 dB | boss_1 |
| `final` | the Ink Master | 2:00 | **150 s**, 1024 KB | -16.1 dB | final_2 |
| `victory` | victory screen | 1:00 | 60 s, 409 KB | -16.9 dB | victory_1 |
| `fight4` | roster, from level 1 | 2:00 | 118 s, 811 KB | -15.2 dB | fight4_2 |
| `fight5` | roster, from level 1 | 2:00 | 120 s, 820 KB | -15.0 dB | fight5_2 |
| `fight6` | roster, from level 11 | 2:00 | 119 s, 814 KB | -15.4 dB | fight6_2 |
| `fight7` | roster, from level 11 | 2:00 | 119 s, 816 KB | -14.4 dB | fight7_2 |
| `fight8` | roster, from level 21 | 2:00 | 118 s, 809 KB | -14.3 dB | fight8_2 |
| `fight9` | roster, from level 31 | 2:00 | 120 s, 824 KB | -14.6 dB | fight9_1 |
| `fight10` | roster, from level 31 | 2:00 | 120 s, 819 KB | -14.4 dB | fight10_2 |

`fight4` take 1 came back at 91 s — Suno cut it short, so take 2 was kept regardless of level.

Total shipped: **11.2 MB**, but tracks are fetched lazily on first play and the roster unlocks
as you progress, so a new player downloads four fight tracks plus the menu, not fourteen. Raw takes are kept in `assets/audio/raw/` and are **git-ignored** —
18 MB of source has no business in the repo.

> **Selection was by measurement, not by ear.** Two takes were generated for every track and the
> kept one was chosen on full duration plus the better mean volume. Nobody has listened to these.
> A human listening pass may well prefer the discarded take; every take is still in the Suno
> workspace under its `RD <id>` title.

`final` came back at 150 s against a 120 s request — Suno overshot, and for a final boss longer
is fine, so it was kept.

## After dark (2026-09-02)

Ten more, same pipeline, same settings, for the DARK campaign. Punk, boom bap, downtuned rock
and trap rather than taiko and erhu. All two takes, 2:00 except `dvictory` at 1:00.

| id | context | shipped | mean vol | take |
|---|---|---|---|---|
| `dmenu` | dark hub | 119 s, 819 KB | -14.7 dB | dmenu_1 |
| `dfight1` | Back Alley — street punk | 118 s, 811 KB | -17.1 dB | dfight1_2 |
| `dfight2` | Night Streets — boom bap | 119 s, 816 KB | -14.8 dB | dfight2_1 |
| `dfight3` | Warehouse — downtuned rock | 119 s, 816 KB | -13.7 dB | dfight3_1 |
| `dfight4` | Running — industrial punk | 119 s, 816 KB | -14.3 dB | dfight4_2 |
| `dfight5` | Cold Swagger — dark trap | 119 s, 819 KB | -12.5 dB | dfight5_1 |
| `dfight6` | Riot — hardcore punk | 119 s, 819 KB | -15.0 dB | dfight6_1 |
| `dboss` | crew champions | 120 s, 821 KB | -10.9 dB | dboss_1 |
| `dfinal` | The Penman | 119 s, 819 KB | -13.3 dB | dfinal_2 |
| `dvictory` | dark victory screen | 59 s, 407 KB | -14.0 dB | dvictory_1 |

`dfight1`'s first pair came back at 91 s and 57 s and was re-rolled; `dfight3` and `dvictory`
each had one short take, and the full-length one was kept.

Two things about the Suno UI had changed since the first batch:

- **Duration is behind a Custom/Auto pair** inside More Options — the slider only exists once
  Custom is selected.
- **The slider ignores a synthetic `KeyboardEvent` without `keyCode`.** Radix reads `keyCode`,
  not `key`. Worse, reading `aria-valuenow` between presses forces a synchronous re-render of
  the whole workspace list and each step took roughly nine seconds. Real key events through
  the browser (`computer` action `key`, `repeat: N`) do the whole travel instantly; that is
  the way to drive it.
- The download endpoint returns a presigned S3 URL with query parameters, which the browser
  tool refuses to echo back. Do the fetch, the blob and the `<a download>` entirely inside the
  page and report only sizes.

## The unlock roster

`js/music.js` owns one per theme (`FIGHT_POOLS`). Light: ten fight tracks, four from the
start, two more at each of levels 10, 20 and 30. Dark: six, four from the start and two at
level 15. `menu`, `boss`, `final` and `victory` are contextual and always available — gating
those would only mean silence where they belong.

Selection avoids whatever was played recently (`pickFightTrack`, history in
`save.musicRecent`), rather than mapping level to slot. Two index-based versions were tried
first and both were wrong in ways only play testing caught:

- rotating on `level.idx` let the eight champion fights eat slots, so `fight10` — the last
  thing you unlock — never played at all;
- rotating on the ordinal of roster-using fights fixed that but was still deterministic, so
  level 1 always played the first track. Replaying or refreshing an early level gave the same
  song every time and the rest of the roster was unreachable from a fresh save. Measured:
  60 fresh starts, 60 plays of `fight1`.

`tools/musicrota.mjs` covers all of it, and `--falsify` restores the index rotation to watch
it go red.

## Pipeline

```
Suno take  ->  assets/audio/raw/rd_<id>_<take>.mp3
           ->  tools/compress_music.sh        (56 kbps mono @ 32 kHz, compressor + limiter, -vn)
           ->  assets/audio/<id>.mp3          (shipped, listed in js/music.js)
           ->  node tools/musicgate.mjs       (every id fetches, decodes, and is long enough)
```

`-vn` is not optional: Suno mp3s carry an embedded cover PNG and an encode profile without it
copies the artwork into the shipped file.

## Driving Suno again (what actually worked)

1. `suno.com/create`, **Advanced**, v5.5. Lyrics → **Instrumental** under *More Options*.
2. The whole description goes in **Styles**. Always state "fully instrumental, no vocals", the
   key, and "tempo exactly N BPM".
3. **Duration** is a Radix slider, `[role=slider][aria-label=Duration]`, min 10 max 360, and its
   keyboard step is **5 seconds**. Coordinates are a fight; focus it with `.focus()` from JS and
   drive it with ArrowLeft/ArrowRight instead.
4. Song Title `RD <id>` so takes are identifiable later.
5. Settings persist between generations, so tracks chain: retype Styles, retype the title, Create.

### Getting the files out

This is the part that has changed twice, so it is worth writing down precisely.

- `https://cdn1.suno.ai/<uuid>.mp3` is **dead** (403), and the feed's `audio_url` now reads
  `.../api/forbidden`.
- The live route is `GET https://studio-api.prod.suno.com/api/download/clip/<uuid>` with a Clerk
  bearer token (`await window.Clerk.session.getToken()`), which returns
  `{ok, download_url, status}` where `download_url` is a presigned S3 link. The page **can** fetch
  that S3 link — the bucket's CORS allows it.
- **The page cannot reach `http://127.0.0.1`.** A drop-box server on localhost looks like the
  clean answer and it is not: Chrome's Private Network Access check blocks a public HTTPS page
  from reaching a loopback address and the failure is a silent hang, not an error. Adding
  `Access-Control-Allow-Private-Network` to the server did not help.
- What worked: fetch the S3 link in the page, wrap the bytes in a `blob:` URL, and click a
  generated `<a download="rd_<id>_<n>.mp3">`. Because the blob is same-origin the `download`
  attribute is honoured and the filename sticks. Files land in `~/Downloads`.
- **The download endpoint rate-limits.** Called back-to-back it stops returning JSON and serves a
  Vercel HTML error page; `j.download_url` is then `undefined`, `fetch(undefined)` resolves to
  `https://suno.com/undefined`, and you cheerfully save a 57 KB HTML file named `.mp3`. Validate
  every response: require `content-type: application/json`, require `download_url` to start with
  `https://`, and reject any blob that is not `audio/*` or is under 200 KB. Retry with backoff.
- Do **one clip at a time with a ~2 s gap**. Never use the multi-select "Download all" — it opens
  a popup per clip, Chrome blocks them, and every download from suno.com stays silently blocked
  until the site's permission is reset by hand.

## Known polish item

Suno does not produce loop-ready material and these were not trimmed. The tracks loop by simply
restarting, so a couple have an audible seam at the wrap. Trimming the head/tail and adding a
short crossfade in `audio.js` is the obvious next pass; it was deliberately left undone.

## Prompts (verbatim, whole prompt in the Styles box)

- **menu** — `playful comedic kung fu menu theme, fully instrumental, no vocals, key of A minor, tempo exactly 96 BPM, plucked pizzicato strings and kalimba over soft woodblock and pencil-tap percussion, light shakuhachi flute melody over gentle taiko, cheeky and understated with plenty of space, loops under a menu screen, cartoon paper dojo`
- **fight1** — `bouncy comedic kung fu fight music, fully instrumental, no vocals, key of E minor, tempo exactly 124 BPM, taiko drums and woodblock groove, plucked erhu and shakuhachi riff trading the melody, twangy surf guitar stabs, light and scrappy, cartoon martial arts brawl, driving and fun`
- **fight2** — `driving surf rock kung fu battle, fully instrumental, no vocals, key of D minor, tempo exactly 138 BPM, reverb-drenched twangy surf guitar lead over taiko and tight snare, walking bass, brass stabs, erhu doubling the riff, confident and relentless, retro martial arts film score`
- **fight3** — `heavy kung fu fight anthem, fully instrumental, no vocals, key of C minor, tempo exactly 146 BPM, downtuned distorted guitar riff over thundering taiko, aggressive tight drums, screaming erhu carrying the melody, brass hits, dangerous and physical, martial arts showdown`
- **boss** — `tense martial arts champion duel, fully instrumental, no vocals, key of F sharp minor, tempo exactly 132 BPM, low ominous strings and slow taiko build, sparse woodblock ticking like a clock, wailing erhu over the top, gong hits, coiled and dangerous, boss fight, martial arts film score`
- **final** — `epic final duel of a martial arts film, fully instrumental, no vocals, key of D minor, tempo exactly 150 BPM, full orchestra over an army of taiko drums, choir stabs, screaming erhu lead, distorted guitar underneath, huge brass, enormous and climactic, the last fight, cinematic`
- **victory** — `triumphant martial arts victory theme, fully instrumental, no vocals, key of B flat major, tempo exactly 108 BPM, bright brass and erhu rising fanfare, big gong hit, celebratory taiko flourish, warm strings, proud and joyful, champion of the dojo, loops under a victory screen`
