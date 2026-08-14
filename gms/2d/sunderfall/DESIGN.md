# SUNDERFALL — game design

Companion to `ARCHITECTURE.md` (the technical contract). This file is the **content** spec: spells,
progression, enemies, the level. Agents implementing systems build to this. Numbers here are a
starting point and may be tuned in play — if you change one, record it in `HANDOFF.md`.

---

## 1. The feel, in one paragraph

Rook is a sulking teenager who has been handed responsibility he did not ask for and is not ready
for. That is the whole tone: the magic is bigger than he is. Spells should feel slightly out of
control — a Sunderquake brings down more wall than you meant it to, a fire you lit keeps burning
after the fight, acid you cast is still eating a bridge two minutes later. **The world remembers
what you did to it.** That persistence is the thing players will screenshot.

Combat is a side-scrolling platformer: run, jump, dash, and aim. Slot 1 is the spell you fire
yourself; the rest go off on their own, so the skill is in **positioning and loadout**, not in
mashing five buttons — which is also what makes it play properly on a phone.

## 2. Progression

XP from kills and from destruction (breaking things is rewarded — it is the signature mechanic and
must pay). Level 1 → 24 over one long level, roughly 35–50 minutes.

| Level | Unlock |
|---|---|
| 1 | Cast circle 1 (manual), **Emberbolt** |
| 3 | Cast circle 2 (auto) |
| 7 | Cast circle 3 (auto) |
| 12 | Cast circle 4 (auto) |
| 18 | Cast circle 5 (auto) |
| every 2 | a spell choice: pick 1 of 3 offered |

Each spell has **5 ranks**. Ranks come from spell shards dropped by elites and found in the world,
so the player chooses between breadth and depth. Rank scaling should change *behaviour*, not just
numbers — Emberbolt rank 3 forks, rank 5 leaves a burning trail. A rank that only adds +15% damage
is a wasted rank.

**Focus** is the resource: 100 base, regenerates ~12/s, regen pauses ~0.8s after a manual cast.
Auto-cast circles draw from the same pool, so stacking expensive auto-spells starves your manual
one. That tension is the loadout puzzle.

## 3. Spells — 18, across six schools

Every spell must do something to the *world*, not only to enemies. The "world effect" column is not
optional flavour; it is the requirement.

### Fire
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `emberbolt` | Emberbolt | aim | Fast bolt, low cost, the bread and butter. R3 forks on kill, R5 leaves a burning trail. | Ignites TIMBER/FOLIAGE |
| `cinderwake` | Cinderwake | self | 2–4 embers orbit Rook, burning what they touch. | Sets fire to anything it brushes past |
| `emberstorm` | Emberstorm | area | Meteors fall across a band of screen. Slow, expensive, devastating. | Cratering; heavy MASONRY/ROCK damage |
| `pyreveil` | Pyreveil | self | A ring of flame that burns anything crossing it. Defensive. | Scorches ground, ignites props in the ring |

### Storm
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `sparklash` | Sparklash | nearest | Chain lightning, arcs to 3 → 6 targets. | Shatters GLASS instantly; rings METAL |
| `stormcall` | Stormcall | ground | A standing storm cell that strikes on a timer. | Splinters TIMBER; ignites what it strikes |
| `galewrench` | Galewrench | aim | A shoving blast — knockback, no damage to speak of. | Topples FOLIAGE, shoves debris, blows fire sideways |

### Earth
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `stonepin` | Stonepin | aim | Heavy shard, arcs, huge impact damage. | Best-in-class vs MASONRY and ROCK |
| `sunderquake` | Sunderquake | self | Ground slam. The wall-breaker. | Cracks terrain, **collapses supported structures** |
| `thornsurge` | Thornsurge | ground | Roots erupt in a line, impaling and holding. | Roots crack MASONRY they burst through |
| `bulwark` | Bulwark | ground | Raises a chunk of terrain as cover. It is itself destructible. | Adds terrain; can be broken by anyone |

### Decay
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `acidrain` | Acid Rain | area | Drips from above, pools on the ground, oozes downhill, persists. | **Eats MASONRY and TIMBER over time** |
| `blightbloom` | Blightbloom | nearest | A spore cloud that spreads corpse to corpse. | Rots FOLIAGE to brittle, then it crumbles |
| `bloodtithe` | Bloodtithe | nearest | Leech; heals Rook. | Withers plant life in a radius |

