# Idle Western 2 — spectacle, actors, director (lane S)

Lane S owns `js/render/{cameras,actors,eventart,fx}.js` and `js/render/spectacle/*`. The spectacle director is created by
`wireRenderCore` (actors.js) and lives at **`world.spectacle`** (`__iw2.world.spectacle`). `?nospectacle` boots without it
(A/B perf); `?nobudget` disables the budget (falsification only).

## Files
| File | What |
|---|---|
| `spectacle/director.js` | The rules: one slot, the actor budget, pre-allocated pool, scheduling (specials, beats, ambient), W7 picking, bubble anchors, camera hooks, warm-up, stats |
| `spectacle/scenes.js` | Every spectacle as a small state machine: eject/fling, brawl, duel (real + ambient), robbery, stagecoach, opening, hat promo, Deed showdown, Fake Your Death, construction flourish, ambient gags |
| `spectacle/cast.js` | Adapter onto lane A's rig (`kit.crowd`, `crowd.place/dress/hat`): 1 draw + 1 blob draw for all hero actors; flying hats (tossed/shot off/dropping on) use `kit.hats.geometry` per type, created on first use |
| `spectacle/looks.js` | Casting: named characters → `kit.CHARACTERS`; bit parts (drunk, cowboy, cardsharp, goon, hired gun, nephew, nun, passengers, townsfolk) in A's look vocabulary |
| `spectacle/props.js` | All spectacle props in ONE instanced mesh (eventart's variant trick): barrel, chicken, goat, coffin, piano, table, Pomfrey sign, money bag, horse, stagecoach, hay cart, jail wagon, trough, tape, gun, rolling pin, vulture, tumbleweed, fly, plank… |
| `spectacle/particles.js` | Budgeted particles: clay dust/smoke/splash spheres (lit) + glowing stars/flash/glass shards. 2 draws |
| `cameras.js` | Hero director now uses `HERO_VIEW` (lane A: down the street from the west, yawed toward the north facades); plot shots +12° more yaw so facades read; `heroRig.shot(fn)` blends to a spectacle camera; `heroRig.note(id)` biases the tour |
| `eventart.js` / `actors.js` | Golden Tumbleweed art + rolling path; specials are no longer drawn as generic event props (the director owns them) |
| `tools/test-spectacle.mjs` | The W10 gate (below). `tools/spectashot.mjs` = dev screenshots of cosmetic scenes |

## Rules (W9/W10)
- **Budget:** ≤ 6 animated actors, ≤ 24 crowd extras, ≤ 256 particles (fx.js juice counts against it), spectacle ≤ ~10 draws
  (cast 2 + flying hats + props 1 + particles 2). A scene asking past the budget gets `null` and must still play; a
  higher-priority scene evicts the lowest-priority one holding actors (gag 0 < set 0.5 < ambient duel 1 < fling/beat 2 < special 3).
- **One slot:** specials (duel, brawl, robbery, stagecoach) and story beats (hat, deed, prestige) are exclusive. Beats wait
  ≤ 6 s for a special to finish, else are dropped (the camera cut still happens). Ambient gags: one at a time, every 15–30 s,
  never during a slot scene. At most 2 ejection scenes overlap (one landing, one held).
- **W9 wind-up:** the UI owns `special:begin` (bell + chip, begins once the hero has been on screen). On `special:start` the
  director stages the scene in the slot (evicting a beat/ambient scene if needed). A brawl also plays in the Saloon card.
- Movers never cast into the shadow map; every actor has a blob shadow that shrinks with height (landing anticipation).
- Pool, meshes and particle arrays are pre-allocated; `world.warmup` is wrapped so every spectacle shader compiles at boot.
- The only render-side act is the duel timeout (`duel:result` 2.6 s after DRAW without a tap → Basic).

## API for lane U
```js
const s = __iw2.world.spectacle;
s.pickHero(clientX, clientY, ev.timeStamp)   // = s.pickView('hero', x, y, ts); also s.pickView('line:saloon', …)
// → the single W7 winner or null:
// { kind: 'minigame', game: 'duel'|'brawl'|'robbery'|'stagecoach', act, payload, … }   rank 1
// { kind: 'event', eventId, … } / { kind: 'courier', … }                                 rank 2 (actors.js, unchanged)
// { kind: 'fling', id, act: 'fling', dirFor(dx, dy) → 'left'|'right'|'up'|'down', targets: [{id,x,y,visible}] }  rank 3
// { kind: 'piano', act: 'piano', payload: {} }   (P's piano tapTarget also surfaces as kind 'target', id 'piano')  rank 4
// { kind: 'char', char: 'mabel'|… }   tap → bark with the 20 s cooldown, no act                                   rank 5
// { kind: 'site', act: 'build:hurry', payload: {lineId} }                                                          rank 6
// { kind: 'pile' | 'target', lineId, … }                                                                           rank 6.5
// { kind: 'street', lineId, point }   → hustle tap                                                                 rank 7
// When `act` is set: game.act(hit.act, hit.payload). For a fling: on swipe end game.act('fling', {dir: hit.dirFor(dx, dy)}).
```
- **Duel:** any hero tap while the duel is live is the duel tap. Pass the event's `timeStamp` (same clock as
  `performance.now()`): `ms` is measured from **the frame the DRAW was rendered** (`scene.onAfterRender` on the hero camera
  stamps `drawAt`). A tap before that frame is `{early: true}` (shoots own boot). Bus: `duel:draw {id}` (show "DRAW!"),
  `duel:phase {id, phase:'result', result}`. `s.duel()` → `{phase, drawAt, id}`. `s.has(kind)` says whether a scene exists
  (no `ghost` yet).
