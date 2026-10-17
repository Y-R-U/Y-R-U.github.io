# MUSIC lane — chart-based hit packs

Decade hit packs (`data/music/hits-1960s.json` … `hits-2020s.json`), one-hit wonders and music artists, grown from
year-end charts in the US, UK and Australia. Builds on the AU lane (docs/notes/AU.md): same `.txt` lists, same
`tools/au_resolve.mjs`, same Apple preview playback and proxy (unchanged).

## Pipeline
```
tools/au_charts.mjs   year-end charts → tools/au_lists/charts.json   (network, cached in ~/.cache/clued-au/charts/)
tools/au_pick.mjs     group songs across countries/years, score, top each year up to --per 27 → hits-*.txt
tools/au_ohw.mjs      Wikipedia one-hit-wonder lists ∩ year-end charts → one-hit-wonders.txt (+30)
tools/au_artists.mjs  acts with 3+ year-end hits → artists.txt (+40)
tools/au_wd.mjs       Wikidata: artist home country + act type (cached ~/.cache/clued-au/wd.json)
tools/au_resolve.mjs  .txt → iTunes previews → data/music/*.json + tools/au_lists/*.check.json
node tools/build_index.mjs
```
Checks: `node tools/au_test.mjs`, `node tools/au_previews.mjs` (every preview answers), `node tools/leak_scan.mjs`,
`tools/au_listen_e2e.mjs` (CDP: listen rounds on three decades play every clip; needs :8888 and
`~/.claude/bin/cdp start --port 9570 -- --use-angle=metal --autoplay-policy=no-user-gesture-required`).

## Sources (charts.json `src` records the page per country and year)
| Country | Years | Depth | Source |
|---|---|---|---|
| US | 1960–2025 | 100 | Wikipedia "Billboard Year-End Hot 100 singles of YEAR" |
| UK | 1970–2004, 2015, 2021–22 | 20–50 | Wikipedia "YEAR in British music" / "YEAR in British music charts" year-end table |
| UK | 2005–2025 (except above) | 100 | officialcharts.com end-of-year singles chart |
| AU | 1960–1987 | 25 | Wikipedia "List of top 25 singles for YEAR in Australia" (Kent Music Report) |
| AU | 1988–2025 | 50–100 | aria.com.au/charts/YEAR/singles-chart |

No UK year-end chart exists before 1970 (none was published), so 1960s songs carry `us`/`au` only.
Lasting fame = average monthly English Wikipedia pageviews of the song article (Sep 2025 – Aug 2026), from the chart
page's link. ARIA/Official-Charts-only songs have no link, so pv = 0 (they rank on chart score alone).

## List syntax
```
YEAR | Artist | Title | us=1 uk=4 au=12 pv=8100 from=GBR/AUS | d=1; am=…; tm=…; alt=a/b; kids=0; nm=apple; note=keepyear …
```
- Chart column (optional, written by the tools): best **year-end** position per country, `-` = not on that chart;
  `pv` = monthly Wikipedia views; `from` = artist country ISO3 from Wikidata (two = dual, e.g. Olivia Newton-John).
- Options (unchanged from AU, plus): `kids=0` keeps a song out of kids mode; `nm=apple` takes the song and artist
  names from Apple (rows whose only source was ARIA/Official Charts, whose casing is unreliable).
- Item data: `charts: {us, uk, au}` (present keys only), `artistCountry: 'GBR'`, `artistCountries: ['GBR','AUS']` when
  more than one. These sit on the **item, not in `facts`**: the shared schema (tools/c1_schema.mjs) rejects facts
  without a factsMeta entry and object values, and a factsMeta entry would let mc/odd/match word questions from them.
  LOCAL wave 2 ("charted in Australia", "made in …") reads `item.charts` / `item.artistCountry`. The blurb adds
  "Year-end charts: the US #1, Australia #12."
- First-release years (re-releases, re-charts, album tracks issued as singles later): see docs/notes/MUSICYEAR.md (tools/music_firstyear.json overrides the chart year in au_resolve).
- Year: the chart year, or Apple's original (non-compilation) album year when that is 1–3 years earlier in the same
  decade (December singles, album tracks released as singles later). A hand `note=keepyear` freezes it.

## Difficulty (tools/au_resolve.mjs `fameDifficulty`)
Best year-end position anywhere: top 10 → 1, top 40 → 2, else 3. Then pageviews ranked within the pack: top 15 %
→ one step easier; a top-10 hit in the bottom 45 % becomes 2, a #21–40 hit in the bottom 30 % becomes 3. A hand `d=` always wins (the curated AU rows keep theirs).

