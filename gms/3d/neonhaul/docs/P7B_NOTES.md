# P7b — the docking panel, the ledge-pad fix, and obligation T8

Everything here is measured. Raw data: `shots/p7b/_gates.json` (**20/20** incl. 6/6 falsification),
`shots/wire/_gates.json`, and the node probe in §1. Evidence images: `shots/p7b/portrait_panel.png`,
`shots/p7b/portrait_board_fixed.png`, `shots/p7b/landscape_panel.png`, `shots/p7b/ledge_deck.png`.

Files added: `js/dock.js`, `tools/gates_p7b.mjs`.
Files changed: `js/zones.js`, `js/missions.js`, `js/ui.js`, `js/main.js`, `js/autopilot.js`,
`js/city.js` (diagnostic counters only — see §5), `style.css`, `tools/gates_wire.mjs`,
`tools/shot.mjs`.

---

## 1. The ledge-pad defect — FIXED

### What it was

`zones.js:_site()` returned the building **centre** for both pad kinds and changed only the height:
a roof pad at `h + 1.2` (clear), a ledge pad at `0.42·h`. `render_city.js` builds **one collision
AABB per building** — the full `w × d` footprint extruded from the ground to `h`, with no knowledge
of a prototype's setbacks — so `0.42·h` is inside the mass by construction.

### Why a shelf on the real geometry could not work

`blocks.js` does contain genuine setbacks: `podium`'s deck at `0.30 h`, `bridged`'s sky bridge at
`0.60 h`, `terrace`'s stepped +x face. Two problems, either of which is fatal:

1. **Collision does not see any of them.** The AABB is the bounding box. A pad on `podium`'s podium
   deck is *inside* the collision volume exactly as much as a pad at the centre is.
2. **None is big enough.** The widest free surface on any prototype is ~9 m across, on a building
   whose footprint is capped at 38 m by §3.1's 51.2 m lot minus a 13.2 m road. The docking cylinder
   is **14 m radius**. There is no ledge in this city a 28 m volume fits on.

So the choice was: delete the ledge kind, or put the pad **outside** the mass.

### What was built

A ledge pad is a **cantilevered deck bracketed off one face of the tower**.

```
LEDGE = { OUT: 15, CLEAR: 13, MIN_H: 60, CHANCE: 0.38, BAND: [0.30, 0.62], MIN_Y: 24 }
```

- `OUT` is measured **from the facade**, and 15 > `FLIGHT.REPEL_RANGE` (12) is the load-bearing
  number: at the pad centre the parent tower contributes **exactly zero** proximity repulsion, so a
  craft can hold station there for §7.2's 0.6 s hold.
- Four faces are tried in a hashed order; a face is accepted only if `_clearance()` — the minimum
  horizontal distance to the collision AABB of any building that **reaches the pad's height** — is
  at least 13 m. Buildings shorter than the pad are not obstacles, so the same test also keeps the
  vertical descent column open, which is what the autopilot's final approach needs.
- If no face clears, the pad falls back to a roof. Nothing is retried elsewhere (§3.1.1).
- The ledge decision is drawn from the **same rng stream in the same place** as before, and the
  face/height rolls come from a separate `LEDGE_SALT` hash — so which chunks have pads, which are
  RUSH, and where every roof pad sits are all **unchanged**. Only ledge positions moved.

### A second defect the same measurement found

**1 of 45 sampled ROOF pads was also inside solid geometry** — a roof buried under a *taller
neighbour* whose footprint covers it. The original 8-pad browser sample missed it. `_site` now walks
outward from its biased index to the first candidate whose roof is genuinely open, using no extra
`rng()` draw so the stream is untouched.

### The measurement, with the roof pads as the positive control

Node probe (`ZoneField` + `CityModel` imported straight into node, using the identical
`solidAt` predicate `render_city.js` uses), over a 29×29-chunk block:

| | before | after |
|---|---|---|
| pads / ledge pads | 312 / 74 (23.7 %) | 312 / 74 (23.7 %) |
| **LEDGE centres inside solid** | **74 / 74** | **0 / 74** |
| **ROOF centres inside solid** (control) | 1 / 238 | **0 / 238** |
| ledge horizontal clearance | 0.0 m everywhere | min **13.0**, p05 14.2, median **15.0** |

13×13 block, matching the integration agent's own sample: 66 pads, **21/21** ledge inside before,
**0/12** after; ledge share 31.8 % → 18.2 % (a face that cannot clear falls back to a roof).

In the browser, with each pad's chunks **streamed and asserted live**
(`gates_wire.mjs` W8, 12 of each kind sampled):

```
ledge 0/12 buried · roof 0/12 buried (the positive control) · 0 grazing hits either side
```

**W8 now passes honestly and is kept as the regression guard.** Two changes make it trustworthy:

- **A new `__game.cityChunkLive(x, z)` hook, asserted before every probe.** `solidAt()` returns
  `null` both for open air and for a chunk that was never generated — the ambiguity that made an
  earlier 242-pad sweep conclude the defect did not exist. W8 now **throws** on an unstreamed chunk
  rather than banking it as clear.
- **The predicate is a depth, not a boolean.** `solidAt` tests `y <= top`, so a pad resting exactly
  on a deck reads "solid" at depth 0 — which the HUB does, because §3.1.1 authors it *at* the
  spindle's 92 m podium rather than 1.2 m above it. Burial is `top − y > 0.5 m`, and the raw solid
  count is reported beside it so the threshold hides nothing.

### Two gates W8 alone could not answer

- **W10 — a craft can hold station at a ledge pad.** Real flight model, from rest, ~2 s of
  integration, with the **old placement as the control**: `pad.mass` (the tower centre at the pad's
  height) is exactly where `_site()` used to put it, and a control that also held station would mean
  the gate measures nothing.
- **W11 — a job whose DROP is a ledge pad can be completed.** Walks real courier pads, reads their
  real boards, takes the first job destined for a ledge pad, flies there with `flyTo` and docks on
  §7.2's own 0.6 s hold, and asserts the delivery and the payment.

`gates_wire` W4 no longer filters `!z.ledge` when choosing a CHARGE pad. That filter existed only
because of this defect; its removal is part of the evidence.

### The visual half

A pad 15 m off a facade with nothing under it is a glowing ring in clear air. `createZoneVisuals()`
gained **one** `InstancedMesh` for the deck — a slab, a bracket into the facade and three lit rails
in one geometry, with vertex colour carrying the dark/bright split so the slab and its rim share a
draw call. It is `visible = false` at count 0, so the zone layer still costs **6 draws** in the
common case (measured, unchanged) and 7 when a ledge pad is among the nearest 3.

**Plan deviation, stated:** `zones.js`'s own comment budgeted the layer at 7 draws worst case; it is
now 8 worst case (2 instanced + 1 deck + 3 glyphs + 2 marker). Scene total is 49 draws against §3.8's
gate of 65.

---

## 2. §7.3's docking panel — `js/dock.js`

**The board and the panel are two different views, and that is not a preference.** §9.1 requires
*"the job board uses only the 96×96 thumb"* and *"the video's src is set only when the docking panel
opens for that client"*, and §13 asserts **zero `.mp4` fetched when only the job board has been
opened**. A board with the video inlined could not pass that gate however it was written.

- `#ui` (`ui.js` `DockUI`) stays the **board**: the list you scan, plus HOLD and CHARGE·SHOP. Each
  row now carries the client's 96 px thumb and the whole client block is a button.
- `#dock` (`dock.js` `ClientPanel`) is the **deal**: one client, one job, §7.3's three blocks in
  §7.3's order — *who is this, what do they want, do I take it* — with ACCEPT / HAGGLE / DECLINE.

Existing gate selectors (`.dk-accept`, `.dk-fill`, `.dk-shop`, `.dk-tab`, `.dk-undock`,
`.dk-prompt`) are untouched, so no prior suite had to be edited to accommodate the panel.

### §7.3's checklist, item by item

| §7.3 rule | state | evidence |
|---|---|---|
| three blocks in the who/what/do-I order | ✅ | P1: `["cp-kicker","cp-who","cp-deal","cp-accept","cp-acts"]` |
| hex-clipped video, poster = the Flux still | ✅ | `clip-path` hexagon, `poster` = `<id>.jpg` |
| 1 px inner neon edge + 3 px outer glow at 20 % | ✅ | `.cp-media::after` inset box-shadow |
| scanline overlay at 4 % over `mix-blend-mode: screen` | ✅ | `.cp-scan` |
| 2 s "signal acquired" wipe on open | ✅ | `.cp-wipe`, one CSS keyframe |
| reliability chips | ⚠ derived | `clients.json` has no such field; `reliabilityOf(id)` is a documented FNV hash, flagged as derived in the source |
| static blurred still behind the sheet | ✅ | P3: a 3.9 KB `data:image/jpeg` captured in the rAF callback, `background-size: cover` |
| **no `backdrop-filter`** | ✅ | P3: **0 declarations** (comment-stripped); 3 mentions, all comments saying why it is banned |
| exactly one saturated colour per panel | ⚠ deviation | see below |
| one family, three sizes (10 / 14 / 28), one weight change | ✅ | P7 counts the **live computed** sizes |
| tabular numerals on every number | ✅ | P7 |
| 180 ms scale + blur + fade, 40 ms row stagger, no JS animation | ✅ | `@keyframes cp-in` / `cp-row` |
| nothing bounces, nothing round except the reliability chips | ✅ | P7: the only non-hairline radius in the sheet is `.cp-rel` |
| landscape = a CSS grid switch, identical DOM, no JS branch | ✅ | P5: **1440 chars of HTML identical** across the switch, `display: block → grid` |
| every number is §7.4's formula output | ✅ | P2 recomputes `jobBase()` and `timeLimit()` and diffs the DOM strings |
| HAGGLE once per client, DECLINE closes | ✅ | wired to `missions.haggle` |

