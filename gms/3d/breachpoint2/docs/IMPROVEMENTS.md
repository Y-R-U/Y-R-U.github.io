# BREACHPOINT II — design backlog

Ordered by value per unit of work. Items marked **P6** are the story mode.

---

## 1. THREAT READOUT — make the gate legible  *(near-free, do it in P4)*

The whole game is "upgrades gate levels". The player currently has no way to see that, so the
upgrade screen is guesswork. `gateCalc(tier, rank, boss)` already exists from P1 — surface it.

On every level-select card and in the upgrade screen, show what this level's enemies actually do
to *your current build*:

```
THE DOCK          their rounds cost you   0.9 HP   per hit   ▓░░░░  TRIVIAL
BLACKOUT          their rounds cost you  13.8 HP   per hit   ▓▓▓▓░  SEVERE
BREACHPOINT       their rounds cost you  22.4 HP   per hit   ▓▓▓▓▓  LETHAL
```

And in the upgrade screen, show the *delta* a rank would buy against the level you are stuck on:
"PLATING 4 → 5 · BLACKOUT: 17.5 → 13.8 HP per hit". This turns the gate from a wall into a
decision, and it is only formatting a function that already returns the right number.

## 2. THE RANGE — the paintball park stays open  *(now load-bearing — the stuck-player flow depends on it)*

The training yard should never close. It becomes the safe room:
- Always reachable from the hub.
- **Spar against any tier you have met**, in paint, with no fail state.
- A TRY IT button on the upgrade screen drops you into the range against the tier of the level you
  are stuck on, so you can feel a rank before you buy it — and after you buy it.
- Range records (time to clear 5 targets) as a light skill ladder.

This falls straight out of the premise instead of being bolted on, gives the stat-gated design a
place to be understood, and reuses level 0 wholesale.

## 3. COMMISSIONS — a reason to replay beyond grinding  *(P5/P6)*

Replaying a cleared level currently only pays SP. Add rotating modifiers on cleared levels for a
bonus: no armour, headshots only, one magazine, iron sights only, double enemy count.
Date-seeded so every device gets the same daily set. Cleared-level replay is the game's difficulty
valve — it should be interesting, not just a grind.

## 4. Rig LOD — L8 costs 317 draw calls  *(**DONE in P5b** — L8 is ~134 now, see PIPELINE)*

~14.5 calls per enemy rig, linear, 19 rigs on L8. Identical per-enemy cost to the original game, but
the original never put 19 on screen. Options: merge distant rigs to a single low-poly billboard or
merged mesh, or instance the shared parts. Measure on a phone, not on the Mac.

## 5. Boss identification must not rest on red  *(P4, small)*

Bosses read as "red rim glow". Red-on-dark-green is the classic colour-blind failure, and levels 4/7
are at night. The 1.18× scale and the name tag already carry most of it — make the tag and the
announce banner the primary cue and treat colour as reinforcement.

## 6. Loadout choice  *(post-ship)*

Once 4 weapons are unlocked, pick 2 before a level instead of carrying everything. Makes unlocks a
decision rather than an accumulation. Needs the weapon-button UI to already respect unlocks (P2 does this).

## 7. Codex / dog tags  *(post-ship, cheap)*

First kill of each tier and each boss unlocks a short entry. Carries the fiction of item 8 without
spending a single cutscene on it.

---

# P6 — STORY MODE

## The hook is already in the premise
**You learned to shoot at a paintball park.** A civilian who plays at war gets handed a real one.
Everything good here comes from the gap between those two things, and the mechanics already express
it: the same map, the same rig, paint becoming blood. Do not replace this with a generic military plot.

## Delivery: radio, not cutscenes  *(cheap, mobile-safe)*
A lower-third band with a callsign and one line at a time, queued, timed, always skippable, never
blocking play. No models, no VO needed (VO can be added later without touching the structure).
Briefing and debrief cards on the level screens carry the longer beats. In-engine moments are
lighting changes and things left in the world — not camera takeovers.

## The one trick worth building
**The paint stays on the containers.** L1 is the same map as L0. Persist the training splat decals
into level 1 and let them fade out over the next two levels. It costs almost nothing — the decals
already exist — and it does more work than any cutscene could: the war arrives before the paint dries.

## Voices
- **PARK** — the bored paintball-park employee running Act I over a cheap PA. Comes back **once**,
  late, on a civilian band, mid-sentence about nothing. Do not explain it.