## Kids
Kids mode only sees difficulty-1 items (`kidsOk` in js/core/spec.js). Songs Apple marks `trackExplicitness`
`explicit` or `cleaned` (a radio edit of an explicit song; the US store mostly serves these, so adults hear clean edits), and titles matching `EDGY` (sex, f**k, drugs…) or `kids=0`, are floored to difficulty 2 and carry
`explicit: true` / `kids: false`. Artists: explicit previews are dropped when the act has a clean one; an all-explicit
act is floored to 2. **Request to LOCAL / manager:** make `kidsOk` return false for `x.kids === false`; then the floor
could go and explicit hits could count as easy for adults again.

## Picking rules (au_pick)
- One song = same title (first side of a double A-side, remix tags stripped) + same act (shared name token) within
  2 years, across US/UK/AU. Song year = earliest year-end appearance; Apple's year must be within 1 (au_resolve).
- Score = Σ over countries (1 − (rank−1)/100) + fame (log pageviews). UK and AU count as much as the US.
- Re-entries are skipped: reissues, Christmas songs and TikTok revivals (same song charted 3+ years earlier).
- Existing curated rows always stay; each year is topped up to 27 so Apple drops leave ~25.

## One-hit wonders (au_ohw)
Wikipedia US (Billboard top 40) and UK lists, kept only when the song made a year-end chart, the act has no other
song on that country's year-end chart, no other UK top-10 single (Wikipedia "List of UK top-ten singles in YEAR"),
and — if listed in one country only — no other year-end hit anywhere. pv ≥ 2,500.

## Adding things
- **A song:** add a row to the right `hits-*.txt` (chart column optional; without it the difficulty is `d=` or 2), run
  `node tools/au_resolve.mjs hits-1990s`, check its `.check.json` (dropped/offby), `node tools/build_index.mjs`,
  `node tools/au_test.mjs`, `node tools/leak_scan.mjs`.
- **More songs per year:** `node tools/au_pick.mjs --per 30` (keeps every existing row, adds the next best).
- **A new country chart:** add a fetcher in `tools/au_charts.mjs` (return `{ rows: [[rank, title, artist, titleLink?,
  artistLink?]], src }`), add its key to `COUNTRIES` in au_pick.mjs and to `parseChart`/`chartLine` in au_resolve.mjs,
  rerun charts → pick (it fills the new column on existing rows) → resolve. For that country's own hits, Apple's
  matching store is a `country=` search fallback in `resolveSong` (AU is already there).

## Status (2026-10-13)
| Pack | Before | After | d1/d2/d3 | not for kids (explicit/edgy) |
|---|---|---|---|---|
| hits-1960s | 55 | 250 | 90/153/7 | 0 |
| hits-1970s | 58 | 250 | 97/141/12 | 4 edgy |
| hits-1980s | 62 | 261 | 105/146/10 | 4 edgy |
| hits-1990s | 56 | 258 | 89/158/11 | 4 explicit + 3 edgy |
| hits-2000s | 61 | 262 | 75/170/17 | 54 explicit |
| hits-2010s | 56 | 266 | 91/149/26 | 54 explicit |
| hits-2020s | 48 | 152 (2020–25) | 37/98/17 | 63 explicit |
| one-hit-wonders | 34 | 62 | 29 easy | |
| music-artists | 86 | 126 | 35 easy | 8 explicit previews left out |

Dropped songs and why: docs/notes/MUSIC_DROPPED.md (≈100 of ~1,770 rows; YEAR, NO MATCH, SAME TITLE).
Payload: each decade pack is ~310–340 KB JSON (~52 KB gzipped), hits-2020s 197 KB; packs load on demand, so no split
is needed. If it matters later: the audio objects repeat `credit`, `license`, `page` (= apple.url) and `dur`; deriving
them at load time would cut ~35 %.
Tests: au_test all passed, au_previews 2129/2129, leak_scan 0 (added `think`, odd's own prompt word, to its STOP list),
f_test, a_test, suggest_test 90/91 (the failure is map-click geo, not music), au_listen_e2e 24/24 (1960s/1990s/2020s).
Headless audio gotcha: coreaudiod at ~360 % CPU (many headless Chromes) slowed the AudioContext clock to ~6 % speed;
clips sat at "Listening…". `--clip 1 --wait 45` passes.

## Requests
- LOCAL / manager: `kidsOk` (js/core/spec.js) should return false for `x.kids === false`; then the difficulty-2 floor
  for explicit songs could go.
