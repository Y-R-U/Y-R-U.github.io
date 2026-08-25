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

**D59** — **P2 landed the rest of the engine** — `js/core/` (14 files), `main.js`, 7 harness tools.
The solver reproduces ARCHITECTURE §4.4.1's table to 4 decimal places. `camera.js` is deliberately
DOM-free so the harness drives **the real module** in node rather than a re-implementation of it,
which is the difference between testing the camera and testing a copy of your own arithmetic.

**D60** — **Two real bugs found, one of which also exists in a shipped game.**
- **`viewport.js` measured the canvas — its own output.** `view:change` never fired on rotation and
  the layout stayed portrait forever. **Screenshots at either orientation look correct**; only
  counting events caught it. **The same bug is in Sunderfall's copy** — worth telling Aaron, it
  affects a game already on the site.
- `save.load()` reported a reset it had not performed: invisible at boot, stale data on any later load.

**D61** — **Several P8 gate criteria reward broken behaviour and must be rewritten before P8 runs.**
This is the most important thing P2 reported, and it was only visible because it shipped deliberately
broken controllers alongside the correct one:
- **`?track=sticky`, which is completely broken, scores the BEST Z1–Z3 numbers in the table.** Only
  Z6 catches it. A gate suite where the broken implementation wins on three of six criteria is not
  measuring what it thinks.
- On a step trace the **broken symmetric controller scores 0 gap violations against the shipped
  controller's 6.** Pumping must be measured against a *continuously moving* target, not a step.
- **Z1 is unpassable as written and measures the wrong thing** — it budgets how often the *AI* may
  change the framing box, not how the controller responds. Isolation runs score 0.
- **Z2 and Z4 are mutually exclusive**, and `zoomInDwell = 0.90 s` is below Z2's 1.2 s threshold —
  §4.1's constant and §4.4's criterion are numerically incompatible.
**Fix the criteria, not the constants.** P2 refused to tune anything to clear them, which is correct.

**D62** — Accepted from P2: `cam.setPlayerControl()` and `cam.setBias()` are additions to §6.6
(§4.3.3/§4.3.4 cannot be implemented without them); §4.3.2's zoom-in margin **read literally caps
zoom at 1.034**, making `zoomIntimate` unreachable and distorting the user bias, so a latch ships
with `?margin=strict` preserving the literal reading for comparison; **P8 must state whether P1b is
derived at 90% fill or at `zoomFill 0.85`** — §4.4.1 and the solver currently disagree.

**D63** — **Routed to P15: the audio facade swallows a missing manifest.** `facade.js` uses
`.then(r => r.ok ? r.json() : null)`, so an absent `assets/audio/` resolves instead of rejecting and
the `warnOnce` never fires — zero console warnings where the contract requires exactly one. **The
game is correct; the contract is not.** Fix it when the audio content lands.

**D64** — **P3's ten gates all pass and the rendered sky is not good. The manager looked.**
`shots/p3/act2_day_deck.png` and `act5_dusk.png` share the same defects across different acts, so
this is systemic, not one act's palette:
- **Clouds are crushed to hard black cores.** The shadow end of the ramp LUT is too dark and too
  abrupt; the reference plates (`p03_cloud_deck`, `p08_hero_9b`) have soft violet-to-gold shadows
  with volume and gentle value transitions.
- **The sky is a flat single-hue wash** with almost no vertical gradient, where the references carry
  a rich one. Act 5 is a wall of orange; act 2 is olive.
- Clouds read as **stamped cutouts on a backdrop**, not as a deck with depth.

**The gate suite measures seams, frame multiplicity, hue separation and haze — and nothing measures
whether the composed frame looks like the target.** That is the fourth time on this project that a
passing gate has failed to catch the thing it existed to protect. **The missing gate is a blind
critic on the RENDERED FRAME**, not on assets, scored against the reference plates. P3 said as much
itself: three of the art pillars are not reachable by this pipeline alone.

**D65** — **Act 2 takes the cream, not the green.** P3 reported that clearing criterion A5 (hue
separation between acts) forced a green cast it did not believe in, and that the cream alternative
is one line and misses A5 by 4.8°. Having looked: **the green is wrong and A5 is mis-specified.**
A criterion that forces a colour nobody thinks is right is a broken criterion — the same finding as
A3 and A6 in this phase, and the same rule as D48 and D61: **fix the criterion, not the artwork.**

**D66** — **A6's unnamed 0.12–0.18 band is closed at 0.12.** Pass below 0.12, fail at or above. The
deliberately broken control lands at 0.146, so any threshold above that would let the broken
implementation through — which is exactly what D61 caught in the camera gates.

**D67** — **Props will be drawn in code, not generated.** Third clean negative in a row: all four
generation-side causes from D52 were visibly fixed — 9B gave the watchtower complete legs and the
gun its trail, the contrasting-states clause killed the clones, in-prompt negation removed the
painted ground, no anachronisms — and two fresh blind critics still scored **3.83 and 3.33 against
the reference's 8.33**, unmoved from D51, while the complaints changed completely. **The remaining
gap is the medium: this model renders a mechanical subject and will not paint one.** The critics'
worst finding — "the same spoked wheel under seven unrelated objects" — is a cross-asset repeat only
a part tree can fix, and `gfx/parts.js` already exists for the aircraft. This also settles the
outstanding contact-shadow requirement: code-drawn props get code-drawn contact shadows for free.

**D68** — **P3's corrective pass found four real pipeline bugs, none of them the palette.** Clouds
drawn alone had a median luminance of **0.113 against the reference's 0.637** — an error, not a
taste question:
1. **The ramp applied an effective gamma of 1.88 (3.90 at night)** — `sprite.js` indexes the LUT by
   *linear* luminance and squares the texel back, so an authored `L^gamma` became `d^(2·gamma)`.
2. **The LUT bottomed on black rather than the act's shadow colour** — `pow(L, g/2)` is 0 at L=0, so
   every ramp's darkest entry was pure black whatever the shadow hex said.
3. **The grade clamped everything under 10% luminance to black** — probed on act 4: LUT `[24,33,51]`
   → framebuffer `[0,0,35]`, a per-channel clamp rather than a darkening.
4. **Painted layers were being shaded by a scene with no lights in it.** Painted layers are now
   self-lit and ambient is per-act — which also stops P4's aeroplane rendering black in daylight.

**D69** — **The sky is much better and still does not clear the gate: −4.06 against a −2.0 line, and
the +0.91 improvement is inside the ±1.5 noise floor.** The manager looked: the crushing is gone and
the clouds hold volume, the wash behind them is still muddy. **What moved is the differences list,
not the number** — every before-critic said the shadows crushed to black and two named "black
cartoon outlines"; no after-critic says either, and two say explicitly that it does not crush. That
is the NEONHAUL shape and it is the fourth time it has appeared here.

**Moving on to P4 rather than pushing further, because the comparison is currently unfair.** Three
of the five remaining complaints need things that do not exist yet — the ground plane is P9's, and
actors and the removal test are P4/P5's. We are scoring an empty sky against composed paintings that
contain a subject. **Re-run `tools/framegate.mjs` at P16 with actors and ground in frame**; that is
the first honest reading.

**D70** — **Two in-scope defects are deferred to P16 and must not be forgotten:**
- **Shadows do not turn hue.** A 1D LUT indexed by luminance gives one colour per luminance, so
  there is no mechanism for a shadow to differ in hue from a midtone at the same value. This is an
  architectural limit of the ramp-map idea, it is the most-named remaining defect, and fixing it
  means a shadow-tint term or a second LUT — not more tuning.
- **Grain does not vary with the wash**; uniformity is the tell. This is P1's unbuilt REQUEST-2, the
  world-space brushwork term.

**D71** — Criteria re-specified this pass: **A5** now measures the key/shadow *relationship* (key
hue, shadow hue, key chroma, value spread, largest axis) rather than a single mean hue, which
collapsed the whole ramp to one number; **A4** counts confusable repeats — same id *and* similar
scale *and* same flip — because the id-only proxy broke once the deck got denser. Act 1's −6.50 is
**stale**: it was repaired after scoring and not re-run.

**D72** — **P3's closeout: six instrument defects, and not one was found by reading code.** Each
came from running a check against something that should fail it. Worth listing because the failure
modes recur: A3's control scored *better* than the real strip; A6 measured the post-process noise
floor; the crossfade metric reported 0.00 s; the A5 control parsed a superseded format; **`verify.js`
kept a duplicate of a renderer constant which then drifted**; and fixing that drift revealed A6 had
quietly become a test of the layer config rather than of the art.

The duplicated-constant one is the most transferable: **a harness that re-declares a value the code
under test also declares is testing itself.** P2 avoided this by keeping `camera.js` DOM-free so the
harness drives the real module; P1 avoided it by reading the marker back out of the framebuffer and
inverting the shader rather than re-running its own arithmetic in JS. Make the harness consume the
real value or measure the real output — never keep a second copy.

A6 now reports art p90 **0.0902** and drawn p90 **0.0199** against a 0.12 ceiling, control **0.2517**
red. All asset gates pass with every control red.

**D73** — **P4 landed the airframe: 14/14 gates, 9/9 fixtures, both immovable numbers held.**
`m 520 kg · S 23.5 m² · CLmax 1.459 · CD0 0.05896 · T0 3207 N · Vne 93`. Turn diameter **263 wu**
(≤286) and stall **16.08** (16.5±1). The structural insight that made an over-determined system
solvable: **an airframe has four observable numbers, not six** — `Vs`, `T/W`, `CD0/CLmax`,
`kInd·CLmax`; everything else is redundant parameterisation. DESIGN §1.4's original guesses survived
well (CD0 0.060 → 0.05896, AR 5.5 → 5.82).

**D74** — **THE DIVE RECOVERY IS 585 wu, NOT 1,053 — and this changes the portrait case in both
directions.** ARCHITECTURE computed it as a constant-speed half-loop; a real pull-out sheds 30 m/s
while it happens. Consequences, manager-verified:
- **Portrait contains a full-speed dive recovery with no zoom-out at all** (58% of frame; required
  zoom rises from 0.855 to ~1.10). The binding constraint on the zoom window is gone and the window
  widens substantially. This is the biggest thing P4 hands P8.
- **But the argument against landscape is now much thinner.** At 1,053 wu landscape was 88% over its
  frame; at 585 wu it is **4% over** (585 vs 560). Portrait still wins on this criterion and the
  earlier conclusion survives, **but it no longer survives comfortably** and must not be quoted as
  though it does. P8 decides on the full suite, not on this one number.

**D75** — **Two spec numbers had to move, and P4 was right to move them rather than fudge:**
- **ARCHITECTURE's 126 °/s pitch rate → 95 °/s.** R-01 freed six coefficients to fix the 10.1 g
  problem, but no combination of them can: `n = √(1+(ωv/g)²)` depends on ω and v alone. The pitch
  envelope itself had to give. Corner load is now 5.6 g and the turn circle got *smaller* (263 vs
  273) because corner speed fell with the rate.