- **CPL VANCE** — hands you the rifle, tells you your paintball record is why you qualified, and
  clearly thinks this is funny. Dry, gets less dry.
- **CONTROL** — dispatch. Only ever gives you the objective. Never comforting.

## Beats

**Act I — The Yard.** L0 is a Saturday at the park. Park chatter, two mates in bibs, a rifle marker.
**The turn:** the PA you have been half-listening to cuts to an emergency broadcast *mid-sentence*.
No tanks, no montage. The round does not end — you just stop being the thing you were.

**Act II — Conscription.** L1 THE DOCK: the same yard as a firing position; the other side are
conscripts too, just as bad at this as you. L2 CONTAINER ROW: the first professionals, and the boss
SERGEANT is why the difficulty spike is diegetic. L3 THE OVERLOOK: you are the one holding ground now.

**Act III — Attrition.** L4 NIGHTFALL, L5 SUPPLY LINE, L6 THE SIEGE. You are losing. The radio gets
shorter. This is where PARK comes back.

**Act IV — The Breach.** L7 BLACKOUT, L8 BREACHPOINT, THE MARSHAL.

**Epilogue.** The yard, quiet, daylight. Endless mode unlocks from here rather than from a menu.

## Rules for whoever builds it
- Skippable in one tap, every line, every time. Second playthrough must be able to see none of it.
- Never block play with a story beat; the radio talks while you move.
- No line longer than fits one phone-width band at a readable size.
- The story must never be the reason a level is hard.

---

# LEVEL VARIETY — the biggest risk in the design

Nine levels on **one map**. Re-lighting and re-populating it is not enough on its own; played back
to back it will read as the same yard nine times. Ranked by how much play they change per unit of work:

## V1. Move the containers  *(highest value, do it in P4)*
The container stacks are props. **Reconfigure them per level** — the same assets in different
positions genuinely change sightlines, cover, chokepoints and the nav grid. One yard, nine mazes.
This changes how a level *plays*, not just how it looks, and it is a table of positions, not new art.
`§WORLD` builds them and `§NAV` bakes the grid from the solids, so the grid must rebuild per level.

## V2. Change where you come in  *(near-free)*
Insertion point per level. Attack the dock from the west; next level defend it from inside the
building looking out. Same geometry, opposite read. Costs one vector in the level table.

## V3. Weather as mechanics, not paint
- **Fog** shortens engagement range → favours the shotgun, blunts the sniper, and the enemy
  LOS checks shorten with it (it must cut *both* ways or it is just a filter).
- **Night** — the enemy has no light discipline: muzzle flashes become the primary target cue.
- **Rain** masks footsteps, removing an information channel you had been relying on.

## V4. Force different altitudes
Some objectives lock the parapet (ground-level fight), some demand it (hold the high ground).
The map already has strong verticality — the level table should use it deliberately rather than
leaving it as a thing the player may or may not discover.

## V5. Burning props
A burning container as a moving light source and a sightline block. One emissive + a particle
puff, reusing the existing FX.

---

# PROGRESSION DEPTH — six tracks of "number goes up" is thin

## D1. RESPEC — do this one, it removes a real failure mode  *(P3)*
The design deliberately hard-gates. A player who sinks 5,000 SP into MARKSMAN when the wall in
front of them needed PLATING is stuck grinding with no way out. **Cheap, always-available respec**
(refund ~80%, or free) makes the gate a puzzle instead of a trap. Without it, the gating design has
a dead end in it.

## D2. Abilities, not only stats  *(the user explicitly asked for "other new abilities")*
- **Smoke grenade** — the best of these by far, because the enemy AI already runs on line-of-sight
  raycasts. Smoke that blocks those raycasts is *mechanically real*, not cosmetic, and it gives a
  under-levelled player a skill-based answer to a stat gate. Build this one first.
- **Stim** — instant armour refill on a cooldown.
- **Spotter drone** — tags enemies through walls for a few seconds.
- **Slide** — extends the existing sprint/mantle movement rather than adding a new system.

## D3. Fork each track at rank 3  *(identity without new content)*
PLATING 3 forks: **HARDPLATE** (big pool, no regen) vs **REACTIVE** (small pool, fast regen) —
which is strictly better depends on whether the level's damage arrives in bursts or a stream.
MARKSMAN forks: flat damage vs headshot multiplier. Two builds out of one table.

