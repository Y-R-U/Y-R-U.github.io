# S2-G — living posters

Aaron's brief: *"Some of the posters should be images that switch between different images every 5s
or 10s or so? ... the looping vids are working well and likely very small, how about we do the same
idea for a few posters ... We are wanting to bring this city alive more ... we can try to ensure they
only show from a certain distance and if we are looking at them etc to try to go easy on the
rendering?"*

Shipped as written. **9 of the 16 figurative poster sites in a HIGH near ring are now screens** that
cycle hard-compressed stills and ~5.3 s looping clips; the other 7 keep their baked tile, which is
what makes the live ones read as alive. The whole layer costs **one draw call**.

---

## The shape, and why it is this shape

**N CHANNELS, ONE TEXTURE.** A channel is one cell of a 2×2 `CanvasTexture` atlas of 192×384 cells.
Every living poster quad points its `iRegion` at a cell, so the layer is **one extra draw and one
extra texture however many living posters the city places** — the same trick `signs.js` already uses
for its three hero panels, and the only shape that fits `render_city.js`'s global instanced fields.
Doubling the poster count would not add a draw.

**The cost is the upload and the decode, not the quad.** A poster quad behind you costs what any
other instance in the field costs: nothing measurable. What costs is `<video>` decode — a hard
hardware limit on a phone, and the thing that actually stalls one — and re-uploading the atlas. So
**both** are gated on one question: is any site of this channel inside `RANGE` and inside the view
cone. An idle channel pauses its clip, stops its playlist clock, and does not draw. Steady state
with no poster in front of you is **zero uploads, zero decodes, zero bytes**.

**Two range bands, because stills and clips buy different things.** Stills cycle out to
`RANGE = 380 m`; clips only inside `VIDEO_RANGE = 220 m`. Measured off `shots/s2g/`: a 30 m tile at
240 m covers about 25 px of a 390 px frame. A cycling still at that size still registers as *that
board changed* and costs one upload every several seconds; a clip there is 25 px of motion for a
decoder running flat out.

**The bytes are not fetched either.** A channel's media has no `src` until the first time it goes
live. `state().fetched` counts elements that have one, so the zero at distance is a number a gate can
watch move.

**The strapline is drawn at runtime, not baked.** Flux cannot spell, and a picture without a
strapline reads as a picture rather than as an advert — which is the entire point of the feature.
Canvas text is also crisp at any distance where a baked 192 px one would be mush.

**The layer never depends on the fetch.** `PosterBoard`'s channel count is fixed synchronously in the
constructor, because `signage.js` decides which quads are living while the near ring is still
pre-warming. A missing `data/posters.json` or a deleted `assets/posters/` degrades to a hazard-stripe
placeholder on a real quad — not to a missing layer and not to a black rectangle on a facade.

### DECISIONS decision 9

