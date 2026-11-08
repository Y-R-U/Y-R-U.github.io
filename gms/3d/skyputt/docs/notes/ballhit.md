# ballhit — ball-vs-ball collisions (2026-11-08)

Owner: `ballhit` agent. Aaron: "By default I want balls to be able to impact other balls, but allow
it to be turned off / balls go through each other like it does now."

Modes (Aaron, confirmed): **Battle** (default) = balls collide and a ball knocked out of bounds costs
its owner +1; **Classic** = balls pass through each other (close to the official rules).

Status: **done and tested locally** (engine, game loop, online client, Go server). **The server
changed → games.br8t.com needs a server redeploy + client sync** for ball hits to work online
(see "Deploy" below). Nothing was deployed.

## Which balls take part
- **Online rooms**: every seat's ball (players + ghost-AI seats), per the room's rule (`opts.collide`).
- **Recorded ghosts** (the story rival's ghost — the only ghost ball the game shows offline; the daily
  "ghost board" is scores only, no balls): in Battle they collide both ways like real players. See "Ghosts".
- Single player with no ghost: one ball, nothing changes. There is no local hot-seat mode.
- A ball still on the tee before its first putt never collides (balls would overlap there).

## Physics (js/engine/)
- `collideBalls(balls)` (physics.js): equal-mass spheres, pairs in list order (deterministic), only
  balls that are `moving`/`rest` (cup / oob balls take no part), two resting balls never push each
  other. Normal impulse with restitution `BALL_E = 0.88` (constants.js). **Rolling hit** (both
  supported): the impulse is scaled by 5/7 — the classic rolling-ball result, so a head-on hit leaves
  the striker ~2/7 of its speed (a little follow, never a bounce back) and the struck ball ~5/7
  (floor friction turning slide into roll). Airborne: plain restitution. Spin is not modelled beyond that.
  Overlap is split half/half. A struck resting ball wakes as if shot: `state = 'moving'`, its `rest` =
  the spot it was knocked from (so out of bounds puts it back there), `knockedBy`, events `knocked` /
  `ball`. No tunnelling: 10 m/s cap → 0.042 m/step < 2R (0.1 m).
- `restingBall(x, y, z)`: how every client builds a peer's resting ball (supported, normal up).
- `stepBalls(world, balls, t, collide)` (sim.js): one fixed step for several balls — each moving ball
  steps in list order, then pairs collide. **The live loop and every replay call exactly this.**
- `simulateShotWith(world, ball, vx, vz, others, { t0, trace, collide })`: a shot with other balls,
  runs until nothing moves; per-ball paths sampled on the same ticks (they line up in time).
- `collide: false` = pass-through: bit-identical to a solo shot (tested).