- **R-01's `A = 2.8` as literally worded deletes the stall from the game** — multiplying all lift by
  2.8 puts minimum flying speed at 9.9 m/s, so the 16.5 m/s stall criterion would measure something
  that does not exist. Implemented as a multiplier on the *manoeuvring margin*, exactly 1 g at the
  stall. **Shipped agility is 2.11×, not 2.8×, and the notes say so plainly rather than dressing it up.**

**D76** — **Three real defects, one severe.** DESIGN §1.3 resolves lift on the **body normal**, which
double-counts induced drag: at a 14° corner-turn alpha the aircraft bled **−45 m/s instead of −7.2**
and glided at L/D 2.44 instead of 7.89. Fixed to wind axes and shipped alongside as
`--break lift-body-axis`. Also: §1.8's auto-upright condition could never fire after an Immelmann
(level flight leftward is γ=π), and §8.1's `speed ≤ Vne × 1.05` invariant is **violated by legal
flight** — terminal rises with altitude, so a dive from the ceiling reaches ~104 m/s. Implemented as
`terminal(altitude) × 1.05` rather than hard-capping the dive.

**D77** — **D32 closed: "4.5 g" is deleted.** `STRESS = |n| / 11.13`, anchored on a full pull-out at
Vne rather than the corner turn — that anchor would make the ordinary *sustained* combat turn read
0.91 stress and black the pilot out. Enforcement is real: over-stress costs 200 HP/s of excess.
**D33/R-08 closed**: both terminals are tabulated with their conditions — unpowered 77.32, powered
95.79 = Vne × 1.030 — so over-the-red is reachable. The flutter coefficient fell 1.8 → 0.161 and
that is *forced*, not chosen: with terminal pinned to Vne×1.02–1.05 only 3% of drag is left for it.

**D78** — **Falsification again earned its place: two of the seven break-switches originally passed
the entire suite.** `no-stall-bias` (the wing drop alone reverses the aircraft, so one of the three
stall components was unprotected) and `fixed-drop` (every fixture ran one seed, which happened to
draw the hardcoded side). Both now have dedicated fixtures. Third phase running, third time this
technique found a hole in the tests themselves.

**D79** — **P5 found nine real defects, three of them P4's, and none were findable by P4's tests.**
The duel is the first time two aircraft existed at once and the first time anything flew *left* —
which is exactly why they were invisible:
1. **`aero.js` resolves every aircraft's forces into one module-level `OUT` buffer**, and `flight.js`
   keeps that reference as `e.aero` to feed forward. With two aeroplanes, every aircraft's
   feed-forward is somebody else's. Measured: **a commanded 1.8 g pull produced 0.47 g.**
2. **`pilot.js` mis-signs `roll` in the load-factor conversion**, and several commands return
   absolute flight-path angles that wrap to zero error at γ=π. Told to climb 300 m, a +x aeroplane
   reaches 738 m and a −x one reaches 312 m **having dived**. Cost before it was found: **in a
   perfectly symmetric mirror fight, the aeroplane that started flying +x won 79 of 80.**
3. `roll` is which side the canopy is on, so every hostile — all of which fly −x — **spawned inverted**.
Plus: gun convergence diverged on left-flying aircraft, aim lead became lag flying west, hit
allocation gave **the tail zero damage in every test** while the bench looked reasonable, best-of-three
was best-of-one, every mutual kill went to the player, and morale measured **exactly 0.0% flee** while
a per-tick trace looked healthy.

**The row that proves the fixes: C7 mirror is now 51.5%, and 45.4–51.6% across all five airframes.**
Every symmetry defect surfaced there first as a 79-to-1 or a 61-to-39; a coin flip on every airframe
is what says they are gone.

**D80** — **The three P4 defects are WORKED AROUND, not fixed, and that is not acceptable to carry
forward.** A module-level output buffer shared across entities is a correctness landmine that will
bite again the moment a third aircraft exists, and **P4's `ace` and `novice` pilot tiers are
currently quarantined** — on `ace` a symmetric fight is won 73% by whichever aeroplane flies left,
and `novice` makes the *worse* pilot out-turn the better one. Those tiers are the difficulty lever
for 100 levels, so they cannot stay quarantined. **Fix at root before P6.**

**D81** — **Criteria P5 refused to tune to, all accepted:**
- **C2's 0.4–0.8 s band is derived from DESIGN §3.1's own `60/108 = 0.56 s`, which assumes zero
  component absorption — in the same section that specifies 35% spill.** The band is reachable only
  by deleting components. Measured 0.75–0.98 s. **Restate the criterion.**
- **C6's counter-play threshold fights C4**: a counter worth 18 points needs 18 points of headroom,
  while C4 pins the baseline at 55–70%. Adopt P5's restatement — *a counter must close half the
  remaining gap to 100%*.
- **R-10's collider set is a plan view.** 11.0 m is a *wingspan*; in a side-view game those capsules
  roof and floor the fuselage and the tank and pilot become unhittable from every aspect, making
  "six o'clock low" identical to "six o'clock". **The side-view set is the default**; `--colliders
  span` keeps the plan view for comparison.

**D82** — **`placeboA` is not a valid control, and P5 said so rather than dropping it quietly.** The
"meaningless" slow porpoise is worth **+35.1** against one ace — because a porpoise *is* a lag yo-yo,
and a lag yo-yo is a real manoeuvre. **The believable-wrong control is the same failure mode as the
believable-wrong metric**, and it is the first time this project has hit it on the control side.

**D83** — Counter-play does **not** pass: 4 of 11 measurable counters clear the bar. Two failures are
genuinely ours: **A3's counter is right and the bot cannot execute it** (a stall turn is
frame-accurate timing; a 0.34 s reaction bot arrives at zero airspeed with a live ace behind it), and
**A5 is an ace that is wrong** — an armoured head-on merchant cannot be made scary against 220 HP
without being unfair. **A5 goes back to the drawing board at P11's ace pass**, with R-11 and T23.

**D84** — **Playable beats pretty. Getting to a playable state takes priority over hitting art
bars.** Aaron, 2026-08-24: *"as long as it is playable we can continue working on hitting bars while
also play-testing... Getting to a playable state is usually preferable to improving graphics — as
continual improvement as you test can run in parallel."*

Consequences, binding on every remaining phase:
- **No art bar blocks a phase.** The sky's −4.06 against a −2.0 line does not gate P6, P7, P9 or
  P10, and neither does the prop negative. Art quality is tracked, reported, and improved *alongside*
  playtesting, never in front of it.
- **P10 (first playable) is the schedule's centre of gravity.** Phases before it are scoped to *what
  a playable mission needs*, not to what the phase could exhaustively cover. P9's level format ships
  the minimum that lets a mission be flown; breadth comes after.
- **Correctness still blocks.** This is a re-ordering of art versus play, not a licence to skip
  verification — the flight-model defects P5 found were exactly the kind of thing that makes a build
  unplayable, and the falsification discipline stays.
- **P16's art pass keeps its scope but loses its veto.** It becomes the place improvements land, not
  a gate the game must clear before Aaron can fly it.

**D85** — **The three flight-model defects are fixed at root and the workarounds are deleted.**
Manager-verified: P4 still 14/14 with its determinism digest unchanged.
- **The shared force buffer** was *an output buffer whose lifetime outlived its scope*. Fixed by
  ownership: each aeroplane allocates its own, and **`forces()` no longer has a default `out` at
  all**, so no caller can acquire a shared buffer by accident. The old first-tick semantics are
  preserved exactly, which is why the fix moved no P4 number.
- **The pattern appeared twice — the second instance was the agent's own.** `createFormation` handed
  every wingman one shared point object which `setIntent` retains, so every wingman flew to whichever
  station was written last. The rest were audited: the two that were *retained* were the two that
  were broken. **A shared buffer is only dangerous when someone keeps the reference.**
- **The pilot** had two independent faults; climb 300 m now reaches **739 m east / 736 m west** (was
  738/312). With the root fix in, the old mirrored-bearing workaround now *breaks* the same test —
  which is what a dead workaround should do.
- **`ace`'s 73% left-flying bias fell out of the pilot fix**: its finer stick quantum resolved the
  roll-sign error more sharply, so the tier that flew best amplified the bias worst. `novice`'s
  inversion was separate — `envelope` divided the limit *before* the stick was solved, so a smaller
  envelope produced a **larger** stick.

**D86** — **Two further defects surfaced by pinning one dial at a time rather than guessing.** A high
envelope had become a *liability* because a max-rate turn costs 7.2 m/s per second — fixed with an
energy governor so the envelope only differentiates where spending it is affordable. And **the aim
error was perturbing the flight path**: a sloppy aim flies a wider pursuit curve, which in this model
is free energy, so a *better* aim was a straight energy penalty. Both error terms now perturb what
the pilot **believes** the solution to be; the AI always steers at the true solution. The skill
ladder went from −11.4 to **+16.0 points** and `k` is monotone by construction.

**D87** — **C7 pooled reads 48.9% ± 1.8 across five airframes, 49.6% over 1,200 duels.** The agent
also **fixed C7's instrument**, which had been measuring a single airframe at n=120 — pooling all
five is the faithful reading of "the player's loadout", and the band was left untouched.

**D88** — **Two P4 trace digests drifted and were re-blessed, declared loudly rather than buried**:
glide L/D 7.94 → 7.90 and landing touchdown 19.3 → 19.4 s. Both under 1%, both the correct
consequence of fixing the envelope, every assert passing unchanged, before/after hashes recorded in
`tools/BLESSED_P5.md`. **No P4 expectation was adjusted to make anything pass.**

**D89** — **C4/C5/C6 are stale and deliberately not re-fitted.** The root fixes changed how every
aeroplane flies, so ace HP values fitted against the old AI no longer hold. Re-fitting sixteen aces
against an AI that is about to get crates would be work done twice. **Deferred to P11**, consistent
with D84: playable first.

**D90** — **T19 HELD: the canopy cut measures 1.485–1.508× a fly-through against a 1.35 floor.** This
was the riskiest number in the design — below ~1.35 nobody takes the risk, everyone fly-throughs at
safe altitude and the signature mechanic degenerates into a floating pickup. **It is robust to how
well the player reads the wind** (1.485× at perfect judgement, 1.500× at σ=3.0), and *doing nothing*
measures **0.522×** — half a fly-through — because the wind and the enemy take 47.8% of what you
ignore. Measured across 400 drop points × 2 levels.

**The instrument is a model of the decision, not a bot flying it, and that was the right call**: a
0.34 s-reaction bot flies a precision manoeuvre badly, so a bot-measured T19 would have been
**measuring bot skill and reporting it as the design's value**. Every term comes from the shipping
physics; bot executability is reported separately.

**D91** — **T20 moves 35% → 60% burst, and it is a derivation, not a tuned threshold.** At DESIGN
§4.3's authored 35%, K3 and K4 are **jointly unsatisfiable for any multiplier** (K3 needs M ≥ 1.395,
K4 needs M < 1.269). Solving for the burst that sinks a high cut at M = 1.6 gives 0.545; 0.60 ships
with the derivation attached. **The alternative on the table if playtest disagrees: keep 35% and make
a burst crate worth 0 instead of 0.5** — one constant either way. 60% is preferred because "cut it
high and it probably bursts" is the physical intuition that teaches the rule.

