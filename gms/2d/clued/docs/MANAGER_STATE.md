# CLUED — Manager state

Read this first. Claude (Opus) is MANAGER; sub-agents build in lanes (CONTRACT.md). The manager owns integration,
commits, pushes and deploys.

## Brief (Aaron, 2026-10-05)
A trivia and learning game. Everything is in v1 (full mode list in DESIGN.md). Answers to the opening questions:
- Music: Apple iTunes previews with an Apple link, YES. Also anything out of copyright: a piano synth from sheet
  music, classical, anthems, animal calls.
- Media: hotlink reliable free sources, test before the game (preflight); download (mirror) the unreliable ones.
- **No PWA yet** (caching pain during dev). Use the br8t login for auth and multiplayer.
- Name **Clued**. Host on **both** games.br8t.com and Pages (Pages may be more limited; code is checked in anyway).
- Shareable game links: someone opens the link, gives a name and joins the game.

## Standing rules
- Vanilla ES modules, no build step, `?v=BUILD`. Popups, never alert. Mobile-first portrait plus landscape. Few comments.
- :8888 site server is already running. Agents use their own CDP port (TEAM_BRIEF.md).
- Agents never touch git. The manager stages explicitly: `git add gms/2d/clued/` (+ projects.js hunk). The tree is shared and dirty.
- Don't touch lib/auth/ or games/ (other sessions have uncommitted changes there). Registering on the hub is a later manager step.
- Server: Go + SQLite `clued` on br8t :8012 (8002–8011 are taken), Caddy route games.br8t.com/gms/2d/clued/api/*, modelled on synthwild/server.

## Phases
- [x] P0 DESIGN.md, CONTRACT.md, TEAM_BRIEF.md
- [ ] P1 wave 1: A shell/framework, C1 nature packs, C2 culture packs, M maps, S server, AU audio, MV movie moments (Flux)
- [ ] P2 wave 2: F formats, L learning (after A + C land), P2P device-hosted rooms (after S lands)
- [ ] P3 integration, QA lane (adversarial playtest + fact-check sample), fixes
- [ ] P4 register projects.js + screenshot, push, deploy br8t (+ hub card), tell Aaron

## Open questions for Aaron
- (none)

## Log
- 2026-10-05 Project started; docs written; wave 1 launched.
- 2026-10-05 Aaron: skip TMDB. His idea: Flux-generated "movie moments" (e.g. Titanic = liner + iceberg) → lane MV launched (no likenesses/logos/text, house style, blind VLM guess sets difficulty; stretch: book-moments, song-pictures).
- 2026-10-05 Aaron: easy/kids mode must be first-class → DESIGN.md 'Difficulty and Kids mode' added, all lanes messaged.
- 2026-10-05 Aaron: listen options for clip length + artwork on/off → DESIGN.md, AU messaged.
- 2026-10-05 Aaron: host-picked answer time + next-question countdown, server +500ms grace, 'play with trusted friends' hint → S + A messaged.
- 2026-10-05 Aaron: public game list allowed; cap 5 active public games, refuse new when full; list shows players waiting + start countdown → S messaged.
- 2026-10-05 Aaron: cap private too, keep stats, email alerts on heavy use, login enforcement levels → DESIGN 'Server protection'; S messaged. br8t has NO outgoing mail — asked Aaron for SMTP route.
- 2026-10-05 Aaron: 'send some game modes to pages and not limit' → serverless link challenges (S) + device-hosted P2P rooms (new wave-2 lane P2P). Unlimited, no server load.
- 2026-10-05 Aaron chose ntfy push for alerts; topic in /srv/data/clued/clued.env (see memory ntfy-push); test push sent.
- 2026-10-05 C2 killed by API content filter (likely modern book first lines). Landed: countries, capitals, currencies, flags, landmarks, languages, movies(77), actors, people, leaders, explorers, artists, paintings. Relaunched as C2b (books/quotes/words/history/tv + review pass + notes; strict copyright rule) and C2c (general/kids/sport banks). COMMIT CHECK: tools/au_cache.json 19MB, tools/.c1cache, m_cache must stay gitignored.
- 2026-10-05 Lane A DONE (440/440 unit, e2e all structures 3 viewports). Relayed A's requests (factsMeta templates → C1, C2b). Wave 2 launched: F formats (9402), L learning (9404).
## QA BACKLOG (manager review)
- Reveal shrinks the media box and the photo crops to the top of the head (object-position) — keep the subject centred/contain on reveal.
- a_e2e quick FAILs when the default 7–10 s timer expires before the driver clicks (driver timing with real packs) — make e2e set timer Off.
- Sign-in pill overlaps home gear (A noted). Empty space for no-image questions on landscape/desktop (A noted).
- 2026-10-05 Lane M DONE: 7 map formats registered, world.json 184 KB, 242 features, 28 state files (dropped outdated NE states: Iran, Kenya, Indonesia, Norway, Russia, PH, VN, PK, UA), 234 flags; m_test 5433/5433, ui 65/65. CDP needs --use-angle=metal for maps. Afghanistan flag relayed to C2b.
- QA BACKLOG: Credits page must credit "Natural Earth (public domain)" (A's file); map formats need a `packless` flag so they're selectable without a geography pack (A's picker).
