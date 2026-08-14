# NOTES_GRAFT — Track E, the disguise runtime

The record of wiring **Graft** — the Neutral capstone spell — from a set of pure sim modules with no
caller into a thing a player can actually cast. Appended as each piece landed, not batched.

Entry state: `node --test` 296 pass / 0 fail, `node tools/lintQuests.mjs` 99 quests · 399 steps ·
175 nodes · 7 warnings · 0 errors. Twenty-four steps of the Neutral pack carried a `worn`
requirement and **nothing in the game ever set `doc.worn` to anything but `null`**.

---

## 1. The shape of the fix

The design was already complete and already tested in `sim/faction.js`. What was missing was a
*state object* and a *caller*. So:

- **`js/sim/faction.js`** grew the Graft state machine. Still pure, still node-testable, no clock
  of its own — the caller ticks it with a real `dt` and reacts to the event names it hands back.
- **`js/game/session.js`** is the caller and holds nothing but plumbing: audio, HUD, the quest
  event, the appearance swap.

That split is what makes the balance measurable in node, which is the house rule.

### The state object

```js
{ worn: null, left: 0, held: 0, susp: 0, cd: 0, free: false }
```

`left` and `cd` run at the same time on purpose: a Break hands back a free 20 s Graft *while* the
120 s cooldown is already counting, which is §8.3's comeback.

### The functions

| Function | Does |
|---|---|
| `newGraft()` | the blank |
| `graftBlocked(g, {granted, ash, seen})` | `null`, or one of `granted` / `worn` / `cooldown` / `ash` / `seen`. `BLOCKED` maps each to the line the HUD says |
| `startGraft(g, faction, {glamour, durationMul, seconds, free})` | `left = graftDuration(glamour) × durationMul`, suspicion back to 0 |
| `tickGraft(g, dt, ctx)` | `{graft, events}`; events are `ready` `tick40` `tick70` `tick90` `break` `expire` |
| `endGraft(g, {reason})` | `{graft, xp}`. Sets the cooldown — 20 s, or 120 s on a Break |
| `graftEvent(g, event)` | one instantaneous suspicion hit, by the `SUSPICION` key |

`breakGraft(standing, worn)` was already there and its signature is untouched.

**One exit, not three.** Voluntary un-Graft, expiry and Break all run through `endGraft`, and the XP
falls out of the existing `graftXp(held, susp)` — which already refuses anything at suspicion 40 or
above, so a Break scores 0 without a special case. Two deliberate calls inside it:

- **Expiry pays the same as a voluntary un-Graft.** SYSTEMS §2.3 says "voluntary", but the
  alternative is a trap: hold a clean 13-minute Graft, blink, and lose 1,600 Glamour XP that you
  would have banked by tapping one second earlier. The gate that matters is already suspicion < 40.
- **The free Graft after a Break pays nothing** (`g.free`). Being caught should not be an XP source.

### Two new numbers in `SUSPICION`

`radius: 6` and `holdRadius: 10` were prose in SYSTEMS §8.3 and nowhere in code. `suspicionRate`
gained an optional `nearby` count: a Watchman between 6 m and 10 m is too far to raise suspicion and
too close to let it fall, so that band returns **0/s** rather than the −3/s decay. Existing callers
pass nothing and get the old answer, so the eight faction tests were untouched.

`SUSPICION.ticks = [40, 70, 90]` is RUNTIME §9.2's audible tick, now data rather than a magic list.

---

## 2. Spell selection — the minimum, and why it is this

`cast()` hardcoded the basic bolt. Graft needed to be castable and nothing more was in scope.

**Dialling Glamour *is* the selection.** With Graft granted, `selfTarget()` puts a `self` target of
kind `graft` under the context button, at range 1 — you are always in range of your own face. Hold
the button for the 3 s channel, release, pick a face. Dial away from Glamour and the target is gone.

Three reasons this is the right minimum rather than a lazy one:

1. **It is how the pack already authors it.** Every graft step in `neutral.json` is
   `["interact","self",1]` with `"verb": "graft"` — RUNTIME §2.1's "a cast with no target is not an
   objective anyone wrote". The data was written expecting a context-button cast on `self`.