**D92** — **Four defects in the AI, none findable by reading, one of which would have killed the
signature mechanic.** `CRATE_RUN` was unreachable in the exact situation it exists for — **zero
CRATE_RUN decisions in a 190 s mission with eight crates**. And **P5's ground floor made the Mud
band unreachable by any AI** (`120 + speed` = 162 m at cruise, 282 m pulling), taking §4.3's 1.6% cut
below 120 m with it. P5's intent was right and implemented against the wrong quantity: **what a
pull-out costs is set by sink rate, not by speed.** Now `60 + 2.5 × sink`, which is *more*
conservative at Vne than the constant it replaces. Mirror regression after the change: **50.8% ± 1.9
over 725 decisive duels.**

**D93** — **K5's instrument lied three separate times before it told the truth.** The control arm was
secretly the treatment (the enemy banked six of eight crates in *both* arms, so both had a maxed
ladder) and read **−3.3 points**, which would have been reported as "the reinforcement ladder is
decoration". Then reinforcements spawned into empty sky a kilometre behind the bot — delta exactly
**0.0 on every seed**. Then they arrived after the first engagement had decided the sortie. True
value: **+12.5 points of death rate, +13.1 HP per sortie.**
**Warning carried to P11**, with the selection rule stated before the numbers: measure only on cells
whose *baseline* death rate is inside the 8–30% band. **Outside it the ladder reads negative** — a
level already at 38% has no headroom, and extra friendly losses drive the morale table into a
squadron bug-out. A delta measured outside that band measures the ceiling, not the change.

**D94** — **Criteria P6 refused to tune to, both accepted.** **K6 is unsatisfiable by DESIGN's own
numbers**: a ±3 m swing (worst measured 3.47 m) cannot move a hitbox out of a 9 m collect radius —
sweeping the radius gives 0.0 points at 9/7/5/4 m and 10.0 at 3 m, the crossover being exactly the
measured offset. §4.2's "3% harder to catch" is the claim that is wrong. **`--break pin-swing` is
caught by nothing and the agent reported that rather than hiding it.** And **K2 as written is weak —
`--break flat-wind` passes it**, because a 200 wu displacement is produced by any wind; the
measurement that proves a shear is the *reversal*, which the `shearCurve` fixture asserts.

**D95** — Also found: **`bulletPass` tested bullets as points.** A round covers 7 m per tick against a
3.9 m crate, so **four rounds in five missed** and "twelve rounds deny a crate" was fiction. Segment
trace now — the same lesson P5 had already learned in its own hit allocation, repeated anyway.

**D96** — **The sharpest emergent result so far: a fire caught while cutting a canopy low is
unsurvivable.** Fire blow-out is an altitude function — **0% survivable below 450 m, 100% above
700 m** — and a low cut commits you to the bottom of the column for 79.7 s. Two systems written for
different purposes, and neither author intended it. Also: ground fire is **not** what makes the low
cut dangerous (1.72 HP per cut); the time committed down there is.

**D97** — Accepted: canopies are **auto-fire targets ranked strictly below every aeroplane**, because
in a one-thumb game there is no other trigger to cut one with; a crate caught in the air is 1.0×
whether or not its canopy was cut on the way in (otherwise the two takes stop being separable); and a
crate that lands uncut goes to whichever side it lands on. **The auto-fire never offers a man under a
canopy** — the story prices that shot and the price is the player's decision to make.
**REQUEST accepted for P13/P14: `refit()` must add `ent.carryMass` before `rederive`** — it is the
one line blocking carry mode, Airlift, and one ace's counter.

**D98** — **P7 landed the HUD: 21/23 criteria, 12/12 falsification switches caught, and both P8
preconditions are genuinely ready.** The altitude tape spans the full column at 9.28 ft/px with the
six D19 band names and segment colours taken from the act's own ramp LUT; the Concord Line is drawn
detached above the playable top. Chevrons: **196/196 dives warned before the silhouette entered the
frame, median lead 7.72 s** (p10 2.40, min 1.73), over 200 seeded dives half of them flying west.
The HUD is a second canvas in css pixels, so zoom-invariance holds *by construction* — no code path
carries `cam.zoom` into a HUD coordinate.

**D99** — **The best catch of the phase: `#ui > * { pointer-events: auto }` made the HUD canvas eat
every touch, so the aeroplane could not be flown at all — and the metrics read as GOOD numbers.**
Thumb-overlap 0.00%, stick travel 0 px/min, and the screenshot is perfect. **An unflyable build
scored better than a flyable one on two criteria.** Now guarded by `hudbug=input`. This is the
believable-wrong-metric pattern in its purest form yet: the failure mode makes the instrument read
*better*, not worse.

**D100** — **H5 and H11 fail and the cause is the camera, not the HUD. This is a playability bug and
it is fixed before P8.** Over a 94 s mission the aeroplane's own screen position runs to
**x p50 448 on a 390-wide screen** and y p5 133 / p95 707: `anchorY 0.62` / `anchorYClimb 0.78` plus
a 240 wu lead sweep it across the whole frame, and the coaming occupies the bottom 14% of that same
frame. **The manager looked at `shots/p7/hud_portrait.png` and the aeroplane is buried in the
coaming.** Moving the tape does not help — the right side is worse (59 → 74 frames).
**Accepted REQUEST-2: the camera's vertical anchors must be expressed against the playfield *above*
the coaming, effective ceiling ≈ 0.845** — one clamp in `camera.js` or one field in `viewprofile.js`.
Until it lands, ART §10's "no element on top of the aeroplane, at any time" is not met, and **P8's
gate would fail for the wrong reason.**

**D101** — **Criteria P7 refused to move, both accepted.** **H3 as worded is arithmetically
unsatisfiable**: 4.5:1 against white needs luminance ≤ 0.1833, against the ground colour ≥ 0.1953,
and no colour lies between — which is precisely *why* ART §10 draws every mark twice. Gated on the
mark instead, worst tone-vs-ground **5.87:1**; the outline alpha moved 0.55 → 0.62 because 0.55
measures 4.41:1, **a colour changed to meet a criterion rather than a criterion changed to meet a
colour.** And **H11 has no single value** — thumb overlap ranges 0.8–14.3% purely with where the
thumb rests; the shipped default is the only rest position with full travel unclamped, and the value
that would have turned H11 *and* H12 green does so by not letting the thumb move.

**D102** — **The threat bracket was gated on the same threshold as the trigger, so the warning
arrived with the shot.** Found by pinning one term at a time after lengthening the lookahead did
nothing, replacing the predictor produced *bit-identical* output, and adding hysteresis did nothing.
**R-09 cut gun range 140 → 66 m and nobody re-checked the bracket** — the physical window is now
~0.7 s. Median continuous warning now **0.567 s** across 40/40.

**D103** — **REQUEST-1 settled: the altitude tape goes on the RIGHT.** The view profile says left,
ART §10 and DESIGN §2.7 both say right, and P7 measured both — **it makes no measurable difference**,
so it is a taste call and the two specs that agree win. `resolveLayout` already takes an override.

**D104** — **The camera fix works: H5 passes with 0 occluded frames across three runs, bit-repeatable.**
`playfield` is now a per-mode field (the fraction of the frame the HUD owns nothing permanent in) and
the anchors are fractions of *that*, with the aeroplane's own box clamped inside it. D100's ≈0.845
ceiling **falls out of the arithmetic rather than being typed in** — `0.86 − hull*0.25/visH` = 0.844
— and it stays correct at `zoomIntimate`, where a hardcoded 0.845 would not. `right` is assigned
from `specialSlot.x` rather than copied, so moving the special moves the camera's bound with it.
Screen x p50 went **438 → 217**; `occlBy` went `{tape, coaming, belt, special, banner}` → `{}`.

**D105** — **The pre-fix framing was not merely bad, it was a coin toss — and P8 would have measured
that variance as if it were the orientation's fault.** The same seed produced 13.96%, 70.45% and
29.96% occlusion on different runs, because which edge the aeroplane fell off depended on how the
sortie went: sometimes x p50 438 (off the right), sometimes −3 (off the left). **The portrait gate
runs next and measures framing.** Post-fix runs are bit-repeatable. This is the second time a gate
was about to be run against an instrument that could not have given a stable answer.

**D106** — **`leadMax 240` is sized for landscape and must be fixed properly, not merely bounded.**
It is **52% of the portrait frame's width** where landscape's 420 is 35% of its. The new clamp bounds
the symptom and the frame now spends real time pinned against the bound, which is a worse camera than
one whose lead fits its frame. ARCHITECTURE §4.1 is verbatim, so this needs the explicit entry it is
getting: **portrait `leadMax` scales to the same 35% fraction its own frame gives** (≈162 wu at
worldW 462). Landscape unchanged.

**D107** — Accepted: `js/main.js` should forward `frame` from the URL alongside `slew`/`margin`/
`track`/`enforce`, so `?frame=full` reaches the real game. One line. Also noted honestly rather than
hidden: the world-bounds clamp runs last and wins below ground level — it only binds ~40 m
underground, so it costs nothing in play.

**H11 remains failing at 2.23–8.18% against a 2% cap and that is accepted**, per D101: thumb overlap
has no single value, what is left is the thumb disc rather than the coaming, and clearing it would
surrender 11% of the portrait column to a criterion.

**D108** — **D106 was the wrong constant, and the agent proved it rather than declaring victory.**
Portrait `leadMax` 240 → 162 shipped and is **measurably inert**: screen-position distributions are
unchanged to the pixel, and the clip counts are bit-identical. All that changed is `leadMax` biting
on 47.6% of ticks instead of 2.7% — and every tick it bites is one the playfield clamp was already
discarding *more* lead on.

**The term actually sized for the other orientation is `leadSeconds`, not `leadMax`.** Portrait
0.55 s × 280 wu/s cruise = 154 wu = **33% of a 462 wu frame**, against landscape's 0.70 s = 196 wu =
**16% of 1212**. `leadMax 240` required 436 wu/s to bind at all — above the aeroplane's top speed.
**Authorised: portrait `leadSeconds` 0.55 → 0.27**, matching landscape's fraction. Landscape
untouched. This is the change that takes the clamp out of the loop; the playfield bound currently
discards lead on **67.9% of ticks**, so the honest answer to "does the lead fit the frame" is still no.

**D109** — **A third believable-wrong metric, found because a positive control moved the world and
the number did not move.** The obvious instrument — "is the aeroplane touching the bound" — reads
**0.0% on every run**, including a control with the bound dragged in to 0.45 that pulled x p95 from
237 to 140 *while still reading 0.0%*. The camera's damping lags its target by ≈34 px at cruise, so
it approaches the bound and never arrives. **Only the camera can report whether lead was
discarded**, which is what the replacement counter measures. A metric reading 0.0% while the clamp
does two-thirds of the work is exactly D99's pattern: the failure makes the instrument look clean.

