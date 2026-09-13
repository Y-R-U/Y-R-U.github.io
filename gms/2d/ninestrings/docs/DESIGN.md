# NINE STRINGS — Design

> A survivors-like where the dead do not choose. Every corpse on the field is
> puppeted from above. You are the only one who can see the strings, and the
> only one who can cut them.

## 1. The premise

Nine demon **Choirmasters** discovered that the dead make obedient hands. A
corpse takes a string without complaint. The living fight back; the dead simply
*keep coming*, because something else is doing the walking.

You are a **Stringcutter**. You see the threads. The story is the climb from a
single overrun lane to the Ninth Throne, and the slow reveal of what the
strings are actually *for* — the Choirs are not an army, they are an
instrument, and the song they are building is meant to be heard by something
underneath the world.

## 2. What makes this not just a clone

Everything below is the differentiator. A survivors-like lives or dies on one
mechanic that the others do not have. Ours is **the strings**.

### 2.1 Strings
- Every non-trivial enemy is **strung**: a thin luminous thread runs from its
  nape up and away toward its Conductor. Threads are drawn as living catenary
  curves that sway, tauten when the puppet lunges, and go slack when it dies.
- Threads are **colour-coded by Choir** (each Conductor owns a colour).
- A strung enemy is *stronger* than the same corpse unstrung: it gets the
  Choir's buff (speed, armour, fire aura, regen — the Conductor's affix).

### 2.2 Cutting
- **Any damaging hitbox that crosses the string's curve severs it** — not the
  body, the *thread*. Severing is a separate, additional interaction on top of
  ordinary damage.
- A severed puppet **collapses**: it drops instantly to 0 aggression for
  `CUT_LIMP_MS`, takes bonus damage, drops a bigger XP shard, and can be
  finished for free. Occasionally (luck-scaled) it stands back up **on your
  side** for a few seconds as a **Freed** ally.
- This is the skill ceiling: bodies are the easy target, threads are the
  correct one. A player who aims at the *gaps between* enemies out-clears a
  player who aims at enemies.

### 2.3 Conductors
- Each stage seeds Conductors: hovering demons that do not touch the ground,
  drift away from you, and hold a Choir of N puppets.
- Killing a Conductor is a **screen event**: every thread in its Choir snaps at
  once, the whole Choir goes limp, a shockwave of white goes out, and a chest
  drops. This is the game's "big moment" and should happen every ~60–90s.
- Conductors carry **affixes** that stack up over a stage, so the horde is
  visibly *changing* — the same shambler is fast, then armoured, then burning,
  depending on who is holding it.

### 2.4 Chorus events
- At fixed times a **Chorus** begins: all Conductors converge, threads pull
  taut into a lattice, and the horde moves in unison. High danger, high reward,
  and the single best screenshot in the game.

## 3. Core loop

Top-down portrait arena. **You move; your weapons fire themselves.**

1. Move with a thumb (drag-anywhere virtual stick, or WASD/arrows on desktop).
2. Enemies stream in on a per-stage timeline. They drop **shards** (XP).
3. Shards level you. Each level → pick **1 of N** upgrades (N grows with unlocks).
4. Conductors appear on a cadence; killing one drops a **chest** (evolution roll).
5. The stage ends at its timer with a **Choirmaster** boss, or you die.
6. Death or victory pays out **Souls** → spend in the **Sanctum** (meta).

Run length: **8 min** (Act I) rising to **20 min** (Act IV). Short early runs
are deliberate — the opening must not cost a commuter twenty minutes to see
whether they like it.

## 4. The onboarding ramp (this is load-bearing)

The single most common failure of this genre is showing a new player eleven
systems at once. NINE STRINGS opens as **almost nothing** and grows.

