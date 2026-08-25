# Manager decisions

Answers to `BUILD_PLAN.md` §15 and anything else a builder would otherwise have to guess.
Builders: these are settled. Do not relitigate them; raise a flag if one turns out to be wrong.

## 1. Plate substitutions — ACCEPTED

The architect was right and the manager's original plate table was wrong. Three captions in
`MANAGER_BRIEF.md` described plates that do not contain what they claimed. Cause: the manager
triaged from ffmpeg contact sheets whose tiling silently dropped frames on a source-resolution
change, so the index mapping was off. This is the same mistake the naval board's README warns
about in capital letters. **Triage plates by opening them individually, never from a grid.**

Verified by the manager, at full resolution:

- `979690_01` — a LOADOUT menu (CHARACTER / ARMOR / AUGMENTATIONS tabs, item tooltip). No city.
  **Dropped entirely.** Nivalis carries the density role; we do not need the Ascent grade badly
  enough to go hunting for a replacement.
- `1939970_10` — an interior explosion with a man in frame. Not a canyon shot.
  **Dropped; `746850_03` substituted** for canyon framing.
- `1939970_04` — period car interior with a woman in frame. Unusable under the no-people rule.
  **`cockpit` scores against `746850_02` instead.**
- `1091500_08`, `1475810_04` — character-dominated; **use the architect's crop rects.** Its note
  that the `1475810_04` crop is a better reflection test than the full plate is accepted.

`refs/board/` and `plates.json` have been updated; the dropped plates are in `refs/rejected/`.
The board page still shows the old set until it is rebuilt — rebuild it at P1.

## 2. Rear-view — NO

Accepted as specced. 35–45 % of frame for information the minimap gives better is a bad trade on
a phone. Aaron's brief made it conditional ("only if rear-view works / looks good"), and it does
not. Ship the rear-arc + TAIL chip fallback. Keep the 2.2 ms mirror-strip spec in the document in
case he overrules this after playing it.

## 3. City generation — SEEDED INFINITE **plus** AN AUTHORED CORE

Neither of the offered options alone. The architect is right that pure seeded-infinite means no
designed signature skyline, and "make it beautiful" is the whole point of this project — an
endless field of procedurally identical towers is exactly how this game gets boring to look at.

- Seeded-infinite generation is the substrate and covers everything beyond the core.
- **A small authored core** — call it 6–10 hand-placed landmark structures across 2–3 named
  districts, positioned at fixed coordinates around the player's start — gives the city a
  recognisable silhouette, a sense of place, and somewhere for the minimap to mean something.
- Landmarks are authored as data (position, prototype, scale, signage, colour), not as bespoke
  meshes. They reuse the same prototypes and materials as everything else, at larger scale and
  with hand-chosen signage. Cost is close to zero; payoff is that the skyline reads as *designed*.
- The seeded field must respect a keep-out region around authored landmarks.

## 4. Client count — 16 for first playable

Down from 24. The docking panel is the main UI of the game and variety matters there, but P9 is
gated on serialised local generation and 16 keeps that phase from becoming the long pole. The
manifest must be **data-driven and open-ended** so raising it later is adding rows, not code.

## 5. Japanese tiles — KEEP the 12

They are cheap (a few more tiles in an atlas we are baking regardless) and the mechanical
tofu-detection fallback is the right safety net. Abstract remains the primary path. If the bake
script turns out to need a font we do not have, delete the block and ship English + abstract —
that is an acceptable outcome, not a failure.

## 6. Police and heat — AMBIENT ONLY in v1

No heat system, no pursuit, no combat, no fail state. Aaron asked for a relaxed, beautiful
transport game and specifically called out police only as an example of a vehicle whose *lights*
differ from the civilian family.

- Police craft exist as a **traffic variant with distinctive lights**, and as flavour in the radio
  chatter. They do not react to the player.
- Nothing in the flight model or economy may depend on a heat mechanic.
- Revisit only after Aaron has played it.

## 7. Plan size — SECTIONS MUST BE SELF-CONTAINED

`BUILD_PLAN.md` is ~2,540 lines. That is fine as a reference but no builder should need to read
all of it. Each phase brief the manager sends will name the specific sections that phase requires.
If a builder finds it cannot execute its phase from the named sections alone, that is a defect in
the plan — say so, and the manager will fix the plan rather than have every future builder read
the whole thing.

## 8. SUNO — prompts exist, the file does not yet

**Correction.** An earlier version of this document claimed `docs/SUNO.md` was extracted and
complete. It is not — the manager asserted that from the plan's phase table rather than checking.
The prompts themselves do exist, in `BUILD_PLAN.md` §11.

- The plan revision must **extract §11 into `docs/SUNO.md`** as part of its work, after fixing the
  chatter distribution problem the review found (one accept-confirm line and one pay line, forced
  on every job, heard every ~90 s; and a claimed 20-minute repeat window that is really 7.8).
