# Three towns, measured — and why Longacre was not built

**Phase 1 only. No town was authored, and no existing file was changed.** `git diff` over the game
is empty against `7abd3a5` — `whitewall.js`, `demoScene.js`, `zones.js`, `stream.js`, `terrain.js`
and `build.js` are all byte-identical. Five files are new: this note, two traverse readings
(`docs/TRAVERSE_THREE_TOWN.json`, `docs/TRAVERSE_THREE_TOWN_FIX.json`) and two measurement tools
(`tools/callsat.mjs`, `tools/eyeshot.mjs`). The comparison renders are in `shots/three_town/`,
which is gitignored like the rest of `shots/`.

511 tests, 0 failing. `lintQuests` 0 errors and the one pre-existing `light.06` warning. `lintText`
clean. All three verified on the reverted tree.

The brief's decision point was: three towns inside both gates → build Longacre; otherwise stop and
report. **Three towns are inside the triangle gate with room to spare and 13 draw calls outside the
call gate, so this stops here.**

But the reason they are outside it is not the one on record, and that changes what the fix is.

---

## 1. The answer to the question that was asked

> *"One call of margin. 149 against 150 at the worst frame. Two more towns will break it."*
> — `NOTES_A8_WHITEWALL.md`, A8-fix §8.2. Unverified when it was written.

**Wrong in its mechanism, right in its conclusion, and the difference matters.**

Whitewall's worst frame does not move at all when two more authored towns are added. At the
**339 stations both runs share**, comparing sample for sample:

| | shipped | with two more authored towns |
|---|---|---|
| Whitewall's worst calls | **149** at (−518, −216) yaw 120 | **149**, same station |
| Whitewall's worst triangles | **331.1k** at (−512, −71) yaw 0 | **330.5k**, same station |
| call delta over the 39 stations within 150 m of the town centre | — | **−8 … +2** |
| triangle delta over the same 39 | — | **−2.8k … +3.0k** — the scatter re-roll §3 of the A8 notes describes |

The three towns are three separate peaks — 149, 158 and 163 — not one additive load. Nothing
compounds. The 5.4 % triangle margin the last wave was worried about is not touched: **the worst frame in a three-town world is
still a Whitewall frame, and it is 0.6k triangles *cheaper* than it is today.**

What actually happens is that Longacre and Blackstone stop being cheap. The seeded districts are
**28 and 22 objects in 4 and 5 blocks**; Whitewall is **139 objects in 26 blocks**, and the stamp
makes the world 73 blocks instead of 35. Each new town brings its own peak, and both of the new
peaks land *above* Whitewall's.

---

## 2. The measurement

`node tools/budget.mjs --traverse --step=25 --preset=medium --dpr=1 --w=844 --h=390`, `shadowRate`
forced to every frame — A7's and A8's own profile, so every row below is comparable with
`docs/TRAVERSE_A8_FIX.json`. The control run reproduced A8-fix to the digit (149 calls, 331.1k
triangles, 0 of 348 over) before anything was changed, and again after everything was reverted.

| config | n | worst calls | p95 | p50 | over 150 | worst tris | p95 tris | over 350k |
|---|---|---|---|---|---|---|---|---|
| **shipped** — Whitewall authored, two seeded | 348 | **149** | 124 | 72 | **0** | **331.1k** | 263.0k | **0** |
| + Longacre stamped | 348 | **158** | 145 | 79 | **6** | 330.3k | 272.5k | 0 |
| + Longacre **and** Blackstone stamped | 363 | **163** | 146 | 89 | **15** | 330.5k | 282.7k | **0** |

`docs/TRAVERSE_THREE_TOWN.json` is the third row.

**Triangles pass everywhere.** 330.5k against 350k — a 5.6 % margin, marginally *better* than the
5.4 % Whitewall ships with, and 0 of 363 samples over the gate in any configuration measured.
Triangles were never the three-town problem.

**Draw calls fail: 163 against 150, and 15 of 363 samples over.** The 15 split **8 Longacre,
7 Blackstone, 0 Whitewall**.

### Where the worst frames are

Every over-gate frame is inside or on the approach to **one** town. Distances from the three
centres, for the worst frame of each:

| town | worst frame | calls | d(Whitewall) | d(Longacre) | d(Blackstone) |
|---|---|---|---|---|---|
| Blackstone | (520, −163) yaw 0 | **163** | 1045 m | 558 m | **83 m** |
| Longacre | (−139, 63) yaw 0 | **158** | 401 m | **141 m** | 674 m |
| Whitewall | (−518, −216) yaw 120 | **149** | **156 m** | 577 m | 1046 m |

### Does a sightline ever catch two towns? Yes — and it is not where the cost is

This is worth stating carefully, because "520 m apart, so they cannot both be visible" is not true.
The cull radius is `viewDist × lodCull` = 180 × 1.45 = **261 m** measured to a block's bounding
sphere, and the gap between Whitewall's east wall and Longacre's west edge is 278 m. (On the `high`
preset `viewDist` is 260, so the cull is 377 m and the overlap is much wider. The gate is a mobile
gate and everything here is `medium`.) Counting live blocks per district along the King's Road
between them:

| station | Whitewall blocks live | Longacre blocks live | total live | worst call count at that station |
|---|---|---|---|---|
| (−388, −52) | 24 | 1 | 25 | 130 |
| (−329, −4) | 21 | 6 | 27 | 126 |
| (−269, 10) | 16 | 11 | **27** | — |
| (−262, 56) | 15 | 12 | 27 | 125 |
| (−212, 52) | 12 | 18 | **30** | **141** |
| (−187, 53) | 9 | 19 | 28 | 151 |
| (−139, 63) | 4 | 20 | 24 | **158** |

So both towns really are live at once, and at (−212, 52) **30 blocks are live — more than at either
town's own worst frame**, where the counts are 20 and 24. And the call count there is **141, below
both towns' own peaks.** The frustum is 96.8° horizontal and the two towns sit on opposite sides of
the road; a frame gets one of them. The expensive frame is the ordinary one, at 83–156 m out,
looking into a single town.

**Conclusion: independent, not additive.** The proof is the matched-station table in §1 — two extra
towns changed Whitewall's worst frame by zero calls — and the row above, where the one place both
towns are in range is 17 calls *cheaper* than the single-town peak next to it.

---

## 3. What the failing calls are made of

`tools/callsat.mjs` re-runs one traverse station and walks the graph, so an over-gate frame can be
attributed. It reproduces the traverse row exactly (149 / 122 main / 27 shadow at Whitewall's
worst).

**Whitewall's worst frame today** — (−518, −216) yaw 120, 149 calls:

```
 43  proxy blocks (18 live)      11  foliage       9  contactAO      8  water
  6  detail blocks (2 live)       6  ground        5  road           5  people
  5  wood      4  trim      3  bank      3  chickens      2 doorLeaves      2 crest, 2 bush, 2 rock
```

The proxy set is 43 of 122 main calls. **That is why every lever on record attacks the proxy set —
and it is only true of this one frame.**

**Blackstone's worst frame** — (520, −163) yaw 0, 163 calls (127 main + 36 shadow): of the 122
meshes the walk finds, **61 are blocks** (22 wall, 15 roof, 12 glass, 6 trim, 5 crest, 1 wood) and
**61 are not**. **Longacre's worst** — (−139, 63) yaw 0, 158 (129 main + 29 shadow): 56 block, 69
non-block of 125. At both, roughly half the main pass is things that are not a town at all:
foliage, ground chunks, water, bank, the King's Road ribbons, contact-AO decals, people and
chickens. (The walk finds 122 and 125 against the renderer's 127 and 129 — it applies its own
frustum test, so it lands a few short; the split is what matters, not the last five.)

---

## 4. The cheapest route inside the gate, measured rather than estimated

Every row is the full traverse on the three-town stamp, same profile.

| change | worst calls | over 150 | worst tris | note |
|---|---|---|---|---|
| — | 163 | 15 | 330.5k | |
| **`glass` → `wall` in `PROXY_FOLD`** | **159** | **3** | 330.5k | measured; §5 |
| all surfaces → one proxy mesh (`glass`, `roof`, `wood` too) | 157 | 1 | 330.5k | costs distant roof colour |
| `AOC` 120 → 240 alone | 158 | 8 | 335.9k | +5.4k tris, wrong way round |
| glass fold + `AOC` 240 | 155 | 2 | 335.9k | |
| glass fold + `lodDetail` 70 → 60 | 156 | 3 | 319.5k | |
| **glass fold + `lodDetail` 70 → 50** | **149** | **0** | **316.4k** | `docs/TRAVERSE_THREE_TOWN_FIX.json` |