**D110** — **D108 landed and the fix was finally at the right level.** Portrait `leadSeconds`
0.55 → 0.27; `leadMax` stays 162 and is now coherent rather than symptomatic (at 0.27 s it needs a
Vne dive to bind, which is what a cap is for). Lead discarded per tick fell **55%** (52.6 → 23.4 px),
`leadMax` bound 47.8% → **0.0%**, and the screen-position distribution contracted on all four tails.
**Feel, for P8: tighter and more centred, and it does not lag** — what 0.55 s was adding was
overshoot, and a dive that used to put the aeroplane at y≈90 under the objective banner now sits at
y≈180 with the ground it is diving at visible below.

The agent added `clipSumX/Y` **before answering the question**, because a clip count cannot tell a
10 px clip from a 150 px one — which is the same instrument discipline as D109 and is why the answer
is trustworthy.

**D111** — **The residual clipping is the HUD, not the camera, and it is a real open item for P16 or
P13.** `playfield.right = specialSlot.x = 0.72` leaves the playfield only 0.61 of the frame wide, so
the westbound anchor has **54 px of headroom before any lead at all** — used up above ~35 m/s, and
combat cruise is ~42. **The special ring occupies the right 28% of the column.** Removing that
clipping means moving the special to an edge: a HUD/ergonomics call, not a camera one.

**D112** — **H11 went green without being touched — 0.00% across three runs, from 2.23–8.18%.** The
mechanism was measured rather than assumed: the shorter lead pulled y p95 from 670 to 615, and the
thumb disc's top edge is at 645, so the aeroplane no longer descends into the thumb's reach.
**It is not called solved** — D101's caveat stands, this is the shipped rest position only and no
rest-position sweep has been run at the new lead. Also: the break-switch is still red but weaker
(0.00% vs 4.92%, down from 24.28%), which is the expected direction — **the camera no longer depends
on the clamp to be playable.**

**D113** — **The outstanding item from the pause is closed by inspection:** `viewprofile.js` carries
portrait `leadSeconds: 0.27, leadMax: 162`, so D108 did land and D110's account of it is the current
state of the file. Nothing else was owed from P7.

**D114** — **P8's stability criteria are confirmed broken on live data, and the fix is to measure the
delivered zoom against its own TARGET.** D61 predicted this; running `tools/camtrace.mjs` on resume
proves it. Against Z1's ≤ 6 reversals/min the shipped controller scores **10.5 (scripted), 21 (duel),
8 (patrol), 10 (furball)** — failing everywhere — while `control:sticky-members`, which is *completely
broken*, scores **0.5 with 0 gap violations**, and `control:track-everything` scores **0**. A criterion
the broken arms win is not measuring the controller.

The reason is stated plainly rather than tuned around: the shipped controller reverses because **its
target reverses** — furball logs 70 box-membership changes in 120 s. A reversal that tracks a real
change in framing demand is tracking, not pumping. **Re-specification: Z1/Z2 and §4.4's P4c count only
reversals in `cam.zoom` that are NOT explained by a reversal in `cam.zoomTarget` within a short
window.** The trace already records `target_` and no criterion has ever read it. The discriminator
that already works is kept: **oscillation** (amplitude > 0.05 sustained > 3 s) reads 0 on every shipped
run and 55 windows at amplitude 0.44 on `symmetric-slew`, which is the arm that genuinely pumps.
**Z2 and Z4 stay mutually exclusive until the 1.2 s pair rule is re-expressed the same way** — a pair
inside 1.2 s is a violation only if the target did not itself reverse inside it. `zoomInDwell 0.90`
then stops being numerically incompatible with the criterion that tests it.

**D115** — **THE P8 FIXTURE IS NOT A FIGHT, and running the gate on it would have ratified portrait
on a measurement of nothing.** This is the fourth believable-wrong metric on this project and by far
the most consequential, because the number it would have produced decides the game's orientation.

Measured, not assumed, over 16 aces / 55 rounds / **185,979 duel ticks** (`tools/p8duelbox.mjs`):

| | |
|---|---|
| nearest hostile, p50 separation | **2,249 wu (337 m)** |
| a hostile is inside the camera's own `zoomLockRange` (1400 wu) | **40.3%** of ticks |
| the framing box contains ≥ 1 hostile | **12.0%** of ticks |
| the nearest hostile is inside the frame | **12.8%** of ticks |
| delivered zoom, p50 | **1.20 — `zoomIntimate`, documented as "alone, slow, landing"** |

`tools/pages/hud.html`'s mission, which P7 measured over and which its own comments nominate as the
P8 fixture, is worse: the opponent is on screen **2.7%** of 64,800 ticks and the box holds a hostile
**8.5%**. Some aces never fight at all — A5 produces 201.9 s of duel with **0 shots fired**, three
rounds decided by ground impact and two timeouts.

**On that sample P0, P3, P3c and P6 would every one of them PASS with enormous margin**, because a
camera with nothing to frame frames it perfectly. p90 box width reads **360 wu against a 585 wu pivot
signal** — comfortably inside the clamp, and meaningless.

**The instrument was falsified before it was believed**, which is the only reason this is in the log:
shrinking the arena to 150 m as a positive control moved p50 separation 2,249 → 798 wu, boxed ticks
12.0% → 33.6%, and p90 box width 260 → **1,095 wu — nearly twice the pivot signal**. The instrument
responds; the shipped sample genuinely contains no fight.

**Therefore P0's p90 must be taken over ENGAGED ticks, with "engagement" defined and its own frequency
reported**, not over wall-clock ticks. A p90 over a trace that is 88% empty sky is the wrong quantity
measured well.

**D116** — Also isolated, and deliberately recorded as *not* the cause: `FRAMING.closingWu = 120 wu/s`
(18 m/s) rejects a manoeuvring opponent, so a hostile inside `zoomLockRange` is left out of the box on
**28% of ticks**. Relaxing it to 0 lifts boxed ticks 12.0% → 21.2% but moves "on screen" only
12.8% → 14.4%. **It is a real second-order defect and it is not the story** — the story is that the
aircraft are more than 210 m apart 60% of the time. Do not fix `closingWu` and declare the fixture
repaired; that is the shape of workaround this project has been burned by (D80, D115).

**D117** — **Delegation call, non-obvious and stated for review: one agent builds P8's INSTRUMENT; the
manager keeps the VERDICT.** BUILD_PLAN says P8 spawns no build agent, and the reason is D2 — the
agents that built the camera must not judge whether portrait passes. A fresh agent that never touched
the camera, writing a measurement harness to criteria the manager fixed first and reporting raw
numbers, honours that reason; the manager still reads the numbers and makes the call, and the
portrait→landscape pivot still goes to Aaron. The alternative — the manager hand-writing the harness —
spends a constrained week's usage on typing rather than on judgement. **The agent is told explicitly
that it does not decide portrait.**

**D118** — **`?track=sticky` is INERT against the shipping code path, so D61's headline evidence is
void.** Verified by inspection, not by report: `cam.clearTracked()` wipes every member, and *every*
real driver — `tools/pages/hud.html:234`, `hudcheck`, `p8probe`, `p8duelbox`, `p8engage` — calls it
each tick and re-asserts from `framingContributions`. That bypasses the `TRACK_GRACE` expiry entirely,
which is the only thing `?track=sticky` disables. **`tools/camtrace.mjs` is the sole driver that does
not clear**, and it is where D61's "the broken controller scores the BEST Z1–Z3 numbers" came from.
The arm is bit-identical to shipped on every column of the new harness.

Two consequences, both recorded rather than quietly dropped: **Z6 tests a code path the game never
executes**, and D61's conclusion — that the criteria were mis-specified — still stands, but on the
`symmetric-slew` evidence alone, not on the sticky arm.

**D119** — **D114's re-specification was wrong, in precisely the way it was written to prevent, and it
is superseded.** I authorised "count only reversals not explained by a reversal in `cam.zoomTarget`".
Measured: shipped scores **2.28 unexplained rev/min** (green) and `?slew=symmetric` — the arm that
genuinely pumps — scores **0.55**, which is *greener*. **The break-switch stayed green, so the
criterion was still not measuring the controller.** I made the same class of error I had just finished
cataloguing three instances of.

Superseded by **PUMP windows**: a window where the delivered zoom's peak-to-peak exceeds its own
target's over 3 s — the controller moving more than it was asked to, which is what pumping *is*.
Shipped **0.00%**, `symmetric` **0.19%**. Falsified in both directions, which neither prior wording
was. §4.4's P4c now reads: zero PUMP windows **and** ≤ 6 unexplained rev/min.

**D120** — **THE FINDING: `zoomLockRange` is doing two opposite jobs with one number, and that — not
portrait — is what fails P0.**

- `camera.js:267` uses it to cap how far the frame may **tighten**: "never zoom past `zoomCombat*1.05`
  with a hostile this near." A generous radius is correct for that.
- `entities.js:552` uses the same 1400 wu as the framing box's **admission radius**: any hostile
  within 210 m that is closing becomes a box member the camera must zoom OUT to contain. A tight
  radius is correct for that.

`viewprofile.js` states both in one breath — "never tighten past zoomCombat*1.05 with a hostile this
near, **and a hostile inside it is trackable**". *Trackable* is the altitude tape's and the edge
chevrons' job (§4.2). It is not the framing box's.

The measured consequence: `boxW` is a restatement of the admission radius (the widest admitted hostile
plus 80–165 wu of padding), so **p90 box W reads 935.6 wu against a 585 wu pivot signal — and P0 fails
in BOTH orientations.** A criterion that condemns portrait and landscape equally on the same sample is
not measuring orientation.

Separating the two jobs, on the identical 121 engagements:

| admission radius | p90 box W | portrait P0 in-clamp overlap (bar ≥ 0.06) | opponent in frame |
|---|---|---|---|
| 1400 wu (shipped) | 935.6 wu | **−0.3602 FAIL** | 32.1% |
| 700 wu | 415.5 wu | **+0.1654 PASS** | 31.6% |
| 503 wu | 353.0 wu | +0.3327 PASS | 30.4% |
| 440 wu (gun range) | 340.1 wu | +0.3748 PASS | 29.7% |

**The cost of the whole thing is 0.5 percentage points of on-screen time.** Landscape stays **NEITHER
at 0.0337 at every admission radius**, because landscape's P0 is bound on *height* and only its width
term moves — which is §4.4.1's own claim ("portrait's window closes on width; landscape's is closed on
height before it starts") arriving from the opposite direction.

**This is not a threshold tuned to buy a pass.** No gate constant was touched; a constant serving two
contradictory purposes was measured with the purposes separated. **The value itself is still
underived** — 700 wu is a sweep point, not a derivation, and it must be derived before it ships.

**D121** — **P2 is the real portrait verdict, it is geometry rather than tuning, and it is falsified.**
On the identical sample:

| | portrait | landscape |
|---|---|---|
| total warning, median | 1.75 s ✓ | 1.75 s ✓ |
| **in-frame warning, median** (FAIL < 0.70 s) | **0.03 s** | **1.28 s** |
| reached gun range never having been on screen | **25.7%** | 3.9% |

Portrait is **40× worse on the criterion §4.4.3 nominated as a realistic killer**, and it is not the
admission radius: doubling that moved in-frame warning by 0.01 s. **Pinning the camera at `zoomWide`
0.78 — portrait's widest legal framing, its best possible case — leaves P2 FAIL.** No zoom the
controller may legally choose fixes it.