- Until that file exists, Aaron can work from `BUILD_PLAN.md` §11 — but the line set will grow, so
  generating the chatter is better done after the extraction. Music prompts are stable and can be
  generated now.
- Unchanged: nothing in the build blocks on SUNO, and every audio slot must behave correctly with
  zero files present (P8).

## 9. Figurative poster tiles on billboards — ALLOWED, constrained

Raised by the plan revision (`REVISION_NOTES.md` §7). Verdict: **allowed**, within limits.

Aaron's no-people rule exists because character *models* are hard, expensive and easy to get
wrong — "they are too hard to do for now", and "no need to show the people in the cabin". A poster
on a billboard is none of those things. It is 2D media on a flat surface, exactly the same
category as the docking-panel portrait he explicitly asked for, and the giant figurative advert is
one of the most recognisable pieces of visual language the genre has.

Limits, so this does not become a character-art project by the back door:

- **Stylised and graphic only** — high-contrast, poster-like, silhouette or flat-colour treatments.
  No attempt at photoreal faces or anatomy. If a tile starts to look like a character portrait,
  it has failed and should be replaced with a typographic or abstract tile.
- **Baked into the signage atlas** at bake time, alongside the abstract and word tiles. No runtime
  generation, no Flux calls, no separate texture, no additional draw calls.
- **Small in number** — of the order of 6–10 tiles. They are punctuation in the skyline, not the
  wallpaper.
- **Distance only.** They live on L5 hero billboards and upper facades. Nothing at eye level on a
  landing pad, nothing the player can fly up to and inspect closely.
- If they do not read well, or they drag a critic round's Materials or Finish score, **cut them**.
  Same standing rule as the distant cloth silhouettes and the Japanese tiles.

## 10. Far-haze brightness — a TUNABLE, provisionally 0.10–0.12

P1a escalated this rather than deciding it, correctly. Measured: our far plane renders at **0.055**
displayed luminance; the plate we score `fog_city` against (`746850_01`) measures **0.238**. We are
about 4× darker than the reference.

Both halves of the tension are real:

- Aaron asked for "mostly dark", and being somewhat darker than Cloudpunk is defensible *as a
  look*. Matching the plate exactly is not the goal.
- But §3.0's thesis — which the review told us to leave alone — is that **depth banding is the
  entire mechanism** by which a low-detail city reads as huge. Banding needs the far plane to
  wash toward a fog that is *lighter* than the buildings. At 0.055 the band has almost no room to
  work in, and the measured total span is 0.0541 across all three depths. That is not "dark", it
  is "flat", and flat is the one thing this art direction cannot survive.

**Decision:** expose P1a's display-space gamma as a single named tunable in `config.js` — one
number, documented, with the measured far-haze luminance it produces noted beside it. Set it
provisionally so far haze lands around **0.10–0.12**: roughly double our current value, still
about half the plate's, which respects "mostly dark" while giving the banding somewhere to live.

**Do not treat this as settled.** It is exactly the question the blind critic exists to answer, and
the first scored round at P3b is the first time we can ask it against a real city. P3b's builder
must:

1. Run the first `fog_city` round at the provisional value.
2. If the critic's differences list mentions flatness, haze, depth or distance separation, sweep
   this one number and re-run rather than changing anything else. Isolate before tuning.
3. Record the chosen value and the score movement in `SCORES.md`.

Aaron gets the final say on this once he can fly it — it is the single number most likely to change
after he plays, so keep it a one-line change forever.

## 11. The aerial view is REQUIRED — the flight ceiling may not simply be capped

P2 reported: **nothing is visible above ~900 m.** `V(clear) = 900 m` means a camera at that
altitude sees flat haze and nothing else. P2 was right to leave it alone (obligation T2) and right
to flag it.

The obvious fix — cap the flight ceiling below ~500 m so the player never reaches the blank — is
**rejected**. Look at what we are scoring against:

- `1939970_00`, our **hero plate**, is a flying car looking *down* at the city from above.
- `746850_00`, `_03`, `_08` — Cloudpunk's aerial plates — are the same shot.

Climbing above the towers and seeing the city laid out below is the signature moment of this
genre and of this game. A delivery pilot who can never gain altitude is missing the best thing
flying offers. Capping the ceiling would trade away the money shot to avoid solving a fog problem.

**Requirement for P4 (with P3b consulted, since it owns the fog and the shot cameras):** the player
must be able to climb above the skyline and look down on a city that is still *legible* — hazy,
layered, mostly dark, but there. How that is achieved is the builder's call with the fog model in
hand, not mine. The obvious direction is that looking down from altitude means looking *through*
the dense low band rather than along it, which is exactly what the plates show and what the
existing height-injected fog already models — but do not treat that as the specified answer.

**Aaron confirmed, and added the constraint that makes this cheap:**

