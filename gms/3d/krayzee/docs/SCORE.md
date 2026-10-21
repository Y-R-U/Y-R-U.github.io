# SCORE lane

Files: `js/game/index.js` (facade), `js/game/score.js` (Royal Privilege economy), `js/game/career.js` (lifetime PP,
ranks, D2/D3, save), `js/game/court.js` (online Court, D4), `tools/score-sim.mjs` (node tests + pacing + falsify).
Pure ES modules: no DOM, no clock (time only moves through `update(dt)`), all numbers read from `data/rules.js`,
`data/ranks.js`, `data/modes.js`, `data/aircraft.js`.

```
node tools/score-sim.mjs            # 128 assertions + 30 h pacing sim
node tools/score-sim.mjs --falsify  # breaks 4 rules in scratch copies; every break must make the suite fail
```

## API

```js
import { createGame, loadCareer, createCourt } from './game/index.js';
const career = loadCareer();                 // localStorage 'krayzee.career'; { storage, now } injectable for tests
const game = createGame({
  mode: 'free',            // 'free' | 'story' | a ROOM_TYPES id ('court','rumble','coronation','strict','garden','joust','open')
  protection,              // optional override: 'rubber' | 'partial' | 'realistic' (else room → story difficulty → Free Flight)
  difficulty,              // story: 'easy' | 'medium' | 'hard'
  rankIndex,               // optional: fixed rank for Audacity (story mission / Court rank). Omit = follows career
  aircraft: 'c172', playerId: 'player', name, gender,
  career,                  // loadCareer() instance; omit = loads one; false = none
  outragePerPlayer,        // true when ATC runs per-player meters (online)
  partialStartPct,         // host option 50/75/100
});
game.handleEvent(ev);                         // ATC / RADIO events, see below
game.reportImpact({ speedKt, onGear });       // FLIGHT collisions → { result:'bounce'|'damage'|'destroyed', protectionLeft, restitution, spinDegPerS?, apResumeAfter?, shake?, gagSecs?, pendingLost }
game.update(dt, { gsKt, onGround, surface, atStand, calm }); // every sim frame; banking needs the flight fields
game.state();   // { pending, banked (session/room PP), outrage, tier, combo, comboLeft, comboFrac, frozen, protection, protectionMode, effectiveProtection, rankIndex, lifetimePP, careerRankIndex, nextGoal, stats, ... }
game.on(evt, fn);                             // returns an unsubscribe
game.setPilotRank(aiId, rankIndex);           // AI ranks for Audacity (or put victimRank on the event)
game.setAircraft(id); game.setPPScale(2);     // e.g. Royal Decree double_points_final_minute
game.respawn();                               // after the destroyed gag; partial refills to its start %
game.bank();                                  // force a bank (mission end)
```

### Events out
| evt | payload | HUD suggestion |
|---|---|---|
| `pp` | `{amount, id, name, text, mult, parts:{base,combo,audacity,heat,aircraft,scale}, frozen, pending}` | toast `text` ("CUT IN! +790 ×1.75"), max 2 visible, gold; tick the Pending counter |
| `combo` | `{mult, step, left}` | `COMBO ×1.5` with draining ring = `state().comboFrac` |
| `loss` | `{amount, reason:'bounce'|'prang'|'scandal'|'destroyed', text}` | red toast "DIGNITY LOST −90" |
| `banked` | `{amount, sessionBanked, atStand, text}` | pending flies into the white Banked number; chime |
| `rankUp` | `{from, to, rank, title, unlocks, text:'PROMOTED! VISCOUNT'}` | non-blocking banner + unlocks list |
| `scandal` | `{forfeit, frozenFor, headline, headlineSecs}` | THE KRAYZEE HERALD card 3 s; dim PP for `state().frozen` s |
| `unfrozen` | `{}` | |
| `protection` | `{mode:'partial', pct, effective, hit?/refill?}` | rubber-duck pill next to PP; turns red/"REAL METAL" at 0 |
| `destroyed` | `{pendingLost, gagSecs, crashPenalty, sessionBanked}` | canopy-and-parachute gag |
| `outrage` | `{value, tier, from}` | only when the internal meter changes tier |
| `outrageDelta` | `{amount, why}` | bounce/prang/priority outrage ATC cannot see — forward to `atc.addOutrage(amount, playerId)` |