The cause is arithmetic and is the same fact as REPORT-7: **the frame's reach ahead of the player is
315 wu at `zoomCombat` and 404 wu at the clamp floor, against a 440 wu gun range.** Portrait's frame
is narrower than the range at which it can be shot. Landscape's ahead reach is 888 wu — twice the gun
range. So an attacker in portrait becomes visible at the moment he opens fire, by construction.

What portrait *does* have is the full 1.75 s of warning, delivered by §4.2's altitude tape and edge
chevrons rather than by the picture. **Whether that is enough is a playtest question, not a
measurement one** — which is exactly the boundary D40 draws, and it is why this goes to Aaron.

**D122** — **The gate does not return a clean verdict and I am not going to manufacture one.** Three
criteria are already re-specified this phase (D114/D119, D115, D120) and a fourth would be
rationalising. Recorded as-is: **P3b cannot fail** — its 1.25 threshold is above the absolute clamp
ceiling 1.22; **P1 has a gap** the shipped 263 wu turn sits in, neither passing nor failing; **P3c is a
p100 restating P0** and no break-switch moved it either way; and **§4.4.1's spec figures have drifted
from the shipped gates** — 1,053 wu dive recovery vs a measured 585, which is why P1b never binds
portrait and why landscape's window is *not* empty for the Vne recovery, contradicting the comparison
§4.4.1 was built on.

**Going to Aaron** (D2, D15, D40, §4.4.3 — the one call not delegated): P0 is passable once D120 lands,
P2 is not passable in portrait at any legal zoom, and the choice is between accepting tape-and-chevron
warning as the design's answer or pivoting to landscape-primary. **No code moves either way — that is
what §4.1 bought.**

**D123** — **PIVOT RATIFIED BY AARON, 2026-08-25: landscape-primary.** The one call D40 does not
delegate, decided on D121's numbers — portrait delivers **0.03 s** of in-frame warning against
landscape's **1.28 s**, and no zoom the controller may legally choose changes that, because portrait's
frame reaches 404 wu ahead against a 440 wu gun range.

Per §4.4.3 and D2: **`VIEW_PROFILE.landscape` becomes the tuning target**, the world agent
re-proportions the bands, **portrait stays a first-class supported config**, and §4.4 becomes read-only
history. D1's "mobile-first portrait" is superseded; D2's gate did its job and the answer was the one
D2 said we would accept. **No code moves** — that is what §4.1's two profiles bought, and it is the
first time this project has spent that insurance.

**D124** — **The pivot is not free, and landscape does not pass P0 as shipped either.** Stated now
rather than discovered in P11.

**Landscape P0 is NEITHER at 0.0337 against a 0.06 bar**, and **no art lever moves it**: raising the
minimum enemy hull grows the *raw* overlap 0.0509 → 0.1162 while the **in-clamp** width stays pinned at
0.0337, because once the legibility floor drops under `zoomWide` the clamp floor takes over and the
window is [0.78, 0.8137] whatever the hull. Landscape's ceiling of 0.8137 is the **585 wu dive recovery**
— it is height-bound, which is why the D120 admission fix does nothing for it.

Two levers, both sanctioned, both with a cost, and **verified together on the harness rather than
derived on paper**: clamp floor `zoomWide` **0.78 → 0.74** (§11 names this as the manager's call on the
P0 measurement) **plus minimum enemy hull ≥ 66 wu** (§4.4.1 names the hull as the other lever) gives
**in-clamp [0.7400, 0.8137] = 0.0737 — PASS.** Both are needed: the floor alone drops the camera below
the 34 px silhouette line at a 64 wu hull, and the hull alone cannot move a clamp-bound window.

**Rejected: raising `zoomFill` 0.85 → 0.90**, which also passes (0.0815). That is the *"never a
`zoomFill` nudged from 0.85 to 0.95 to buy 12% on paper"* the brief forbids by name, and D62/REQUEST-3
settled 0.85 on both axes.

**Still owed before landscape can be called the tuning target:** every P4–P7 constant was fitted in
portrait. `leadSeconds`/`leadMax`, the anchors, the playfield fractions and the HUD slots all have
landscape values that were carried, never measured. **P2 fails in landscape too** (in-frame p05 0.20 s)
— better than portrait by 40× but not passing. And D120's admission radius, still underived at 700 wu,
lands regardless: it was a defect in both orientations.

**D125** — **The pivot's real reason, from Aaron, and it is more durable than the gate numbers:
side-scrolling games need landscape; vertical-scrolling games can be portrait.** He had been thinking
it every time a screenshot came back, and had wondered whether zooming out would be enough.

**It would not, and that is measured, not asserted.** "Zoom out far enough to frame the fight" is P0,
and portrait's window between wide-enough-to-frame and tight-enough-to-see is **0.184 before the clamp
applies**. Pinning the camera at `zoomWide` — the widest framing the controller may legally choose —
still fails P2 (D121). There is no zoom that does both.

**Where D2 went wrong is the part worth carrying to other games.** D2 classified KITEHAWK by its
*theme*: "a tall viewport is a tall column of sky, and a dogfight is fundamentally about energy and
altitude." But the altitude ladder is **traversal**, and traversal is allowed to be off screen — that
is exactly what §4.2's tape does, and it worked, delivering portrait's full 1.75 s of warning.
**Combat** is what cannot be off screen, and combat runs along the nose at a 440 wu gun range against
a frame that reaches 315–404 wu ahead. **Classify by the axis the threat arrives on, not the axis the
game is about.** Aaron's rule reaches the same answer at the sketch stage, before any code exists.

**Consequence for P9, load-bearing rather than cosmetic: the altitude ladder is now the SHORT axis.**
Landscape is 560 wu tall against portrait's 1,000 — 56%. The six bands (Mud → Blue) and §3.3's
constraint that the three lowest sum to ≤ 3,000 wu so the establishing crane crosses three of them are
both portrait arithmetic. **The game's signature vertical structure has to survive on 56% of the
height it was designed for**, and D27's "the ladder is a journey, not a composition" is the reading
that makes that possible. Re-proportioning the bands is P9's first job, not a tidy-up.

**D126** — **Aaron's refinement, and it is the load-bearing half of D125: width is spent TWICE, height
only once.** *"We can still zoom out a little, and perhaps pan the camera upwards as the plane flies
upwards — that's way more height. But in portrait you are already going left to right, so you can't go
more left to right to compensate."*

The asymmetry is real and it is about the **shape of the motion**, not the size of the frame:

- **Horizontal motion is unidirectional and unbounded.** The aeroplane cruises 280 wu/s in one
  direction indefinitely, so the camera must lead it **permanently**. That lead is a standing tax on
  frame width, on top of the fight's own extent and on top of the 440 wu gun range. Three claims, one
  axis.
- **Vertical motion is oscillatory and bounded.** Climbs are traded back as dives; net drift over a
  mission is ~0, and D31 already confines a mission to a 2–3 band slice. So a vertical pan is a
  **transient** tax — you get it back. That is why panning works on the vertical and cannot work on
  the horizontal.

**Both of Aaron's moves are already implemented**, and they are worth what he thought they were:
`anchorYClimb` *is* "pan upwards as the plane climbs" (portrait 0.62 → 0.78, landscape 0.55 → 0.70),
and the auto clamp floor is the zoom-out. Measured together:

| effective vertical reach | portrait | landscape |
|---|---|---|
| visible at `zoomCombat` | 1,000 wu | 560 wu |
| at the clamp floor | 1,282 wu (0.78) | 718 wu (0.78) / **757 wu (0.74, D124)** |
| climb-anchor sweep | 160 wu | 84 wu |
| **effective look-up in a climb** | **~1,442 wu** | **~840 wu** |

So the two moves recover landscape from 560 to ~840 wu — **+50%, and real** — but they land at 58% of
portrait's reach, not parity. Against band heights of 700 / 1,000 / 1,300 / 2,000 / 2,500 / 2,500 wu,
landscape at the floor sees **just under one Mud band**; portrait saw a full Belt.