**The one accent-colour deviation.** §7.3 says the accent is *the zone's tint*; T8 says
*"`tint_hex` is the neon the portrait was actually lit with; accent the panel with it and the UI will
agree with the image"*. The panel uses **`tint_hex`**, because agreeing with the photograph is the
thing a player can see. Consequence, stated because it looks like a bug and is not: two of the
sixteen clients are authored "cold white" / "pale ice-blue", so their panels read near-white. That
is P9's district palette rotation, not a missing colour.

### Absence behaviour (§9.6), and it is all measured

- video 404 → the still with a scanline shimmer and **no `<video>` element at all**
- still 404 too → a generated hex silhouette in the zone tint with the client's initials
- `play()` rejects → the same still path, no throw, nothing in `__state.errors`
- **no JS loop logic anywhere.** §9.2 bakes the ping-pong into the file; `loop` is the whole path.

---

## 3. Obligation T8 — the four gates P9 could not meet

| | gate | result |
|---|---|---|
| **D1** | inline playback under mobile emulation | iPhone UA, `(pointer: coarse)` true, `paused false`, `webkitDisplayingFullscreen false`, `currentTime` advancing 0.40 s per 0.40 s **modulo the 4.00 s loop** |
| **D2** | the `play()`-rejection fallback | forced rejection → `mode video → still`, `<video>` removed, still at 384 px, shimmer on, `__state.errors` 0 → 0 |
| **D3** | zero `.mp4` on the job board | fresh navigation → board: **0 `.mp4`**, 3 × 96 px thumbs, **0** 384 stills |
| **D4** | deleting `assets/clients/` leaves the game playable | directory moved off disk, page reloaded: `__ready`, **0 errors**, 53 draws, board and panel opened, ACCEPT worked, 3 generated placeholders, **0 broken images**, 8 requests under `clients/` all 404ing harmlessly |
| — | `muted playsinline webkit-playsinline` mandatory | all present, read off the **live element**; plus `loop`, `preload="none"`, `disablepictureinpicture`, `poster` |

**D4b restores it and proves the restore**: 48 files / 1.32 MB back, listing identical byte-for-byte
to the pre-delete listing, the moved copy gone, and — the part a file listing cannot tell you — the
**running game sees them again**: media mode `video`, still 384 px, thumbs `[96,96,96]`, playing.

**Two traps this suite had to be shown avoiding, both caught by the falsification pass:**

- **D1's first version compared `t1 > t0`** and failed on a perfectly healthy clip that happened to
  wrap between the two samples (`3.69 → 0.39` is 0.70 s of *progress*). Now modulo the duration.
- **D3's first version re-docked instead of reloading**, and Chrome reused the `<img>` from the
  document's memory cache — so the board made **no requests at all**, which reads exactly like the
  zero D3 is looking for. It now navigates fresh, with `Network.setCacheDisabled`, and **F3 proves
  the counter can see an `.mp4`** by opening the panel and catching the one request it makes.

---

## 4. The two board defects

### Every job on a board was the same client with the same line

§7.1 assigns one client per **pad**, and that shipped literally: three slots, one name, one quote,
on the first screen of the game.

**Chosen fix: vary the CLIENT per job, not the line.** `clients.json` gives each client exactly one
line, so varying the line means writing copy that no longer belongs to the face beside it — and the
panel shows a portrait, a faction and a reliability score, none of which vary if the client does not.
One repeated *person* is what reads wrong, not one repeated sentence.

What §7.1 is actually protecting is kept exactly: **slot 0 is still the pad's own operator**,
`clients[hash2i(cx, cz, CLIENT_SALT) % clients.length]`, derived from the world seed and never
stored. Other slots are other people posting from the same pad, offset around the list by a hash of
(pad, gen) **plus the slot index**, so the offsets are distinct by construction — a per-slot random
offset would show the same client twice on a 3-slot board about 7 % of the time with sixteen
clients. Gate B1 asserts distinctness in the model *and* in the DOM; F5 shows it rejects the shipped
arrangement.

### The boot toast covered the board's sticky header

The rail is `position: fixed` at z-index 45, above `#ui` (35) and `#dock` (36), so for its 5 s the
two-thumb hint sat on the credits readout and the pad name.