**The recommendation is the last row: fold `glass` into `wall` for proxy sets, and drop
`lodDetail` from 70 m to 50 m.** Together they put three Whitewall-sized authored towns at 149
calls with 0 of 363 samples over either gate, and they *improve* the triangle worst frame by 4.3 %
(330.5k → 316.4k) because a detail block that becomes a proxy also shrinks the merged depth mesh
that shadows it. Two knob-level edits. No `stream.js` architecture, no layout change, no new object
type, `zones.js` untouched.

For the record, on two towns the glass fold alone is enough: **158 → 149, 6 breaches → 0.** It is
Blackstone that needs the second lever.

### The lever ranked first on record is worth ~7 calls, not ~40

`NOTES_A8_WHITEWALL.md` A8-fix §1 ranks *"a coarser second-level block past `lodDetail`"* at
"roughly −40" on the grounds that 19 proxy blocks are ~54 of the 122 main calls. That arithmetic is
right for Whitewall's worst frame and wrong for the frames that actually break the gate. With the
glass fold in, at Blackstone's residual worst frame (552, −87):

```
 36  detail  (13 live blocks — 2.77 calls each)
 10  proxy   (13 live blocks — 0.77 calls each)
 72  everything that is not a block
 36  shadow
```

Grouping the proxy blocks 3 × 3 could save at most **7 calls of the 10 they cost**, for a wave of
`stream.js` work. Once the proxy set is folded it is not the problem any more: **the detail set is,
and half the main pass is not the town at all.** That is why `lodDetail` — which moves blocks out
of the detail set — is the lever that bites, and it is a knob that already exists.

`BLK` stays closed, as the review established. Do not measure it again.

---

## 5. What the two levers cost, looked at rather than assumed

Judged from player-eye framings with `tools/eyeshot.mjs`, and diffed pixel by pixel. The threshold
is a channel delta over 6/255. Every pair is in `shots/three_town/` (gitignored) next to the
`pngdiff.py` that produced the counts.

**`glass` → `wall` for proxies.** The fear on record is *"a night view of Longacre from 120 m loses
its three or four lit windows entirely"*. It is real and it is tiny. A stamped town from 225 m at
21:30 loses **87 pixels of 921,600 (0.009 %), max delta 13/255**, all of it inside one 264 × 93 box
around the Lantern Spire's lit shaft — `glassfold_{off,on}_far_night.png`, from
`--pos=0,30,265 --look=0,25,60 --time=21.5`. `town_night`, a scored plate, changes by **179 pixels
(0.019 %), max delta 65/255**, in a band across the distant rooflines. The near half of the town is
in the detail set and keeps every window.

**`lodDetail` 70 → 50.** Four of the five scored plates are effectively identical (0, 1, 1 and 2
pixels over threshold). `creek_day` differs by 6,350 pixels (0.69 %) — but **two renders of
`creek_day` at identical settings differ by 45,923 pixels (5.0 %)**, because the water is animated
(`noisefloor_creek_day.png`). The LOD change is **seven times below that plate's own noise floor**,
so it is not measurable there.

Where it *is* visible: standing 60 m from a building, a block that was full detail becomes its
proxy silhouette. Measured at (−424, −48) looking at Ivo's room, **4,768 pixels (0.52 %) differ, in
a single 66 × 206 box** — one tower in the 50–70 m band losing its crenellated cap for a plain cone
(`lod{70,50}_ivo_60m.png`). Houses fare better: the proxy keeps the gable and the mass. **This is the only real cost in the
recommendation and it should be Aaron's call, not mine.** `lodDetail` is a registered knob with
panel UI, so a high preset could keep 70 and only the mobile profile drop to 50 — that split is not
measured here.

---

## 6. Geometry memory — yes, this needs a gate of its own

The brief asked. Measured by walking the scene graph and summing every unique geometry's attribute
and index byte lengths:

| config | depth meshes | everything else | geometry total | textures | grand total |
|---|---|---|---|---|---|
| **shipped** | 10.7 MB (70 meshes, 934,692 verts) | 34.7 MB (440) | **45.4 MB** | 55.1 MB | **100.5 MB** |
| two authored towns | 14.2 MB (104) | 44.3 MB (550) | **58.5 MB** | 55.1 MB | 113.6 MB |
| three authored towns | 18.7 MB (146, 1,637,826 verts) | 57.4 MB (685) | **76.1 MB** | 55.1 MB | **131.2 MB** |

Three findings.

1. **The depth meshes are not an anomaly, they are a fixed ~24 % tax.** A8-fix reported +10.7 MB as
   a one-off. It is 23.6 %, 24.3 % and 24.6 % of geometry memory across the three rows, and it
   scales with the towns: 10.7 → 18.7 MB. The `Int16` quantisation the notes describe and did not do
   halves positions, so it would take **9.4 MB** back at three towns.
2. **Textures do not move.** 55.1 MB in all three configurations — the shared kit is the whole
   point, and two more towns add no art. `budget.js` `track()` is telling the truth about the half
   of GPU memory it covers.
3. **Nothing tracks or gates the other half.** Geometry is heading for **76 MB resident**, and
   nothing in the world is ever freed — `stream.js` flips `.visible`, it does not dispose. On a
   mid-range phone that is the number most likely to end the session, and it is the only budget in
   the project with no instrument at all. **Recommend: a `geoMB` alongside `texMB` in
   `app.stats()`, and a gate.** I have not proposed a number, because 150 calls and 350k triangles
   were both set from a desk and `docs/PHONE_TEST.md` is still owed; setting a third unmeasured
   budget from the same desk would be repeating the mistake, not fixing it.

---

## 7. How the experiment was run, and why it is honest

`js/editor/demoScene.js` was patched behind a `?stamp=neutral,dark` URL flag to route those zones
through `authored()` with Whitewall's whole object list translated by
`TOWNS[di].c − whitewall.TOWN`. It is fully reverted — **`git diff` over the game is empty**, and
`git status` shows only new files: this note, the two traverse readings and the two tools. To repeat
it, this is the whole patch:

```js
const STAMP = (typeof location !== 'undefined'
  ? (new URLSearchParams(location.search).get('stamp') || '') : '').split(',');
// in demoScene():   zone === 'light' || STAMP.includes(zone) ? authored(...) : layout(...)

function authored(doc, terrain, zone, di) {
  const dx = TOWNS[di].cx - TOWN.x, dz = TOWNS[di].cz - TOWN.z;
  for (const o of whitewall()) {
    const x = o.x + dx, z = o.z + dz;
    if (!nearCamera(x, z)) doc.objects.push({ id: 0, dist: di, zone, seed: 0, ...o, x, z });
  }
  if (zone === 'light') paveLight(terrain);
  else for (const r of PAVED) terrain.addPatch({ x0: r.x0 + dx, z0: r.z0 + dz, x1: r.x1 + dx, z1: r.z1 + dz }, zone);
  doc.districts.push(district(zone, TOWNS[di].cx, {
    seed: 0x2f1a71 + di * 977, road: ROAD.map(([x, z]) => [x + dx, z + dz]),
    roadWidth: di === 1 ? 0 : ROAD_WIDTH, kerbs: [], bridge: bridgeFor(di),
  }));
  return 0;
}
```

What was kept faithful:

- Longacre keeps **`roadWidth: 0`**, so it registers no ribbon of its own and the traverse reaches
  it down the King's Road, exactly as `demoScene.js` intends. Blackstone gets Whitewall's 9.
- `nearCamera` keep-outs still delete stamped objects, as they would for a real town.
- The `PAVED` rects are translated too, so the terrain patch and the scatter mask behave.
- The control run reproduces `docs/TRAVERSE_A8_FIX.json` to the digit both before and after.

What is **not** a real Longacre or Blackstone, said plainly:

- **The stamp is a walled town in both places.** Longacre is a farming village with no curtain wall
  and a 260 × 220 m spread against Whitewall's 224 × 174; Blackstone is terraced on three levels
  with a gorge. The stamp is a *load* of the right order, not a layout.
