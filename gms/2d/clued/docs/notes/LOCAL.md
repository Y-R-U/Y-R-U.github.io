# LOCAL — local focus, phase 1 (2026-10-13)

A game-level setting that makes a share of every round about one country. The game maker decides (solo: the player's
own Settings; rooms: the host); a player's location never matters and every player in a room gets the same questions.

## The setting
`{ cc: ISO3, level: 'off'|'more'|'most'|'all', live: bool }` — `js/core/local.js`.
- Shares per round: More 25%, Most 60%, ALL 100% (`SHARE`, `targetOf(count, level)` = round(count × share)).
- Country: auto-detected from the Intl time zone, then the `navigator.languages` region (`data/local/places.json`); no
  location prompt. Any country can be picked (sovereign states + Palestine, Taiwan, Kosovo, Vatican, HK, PR, Greenland, Macau).
- "I live here / know it well" (`live`): defaults on for the detected country, off for a picked one; toggleable.
- `clued.settings.local` stores only what the player chose (`{ level, cc?, live? }`), so an unpicked country keeps following
  the device. `mySetting()` resolves it, `saveMySetting()` writes it, `specLocal()` is the compact spec form (undefined = off).
- Where it applies: `specFor` (quick, survival, blitz, ladder, party, duel), the pub quiz, server rooms and P2P rooms
  (`spec.local`, from the host screen). Not the daily (everyone's daily stays identical) and not kids-only presets beyond
  what the setting says (kids games use it too).
- Host screen: its chip edits the host's own setting too; loading a saved set that has a `local` field applies it to that
  hosting session only (sets without the field keep the current focus). Saved sets and the podium's "Save these rounds"
  store it. Lobby shows `📍 Japan focus · Most` (badge `data-badge=local`) to every player.

## How a round is built (`js/core/spec.js` → `buildQuestions`)
1. "All themes" with a focus also pulls in up to 4 packs that hold local questions (`packHasLocal`).
2. `live`: `easeView(pack, cc)` rates the focus country's items/questions one step easier (3→2→1) — ONLY those; every
   other item keeps its rating (Aaron's ruling). Kids mode then filters as usual, so a medium local item can reach kids.
3. The normal `generate()` runs unchanged. Then extra local candidates: `generate()` on each pack's `localView` (its local
   items + up to 2× other items as wrong-answer fodder, lookalikes first; local pack questions only), plus in-country
   geography for mc/tf/number/map-click rounds on All themes, Countries, Capitals, or any map round.
4. `mixRound` picks min(target, local pool) local questions, fills the rest from the normal list, tops up with more local
   if the normal pool runs short (never repeats), shuffles, and marks chosen local ones `q.loc = 1`. Duplicates the game
   already holds are dropped before choosing, so the share survives the dupKey dedupe.
5. With the focus off nothing changes (unit test: identical question ids).

"Local" = `isLocalQ(q, cc)`: `q.data.local` (in-country questions), a map-click state question of that country, the
country itself on a world map, or the subject ref (`refs[0]`) tagged with cc. Formats that are about every ref
(order, hilo, match, sort, connect, odd, chain) need at least half their refs local.

## Tags (`tools/local_tags.mjs` → `data/local/tags.json`, a sidecar; packs are never edited)
`{ packs: { packId: { i: { itemId: ISO3 | [ISO3…] }, q: { questionId: … } } }, cont: { ISO3: continent } }`. Rerun after
any pack change (CONTENT's new questions included): `node tools/local_tags.mjs` (deterministic, offline).
- Items: facts `country / nationality / nation / origin / wcHost / winner / iso3`, `host` (sport host city → country),
  `region / found` when it is a country (Australian snakes, NZ birds), the countries/flags item itself, single-country
  currencies and languages, author/artist/composer → the person's nationality (people/actors/artists/explorers/leaders/
  music-artists), words by language of origin (Japanese → JPN, Guugu Yimithirr → AUS; Arabic/Latin/Old Norse untagged),
  history item names by text match.
- Questions: a single `refs` item; else the item named by the answer (or uniquely in the prompt); a person answer; plus
  a name/demonym/place match over prompt + answer (never the wrong options; order questions use the prompt only).
- Precision rules (`tools/local_names.mjs`): case-sensitive; longest phrase first; stop phrases masked first (Indian
  Ocean, French fries, Guinea pig, New Mexico, German shepherd…); demonyms don't count in language questions ("the French
  word for", "in which language"); "English" counts only before king/club/port…; ambiguous names (Turkey, Georgia,
  Jordan, Chad, Holland, Israel, Paris…) need country context, special rules (Georgia needs Tbilisi/Caucasus and no
  US-state words; Jordan not with basketball/River) and are dropped when they look like a person ("Michael Jordan",
  "Tom Holland"). Up to 3 countries per question.
- Known misses (accepted): a false tf statement can name the wrong country ("ABBA came from Norway" → NOR); a place named
  as an event location tags it (Chicago marathon → USA).