> "yes I would like to be able to fly high. but most of the game would not involve flying high."

That second sentence is the important half. **High altitude is an occasional vista, not the play
space.** Deliveries, docking, traffic and the moment-to-moment game all happen down among the
towers. So:

- **Optimise for the low case; the high case only has to be good when you go there.** The common
  path must not pay a single frame of cost for the vista. If the aerial treatment needs extra work
  — a wider draw distance, a second fog curve, more LOD2 towers, a different exposure — gate it on
  altitude so it switches on as the player climbs and switches off again on the way down.
- **A transition is acceptable and expected.** The player is climbing for several seconds; a fog
  curve or draw distance that eases in over that climb is invisible in motion and much cheaper
  than making one setting serve both. Do not contort the ground model to also serve altitude.
- **The vista may be lower fidelity than the street.** Far towers, silhouettes, light-field haze
  and signage reduced to glow is fine and is what the plates actually show. It has to read as an
  enormous city seen from above, not resolve as architecture.
- The frame budget still applies at altitude, but the *content* of that budget can differ. Nothing
  says the same 30 draws must be spent on the same things at 800 m as at 80 m.

Constraints on whatever solution is chosen:

- It must not break §3.2.1's interlock, the static fog gate, or the LOD cross-fade.
- It must not brighten the *ground-level* look. Decision 10's far-haze tunable governs that and is
  a separate question.
- It must not cost anything at low altitude, where the game actually happens.
- If it genuinely cannot be solved without re-opening §3.2.1, say so and escalate to the manager
  rather than silently capping the ceiling.

---

# Tracked obligations

Things a phase discovered that a LATER phase must clear. Check this list before your phase's gate.

## T1 — CLEARED 2026-08-17 by the manager. Read this before the first critic round.

All six scoring plates are now audited at full resolution, and `plates.json` carries an `audit`
field on each recording what was found and why the rect is where it is.

| plate | finding | rect |
|---|---|---|
| `746850_01` | clean (P0) | none |
| `746850_02` | trim 0.12 (P0) | trim |
| `1939970_00` | clean — no HUD, no watermark, no cursor | none |
| `746850_03` | **a mouse cursor** sat near the ARCADE sign, lower right | `[0, 0, 0.88, 0.88]` |
| `1475810_04` | man + dog centre frame | `[0.65, 0.45, 0.35, 0.35]` |
| `1091500_08` | figure centre frame | `[0.0, 0.04, 0.40, 0.40]` |

Two things worth carrying forward:

1. **`plates.json` recorded `crop: null` for `1475810_04` and `1091500_08`** even though DECISIONS
   decision 1 said "use the architect's crop rects" — the numbers were never transferred. Both
   would have gone into a scored round with a person dominating the frame. A decision written in
   prose is not a decision applied to data; if a decision changes a file, change the file.
2. **Rendering the rect and looking at it caught a failure that arithmetic passed.** The first
   `1091500_08` rect (`[0.55, 0.10, 0.45, 0.45]`) is valid 16:9 and clears the figure's centre —
   and pulled his yellow shoulder back into the bottom-left corner. This is exactly the naval
   board's warning, and it has now cost a rect on this project too. **Never accept a rect you have
   not looked at.**

**Known gap — `day_smog` is soft.** The widest 16:9 rect clearing the figure is 0.40 of a
1920-wide source = 768 px, upscaled 1.56× to the sheet. Our render is crisp at native resolution,
so **resolution itself becomes the tell** unless `compare.mjs` renders `day_smog` at a matching
pixel width and lets the sheet upscale both halves equally. P3b must do this, or `day_smog` scores
are void. The same check is worth running on every plate whose rect is below ~0.5 of source.

---

## T1 (original text) — the `TRIM` HUD audit is incomplete → **blocks the first scored critic round (P3b)**

P0 audited only `746850_02` (trim 0.12) and `746850_01` (clean). **The other five plates are
unaudited** and `compare.mjs` warns loudly on every run until they are.

This must be cleared before P3b's first scored round, and it is not optional. An unaudited plate
with surviving HUD, a watermark or overlay text is a **tell** — our render never has a HUD, so the
critic can identify our image from the absence of one, and every score collected afterwards is
worthless. This is the same failure the naval board documents at length.

Clearing it means: open each remaining plate at full resolution, look at it, and either confirm it
is clean or record a verified 16:9 crop rect that removes the contamination. **Verify a rect by
rendering it and looking at the result** — arithmetic is not verification; the naval pass had two
rects that passed arithmetic and still leaked UI.

## T2 — `§3.11.2` does not name its own inputs

The static fog gate is P0 scope but `vis()`, `V(k)` and the per-variant fog table live in §3.2.1
and §4.1.1, which are not in P0's section list. P0 read §3.2.1 and put the distances in
`config.js` as `FOG`. **P1a's `sky.js` takes the fog COLOURS and must leave those DISTANCES
alone.** Any later phase touching fog reads both sections.