**Ruling: do NOT shrink the bands to compensate.** D26 fixed 1 wu = 0.15 m and the band edges are
physics-facing (stall, density, ceiling, D28's 1,500 m playable ceiling); shrinking them in metres to
flatter a viewport is the workaround shape this project keeps getting burned by. **D27 already settled
this from the other direction** — "all six bands legible at once" was struck as arithmetically
impossible, and the ladder was ruled *"a journey, not a composition"*. A journey is traversal, and
D125 is precisely that traversal may be off screen. **Landscape seeing less of the ladder at once is
consistent with the design's own ruling, not a casualty of the pivot.** P9 re-proportions the *reading*
of the ladder — signature elements, crossfade timing, the establishing crane — not the metres.

**D127** — **D124's recommendation was wrong and P8b caught it: clamp floor 0.74 + hull 66 wu clears
P3 by 0.01 px.** Landscape P3 reads **34.01 px against a 34 px bar**. That is a coincidence, not a
margin, and §4.4.3's own escalation rule ("two or more criteria within 10% of a FAIL threshold")
condemns it. I checked P0 and did not re-check P3 at the same settings — the two levers move in
opposite directions and must be solved together, not one after the other.

Worse, my `--zoomwide` arm was **partial**: it moved P0's clamp floor and left P3 measuring the
shipped `P.zoomWide`, so my own verification run could not have caught it. **An arm that changes one
criterion's input and not another's tests neither.** Fixed — one `WIDE` definition, all criteria read
it — and the correction is the agent's, not mine.

**Corrected recommendation, both criteria solved together and verified on the harness:**

| | clamp floor 0.74, hull 73 wu | bar |
|---|---|---|
| landscape P0 @ `zoomFill 0.85` | in-clamp **0.0737** | ≥ 0.06 PASS — **23% clear** |
| landscape P3 at the floor | **37.6 px** | ≥ 34 px — **10.6% clear** |

The levers are near-independent, which is why the answer is *lower* floor plus *bigger* hull rather
than a compromise on both: P0's window is `0.8137 − zoomWide`, so a lower floor widens it, while P3 is
`hull × scale × zoomWide`, so the hull buys back what the floor costs.

**The cost is an art constraint and it forecloses something, so it goes to Aaron: the minimum enemy
hull rises 64 → 73 wu (9.6 m → 11.0 m), which makes the smallest enemy in the game LARGER than the
player's own aeroplane.** ART §3.4 owns the minimum, and a fast, small, nimble scout is no longer
drawable — every enemy silhouette has a floor above the player's. That is a change to what the game
*is*, not to how it is built, which is the D15 test for escalating.

**Rejected again: `zoomFill` 0.90**, which passes both comfortably (P0 0.1215). It is the manoeuvre the
brief forbids by name and D62/REQUEST-3 settled 0.85 on both axes.

**D128** — **AARON'S CALL, 2026-08-25: sit at the boundary. Minimum enemy hull 66 wu, clamp floor
0.74.** §4.4.3's rule is "escalate rather than ship a criterion this close" — the escalation happened
and this is the answer to it.

**The cost is far smaller than D127 implied, and that is worth stating precisely rather than letting
the earlier framing stand.** 73 wu was the figure for a *10% margin*; the figure to merely **pass** is
**66 wu**, because 64 × 0.69643 × 0.74 = 32.98 px fails and 66 gives 34.01 px. So the real change is
**64 → 66 wu, a 3% bump** — visually indistinguishable, and **the small-scout archetype survives.**
D127's "the smallest enemy is larger than the player" is technically still true at 66 vs 64 wu and is
now meaningless in practice. The 14% art constraint was the price of margin, not of passing.

Where the two criteria actually stand under this call:

| | value | bar | margin |
|---|---|---|---|
| landscape P0 @ `zoomFill 0.85` | in-clamp 0.0737 | ≥ 0.06 | **23% clear** |
| landscape P3 at the floor | 34.01 px | ≥ 34 px | **0.03% — a rounding error** |

**P0 is genuinely sound. P3 is not, and it is accepted knowingly.**

**Therefore the guard is not optional, and it is the first task of the retune phase.** A criterion
passing by 0.01 px will break silently, and this project's whole record is of checks that went green
while the thing they measured was broken. `hull × scale × zoomWide ≥ 34` must be a **blessed
regression fixture that fails loudly**, asserted on the three terms rather than on the product, so the
failure message names which one moved. `scale` is stable (390/560 is fixed by `worldH`, not by the
device), so the live risks are exactly two: anyone retuning `zoomWide`, and anyone lowering the art
minimum. **Both must trip it.** And per the house standard it is not evidence until it has been run
against a deliberately broken build — set hull to 65 and confirm red.

**D129** — **D120's admission radius is PURE COST in landscape and must become a per-profile field.**
P8c's REQUEST-10 was right to put this first, and the manager's check makes it sharper than reported:
the trade is not a trade at all in the orientation we now ship.

`FRAMING.admitWu = 700` was derived (D120) while **portrait was primary**, where it is decisive:
portrait P0 goes **−0.3615 FAIL → +0.1583 PASS**. Under D123 it is landscape that matters, and there:

| `admitWu` | landscape P0 in-clamp | P2 in-frame median | P2 p05 | opponent on screen |
|---|---|---|---|---|
| **1400** | **0.0737** | **1.23 s** | 0.35 s | 48.0% |
| 1000 | **0.0737** | 0.80 s | 0.25 s | 44.5% |
| **700 (shipped)** | **0.0737** | **0.70 s** | 0.18 s | 45.7% |

**Landscape's P0 is identical to four decimal places at every admission radius**, because landscape's
containment is *height*-bound (0.8137 from the 585 wu dive recovery) while its width term runs
1.10–2.46 and never binds. Its 0.0337 → 0.0737 improvement came entirely from D128's clamp floor, not
from the admission radius. So in landscape `admitWu 700` buys **nothing** and costs **0.53 s of
in-frame warning** — the exact quantity D121 and D123 turned on.

**Ruling: `admitWu` becomes a `VIEW_PROFILE` field, portrait 700, landscape the full
`zoomLockRange` 1400.** This is D104's own pattern — `playfield` became per-mode for the same reason —
and it costs nothing, because portrait remains a first-class supported config under D123 and keeps the
value that was derived for it. A single global here is a constant fitted to a superseded assumption.

**Stated plainly rather than buried: P2 still FAILs in landscape either way**, on the 5th percentile
(0.35 s against a 0.45 s bar) even at 1400. The median clears comfortably at 1.23 s. **The pivot itself
is unaffected** — portrait sits at 0.02 s, so the gap D123 was decided on is 60×, not 35×.

**And the general lesson, which is the fourth time this session: a constant derived under an assumption
outlives the assumption.** D120 was sound when it was made and wrong six decisions later. Anything
derived before D123 is now suspect by default, and P8C_NOTES' REQUEST-11 — three files that silently
assumed `zoomWide` was shared, none found by reading code — is the same failure in a different place.

**D130** — **D129 landed and the falsification was better than the change.** `admitWu` is a
`VIEW_PROFILE` field; landscape's is **assigned** from `zoomLockRange` below the table (the
`playfield.right = specialSlot.x` pattern) so the two jobs cannot silently re-merge, and
`framingContributions` now **throws** without a radius instead of defaulting to one profile's value.
Portrait: every gate row byte-identical, P0 **+0.1583**. Landscape: P0 **0.0737 unmoved**, P2 in-frame
median **0.70 → 1.23 s**, p05 0.18 → 0.35, never-seen-before-gun-range 3.3% → **1.3%**.

**Swapping the two values** put portrait at **−0.3531 FAIL** and left landscape **unmoved at 0.0737** —
so each profile responds only to its own field, and a run whose only purpose was to break the change
independently re-confirmed the premise it was built on. **Landscape P2 still FAILS** on the p05 (0.35
against 0.45). Going to 1400 recovered ground; it did not buy a pass.

**D131** — **The REQUEST-11 sweep found seven more, and one of them is the pattern in its purest
form: `js/ui/hud.js` had its own copy of the `framepip` window, so the break-switch went RED in the
harness and GREEN in the shipped game.** A control that only fails in the test is worse than no
control — it certifies the thing it cannot see. Now one definition in `layout.js`, imported by both.

Two retractions the sweep forces, both recorded because a finding that quietly evaporates is worse
than one that was never made:

- **P8B's landscape Z1 failure is VOID.** It came from a literal `700` admission radius in
  `camtrace.mjs`. With each profile's own value, landscape's shipped rows go duel 18 → 12.5,
  patrol 12 → 6, furball 13.5 → 8 — **better than portrait on every fight row, not worse.**
- **P8B's sky-atlas A4 failure is UNSAFE to act on.** `tools/pages/sky.html:26` hardcodes
  `worldH: 1000`, so the landscape run measures a frame the game never draws. **Do not touch the cloud
  atlas until that is fixed** — the variety budget may not be wrong at all.

Also: **`js/core/input.js` is the last instance in shipped code and it is propping up a green assert.**
`orient.mjs`'s "a held stick survives every rotation" passes *because* the axis goes stale on
`view:change`. On a real phone, rotating the device drops the player's stick. **The fix and the assert
must land together**, before P10 — a first playable that loses the controls on rotation is not one.

The agent reported, unprompted, that one command included a read-only `git status`. It changed nothing.
**Self-reporting a rule break nobody would have found is the behaviour this project runs on**, and it
is worth more than the rule was.

**D132** — **H11's cause was wrong in P8C's first report and the agent corrected it in place rather
than defending it.** The 31-vs-71 px horizontal comparison was not the mechanism: portrait's
*westbound* aeroplane rests **4.9 px** from the thumb centre — closer than landscape's worst — and
still reads 0.00%. **The real cause is vertical and exact: landscape's climb anchor sits 9.5 px INSIDE
the thumb's 165 px disc, where portrait's clears it by 70 px.**

Measured over ten identical 30 s runs: **1.74 / 4.25 / 5.91 / 9.67 / 15.42 / 15.42 / 26.03 / 27.73 /
50.79 / 50.79 %**, median 15.4%, **9 of 10 over the 2% cap**, against portrait's **0.00% on 5 of 5**.
The spread is the harness stepping the thumb on the wall clock (D105 one layer down) — but portrait's
five zeroes are the control that says the overlap is real rather than an artefact.

**Routed to P13/P16 with six costed options (P8C_NOTES §11.3), not fixed.** Two were probed and
reverted; `viewprofile.js` is byte-identical to its pre-probe copy. It is a HUD/ergonomics call, the
way D111 was, and the honest read is that **landscape's H11 was only ever green because the oversized
stick could not be pushed** — D99's pattern, found for the sixth time.

**D133** — **The rotation bug was real and its assert was laundering it.** `js/core/input.js` anchored
`stickOx/stickOy` as a css-pixel position in a frame `view:change` had just replaced, and no
`pointermove` fires for a finger that has not moved — so the axis stayed stale while the thumb was
still and **slammed to the rim on the first movement**: −0.643 → **−1.000**, an 8 px nudge reading
0.00 px because it was already saturated. On a real phone, rotating the device threw the aeroplane.
Fixed by a deferred re-anchor derived to preserve the held deflection exactly under the new radius:
`stickOx = x − axisRaw.x × stickR`.

**The detail worth keeping is how the old assert passed.** It used a *slide*, and a slide re-anchors
on its first sub-step — so the harness repaired the bug in the act of testing for it. The rewrite
moves the thumb **once** (`moveTo`, never `slideTo`) in an orientation the anchor was not set in, and
adds a second assert on the radius taken from the **shipped** `stickRadius()`, since landscape's
56.78 px against portrait's 81.12 makes an 8 px nudge 43% larger and a stale radius cannot fake it.

**D134** — **A4 WAS NEVER REAL, and the retraction is confirmed by the manager independently.**
`sky.html` combined a hardcoded `worldH: 1000` with a query-supplied `w`/`h`, so every landscape run
measured **3.19× the world area** the game draws — which predicts the observed 27-vs-8 cutout ratio to
within 6%. With the profile chosen by `modeFor(w,h)` (exported from `viewport.js` so the page cannot
keep its own copy of the 1.05 threshold), landscape A4 reads **worst multiplicity 2 against a bar of
3**, repeat frames **161/180 → 32/180**. Manager re-ran it cold: `frame 844x390 landscape, worldH 560`,
**A4 PASS**. **The cloud atlas was never wrong. Do not touch it.**

**D135** — **P4a is arithmetically unsatisfiable in BOTH orientations and is struck, exactly as D27
struck its predecessor.** Two bands are co-visible only while the frame straddles a boundary; there
are 5 boundaries in a 10,000 wu column, so the ceiling is `5 × frameWu / 10,000` — **50.0% portrait,
28.0% landscape — with a ZERO px legibility bar.** The criterion asks for 55%. Reaching it needs zoom
0.715 in portrait (below its own 0.78 floor) and 0.274 in landscape.

**No assumption about the 90 px bar is needed to settle it**, which is what makes this different from
a criterion that is merely hard. It is D27's struck criterion one notch weaker, carrying the same
arithmetic error. The agent did not move the bar, did not shrink the bands (D126 forbids it) and did
not pin the camera — it proved the thing could not be done and said so. Related and also derived
rather than exploited: `legibleWu / frameWu = BAND_LEGIBLE_PX / view.h`, so **the legibility bar is a
fixed fraction of the viewport at every zoom** — which is why no camera move rescues P4 and why
"zoom out a bit" was never available here either (D126).

**D136** — **Three break-switches were green when they should have been red, and the third was found
by the manager mistyping a flag.** Two were the agent's: `--crane-rate 900` stayed green because
"≥ 3 bands seen" read loosely enough for a faster, longer crane to count Belt/Floor/Deck while
dropping Mud to 0.44 s — **the criterion was wrong, not the switch**, and it is now tied to §3.3
constraint 2's own subject, the three lowest bands by name. And `orient.mjs`'s `noreanchor` never
reached the page, so it tested the fixed build against itself.

The third is still open: **`skygate.mjs`'s `--falsify` arms hardcode `w=390&h=844`**, so
`--falsify` runs portrait whatever `--w`/`--h` say. **The landscape A4 control has never been proven
to go red in landscape** — the retraction in D134 stands on its own measurement, but its falsification
does not. It was visible only because the agent's own good idea, printing the measured frame on every
run, made a wrong flag obvious. **A harness that reports what it actually did is worth more than one
that is merely correct.**

