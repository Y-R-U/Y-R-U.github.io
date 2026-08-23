# KITEHAWK — decisions log

Append-only. Numbered so later docs can cite them. The manager owns this file.

**D1** — The game is a painterly 2D biplane game, mobile-first **portrait**, at `gms/2d/kitehawk/`.

**D2** — **Portrait is the thesis, not a compromise.** A tall viewport is a tall column of sky, and
a dogfight is fundamentally about energy and altitude. Aaron said portrait is what he wants to try
and that we may pivot if it does not work. Therefore: portrait is primary, landscape is a
first-class config from day one, and the pivot is decided by a **numeric gate at the flight-model
phase** — not by anyone's taste. Agent A owns the gate's criteria.

**D3** — **One thumb.** Hold-and-slide is the stick, throttle is automatic, guns auto-fire in a nose
cone. Aaron's brief said "fun, easy to play". Skill expression comes out of the flight model, not
out of extra buttons.

**D4** — **Parachute crates are the signature mechanic**, explicitly requested ("box parachutes from
sky"), and they are the upgrade economy. They must be in the first playable build, not deferred to
a content phase.

**D5** — **Paint the world, code the actors.** Backgrounds are generated painted parallax; aircraft,
silk, smoke, fire and tracers are drawn procedurally so dynamic light actually falls on them. This
is the specific technique that made Sunderfall read as expensive, and the reason is understood
rather than cargo-culted.

**D6** — **Nothing loads from a CDN.** A CDN import has silently hung every other 3D game in this
repo with no console error. Everything is vendored locally.

**D7** — **The game is fully playable with the audio folder empty.** Every spoken line falls back to
a text card, authored once and usable as either. Asset generation never blocks a milestone. This is
the NEONHAUL contract and it is why that project could ship before its audio existed.

**D8** — **SUNO is reserved for voices that need character**; local Kokoro/Abogen does the bulk.
NEONHAUL established that Kokoro is an audiobook reader with no dial marked menace.

**D9** — **Agents never run git.** The manager stages selectively, because other sessions have
uncommitted work in this repo. At every playable milestone: commit, push, and ensure the
`projects.js` entry exists.

**D10** — **Blind critics decide whether the art is good**, not builders. Builders in this repo
reliably self-score 7–8 on work that blind critics score 3.

**D11** — Concurrency default is **one agent at a time**, for usage-limit reasons. 2026-08-23's
four-agent batch was a window Aaron opened for that batch only.

**D12** — The four planning agents own **disjoint files** and are told to raise cross-document
assumptions as REQUESTs. Parallelism is bought with ownership, not with coordination.

**D13** — **Name ratified: KITEHAWK.** Aaron confirmed 2026-08-23. It is no longer a working name.
Still keep it out of identifiers where a constant would do — that is now hygiene, not insurance.

**D14** — **Renderer: port Sunderfall's WebGL2 batcher + particles.** Aaron confirmed 2026-08-23.
Agent A's job is no longer whether to port but *what the port must add* for a biplane game — huge
parallax sky layers, a very tall portrait viewport, cloud decks, long thin canopy shapes, motion
streaks. If A returns evidence the port is unsound it comes back to Aaron; otherwise it proceeds.

**D15** — **The manager makes all subsequent calls without asking.** Aaron, 2026-08-23: *"you can
make all calls from now, but do give me a clear concise summary where I should review your calls
where it is not obvious."* So:
- Decide and proceed. Do not block on Aaron for design, tech or content choices.
- **But surface the non-obvious ones**, concisely, at the point they are made — a call is
  non-obvious when a reasonable person would have chosen differently, when it forecloses something
  later, or when it changes what the game *is* rather than how it is built. Obvious//routine calls
  need no mention.
- Everything is *tweakable later* by default; say so when a call is cheap to reverse, and say so
  loudly when it is not.
- Exceptions that still go to Aaron regardless: anything irreversible or outward-facing (a force
  push, a rename of a live path, deleting generated assets), and the portrait→landscape pivot if
  the D2 gate fails — that one changes the game he asked for.

**D16** — **SFX are procedural code, ported from Aaron's `gms/3d/forge_test/audio/` lab**, not audio
files. Verified 53/53 clean by running its own harness on 2026-08-23. Music and voice are unchanged
(still generated files, D7/D8). Full inventory, gap list and rules in `SFX.md`.

**D17** — **The one-shot/continuous split is the real work.** The forge_test lab is entirely
one-shot (`play(eng, o)`), and a biplane game's signature sound — the rotary engine — is continuous
and parameter-driven every frame. A **sustained-source layer is added to `core.js` in P1**, with the
renderer, because it is engine architecture; the aviation content sits in P9. Retrofitting sustain
into a one-shot engine late is the expensive version of this.

**D18** — **Dynamic camera zoom, automatic, with a user preference bias.** Aaron, 2026-08-23:
*"I'm happy for camera to zoom out/in at times, this may give us more flexibility when more screen
horizontal realestate is needed?"* Yes — adopted, and it strengthens portrait (D2). Rules:

- **Automatic, not a player control.** A zoom button is a second input in a one-thumb game (D3),
  and a manual zoom becomes a mandatory skill — the player who doesn't use it is simply worse,
  which is what "easy to play" forbids.
- **But a persistent bias setting** in options — tight / normal / wide — shifting the whole auto
  range. This is the Hotwire pattern (pulled-out by default + a live slider) which Aaron liked.
  A preference is not a per-moment input, so it costs nothing at the thumb.
- **Framing-driven, not speed-driven.** Out when a tracked threat is about to leave frame, closing
  speed is high, crates are contested, or a large target must fit. In when alone, slow, landing, or
  in a story beat — the painted art is the reward for zooming in.
- **Asymmetric slew: zoom out fast, in slowly**, with hysteresis. Never zoom in and lose a threat;
  never pump.
- **Total range clamped** (start at 0.8×–1.3× of base, ~1.6× span) and rate-limited. Beyond that the
  world reads as a map, and the painted layers stop holding up.
- **Zoom changes the view only, never the sim.** Auto-fire cone range, turn rate and weapon range
  must not vary with zoom, or zoom silently becomes a difficulty modifier.

**The honest cost, which the gate must now measure:** in portrait, width is the scarce axis, so
zooming out to buy horizontal room spends **silhouette legibility** faster than it would in
landscape. Zoom does not remove the D2 gate — it changes what the gate measures. The gate is now
evaluated **across the zoom range**, and must show that at maximum zoom-out the fight fits *while*
the enemy silhouette stays above the legibility floor on a 390×844 screen. If those two cannot both
be true at any zoom level, that is the pivot signal.

**D19** — **The altitude ladder is SIX bands, named Mud / Belt / Floor / Deck / Lane / Blue.** The
three planning agents diverged: A cut five, C designed six art treatments, D named six and uses the
words in ~40 briefings and every radio line. Six wins and the **names are frozen**; agent B owns the
edge altitudes. Resolved before any code or art was authored against it, which is the whole reason
the planning docs were written first.

**D20** — **The name KITEHAWK is load-bearing in the script.** A kite is the bird that takes what
another bird has caught, which is literally the mechanic; in D's script it is the *enemy's* word for
the player, spoken only by Drach and the Countess. Ratified at D13 anyway, but this is the argument
for it. If Aaron ever drops it, only those two lines change.

**D21** — **Flux model is a per-asset choice, not a global.** Agent C's A/B showed
`flux2-klein-9b-mlx-4bit` clearly beats `flux2-klein-4b` on structured subjects (struts, rigging,
pilot, prop disc) at 39% slower, while 4B is better *and* faster on atmospherics. The manifest
carries a model field per asset. This contradicts the blanket `flux2-klein-4b` in `MANAGER_BRIEF.md`
§6; the brief is superseded on this point.

**D22** — **`negative_prompt` is close to inert on this model.** Plates produced text, signatures and
cream paper mounts despite being told not to. The fix is a deterministic 4–8% crop, not prompt
wrestling — and **never ask Flux for lettering**: roundels and stencils are code decals.

**D23** — **The Verrine Air Board changes voice from `am_echo` to `bm_george`.** Agent F caught that
D's own rule — British voices are Verrine, American voices are Kohlgard/Concord — was broken by its
own table for exactly the part where it is load-bearing: Act 4's turn is *our own side gave this
order*, and an American Air Board tells the player for free that it came from the enemy. Applied at
P9; `SUNO.md` is stale on this line until then.

**D24** — **The Kokoro speed dial does not mean what `SUNO.md`'s table implies.** F measured all 15
voices on one identical control sentence: each voice's base rate dominates the speed multiplier.
`grelle` at 0.92 is the 4th *fastest* voice in the game; `drach` at 0.90 is mid-pack, not slow; and
Hurdy, the most-heard voice, sits only 9 wpm from Aurie despite a much higher speed setting — under
5%, which will not read as a character trait. **Pace must be tuned against measured wpm, not against
the multiplier**, at P9. The Ferrys/Baumgart/Roo bottom three and the Ferber pair already do what D
intended and should not be touched.

**D25** — **The British voice bench is full.** Kokoro ships 4 British female voices (all assigned)
and 4 British male, of which `bm_george` is the last free one and D23 now spends it. **Any further
British recast requires an American voice or a SUNO take** — worth knowing before someone promises
a new Verrine character a voice that does not exist.

**D26** — **1 world unit = 0.15 m, and SI is the source of truth.** Agent A's `1 wu = 8 ft` is wrong
by ~16×: it makes A's own stall constant 268 m/s and its Vne 1512 m/s. A picked the scale to make
its altitude column read as 12,000 ft and broke every speed; B derived the physics and broke the
column. **The physics wins.** Manager-verified arithmetic:

| | |
|---|---|
| scale implied by A's stall vs real physics | 0.162 m/wu |
| scale implied by A's Vne | 0.145 m/wu |
| **adopted** | **0.15 m/wu** |
| corroboration — C's hull is 64 wu | 9.60 m, vs a Camel at 5.7 m × C's own K=1.6 = 9.12 m |

Three of the four docs independently agree at ~0.15; only A's column figure dissents. Flight
constants are **authored in SI and derived into wu**, never the reverse — that is what stops this
recurring. Portrait then shows **150 m of sky** at zoom 1, and a dive recovery is 105% of portrait
height (the manoeuvre still does not fit landscape, so A's conclusion survives its own bad number).

**D27** — **"All six bands legible at once" is impossible and is struck from the gate.** At any sane
ceiling the arithmetic kills it: fitting a 1,500 m column puts the hull at **5.4 px** on an 844 px
screen; a 6,000 m column puts it at **1.4 px**. A's P4 criterion (=6 bands at `zoomEstablish`)
could only ever have been passed by pinning the camera at a zoom that turns the game into a map —
the exact workaround-inside-a-gate shape this repo has been burned by, and the thing B's own REQ-B4
was written to prevent. **The ladder is a journey, not a composition.** P4 becomes ≥2 bands at
combat framing, ≥3 at establish, plus a *traversal* criterion: climbing through a boundary must be
legible as a transition. C's "punching up through murk into gold" is unaffected — it was always a
transition, never a static frame.

**D28** — **The playable ceiling is ~1,500 m; the Concord Line stays at 4,000 m and is therefore
unreachable — permanently.** This was a four-way conflict (A 3,658 m, B ~1,100 m, C normalised on
6,000 m, D's Line at 4,000 m) and the resolution costs nothing because **it is what D's story already
says**: *"It does not land and never looks down."* You can never climb to the Line, touch it, or
threaten it. You only ever get what it drops. The unreachability is now mechanical fact rather than
characterisation, and Act 5's ending lands harder for it. Consequences: C's LUT input normalises on
the playable ceiling, not 6,000 m; a crate is released at 4,000 m and its canopy fully deploys as it
enters reachable sky, which is also why the player has ~90 s and not ten minutes. **B owns the exact
band edges** within the ceiling; the count and names are fixed by D19.

**D29** — **47 numbers changed in the units correction, and 6 were errors nobody had flagged.**
Manager-verified: gravity was **620 wu/s², correct is 65.4** — wrong by 9.5×; drag `k` wrong by the
same cause; max pitch rate 150 °/s was 12 physical g at corner speed; best climb claimed
ground-to-ceiling in 15.6 s. **All six were internally consistent with the broken scale, which is
exactly why they were invisible on inspection.** The lesson is now anti-footgun rule 16: *verify
every derived constant against a physical identity* — `v_term = √(g/k)` is what caught gravity.
Corroborations that the new scale is sound: gun range 440 wu = **66 m** (WWI guns were effective at
50–100 m; under the old scale it was 1,073 m), zeppelin 1400 wu = **210 m** against a real L30 at
198 m.

**D30** — **"≥3 bands at establish" means the establishing SHOT, not a static frame.** A static frame
cannot do it — three bands need zoom 0.33 and an 18 px hull. A slow vertical crane crossing three
bands is faithful to D27's own "the ladder is a journey, not a composition", so the criterion stands
as written and A's reading is ratified.

**D31** — **A mission occupies a 2–3 band slice of the ladder, not the whole column.** A full climb
is 107 s against a ~131 s mission, so whole-ladder missions would be mostly climbing. The five
forced climbs (L14/25/58/69/84) are the deliberate exceptions and are better for being rare. Note
this is softened by the zoom-climb: trading Vne for altitude buys **427 m — nearly two bands — in
about 9 s**, so a pilot who understands energy is never grinding upward. That is real physics
falling out of the corrected scale and it is the best thing the correction handed us.

**D32** — **OPEN, for the flight phase: the 4.5 g structural limit is now decorative.** Manager check:
even the corrected 126 °/s is **8.5 g** at corner speed, and a sustained turn is 10.1 g — both well
past 4.5. A responded by making the HUD print a normalised **STRESS** reading rather than a g number
that would be a lie, which is the right call for the HUD but leaves the structural constant meaning
nothing. Resolve at the flight phase by either restating the limit or lowering the agility multiplier
`A` (floor 2.67, below which the combat turn stops fitting portrait). **Do not let it stay in the
tables looking load-bearing.**

**D33** — Minor, for whoever implements aero: with `g = 65.4` and `k = 2.085×10⁻⁴`, the identity
`v_term = √(g/k)` gives **84 m/s**, not the intended 90. `k ≈ 1.817×10⁻⁴` hits 90. 7% — fix at
implementation, not worth a doc pass.

**D34** — **The gouache drift was caused by a weak prompt stem, and all three of agent C's proposed
fixes were wrong.** Agent E ran 30 plates over 5 rounds. Fix 2 (fewer steps) is a **clean negative** —
steps 10–18 do not touch style on this model. Fix 1 (repeating the medium clause) adds paper grain
and nothing else. Fix 3 (edit mode) is subject-dependent: it rescues a zeppelin, imposes sumi-e ink
wash on FX, and does nothing to a mechanical prop. The real cause: nouns like "WWI zeppelin" and
"flak burst" carry a training mass of archive photography and VFX stock, and a stem that only names
a medium loses to them. **The isolation test is the proof** — same subject, same seed, only the stem
swapped, photoreal render → painted illustration. **New stem, replacing ART.md §7:**
`Hand-painted gouache painting in the style of a WWI aviation poster and a Studio Ghibli aviation
film, visible brush strokes and paper grain, romantic and beautiful,`

**D35** — **For FX, describe the paint mark, never the phenomenon.** "Smoke puffs" returns smoke;
"a ragged torn-edged blot of thick opaque paint" returns paint. Any multi-item sheet must also carry
"all different, no two alike" or the bake produces a row of clones.

**D36** — **D21 is nuanced: 9B renders better but PAINTS worse.** Use 9B for large structured subjects
(the zeppelin, aircraft), **4B for props and FX**. Not a simple size-of-model ladder.

**D37** — **Small mechanical props are improved but NOT fixed, and the answer is code, not prompting.**
E chased it with four further levers — edit mode, explicit brush language, native atlas size, "two
flat tones" — and all four failed; generating small made it *worse* by strengthening the "3D game
asset" prior. Adopted: a deterministic **`poster.js`** bake between `key.js` and `trim.js` —
quantise luminance to 5–7 bands, multiply in the shared paper grain, irregularise the alpha edge,
drop the residual cast shadow. Same shape as C's crop lesson: stop wrestling the model, post-process
deterministically.

**D38** — **The terrain atlas is only PARTLY unblocked.** `CLOUD_MID`, the FX brush sheet and large
painted hero objects can generate now. **The small-prop half of `TERRAIN` waits** for `poster.js`
plus one blind-critic contact sheet — generating 40 props at 6/10 and discovering it at atlas time
is precisely the waste this A/B was run to prevent.

**D39** — **OPEN: ART.md §7's neutral-light rule fights the style fix.** `even overcast light, low
saturation, neutral grey-blue` strips the warm-key/cool-shadow contrast that makes the winning
plates read as painted, yet it is what allows one asset to serve five acts through the LUT. Resolve
with a small follow-up A/B: either accept props as the hard case and lean on `poster.js`, or make
`TERRAIN` props act-exclusive and prompt them in palette.

**D40** — **Build the complete game without checking in.** Aaron, 2026-08-24: *"you don't need my go
ahead, I want you to do the complete game, only once we can play test will we consider tweaks and
improvements."* This supersedes any habit of pausing between phases:

- **The manager does not wait for permission to start the next phase.** When a phase agent reports
  and its claims are verified, the next one is spawned immediately. Idling to ask is now the wrong
  behaviour, not the safe one.
- **Playtest is the only checkpoint.** Do not solicit design opinions, art opinions or tuning
  preferences before there is something to play. Aaron will form them by playing.
- **Still surface, without stopping:** non-obvious calls (D15), and anything that contradicts the
  brief. Report and keep building — a report is not a question.
- **Still goes to Aaron regardless:** the portrait→landscape pivot if the gate fails, and anything
  irreversible or outward-facing beyond the routine commit/push he has already authorised.
- Concurrency is unchanged: **one build agent at a time** by default (usage limits), plus the blind-
  critic exception. That rule was never lifted, only the asking.
- Commit and push freely at every milestone (D9), and register in `projects.js` once something is
  playable.

**D41** — **BUILD_PLAN.md supersedes the provisional phase table**: 17 phases, each brief
self-contained, no brief over ~10 KB. Its §6 carries 15 rulings on contradictions DECISIONS had not
settled; those rulings are accepted. Three matter:
- **R-01: DESIGN and ARCHITECTURE describe two different aeroplanes.** At 45 m/s, ARCHITECTURE's
  126 °/s is a 10.1 g turn while DESIGN's wing cannot exceed ~6.4 g there. **DESIGN wins on model
  form, ARCHITECTURE on envelope targets**; P4 re-derives mass/area/CLmax/CD0/thrust to fit both.
  The turn diameter and dive-recovery extent may not move — the portrait gate rests on them.
- **R-08, a real bug behind D33:** ARCHITECTURE §3.4 puts terminal velocity (84 m/s) *below* Vne
  (93), so **a dive could never overspeed the airframe** and DESIGN's whole "over the red" regime
  was unreachable. D33 read this as a 7% coefficient error; it is worse than that. Fix: terminal =
  Vne × 1.02–1.05.
- **R-02:** ARCHITECTURE's provisional band table violates its own minimum-band constraint (Mud at
  333 wu against a 700 wu floor). BUILD_PLAN's canonical six-band set replaces it.

**R-15 amends ARCHITECTURE §5.1's audio-facade ownership** — the only override of the frozen
contract, and it is accepted because the audio module is being built now.

**D42** — **Back to ONE build agent at a time, and the usage tracker is report-only.** Aaron,
2026-08-24: *"best to be safe than have all agents stop because we run out of usage."* The four
agents in flight finish; nothing replaces them as they complete.

**The tracker is unverified and must not drive concurrency.** Two things in it are guesses: the cost
weights (only ratios matter, but they are approximations, not measurements) and the block phase,
anchored on a *single* real `/usage` reading — one data point fixes both the limit and the phase, so
a systematic error in either is invisible. Its gap-inference fallback was wrong by nearly three
hours on its one test, which is why the scepticism is well founded.

Verification is **pre-registered** so it cannot be fudged after the fact: predictions are written to
`~/cc/usage/prediction_HHMM.json` *before* any comparison, and `~/cc/usage/VERIFY.md` says how to
check them. Two or three readings across different burn rates will show whether the error is a
constant scale factor (recalibrate) or drifts with load (the weights are wrong). Until then it is a
report, not a control input.

**D43** — **The audio engine landed with the sustained layer, 89/89 harness rows clean and 9/9 gates
passing — and every gate was proven to go red when its feature was reverted.** That last part is the
only reason to believe the first part: silence a one-shot and A1 goes red; disconnect the `rough`
parameter and A2 falls to 0.218; neuter `stop()` and A3/A7 go 0/15; force doppler to 1 and all four
sources read exactly 1.000; remove the cap and A6 reads 22/12. A test that still passes after you
revert the fix was never testing it, and this repo has been bitten by that twice.

Four bugs the harness caught that source review did not:
- Misfire only dipped the firing tone; a dead cylinder takes the exhaust with it.
- **Mean RMS is the wrong instrument for an intermittent parameter** — an 80% dip 20% of the time
  barely moves the average, so a knob wired to a dramatic effect measured the same as one wired to
  nothing. Fixed with envelope-modulation depth.
- The rotary's filters did not doppler-shift, only its oscillators, so passes sounded thin.
- **Two pitch proxies were believable and wrong on the zeppelin** — its engine beat swings the metric
  more than pitch does, and a Goertzel bank 0.4 Hz wide samples arbitrary slivers. Replaced with an
  averaged FFT centroid plus a doppler-clamped control render. A plausible-looking wrong metric is
  more dangerous than an obviously broken one.

**D44** — **Nobody has heard a single sound yet, and that is the honest state.** The harness proves
each effect responds; it cannot prove any of it is *good*. Least confident, in order:
`zeppelinDrone` (the beat may wallow), `stallBuffet` (an LFO can read as tremolo, not buffet),
`wireHum` (risks theremin rather than structure), `ricochet` (cartoon-zing risk). **These need
Aaron's ears or a blind critic before P15 content lands.** All defaults are agent guesses; per
`SFX.md` the values Aaron lands on in the bench are what ship, and the bench emits a
machine-applicable `DEFAULTS` block for exactly that.

**D45** — **Layout call: the audio engine lives at `js/audio/` with the bench at `tools/sfxlab/`.**
ARCHITECTURE §5's tree has no slot for either — §6.8 names only `core/audio.js` and §2.6 said not to
port the DSP bank, which D16 later reversed. Accepted. Two consequent amendments to the frozen
contract, both additive: §6.8 gains `param()`, `place()`, `handle()` and `update()` to drive a
running source (it had no way to), and **§6.8's file-first SFX resolution order is superseded by D16**
— the procedural bank is primary for SFX, while music, ambience and VO keep the file-first path.
P2 owns the one-line re-export in `js/core/audio.js`.

**D46** — **P1 landed: the renderer port, 2,494 lines, measured on a real GPU** (ANGLE Metal, not
SwiftShader — worth stating, because software rendering would have made the draw-call numbers
meaningless). 5,000 sprites across 8 layers = **9 draw calls at 60.0 fps at 390×844**; 8 without the
additive stream, i.e. exactly one draw per layer, so Sunderfall's chunking claim survives the port.
9,000 sprites still 9 draws at 60 fps.

**D47** — **The falsification technique P1 used should be the house standard.** It did not merely
assert `parallaxY` was implemented correctly — **it shipped the forbidden screen-space shortcut
alongside it as `?impl=screen` and ran both through the gate.** The result is the point: the
shortcut passes the axis-decoupling check *identically* (802.20 wu, same to two decimals) and only
fails the zoom-invariance check, by 53.6/164.3 wu. **One of the two criteria could not have caught
the bug it was written to catch.** Measurement was done by reading the marker back out of the
framebuffer and inverting the shader, not by re-running the same arithmetic in JS — which is the
difference between testing the renderer and testing your own formula.

**D48** — **P1 refused to move a threshold to make a gate pass, and was right.** Two criteria are
worded against the wrong quantity: R5 asks for "light contribution unchanged within 3/255", but
under a correct ramp the *ratio* is invariant while absolute contribution must scale with the ramped
albedo; R7 measures feature strength over the rig's bounding box, which divides footprint-local
effects by the rig's 57.8% coverage of that rectangle. The shipped defaults are the ones that look
right in `shots/p1/parts_five_way.png`, not the ones that clear a mis-specified number. **Fix the
criteria at P16, not the constants.**

**D49** — Accepted from P1: `R.mesh` stays deferred (the 6-segment canopy works); the **world-space
brushwork term is drawn as a per-part overlay sprite**, not a third sampler in a frozen shader —
flagged now so P16 does not discover it as a renderer change; and **ramp LUTs are authored as
ordinary sRGB 256×1 strips** (the renderer squares them into linear, because every other texture
here is display-space and without it a ramped layer sits visibly brighter).

**D50** — **Vertex jitter is a close-up feature only, and this bounds what the art pass can rely on.**
At combat framing the hull is ~54 px, so jitter big enough to see would be half a wing chord. It is
now sized relative to each part's geometric mean extent. **The features carrying the painted read
during a fight are the three tones, the loaded edge and the grain** — jitter earns its place only
when the camera pushes in.

**D51** — **`poster.js` works and props are still blocked. Both are true.** The bake lifts
warm-key/cool-shadow contrast from 13–38 into the **37–84 band where the references sit**, and it
kills the cast shadow deterministically. But three blind critics over two rounds picked the
reference instantly and scored our sheet **3.33 against 7.67–8.00 — a gap of −4.5 against a −2.0
gate**, calling it "flat", "posterise", "filter", "wallpaper". **The manager looked at
`docs/refs/poster/in_situ.png` and agrees with the critics**: the painted ground is excellent and
the props are pasted onto it.

**The diagnostic that matters: tuning moved the score 3.33 → 3.33 while the critics' differences
lists changed completely.** That is the NEONHAUL shape, and it means the remaining gap is **not in
this step**. Six critic-named defects were genuinely `poster.js`'s and are fixed; what still fails
is generation.

**D52** — **The remaining prop failures are generation-side, and one is a carve-out to D36.**
1. Ground gets painted in despite `no ground` — D22 again, negatives are inert; crop or compose.
2. **Amputated structure** — watchtower legs, no gun trail, no MG support. **D36's "4B for props"
   needs a carve-out: props with a load-bearing part tree need 9B**, which is what D36 already says
   about structured subjects. 4B stays for FX and atmospherics.
3. **D35's "all different, no two alike" was missing from the prop prompts** — the agent's own
   omission, self-reported. Instanced drums and crates came out as clones.
4. Period drift — three of eight assets are post-1930.
5. **Contact shadows must be code-drawn** (D5), not baked. Props float exactly as the critics
   describe, and no bake step can fix a shadow that has to respond to ground and light. **This is a
   renderer requirement, not an art one** — it belongs with the actor draw path.

**D53** — **D39 resolved: keep the neutral-light rule and lean on `poster.js`.** Controlled A/B, 8
plates, seed and subject held, only the light clause varied. Neutral raw scores 12.7/23.3 against
references at 45.5/81.9 — agent E's diagnosis was right — but neutral **+ bake** lands at 34.8/71.1,
inside the band with no act colour baked in, while in-palette variants overshoot to 82–146. Cost:
props now depend on the ramp-map actually shipping. Worth knowing: **`p04_cloud_cutout`, the plate
`ART.md` §8 calls "the pipeline result", was never prompted neutral-lit** — the best shared asset in
the project already breaks §7's rule, and what it has is neutral *saturation* with directional
*temperature*, which is exactly what neutral + bake produces.

**D54** — **Sky atlases delivered: 40 accepted plates, 18.5 MB, 121 minutes of queue across 75 jobs.**
All 24 `CLOUD_MID` cutouts at bar, four FX marks at bar, the zeppelin reproducing `z10` bit-for-bit,
plus château/bridge/cathedral. Real throughput was **75–90 s per plate against `ART.md`'s "~1
minute"** — right for an idle queue, ~50% optimistic when shared. The 26 rejected plates are
gitignored: they are exactly regenerable from `art/gen/manifests/`, and 17.1 MB of dead ends is not
worth carrying forever.

**D55** — **768×768 is the ceiling for an isolated cutout on this model, and this contradicts
"generate large and downscale".** Same prompt, same seed, only the canvas changed: 896 gives a paper
mount, 1024×768 gives scene furniture, 1024×1024 gives a die-cut sticker with a white border. So
**pack large at 768 and downscale small to 512 — never upscale to 1024.** The layer lands under its
2.2 MB budget rather than over it.

**D56** — **Two refinements to my own earlier decisions, both from measurement:**
- **D22 was too broad.** The `negative_prompt` *field* is inert, but a `no X` clause *inside the
  prompt* is not — it removed a sun. It still cannot remove the 1024² sticker, which stays banned.
- **D35 read literally is wrong.** Dropping the phenomenon noun for pure abstract marks produced
  clone sheets twice, and a single mark generated alone becomes a photoreal wax seal. `f08`, the
  proof plate, **kept the noun**. The paint-mark language replaces the *rendering adjectives*, not
  the subject, and variation comes from naming contrasting states ("some fresh, some old and torn"),
  not from "no two alike".

**D57** — **Two bake bugs found by measurement rather than by eye.** `f08_varied` has marks inside
the 4% crop zone, so **D22's mandatory crop would slice the reference plate's own outer marks off —
crop the cutouts, key the sheets.** And key tolerance must be **≥12 per channel with per-plate
backdrop sampling**, because `paper grain` in D34's stem puts real texture in the backdrop and an
exact-match key removes nothing. General fix for stray suns, grass strips and shadows: after keying,
keep only the largest connected component.

**D58** — Independent confirmation from outside the prop set: `h68b_factory` kept a cast shadow
despite being told not to. `poster.js`'s shadow pass is needed for hero objects too, not just props.