## T3 — the placeholder grade pass must be replaced

P0 wrote an inline ACES + split-tone + vignette + dither `ShaderPass` in `main.js` so "boots to a
graded black frame" could pass. It is marked for replacement. **P1a owns the real §4.6 grade** and
must remove the placeholder rather than leaving both.

## T4 — `wet_street` and `day_smog` cannot be compared yet

Their §12.1 crops give 0.63 and 0.84 aspect ratios against 16:9 placeholder cameras.
`compare.mjs` hard-fails with the exact `--w/--h` to author them at. **P3b's camera freeze must
author these two at the aspect the crop demands.**

## T5 — headless ANGLE stalls above ~5 Mpx on this machine

HalfFloat + 2× MSAA targets never return a screenshot above ~5 Mpx (`1600×900 @ dpr 2` hangs;
`780×1400 @ dpr 2` works). `shot.mjs` defaults to `--dpr=1` and warns. Use `--headed` for a real
dpr-2 capture. Do not spend an hour debugging a "hang" that is this.

## T6 — P3a's four plan defects: manager rulings

1. **Hero billboards read as PORTRAIT — accepted.** §3.5.5's 60–110 m band cannot exist on the
   seeded field: §3.1's 51.2 m lot minus a 13.2 m road caps a seeded building at 38 m wide, so a
   landscape 60 m billboard is a slab floating past its own tower. P3a's reading — the band is the
   tile's *long* dimension, heroes are portrait, placed on the highest continuous face ≥18 m wide
   with ≤1.6× overhang — yields 13 heroes across three districts against §3.5.5's 12. **Accepted as
   read.** Do not widen lots to chase the literal number; the lot size is load-bearing elsewhere.

2. **The six missing landmark sign words — DEFERRED to P10, aliasing stands.** `landmarks.json`
   names HAUL CONTROL, UNDERSTACK, KILN, SEVER, LADDER, NINEFOLD; the bake never produced them, and
   P3a aliased each to the nearest baked word (HAULAGE, SECTOR 7, HOT FOOD, NO ENTRY, LEVEL 12,
   TOWER 9). The aliases are plausible and the skyline reads correctly, so this is not urgent.
   **Do not re-bake `assets/signs.png` mid-run** — later phases consume it and its region table,
   and changing it under them invalidates their measurements. At **P10**: add the six words to
   `data/signwords.json`, re-run `tools/bake_signs.mjs`, drop the alias table in `signage.js`, and
   re-run `gates_p3a.mjs` to confirm nothing shifted.