## D4. Per-weapon progression
A small track per weapon (optic, magazine, barrel) so buying a weapon starts a relationship rather
than ending one. Keeps the sniper relevant after the level you bought it for.

---

## 1b. THREAT READOUT — correction *(from `BALANCE.md`; **done in P4c**)*

The readout as built shows **HP per hit**. That number implies PLATING is always the answer, and the
balance model shows it is not: at L6, maxing PLATING and leaving VITALITY at rank 1 gives a **worse**
TTD (4.2 s) than a balanced build costing the same SP (5.0 s). The readout would actively walk a player
into that trap.

**Show survival time, not just absorption**: `"you survive ~5.0 s of open ground here"`, derived from
HP-per-hit x their actual max HP x the level's attacker count. Keep HP-per-hit as the secondary line.
The upgrade delta then compares the thing that matters: `"PLATING 4 → 5 · L6: 4.6 s → 5.0 s"` next to
`"VITALITY 1 → 3 · L6: 4.6 s → 6.1 s"`, which makes the real decision visible.

---

# ENDLESS MODE *(post-campaign; currently only a marker in `LEVELS`)*

Unlocks from the epilogue, not from a menu. The point of endless is not "more levels" — it is to be the
**direct readout of your build**, which is what the whole progression system is for.

## Shape
- Continuous waves on the yard, lighting rotating every 5 waves through the preset list.
- Wave composition walks the tier ladder: waves 1–4 militia, 5–9 regular, 10–14 veteran, 15–19 shock,
  20+ praetor, mixed at the seams so it never snaps.
- **A boss every 5th wave**, tier matching the current band, stacking a second boss from wave 20.
- Attackers cap stays at **4** (per `BALANCE.md` — volume is not how this game escalates).

## The hook: endless is the gate, extended
Past wave 20, apply a per-wave scalar to enemy damage and `apPen` instead of adding more bodies. Your
wave ceiling then *is* your build's number — "this build gets me to wave 23" is a legible, honest
statement about SP spent, and it moves when you upgrade. That ties endless to progression rather than
bolting a survival mode onto the side.

## Rewards
SP scales with wave reached, paid on death (never lost). Best wave persisted per build-power bracket so
a stronger build does not simply erase the record of a clever weaker run.

## One modifier per run
Drawn from the COMMISSIONS pool (item 3) and shown before the run starts: no armour, headshots only,
one magazine, iron sights, double count. Date-seeded so every device sees the same daily draw.

---

# 4b. PERF — the L8 draw-call problem, concretely *(**DONE in P5b**; kept for the reasoning)*

**Measured (with `quality:'low'` pinned, per the harness traps): L1 = 112, L8 = 316.** World baseline is
~36, so a rig costs **~14.5 draw calls** and L8 puts 19 of them on the map. That is the same per-enemy
cost the original game had — but the original never rendered more than 10.

## Why it is 14.5 and not 2
The rig is split by **animation group** (2 hips, 2 knees, torso, head, 2 shoulders, 2 elbows, gun ≈ 11
pivots that must move independently) **and then again by material** — `EMAT` holds **10 distinct
materials** (vest, vest2, cloth, cloth2, skin, helmet, mask, boot, gun, eye). `EPART` already merges what
it can per material, which is why it is 14.5 and not 78. The remaining split is material-driven: the head
group alone is 4 meshes (skin, helmet, mask, visor) because each wears a different material.

## Fix 1 — vertex colours collapse the material split *(the repo has done this before)*
Bake the enemy palette into **vertex colours** and give the whole rig one
`MeshLambertMaterial({vertexColors:true})`. Every animation group then merges to **one mesh**, so a rig
costs ~11 calls instead of 14.5 — and more importantly it stops scaling with palette size, which matters
because bosses currently clone the entire material set.
This is the same trick FACET used to hold a whole diorama at ~5 draw calls; the geometry is already
merged by `mergeParts()`, so this is a palette change plus a `setAttribute('color', …)`, not a re-rig.
Keep the visor (`MeshBasicMaterial`) separate — it is emissive and wants to stay unlit.

## Fix 2 — distance LOD *(the big one for L8)*
Past ~30 m an enemy is a few dozen pixels and its elbow articulation is invisible. Swap the whole rig for
a **single merged mesh** (1 draw call) with only the hips/torso yaw animated. On L8 most of the 19 are far
away most of the time, so this is where the win actually is.
- Hysteresis on the swap distance (~30 m in, ~34 m out) or rigs will thrash at the boundary.
- **The LOD must not change hit boxes.** `rayTest` already scales every hitbox by `e.scaleY()`; hit
  detection must keep using the real boxes regardless of which mesh is drawn, or long-range shots start
  missing visually-hit enemies. Test this explicitly — it is the obvious way to break a sniper.