| Moment | What the player sees |
|---|---|
| First launch | No menu. A lane, a lamp, one sentence, and a thumb prompt. |
| 0:00–0:30 | Move only. Three shamblers. Hand-held: "Hold anywhere to move." |
| 0:30 | First weapon fires itself. "You don't aim. Stay alive." |
| 1:00 | First level-up: **2** choices only, both obviously good. |
| 2:00 | First string is pointed out in slow motion. Hitstop, the thread lights. |
| 3:00 | First Conductor. Its Choir is 6 puppets, and it is a soft target. |
| Stage 1 end | Souls appear for the first time. Sanctum unlocks. |
| Stage 2 | Passives enter the level-up pool. 3 choices. |
| Stage 3 | Chests + evolutions explained by a story beat, not a tooltip. |
| Stage 4 | Relics (pre-run loadout) unlock. 4 choices at level-up. |
| Stage 6 | Sigils (mid-run rule-breaking drafts) unlock. |
| Stage 9 | Curse tiers unlock for replay. |
| Story clear | Endless, Choir-Hunt, and the secret character unlock. |

Nothing in the UI exists before it is earned. The Sanctum literally grows new
doors.

## 5. Progression systems (the depth)

- **Weapons** (16) — auto-firing. Max level 8.
- **Passives** (12) — stat shapes. Max level 5.
- **Evolutions** (10) — weapon at max + the right passive owned → the chest from
  a Conductor kill rolls the evolved form. Evolved weapons change *behaviour*,
  not just numbers.
- **Characters** (6) — each owns a signature weapon and a trait.
- **Sanctum** (meta) — permanent, Souls-bought: might, haste, armour, greed,
  luck, revival, reroll/banish/skip charges, starting level.
- **Relics** (14) — pre-run loadout, one slot growing to three. Sharp
  trade-offs, not flat buffs ("+50% damage, you cannot be healed").