3. **Signage is its own §3.2.3 work unit — accepted.** The plan and my P3a brief disagreed; the
   measurement settles it (1.70 ms bolted onto the LOD1 pass, 1.8 ms for a chunk's signage alone).
   The plan was right and my brief was wrong.

4. **§3.5.5's "1.2 m proud" is an output, not an input — accepted.** The 0.25 baked blade aspect on
   a 3.2–5.0 m tile gives 0.92–1.37 m. The tile aspect is protected by §3.10 #4, so the plan's
   figure is simply the midpoint of what the atlas dictates.

## T7 — the `gates_p2.mjs` amendment is ACCEPTED

P3a hid the signage layers for the duration of §3.2.2's R0 sweep. §3.2.2 has three parts; that gate
measures **part 3** (the dither cross-fade), while **part 2** (signage ramping) rides the same R0
and contaminated it — residue went 33 % → 53 % the moment signage existed, with the dither
untouched. Isolated, it reads 25–32 % against a 35 % limit.

This is the right call and the right method: **isolate the variable you are measuring.** A gate
that silently starts measuring two things is worse than a gate that fails. Every later phase adding
a layer that rides `R0` must check whether it has broken this gate's isolation the same way.

## 12. The blind critic's NUMBERS are noise. Its DIFFERENCES LIST is the signal.

P3b measured the instrument and it does not survive the measurement. **The same unchanging
reference plate scored 6.0, 7.0, 7.5, 7.0, 6.0, 6.5 across six rounds** — a ±1.5 spread on an image
that never changed, which is the same magnitude as the effect we are trying to detect. Two
calibration rounds were internally self-consistent (Δ0.5, Δ1.0) yet neither put a shipped
commercial screenshot above 7 under any prompt tried.

Consequences, binding from here:

- **Do not act on score movement between rounds.** A 1-point change is inside the noise. Any
  conclusion of the form "that edit gained us a point" is unsupported.
- **Act on the differences lists.** These have been consistently excellent and, more importantly,
  they *converge*: three independent critics named the same five problems, and P3b fixed exactly
  those. Qualitative agreement across independent critics is real evidence; a number from one
  critic is not.
- **The protocol's "either image below 8 → void" clause is measuring this critic pool, not the
  round.** Stop treating it as a per-round validity test. Record it and move on.

**How to score from now on (P5, P6, P10):**

1. **Three fresh critics per scored round**, each handed the same sheet independently. Report all
   three gaps and their mean. Variance falls as √n and, unlike the alternative below, blindness is
   preserved.
2. **Never resume a critic across rounds of the same shot.** It is tempting — it would remove
   inter-critic variance, which is the dominant term — but it silently destroys blindness: the
   critic sees one image change and the other stay identical, which identifies ours. A leak that
   subtle would invalidate every subsequent round without ever looking wrong.
3. Keep sides randomised, keys outside the repo, and the sheet named by opaque hex.
4. Report the **gap**, never the absolutes, as the headline.

## 13. Decision 10 was built on a misread number — CORRECTED

P3b found two errors in decision 10's premise, and I accept both:

- **`0.055` was the depth-band SPAN, not the far plane.** The far plane reads 0.0897 at gamma 1.0
  (`gates_p1a`'s own comment says so). So "we are 4× darker than the plate" and "roughly double our
  current value" were pointing at different quantities. My arithmetic was wrong.
- **The sweep did not move the complaint it was run for.** Distance separation was named by the
  critic at gamma 0.86 *and* again at 0.94. **The haze gamma moves overall brightness, not depth
  separation.** That is a genuine finding and it means the lever I specified was not the lever for
  the problem I specified it against.

**Settled at `HAZE.gamma = 0.94`** — far plane 0.1000, depth band 18 % wider than P1a's, frame mean
50.3/255 against plate `746850_01`'s 48.7. Good on its own terms, and closed.

The real cause of the flatness complaint was **light hierarchy**, which P3b addressed separately
(§3.7a city glow, per-window emissive variation, face shading, corrected bloom threshold). The
lesson: **a plausible lever, isolated correctly and swept honestly, can still be the wrong lever.**
Isolating proved it was not the cause — which is the experiment succeeding, not failing.

## 14. The low scores are structural: NO FOCAL SUBJECT. P5 is the fix.

Both scored shots ended round 3 below the gate (−3.0, −3.5). The critics converge on a cause that
is not a rendering defect: **both reference plates contain a hero craft, and our shots are
city-only.** There is no subject, no foreground, and no street-level ground truth.

- Do **not** spend further phases tuning the city against these plates. That is chasing a
  composition problem with a materials budget.
- **P5 (vehicles and traffic) is the highest-value remaining art phase** and its critic round is
  the real test. Re-score `fog_city` and `canyon_dive` after P5 with a craft in frame.
- `wet_street` is unscored and its plate is weak — `1475810_04` at §12.1's crop is 528 px of soft,
  nearly empty tarmac. Expect a bad score for reasons unrelated to our render, and do not act on it.

## T8 — CLEARED 2026-08-18 by P7b. All four, measured.

`tools/gates_p7b.mjs` is the record; `shots/p7b/_gates.json` is the data. **19/19 including 6/6
falsification.** The four gates, with the numbers:

| | gate | result |
|---|---|---|
| D1 | inline playback under mobile emulation | iPhone UA, `(pointer: coarse)` true, `paused false`, `webkitDisplayingFullscreen false`, `currentTime` advancing **modulo the 4.00 s loop** |
| D2 | the `play()`-rejection fallback | forced rejection → `<video>` removed, still at 384 px, scanline shimmer on, `__state.errors` 0 → 0 |
| D3 | zero `.mp4` on the job board | fresh navigation → board: **0 `.mp4`**, 3 × 96 px thumbs, **0** 384 stills |
| D4 | deleting `assets/clients/` leaves the game playable | directory moved off disk and the page reloaded: `__ready`, **0 errors**, 53 draws, board and panel opened, ACCEPT worked, 3 generated placeholders, **0 broken images** |
| — | `muted playsinline webkit-playsinline` | all present, read off the **live element**, plus `loop`, `preload="none"`, `disablepictureinpicture`, `poster` |

**D4b restores the directory and proves the restore**: 48 files / 1.32 MB, listing identical
byte-for-byte, and the running game sees them again (media mode `video`, thumbs `[96,96,96]`).

**Two traps this cost, both worth carrying forward.** D1's first version compared `t1 > t0` and
failed on a healthy clip that wrapped between samples. D3's first version re-docked instead of
reloading, and Chrome reused the `<img>` from the document's memory cache — so the board made **no
requests at all**, which reads exactly like the zero D3 is looking for. `F3` now proves the counter
can see an `.mp4` before D3's zero is allowed to mean anything.

---

## T8 (original text) — P9's four unmeetable gates MOVE TO P7b

P9 ran early (this run reordered it ahead of P7b). Four of its §13 done-criteria are assertions
about the **docking panel**, which does not exist yet, and cannot be met from P9's position:

1. inline playback asserted under mobile emulation,
2. the forced `play()`-rejection fallback path,
3. "zero `.mp4` fetched from the job board",
4. "deleting `assets/clients/` leaves the game playable".

**These are now P7b's, and P7b must not be signed off without them.** They are the difference
between media that exists and media that works on a phone.

**P7b's load-bearing requirements from P9** (also in `data/clients.json`'s `consumer_notes`):

- **`muted playsinline webkit-playsinline` are mandatory.** Without `playsinline`, iOS Safari opens
  the native fullscreen player and throws the player out of the game — on the platform the brief
  names first, on the main UI of the game. Without `muted` it will not autoplay at all. The files
  carry no audio track, so `muted` costs nothing.
- **Add no JS loop logic.** The ping-pong is baked into the file; `loop` alone is the whole
  playback path, and a seek loop can only make it worse.
- `preload="none"`, `src` set only when the panel opens; the job board uses the 96 px thumb only.
- `video.play()` rejects legitimately — catch it and fall back to the still.
- `tint_hex` per client is the neon colour the portrait was actually lit with; accent the panel
  with it and the UI will agree with the image.
- Read the count from `clients.length`. **Nothing in `js/` may contain the literal 16.**

## T9 — §9.5's prompt template and district count, for whoever extends the client set

- §9.5 says to rotate tint across "the six district palette colours"; `districts.js` has **eight**.
  P9 rotated across all eight, two clients each. Fix the number in the plan if it is ever re-read.
- §9.5's template alone will **not** produce sixteen distinguishable people — its only varying
  fields are age/build/look, and the gender-neutral "person" returned a man for "Mara Vells". P9
  added `gender`, `framing`, `light` and `backdrop` per client. The three constants §9.5 calls
  load-bearing (deep black background, lit only by neon, mostly black frame) are untouched.
- Known prompt artifact: **"courier client" appears to pull a gold-object motif into the mouth.**
  `sable_quint`'s "cracked tooth" hallucinated gold teeth; the reroll moved it to her cheek.
- Seeds are per-client and pinned in the manifest, so **rerolling one face never disturbs the other
  fifteen**. A client added without a seed gets SHA1-of-id, never wall-clock.
- Raw intermediates are at `~/cc/yru/gms/3d/neonhaul_client_raw/` — outside `site/`, same
  convention as `aaa_refs/`, so no `.gitignore` entry is needed and a crop or CRF change is a
  re-encode rather than a 90-minute regeneration.

## 15. Aaron's art feedback — SCHEDULED as P11, after the coding pass

Aaron flew the P4 build. **"my initial flight was easy. promising."** — P4's core requirement is
met by the only test that counts.

He then gave detailed art feedback and, importantly, told us when to act on it:
*"schedule in for after initial coding pass since a lot is still needed from original request
(cockpit, HUD, other vehicles, etc)."*

**Full brief in `docs/ART_PASS.md`. Do not pull it forward.** A game you cannot play is not improved
by prettier buildings. Order: P5 → P6 → P7a → P7b → P8 → **P11 art pass** → P10 ship.

Headline: the city is **repetitive and uncolourful**. Buildings need colour variety *within* a
single building, not just between buildings; neighbours should clash hard; signage needs a much
wider scale range including the occasional very large sign; close-up needs more detail; the ground
reads semi-transparent and should read as road.

**This independently corroborates the blind critic.** P3b's critics — who never saw Aaron's notes —
named the same root cause: *"no light hierarchy, every building face is lit by the same flat blue
ambient."* Two independent observers converging on one diagnosis is the strongest evidence this
project has produced. It also partly vindicates decision 14: the fix is not more materials tuning,
it is variety and hierarchy.

**Two items need care rather than obedience:**

- **The semi-transparent ground may be a BUG, not a style choice.** P3b added a water film and a
  mirror group. Investigate before styling it.
- **Sub-levels are a new FEATURE, not a tuning pass.** Aaron raised them as a "maybe" and asked for
  them to be considered for the plan. They touch the generator, collision, fog/LOD, the flight
  floor, the minimap and possibly missions. **Plan before building**, and decide with Aaron in
  front of a real design note. Do not let a speculative feature delay a playable build. The cheap
  version — deepening the *apparent* well without opening it — may buy most of the look for none of
  the cost, and is worth pricing first.

## T10 — `&&`-guarded isolation calls hide their own failure. Audit every gate. **P6 applies this.**

P4 reported honestly that it could not explain a 10× change in `gates_p2`'s dither residue —
250.7 % of control at baseline (failing 7/8 and 6/8), 24.7–25.2 % after P4 (passing 8/8 five times)
— and asked the manager to spot-check rather than take the green. Correct instinct, and it found a
real structural hazard.

**The mechanism.** Every isolation call in `gates_p2.mjs` is written defensively:

```js
await evalJSON(S, 'window.__game.setRain && window.__game.setRain(false)');
await evalJSON(S, 'window.__game.setSilhouettes && window.__game.setSilhouettes(false)');
await evalJSON(S, 'window.__game.freezeTime && window.__game.freezeTime(true)');
await evalJSON(S, 'window.__game.setSignVisible && window.__game.setSignVisible(false, true)');
```

**If a hook is missing or not yet attached to `__game` when the gate runs, the call silently
no-ops and the gate measures contaminated data — then reports a number as though it were clean.**
All four hooks live in `main.js`, which P4 rewired; a change in when `__game` is assembled is
enough to flip this. That is the most plausible explanation for 250.7 % → 24.7 %, and it needs no
appeal to an unexplained physical change.

This is the **sixth** instance on this project of a measurement that silently measured nothing —
after the silent audio clips, the layer compared against itself returning exactly 0.0, the frame
counter reading an absent header field, the PSNR check that measured the encoder, and P4's own
chunk-streaming race. It is clearly the dominant failure mode here.

**The fix, for P6 to apply (a small, safe, mechanical change):**

1. In **every** `tools/gates_*.mjs`, replace each `X && X(...)` isolation call with an assertion
   that the hook **exists**, and hard-fail the gate with a named error if it does not. An isolation
   step that cannot run must abort the measurement, never quietly skip it.
2. Grep all gate files for `&&` before a `__game.` call and fix every instance, not just
   `gates_p2.mjs`. Treat the pattern itself as the defect.
3. Then **re-run `gates_p2` at least three times** and report the dither residue each time. If it
   is stable at ~25 %, the isolation is genuinely working now and the baseline failures were the
   hooks silently not firing. If it moves, we have a real intermittent and it is P6's to chase.
4. While there: P4 measured `gates_p2`'s §3.2.3 `ms.gen` at 1.5 against a 1.4 cap at baseline.
   Confirm where it sits now and whether the cap or the code is wrong.

**Standing rule from here:** a test may never use `&&` to make its own setup optional. If a
precondition is missing, fail loudly. Silence is the bug.

## 16. §S2-R — road MARKINGS are deleted, not restyled; the deck is obsidian

**Settled 2026-08-25 by Aaron**, on the shipped build:

> Roads are part of the problem, they don't match up to buildings so look silly. We shouldn't draw
> them like this, it should look like a cool black surface/futuristic … in this cyber city we can
> imagine everything is auto-driven/most things fly and the only thing currently on the ground are
> some auto-trains, so why would road lines exist. … the black road could be a black partly
> reflecting surface perhaps, obsidian kind of look?

So `materials.js` `ROAD_BODY` carries **no carriageway at all** — no lane dashes, no edge lines, no
junction hatching, no kerb, and no `onRoad` term. This is a deletion and not a restyle, and the
reason is measurable rather than aesthetic: the paint was drawn on the idealised 51.2 m lot lattice,
and **502 of 4,132 seeded footprints (12.15 %) stand on it, the worst reaching 8.36 m in.** Moving
12 % of the city to fit the paint was never the cheaper option.

**Do not reintroduce a lane marking, a kerb line, or any deck feature on a 51.2 m period**, or on
any period that beats against it. That includes "just a faint guide line for the trams": the trams
are auto-driven, the whole deck is drivable, and a line on it re-creates exactly the mismatch this
removed. `gates_steer` S8 is a **source** check on `ROAD_BODY` for this reason — a pixel test would
pass on markings merely dimmed to zero.

## 17. §S2-R — the traffic steer is SIDEWAYS, and it is outside the determinism hash

Aaron chose, from three options put to him: *weave sideways, climb only over low masses* for the
flying population, and *steer around on the black deck* for the street population — and, offered a
fix at source in `city.js` that would have cleared every lane, **chose to keep the building overhang
instead**, because it is what creates the road tunnels he likes.

Two consequences that must not be undone by a later phase:

1. **`city.js`'s split-mass jitter stays as it is.** It is the reason `split` halves are thrown over
   the street line, which is the reason corridors cross masses at all, which is the reason
   `js/tunnels.js` has crossings to dress. Tidying it would silently gut a shipped feature.
2. **The steer is a RENDER-TIME displacement and is deliberately outside `hash()`.** `posOf` and
   `roadPosOf` remain the definition of where a vehicle is; the golden hash `f29beaf9` is unmoved.
   Anything that folds the offset into the analytic position makes traffic depend on which chunks
   have streamed, and determinism stops meaning what `gates_p5` and `determinism.mjs` say it means.

## T11 — falsify a gate at the margin it OPERATES on, not at the extreme

`gates_p11` P1 asserted no building stands on the painted road corridor, reported zero, and passed
for two phases. Its test used `Math.min` where it needed `Math.max`, demanding a footprint encroach
on both axes simultaneously. **Its two falsification arms passed the whole time** — they widened the
road to 26.4 m and 38.0 m, where every mass trips both axes, so both went red on cue while the check
measured nothing.

Every one of the eighteen prior instances was a control that did not exist or did not run. This is
the first where the control existed, ran, and was itself fooled.

**The obligation:** when adding or reviewing a falsification arm, ask what it would have caught at
the setting the gate actually operates at — not merely whether it goes red at some setting. An arm
that only exercises the extreme is evidence about the extreme. Where an operator or a predicate is
the risk, make **the operator itself** the arm: P1 now prints what the same probe returns with
`Math.min`, beside the number it hid.

## 18. §S2-S — pc_m is recast to `am_echo`; the carrier idea is REFUTED by the listener

Aaron on the shipped intro: *"the male voice sounds awful, at least the first 3 times he speaks …
it still sounds like a computer speaking."* His "first 3 times" pins the interruptions — `int1`
`int2` `int3`, which `for_say()` hands Kokoro as one word plus a comma ("But,"). That gave two
candidate causes, and they are different fixes:

* **A — the voice.** `am_liam` was cast on the reasoning that it is the youngest-sounding male.
* **B — the input.** A neural TTS has no prosody to work with in a bare word, so synthesise the
  whole sentence and keep only the opening word, cut on the model's own `end_ts` (`keep_words` in
  `kokoro_say.py`). This was **Aaron's own suggestion**: *"you could generate more text around it
  with punctuation around the key words and separate the words after if that helps?"*