- **Fling:** `s.fling()` → `{id, x, y, targets}` while Mabel holds someone (hero px), for placing the swipe chips on the real
  landing spots if wanted. `dirFor` uses E's cardinal mapping (left trough · right dentist · down jail · up Pomfrey).
- **Bubbles:** `s.bubble(charId, viewId = 'hero')` → `{x, y, visible, actor}` (view px, cached per frame) or `null`. Uses the
  live actor's head when that character is on stage, else the character's home business doors (open businesses only).
  Extra ids: `'hat'` (the upturned derby during the opening), `'stranger'`. Transform-only DOM on U's side.
- Render barks emitted on the UI bus: `bark {char:'pomfrey', trig:'pomfrey_pass'}`, `bark {char:'lulu', trig:'garter_window'}`.

## What plays
- **Opening (W15):** a new game throws the Stranger out of the saloon doors (slow-mo start), face-first slide in the mud,
  derby lands upturned beside him; mud taps flip a coin into it; when the first business opens he gets up, puts the hat on
  and walks off. Pre-bootstrap hero framing tightened so he reads.
- **Ejections + fling (W4/W6):** Mabel holds the drunk at P's `doors` anchor (2 at Lv ≥ 25 sometimes; Fingers *with his
  piano* for the pianist kind; at Lv 100 sometimes a whole table with two card players; a goat). On `fling` the bundle arcs
  with a tumble, hat lagging, to trough (splash, sits in it, climbs out), dentist chair (stars), jail wagon (rocks), Pomfrey's
  window (glass shards, nearest `FRONTS` Pomfrey frontage), hay cart (hay puff). Auto throws use the state's no-repeat table.
  Piano frenzy → cosmetic ejection on the beat.
- **Bar Brawl:** cut to the saloon, churning dust cloud at the doors, Mabel punching, up to 7 bodies out of the doors and both
  upper windows (shards), tappable mid-air (stars, coins, hat off, knocked further); untapped ones sprawl then stagger back in.
- **Leone duel (W8):** paces with dust steps, turn, over-the-shoulder (hat-size aware), hard cut to an eye ECU, standoff with a
  tumbleweed, interruption (horse / Pickles staggering / fly landing on the nose), DRAW. Outcomes: gold/silver (spin, sprawl,
  hat flies), basic (both fire, your hat shot off), early (boot shot, hopping, stars; opponent laughs himself over), timeout.
  Mortimer walks in and measures the loser. Opponents: Bart, hired gun, Mortimer's nephew, a nun. Ambient no-reward duels
  between real specials.
- **Robbery:** tracking chase shot; Bart + 2 goons on horses gallop west dropping money bags (tap bags/riders); Bart hits the
  low sign and flips off; horse keeps going.
- **Stagecoach:** coach + team arrive and stop in shot; 3 passengers with silly hats step out; tap one → `claimEvent` with the
  current hero business; that passenger walks to it, the others cheer, the coach leaves.
- **Golden Tumbleweed:** eventart `tumbleweed` rolls and bounces across the frame (frequent event, U's normal event claim).
- **Ambient gags (W4):** Wendell's walking barrel, Pickles asleep somewhere near camera (snore puffs), chicken chase that
  reverses, Pomfrey's hat procession (two bearers once his hat is ≥ Twenty-Gallon; a thimble walks alone), vultures over Boot
  Hill, Garter window exit (long johns into the hay cart, wife with rolling pin storms the door; off in Sunday School),
  Mortimer measuring a passer-by, a horse staring at the camera, a plain tumbleweed, ambient ejection before the Saloon is yours.
- **Beats:** construction dust/stars on start, frame-up, sign-raise and done (the cut is cameras' `beat`); hat promotion (old
  hat tossed, new one drops on with a squash, tip of the hat); Deed showdown (You vs Pomfrey, his sign tears and falls);
  Fake Your Death (procession, crying Mabel, coffin onto the coach, coach leaves, a new-face Stranger appears).

## W10 gate — `CDP_PORT=9351 node tools/test-spectacle.mjs`
S22 portrait UA, CPU 4×. Arm 0: no storm (sets the rAF-work allowance = max(8, baseline + 1 ms); the engine baseline is not
this lane's). Arm A: a Bar Brawl + a real construction (Velvet Garter rebuilt) + Lv 100 ejections every 1.5 s + every ambient
gag + an ambient duel all requested at once, budget on → must pass. Arm B: same with `?nobudget` → must fail. Timing uses the
best of three 6 s windows (other lanes share the machine), caps use the worst.

Runs on 2026-10-04 (machine load 6–13 from parallel lanes, so absolute ms are unreliable):
- A: dt p95 16.7–16.8 ms, rAF work best 8.4–13.2 ms within allowance, actors max 6, particles ≤ 72, spectacle ≤ 10 draws → PASS.
- B: actors max 35–41 (cap 6) in every run; frame time also failed in 2 of 3 runs (dt p95 33 ms; work 16.9 vs 13.2).
- Baseline without the storm already sits at 7.8–13.6 ms rAF work p95 under this load; `test-scroll` A/B with
  `?nospectacle` showed no measurable difference (noise dominates).
test-boot, test-look, test-lifecycle: PASS on 9351.

## Known gaps / next
- Anchors still on fallbacks: `haycart`, `wagon` (jail wagon), `chair` (dentist), `pomfreyWindow`, garter `window`/`haycart`,
  hub `mud`. Fallback props are drawn for trough/haycart/wagon only when the plot has no anchor (see CONTRACT request).
- Acquisition cutscenes (poker five aces, takeover) are not staged; the camera cut plays.
- Ghost Town ghosts/ghost duels are not built (season overlay).
- Fake-death moustache: new face = new colours; a moustache swap needs the disguise → `stache` mapping.