**Fixed with a measured reservation, not a magic offset.** `UI._reserve()` puts the rail's real
bottom edge into `--toast-h`, and the panel layers use
`padding-top: max(calc(safe-t + 8px), calc(var(--toast-h) + 8px))`. One toast or four, the header
starts below the rail; an empty rail costs nothing. B2 measures the **rect intersection** (0 px²)
and F4 zeroes the reservation to show the probe sees 4,426 px² of overlap when the fix is removed.

---

## 5. The one thing that could have been a regression, chased and cleared

`_clearance()` calls `city.generateChunk()` on the pad's neighbouring chunks — a **new non-renderer
caller of the descriptor cache**, and that cache evicts **wholesale** at 900 entries. A wholesale
eviction hands the renderer a cold cache on its next stream-in, which is exactly what `gates_p2`
§3.2.3's `ms.gen` gate measures. That is a real mechanism and P7a's own notes warn about it, so it
was measured rather than argued about.

`city.js` gained four diagnostic counters (`cacheGens/Hits/Clears/High`) and `__game.cityCache()`.
Over the exact flight §3.2.3 measures — 30 s of `?auto=1`:

```
gens 265 · hits 592 · WHOLESALE CLEARS 0 · high-water 265 of the 900 cap
```

**Zero clears, and the high-water mark is 29 % of the cap.** The mechanism does not fire, so it
cannot be the cause of anything. Confirmed independently by `determinism.mjs`: the golden hash is
**`f29beaf9`, unchanged**, 25,039 buildings — the city is byte-identical, which it would not be if
the pad siting had reached into generation.

§3.2.3 did fail on one of **seven** `gates_p2` runs. The full distribution of worst `ms.gen` over
those seven, against the 1.4 ms gate:

```
1.100  0.800  1.700  1.400  1.000  1.000  0.900      median 1.000, one sample over the gate
```

`MANAGER_STATE` already records this gate as *"marginal, not raced — it failed once in six runs,
worst 1.600 ms"* **before P7b existed**, and the shape here is the same: a heavy right tail on a
worst-single-frame metric. **Not tuned, not touched.** It remains open and it is not P7b's.

### The other single red, also chased

`gates_p3b --lite --halocost` reported 12/13 once: §4.4's halo-cost gate requires
`cost >= 0 && cost < 1.3` and measured **−0.071 ms** — halos ON came out *faster* than halos off, on
a 1.4 ms measurement, on the headless ANGLE proxy the gate's own output labels *"these numbers are a
proxy"*. Re-run twice: **13/13 and 13/13, cost +0.062 ms and +0.018 ms.** A ±5 % noise floor on a
difference this small will occasionally cross zero; the gate should be read headed. Nothing in P7b
touches the halo field.

---

## 6. Plan defects found — reported, not silently resolved

**PD1. §13's `backdrop-filter` criterion cannot be satisfied as written**, for exactly the reason
P7a's D5 gives for `grep -rn "heat" js/`. `style.css` mentions `backdrop-filter` three times, all of
them comments recording *why* it is banned and what it costs on mobile Safari; deleting them to
satisfy a grep deletes the reasoning from the file it governs. Gate P3 strips comments and counts
**declarations** (0), reporting the mention count beside it.

**PD2. §7.3's accent rule and T8's `tint_hex` rule contradict each other.** Resolved in favour of
`tint_hex` (§2 above). One of them should be corrected in the plan.

**PD3. §7.3's reliability meter has no data behind it.** `clients.json` has no reliability field and
§9.5's record template does not produce one. Implemented as a documented hash of the client id and
flagged as derived; if it is ever meant to mean something, it needs a column.

**PD4. §7.3's mock is a single-job panel; §7.4.5 puts 2–3 jobs on a board.** The mock cannot be the
whole docking UI. Resolved as board + panel (§2), which is also what §9.1's loading discipline
requires — but the plan never says the two are different screens, and a builder reading §7.3 alone
would build one.

**PD5. `tools/shot.mjs`'s static server had no `Range` support**, so a `<video>` got a chunked 200
with no `content-length` and could not report a duration. Added (206 + `accept-ranges` +
`content-length`), same class of fix as P8's missing `.mp3` MIME type: without it a media gate is
measuring the harness, not the game.

---

## 7. What P7b did NOT do

- **No critic round.** §12.3 does not schedule one at this boundary; `cockpit` is P6's and
  `day_smog` is P10's.
- **`music/menu.mp3` still has nothing to play it** (P8's defect 5). Unchanged; still P10's.
- **The six missing landmark sign words** (T6 item 2) remain deferred to P10.
- **`assets/clients/` was moved and restored by a gate.** If a run is ever killed between the two,
  the directory is at `assets/_clients_moved_by_gate/` — the suite restores it in a `finally` and
  again in the outer `finally`, but check for that path if a crash happens mid-suite.