### Void
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `voidlash` | Voidlash | nearest | Tether that drags enemies together into a pile. | Pulls loose debris and props inward |
| `mirrorstep` | Mirrorstep | self | Blink, leaving a decoy that detonates. | Detonation damages all materials |
| `nullring` | Nullring | ground | A circle that erases projectiles and slows time inside it. | Freezes fire and acid spread inside it |

### Life
| id | name | targeting | what it does | world effect |
|---|---|---|---|---|
| `gravewake` | Gravewake | ground | **Raise dead.** Corpses and BONE piles rise and fight for you. | Consumes BONE props permanently |

Slot 1 defaults to `emberbolt` and only spells with a sensible manual aim belong there — mark the
rest `manualOnly: false` and let the player put whatever they like in slot 1 anyway. Their funeral.

### Spell juice checklist — every single spell needs all of these

Anticipation (a wind-up the player can read) → cast flash + light → travel with a trail →
**impact**: hitstop, screen shake, a flash, radial particles, a decal on the ground, and a sound →
secondary effect on the world → a lingering trace that outlives the cast. If a spell has no
lingering trace, it is not finished.

## 4. Enemies

Silhouette-first: each must be identifiable as a black shape. Telegraph every attack for at least
0.35s with a readable wind-up pose and a colour tell.

| id | role | behaviour |
|---|---|---|
| `husk` | fodder | Shambles, swipes. Dies in 2 hits. Leaves a corpse Gravewake can raise. |
| `sporeling` | fodder swarm | Fast, fragile, bursts into a spore cloud on death. |
| `thornhound` | rusher | Charges along the ground, must be jumped over or knocked back. |
| `gloamarcher` | ranged | Sits on ledges, fires a slow tracking bolt. Forces movement. |
| `stonewarden` | armoured | Ignores small hits. Only heavy impact or acid gets through. Smashes terrain itself. |
| `wispmaw` | flying | Drifts, drops burning globs. Ignites the ground beneath you. |
| `oozelord` | elite | Splits when hit; **slime oozes and pools**, spreads and slows. Drops a spell shard. |
| `sunderwraith` | elite | Phases through terrain, so cover does not save you. |
| **`theseam`** | boss | The tear the Darkness comes through. Fought at the end of the level: it grows, spawns, and tears down the arena around you as it goes. |

Enemies must interact with the destructible world — a stonewarden that walks through a wall you were
hiding behind is worth ten enemies that do not.

## 5. The level

One long level, left to right with vertical excursions, ~35–50 minutes, in four movements matching
the four art locations. The whole of it is one story: **Ostrick tells Rook to keep a fire lit, and
the fire goes out.**

1. **Thornmere edge** (dusk) — tutorial in disguise. Fences, crates, a barn. Teaches jump, dash,
   manual cast, and that things break. No real threat.
2. **The Sunderwood** (night) — the game proper. Verticality through the canopy, first elites, first
   auto-cast circle, first spell choice.
3. **Ruinreach** — collapsed medieval stonework. The destruction showcase: buttressed walls that
   genuinely collapse when you take out what supports them, bridges you can drop, arches you can
   bring down onto enemies. This is the section that must produce the screenshots. It ends at the
   **standing stones** (x 7550) and a rock face that does not open.
4. **The Glyphglade** — the breach east of the stones, the scorched approach, the clearing where
   Vayne died, and the arena. Boss: **the Seam**.

**The seam between 3 and 4 is a scene, not a door**, and it is four scenes long:

- **The stones** (7440). Rook meets **Keeper Ostrick**, a functionary who cannot believe Vayne would
  elevate a farm boy over forty years of his own service. Rook offers the power up, flatly, and that
  is what convinces him — nobody who wanted it would give it away, so Vayne must have been out of
  time. Ostrick leaves to fetch the elders and tells Rook to keep the brazier lit, because nothing
  crosses the stones while it burns. **This is the second adult in a row to hand him the job and
  walk away.**
- **The vigil** (7550). Three growing waves at the brazier. He is holding ground because he was
  told to.
- **The fire** (7550). The flame bends *inward* — something is drinking it — and Rook's own fire
  will not relight it, which is the first thing in the game he cannot do. The rock face cracks and
  opens: whatever is behind it has been leaning on it since the intro. So movement 4 has a cause
  instead of just being further right.
- **The glade** (8700). Back where Vayne died, with the ward circle still burnt into the ground and
  the staff still standing. **The Seam speaks in Vayne's voice** — it has none of its own and uses
  the last one it heard, and it gets him wrong: too even, no tremble, it repeats itself, and it says
  *Rook*, which Vayne never did. Rook takes the staff and walks east; the way closes behind him at
  9620.