## Expected result
~11/rig near + 1/rig far should bring L8 from **316** to roughly **120–150**. Verify on a phone, not on
the Mac — and pin quality first, or the auto-quality net will hand you a number that means nothing.

## What actually happened *(P5b)*
**L1 114 → ~50, L8 302 → ~134**, both inside the target, with the static world byte-identical.
Two corrections to the diagnosis above, both measured:
1. The palette collapse gets a rig from **15 drawn meshes to 12**, not to 11 — the visor stays its own
   unlit mesh and the gun, thigh and upper-arm meshes each sit on their own animation pivot and cannot
   merge into anything. Worth ~50 calls on L8.
2. Fixes 1–3 together landed L8 at **168**, not 120–150. A **third detail tier** closed the gap: between
   25 m and 34 m the head+visor fold into the torso and the knee folds into the thigh, so a mid-range
   rig is **8 meshes**. That is the last 34 calls. See PIPELINE "P5b CLOSED".

There is also a readability improvement the diagnosis did not anticipate: a single frozen patrol pose
would have made a far enemy look like it was standing around while it shot at you, so the far tier
bakes **two** poses (slung and aiming) and costs **two** draw calls rather than one.

---

# MUSIC *(undesigned until now; post-P5)*

The game's audio is entirely procedural Web Audio and that is right for guns, footsteps and the
industrial hum. It cannot carry a **theme**, and the campaign now has an arc that wants one.

## The one idea worth building the rest around
**The training-day theme comes back in the epilogue, wrong.** L0 is a Saturday at a paintball park — its
music should be mundane, almost cheerful, the most out-of-place thing in the game. The epilogue returns to
the same yard in daylight and replays that theme slower and in a minor key. Nothing else in the game has
to say anything about what happened; that does it. Everything below exists to set this up.

## Cues
| where | intent |
|---|---|
| hub / menu | low sustained drone, unresolved |
| **L0 training** | mundane, cheerful, slightly naff — the paintball park's own PA |
| the war beat | **silence**, then one low note. Do not score the turn; let it land dry |
| combat | a per-level bed + a threat layer that ducks in with engaged-enemy count |
| boss | one distinct layer over the bed, not a new track |
| **epilogue** | the L0 theme, slower, minor |

## Constraints
- Generate locally (ACE-Step) — 4–6 loops, 30–60 s, ogg/mp3, target **under ~1.5 MB total**.
- **Lazy-load, and never block boot.** A game that waits on audio to start is a game that hangs on a bad
  connection; this repo has been bitten by exactly that class of failure. Boot silent, fade in when loaded.
- Respect the existing `S.sfx` volume setting and add a separate music slider; default music lower than SFX.
- Mobile autoplay is gated — music starts on the first real user gesture, which the instruction screen
  already provides.

---

# PROFILE SCHEMA VERSIONING *(small, do before shipping)*

`Profile.load()` is defensive against corrupt and type-confused JSON, which P3 tested. It is **not**
versioned. The moment a 7th upgrade track, a new weapon or a renamed field ships, every existing player's
save is silently either wrong or wiped.

Add `v:1` to the stored profile and a migration step that fills missing fields from the defaults rather
than discarding the save. Test it by loading a **v0 save with the current code** — not by loading a
current save, which proves nothing. This is cheap now and expensive after the first player exists.

---

# THE STUCK PLAYER *(BUILT IN P5c — kept for the reasoning)*

The whole game is a gate. Gates make stuck players — that is the *point*, but it means the failure loop is
a first-class feature, not an edge case. Right now a player who fails L6 five times gets: the same debrief,
some SP, and no guidance. That is the single biggest hole left.

