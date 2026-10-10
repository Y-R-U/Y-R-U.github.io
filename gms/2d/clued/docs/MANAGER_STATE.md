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
- 2026-10-05 Lane S DONE: server live (games.br8t.com/gms/2d/clued/api), ~10 MB RSS, caps/levels/stats/ntfy alerts, admin.html, link challenges, transport interface; 18 Go tests + e2e green. Manager fixed A's route() to keep non-join params. Checkpoint commit af91927c (local, not pushed). P2P lane launched (9411–9413).
- SMTP untested (no creds; ntfy is primary). Ship admin.html with static deploy.
- 2026-10-05 Aaron idea: vote-to-reveal-more (all vote → next stage; first guess locks votes) → DESIGN + CONTRACT 'Progressive stages'; messaged F, AU, P2P, S (S resumed for server + runner hooks).

## RESUME (on "continue" after the usage limit, expected ~4am 2026-10-05/06)
Lanes running when the limit hit (status per docs/notes/<lane>.md; a limit-killed agent leaves partial work on disk):
- DONE: A (shell), M (maps), S (server; RESUMED for vote-to-reveal: server vote/stage/lock + runner hooks + scoring multiplier)
- RUNNING: C1 nature packs, C2b books/quotes/words/history/tv + C2 review pass (+ factsMeta templates, Afghanistan flag),
  C2c general/kids/sport banks, AU audio (+ listen options, progressive clip), MV movie moments (Flux; resumable via
  tools/mv_state.json), F formats (+ progressive stages), L learning, P2P device rooms (+ vote/stage/lock).
On resume: for each lane, read its notes file + `ls` its files; relaunch any killed lane with "continue from your
notes; don't redo finished work" in the SAME turn (never ask Aaron). Then P3: QA lane (adversarial playtest at three
viewports, a fact-check sample of 100 random questions, link check of all media) + integration fixes from QA BACKLOG,
a_bump BUILD, commit, then P4 (projects.js + screenshot, push, STATIC=1 server/deploy.sh to games.br8t.com, hub card
in games/js/games.js ONLY if that file is no longer dirty from another session, otherwise ask Aaron).
- 2026-10-05 Aaron: progressive questions get more time (×1.5, min 10 s) + each successful vote extends the deadline by max(5 s, time/2), cap 90 s → S, P2P messaged.
- 2026-10-05 Lane C2c DONE: general 587, kids 249 (25 pictures), sport 150 + 120 items; c2c_test falsified; build_index 40 packs 0 errors. Relayed its index-warning requests to C1.
- QA BACKLOG: A's mc with 4 answers finds no kids questions (only 2 wrong) — fall back to 3 answers; theme picker should filter general questions by `tags`.
- 2026-10-05 Aaron: soft background classical (auto-pause for sound) + full-screen toggle. Manager wrote js/ui/toggles.js + home/settings/main hooks; AU building js/audio/bgm.js.
- 2026-10-05 Aaron: async progressive = correct with least revealed wins (DESIGN 'Async progressive scoring'). NOT yet sent to lanes (S owns challenge compare UI). UNVERIFIED: manager's toggles.js/home/settings/main edits — boot-test home first on resume.
- 2026-10-05 Lane C2b DONE: books 90, quotes 82 speakers/155 q, words 70, history 112, tv 53; review pass fixed 10 packs that build_index was silently dropping; 46 packs indexed 0 errors. Request for M: skip flagDisputed in flag-map.
- 2026-10-05 Lane AU DONE: 17 music packs (hits by decade, artists, themes, kids, one-hit wonders, classical piano, nursery, 173 anthems, recordings, instruments), Salamander piano 2.5 MB, listen format (stages, artwork, clip length), bgm.js (auto-pause via patched HTMLMediaElement.play + speech duck). Apple CORS works, no proxy needed.
- 2026-10-05 RESUMED after limit (~4am): S (vote + AU runner requests + async rule), P2P, L, C1 (+ index data/music with path), F, MV all resumed via SendMessage. Manager: packs.js loads index `path` (data/music) + dev scan of music/; flag-map skips facts.flagDisputed; home boot verified (toggles OK); 📅 emoji (always "JUL 17") replaced with a live date badge.
- 2026-10-05 Lane C1 DONE: 23 packs, 1,160 items, 413 q; c1_test 109/0; 62 packs indexed 0 errors; 2,750 media URLs OK; 79 animal calls. Additive fields documented in CONTRACT.
- 2026-10-05 Lane L DONE (field guide, Leitner flashcards, mastery + map, lookalikes, sound lab, explore; 50/50 tests). Manager: installed learn/hook at boot, fixed home 'null' text, refs[0] rule in CONTRACT. Resumed C1 (lookalike differences, lion photo) and AU (anthem iso3).
- 2026-10-05 S vote-to-reveal DONE + deployed (21 Go tests; RSS 12 MB); runner: shared Show-more button, destroy between questions, prepareFormats, online opts; async per-question stage comparison in challenges. Final shape relayed to P2P.
- 2026-10-05 C1 follow-up DONE: 115 lookalike differences notes (both directions, tested), lion photo replaced.
- 2026-10-05 P2P DONE: PeerJS cloud signalling, ?p2p=CODE, 96/96 logic, 39/39 3-browser e2e on real broker, 20/20 joins (median 3.3 s); no TURN → symmetric NAT / client-isolated wifi fail with clear message. AARON CHECK: two real phones same wifi + one on 4G.
- 2026-10-05 AU follow-up DONE: anthems iso3 (173), tested.
- 2026-10-05 Lane F DONE: 16 formats (match, ladder, hilo, order, odd, sort, fake, reveal, silhouette, number, connect, blitz60, type, chain, lookalike, quote), f_test 1.69M checks, e2e 3 viewports. P2 complete except MV.
- 2026-10-05 P3 launched: lane I (integration: all requests + QA BACKLOG + whole-app click-through, CDP 9420, owns shell + build_index) and lane QF (fact-check 300 generated + 150 hand-written questions, media linkcheck + contact sheets, bees face photo; data only).
- 2026-10-05 QF DONE (generated-question error 3.3% → 0.7%; hand-written 0/230; 141 photos rejected incl. the bees face; linkcheck 4,158 OK). I DONE (all fixes, caps.formats truthful availability, all suites green).
- 2026-10-05 SHIPPED: registered in projects.js + assets/screenshots/clued.jpg, pushed (BUILD 202610050144), live at yru.br8t.com/gms/2d/clued/ (Pages custom domain!) and games.br8t.com/gms/2d/clued/ (manual rsync excluding unreviewed media). Fixed API base (hostname === games.br8t.com) + CLUED_ORIGINS in box env incl. http(s)://yru.br8t.com. Landscape layout needs ≥640px (540px overflowed). MV stopped by manager to save weekly quota.