**D137** — **The `skygate --falsify` bug was worse than the manager described, and its guard proves why
the class survives.** `--w 844 --h 390 --falsify` set an **844×390 browser viewport and loaded a
390×844 page inside it**, then printed the portrait control's number against the landscape run's
shipped figure. Now: one URL builder (`grep -c "cdp.goto("` returns 1), `load()` reads
`window.__sky.frame` back and **aborts by name** if the page did not come up in the frame it asked
for, each control prints its own frame, and `--falsify` **exits 1** when a control stays green instead
of printing a warning and exiting 0 — the same silent-death shape as the `execFileSync` throw.

**The controls, actually in landscape:** A4 one-cutout → multiplicity **4** against a bar of 3
(shipped 2), *stronger* than the portrait 3 it had been standing in for; A7 → 0.019 s. **D134's
conclusion holds and is now evidenced rather than assumed.** Caveat kept: A4's control clears by one
multiplicity, not a margin.

**The guard is itself falsified, and the result is the lesson.** `--framebug` restores the defect: it
fires in landscape and **does not fire in portrait, because there the literal happened to be right.**
That is exactly how it survived an entire phase — invisible in the orientation the harness was written
in, and a lie only once D123 moved the target. **A constant that is accidentally correct is
indistinguishable from one that is deliberately correct, until the assumption moves.**

Swept for the same shape across `tools/`: `skygate` was the only instance.

**D138** — **`world.js` §2 landed, and W5d is the finding: a second wind evaluator is QUIET, not
loud.** Per-profile impact movement under a forbidden second implementation:
`calm 0.00 m · steady 0.00 m · knot-dense 0.15 m · seeded#0 0.55 m · shear 3.36 m · … · seeded#3
28.22 m`. **A single-profile control would have measured 0.15 m against a 1 m bar and certified that
W5 cannot fail** — the seventh believable-wrong reading, avoided only because sweeping profiles was
cheap. W5c is the load-bearing row: worst |delta| **0 over 10,000 (profile, altitude) pairs**, sampled
at the knots *and* the gaps, because a nearest-vs-linear defect agrees exactly at every knot.

`validate.js` rejects W1's seven by name and **enforces D126's structural rule rather than noting it** —
one central signature per band is rejected, because a band with two neighbours needs one near *each*
boundary (a central instance puts Belt's and Floor's 1,150 wu apart, 2.7× the bound). Every rule
delegates to whoever owns the constant, and **W1b diffs `RUN_STATS` against a real `sim.mjs` summary on
every run**, so a renamed stat fails loudly instead of turning a star into a silently-never-awarded one.

**D139** — **K5 regressed to 0 points and the ladder is fine — the instrument is not. Eighth of these,
and the first that reads FALSE-NEGATIVE.** `--p6gates` is 8/10; `P6_NOTES` §12 recorded K5 as PASS at
+12.5. It now reads 0, deterministically.

The gate's own detail line settles it. **The HP delta is positive in every cell** — t1/2e +18.6,
t1/3e +13.1, t2/2e +3.3, t2/3e +11.6, pooled **+7.4 HP per sortie** — while the death-rate delta reads
0. Two defects, both structural:

1. **Floor effect.** K5 pools only cells whose *baseline* death rate falls in DESIGN §10.5's 8–30%
   band, and asks whether reinforcement lowers deaths. A cell at 3% baseline has no room to improve.
   The agent said it exactly: *"the death-rate delta only reads positive where the baseline has
   headroom, which is the instrument's own constraint and not the ladder's."*
2. **Quantisation.** 30 sorties per cell means death rate can only move in steps of 3.33 points. The
   two surviving cells both read 20.0% → 20.0%.

**D128's hull 64 → 66 did not break K5; it revealed that K5 was never robust.** Which cells qualify
depends on a threshold the hull moved, so the criterion was one tuning change away from meaningless
the whole time. `--fixtures` hashes are unchanged and W5c proves the wind move was bit-identical, so
nothing else is implicated.

**Ruling: K5 is re-specified onto HP per sortie**, a continuous measure of the same claim, with the
death rate retained as a reported secondary so the regression stays visible. **It does not count until
it has been falsified** — remove the reinforcement ladder and the new number must go flat or negative.

**This is the fifth criterion re-specified since P8, so the standing rule is now explicit: a
re-specified criterion is not evidence until its break-switch has been RUN and seen to go red.** D114
was authorised by the manager and was wrong precisely because that step was skipped.

**D140** — **C7's move is NOT D128's doing, and the constant does not need splitting. Traced rather
than assumed.**

The pause note nominated D128's minimum enemy hull 64 → 66 wu as the suspect for C7 dropping from
D87's 48.9% ± 1.8 to 46.0% ± 1.8. It is cleared on three independent counts:

1. **`MIN_ENEMY_HULL_WU` reaches the sim nowhere that matters.** Its only live consumer is
   `FRAMING.hullWu` (`entities.js:552`), used at line 588 solely to size a framing-box member — a
   camera quantity. It is also set on enemy airframe records at line 99, and **`airframe.hullWu` has
   no consumer at all in `js/sim/`, `js/data/` or `js/modes/`.**
2. **The mirror ace is still a mirror.** `mirrorType(pAirframe, pGun)` builds A12 from the *player's
   own airframe object*, so both sides of C7's duel carry identical geometry whatever the enemy
   minimum is. C7's premise — identical machines, identical skill, therefore 50% — is intact.
3. **`--fixtures` is 9/9 at unchanged blessed hashes.** The flight and damage models are bit-identical
   to when they were blessed, so nothing in the sim moved.

**What is left is a measurement question, not a model one.** D87 recorded two figures — "48.9% ± 1.8
across five airframes" and "49.6% over 1,200 duels" — where today's row reads "46.0% of 774 decisive".
The sample is not the same size, so the two may never have been comparable. Determinism is being
checked by repeat run; **if C7 is bit-repeatable at 46.0% then the number to correct is D87's
provenance, not the model.**

**Recorded because the near-miss is the point: the pause note's own recommendation — "if the interval
returns, split the constant" — would have split a constant the sim never reads.** A plausible suspect
named in a handoff is still a hypothesis, and this project's rule applies to the manager's hypotheses
as much as to an agent's claims.

**D140 (closed)** — **C7 is bit-repeatable at 46.0% of 774 decisive across two independent runs, and
`--fixtures` is 9/9 at unchanged blessed hashes. The model did not move; D128 is fully cleared.** What
differs from D87 is the sample, not the sim — D87 quoted "48.9% ± 1.8 across five airframes" and
"49.6% over 1,200 duels" against today's 774 *decisive*, which excludes draws. **The number needing
correction is D87's provenance.**

**But one real thing survives the clearing, and it is not a regression: the mirror is biased.** At
46.0% ± 1.8 the interval is [44.2, 47.8] and **excludes 50%** — where D87's [47.1, 50.7] contained it.
A mirror ace flying the player's own airframe object at equal `k` should sit at 50% by construction, so
a stable 4-point deficit says there is a **seat or side asymmetry**, not a balance problem.

`duel.js` already ships the instrument for exactly this: `opts.swap`, whose own comment says running
the mirror both ways *"is what would have caught the spawn-roll and pilot-sign bugs on the first day
instead of the third."* **Route to P11 with C4/C5/C6** (stale per D89) — but run the swap arm first,
because if the deficit flips sign when the seats swap it is a bug in the harness or the spawn, and
tuning a balance register against it would bake the bug into all 100 levels.

**D141** — **D139 was half right, and the half I got wrong is the half I should have been most careful
about. I replaced a bad metric with a reading taken from the same bad sample.**

D139 ruled that K5's death rate could not measure the ladder — correct, and it stands. But its
*premise* — "the ladder is fine, evidenced by +7.4 HP per sortie in every cell" — does not survive
more sorties:

| sorties/cell | seed 4000 | seed 9000 |
|---|---|---|
| 30 | **+7.75 ± 5.80** (the figure I quoted) | **−2.48 ± 4.65** — the sign flips |
| 120 | +2.18 ± 2.52 | −1.13 ± 2.33 |
| **240** | **−0.78 ± 1.80** | **−0.80 ± 1.68** |

**The effect shrank as the standard error shrank. That is the signature of zero.** The +7.4 was a
30-sortie artefact of exactly the kind it was replacing — I criticised the death rate for being
quantised over 30 sorties and then read the HP figure off the same 30 sorties without checking a
second seed. **One seed is not a measurement** (D138 said this about wind profiles four decisions
earlier).

**D142** — **Chasing the metric found a real bug, and it is the best catch of the phase: reinforcements
were killing themselves on arrival.** `flushPending` fires every reinforcement in one tick and
`onReinforce` spawned them all at `player.sx + 800` under id `'rein' + world.t` — so **both aeroplanes
materialised on the same point, inside a 5.2 m collision radius costing 60 HP/tick, and were wreckage
before they flew.** At seed 4000 `hpLost` was **bit-identical (122.1) with and without the treatment**.

The gate could not see it because **it read `delivered: yes` in all six cells**: carcasses linger ~20 s
in `world.live` and the selector counted enemy-seconds, so dead-on-arrival looked like delivered. A
second defect compounded it — `advanceLadder` applied rung 2's `dmgMult` over `world.live`, **empty
before the first tick**, so it reached nobody.

| | before | after |
|---|---|---|
| K5 pooled | +7.75 ± 5.80, t 1.34, **FAIL** | **+85.43 ± 4.69, t 18.20, PASS**, 6/6 cells positive |
| death-rate delta | +1.7 pts | **+64.4 pts** |
| seed 4000 vs 9000 @ 120/cell | −0.78 vs −0.80 (both zero) | **+74.35 vs +75.75 — 1.9% apart** |

**Every break-switch was RUN**: `no-ladder` → exactly **+0.00**; `rein-stacked` → **+7.85 ± 5.80,
t 1.35**, reproducing the inherited broken state to the decimal; and `preload-live` turns the **new**
`ladderPreload` fixture RED at `carrying 0/3` while the **old `ladderSpawns` fixture stays green** —
because it ran at `enemies: 0` and could therefore only ever check the ledger. **Another check that
could not fail, found by building the one that could.** `K5_RUNS` stays at 30, derived from LADDER's
smallest rung (14.8 HP → SE ≤ 7.4, measured 4.69); the sweep to 240 existed to falsify, not to buy
significance.

**D143** — **My "the pause was clean" was wrong, and I asserted it without running anything.** I
stopped the P9 agent one tool-call after it announced it was starting the K5 re-specification, checked
that a *different* item had landed, and wrote "nothing is half-written" into the handoff. In fact
`sim.mjs` had been saved with a re-specified `ladderReport` referencing **`K5_RUNS`, a constant that
did not exist** — `--p6gates` died with a `ReferenceError` before printing a line.

**The rule this project already had covers it and I did not apply it to myself: verify, do not report.**
A stop is a state change like any other, and the cheapest possible check — re-run the suite the agent
was editing — would have caught it in seconds. **After killing an agent mid-task, run the gates it
touched before writing any handoff.**