## In-country geography (`data/local/geo.json`, `js/core/localgeo.js`)
Built by `node tools/local_geo_build.mjs` (network: one Wikipedia population list per country, pinned by revision id in
`sources`, + Wikidata P36 capitals with overrides in `CAPITAL_FIX`), validated by `--check` (also run by local_test):
every state has a capital (US-DC deliberately none), no duplicates/suburbs (`NOT_A_CITY`, Tokyo's 23 wards; a city within
15 km of a bigger one in urban-area lists, 10 km of one twice its size elsewhere, `SEPARATE` for real neighbours),
populations 10k–40M and not wildly off Natural Earth, plus hand spot checks for AUS (8 capitals incl. Hobart, populations,
states, Cranbourne absent) and six US capitals.
Countries: AUS (ABS significant urban areas 2025), USA (cities 2025), CAN (population centres 2021), NZL (urban areas 2025,
no states — city questions only), GBR (ONS built-up areas 2021 + Scotland 2020 + Wales; 4 nations), IND (cities ≥1M,
2011 census), JPN (cities 2020; Tokyo = 23 wards), DEU (2021), FRA (communes 2023), BRA (municipalities 2025).
Questions (formats mc/tf/number/map-click, `data.local = cc`): capital of a state; "X is the capital of which state?"
(skipped when the name gives it away or two states share a capital); which state a city is in (skipped when the city is
named after its state, and DC); "Which has more people: A or B?" (only pairs ≥1.5× apart, so other ways of counting can't
flip it); "About how many people live in the X urban area / the city of X?" (number, log scale); tap a state; "Which
state is highlighted?" (map-click name mode — `renderName` skips the country reveal card for states). Ratings: capitals 1
if the capital is the state's biggest listed city else 2 (+1 for small states in big countries), cities by rank (top 5 =
1, top 15 = 2, else 3), map by area; "I live here" eases them one step.

### Adding a country
1. Add `SOURCES[ISO3]` in `tools/local_geo_build.mjs`: page title, a header regex that finds the table, column indexes
   (name, state, population), min population, year, and `kind`/`phrase` ('urban' → "the X urban area", 'city' →
   "the city of X"). States come from `data/geo/states.json` (needs M's shapes for map questions; without them, city
   questions only, like NZL).
2. Run it; fix `STATE_ALIAS` (spelling differences), `CAPITAL_FIX`, `NOT_A_CITY` / `SEPARATE` until `--check` is clean;
   eyeball the dump (names, capitals, top cities) — locals spot errors instantly. Add spot checks if you know the country.
3. `node tools/local_test.mjs`, `node tools/local_report.mjs`.

## UI (`js/ui/local.js`)
- `localChip(get, set, onChange)`: "📍 Japan focus · Most · 🏠" → popup editor (country search list, Off/More/Most/ALL,
  I-live-here switch). In Settings › Local focus, the solo setup screen (above the options), the pub quiz builder and the
  host screen (`.loc-bar`).
- `localLine(round, local, { count, onKeep, onChange })`: "📍 6 of 10 local", or when short "📍 only 2 of 10 local: the rest
  will be normal questions" with Keep / Change round (card gets `.loc-short`; Keep sets `round.localOk`). Counts come from
  `planRound` = a real `buildQuestions` of that round (fixed seed, cached per round+setting).
- `localTotal`: "📍 38 of 50 local" on the host summary and the pub quiz (count × players).
- Theme picker: `📍 N` per pack (`packLocalCount`: generate() on that pack's local view for this format and mode, capped
  60+; Countries/Capitals include in-country questions for mc/tf/number).

## Tests
- `node tools/local_test.mjs` — 25 trap/real tagging phrases, sidecar sanity, shares hit target in 5 country/level ×
  2 seeds × 4 rounds, off = unchanged, easing only for the focus country, spec JSON round trip + determinism, every
  in-country question (≈1,800) checked for correctness, sanitizer, giveaways; geo validator incl. planted errors;
  detection; multi-ref rule. Falsified: removing the Indian Ocean stop phrase, under-picking local, or easing everything
  each fail it.
- `CDP_PORT=9550 node tools/local_e2e.mjs OUT` — Settings chip → Japan · Most → host screen line + picker counts → Snakes
  round warns "only 0 of 10" → Change round opens the editor → Keep clears → device room → badge for all 3 players →
  4 questions, identical prompts on all three. Uses ports CDP_PORT, +1, +2 (PeerJS broker, internet).
- `node tools/local_report.mjs` → `docs/notes/LOCAL_COVERAGE.md` (~3.5 min).

## Requests / open
- Server (not deployed, not changed): rooms already store `spec` as raw JSON, so `spec.local` reaches every player with no
  server change. Only the PUBLIC room list lacks it: `server/roomhttp.go` `specSummary`/`pubRoom` would need a
  `local: { cc, level }` field (read from the spec, validated `^[A-Z]{3}$` + level enum) and `js/net/join.js` a badge.
- Music/screen by country is the next wave (charts, local films, iTunes `country=`); not built.
- Pre-existing bug fixed in passing: the host screen's set bar printed "null" next to 💾 Save set when no set was loaded.