Both went in front of him as 104 rated clips (`tools/vo/audition/`, ratings in `votes.json`).

**A is the cause. B is refuted, and refuted by the person whose ear is the acceptance test.** Of the
36 carrier clips, `carry` and `carry_ov` were rated bad almost everywhere they appeared, including
on voices whose plain read he rated 4/4 — `am_michael` scored 4/4 on the shipped punctuation and 0/3
on `carry`. The idea was sound, the implementation worked exactly as designed, and it sounds worse.
It is kept in the tree because `keep_words` is opt-in and cost nothing to leave, but **nothing calls
it**, and the 207-clip chatter pool renders byte-identically.

`am_liam` scored **1/4**, and scored 1/4 again in the independently-presented section that re-rated
the shipped clips — the only cross-check that tape had, and it agreed with itself. `am_echo`,
`am_michael`, `bm_lewis` and `bm_fable` all scored 4/4; Aaron picked `am_echo`. `bm_daniel` scored
0/4. Speed and pitch stay at **1.04 / 1.02**, the settings the audition rendered at, so the take he
approved is the take that ships.

**Pitch is not the axis, and a number said so twice before a person did.** An F0 screen over the
shipped clips reported the male take moving 12.83 semitones against the female take's 10.05 — the
male one is "more expressive" by that measure, and it is the one he called a computer. Measured
across all eleven voices, median F0 does not order the ratings at all: `am_liam` (rated 1/4) reads
at 129.7 Hz, **higher** than `am_echo` (rated 4/4) at 113.1 Hz. This is the second time in this
project a believable number has scored a voice pool against the listener — whisper put the 1990s
`say` pool at 90.7 %.

