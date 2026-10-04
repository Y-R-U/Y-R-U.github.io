# Lane M (maps): notes

## What's built
- **Data pipeline** `tools/m_build.mjs` (Natural Earth 10m, public domain) → `data/geo/`. Raw sources and mapshaper live in
  `tools/m_cache/` (gitignored by its own `.gitignore`). Hand-checked tables in `tools/m_tables.mjs` (UN list, ISO fixes,
  merges, names, continents, state groupings). `tools/m_flags.mjs` resolves flags (Wikidata P41 → Commons, licence checked).
  Rebuild: `cd tools/m_cache && npm i mapshaper` (once), then `node tools/m_build.mjs && node tools/m_flags.mjs`.
- **Runtime** (vanilla, no libraries; projections hand-rolled): `js/geo/map.js` (component), `proj.js` (Equal Earth +
  Lambert azimuthal equal-area, with inverses), `topo.js` (TopoJSON decoder), `data.js` (cached loaders), `regions.js`
  (region views, shared with the build), `style.js` (map CSS), `explore.js` (for lane L), `dev.html` (standalone harness).
- **Formats** in `js/geo/formats/`: `map-click`, `city-pick`, `continent`, `water-click`, `pin-drop`, `neighbours`,
  `flag-map` (+ `common.js`). All registered via the registry and listed in `js/formats/index.js`.

## Data files (`data/geo/`)
| file | what | size |
|---|---|---|
| `world.json` | TopoJSON, 242 countries/territories, quantised (world view) | 184 KB (56 KB gz) |
| `countries.json` | `{ISO3: {n, k, c, cs?, alt?, pop, a, bb, mb, lp, nb, d, q, st?}}` | 46 KB |
| `states.json` | `{ISO3: {l: label, s: {code: {n, a}}}}` for the 28 state views | 28 KB |
| `regions/<EU,AS,AF,NA,SA,OC,caribbean,mideast>.json` | finer country shapes per region view (lazy) | 65–185 KB each |
| `states/<ISO3>.json` | objects `states` (props id, n, lp, mb) + `context` (neighbouring countries) (lazy) | 30–160 KB |
| `cities.json` | `{c: {ISO3: [[name, lon, lat, pop, scalerank, cap?, stateCode?]…16]}, s: {stateCode: [...8]}}` (lazy) | 170 KB |
| `marine.json` + `marine-info.json` | 178 oceans/seas/gulfs/bays/straits; info `{id: {n, k, r, g?, p?, a, bb, mb, lp}}` (lazy) | 102 + 26 KB |
| `flags.json` | `{ISO3: {src, w, h, page, license, credit}}` (Commons, PD/CC0/CC BY only) | 234 flags |

Country fields: `k` kind (`s` UN member, `p` VAT/PSE/XKX/TWN/ESH, `t` territory, `x` disputed/unclaimed, never a target),
`c` continent code (AF AS EU NA SA OC AN), `cs` all accepted continents for transcontinental ones (RUS TUR KAZ GEO ARM AZE
CYP EGY), `mb` bbox of the main parts (fly-to ignores far islands), `lp` label point inside the shape, `nb` land neighbours
(shared borders at ~300 m resolution, territories included; filter by kind), `d` difficulty 1–3 (size/population).
IDs are ISO3 (`ISO_A3_EH`, fixes for France/Norway); **Kosovo = `XKX`**. Merged for tapping: Somaliland → SOM,
N. Cyprus + UN buffer zone + UK bases → CYP, Guantánamo → CUB, Baikonur → KAZ, Åland → FIN.
State views (ISO 3166-2 codes): USA CAN MEX BRA ARG CHL AUS IND CHN JPN KOR THA MYS DEU FRA(13 metro regions)
ESP(19 communities) ITA(20 regions) GBR(4 nations) CHE AUT POL SWE NLD(12) TUR SAU EGY ZAF NGA. Dropped because Natural
Earth is out of date there: Iran (no Alborz), Kenya, Indonesia, Norway, Russia, Philippines, Vietnam, Pakistan, Ukraine.