### Events in (`handleEvent`)
- ATC events as emitted (`type` = infraction key, numeric `id`, `actor`, `victim`, `data`, `outrage`, `frozen`) and
  RADIO-shaped `{type:'infraction', id:'cut_in_final', actor, victim, outrage}`. Only the player's own (actor ===
  `playerId`, or `isPlayer:true`) score. ATC extras with pp 0 (`runway_incursion`, `collision`, …) never score.
  Duplicate ATC ids are ignored, so `atc.on('*')` delivering an event twice is harmless.
- `impeccable` (ATC) or `{type:'landed', actor, impeccable:true}` → +50 once per landing.
- `{type:'scandal', key, actor, t}` (ATC) → forfeit 25 % pending, freeze 60 s, outrage 60.
- `{type:'composure'|'outrage', outrage|value}` → meter value.
- `{type:'barked', ...radioPayload}` → banter: response window +40, ≤ 2 s +80, `priority` to the tower +60 / +5 outrage.

## Rules as implemented
- PP = round10(base × combo × audacity × heat × aircraft × ppRate×decree). Base specials: queue jump ×`data.jumped`,
  cut-in ×1.5 if `data.gap` < 400 (or `data.close`), tower buzz ×2 if `data.dist` < 30, formation 100 + 30/s beyond 3 s
  (cap 400), near miss ×1.5 when effectively Realistic. Heat uses the outrage *before* the infraction.
- Combo: each infraction within 20 s of the previous steps ×1 → 1.25 → 1.5 → 2 → 2.5 (cap); frozen infractions do not
  build combo. Banter and Impeccable are flat (no combo), and also zero while frozen ("nothing counts").
- Outrage: if events carry `outrage` (ATC), ATC is the meter and score only mirrors it; otherwise (`outrageSource:
  'internal'` or no ATC) score keeps its own meter: rule outrage × gain, decay 1 per 3 s while `update(..., {calm:true})`,
  scandal at 100. The infraction that triggers a scandal still scores (ATC sends it with `frozen:false`); the forfeit
  is taken before it is added.
- Banking: pending → banked when stopped < 2 kt for 2 s on runway/taxiway/apron after a landing, or at a stand.
  Landing = `onGround` true after `onGround:false` (or a `landed` event). Grass stop does not bank.
- Rubber: every contact bounces, restitution 0.55, spin ±120°/s, AP after 2 s, −15 % pending, +8 outrage.
  Partial: same bounce with restitution scaled by protection *before* the hit (100 → 0.55, 10 → 0.1, linear, → 0 below
  10), then protection −clamp(kt × 0.8, 5, 60) %. I also apply Rubber's −15 % pending/+8 outrage per Partial bounce
  ("behaves like Rubber"). At 0 % the next contact is Realistic. Refill: +25 % on any bank, 100 % banked at a stand,
  start % on `respawn()`. Realistic: `!onGear` or > 15 kt = destroyed (pending 0, gag 4 s, Strict Tower −500 room PP);
  ≤ 15 kt = prang (−10 %, +10 outrage, shake 1.5 s). `withinGearLimits({sinkFpm, bankDeg, pitchDeg})` helps FLIGHT
  decide `onGear`.

## Career (D2, D3)
`careerRankIndex(pp, wins, floor)`: points ladder (`rankFor`), floor (story completion = Prince), and Emperor only with
≥ 10 online wins, else King. Titles unlock monotonically (`unlockedTitles`). `selectTitle(id)` (unlocked only, `null` =
real rank). `displayTitle({context, gender, rankIndex})`: `story`/`event`/`ranked`/`online` use the given `rankIndex`
(their rules); `free` uses the chosen title; any other context (`menu`, profile card, casual) uses it only once story
is complete. `canPickTitle(context)` for the Settings picker. Also `addOnlineWin()`, `addOnlineRoom()`,
`setStoryComplete()`, `nextGoal()` → `{rank, ppNeeded, winsNeeded}`, `emperorEarned`.
Save: `{v:1, lifetimePP, onlineWins, unlockedTitles, selectedTitle, storyComplete, rankFloor, stats, savedAt}`,
written on every change, try/catch, defaults merged on load, corrupt → defaults. Freshness is `savedAt`
(`newerCareer(a,b)`), never a JSON compare.