## Game loop (js/game/play.js)
- `Round.others` = the other REAL balls on the hole (engine Balls), `Round.collide` (option; default
  the `ballHit` setting; online = the room's rule). Ghosts are never added.
- With others present the fixed-step loop calls `stepBalls([myBall, ...others])`; struck balls keep
  stepping after my ball stops. **A shot is over only when every ball has stopped**: my `rest` →
  next putt / report, my oob return, my cup → hole card, and `endShot()` (helpers off, Steady Hands
  clock back to 1) all wait for that (`whenSettled`, `ballsMoving()`); otherwise a still-rolling
  struck ball would see a different obstacle clock than the replays. My ball can be knocked again by
  a rebound after its rest event; the deferred rest then waits for the new rest (a cup/oob cancels it).
- Ball-on-ball clack uses the existing `wall` sound (stone), scaled by the closing speed.

## Rules for knocked balls (Aaron's rules)
- **Knocked and rests**: its owner plays on from where it stopped. No stroke for anyone.
- **Knocked out of bounds**: back to the spot it was resting on before it was hit and **+1 to its
  OWNER** (same as putting your own ball out); the shooter pays nothing. Chains count the same way
  (A hits B, B hits C out → C's owner +1). At par + 4 that picks the owner up (D10). Shown as a
  toast "Knocked out by <name> +1", a red note on the victim's hole card, a `notes` entry on the
  round's score row, and online in the "waiting for…" pill.
- **Knocked into the cup**: **holed for its owner at their current stroke count** (no extra stroke).
  Scoring stays sane: strokes are only ever counted from the owner's own putts, the server simply
  marks the seat done. (Strict golf rules would replace a moved ball; Aaron asked for balls that roll
  on, so the knocked position stands.)
- The shooter's own shot follows the normal rules (oob = +1 and back, etc.).
- A knocked player can't Mulligan the shot before the knock (their ball was moved by someone else);
  a shooter's Mulligan puts their own ball back but does not undo the balls they knocked.

## Online (js/net/, server/)
How other balls exist online (unchanged): everyone plays the hole at once; each shot's input is relayed
the moment it's taken and every other client replays it with the same physics as a ghost; the
shooter's reported result is authoritative (D11, client-reported). Positions per seat live on the
server (`cur.pos`).

Ball hits on top of that:
1. **Shooter** (`OnlineRound.shoot`, or the host's AI driver for AI seats): `targetsFor(seat, from)` =
   the other seats' balls that are **at rest and known**: off the tee (`cur.pos` set), not holed, not
   in flight, not mid-replay, not about to be knocked, not overlapping the shooter; my own ball counts
   when it's resting (an AI seat the host runs can hit it). Balls still on the tee never collide
   (they'd all overlap). The shot is simulated live against those, and the relay carries them:
   `shot.balls = [{seat, n, x, y, z}]`.
2. **Everyone else** replays with exactly those balls (`Replayer.shot` → `knocks` with paths), so the
   knocks are bit-exact on every client. A struck ghost plays its knocked path; **if it's my ball**, my
   client freezes it (`state 'knocked'`: no aiming/putting), plays the knocked path on it, and waits.
3. When everything has stopped the shooter reports `result.knocks = [{seat, state, to}]`.
4. **Server** (`applyKnocks`): a knock applies only to a ball that was in the shot's `balls` list and
   **hasn't moved since** (same shot number `n`, not in flight, not done). Otherwise the owner's own
   shot came first and wins — the knock is dropped. Applied knocks set the position (rest) / leave it
   (oob) / hole it (cup), **bump the seat's `n`** (any plan or putt from the old spot is now stale) and
   clear its Mulligan; a `knock` event goes to everyone (shooter too) **before** the shooter's
   `result`. A knock into the cup can end the hole (`checkHole`).
5. Clients apply `knock` events (`OnlineGame.onKnock` → `OnlineRound.onKnock`): ghosts snap to the
   server's spot; my ball moves there (or is holed: "Knocked in by X!"). If the shooter's result
   arrives without a knock for a predicted ball (dropped), that ball goes back to the server's spot
   (`shotSettled`; for the host's own AI shots the result reply does it). If my putt crossed a knock on
   the server (theirs first), my putt is cancelled locally ("your putt didn't count") and the server
   refuses it as `stale_shot`.
6. **AI seats** (host-driven): planning still ignores other balls; the chosen putt is then re-simulated
   on the host against the resting balls (same `Replayer` the others use) and relayed with `balls`,
   so AI putts knock balls (players' and other AIs') and get knocked like anyone. The AI driver waits
   for a seat whose ball is being knocked (`ghostBusy`) and restarts from the new spot (`n` changed).

**Known limits (by design):** moving-vs-moving between two *different* shooters' simultaneous putts is
not simulated (each shot only sees balls at rest when it was taken — a peer's moving ball has no
reliable position yet), so two balls rolling at the same time still pass through each other. If two
players' shots both target the same ball, the first result to reach the server wins and the other
shooter's ball may have bounced off a "phantom" (its own result still counts as simulated). The
aiming guide does not show other balls.

**Room rule**: `opts.collide` (bool; true = Battle). The creator's `Ball hits` setting seeds the create form and
quick play; the host can change it in the room options ("Ball hits: Battle / Classic" + the one-line hint); the
lobby summary shows "Battle (ball hits)" / "Classic (no ball hits)"; public room rows say "· Battle" / "· Classic". Quick-play rooms keep
the first player's choice (as with their other options). An **older server** doesn't know the field,
never echoes it, and the client treats a missing `collide` as off — so a new client against the
current live server is pure pass-through, nothing breaks. A new server with an old cached client: old
clients don't send `balls`, ignore `knock` events and won't see knocks (a knocked old client's next
putt is refused as stale and it resyncs) — deploy server + client together and the brief mix is harmless.

## Setting
`settings.ballHit` (default **true** = Battle, `js/app/store.js`), "Ball hits: Battle / Classic" in the
settings sheet (`js/app/menus.js`, `ballHitHint`): "Battle: knock rivals' balls, out of bounds = +1 to
them." / "Classic: balls pass through each other." + "Online, the room's host picks this for everyone."
Offline it decides whether the rival ghost collides; online it seeds the rooms you create.

## Ghosts (js/ai/ghostsim.js, Round.loadGhost)
In Battle the rival ghost is a `GhostSim`:
- **Undisturbed = exact replay.** It is a *kinematic* ball posed every physics step from its recorded
  shots on the obstacle clock (a pure function of the record and `world.time`, the same clock the aim
  agent's GhostPlayer uses — 6dea8ece kept as is). It isn't stepped, so its path and score are exactly
  the record; the visual is still the GhostPlayer. It does take part in `collideBalls` (both ways).
- **First impact → live.** Hit (or hitting a ball), it turns into a normal Ball stepped by `stepBalls`
  with mine, drawn from the sim. When it stops it plays on like a real golfer: the AI planner (worker
  client, `budgetScale 0.5`) at the ghost's level — the field entry's personality + skill (playField
  now passes them), or, without them, a skill estimated from its recorded score vs par.
- Its strokes: recorded shots taken so far (+ their penalties), then its live putts; out of bounds
  (its own or knocked) +1 and back; knocked into the cup = holed; picked up at par + 4.
- **Score:** when my hole ends, a live ghost still on the course finishes headlessly (`finishSync`,
  synchronous planner) and its hole score in the opponents list (hole card, totals, `checkGoal`) becomes
  what it really took; an undisturbed ghost keeps its recorded score. Replaying a hole restores the
  recorded score first (`recScores`).
- **My ball hit by a ghost** while I'm aiming: `state 'bumped'` (no putting) until it stops → back to
  ready, no stroke; knocked out → back to its spot +1; knocked into the cup → holed at my strokes.
  No Mulligan back past a knock.
- Classic: the ghost is exactly as before (GhostPlayer only, passes through).
- Determinism: the kinematic pose and the live sim are fixed-step and seeded (golfer seed from name +
  hole); the headless tests run the same knock twice and get identical paths and scores. In the game
  the live ghost's plans come from the worker; a plan that arrives after its planned launch time
  launches late (single-player only; online seats never use GhostSim).

## Files
- `js/engine/constants.js` (`BALL_E`), `js/engine/physics.js` (`collideBalls`, `restingBall`),
  `js/engine/sim.js` (`stepBalls`, `anyMoving`, `simulateShotWith`)
- `js/game/play.js` (`others`, `collide`, multi-ball step, settle gating, `onOtherEvents`)
- `js/net/replay.js` (`balls` → knocks, `targetBalls`), `js/net/round.js` (targets, live knocks,
  report knocks, predicted knocks on my ball / ghosts, `onKnock`, `shotSettled`, `knocksConfirmed`),
  `js/net/game.js` (`knock` event, result reply), `js/net/driver.js` (AI putts against the balls),
  `js/net/net.js` (route `knock`), `js/net/rooms.js` (`collide` in default/quick opts, `collideLabel`),
  `js/net/form.js` (Ball hits row), `js/net/index.js` (seed from the setting, lobby/list labels)
- `js/app/store.js`, `js/app/menus.js` (setting)
- `server/opts.go` (`Collide`, `BallRef`, `Knock`), `server/session.go` (`balls`, `knocks`),
  `server/room.go` (`ballRefs`, `applyKnocks`, listing), `server/integration_test.go`
  (`TestBallHits`, `TestBallHitsOOB`, `TestBallHitsOff`), `server/README.md` (protocol)
- `js/ai/ghostsim.js` (new: GhostSim, finishSync), `js/story/opponents.js` (field entries carry
  personality + skill), `js/game/hud.js` (hole card `notes`)
- `tools/ballhit_test.mjs` (headless), `tools/ballhit_cdp.mjs` (two browsers; `--ghost` = solo rival
  ghost), shots in `ballhit_shots/`

## Tests (2026-11-08)
- `node tools/ballhit_test.mjs`: **41/41** — head-on (struck ~5/7, striker ~2/7, no speed created),
  glancing, struck ball into the cup, struck ball out of bounds (back to its spot), chain A→B→C (B
  knocks C out, C back to its spot), toggle off = pass-through and identical to a solo shot,
  determinism, guards, live loop vs relayed replay (27/27 aimed shots identical); **ghosts**:
  undisturbed ghost = its record (score + exact rest spots), a ghost knocks my resting ball and goes
  live, the AI finishes its hole, Classic = pass-through + exact replay, my putt knocks a resting
  ghost → AI plays on (3 vs 2 recorded), same knock twice = identical, finishSync, ghost knocked out
  +1 / own putt out +1; **server**: rule kept, `balls` relayed, bit-exact replay of shot + knock on the
  other client, knock applied with new `n`, putt from the old spot refused.
- `server/test.sh`: ALL PASS (TestBallHits, TestBallHitsOOB — knocked out = +1 to the owner, shooter
  unchanged — TestBallHitsOff).
- Existing suites: physics 25/25, online_test 28/28 (replay 108/108), story, events, meta, store pass;
  holes_test exit 0; ai_test (20 rounds, default) all checks passed (910 s). daily_test 74/75: "all
  courses open → the same hole as the global pick" fails — daily selection code from 6dea8ece, not
  touched here (it was 75/75 earlier in the session).
- `node tools/ballhit_cdp.mjs` (two headless Chromes, local server): ALL PASS, no console errors —
  Battle default in settings/form/lobby; player knocks player (frozen + animated on the victim, all
  agree to 1e-6); the host's AI seat knocks the host's own ball and Bob (all agree).
- `node tools/ballhit_cdp.mjs --ghost`: ALL PASS — my putt knocks Careful Carl's ghost off its line,
  the AI plays it on, the hole card shows its real score.
  Screenshots: `ballhit_shots/` (settings, create-form, lobby, a-/b-hit, a-/b-ai-hit, ghost-hit, ghost-card…).

## Deploy (needs Aaron's OK — not done)
Server changed (new room option + `balls` relay + `knocks`/`knock` + the knocked-out +1). Order doesn't matter (see the
compatibility note above), but ship both: rebuild + restart skyputt.service from a clean `git archive
HEAD` export (`CONFIRM=yes RUN_TESTS=1 STATIC=1 server/deploy.sh`), which also syncs the static client.
Live rooms are in memory, so a restart ends any rooms in progress.