## Map API (`import { createMap } from '../geo/map.js?v=1'`)
`const map = createMap(el, opts)` returns synchronously; `await map.ready` before calling methods that need geometry.
`el` must have a size (it gets `position:relative` if static). Options:
- `region`: `'world'`, `'EU' 'AS' 'AF' 'NA' 'SA' 'OC' 'caribbean' 'mideast'`, or a state-view ISO3 (`'USA'` …).
- `target`: `'countries'` | `'states'` | `'marine'` | `'none'` (what taps resolve to).
- `playable(id) → bool` (default: the region's member countries, `set` `'states'|'un'|'all'`), `members: [ids]`.
- `style`: `'plain'` (equal colour, no names: the quiz look), `'political'` (6-colour, adjacency-aware), `'continents'`.
- `bigTargets` (bigger dots and 34 px tap assist; use for easy/kids), `dots: false` (no microstate dots),
  `dotFor: [ids]`, `interactive: false` (no gestures/controls), `controls`, `padding`, `maxZoom`, `portraitZoom: false`.
- `onTap(hit)`: `hit = { id, playable, props, lon, lat, x, y, snapped?, marker? }`. `id` is null on open water.
Methods: `setState(id, 'correct'|'wrong'|'target'|'hint'|'sel'|'soft' [+ ' pulse'] | null)`, `clearStates()`,
`setStyle(style)`, `setLocked(bool)` (no hover; double-tap always zooms), `flyTo(id | [ids] | [[lon,lat]…] | [w,s,e,n] | 'home',
{pad, maxZoom, duration}) → Promise`, `home()`, `zoomBy(f)`, `label(id, text?, {size, cls:'sea', at:[lon,lat]})`,
`unlabel(id)`, `clearLabels()`, `addMarker({id, lon, lat, kind:'dot'|'pin'|'star', label, tap})`, `markerState(id, 'ok'|'bad'|'sel'|'dim')`,
`markerLabel(id, text)`, `removeMarker`, `clearMarkers`, `addLine([lon,lat], [lon,lat])` (great circle), `clearLines()`,
`toast(msg)`, `hitTest(x, y)`, `project(lon, lat) → [x, y]`, `invert(x, y) → [lon, lat]`, `featureIds()`, `feature(id)`,
`featurePoint(id)`, `zoom` (relative to fit), `destroy()`.
Behaviour: SVG projected once; pinch/drag/wheel move a CSS transform on an over-scanned layer and commit on release
(stays at 60 fps with 4× CPU throttle); double-tap on water zooms; +/−/reset buttons. **Tap assist**: microstates and
islands smaller than ~7 px get a dot; a tap on water snaps to the only feature within 22 px (34 px big); if several are
near, the map zooms in around the tap ("Zoomed in, tap again") instead of guessing. Insets: Alaska/Hawaii (USA), Canary
Islands (ESP), Okinawa (JPN), with inverse projection through insets. Tall containers start a world map zoomed 1.7× on
its centre (pan for the rest; easy/kids maps skip this so the whole world shows).

## Explore (`import { createExplore } from '../geo/explore.js?v=1'`)
`createExplore(el, { region = 'world', onPick(iso3, props), set = 'all', search = true, style = 'political' })` →
`{ map, ready, select(iso3), destroy() }`. Tap a country (or search by name/alt) → highlighted, labelled, `onPick` fires
with the ISO3 and the `countries.json` record (state ISO codes for a state-view region).

## Formats
All take `difficulty` (0 mixed, 1 easy … 3 hard) and `opts.kids`; render also honours `api.kids`. Every render returns
`{ map, destroy, timeout, choose('correct'|'wrong') }` (+ `eliminate` on `continent`). Kids: big targets, no dots,
continent colours, friendly reveal with the flag, "Good try!" wording; the shell already reads the prompt aloud.
- `map-click` — options `region` (world, 6 continents, Caribbean, Middle East, `states`), `country` (states of …).
  Easy = big/famous (`d` 1) countries, continent-coloured map, generous taps; hard = small/obscure. States: by area thirds.
- `city-pick` — `scope` countries/states/mix, `region`. 4 spread-out dots (min spacing 12 % of the country diagonal),
  answer from the better-known cities (scalerank/pop by level). Answer = dot index (sorted west→east).
- `continent` (kids flagship) — `answers` 3/6 (kids always 3), `map` yes/no. Big coloured buttons, mini world map with the
  country pulsing; transcontinental countries are never asked.
- `water-click` — `region`. Easy/kids = the 5 oceans only; medium = oceans + seas/gulfs/bays (scalerank ≤ 2); hard adds
  straits/channels/sounds. Sub-seas count for their parent (Adriatic → Mediterranean, Sargasso → Atlantic).
- `pin-drop` — `what` mix/cities/landmarks, `region`. Landmarks from C2's `landmarks` pack (`geo.lat/lon`, `lname`), cities
  from our data. Tap places/moves a pin, "Drop pin here" confirms (kids: first tap). Points `max(0, 500 − km/10)` world,
  `km/4` regions; "correct" within 400 km (world) / 200 km (region), doubled on easy; partial points otherwise.
- `neighbours` — `mistakes` 1/3/5. Countries with 2–6 (easy), ≤ 9 (medium), ≤ 15 neighbours among UN+observer states.
  View zooms to the country + its neighbours. Partial credit `(found − 0.5·wrong)/total` via `{partial, points}`.
  Surprising borders get an explain line (France–Brazil via French Guiana, Spain–Morocco via Ceuta/Melilla, Kaliningrad…).
- `flag-map` — `region`. Uses C2's `flags`/`countries` pack image when present, else `flags.json`. Afghanistan is never
  asked (the Wikidata/Commons flag is the Taliban one; contested).
`supports(info)`: any `geography` (or `kids`) theme pack hosts the map formats; questions come from `data/geo`.
`refs` point at `countries/<item id>` (matched on `iso3`) when C2's countries pack is loaded.
Geo index (`countries.json` + `states.json`, ~75 KB) is loaded with top-level await in `common.js`; `city-pick`/`pin-drop`
also await `cities.json`, `water-click` the marine files, `flag-map` `flags.json`, so `generate()` can stay synchronous.

## Testing
- `node tools/m_test.mjs` — data integrity (5433 checks): all 193 UN members with geometry/continent/name, symmetric
  adjacency, known borders and non-borders (China 14, Russia 14 sovereign neighbours), subdivision counts and names,
  cities inside their country, state city lists, marine names, file-size budget, flags + licences. Verified to fail on a
  corrupted copy (`node tools/m_test.mjs <dir>`).
- `node tools/m_ui_test.mjs [--shots DIR]` — needs `~/.claude/bin/cdp start --port 9403 -- --use-angle=metal` (the
  software renderer is so slow that taps time out). Real touch/mouse taps at 384×854, 854×384 and 1280×800: France,
  Brazil, Australia, Singapore, Malta (direct and 9 px off), San Marino, Victoria, Tasmania, California, Rhode Island,
  Alaska (inset), Karnataka, Goa; pinch, drag, double-tap; every format answered by tapping; a wrong tap scores wrong.
  65/65 pass.
- Manual: `http://localhost:8888/gms/2d/clued/js/geo/dev.html` (`?fmt=map-click&region=EU&difficulty=1&kids=1&seed=x`, or no
  `fmt` for the bare map viewer; `fmt=explore` for the explore map).

## Credits / licences
Map data: **Made with Natural Earth** (public domain), naturalearthdata.com. Flags: Wikimedia Commons, per-file credit,
licence and page in `data/geo/flags.json` (227 PD, 6 CC0, 1 CC BY 2.5); questions carry them in `media.img` so the
shell's credits/preflight see them.

## Open issues
- Marine polygons are Natural Earth label areas: a few open-ocean corners (far Pacific/Southern edges of the Equal Earth
  outline) are not covered; taps there snap to the nearest water body or do nothing.
- Natural Earth's Western Sahara/Morocco, Kashmir and Crimea follow its de-facto view; Kashmir's Siachen, Bir Tawil and
  the Patagonian ice field are grey "disputed" land, never targets.
- Oman has no flag in `flags.json` (Commons file is OGL); Palestine and Western Sahara have none (no P41 on the NE item).
  `flag-map` uses C2's flags pack for those when it is in the round.
- `data/geo` totals ~4.4 MB on disk, but a round downloads only its own view (world ≈ 56 KB gzipped).

## Requests
- **A (shell)**: please show "Map data: Natural Earth (public domain)" on the Credits page. Map formats need any geography
  pack to be selectable (the round itself ignores pack contents apart from flags/landmarks/refs); if you add a
  `packless: true` flag to the registry, set it on the `map` tagged formats. Formats use `api.kids`, `api.sfx` and
  return `choose()`/`timeout()`; pin-drop/neighbours send `{ partial: true, points }` for partial credit.
- **C2**: the `flags` pack's Afghanistan item is the Taliban flag (Wikidata's preferred P41). Worth a note or dropping
  it from flag rounds; `flag-map` already skips AFG.
- **L**: Explore map is `createExplore` above; `onPick(iso3, props)`; ISO3 matches C2's `iso3` field.