Decision 9's implementation clause said *"baked into the signage atlas … no runtime generation, no
Flux calls, no separate texture, no additional draw calls."* **Aaron's S2-G brief overrides that
clause explicitly.** Everything else in decision 9 is untouched and is asserted by `gates_s2g` A1:
punctuation not wallpaper (**0.6 % of signs are posters**, `gates_p3a`), distance only (lowest living
edge **145 m** against decision 9's 120 m floor), one per building, stylised and graphic only, and
the **same 12–20 m width band and the same 1:2 aspect** the eight baked tiles use — so §3.10 #4's
size ruler still reads.

### The living roll is a HASH, not a draw from `rng`

`livingRoll()` takes `hashf(bx*4, bz*4, 0x70a5) < 0.6`. Taking it from the placement stream would
have shifted every sign after it and silently re-cut the whole city's signage — which is exactly what
`gates_p3a`'s size bands, counts and facade audit measure. Channel assignment is a second independent
hash; verified uniform at 25.1/24.9/25.1/24.9 % over 200,000 samples.

---

## Files

| file | what |
|---|---|
| `js/posters.js` | **new.** `PosterBoard` — the atlas, the channels, the sweep, the compositor |
| `js/signage.js` | a seventh field `posters`, the living branch in `placeSign`, the site list, `posterSites()` / `setPosterCamera()` |
| `js/config.js` | `posterChannels` / `posterVideo` per preset — HIGH 4/2, **LOW 2/0** |
| `js/main.js` | two one-line changes: `signage.update(dt, t, camera)`, and `postF` added to `signHash()` |
| `data/posters.json` | **new.** 4 channels × 4 items: prompts, holds, straplines, accents |
| `assets/posters/` | **new.** 12 jpgs + 4 mp4s, **284,349 B** |
| `tools/gen_posters.py` | **new.** the committed, re-runnable Flux→LTX→ffmpeg pipeline |
| `tools/gates_s2g.mjs` | **new.** 9 checks, 4 of them with their own control arm |
| `tools/gates_s2d.mjs` | B7 now prints every term of its own pass condition (see below) |
| `style.css` | `.dk-tab, .dk-key` landscape `min-height` 36 → 37 px (see below) |

**Assets: 284,349 B for 16 items** — 12 stills averaging 9.0 KB (192×384, `-q:v 9`) and 4 clips
averaging 41.6 KB (192×384, 128 frames, 5.33 s, crf 34–38). For scale, the 16 client portraits are
1.3 MB. Every clip is a baked ping-pong with **0 duplicated frames** (`gen_posters.py --stage seams`),
so `<video loop>` alone cycles with no hitch.

---

## Measured

### Frame budget — an A/B on the same machine, not against yesterday

`node tools/budget.mjs --headed`, 844×390 @ dpr 2. The morning baseline was taken before eight hours
of GPU generation, so it is **not** a fair control; the honest control is the feature switched off
*now*, which is the `OFF` column (`posterChannels: 0`).

| shot | before (AM) | OFF (now) | ON (now) |
|---|---|---|---|
| fog_city | 55d 1.55 ms | 55d 1.80 ms | **56d 1.60 ms** |
| canyon_dive | 50d 1.49 | 50d 2.04 | **51d 2.15** |
| hero_craft | 50d 1.44 | 50d 1.64 | **51d 1.78** |
| wet_street | 50d 1.87 | 50d 2.10 | **51d 2.25** |
| cockpit | 55d 1.85 | 55d 2.26 | **56d 2.31** |
| day_smog | 50d 1.84 | 50d 1.98 | **51d 2.34** |
| auto (60 s flight) | 56d 1.79, **worst 67.9 FAIL** | 56d 2.19, worst 7.9 | **57d 2.19, worst 7.4** |

**Exactly +1 draw call. Frame time OFF vs ON is inside the noise — ON is faster than OFF on two of
the seven.** The whole gap against the morning column is machine drift, which is why the A/B was run
rather than the difference reported.

The morning baseline's `auto` **failed** the 12 ms worst-frame gate at 67.9 ms. It did not recur in
either run today (7.9 / 7.4) and it is not this phase's: it was measured before a line of S2-G code
existed. Worth someone watching for.

### Gates

`s2g` **9/9 ×2** (HIGH and `--lite`) · `p3a` **13/13 ×2** · `p3b` **12/12** · `s2d` **14/14 ×2** ·
`s2f` **11/11 ×2** · `s2a` **13/13** · `s2e` **30/30** · `p7b --falsify` **20/20** ·
`wire` **11/11** · `determinism` **9/9**, golden `f29beaf9` / 25,039 buildings **unchanged** ·
`budget --headed` **all gates pass**.

`gates_wire` 11/11 is a **full** run — the S2-B record noted the previous 11/11 was a partial
(`total: 3`). That item is closed.

### The zeroes, and why they are allowed to count

`CLAUDE.md` records how this exact kind of gate dies: `gates_p7b` D3 counted `.mp4` requests on the
job board, Chrome served the element from its memory cache, the board made no requests at all, and a
broken measurement read identically to a passing one. So **every zero in `gates_s2g` is paired, in
the same check and the same run, with the same counter measured after the camera is flown in front of
a poster.**

- **B1** — 800 m behind the wall: 0 channels live, 0 clips decoding, **0 uploads over 12 s**. Flown
  to 150 m in front of the same wall: 1 channel live, **69 uploads over the same 12 s**, 1 clip
  decoding. Same counter, same run.
- **B2** — at distance **0** elements carry a `src`; after looking, **4** do, 1 of them `.mp4`, and
  the other three channels still fetched nothing.
- **B3** — peak simultaneous decodes 1 against the cap of 2, *and* it carries B1's observation that a
  clip was seen decoding at all. `peak 0 <= cap 2` would otherwise pass on a layer that never decoded.
- **C1** — the cell took 27 distinct pixel hashes over 30 s. **The control is the load-bearing half:**
  with the hold forced to 1e9 on a still, the same window gives **1 item and 1 hash**. Everything else
  in this scene moves — rain, traffic, sign flicker — so without that arm a hash count would have been
  counting the weather.
- **C2** — 14 distinct hashes over 4.2 s *inside one video item*. A still gives exactly 1.
- **D1** — every item 404'd: **0 uploads over 3 s, 0 page errors**, the channel parks on the
  placeholder *while still inside the range/view gate*. This is a real regression guard: the first
  build advanced past a dead item every frame and repainted on every advance — **67 uploads a second
  on a channel showing nothing**.

### B1's window was wrong once, and the wrongness is instructive

B1 first used a 4 s window and flaked. A **live** channel showing a still legitimately makes zero
uploads for the length of that still's hold (6–9 s) — so the gate read "0 uploads while looking
straight at a poster" and called the layer dead. The window now spans at least one item change, and
**both arms use the same window**; an asymmetric comparison is not a comparison.

---

## The secondary defect — `gates_s2d --land`

Handed over as: *"the failing term is `reach.tab.self` … a toast can still transiently overlap the
dock's first tab."*

**That diagnosis is wrong, and the evidence rules it out.** I made B7 print every term of its own
pass condition plus the toast rail's rect, then ran it 20 times and caught the failure once:

```
UNDOCK [32,349,780,38] on screen true, hit-tests to itself true, 38 px tall
first ACCEPT [54,289,227,38] hit-tests to itself true
first tab [32,113,156,36] on screen true, hit-tests to itself true, 36 px tall
toast rail [0,10,844,33] with 2 toast(s), --toast-h 43px
```

`tab.self` is **true** in the failing run. The rail occupies y 10–43; the tab sits at y 113–149, 70 px
clear. It has never overlapped.

**By elimination the failing term is `reach.tab.tall`** — the only term in the condition whose printed
value was *rounded*. `tall` tests `getBoundingClientRect().height >= 36` on a float while the rect
printed `Math.round(r.height)`, so a 35.99 px tab **failed the term and printed "36 px tall"**. The
tab's CSS floor was exactly `min-height: 36px`: a threshold with zero slack against a fractional used
height.

Two changes, and they are different kinds of fix:

1. **`tools/gates_s2d.mjs`** — B7 now prints `tab.self`, `tab.tall`, the **raw** heights to 2 dp,
   what element covered a target when one did, the toast rail rect, `--toast-h` and the toast count.
   The next occurrence of anything in this family will name its own term. This is the fix that
   matters; the flake cost two sessions precisely because a passing detail line hid the failing term.
2. **`style.css`** — the landscape `.dk-tab, .dk-key` floor goes 36 → **37 px**, giving the assertion
   a whole pixel to be wrong by. A bigger thumb target on a 390 px frame is never the wrong answer,
   and it moves ACCEPT by 1 px (`[54,289,227,38]`, sheet ending at y 386 of 390 — checked).

**8 consecutive `--land` runs since, all 14/14, tab height 37.00 every time.** Against a roughly
1-in-20 failure rate that is suggestive, not proof; but the gate will now say what broke if it
recurs, which it previously could not.

---

## Left undone

- **Nobody has flown this by hand or on a phone.** The 220 m clip band and the 2-clip cap are
  budget-derived and Mac-measured; the phone step is still §1's own requirement.
- **`gates_s2g` runs at `?debug`** because `signage.js` only keeps per-sign metadata under that flag.
  A1 audits that metadata, so the flag is load-bearing — but it means A1 measures a build with an
  extra per-sign object allocated. Nothing else in the suite depends on it.
- **The `auto` 67.9 ms worst frame** in the morning baseline (pre-S2-G) is unexplained. It did not
  recur.
- The four clips average 41.6 KB but `clinic_optic` needed crf 38 to come down from 104 KB; a busier
  clip will want its own crf. `gen_posters.py --crf` takes it per run, not per item.
- **Nine living posters in a HIGH near ring** is punctuation, which is what decision 9 asks for — but
  it means a player can fly for a while without passing one. `LIVING_FRACTION` (0.6) is the dial; the
  poster roll itself (`0.16` on buildings ≥ 200 m) is decision 9's and was not touched.
