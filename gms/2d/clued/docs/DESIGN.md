# CLUED — Design (v1)

A trivia and learning game. Every game is a **format** (how the question is asked) played on one or
more **packs** (what it's about), inside a **structure** (how many rounds, lives and timers). Any format
runs on any pack that has the data it needs, so the menus only offer combinations that work.

Mobile-first portrait, with real landscape layouts (media left and answers right, map plus side panel).
Desktop works with mouse and keyboard (1–4 picks an answer, Enter continues).

## Theme picker (applies to almost every mode)
The default is **All**. Tap "Choose themes" to open a tree: Theme → packs (Animals → Snakes, Spiders…).
Tick any mix. The picker greys out packs that can't feed the chosen format (e.g. no sound for "Listen"),
with a one-line reason. The last choice is remembered per format.

## Themes and packs (v1 target)
- **Animals:** snakes, spiders, sharks, jellyfish, wasps/bees/hornets, insects, birds, dog breeds, cat breeds, dinosaurs, sea creatures, mammals, frogs
- **Nature:** trees, flowers, mushrooms (shows a "never use this to forage" note), gemstones/minerals
- **Geography:** countries, flags, capitals, landmarks, cities, rivers/mountains, currencies, languages
- **Screen:** movies (box office by year/decade, release year, quotes, clue ladders, emoji plots), actors, TV
- **Music:** artists, hit songs by decade (Apple previews), classical (piano synth plus public-domain recordings), anthems, instruments
- **Books & words:** famous books, authors, first lines (Gutenberg), quotes (who said it), word origins
- **People:** famous people, scientists/inventors, leaders, explorers, athletes
- **Science:** elements, space, human body, inventions
- **Art:** famous paintings (public domain, Wikimedia), artists, architecture
- **History:** events, dates (timeline ordering), empires
- **Sport, Food & drink, General knowledge, Kids** (easy picks across everything)

## Formats
| id | Name | Needs |
|---|---|---|
| `mc` | Multiple choice (2/3/4/6 answers) | questions, or items + an answer key |
| `tf` | True or false (speed) | questions or facts |
| `match` | Matching board: N prompts, N answers, with decoys and repeats allowed | items |
| `ladder` | Clue ladder: 5/10/20 clues from hard to easy; fewer clues = more points; type or pick the answer | items with clues |
| `hilo` | Higher or lower on a numeric fact | numeric facts |
| `order` | Put 4–6 in order (date, size, speed) | numeric/date facts |
| `odd` | Odd one out | items with group/boolean facts |
| `sort` | Sort into bins (dangerous/harmless, real/fake, continent) | boolean/category facts |
| `fake` | Spot the fake (which one doesn't exist) | items + fakes list |
| `reveal` | Picture reveal: pixelated, zoomed or tile-by-tile; faster = more points | images |
| `silhouette` | Silhouette (country shapes, animals with cut-outs) | shapes or masks |
| `number` | Closest guess (how tall, what year) | numeric facts |
| `connect` | Connections: 16 into 4 hidden groups | items with groups |
| `blitz60` | Name as many as you can (typed, with fuzzy match); fills a grid or map | item lists |
| `type` | Type the answer (hard mode, typo tolerant) | items |
| `chain` | Link chain: actor → movie → actor | films/cast graph |
| `lookalike` | Lookalikes: which is the X? (coral vs milk snake, hornet vs wasp) | lookalike groups |
| `listen` | Listen: 1/3/5/10 s clip → title, artist, composer, anthem, animal | audio |
| `quote` | Who said it / which book / which film | quotes |
| **Map formats** | | |
| `map-click` | Unlabelled map: tap the country, state or province | geo |
| `city-pick` | Country outline with 4 unnamed dots: where is X? Any country with ≥4 well-known cities, or a state | geo + cities |
| `continent` | Name a country → pick its continent (kids) | geo |
| `water-click` | Tap the ocean, sea, gulf or bay | marine polygons |
| `pin-drop` | Drop a pin on a landmark/city; score by km | geo + coords |
| `neighbours` | Tap every country that borders X | geo adjacency |
| `flag` | Flag → country and country → flag (also on the map) | flags |
| `capital` | Capital ↔ country | facts |

## Structures
- **Quick game:** one format, 5/10/20/custom questions (the default entry point)
- **Pub quiz:** 4–8 rounds, each a different format/theme (picture round, music round, map round, final); one double-points **joker** round per player; builder or "surprise me"
- **Survival:** 3 lives
- **Blitz:** 60 s
- **Ladder:** 15 rising questions with lifelines (50/50, skip, hint)
- **Daily:** the same 10 for everyone (date-seeded), with a shareable result grid; separate daily map and daily music challenges
- **Pass and play:** 2–8 named players take turns on one device
- **Duel:** two-player buzzer in landscape, one half of the screen each
- **Online room:** host shares a link → joiners type a name → lobby → synced questions with a live scoreboard
- **Challenge link:** "beat my score on this exact set". Async; anyone opening the link plays the same questions and joins its leaderboard

## Learning (Learn tab)
- **Field guide** per pack: photo grid, filters (venomous, region, size), detail card with photos, facts, range and credits
- **Flashcards** with spaced repetition (Leitner boxes) per item, built from any pack; mistakes in games feed the deck
- **Mastery map:** world and pack mastery colour in as items are learned
- **Lookalike studies:** side by side, with the key differences listed
- **Sound lab:** animal and bird calls, instruments, anthems
- **Explore map:** tap any country for facts, flag, capital and the anthem button
- The danger packs (snakes, spiders, jellyfish, mushrooms) say clearly that they are **not for real-world identification**

## Media policy
- Images are hotlinked from their source (Wikimedia Commons, iNaturalist open data), at sizes ≤ 640 px, using
  URLs verified at build time by `tools/linkcheck.mjs`. Anything that fails twice in a row is mirrored into
  `media/` (resized to ≤ 640 px, as webp/jpg) by `tools/mirror.mjs`. Every image and sound carries a credit and
  licence, shown via an ⓘ on the item and on the Credits page. CC-BY-SA, CC-BY, CC0 and PD only (no NC/ND).
- Before a round starts, the client **preflights** every question's media (progress bar). A failed item is swapped
  for a spare in single player; in an online room the host preflights before publishing the set.
- **Music:** Apple iTunes previews (30 s, streamed from Apple, never stored); we play 1/3/5/10 s from a random or
  chosen offset. Each answer reveal shows the artwork and a "Listen on Apple Music" link. Track IDs are resolved at
  build time; previewUrls are re-resolved at runtime via the iTunes lookup (JSONP or server proxy) if stale.
- **Public-domain music:** piano synth playing public-domain sheet music (Mutopia/IMSLP-derived MIDI → our compact
  note JSON, played through a CC-BY sampled piano such as Salamander Grand); PD/CC recordings from Wikimedia
  Commons/Musopen; US Navy Band anthems (US-government public domain); animal calls from xeno-canto (CC-BY/CC-BY-SA only).
- **Lyrics:** only short fragments of a few words ("finish the line"), or full text for public-domain songs.
- **Movies:** no free stills source without a TMDB key, so v1 movies use facts, box office, quotes, clue ladders
  and emoji plots. A TMDB stills mode is ready to switch on if a key is provided.

## Scoring
Untimed: 100 per correct. Timed: `100 + round(400 * remaining/limit)`, capped at 500. Clue ladder: points scale
with the clues left. Pin drop: `max(0, 500 - km/10)` (tuned per region size). A streak bonus of +10% per correct
answer in a row is capped at +50%.

## Accounts and multiplayer
The br8t account layer (`/lib/auth/`) provides the avatar with a non-blocking sign-in callout on menu/results
screens only. Cloud save holds stats, mastery, flashcards and settings. Online rooms and challenge links use the
Clued Go server on games.br8t.com (`/gms/2d/clued/api/*`); the Pages mirror calls the same API cross-origin.
Joining needs only a name, with no sign-in. Room codes are 5 characters.

## Difficulty and Kids mode (Aaron, 2026-10-05: first-class, not an afterthought)
- **Difficulty** Easy / Medium / Hard / Mixed on every format and structure; it filters items/questions by `difficulty`
  (1/2/3) and tunes the format (fewer answers, more clues, bigger map targets, longer timers on Easy).
- **Kids mode** is a profile toggle on the home screen (and per player in Party), not just a pack:
  - only `kids: true` packs/questions plus difficulty-1 items from any pack whose content is child-safe;
  - 2–3 big picture-first answers, no timer by default (an optional gentle one), no negative scoring or lives lost:
    a wrong answer shows the right one kindly and moves on;
  - **read-aloud** of the question and answers (Web Speech `speechSynthesis`, a tap-to-hear button, auto-on in kids mode);
  - stars/stickers collection as the reward loop, plus bigger fonts and a brighter, playful skin;
  - kid-tuned formats: picture MC, `continent`, big-country `map-click`, `sort` (dangerous/harmless), `odd`,
    animal-sound `listen`, nursery-rhyme/kids-film-theme music, simple `match` (4 pairs), `reveal` (slow);
  - a kids Daily (separate seed) and kids pub quiz (4 short rounds).
- Packs set `kids` (pack-level) and items/questions carry `difficulty`; a pack may also set item-level `facts.kids`.
  Target: every pack has ≥ 15 difficulty-1 items, so Easy always has enough material.

## Listen options (Aaron, 2026-10-05)
Player-facing options on `listen` (remembered per player): **clip length** 1 / 2 / 3 / 5 / 10 / 15 / 30 s;
**artwork** Off (only on reveal) / Blurred (sharpens as the clip plays) / On (shown as a hint, lower points).
Points scale with both: shorter clip and artwork off score more.

## Online timing (Aaron, 2026-10-05)
- Host picks **answer time** 3 / 5 / 10 / 15 / 20 / 30 s (default 10; kids default 20) and the **gap before the
  next question** 3 / 5 / 10 s or "host taps Next". Both show as visible countdowns (answer ring, then a
  "next question in 3…2…1" bar on the scoreboard). The question ends early once everyone has answered.
- The server accepts answers up to **deadline + 500 ms** (server clock) to forgive poor ping; scoring uses the
  client-reported ms clamped to [0, limit], plus server receive time as a sanity bound.
- The room create/share screen carries a light hint: play with friends you trust, because strangers on the internet
  may enjoy cheating 😉.
- **Public games** (Aaron: OK for now, since it's family-only in practice): when creating, the host picks Private
  (link/code only, the default) or Public. The Online screen lists open public games: title, themes/format,
  kids/difficulty, host name, **players waiting** and a **countdown to start** (host picks auto-start in 1/2/5 min,
  or starts manually; it shows "host will start" then). Anyone can tap to join with a name.
- **Cap: at most 5 active public games** (server constant `MAX_PUBLIC_ROOMS = 5`). When full, creating another public
  game is refused with a friendly message offering Private instead. Private rooms are uncapped (still rate-limited).
  A public room stops being listed once it starts, if late join is off, or once it ends.

## Server protection, stats and alerts (Aaron, 2026-10-05; br8t box = 845 MB RAM, 1 CPU, shared)
- **Caps** (server constants, overridable via env): public rooms 5, private rooms 20 active, players per room 16,
  live SSE connections 200 total, challenges created per day 300, request body caps. When a cap is hit, the request
  is refused with a friendly "Clued is busy, try again soon" message.
- **Protection levels** (runtime setting, changeable from the admin page; persisted):
  0 open (default) · 1 hosting needs a real br8t sign-in (Google/email, not anonymous) · 2 joining needs a sign-in too ·
  3 new rooms/challenges paused (admins exempt). The server **auto-escalates to level 1** when room creation exceeds
  a threshold (default 30 rooms/hour or 3 cap refusals/hour) and emails Aaron; it never auto-de-escalates.
- **Stats** (SQLite, per day + rolling hour): rooms created (public/private), players joined, peak concurrent
  rooms/players/connections, challenges, cap refusals, distinct hashed IPs (salted, no raw IPs stored), and
  signed-in vs anonymous hosts. Admin page `admin.html` (Google sign-in via br8t Firebase; server verifies the token
  and checks the email is in `CLUED_ADMINS`, default aaron@itmatters.mobi): today/7-day charts, live rooms, current
  level with buttons to change it, recent alerts.
- **Alerts**: email to Aaron (SMTP settings live in a server-only env file `/srv/data/clued/clued.env`, 600, never in
  the repo) on auto-escalation, any cap hit, and a daily digest only if there was unusual activity. At most one alert
  email per type per hour. Until SMTP is configured, alerts are logged and shown on the admin page.

## Serverless modes: unlimited, work on Pages (Aaron, 2026-10-05)
Anything that doesn't need our server has no caps:
- Solo, pass-and-play, duel: already local.
- **Link challenges (no server):** the link carries the GameSpec + seed + build + the sender's name and score
  in the URL hash (compressed, base64url). The receiver plays the identical generated set and gets a reply link carrying
  both scores (a chain of up to 8 names). If the build differs, warn ("questions may differ slightly"). The server
  challenge leaderboard stays as the richer option when allowed.
- **Device-hosted live rooms (P2P, wave 2 lane P2P):** the host's browser acts as the room server over WebRTC data
  channels (signalling via the free PeerJS cloud broker or similar, vendored client). Same lobby/runner/timers UI,
  ~8 players max, the room ends if the host leaves. Offered on Pages, and on br8t automatically when the server is at a
  cap or protection level 3 ("host from your device instead").

## Vote to reveal more (Aaron, 2026-10-05)
Progressive questions (`reveal`, `ladder` clues, `listen` clip length, `silhouette`, movie-moment zoom/blur) have
**stages** 0…N-1, starting at the least revealed.
- **Online/P2P rooms:** every player gets a "Show more 👀 (2/5 voted)" button. When **all connected players who
  haven't answered** have voted, everyone advances one stage at once (server/host-authoritative). As soon as **anyone
  submits a guess, voting locks** for everyone and the stage freezes. Points depend on the stage when you
  answered (earlier = more). Progressive questions get **more time**: the initial deadline = answer time × 1.5 (min 10 s), and **each successful vote extends the deadline** by max(5 s, ½ × answer time), measured from the moment the stage advances (never shortening it). Total cap 90 s.
- **Solo/party:** the "Show more" button advances immediately (the same points rule).
- **Kids:** stages auto-advance every few seconds and voting is optional.

## Background music + full screen (Aaron, 2026-10-05)
Soft PD classical background music (default on, quiet), with a 🎵/🔇 toggle on the home header and a Settings row.
It auto-pauses whenever anything with sound plays (listen questions, item audio, Learn sound/piano/anthems), ducks
under read-aloud, and resumes afterwards. A ⛶ full-screen toggle sits on the home header and in Settings (hidden where the
Fullscreen API is missing, e.g. iPhone Safari). UI: js/ui/toggles.js (manager); engine: js/audio/bgm.js (AU).

## Async progressive scoring (Aaron, 2026-10-05)
In async modes (link challenges, server challenges, solo) "Show more" works freely. The winner of each question
is whoever answered **correctly with the least revealed** (lowest stage); ties are broken by time. Show the stage used next to each
player's result in the challenge comparison ("got it at clue 2 / 3 s of music").