He wins the way Vayne won — by spending what he has — and survives it because the old man already
paid for that. **The after scene** is the elders arriving too late and saying nothing at all while
Ostrick offers the only apology a functionary has: there is a Rite, there is a Naming, if the boy
wants it. Rook says *"No."* — Ostrick's own word from the stones, handed back — and goes home to
feed the goats.

Every line of it, with the Suno takes: **`docs/SCRIPTS-ACT-TWO.md`**. The data the game plays is
`game/js/story/scenes.js`; the sequencing is `sim/act.js`; `docs/ACT-TWO-CONTRACT.md` is how the
four pieces fit together.

Roguelite layer — **Vayne's ward**. The old man bound a ward to Rook's life before it cost him his
own, so death replays the day rather than ending it. It gives back what it can: every spell at the
rank he took it to, his shards, and **all but one level** of what he had become, never dropping him
below level 3 — which is where the second cast circle opens, so a death is never a return to
one-spell nothing. The death screen's other option, **Start over**, keeps nothing at all. The ward
explains itself the first time it is used.

*Revised 2026-08-14.* The ward used to take a **third** of his levels, and that was too generous in
a way that is not obvious: dying at 7 dropped him to 5, and a level-5 character re-walking a road
built for a level-7 one earns those two back in a couple of minutes. Every restart therefore came
with a burst of level-up offers and the loss paid itself back almost immediately. A flat level
cannot be farmed that way, and it costs the same whether he dies at 4 or at 20. Restarting should
make him stronger — just not that fast.

*And death rewinds the road too*, not just the character (`REWIND_AT` in `sim/act.js`). Groundhog:
back to the top, with one banked waypoint at the ruins once he has walked through the breach in the
rock face. The level's mid-section rooms are drawn from a pool so it is not identical on
a rerun. Keep this light — the handcrafted spine matters more than the shuffle.

## 6. Controls

**Desktop:** A/D or ←/→ move, W/Space jump (double jump once unlocked), Shift dash, mouse aims,
left-click or the slot-1 circle casts, E interacts, 1–5 select a circle to reassign, Esc pauses.

**Mobile portrait:** left thumb virtual stick (appears where the thumb lands, not a fixed spot),
right side has the cast circles arranged as a thumb-reachable arc; slot 1 is the big one. Jump is a
press-and-hold on the right side outside the circles. Everything within reach of one thumb; nothing
important under it.

Aim is auto-assisted — nearest enemy, or with nothing to fight, the nearest thing standing in the
way (never the thing he is standing on). Two gestures override it, and both take a **direction**
rather than a screen point, because a thumb parked in the bottom-right corner cannot point at
somewhere it is already sitting: **pull the movement stick off horizontal** to aim that way, or drag
the right flank. The camera leans the way you aim.

**Progress persists.** Level, XP, spells and their ranks, circle assignments, shards and the rolling
checkpoint are written to localStorage, so closing the tab is not the end of the run. The *world* is
not saved — a resume rebuilds the level intact and puts him back at his checkpoint. You keep the
character, you replay the road. Dying and reloading still pays Vayne's ward; "Start over" wipes it.

## 7. Candidate: the playable prologue (post-v1, do not build yet)

The intro now opens cold on **Vayne losing his fight against the Darkness**. The obvious extension is
to make that cold open **playable** — 30–45 seconds where you *are* Vayne, at the height of his
power, with all five cast circles full and every spell at rank 5. You cannot win; the script takes
the fight off you at the scripted moment regardless of how well you play.

It is a well-worn trick because it works, and here it does four jobs at once: it is a spectacular
tutorial that never says the word "tutorial", it shows the player the full spell system before they
have earned any of it, it makes the loss of that power *felt* rather than described, and it turns
the whole of Rook's progression into getting back to something we have already let the player hold.

Cost is real: it needs a second player rig, a scripted boss-ish encounter, and an unwinnable-fight
state machine that never feels cheap. **Not in v1.** Revisit once the level plays end to end — if it
gets built, the non-interactive cold open becomes its attract-mode fallback.

## 8. The five-second test

Whatever the player sees first — intro or gameplay — must contain one moment good enough that a
person scrolling past stops. That moment has sound: the boot card ends on **tap to begin / sound
on**, and that tap is what lets the cinematic's score start at all. A browser will not play audio
until the page has been touched, and the intro's own first tap is the skip gesture, so without the
gate the whole score plays at zero. One tap on a card the player is already reading buys it. Every agent should ask of their own work: *would this make someone stop?*
If the honest answer is no, it is not done.
