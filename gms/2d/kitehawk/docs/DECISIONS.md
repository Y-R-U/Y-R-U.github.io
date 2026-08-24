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