2. **The channel already existed.** `hud.js` has hold-to-channel with a charge ring, and RUNTIME
   §9.1 says `holdAssist` exists *for the 3.0 s Graft channel*. Nothing new was built.
3. **It is not gated on a quest step.** Any time Glamour is dialled and N07 is done, you can
   re-graft. That is what makes the save/load decision below survivable.

**The face choice is two buttons**, because there are exactly two faces a character can wear — the
two that are not their own. A non-blocking card, same shape as `watchStuck()`'s, eight-second life.
`session.graftInto(faction)` is the programmatic entry.

### `canCast` was gating Graft behind Glamour 17

`SPELLS.graft` is `tier: 4`, and `canCast` ANDed its `quest: 'N07'` grant with the tier-4 gate —
school level 17, Grasp 128, **and Standing Sworn**. SYSTEMS §2.3 is explicit that Graft is
story-granted by N07 and that Glamour level scales its *duration*, not its availability. As shipped,
a player finishing N07 could not cast the spell N07 grants, and Acts 2 and 3 of Neutral were
unplayable. Fixed: **a spell carrying a `quest` skips the tier gate entirely.** No other spell in
`SPELLS` carries `quest`, so nothing else moved.

---

## 3. What the loop does, end to end

```
dial Glamour ─▶ context button becomes ◑ GRAFT
   hold 3.0 s ─▶ graftStart() checks granted / cooldown / ash / seen
   release    ─▶ charge must be 1.0, else the short cooldown and nothing else
   choose     ─▶ Whitewall | Blackstone
   graftInto  ─▶ 30 Focus, 1 Hearth Ash, player.setZone(face), doc.worn = face
              ─▶ emit interact(self, verb: glamour, spell: graft)
   every tick ─▶ suspicion from the Watch inside 6 m, decay outside 10 m
   at 100     ─▶ Break: Standing −25, free 20 s Graft into the other faction, 120 s cooldown
   at 0 left  ─▶ expire: own face back, Glamour XP if suspicion was under 40
   tap ◑      ─▶ voluntary un-Graft, same XP path
```

**Focus and ash are spent on completion, never on the attempt.** RUNTIME §9.4 wants an interrupted
channel refunded in full; charging nothing up front is the cheapest way to be exactly right, and
given that §8.6 (h) has ash as Neutral's hardest external dependency, a phone call must not eat one.
A `pointercancel` costs nothing at all; a deliberate early release costs the 20 s cooldown.

**`setZone` takes the appearance.** SYSTEMS §8.3's own note. `player.zoneId` becomes the worn face,
which is what swaps the robe geometry, the material and — through `spell.js` `colours()` — the bolt
colour, all of it for free because the engine was built zone-first. The *true* faction never moves
off `doc.faction`, which is what `sim/schools.js` and `sim/faction.js` read. **`js/world/spell.js`
needed no change at all**, which is the second time this mechanic has been nearly free.

### Save / load mid-effect: **it dies on load, deliberately**

SYSTEMS §9.2 already ruled on this — "Graft duration, suspicion · real seconds · ends on load. You
are never reloaded mid-disguise" — and `save.js` `clampAll` already forced `d.worn = null`. I kept
both and made the session agree rather than fight: `this.graft = newGraft()` in the constructor,
`this.doc.worn = null` before the clock loads. The cooldown dies with it, which is generous and
matches the same rule for suspicion, streaks and cooked-food buffs.

The risk this creates and the answer to it: N08 completes its graft step, the player quits, and
reloads onto a `worn: "light"` step with the graft step behind them. **They simply re-graft** — the
`self` target is gated on the school dial and the N07 grant, never on a quest step. That is why it
is gated that way.

---

## 4. The Watch

`watchman` in `sim/tables.js` is the enemy class and it is the only thing that raises suspicion.
Warden Alder is a friendly NPC and is not one; he appears only as a `WATCH_WEIGHT` of 0.6, meaning
he is the easiest person in the valley to stand next to.

