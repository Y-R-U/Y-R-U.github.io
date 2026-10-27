# F-35B STOVL: hover, vertical takeoff, vertical landing (D35)

Aaron: vertical landing "just via a button on the lower left hand side", showing "the most appropriate button for the
situation". It is ONE context button in the existing LAND slot (stick side, `settings.stickRight` moves it). No new row.

## The button (js/flight/stovl.js `contextButton`, wired in main.js `updateStovl` / `onStovlPress`)
The F-35 only. Every other plane keeps the plain LAND button. The orange pill under the button (the LAND NOW slot) is
the second choice, when there is one.

| Situation | Button | Pill | A tap does |
|---|---|---|---|
| On the ground, stopped or rolling ≤ 100 kt (also the start of every flight, while the AP rolls; ~5 s at 1×) | **VERTICAL TAKEOFF** · straight up | none | brakes to a stop, nozzle down, lift fan open, up to a 30 m hover |
| Lifting off | LIFTING… (active) | none | nothing |
| Airborne, wing-borne, a runway LAND in reach and faster than 110 kt | **LAND** (the normal D13 LAND) | HOVER | LAND as ever (LAND NOW pill while it flies) |
| Airborne, wing-borne, under 300 kt and under 900 m, no runway in reach (or slowed to ≤ 110 kt) | **HOVER** · stop in the air | LAND (if in reach) | slows straight ahead (~3 m/s²) to a hover, holding 21–90 m |
| Too fast (≥ 300 kt) or too high (≥ 900 m), no runway | HOVER greyed: "slow down / go lower to hover" | none | a shake |
| Too fast or high, a runway in reach | the normal LAND button | | |
| Slowing to the hover | SLOWING TO HOVER… (active) | none | FLY ON instead |
| In a hover over flat, clear ground | **LAND HERE** · straight down / beside you | FLY ON | moves to the pad (≤ 160 m away), lets down, touches down gently, parks |
| In a hover over buildings / water / trees / a slope / parked aircraft | LAND HERE greyed: "no: trees below" etc. | FLY ON | a shake; nudge the stick to clear ground |
| Landing | LANDING HERE… (active) | none | stops and hovers where it is (any stick input does the same) |
| Flying on | FLYING ON… (active) | none | hover again |

A tap that changes the action blocks taps for 0.7 s (no accidental double tap onto the new action), and HOVER/LAND
only swap places once the new order has held for 1.5 s.

## Flying it (the flight computer, js/flight/aircraft.js `_stovl`)
In a hover the controls are commands, like the real F-35B's unified control law:
- **stick forward/back** = move forward/back (up to 14 m/s); let go and it stops and holds there (Easy/Medium);
- **stick left/right** = turn on the spot (up to 26°/s);
- **RUD buttons** = sidestep (up to 6 m/s);
- **throttle lever** = climb/sink: the middle holds height, up climbs (≤ 6 m/s), down sinks (≤ 4.5 m/s). Easy and
  Medium hand the lever back to AUTO when you let go (height hold at the new height); Hard leaves it where you put it.

The nozzle (0 aft … 95° down) and the lift-fan doors follow the force the jets actually make (`ac.nozzle`,
`ac.liftFan`, rig `setNozzle/setLiftFan` from traffic.sync); `voice.setLiftFan` gets fan × power. Below 18 m the
downwash kicks up dust (FX `wash`). Conversion between wing-borne and jet-borne takes 1.4 s (`ac.vtol` 0 → 1); the
wing carries its share of the weight above ~50 kt and the jets the rest, so slowing to a hover and flying on are smooth.
Jet-borne thrust/weight 1.22 (hover at ~82 % power, heavy fuel burn). Afterburner is locked out while jet-borne.

## Difficulty (js/flight/stovl.js `LEVELS`)
| | Easy | Medium | Hard |
|---|---|---|---|
| hands-off hover | holds the spot | holds the spot (some drift corrected) | drifts with the wind (~3 m/s) |
| hover heat budget | none | 180 s | 70 s: HOVER HOT warning at 75 %, then TOO HOT, the computer lets it down |
| lever dead band | ±0.12 | ±0.08 | ±0.03 |
| lever let go | back to AUTO | back to AUTO | stays latched |
| descent cushion near the ground | yes | yes | no (lever to idle = an 880 fpm arrival) |
| LAND HERE last-metres sink | 1.1 m/s | 1.4 m/s | 1.9 m/s, weaker position hold |

## Rules it changes
- The F-35 may land vertically anywhere flat and clear (grass, runway, taxiway, apron). The jets' runway-only rule
  for the normal LAND stays (LAND still only plans runways for every jet, the F-35 included).
- `ap.fieldTakeoff` (DEMAND TAKEOFF from a field) is a vertical takeoff that flies on to the circuit for the F-35
  (jumbo/herc still refuse). DEMAND TAKEOFF on paved ground taxis to a runway as before.
- A vertical landing ends like any landing: score `landed` (on the ground after airborne), touchdown event, AP DONE
  (route `vland`); DEMAND IT / refuel / Hard taxi-in work as after a field or runway landing.
- Tasks (Heavy Metal set): `f35_hover` (30 s hover), `f35_vfield` (vertical landing on grass), `f35_vhard` (vertical
  landing on Hard). Engine events: `hover {dt, run}`, `touchdown.vertical`.

## API
- Autopilot: `hover()`, `verticalTakeoff({ flyOn, end })`, `landHere(pad)`, `flyOn()`, `stovlMode`
  (`vto | convert | hover | land | landed | flyon | null`), `status().stovl`. `setRoute`, `demandTakeoff`,
  `skipToRunway` end STOVL. `replan()` in a hover just re-captures the hold point.
- Aircraft: `vtolWant` (AP sets), `vtol` (0..1), `nozzle`, `liftFan`, `hoverHeat`, `hot`, `stovlLevel`
  (main.js sets it from the difficulty), `hov` (AP base command), events `hoverhot`, `overheat`, `cooled`.
- stovl.js: `LEVELS`, `CONVERT`, `leverToVs`, `vsToLever`, `padCheck`, `findPad`, `contextButton`, `gustAt`.
- `window.__game.landButton()` (read-only test hook) and `state().player.stovl`.

## Tests
- `node tools/stovl-sim.mjs` (55 checks: hold, VTO, conversion, LAND HERE, Hard vs Easy, button choices, pads,
  other planes untouched). `--falsify=nohold|weak|slam|flat|button` must go red.
- `node tools/test-stovl.mjs [--port=9661]` real taps, 390×844 portrait (Easy) + 844×390 landscape (Medium), whole
  cycle (VTO → stick nudge → LAND HERE on the runway → DEMAND IT banks + refuels → VTO → FLY ON → HOVER → LAND HERE
  in a field → VTO), button clear of the stick and on screen, screenshots in `docs/shots/stovl/` (plus a non-gating
  gallery: HOVER first away from runways, LAND HERE greyed over the lake). `--falsify=deadvto|cover|noland` must go red.

## Not done
- The farm strip (`?airport=farm`, 620 m grass) and other new airports: the F-35 can already use them by a vertical
  landing (LAND HERE works on any flat clear grass); a later lane could add pads/markings or a VTO-only departure there.
- Online snapshots carry no nozzle/fan state (a remote F-35 hovers with its nozzle aft).
- No AI F-35s fly STOVL. No roll-post nozzles or hot-gas ingestion; the hover lean is the flight computer's, not
  modelled from differential thrust.