- **Sigils** (18) — drafted at 5/10/15 min. Rule-benders ("severed threads
  chain to the nearest puppet", "you have no weapons, but Freed allies never
  expire").
- **Curse tiers** (I–V) — per-stage difficulty ladders with unique rewards.
- **Codex** — bestiary, string lore, Choirmaster dossiers; fills in as you kill.
- **Challenges** (20) — bounded objective runs.

## 6. Cast

| # | Name | Signature weapon | Trait | Unlock |
|---|---|---|---|---|
| 1 | **Wick**, lamplighter | Emberlash — alternating flame arcs | +10% area | start |
| 2 | **Sister Vane** | Censer — orbiting thurible | heals on shard pickup | clear Stage 3 |
| 3 | **Dredge**, gravedigger | Bonesaw — returning boomerang | +20% crit | 500 kills in a run |
| 4 | **Ilse the Quiet** | Silver Shears — thread-seeking blades | sever radius ×2 | cut 100 strings |
| 5 | **Cardinal Ash** | Pyre Bell — expanding ring | +25% damage, −15% speed | beat 3 Choirmasters |
| 6 | **The Ninth's Hand** | String — you puppet *them* | Freed allies never expire | finish the story |

## 7. Stages and story

Four acts, twelve stages, three Choirmasters on the way and the Ninth at the end.

**Act I — The Town.** 1 Bellfield Lane · 2 The Flooded Row · 3 Ossuary Gate
→ **Hollowth, the First Note** (a bloated chorister that sings its Choir back up)

**Act II — The Marsh.** 4 Widow's Marsh · 5 The Drowned Chapel · 6 Threadworks
→ **Vellish the Weaver** (re-strings the dead you have already cut)

**Act III — The City.** 7 Ashgate · 8 The Long Hospital · 9 Choir Hall
→ **Cantor Morrow** (conducts *you* — inverts your controls in bars of music)

**Act IV — Below.** 10 The Descent · 11 The Loom of Names · 12 The Ninth Throne
→ **The Ninth** (three phases; the last one has no puppets in it at all)

Dialogue is a two-portrait visual-novel strip before and after each stage,
skippable, ~6 lines. The arc: *there is a plague* → *the plague is obedience* →
*the strings run somewhere* → *the Loom holds a thread with your name on it* →
the choice at the end (cut your own string, or take the Ninth's hand).

## 8. Art direction

**Look:** wet black streets, bone-white bodies, and exactly one saturated
colour per Choir bleeding into everything. Heavy bloom, heavy contrast, near-
black backgrounds so that thin bright threads read at phone size. Think a
rain-lit etching with neon in the wounds.

**Entities are procedural, not downloaded.** A humanoid rig is drawn into an
offscreen atlas at boot from parts + palettes + a walk cycle, so we get
hundreds of distinct, animated, perfectly readable 32–48px silhouettes for
zero bytes and zero pop-in. Sprite variety is a *function*, not a folder.

**Flux generates only what never touches a frame budget**: title art, the six
character portraits, the nine Choirmaster portraits, per-act story panels,
ground/backdrop textures, and the Sanctum. Those load lazily behind the menu.

**Flash is spent on motion, not detail:** additive bloom, hitstop on big hits,
screen shake with a decaying spring, chromatic split on damage taken, damage
numbers that arc, thread-snap whips, shard magnetism streams, a shockwave ring
on every Conductor death, and a full-screen white-out + slow-mo on a Chorus.

## 8.5 MOBILE-FIRST PORTRAIT — non-negotiable

This game is designed for **a phone held upright in one hand**, and every other
form factor is an afterthought that must not cost the phone anything.

- **Portrait only.** The arena, the HUD, every menu and every cutscene are laid
  out for a tall narrow screen. Landscape is *tolerated* (letterboxed to a
  portrait-proportioned play area) but never designed for.
- **One thumb.** Movement is a drag-anywhere stick. Every interactive control a
  player touches *during* a run sits in the **bottom half** of the screen,
  because that is where a thumb is. The level-up screen — the most-used screen
  in the game — must be fully operable without changing grip.
- **Reach beats symmetry.** Do not centre a button vertically because it looks
  balanced. Put it where a thumb lands.
- **Safe areas are real.** Nothing under the notch, the status bar, the home
  indicator, or the rounded corners. Use `env(safe-area-inset-*)` via the CSS
  variables in `style.css`; `viewport.js` measures them for canvas code.
- **≥44px hit targets**, ≥8px apart. Gated by `tools/uishot.mjs --hit`.
- **Readable at arm's length on a 5-inch screen.** No body text under 12px. Thin
  1px lines do not survive; the strings read because they *glow*, not because
  they are precise.
- **Test devices are the gate, not the desktop window.** The gates run at
  **390×844** (iPhone 14), **360×640** (a small cheap Android) and **430×932**
  (a large phone), at DPR 2. If it only works in a desktop browser at 500px
  wide, it does not work.
- **Thermal and battery are a design constraint.** 60fps that cooks the phone in
  four minutes is not 60fps. Adaptive quality exists for this.

## 9. Performance contract

Target: **60fps on a 2021 phone** with 400 active enemies, 300 projectiles and
3000 particles, in portrait at DPR 2.

- WebGL2 single-batch sprite renderer, one atlas texture, one draw call per
  blend mode per layer. No per-entity state changes, ever.
- All entities are **pooled**; no allocation in the frame loop.
- A fixed 60Hz sim step with a render interpolation, so balance is
  frame-rate-independent and reproducible headless.
- Bloom at quarter resolution. Post is three passes, not seven.
- Spatial hash for collision, rebuilt once per step.
- Adaptive quality: particle budget and bloom scale drop automatically if the
  frame clock slips, before anything gameplay-visible does.

## 10. Rules of this codebase

- **Vanilla JS + WebGL2. No build step, no CDN, no dependencies, no importmap.**
  With nothing to fetch there is nothing to hang on a failed fetch.
- **The sim never reads the renderer.** `js/sim/**` must run under node with no
  canvas, because the balance harness depends on exactly that.
- **All sim randomness goes through the injected rng.** No `Math.random()`
  anywhere under `js/sim/`.
- **Content is data.** Weapons, enemies, stages and story are declarative
  tables in `js/data/**`. Adding a weapon must never require touching the sim.
- **Never `alert()`/`confirm()`.** Popups are in-page.