## Court (D4)
`createCourt({roomType, target})`: `addPlayer(id, {name, gender, emperorEarned, human}, roomMs)`, `addPP(id, banked,
roomMs)`, `penalize(id, 500)`, `recordRound(id)` (Joust), `standings()` → `[{id, place, roomPP, rankIndex, rank, crown}]`,
`rankOf(id)`, `holder`, `finish()` → `{winner, standings, countsAsWin}` (≥ 2 humans), `serialize()`/`restore(json)` for
host handoff (plain JSON, versioned). Events: `crownChange {from,to,emperor}`, `rank`, `standings`, `winner`, `finish`.
Leader with PP > 0 = Emperor if `emperorEarned`, else King; each later place one rung down; 0 PP = Baron. Ties: earlier
time-to-reach. Pass `emperorEarned: career.emperorEarned` when each player joins (in the join/hello message).

## Wiring for main.js (FLIGHT)
```js
import { createGame, loadCareer } from './game/index.js';
const career = loadCareer();
const game = createGame({ mode, protection, difficulty, career, aircraft, playerId: 'player', name: profile.name, gender: profile.gender });
atc.on('event', game.handleEvent);                        // infractions, impeccable (one subscription, not '*' + 'event')
atc.on('scandal', game.handleEvent); atc.on('composure', game.handleEvent);
radio.on('barked', (b) => game.handleEvent({ type: 'barked', ...b }));
game.on('outrageDelta', (d) => atc.addOutrage(d.amount, 'player'));
for (const ai of traffic) game.setPilotRank(ai.id, ai.rankIndex);   // AI_RANK_WEIGHTS draw
// on contact (FLIGHT physics):
const r = game.reportImpact({ speedKt, onGear: groundHit ? withinGearLimits(td) : true });
//   bounce → reflect with r.restitution, add r.spinDegPerS yaw, AP back after r.apResumeAfter; damage → shake r.shake;
//   destroyed → gag r.gagSecs, then respawn at stand + game.respawn(). Also atc.report('collision', 'player', {victim}) if wanted.
// per frame (sim time, not while paused):
game.update(dt, { gsKt, onGround, surface: world.surfaceAt(x, z), atStand, calm: !overriding });
// HUD reads game.state() each frame; toasts from game.on('pp'|'loss'|'banked'|'rankUp'|'scandal'|'protection').
// Title shown on radio/subtitles: career.displayTitle({ context: 'free', gender }) → radio profile title / splice.
// Online host: court.addPP(playerId, e.amount, roomMs) on each player's 'banked'; court rank → game.setRankIndex + radio splice.
```
UI: keep `krayzee.profile.rank` in sync with `career.rankIndex` (or replace it), and add `'krayzee.career'` to the
`syncLocalKeys` keys in `js/ui/account.js` (UI lane). Settings title picker: list `career.unlockedTitles`, gate with
`career.canPickTitle('free')`, save via `career.selectTitle(id)`.

## Pacing model (tools/score-sim.mjs)
Not real play data. 5-min sorties through the real `createGame`; crimes per sortie ≈ 1.5 rising to 2.3 over the
first ~6 h, 20 %→60 % of sorties chain crimes inside the combo window, 15 % bounce, some ripostes, Rubber, AI victim
ranks from `AI_RANK_WEIGHTS`. Result (seed 42): Viscount 15 min, Earl 50 min, Duke 3.1 h, Prince 8.8 h, King 19.5 h,
282k PP at 30 h but still King with 0 wins; with wins spread over the first 22 h, Emperor at 28 h.