**D144** — **Two of the agent's own artefacts were wrong and it said so rather than shipping them**,
which is the behaviour that makes the rest of its numbers worth reading. Its first W7 size fixture
invented 60 beats and 12 inline radio lines for 9,071 B, against DESIGN's own cap of 4 enemy groups
and 12 crates with all text in `script.json` — rebuilt at **3,859 B, 63% of the cap**. And its first
terrain slope bound was **a sine's** (`π·amp/wl`), which condemned a profile 19% inside the limit and
passed one 3× over: **two of its own four profiles were illegal against a bound stated ten lines
above them.** It also caught itself using the floor as a *target*, which had silently turned §7.1's
2,600 wu trench line into an 800 wu one.

Also declared rather than folded in: a one-loop fix in `js/sim/crates.js` (P6's file) iterating
`world.aircraft` instead of `world.live`, no constant moved, blessed hashes unchanged, pre-fix state
kept as a break-switch.

**D145** — **REQUEST-12 refused on arithmetic: DESIGN Act 3's "valleys with no room to loop" cannot
exist in 2D.** F6's 263 wu turn diameter plus the terrain slope bound cap such a valley's relief at
**55 wu (8.3 m)**. No constant was moved. It goes on the list with D27, D94, D101 and D135 — criteria
and set-pieces this project has struck because the arithmetic forbids them, not because they were hard.

**D146** — **REQUEST-11 settled, unblocking item 7: the SHIPPED ROSTER is the authority and DESIGN
§8.3's codebook is re-authored onto it.** The eight shipped enemy types are **`kestrel` (scout),
`wasp` (scout), `shrike` (triplane), `drover` (two-seat), `ox` (transport), `marlin` (bomber),
`nightjar` (bomber), `anvil` (armoured)**. §8.3's letters `g`/`B`/`F`/`Z` map onto no entity type and
four of the enemies §7.1 names are not in the roster at all.

**This is not a close call.** The roster is built, balanced and gate-tested through P5 and P6 — C4–C7,
K1–K10 and every blessed fixture rest on it. §8.3's codebook was authored by a planning agent before
the roster settled, and has never been executed by anything. **Where a planning document and shipped,
tested code disagree about what exists, the code wins.** Author a one-letter code per shipped type,
initials where they are unique, and put the table in the level format's own documentation so there is
exactly one copy (D72).

**§7.1's worked example is illustrative, not normative, and it is wrong on its own terms** — Mud at
333 wu against the 700 wu floor, and a wind of "40 m/s" against `WIND_MAX_MS` 25, which settles that
its units were meant to be **wu/s**. Rewrite the example so it passes `validate.js`; do not weaken the
validator to admit it. That the project's own worked example fails the project's own validator is
exactly the check earning its keep on the first thing it was pointed at.

**Nothing here goes to Aaron**: it changes how a level file is spelled, not what the game is.

**D147** — **P7 is measured for the first time and it independently corroborates D123, which no one
set out to test.** Ground-attack legibility: **landscape PASS at 8 targets of 8** within 1,200 wu of
forward reach; **portrait NEITHER at 2**, needing 420 wu for three targets against a frame that reaches
**404 wu — short by 16 wu.** It is **reach-bound, not occlusion-bound**; the trench line hides none of
them.

**Two independent §4.4.2 criteria now fail portrait on the same 404 wu.** D121's P2 was about a diving
attacker's warning; P7 is about ground targets ahead while strafing — different subject, different
harness, written months apart, same constant. A number that keeps arriving from directions nobody
aimed at it is the strongest evidence this project has produced, and it landed *after* the decision it
supports rather than in defence of it.

**D148** — **All three of P9's break-switches were green first time, and the cause was not the code.**
They were read straight off the command line inside `levelRun`, fell through `main()`'s dispatcher and
**exited before running anything** — producing three byte-identical hashes that read exactly like three
healthy controls. Then, separately, a four-arm comparison ran from a zsh loop where `${b:+--break $b}`
**is not word-split**, so **every arm silently ran the baseline** and agreed perfectly.

**The shell can fake a green control as convincingly as the code can.** Every falsification result in
this project has assumed the switch reached the thing it names; twice in one phase it did not, once in
the harness and once in the shell that invoked it. **A control must prove it ran, not merely that it
returned** — the counter-measure is the same one that caught D137: make the arm report what it
actually did, not what it was asked to do.

**D149** — **Three shipped defects the generator exposed, none findable by reading:**
1. **A named terrain profile did not bring its own parameters.** `terrain: { profile: 'pass_narrow' }`
   — DESIGN §8.10's own spelling — loaded carrying the trench line's amp 90 / wl 2,600 instead of
   620 / 5,950. A level would have played a different landscape from the one it names.
2. **`player.airframe` fell back silently.** `"kitehawk-i"` is not an id the game builds and
   `playerType()` quietly returns the reference airframe — so a typo'd loadout plays as a different
   aeroplane and validates clean. Now W1g. This is a **fourth** defect in §7.1's example, on top of
   D146's three.
3. **The loader's own sort hid a fault from every consumer.** `createLevel` sorts beats, so by the
   time a page or a mode validates, an out-of-order level looks correct. The loader now carries
   `beatOrderFault`. **A normalising step upstream of a check erases what the check exists to find.**

**D150** — **REQUEST-15 settled: act 1's ceiling comes down to 450 m; the bands do not move.** DESIGN
§8.2 gives act 1 a 600 m ceiling *and* says "Mud/Belt/Floor only", and R-02's Floor ends at **450 m** —
so a quarter of act 1's legal column is in Deck and the two statements have never agreed. The agent
refused to move a constant or re-word W4, which was right.

**The band edges are physics-facing and fixed (D26, D126); the ceiling is a design statement.** So the
ceiling yields: **act 1 is 450 m, which is exactly Mud + Belt + Floor** and makes §8.2 self-consistent
without touching a single band. W4 should then go green on `a1-01` on its own. **If it does not, that
is a second fault and it must be reported, not tuned around.**

**D151** — Two smaller rulings. **REQUEST-13: `a2-25` does not exist and BUILD_PLAN is wrong.** An act
is 100/5 = 20 levels, so level 25 of 100 is **`a2-05`** — which is the level BUILD_PLAN actually
describes. The generator's strict `parseLevelId` is correct; the brief has the typo.

**REQUEST-16: the `quick` star stays unreachable and is deferred to P11, with no multiplier invented.**
`length = t(s) × CRUISE_WU_S` spends the entire authored duration on the traverse, so `a1-01` runs
97.1 s against a 50 s bar — **and 51.8 s even with the level completely empty.** The honest form is
`(t − fight) × cruise`, and `fight` is a balance quantity P11 owns. **Generated levels ship without a
meaningful `quick` threshold rather than with a fabricated one**; P11 sets it from measured fight
duration.

**D152** — **D150 was a ruling on prose, and nothing executed it. My error, and the sharpest lesson
of P10.** I ruled act 1's ceiling down from 600 m to 450 m and wrote "W4 should then go green on its
own; if it does not, that is a second fault." W4 did not move **by a single bit** — because
`level.column.ceiling` had existed since P9 and **no shipped code ever read it.** I changed a number
in a document nothing runs and predicted a behavioural consequence from it.

P10 made it executable: `actCeilingWu()` derives the ceiling as the top of the act's own declared
band slice — act 1 → −3,000 wu = 450 m, **D150's number without typing D150's number** — carried in
`column.ceiling` and enforced as a reflecting lid by the one shared corridor. a1-01 went 4 occupied
bands → **3**, Deck time **26.7 s → 0.1 s**, and the lid costs nothing in completion (every level's
rate identical between arms). The `--break no-lid` control reports `lid 0 / 0 contacts` and W4 returns
to 4 bands, so the lid is proven to be doing the work.

**The general form: a constant only means something when something reads it.** This project has spent
all day on constants that were read by the wrong thing, read by two things, or accidentally right.
This one was read by nothing at all, and a ruling I made on it produced exactly zero effect while
sounding decisive.

**D153** — **M1 is nondeterministic and mis-specified, and it must be re-specified before P11.** It
read FAIL on the manager's first run and **PASS on the second with identical code** — 41.1 s,
completed, won, 3 stars, 682 real touch moves, 0 console errors.

The cause is that **M1 requires `won: true`**, and the reference pilot wins a1-01 **10 of 12 seeds**
— a deliberate balance property, not a defect. A level the bot always wins is not a level. So roughly
one run in six, the first-playable gate reads red *because the game is correctly balanced*, and the
thumb being driven on the wall clock (D132's spread, one layer down) decides which.

**A gate whose verdict flips run to run on unchanged code is not a gate.** Re-specify M1 onto what it
actually claims — *"a human plays a1-01 end to end"*: boots, accepts real touch, reaches a **terminal
state (win or loss)**, shows a result screen, zero console errors. **Whether the bot wins is a balance
question and belongs to P11.** Per the standing rule (D141), the re-specification does not count until
its break-switch has been run and seen to go red.

**D154** — **M2 was passing because the pilot was bad. Ninth of these, and the first where improving
the game broke the test.** M2 passed twice before the objective guide landed. It went red *because*
of it: **cutting a canopy is what you do to a crate you cannot reach**, and a pilot who presses on
catches 5 of 6 and never needs to. Swept 36 seeds × 2 engage modes — cut and deny appear in **3 of
36**, and no seed gives all three.

The agent did not move the bar, remove the guide, or fish for a seed. **Recorded as the honest state:
the cut/deny half of D4's signature mechanic is not exercised by a competent pilot on act 1 levels**,
which is a design question — the mechanic may need a mission that *forces* an unreachable crate — and
it goes to P11 with REQUEST-5, not to a threshold.

Related and also refused: **REQUEST-3, the 1.6× cut economy is arithmetically unreachable.** Crates
drop 1,328 wu *ahead* and the wind blows east, so the westernmost landing over 6 seeds is **3,287 wu
against a 600 wu line** — `cutTaken` is structurally 0 and **the level format has no front-line
field.** The arm proved it ran (`field.lineX` reads back 600).

**D155** — **THE MANAGER LOOKED, and the first playable is playable and grey.** `shots/p10/m1-a1-01.png`
at 844×390: it boots, it flies, the HUD reads, the band tape and stress bar are legible, and the whole
frame is a **wash of grey-green with white cloud on it.**

**The aeroplane is the problem, and it is a new one.** It clears P3's silhouette gate — the size is
right — but it is a pale sketchy shape sitting on a pale cloud, and at a glance **you have to hunt for
your own aeroplane.** P3 measures the hull in **pixels**; nothing measures it in **contrast**. ART §10
already requires every HUD mark be drawn twice for exactly this reason, and the aeroplane — the one
thing a player must never lose — gets no such treatment.

That is the same shape as everything else found today: **the right quantity measured badly.** A
34-pixel silhouette in the wrong tone passes a legibility gate while being illegible. **Routed to P16
with a criterion attached, not a note: the player's aeroplane must clear a stated contrast ratio
against the sky and cloud behind it, measured the way ART §10 measures HUD marks.**

D84 stands — playable beats pretty, and this is playable. The art bar is P16's and it is not blocking.