## NEXT (week of 2026-10-06)
1. Hub card in games/js/games.js — that file was dirty from another session; check `git status games/` first or ask Aaron.
2. QF "For lane I" generator rules (docs/notes/QF.md): BC years "-323", IUCN questions in kids mode, `type` asking for bin values, lname mid-sentence in hilo/number, "the" before {value} countries, highest/lower wording for sizes/time, match lower-casing labels, sort "or" wording, pack.noun singular/plural, nested-value guard in connect/odd.
3. I's open issues (docs/notes/I.md): portrait map empty ocean bands, landscape reveal card over bottom continent buttons, desktop continent buttons to panel edge, slow Wikimedia emptying picture rounds; I's "For QF": "Unknown authorUnknown author" credits (~37), snow-leopard tail photo, anthems "Insular Oceania" continent, Tiny Tim quote attribution.
4. MV stretch: media/song-pictures + media/book-moments (113 images) generated but UNREVIEWED, no pack files, gitignored + excluded from rsync. Resume MV to review/finish or delete.
5. Aaron real-device checks: P2P rooms (two phones same wifi, then one on 4G), audio on Android (piano, Apple clips, bgm), server room via share link.
6. Static deploy = rsync command above (server/deploy.sh STATIC=1 would also ship unreviewed media; fix its excludes).
- 2026-10-06 Aaron feedback round 1: (4) kids picture labels leaked answers → fixed + shipped (css only). Agents: FAV (♥ + 5 slots per format, quick-pick, synced clued.favs; CDP 9430) and GEO2 (continent-for-city tiers dot/line/name; neighbours → multi-select + 'how many' mc, visual only for kids with big targets; answer-leak audit all formats; CDP 9431).
- 2026-10-06 FAV DONE (♥ + 5 slots per format in optionsPanel → setup/pubquiz/host; kids slots separate; synced clued.favs; fav_test 46/0, fav_e2e 25/25). Ship together with GEO2 + BUILD bump (mixed-module risk if shipped unbumped).
- 2026-10-06 GEO2 DONE (continent tiers dot/line/name + cities pool; neighbours pick/how-many/kids-tap with fairness rules; leak audit fixed Duel + kids listen covers + read-aloud; kids flag now reaches map formats). Shipped with FAV.
- 2026-10-07 iPhone music silent (speech OK) → navigator.audioSession.type='playback' + silent <audio> keep-alive for older iOS (js/audio/ctx.js). Shipped BUILD 202610071242. CONFIRMED working on Aaron's iPhone 2026-10-07.
- 2026-10-07 Audit: no unfinished packs; greyed = pack/format pairs < 5 questions (caps.formats). Decision: HIDE unusable pairs (+ quiet 'N more topics don't suit this game'), FILL natural gaps with data. Agents: FIN (picker hide, QF generator wording rules, I's map/preflight issues, pub quiz Surprise me favourites; CDP 9440) + GAPS (content enrichment, before/after usable-pair table). Hub card still blocked: games/js/games.js dirty from another session.
- 2026-10-07 FIN DONE (picker hides unusable packs + '+N topics don't suit' list; QF wording rules; IUCN Hard-only/never kids; portrait map fit; landscape continent reveal; slow-Wikimedia preflight; Surprise me uses favourites). Shipped mid-GAPS (data consistent, all tests green).
- 2026-10-07 GAPS DONE: usable pairs 682/759 → 738/771 (picker rule 696 → 749). Shipped. Remaining code requests → FIN resumed (connect single-value flake, listen kids-nature, mass-noun 'a', fill() comma lower-casing).
- 2026-10-07 Shipped BUILD 202610071336 (4 follow-ups; a_e2e portrait green). Aaron round 2: 'what is the from [artist]' (facts without templates → generic fallback), match reveal off-screen on phone, online multi-round setup (add round, favourites, 10 per round). Agents: POLISH (wording audit + inline reveal; CDP 9450) and ROUNDS (online round builder, server+P2P; CDP 9451–9453).
- 2026-10-08 Hub card LIVE on games.br8t.com (committed only my hunk; another session's RAGDOJO card left uncommitted/undeployed). Share links (join/p2p/challenge/link-challenge) always games.br8t.com; Pages home shows a link there; projects.js tile → https://games.br8t.com/gms/2d/clued/. Firebase authorised domains lack yru.br8t.com (Aaron to add). ROUNDS DONE (host round list, favourites-first picker, round cards, per-round scores; server deployed, back-compat); manager: favourite rounds use the round default count (10 online, 6 pub quiz). Client ships with POLISH.
- 2026-10-08 POLISH DONE (wording sweep 2,697 → 0 flagged over 534k prompts; inline result line for tall formats on phone; portrait map card under buttons). Shipped with ROUNDS: BUILD bump, a_e2e portrait 11/11.
- 2026-10-08 Aaron: online music rounds occasionally auto-answered for both at round start; faster player sometimes scored less. DB snapshot (rooms 4XG4W/KN6BU/UNVDC) in scratchpad/forensics → TIMING agent (forensics + fix + score breakdown on reveal; CDP 9461–9463; may deploy server).
- 2026-10-08 Aaron rulings: streak bonus becomes a setting (Adds points / Just for show, ⓘ; room-level online). Listen 'Grow the clip' REMOVED (slow/confusing; replay is the way to hear more) — music plays exactly the chosen clip length; vote-to-reveal stays for reveal/ladder/silhouette. All sent to TIMING agent.
- 2026-10-08 Aaron: flashcards Review mixed everything (auto-added game misses) + name→same-name cards for songs. CARDS agent (CDP 9470): study selected packs only, multiple-choice default + Flip mode, media-based fronts (picture/▶ clip/redacted clue), never answer-on-front test, missed-question auto-add scoped/optional.
- 2026-10-08 Aaron: home stats line only counted solo games, unexplained. STATS agent (CDP 9480): recordGame for every mode incl. online/P2P/challenges/flashcards, compact synced history, stats page with explanations, rotating tappable home highlight. Running in parallel with TIMING + CARDS (minimal hook edits in their files).
- 2026-10-08 Manager: Online tile blurb 'Start a room or join by link' + '🟢 N live' badge (home.js fetch of /rooms/public); online hub chip '🟢 N public games open' above the globe → scrolls to Public games (join.js, net.css). Tested with mocked rooms. Ships with TIMING/CARDS/STATS batch.
- 2026-10-08 CARDS DONE (study selected packs, MC default + Flip, face.js media/redacted fronts, cards_test 5,777 cards 0 leaks, l_test 60, l_e2e 3 viewports). Asked STATS to wire recordStudy. Waiting on TIMING + STATS to ship batch.
- 2026-10-08 STATS DONE (recordGame every mode incl. online/challenges/study; stats page; rotating home highlight; migration keeps old totals as 'earlier games'; 63 unit + 27 e2e + room e2e). Waiting on TIMING.
- 2026-10-08 TIMING DONE + server deployed. Findings: (1) stale host Next ended the NEXT question at its countdown → both 'time up' (fixed: Next names its question); (2) all 3 'faster scored less' cases = streak bonus (+ media-load and clock-offset unfairness fixed: ready-gate ≤5 s, ms clamp −1.5/+0.3 s, server-side listen factors); (3) Grow on by default → 1 s clips (removed). Streak setting: online default 'Just for show'. Breakdown on every reveal. Manager renamed my chip to .net-livechip (collided with reveal box). TIMING agent updating e2es for fav=10 + full pre-ship suite.
- 2026-10-08 Full pre-ship suite green (all node suites + a_e2e p/l, l_e2e, stats_e2e, s_room_e2e 54 + timing 22, rounds_p2p 11, p2p 39). SHIPPED timing/scoring + streak setting + grow removal + flashcards rework + stats + online badges.
- 2026-10-08 iPhone audio stopped after app switch: unlock listeners removed themselves after first tap; iOS resumes only in a gesture → listeners now permanent (wake on every tap if ctx not running, re-assert audioSession, restart keep-alive), plus pageshow/focus resume. Shipped; awaiting Aaron's confirmation.
- 2026-10-08 Aaron: picture round pixel/tiles no good; Full image default, Zoom only alternative; vote-to-reveal too slow online. Ruling (manager reading, CONFIRMED by Aaron): NO voting online for any format — ladder/silhouette auto-advance like kids rooms; Show more stays solo only. SIMPLE agent (CDP 9490–9493; may deploy server).
- 2026-10-08 SIMPLE DONE + shipped: Picture round = Full (default) / Zoom (timedZoom, full at 50/65/80/90%, default 80); no voting online — ladder/silhouette auto-advance (window max(1.5×T, 10 s, stage need), cap 90, fixed deadline; first answer no longer freezes stages, incl. kids); Show more solo only.
- 2026-10-10 Edge: music only first clip → defensive fix (listen teardown stops only its own clip; superseded play() never stops the newer clip). NOT reproduced in Chrome solo (normal + fast answering, both versions OK) — asked Aaron solo/online + ▶ behaviour. Background music now DEFAULT OFF (bgmChosen migration: legacy saved-on → off until user taps). Shipped.
- 2026-10-10 Aaron (Android): buttons (Flashcards etc.) sometimes dead until refresh. Prime suspect: stale ES modules across today's many deploys (dynamic import rejects silently). DEADTAP agent (CDP 9500): verify + fix stale-module handling with 'updated · tap to refresh' banner + version check; overlay audit; nav-lock robustness; rapid-tap stress.
- 2026-10-10 Aaron: music only-first-clip again on Windows Edge (after the defensive fix). DEBUGLOG agent (CDP 9510): server-switchable remote client logging (admin toggle + ?debug=1), heavy instrumentation of listen/clip/ctx/apple/bgm/runner; then Aaron retests with logging ON, manager reads logs over ssh, fix, switch OFF.
- 2026-10-10 DEADTAP DONE: real cause = duplicate app.js instance after a deploy (server ignores ?v=, lazy module imports NEW app.js with empty state → go() throws silently); also failed lazy import cached as null forever. Fixes: shared __cluedNav state, go() tokens + inline Retry, update.js (lazyImport retry, update banner, version check), net.js retry. deadtap_e2e stale 16/16, netfail 11/11, 570-tap stress. Overlays + nav locks ruled out. Lead for music: duplicate ctx.js → second never-unlocked AudioContext → told DEBUGLOG to log module instances/contexts. Ship with DEBUGLOG.
- 2026-10-10 DEBUGLOG DONE (server flag only, deployed OFF; client debuglog.js w/ module-instance + AudioContext tracking). Shipped DEADTAP + DEBUGLOG client. Flag turned ON for Aaron's Edge/Android retest — TURN OFF after (ssh br8t 'clued debuglog off').
- 2026-10-10 Debug flag ON (correct cmd: ssh br8t 'cd /srv/apps/clued && CLUED_DATA=/srv/data/clued ./clued debuglog on|off|status|dump'). Bare 'clued' without CLUED_DATA writes ~/data/clued.db (stray; removed).
- 2026-10-10 Aaron: needs to clear rooms he created and left. Admin page Close exists (told him). MYROOMS agent (CDP 9521–9523): 'Your rooms' on Online hub (Rejoin/End/Leave), host Leave vs End choice, Done ends finished rooms, 20-min abandoned-room expiry, admin 'close all finished/abandoned'. Avoids audio/debuglog files (flag ON).
- 2026-10-10 DEBUG LOGS SOLVED Edge: every Apple request (audio-ssl + itunes lookup/search/JSONP) fails 'Failed to fetch' after ~16 s on Aaron's Edge laptop; Wikimedia fine; one AudioContext, running, no duplicate modules. Android fine. 'First worked' = first q was a Wikimedia instrument. Asked Aaron to open Apple URLs in Edge (tracking prevention Strict / extension / AV suspected). APPLEPROXY agent (CDP 9530): 5 s Apple timeout → allowlisted server proxy (/api/preview, /api/itunes) with on-disk LRU, session memory of 'direct broken'. Debug flag still ON.
- 2026-10-10 APPLEPROXY DONE: proxy deployed (from HEAD+applepx scratch copy to avoid shipping MYROOMS); client audio files shipped selectively WITHOUT BUILD bump (no-cache revalidation). server/main.go register line still uncommitted alongside MYROOMS edits — must ship with MYROOMS. Debug flag ON for Aaron's Edge retest.
- 2026-10-10 CONFIRMED by Aaron + logs: Edge laptop (ad blocker) times out on itunes.apple.com lookups/previews; proxy serves clips (cache hits), direct artwork ok. Debug logging switched OFF (rows auto-prune in 7 days).
- 2026-10-10 MYROOMS DONE + shipped (Your rooms: Rejoin/End/Leave; host leave bar; Done ends; 20-min empty-room expiry; admin close-finished). Apple proxy verified intact after its server deploy.
- 2026-10-11 HUB REVIEW fixes shipped (BUILD 202610101826, commits 27e2c347 client/data, fc9a3acb server; server via deploy.sh RUN_TESTS=1):
  1. Stored XSS via host questions FIXED: js/net/sanitize.js cleans every room / ?c= / P2P question (string types, format+kind allowlist, https-or-same-origin URLs, < > neutralised, malformed dropped → "didn't load" card); continent options + geo button() use textContent; Apple link only https://music.apple.com/. Reviewer PoC: executed before on room, challenge and P2P paths; renders as text after.
  2. Answer leak: /q/{i} strips answer/answerText/explain/refs/wrongNotes/id from mc + tf only (the formats verifyCorrect scores) until reveal; client shows "Locked in", then refetches and run.settle() marks the board. Other formats still get answers (server trusts client claims for them, so hiding would break scoring).
  3. Hidden page suspends AudioContext + pauses streamed Apple clip; resumes when visible (ctx.js trackAudioEl).
  4. tools/c2_distract.mjs: currency options = bare units from the same region (Kuwait → Dinar/Riyal/Dirham…), languages = neighbours/same branch (+AMBIG table of widely spoken non-main languages never offered as wrong); name giveaways rated 2+ cur 54%→0, curr 83%→0, lang 28%→0, langc 46%→0 (unavoidable ones rated difficulty 1). tools/c2_gender.mjs: item.gender + same-gender distractors (He/She qs with other-gender option 71%→0); runtime distractors() prefers same gender. books first-emma redacted.
  5. Sessions drop repeated prompt+answer across packs (spec.js dupKey). 6. wrongNotes on the reveal card ("The lek is used in Albania."). 7. Phone-landscape home fits one screen. 8. Room questions stored once in rooms.questions column; state flush excludes them; pre-split rows migrate on next flush.
  Not done (not approved): player keys in ?k=, long-poll cap. Seen but out of scope: first-line questions for Alice in Wonderland / The Time Machine also name the title; s_challenge_e2e link-reply name check fails ("Player Two" instead of typed "Replier", code untouched here).

## STATE @ 2026-10-11 — all committed, pushed, deployed
BUILD 202610101826 live on games.br8t.com + yru.br8t.com (Pages); server healthy, debug logging OFF; tree clean.
Static deploy = rsync command in this log (excludes docs/server/tools/*.md + media/song-pictures, media/book-moments).
Server deploy = server/deploy.sh (builds from WORKING TREE — make sure no other lane's half-done server edits are present).
Open / optional:
- media/song-pictures + media/book-moments (113 Flux images) unreviewed, gitignored, no packs.
- Landscape: result card partly covers ladder clue list / chain portraits (POLISH note).
- Firebase authorised domains lack yru.br8t.com (Aaron to add in console; all links point at games.br8t.com anyway).
- Hub card is live; another session's RAGDOJO card in games/js/games.js is still uncommitted (theirs).