`session.watch()` reads **`world.watch()`** — a list of `{x, z, id?, weight?}` — plus anything in
`world.targets()` with `kind: 'watch'`, and splits it into the 6 m band (accrue), the 6–10 m band
(hold) and everything out to `GRAFT.losRadius` = 22 m (counts as *seen*, which is the "no aware NPC
has line of sight within 22 m" precondition on casting). Weight is the **heaviest** Watchman inside
6 m, so Kesta at 2.0 dominates a crowd, which is what STORY §9 asks for.

**`world.watch()` does not exist yet** and neither do enemies — the creature agent is adding them.
Until it does, `watch()` returns an empty list, suspicion only ever decays, and a Graft runs its full
duration unopposed. The hook is one line in `main.js`'s `world:` block and it is reported, not built,
because `main.js` is not mine.

`world.aggro(radius, pos)` is the other hook, called once on a Break with radius 30.

---

## 5. The three engine gaps

**Fixed — `merge`.** `questrunner.apply()` gained a `merge` case. `["merge","ansel","dob"]` writes
`doc.campaign.merged = { ansel: 'dob' }`; the last id is who the person really is and the ones before
it become aliases. `save.js` carries the field, defaulting to `{}`, which is v1 behaviour, so
`SAVE_VERSION` did not move. **N20's effect is no longer silently dropped.** The journal's cast strip
that would *draw* the merged portrait is still deferred, so this records the reveal rather than
rendering it — which is what §8.6 (e) said Track B owed.

**Fixed — `boardRoll` now honours `BOARD_ALWAYS`.** Three lines, not one, because `BOARD_ALWAYS`
holds *story* ids (`S02`, `S04`) and the pool holds defs: seed `out` with the always-posted defs that
survive the town filter, and remove them from the weighted draw so they cannot be drawn twice.
**S02 and S04 can now go back to `weight: 1`** — their `weight: 40` was the data-side approximation
and is no longer doing anything except distorting the other posts' odds. Reverting those two numbers
is a data edit, which is not mine.

**Not built — a first-class `posture`.** Flags are honestly fine here and this would have been
gold-plating. Three reasons: the three flags are authored, linted and asserted today; the slate reads
flags and reads them correctly; and a `['posture', id]` effect could only take effect by **editing
`neutral.21`'s three `sets`**, which is a data change I am forbidden from making, so the effect would
ship as dead code next to the flags that already work. `save.js` keeps `campaign.postures` for
whoever wants it later.

---

## 6. Two bootstraps the campaign could not have got past

Found while writing the acceptance run, and neither is optional — without both, **N07 cannot be
completed and the Neutral campaign never starts.**

**a. N07's fifth step *is* the first Graft, and N07 is what grants Graft.** `canCast` wants the quest
`done`; the step is inside it. So the grant also comes from `session.graftAsked()` — **a live
required step whose `verb` is `graft` grants the spell.** The quest that teaches you the spell is the
quest that lets you cast it. Data-driven, no data edit, and it is the only reading of §8.1's "the
graft itself is `interact("self", 1)`" that can actually run.

**b. N07 pays its three Hearth Ash on *completion*, so at the `face` step the bag is empty.** The
answer is STORY §12's own rule, which nothing had implemented: **Hearth Ash is free at any Longacre
hearth.** `session.atHomeHearth()` is true when the player stands in an area that is both
`hearth: true` and `town: 'neutral'` — `lac.barn`, the Tithe Barn, and only that.

Counting the pack against the rule:

| Graft step | Where | Cost |
|---|---|---|
| N07 face · N08 · N09 · N11 · N12 face · N25 white · N14 | `lac.barn` | **free** |
| N13 | `heath.blackspan` | 1 ash |
| N25 swap | `heath.ford` | 1 ash |

Seven free, two paid, against the five ash N07 and N12 grant. **This closes NOTES_CONTENT §8.6 (h)**,
which called ash "Neutral's hardest external dependency" and predicted Act 3 stalling on the sixth
graft. The content was authored to the rule; the rule just was not built. STORY's other half — 350 mk
at any other hearth — is a `SHOP` entry in `sim/tables.js` and is **not mine**; reported below.

---

## 7. One more defect found on the way

`quest.js` `credit()` matched a step's `verb` against `event.verb` only. The engine raised the
*school* the dial was on; the pack authors `"verb": "graft"`, a **spell** id, and
`tools/lintQuests.mjs:122` explicitly accepts either. So every graft step in the campaign would have
refused every graft. The caster now raises both — `verb: <school>`, `spell: <spell id>` — and
`credit` accepts a match on either. Every existing step in Light, Dark and the sandbox uses a school
verb and is unaffected.

`applyStanding` crashed on the save document. `sim/faction.js` expected `newStanding()`'s shape —
`{day, light, neutral, dark, caps}` — and `save.js` `standing` is the flat `{light, neutral, dark}`
with the daily caps kept in `daily.standing`, per RUNTIME §5.2. `breakGraft` was the first runtime
caller of `applyStanding` and it threw on `st.caps[faction]`. Found by driving a Break in the real
browser, not by any test. `applyStanding` now fills the caps block in rather than requiring it, and
`session.onBreak` copies back only the three faction numbers so the document stays flat.

---

## 8. Measured, not asserted

`js/sim/faction.test.js` runs the machine at 20 Hz — the rate the session ticks it — and reports.

**How long a Grafted player lasts beside the Watch**, from cast to Break, with no decay:

| | Glamour 12 | Glamour 20 |
|---|---|---|
| one generic Watchman (1.0) | **50.1 s** | 150.1 s |
| Kesta (2.0) | **25.0 s** | 75.0 s |
| Warden Alder (0.6) | 83.4 s | 250 s |
| two generic (×1.8) | 27.8 s | 83.4 s |
| Kesta and a friend | **13.9 s** | 41.7 s |

Every Glamour level buys 30 s of face and takes 1/24th off the rate; Glamour 20 sits at **0.333×**
Glamour 12's suspicion. So the ladder from 12 to 20 is 3× the duration *and* 3× the tolerance —
9× more time beside a Watchman. That is a real reason to train the school.

**Duration:** 3 min at Glamour 0, **9 min at 12**, 11.5 at 17, **13 at 20**.

**The rhythm holds.** Alternating 20 s inside a Watchman's 6 m and 20 s outside it, at Glamour 12:
suspicion peaks at exactly **40** — the first audible tick, the point the ring starts to read — and
never gets further. The nine-minute face runs out before the disguise does. That is §8.3's intended
loop, measured rather than claimed.

**Decay bands:** −3/s with nobody inside 10 m, **0/s in the 6–10 m gap**, −8/s inside a Longacre
building. The dead band is what stops a player parking at 6.1 m and idling suspicion to zero next to
the guard they are hiding from.

**The Break, end to end, measured in the browser:** Standing −25 on the worn faction, cooldown 120 s,
free 20 s Graft into the other side with 0 suspicion, and the free one pays 0 XP when it lapses.

`tools/soak.mjs` is unmoved: single +53%, group +53%, **mixed +76%** against §8.4's +75% claim.
`node --test` **312 pass / 0 fail** (296 at entry + 16), `lintQuests` 99 · 399 · 175 · 7 warnings ·
0 errors, `lintText` 0 warnings · 0 errors.

---

## 9. Driven in the real browser

Everything above is node. The loop was then driven headless through the actual HUD — `tools/shot.mjs`
`open()` over raw CDP, no puppeteer — because a pure test cannot tell you the robe did not swap.
**Zero console errors** across every run.

| Checked | Result |
|---|---|
| Graft not granted | no `self` target, context button stays on whatever else is in range |
| granted, dial on Kindle | still no target — the dial *is* the selection |
| granted, dial on Glamour | `◑ GRAFT` on the context button, dial reads **30** not Dim's 10 |
| tap it | refuses with "Hold it. Three counts." and takes nothing |
| hold and release | the two-button card, **Whitewall / Blackstone** for a Neutral character |
| pick one | `doc.worn` set, `player.zoneId` set, **the robe and staff visibly swap**, ash −1, Focus −30, buff pip lit |
| suspicion | amber ring around the context button, thickening 2 px → 6 px |
| label | flips to `UNVEIL`; tapping it un-Grafts and pays the Glamour XP |
| cooldown | refuses for 20 s, then clears |
| expiry | own face back, own robe back, XP paid |
| a Watchman inside 22 m mid-channel | the channel is cancelled, 20 s cooldown, **no ash and no Focus taken** |
| the worn faction's own bolt | **0 suspicion** — §8.3's rhythm, confirmed live |
| `?shot=street_dusk` | `__forge.game` is **absent**; the render is unchanged, 66 calls / 134k tris |

---

## 10. What is wired and cannot fire yet

Honest list. Each is one line away and each is somebody else's file.

| Suspicion source | State |
|---|---|
| Watchman inside 6 m / 10 m / 22 m | **wired**, but `world.watch()` does not exist yet and no enemy is placed in the world. Until it does, suspicion only ever decays and a Graft runs its full duration unopposed |
| casting the worn faction's bolt | **live**, and correctly free |
| `wrongProjectile` (+25) | wired and unreachable — `basicOf` always hands you the *worn* faction's bolt, so there is no way to throw the wrong one. It becomes reachable the day a real spellbook lands |
| `ownField` (+8) | wired and unreachable — the three Neutral fields carry `factionId: 'neutral'` and `basicOf` filters faction spells out of the dial. **This is the one gap that matters**: §8.3's "your own fields plus the worn faction's projectiles" rhythm has no way to cast the fields, so the +8 half of the loop is inert. Fixing it means field selection, which is past the brief's "build the minimum" |
| `strikeCitizen` (+40) | wired, no citizen-damage system exists |
| `wrongBuilding` (+30) | not wired — nothing in the world knows which faction may enter a building |
| `seenChannelling` | implemented as "the channel ends", not "+100 and Break", because you cannot be Grafted while channelling one |

### Hooks the world owes this system

```js
world.watch()             // → [{ x, z, id?, weight? }]  every Watchman. id keys WATCH_WEIGHT
world.aggro(radius, pos)  // called once on a Break, radius 30
```

Both are optional-chained and both are one line in `main.js`'s `world:` block.

---

## 11. Reported, not built

1. **`data/quests/sandbox.json`: S02 and S04 can go back to `weight: 1`.** `boardRoll` honours
   `BOARD_ALWAYS` now and posts them on every board every day, in every town, exactly. The 40s are
   only distorting the other posts' odds.
2. **`sim/tables.js` `SHOP` has no `hearth_ash` entry.** STORY §12 prices it at 350 mk away from a
   Longacre hearth. The free-at-home half is built and it is enough for the campaign; the paid half
   is a one-row data change in a file another agent owns.
3. **The Neutral pack assumes nothing this pass did not build.** All 24 `worn` steps and all 9
   `verb: "graft"` steps run. The one thing the *design* asks for that the pack cannot exercise is
   the Neutral fields (§10 above) — and no quest step depends on them, so nothing is stranded.
4. **`js/player.js` registers a `zone` knob** that `setZone` now fights: grafting moves the robe out
   from under the dev panel's selector. Cosmetic, dev-only, and player.js is not mine.
5. **`worn` reaches the quest engine, the bolt, the robe and suspicion — but not XP or damage.**
   `sim/schools.js` `affinityOf/affinityXp/affinityPower` and `sim/xp.js` `grantXp` all take a
   `worn` argument and all handle it correctly; **nothing in `js/game/` calls any of them.** Quest
   XP goes straight through `questrunner.apply(['xp', school, n])` with no affinity multiplier at
   all, and there is no combat system to apply `affinityPower` to. That is a pre-existing gap in
   the XP grant path, not one Graft introduced, and closing it means routing the whole economy
   through `grantXp` — which is a separate job. Until then, "Grafted as Dark has exactly Dark's
   +10%" is true in `sim/` and in `tools/soak.mjs`, and is not yet true in the running game.