## What is already right
- Kill/headshot/boss SP pays out **on a loss** (P3's call), so a failed run is never wasted.
- Replay pays 40% of first clear, so grinding works but is deliberately slower than progressing.
- Respec exists, so a misspent build is recoverable.
- The threat readout (with 1b's survival-time fix) tells them what they are up against.

None of that is *offered* at the moment it is needed. The player has to go looking.

## What to build: the debrief should notice
Track consecutive failures per level in the profile. The debrief changes with the count:

| fails | what the debrief does |
|---|---|
| 1 | nothing. Losing once is playing. |
| 2 | show the survival-time readout for this level with **the single best SP purchase highlighted** |
| 3 | add the honest line: *"at your current build this level gives you ~4.2 s of open ground. Most people clear it around 7."* Offer THE RANGE against this level's tier |
| 4+ | surface the replay route explicitly: which cleared level pays best per minute, and how many runs to the next rank |

## Do not do these
- **No rubber-banding.** Silently weakening enemies after N failures breaks the one promise the gate makes:
  that clearing a level means your build cleared it. If the player finds out, every past win is retroactively
  suspect.
- **No paid skip.** This game has no purchases and should not grow one.
- **No hiding the wall.** If a level genuinely needs 3,000 more SP, say so with a number. The gate is only
  fair when it is legible.

## The one concession: RECRUIT mode
An explicit, player-chosen difficulty that scales incoming damage to ~0.6x, offered **in settings from the
start** and never pushed on them after a loss. It has to be chosen, visible, and it should mark clears as
RECRUIT in the hub. That is honest in a way that silent rubber-banding is not, and it costs one multiplier
in `damagePlayer`.

## What P5c actually built
- `Profile` is **v2**: `fails{}` (consecutive losses per level, zeroed by a clear) and `recruit{}`
  (which clears were made on RECRUIT). A v1 or v0 save migrates and keeps every point, rank, unlock,
  clear, best time and career stat.
- **§STUCK in `armoury.js`** renders the debrief into `#debrief` on the end screen, on a LOSS only.
  Tier 1 at two losses (readout + the single best buy), tier 2 at three (the honest line: what your
  build gets against what the level's `spTarget` build gets, and the wall in SP), tier 3 at four
  (the replay route — best SP/minute off the real award paths, and the run count).
  Nothing else in the game reads `fails`. Nothing gets weaker.
- **RECRUIT** is `S.recruit`, one `RECRUIT_MUL = 0.6` multiplier at the top of `damagePlayer`, a
  DIFFICULTY row at the top of settings, and a `RECRUIT` tag on the hub card of any clear made on it.
- The debrief is asserted never to contain the string RECRUIT.

## Why this matters more than it looks
`BALANCE.md` shows TTD at the soft power target runs 5–17 s. A player *below* that target is not having a
slightly harder time — they are dying in two seconds and cannot tell whether they are bad at the game or
under-levelled. Those two feel identical from inside, and only the game knows which it is. Telling them is
the difference between a difficulty curve and a wall.


---

# THE RANGE — full spec *(post-P5; the stuck-player debrief links into it)*

Reuses level 0 wholesale. No new geometry, no new rig, no new objective type. The cheapest large feature
left, and the only place in the game where a player can understand a number before paying for it.

## What it is
The paintball park, still open, forever. Paint, no fail state, no timer, no story. You go there to find out
what a rank is worth.

## Entry points
1. The hub, always, once training is done.
2. **A TRY IT button on every upgrade row in the armoury** — drops you into the range against the tier of
   the level you are currently stuck on, at your *current* ranks. Buy the rank, press it again, feel the
   difference. This is the point of the whole feature.
3. The stuck-player debrief at 3+ consecutive failures.

## What it shows that the readout cannot
The threat readout is a model — and P4c proved the model is wrong in three specific ways (flat fire cadence,
no armour pool, and an optimiser bug that was mine). The range is the **real damage pipeline**: real bursts,
real armour drain, real regen delay, real cover. Put a live counter on screen:

```
PRAETOR · 4 FIRING          you have survived   6.2 s
armour  318 / 350           their rounds cost you  9.7 HP
```

When the range disagrees with the readout, **the range is right** — and that discrepancy is itself worth
surfacing to whoever is tuning the game.

## Controls
- Pick a tier (only tiers you have met), pick how many fire at once (1–4), pick the level's lighting.
- They shoot paint. You cannot die; at 0 HP the run ends and reports the time.
- A DUMMY mode where they do not shoot back at all, for testing weapon damage and TTK.

## Records
Best time-to-clear 5 targets per weapon, and longest survival per (tier, attacker count). Kept per build
power bracket so a stronger build does not erase a clever weaker run.

## The thing to get right
It must be **fast to enter and leave** — two taps in, one tap out, straight back to the armoury row you came
from with your SP unspent. A player comparing two ranks will do this six times in a row. Any loading screen,
any confirmation, any story beat in that path kills the feature.