- **Blackstone's pad is a 26 m riser and Whitewall's is flat.** The stamped buildings seat correctly
  on the steps rather than floating — `shots/three_town/stamp_gate_night.png` shows the plinths
  climbing — but the town's shape is wrong for that ground and its road runs across the terraces.
- **Blackstone's stamped copy puts Whitewall's fish steps near the Vail's dark-zone reach**, which
  is some of the water and bank calls at (552, −87). Not all of them: Whitewall's own worst frame
  carries 8 water calls too.
- **Each stamped town carries a copy of the Lantern Spire pinned `lod: 'full'`** — 9.9k resident
  triangles ×3. Blackstone's real keep (r 11, h 52) costs 7.1k under the tall-tower rule, so this
  is the right order; Longacre almost certainly has no such landmark and is over-charged here.

The honest summary of the bias: **the stamp is probably pessimistic for Longacre and of the right
order for Blackstone.** A real Longacre could come in under 158 without any lever. That is not a
reason to build it and find out — it is a reason to note that 158 is an upper bound.

---

## 8. What I would do next, in order

1. **Take the glass fold.** It is measured, it costs 87 pixels at 225 m, and it takes Whitewall
   alone from 149 to **138** — one call of margin becomes twelve. It is worth doing whether or
   not another town is ever built.
2. **Decide `lodDetail`.** 50 m closes the whole three-town budget and improves triangles; the cost
   is a tower's parapet at 60 m. If Aaron would rather not, Longacre alone still fits on the glass
   fold and the decision can wait for Blackstone.
3. **Then author Longacre**, and re-run the traverse against the *real* town rather than the stamp.
   Everything §9 of `NOTES_A8_WHITEWALL.md` says about reuse still holds and none of it was
   disturbed.
4. **Instrument geometry memory** before Blackstone, not after.
5. **`docs/PHONE_TEST.md`.** Three budgets are now being defended — 150 calls, 350k triangles and an
   unwritten memory one — and not one of them has been measured on a phone.

---

## 9. What I could not verify

1. **No real Longacre exists, so none of this is a measurement of Longacre.** §7 lists the ways the
   stamp differs. The 158 is an upper bound on a Whitewall-shaped town at Longacre's centre.
2. **Everything here is headless and software-adjacent.** Calls, triangles and byte counts are real;
   every fps and GPU millisecond this session produced is meaningless and none is quoted. Nothing
   has been on a phone.
3. **`lodDetail` 50 was judged on five scored plates and three player-eye framings, not on a walk.**
   The LOD swap happens *while the player moves*, and a pop at 50 m is more noticeable than a pop at
   70 m in a way a still cannot show. That needs a video or a walk, and I did not do one.
4. **The glass fold's cost was measured at night on stamped towns.** A real Longacre's window
   pattern is not Whitewall's, and the one plate that changed measurably (`town_night`, 179 px) is a
   *scored* plate — the critic has not re-scored it and `tools/compare.mjs` still cannot run here,
   because `gms/3d/aaa_refs/refs/clean/` does not exist on this machine.
5. **Why Blackstone peaks 14 calls above Whitewall on identical geometry is inferred, not
   isolated.** The candidates are the terraced pad (more ground chunks, kerbs that finally fire) and
   the stations the stamped road puts the camera at — its worst frame is 83 m from the centre where
   Whitewall's is 156 m. I did not force one of those to a constant and re-measure, which is the
   only way to settle it, and A9 should before it trusts the 163.
6. **`whitewall.test.js` was not extended**, because no town was authored. The 511 tests, the
   `lintQuests` 0-errors-1-`light.06`-warning and the clean `lintText` are all unchanged from
   `7abd3a5`, verified on the reverted tree.
7. **`tools/eyeshot.mjs` aims the camera, lets the app settle, then re-aims and draws.** The app's
   own loop puts the camera back between those steps, so the captured frame is the second draw. It
   is correct for stills and it deliberately prints no perf numbers, because `renderer.info` would
   count that extra draw on top of the app's.
8. **The open questions A8-fix left are all still open** and none was touched here: `wall_day`'s
   framing and its 13 m keep-out through the Cloister, `stand.east` sitting in the West March,
   `bst.levels` having no engine support, and Fen the ferryman crossing no water.