**Asked, tested, and answered NO:** Aaron's *"Lewis is probably my favourite voice but is an older
voice, may work of made higher in pitch?"* — and, having heard the ladder, *"the higher pitch on
Lewis did not work. stick with echo."* `bm_lewis` is the lowest-pitched voice
that rated well (99.8 Hz). `pitch_probe.py` re-treats its existing takes up a ladder that straddles
`am_echo` — 1.02/1.12/1.22/1.32, measured at 99.8/107.0/110.8/120.5 Hz — because the shift is a
resample, so formants move with it and it should read younger rather than merely higher. The first
draft of that ladder (1.02–1.14) moved F0 by 1.2 semitones and was **too narrow to hear**, which a
spectral-centroid check failed to notice: centroid was flat across every rung, and a deliberate
1.50 control proved the centroid blind rather than the ladder broken. The widened ladder was
audible and still wrong, which is the useful outcome — the objection to bm_lewis is not its pitch.

**So all three questions this section opened are closed, and the audition page is now only the
twelve clips that ship.** Aaron: *"don't leave old stuff on the Web page. only keep stuff for me to
review only."* `build.py` builds the shipping group alone; the ratings stay on disk as the evidence
the cast note cites, and `voice_probe.py` / `carrier_probe.py` / `pitch_probe.py` stay as the record
of what was tried, wired to nothing.

**Unexplained and left that way:** *"Some had strange glitches at the end of But and Wait."* Both
words end in /t/, so the plausible story is that `room()`'s trailing `silenceremove` eats the
plosive release. Measured, it does not — shipped clips carry MORE high-frequency tail energy than
the raw takes, and no arm of the audition shows a waveform discontinuity. No mechanism was found,
so none is claimed. If it persists on `am_echo`, it is still open.
