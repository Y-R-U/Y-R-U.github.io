# TASKS — the task grid (D34)

Aaron: "a nice easy to follow task list … a nice grid of tasks to tick off … sets could give additional rewards and some
tasks might be hard to do, including flight time tasks". 171 tasks in 18 sets. Tasks never gate ranks or planes.

## Files
| file | what |
|---|---|
| `data/tasks.js` | every set and task, the counters (`STATS` lifetime, `FSTATS` per flight), landmark geometry (`PLACES`), story mirror (`STORY`), tier PP |
| `js/game/tasks.js` | pure engine (no DOM, no clock) + the live adapter (`attach` / `sample` / `story`); `getTasks()` shared instance |
| `js/ui/tasks.js` | menu button, grid popup, pause-screen link, in-flight tick toast, set-complete card, pilot-card medal |
| `css/tasks.css` | grid styling on the `css/ui.css` variables |
| `tools/tasks-sim.mjs` | node suite: every task completable + fires once, ladders, rewards, save/load, locks; `--falsify` (14 breaks) |
| `tools/test-tasks.mjs` | real game in headless Chrome (real taps): grid at 390×844 / 844×390, a real Free Flight ticks tasks, toast, pause link, set card |

### Hooks in other lanes' files (all marked `// TASKS`)
- `js/core/wiring.js` (5 lines): import `getTasks`; `W.tasks = getTasks({ career })` with main's career; `tasks.attach(...)` at the end
  of `startPlay`; `tasks.detach()` in `endPlay`; `tasks.sample(dt, P, traffic, W.simK || 1)` in `update`.
- `js/main.js` (2 lines): `startMission` passes `onComplete: (r) => wiring.tasks?.story(r)` (story result incl. ticked objectives);
  `frame()` sets `wiring.simK = k` (time warp × `?timescale`) so the flight-time tasks count real play time.
- `js/game/career.js`: `addBonus(pp)` (lifetime PP + rank-up, no sortie/bestSortie side effects). Tasks pay through it;
  `js/story/missions.js` mission bonus too (one line, falls back to `addPP`).
- `js/ui/account.js` (1 line): `'krayzee.tasks'` added to the cloud-sync `keys`.
- `js/ui/index.js` (1 line): `ensureRoot()` dynamically imports `js/ui/tasks.js` and calls `mountTasks(root)`; that module adds the
  Tasks button after the menu grid, a link at the top of the Settings/pause popup, and the medal on the pilot roundel — DOM only.

## Rewards
- Each task pays `TIER_PP`: bronze 100, silver 250, gold 750 PP, through `career.addBonus(pp)`: lifetime PP and rank-ups, but
  not counted as a sortie (`stats.sorties` / `bestSortie` untouched).
- A finished set pays `max(1000, 60 % of its tasks' PP)` once, plus a cosmetic: a badge + epithet ("the Buttery"). The first set
  earned is worn automatically; any earned one can be worn from the grid. The worn badge shows on the menu pilot-card roundel
  and in the grid ("Styled: Dirk the Buttery"). Never spoken on the radio (D1).
- Everything together: 80,200 PP (~31 % of Emperor's 260k), earned over 50+ hours. Tasks can promote you; they never lock anything.

## Persistence
`localStorage['krayzee.tasks']` = `{ v, done:{id:t}, sets:{id:t}, stats, uniq, best, worn, unseen, savedAt }`. Saved on every
completion and counter change, except per-frame counters (air time, distance, inverted, stall, formation, visits) which save
every 15 s of sim and on `detach`. A corrupt save starts fresh. Retro credit at load: missions already `done` in
`krayzee.story` tick their story tasks (and pay) once.
**Cloud sync:** `js/ui/account.js` syncs `'krayzee.tasks'` (`TASKS_KEY`) with the profile, settings and career. `savedAt` is the freshness stamp.

## Events (what the detectors listen to)
The adapter turns the game's existing events into one vocabulary; every event carries `plane`, `diff`, `mode`.
| event | source |
|---|---|
| `infraction {id, amount, frozen}` | `game.on('pp')` with an `INFRACTIONS` id (score.js — the same events that pay PP) |
| `banter {name}` / `impeccable` | `game.on('pp')` ids `banter` (Riposte / Quick Riposte / Do You Know Who I Am) and `impeccable` |
| `combo {mult}` / `banked {amount}` / `finished {amount}` / `destroyed` | `game.on(...)` (DEMAND IT emits banked then finished) |
| `composure {tier, controller}` / `towerScandal {controller}` | `atc.on('composure' / 'scandal')` for the player's meter; controller from the tower voice (`radio.setTower` is wrapped: tower_m Gerald, tower_f Imogen, tower_trainee Toby) |
| `bark` | `radio.on('barked')` |
| `touchdown {fpm, grade, surface, runway, crash, fuel}`, `crash`, `tailstrike`, `fuelempty`, `bounce` | the player's `ac.events`, **read only** (main.js still consumes them); `runway` from `RUNWAYS` rects |
| `hover {dt, run}` | D35: the F-35B jet-borne (`ac.vtol > 0.5`) and under 15 kt; `run` = seconds of this unbroken hover (real time). `touchdown.vertical` = the landing was jet-borne (LAND HERE / let down) |
| `takeoff {surface, fromField}` | ground → air transition; `fromField` = the last touchdown was off pavement > 150 m from any runway and the take-off left from off pavement (covers DEMAND TAKEOFF's field run and its hop) |
| `air {dt, dist, alt, speedKt, vne}`, `inverted {dt, run}` (|bank| > 120°), `stall {dt, run}` (speed < 1.03·Vs + 3 kt, > 30 m AGL — the stall-hum condition), `formation {dt}` (another airborne plane < 50 m), `visit {place, low}` | sampled each frame. **Time counters (`air.dt`, inverted, stall, formation) are REAL play time**: sim dt ÷ main's `simK` (D18 warp × `?timescale`), so ×5 warp never shortcuts the hours ladder. Distance is as flown (sim). |
| `story {ok, mission, diff, ticks}` | `startMission`'s `onComplete` + retro from `krayzee.story` |
A "flight" (per-flight counters) starts at play start, after DEMAND IT, and after being destroyed; the best flight is kept.

## Sets

### 🛬 Wheels, Mostly Down (9) · set bonus +1,300 PP · badge "the Well-Landed"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `touch_down` | 🛬 Touch Down | bronze | 100 | Land anywhere. The ground was expecting you. | `touchdown` + condition |
| `gentle` | 🪶 Gentle Giant | bronze | 100 | Touch down under 250 fpm. | `touchdown` + condition |
| `butter` | 🧈 Butter Fingers | silver | 250 | Touch down under 100 fpm. The runway barely noticed. | `touchdown` + condition |
| `firm` | 🔨 Arrive With Conviction | bronze | 100 | A firm 500–800 fpm arrival, and walk away from it. | `touchdown` + condition |
| `boing` | 🏀 Boing! | bronze | 100 | Bounce off something. ImpossiRubber forgives everything. | `bounce` |
| `hat_trick` | 🎩 Hat-Trick | silver | 250 | Three landings in one flight. Touch-and-goes count. | one flight: `landings` ≥ 3 |
| `crosswind` | 🌬️ Crosswind Cad | silver | 250 | Touch down on the crosswind runway, 04/22. | `touchdown` + condition |
| `deadstick` | 🪂 Glide of Shame | gold | 750 | Land with the tank bone dry. Gliding counts as flying. | `touchdown` + condition |
| `textbook` | 📏 Textbook, Somehow | silver | 250 | An Impeccable landing: cleared, on the centreline, early and gentle. | `impeccable` |

### 🧈 The Landing Ledger (8) · set bonus +2,200 PP · badge "the Buttery"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `land_10` | 📒 Frequent Lander | bronze | 100 | Land 10 times. | stat `landings` ≥ 10 |
| `land_50` | 🎫 Season Ticket | silver | 250 | Land 50 times. | stat `landings` ≥ 50 |
| `land_200` | 🏠 Runway Resident | gold | 750 | Land 200 times. The grass knows your name. | stat `landings` ≥ 200 |
| `takeoff_25` | 🛫 Up, Up and Away | bronze | 100 | Take off 25 times. | stat `takeoffs` ≥ 25 |
| `takeoff_250` | 🚀 Perpetual Departure | gold | 750 | Take off 250 times. | stat `takeoffs` ≥ 250 |
| `butter_10` | 🐄 Dairy Monarch | gold | 750 | Ten landings under 100 fpm. | stat `butters` ≥ 10 |
| `impeccable_10` | 📐 By the Book, Ten Times | gold | 750 | Ten Impeccable landings. Gerald may weep. | stat `impeccables` ≥ 10 |
| `five_in_one` | 🍽️ Touch-and-Go Gourmand | silver | 250 | Five landings in a single flight. | one flight: `landings` ≥ 5 |

### 🚧 Rule-Breaker: The Ground (12) · set bonus +2,000 PP · badge "the Unqueued"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `rule_queue_jump` | 🚶 Pushed In | bronze | 100 | Enter the runway with somebody still waiting ahead of you. | `infraction` + condition |
| `rule_unauth_takeoff` | 🙊 Didn't Ask | bronze | 100 | Take off without being cleared. Asking is for commoners. | `infraction` + condition |
| `rule_runway_steal` | 🦹 Runway Thief | silver | 250 | Pinch the runway from someone on their take-off roll or short final. | `infraction` + condition |
| `rule_taxiway_landing` | 🛣️ Taxiway Touchdown | silver | 250 | Land on a taxiway. It is a runway if you believe in it. | `infraction` + condition |
| `rule_grass_landing` | 🌾 Country Squire | bronze | 100 | Land on the grass and live. | `infraction` + condition |
| `rule_apron_landing` | 🅿️ Valet Parking | silver | 250 | Land on the apron, right by the terminal doors. | `infraction` + condition |
| `rule_wrong_way` | 🔄 Wrong Way, Your Grace | silver | 250 | Land or take off against the active runway direction. | `infraction` + condition |
| `rule_closed_runway` | 🚧 Private Runway | silver | 250 | Land on a closed runway. Zero-four is "resurfacing". | `infraction` + condition |
| `rule_taxi_speeding` | 🏎️ Taxi Speeding | bronze | 100 | Taxi over 30 kt for two seconds. Wheee. | `infraction` + condition |
| `rule_stand_steal` | 🪑 Stand Steal | silver | 250 | Park on another aircraft's stand. | `infraction` + condition |
| `rule_double_occupancy` | 👯 Shared Runway | gold | 750 | Share a runway with a plane doing over 40 kt. | `infraction` + condition |
| `rule_intersection_dash` | ➕ Crossroads | gold | 750 | Dash through the 09/27 × 04/22 crossing while either runway is busy. | `infraction` + condition |

### 📜 Rule-Breaker: The Sky (9) · set bonus +1,000 PP · badge "the Unruly"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `rule_cut_in_final` | ✂️ Cut In | bronze | 100 | Cut in ahead of someone sequenced before you on final. | `infraction` + condition |
| `rule_forced_goaround` | ↩️ Sent Round | silver | 250 | Make the tower send a commoner round. | `infraction` + condition |
| `rule_tower_buzz` | 🗼 Tower Buzz | bronze | 100 | Buzz the control tower. The owls will cope. | `infraction` + condition |
| `rule_terminal_buzz` | 🪟 Window Rattler | bronze | 100 | Rattle the terminal windows from under 40 m. | `infraction` + condition |
| `rule_low_pass` | 🎺 Royal Flypast | silver | 250 | A royal flypast: down the runway, 1 to 6 m up, fast, no touching. | `infraction` + condition |
| `rule_formation` | 🦆 Uninvited Formation | silver | 250 | Fly in uninvited formation (within 40 m) for three seconds. | `infraction` + condition |
| `rule_near_miss` | 😬 Near Miss | silver | 250 | Pass within 25 m of another aircraft. Without touching. | `infraction` + condition |
| `rule_ignored_instruction` | 🙉 Selective Hearing | bronze | 100 | Ignore a go-around. Selective hearing is hereditary. | `infraction` + condition |
| `rule_light_touch` | 💋 Close Call | silver | 250 | Swap paint gently with another aircraft: a Close Call. | `infraction` + condition |

### ⛓️ Habitual Offender (9) · set bonus +2,400 PP · badge "the Incorrigible"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `inf_10` | 😈 Bad Influence | bronze | 100 | Break 10 rules. | stat `infractions` ≥ 10 |
| `inf_100` | 📇 Known to the Tower | silver | 250 | Break 100 rules. | stat `infractions` ≥ 100 |
| `inf_500` | 🖼️ Wanted Poster | gold | 750 | Break 500 rules. | stat `infractions` ≥ 500 |
| `inf_2000` | ☠️ Menace to Aviation | gold | 750 | Break 2,000 rules. Questions are asked in Parliament. | stat `infractions` ≥ 2000 |
| `combo_2` | 🔥 Spree | silver | 250 | Chain rule-breaks to a ×2 combo. | stat `maxCombo` ≥ 2 |
| `combo_25` | 🌋 Crime Wave | gold | 750 | Reach the ×2.5 combo cap. | stat `maxCombo` ≥ 2.5 |
| `variety` | 🎭 Variety Act | silver | 250 | Five different rules broken in one flight. | one flight: `rules` ≥ 5 |
| `rap_sheet` | 📜 Full Rap Sheet | gold | 750 | Break all 21 rules at least once. | stat `rules` ≥ 21 |
| `frozen` | 📸 Nothing Counts | bronze | 100 | Break a rule while the press are watching (after a scandal). | `infraction` + condition |

### ☕ Tower Torment (8) · set bonus +2,000 PP · badge "Bane of Towers"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `strained` | 😐 Mildly Strained | bronze | 100 | Push the tower to Strained. | `composure` + condition |
| `cracking` | 😖 Cracking Up | silver | 250 | Push the tower to Cracking. | `composure` + condition |
| `meltdown` | 🤯 Meltdown | gold | 750 | Push the tower to full Meltdown. | `composure` + condition |
| `lie_down` | 🛌 Gone for a Lie-Down | gold | 750 | Max out the tower: a Royal Scandal. They need a moment. | `towerScandal` |
| `resign_5` | 📨 Serial Resignations | gold | 750 | Five Royal Scandals. HR has a folder with your name on. | stat `towerQuits` ≥ 5 |
| `crack_gerald` | 🦉 The Owls Are Shaking | silver | 250 | Crack Gerald Calloway (Cracking or worse). | `composure` + condition |
| `crack_imogen` | 🧊 Frost Thaws | silver | 250 | Crack Imogen Frost, who has never raised her voice. | `composure` + condition |
| `crack_toby` | 🗂️ Laminated Card, Torn | silver | 250 | Crack young Toby Wren. He thought you were wonderful. | `composure` + condition |

### 🗯️ Back-Chat (8) · set bonus +1,100 PP · badge "the Unanswerable"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `riposte` | 💬 Riposte | bronze | 100 | Answer back on the radio inside the reply window. | `banter` |
| `quick` | ⚡ Quick Riposte | bronze | 100 | Answer back within two seconds. | `banter` + condition |
| `quick_10` | 🤺 Rapier Wit | silver | 250 | Ten Quick Ripostes. | stat `quick` ≥ 10 |
| `dykwia` | 👑 Do You Know Who I Am | bronze | 100 | Pull rank on the tower: the priority reply. | `banter` + condition |
| `dykwia_10` | 📣 They Know Now | silver | 250 | Ask the tower who you are, ten times. | stat `dykwia` ≥ 10 |
| `riposte_25` | 🎙️ Last Word | silver | 250 | 25 ripostes of any kind. | stat `ripostes` ≥ 25 |
| `riposte_100` | 📻 Never Off Air | gold | 750 | 100 ripostes. You have a radio show now. | stat `ripostes` ≥ 100 |
| `barks_50` | 🦜 Chatterbox | bronze | 100 | Say 50 things on the radio. | stat `barks` ≥ 50 |

### 🎯 Close Calls (8) · set bonus +2,100 PP · badge "the Uncomfortably Close"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `nm_10` | 😅 Near Miss Collector | silver | 250 | 10 near misses. | stat `nearMiss` ≥ 10 |
| `nm_50` | 🫣 Statistically Improbable | gold | 750 | 50 near misses. | stat `nearMiss` ≥ 50 |
| `touch_10` | 🎨 Paint Swapper | silver | 250 | 10 contact Close Calls. | stat `touches` ≥ 10 |
| `cc_25` | 🍀 Lucky Charm | silver | 250 | 25 close calls of any kind: misses, touches, formation. | stat `closeCalls` ≥ 25 |
| `form_30` | 🪿 Wingman Nobody Asked For | silver | 250 | 30 seconds within 50 m of another aircraft, in one flight. | one flight: `formSecs` ≥ 30 |
| `form_300` | 🦢 Close Company | gold | 750 | Five minutes of uninvited formation, all told. | stat `formSecs` ≥ 300 |
| `hard_nm` | 🎲 Real Nerve | silver | 250 | A near miss on Hard. | `infraction` + condition |
| `hard_touch` | 🔩 Real Metal, Real Nerve | gold | 750 | Touch another aircraft on Hard and survive it. | `infraction` + condition |

### 🏰 Royal Tourist (10) · set bonus +1,400 PP · badge "the Sightseer"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `castle` | 🏰 Castle Call | bronze | 100 | Fly over the castle, under 150 m. | `visit` + condition |
| `church` | ⛪ Church Bells | bronze | 100 | Fly over the village church, under 100 m. | `visit` + condition |
| `village` | 🏘️ Village Fête | bronze | 100 | Fly over the village, under 80 m. | `visit` + condition |
| `lake` | 🦆 Duck Pond | bronze | 100 | Fly over the lake, under 40 m. | `visit` + condition |
| `castle_low` | ⚔️ Battlements | silver | 250 | Over the castle, under 30 m. Mind the flag. | `visit` + condition |
| `church_low` | 🔔 Steeple Chase | silver | 250 | Over the church, under 30 m. The Bishop ducks. | `visit` + condition |
| `village_low` | 🧹 Chimney Sweep | silver | 250 | Over the village rooftops, under 30 m. | `visit` + condition |
| `terminal_low` | 🧽 Window Cleaner | silver | 250 | Over the terminal, under 40 m. Mind the roof. | `visit` + condition |
| `lake_low` | 🌊 Wet Wheels | silver | 250 | Over the lake, under 5 m. | `visit` + condition |
| `grand_tour` | 🗺️ Grand Tour | gold | 750 | Castle, church, village, lake and terminal in one flight. | one flight: `visits` ≥ 5 |

### ⏳ The Long Reign (10) · set bonus +2,200 PP · badge "the Long-Reigning"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `air_30m` | ⏱️ Elevenses Aloft | bronze | 100 | 30 minutes airborne in all. | stat `airSecs` ≥ 1800 |
| `air_2h` | 🕰️ Afternoon Off | silver | 250 | 2 hours airborne in all. | stat `airSecs` ≥ 7200 |
| `air_5h` | 🌅 Weekend Warrior | silver | 250 | 5 hours airborne in all. | stat `airSecs` ≥ 18000 |
| `air_10h` | 🌙 Never Lands | gold | 750 | 10 hours airborne in all. | stat `airSecs` ≥ 36000 |
| `air_50h` | ♾️ The Long Reign | gold | 750 | 50 hours airborne. Long may you reign. | stat `airSecs` ≥ 180000 |
| `dist_100` | 🧭 Grand Constitutional | bronze | 100 | Fly 100 km in all. | stat `distM` ≥ 100000 |
| `dist_1000` | 🌍 Royal Progress | silver | 250 | Fly 1,000 km in all. | stat `distM` ≥ 1000000 |
| `dist_10000` | 🛰️ Circumnavigator (Allegedly) | gold | 750 | Fly 10,000 km in all. Round and round C-Tower 1. | stat `distM` ≥ 10000000 |
| `endurance` | 🫖 Endurance Peer | silver | 250 | 20 minutes airborne without touching the ground. | one flight: `hopSecs` ≥ 1200 |
| `lofty` | ☁️ Above the Riff-Raff | silver | 250 | Climb to 5,000 ft. | stat `maxAlt` ≥ 1524 |

### 🛁 Hangar: The Classics (8) · set bonus +1,200 PP · badge "of the Bathtub"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `fly_c172` | 🛩️ Royal Runabout | bronze | 100 | Take off in the Royal Runabout. | `takeoff` + condition |
| `fly_tiger` | 🦋 Grandfather's Moth | bronze | 100 | Take off in Grandfather's Moth. | `takeoff` + condition |
| `fly_bathtub` | 🛁 Royal Flying Bathtub | bronze | 100 | Take off in the Royal Flying Bathtub. | `takeoff` + condition |
| `tiger_grass` | 🌿 Proper Aviator | silver | 250 | Land the Moth on grass, as God intended. | `touchdown` + condition |
| `tub_butter` | 🫧 Bubble Bath | silver | 250 | Land the Bathtub under 100 fpm. | `touchdown` + condition |
| `tub_hour` | 🦆 Bath Time | gold | 750 | One hour airborne in the Bathtub. | stat `tubSecs` ≥ 3600 |
| `moth_30` | 🧣 Grandfather Approves | silver | 250 | 30 minutes airborne in the Moth. | stat `mothSecs` ≥ 1800 |
| `c172_25` | 🔑 Runabout Regular | silver | 250 | Land the Runabout 25 times. | stat `c172Landings` ≥ 25 |

### ✈️ Hangar: Heavy Metal (12) · set bonus +3,900 PP · badge "the Heavy"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `fly_jumbo` | ✈️ Royal Jumbo | silver | 250 | Take off in the Royal Jumbo. | `takeoff` + condition (locked until `jumbo` is ready) |
| `land_jumbo` | 🛬 Jumbo, Down | silver | 250 | Land the Jumbo in one piece. | `touchdown` + condition (locked until `jumbo` is ready) |
| `butter_jumbo` | 🧁 Four Hundred Tonnes of Butter | gold | 750 | Land the Jumbo under 200 fpm. | `touchdown` + condition (locked until `jumbo` is ready) |
| `buzz_jumbo` | 🦉 The Owls Evacuate | gold | 750 | Buzz the tower in the Jumbo. | `infraction` + condition (locked until `jumbo` is ready) |
| `fly_herc` | 🪖 The Royal Wardrobe | silver | 250 | Take off in the Royal Wardrobe, the Hercules. | `takeoff` + condition (locked until `herc` is ready) |
| `herc_grass` | 🥔 Tactical Turnip | gold | 750 | Land the Wardrobe on grass. | `touchdown` + condition (locked until `herc` is ready) |
| `fly_f35` | ⚡ Royal Tantrum | silver | 250 | Take off in the Royal Tantrum, the F-35. | `takeoff` + condition (locked until `f35` is ready) |
| `f35_fast` | 💨 Sound Barrier-ish | gold | 750 | Exceed 450 kt in the Tantrum. | `air` + condition (locked until `f35` is ready) |
| `f35_flypast` | 🎆 Afterburner Flypast | gold | 750 | A royal flypast down the runway in the Tantrum. | `infraction` + condition (locked until `f35` is ready) |
| `f35_hover` | 🐝 Hummingbird | silver | 250 | Hover the Tantrum for 30 seconds in one go. | `hover` run ≥ 30 s (D35) |
| `f35_vfield` | 🥕 Turnip Pad | gold | 750 | Land the Tantrum vertically in a field. | `touchdown` + `vertical` on grass (D35) |
| `f35_vhard` | 🎯 Straight Down, Real Metal | gold | 750 | Land the Tantrum vertically on Hard. | `touchdown` + `vertical`, diff hard (D35) |

### 🎪 Hangar: Show-Offs (12) · set bonus +2,800 PP · badge "the Showman"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `fly_cub` | 🧈 Butter Cub | bronze | 100 | Take off in the Butter Cub. | `takeoff` + condition |
| `cub_lawn` | 🌱 Croquet, Anyone? | gold | 750 | Land the Cub on the Palace Lawn. | `touchdown` + condition |
| `cub_short` | 📏 Stop on a Sixpence | silver | 250 | Land the Cub and stop within 100 m of touching down. | `stopped` + condition |
| `cub_farm` | 🐑 Mind the Ewes | silver | 250 | Land the Cub on the grass at Muckle Bottom. | `touchdown` + condition |
| `fly_pitts` | 🎪 Show-Off | bronze | 100 | Take off in the Show-Off. | `takeoff` + condition |
| `pitts_snap` | 🌪️ Snap Roll | silver | 250 | A full roll in the Pitts in under 2 seconds. | `roll` + condition |
| `pitts_10` | 🎡 Ten in a Row | gold | 750 | Ten full rolls in the Pitts in one flight. | fstat `pittsRolls` ≥ 10 |
| `pitts_inv` | 🙃 Upside-Down Tea | silver | 250 | Ten seconds inverted in the Pitts, in one go. | `inverted` + condition |
| `fly_throne` | 🪑 Divine Right | silver | 250 | Take off in the flying throne. | `takeoff` + condition |
| `throne_hover` | 👑 Holding Court | silver | 250 | Hover the throne for 30 seconds in one go. | `hover` + condition |
| `throne_vgrass` | 🌼 Enthroned on the Lawn | gold | 750 | Land the throne vertically on grass. | `touchdown` + condition |
| `throne_hard` | ⚖️ Heavy Is the Head | gold | 750 | Hover the throne on Hard. | `hover` + condition |

### 🛡️ Trial by Difficulty (8) · set bonus +2,200 PP · badge "the Hardened"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `finish_easy` | 🐣 Easy Does It | bronze | 100 | DEMAND IT to finish a flight on Easy. | `finished` + condition |
| `finish_medium` | 🍳 Medium Rare | bronze | 100 | Finish a flight on Medium. | `finished` + condition |
| `finish_hard` | 🔩 Real Metal | silver | 250 | Finish a flight on Hard. | `finished` + condition |
| `medium_2000` | 🥩 Well Done | silver | 250 | Bank 2,000 PP in one flight on Medium. | `banked` + condition |
| `hard_1000` | 💎 Hard Currency | gold | 750 | Bank 1,000 PP in one flight on Hard. | `banked` + condition |
| `hard_5000` | 🏦 Hard Cash | gold | 750 | Bank 5,000 PP in one flight on Hard. | `banked` + condition |
| `hard_10` | ⚙️ Ten Real Ones | gold | 750 | Finish 10 flights on Hard. | stat `hardFinishes` ≥ 10 |
| `iron_peer` | 🗡️ Iron Peer | gold | 750 | Five Hard finishes in a row without being destroyed. | stat `hardStreak` ≥ 5 |

### 👑 The Peerage (11) · set bonus +2,000 PP · badge "of the Peerage"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `story_1` | 📖 Letters Patent | silver | 250 | Complete Mission 1, "Letters Patent". | `story` + condition |
| `story_1_all` | 🏅 Letters Patent: Full Marks | silver | 250 | Tick every objective in Mission 1. | `story` + condition |
| `story_2` | 📖 The Pomfrey-Smythe Welcome | silver | 250 | Complete Mission 2, "The Pomfrey-Smythe Welcome". | `story` + condition |
| `story_2_all` | 🏅 The Pomfrey-Smythe Welcome: Full Marks | silver | 250 | Tick every objective in Mission 2. | `story` + condition |
| `story_3` | 📖 Queue Is a Commoner's Word | silver | 250 | Complete Mission 3, "Queue Is a Commoner's Word". | `story` + condition |
| `story_3_all` | 🏅 Queue Is a Commoner's Word: Full Marks | silver | 250 | Tick every objective in Mission 3. | `story` + condition |
| `story_4` | 📖 The Castle Cup | silver | 250 | Complete Mission 4, "The Castle Cup". | `story` + condition |
| `story_4_all` | 🏅 The Castle Cup: Full Marks | silver | 250 | Tick every objective in Mission 4. | `story` + condition |
| `story_5` | 📖 Cream Tea at Muckle Bottom | silver | 250 | Complete Mission 5, "Cream Tea at Muckle Bottom". | `story` + condition |
| `story_5_all` | 🏅 Cream Tea at Muckle Bottom: Full Marks | silver | 250 | Tick every objective in Mission 5. | `story` + condition |
| `story_hard` | 🎖️ Peer of the Realm | gold | 750 | Complete any mission on Hard. | `story` + condition |

### ⚜️ The Coronation (11) · set bonus +2,300 PP · badge "the Crowned"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `story_6` | 📖 The Royal Wardrobe | silver | 250 | Complete Mission 6, "The Royal Wardrobe". | `story` + condition |
| `story_6_all` | 🏅 The Royal Wardrobe: Full Marks | silver | 250 | Tick every objective in Mission 6. | `story` + condition |
| `story_7` | 📖 Not Till That Jet Learns to Hover | silver | 250 | Complete Mission 7, "Not Till That Jet Learns to Hover". | `story` + condition |
| `story_7_all` | 🏅 Not Till That Jet Learns to Hover: Full Marks | silver | 250 | Tick every objective in Mission 7. | `story` + condition |
| `story_8` | 📖 The Owls Evacuate | silver | 250 | Complete Mission 8, "The Owls Evacuate". | `story` + condition |
| `story_8_all` | 🏅 The Owls Evacuate: Full Marks | silver | 250 | Tick every objective in Mission 8. | `story` + condition |
| `story_9` | 📖 Please Do Come | silver | 250 | Complete Mission 9, "Please Do Come". | `story` + condition |
| `story_9_all` | 🏅 Please Do Come: Full Marks | silver | 250 | Tick every objective in Mission 9. | `story` + condition |
| `story_10` | 👑 Coronation Day | gold | 750 | Finish the story: win the Royal Bathtub Derby and be crowned. | `story` + condition |
| `story_10_all` | 🏅 Coronation Day: Full Marks | silver | 250 | Tick every objective in Mission 10. | `story` + condition |
| `story_crowned_hard` | 🛁 Crowned in Real Metal | gold | 750 | Win the Royal Bathtub Derby and be crowned, on Hard. | `story` + condition |

### 🥕 Royal Eccentricities (10) · set bonus +2,400 PP · badge "the Eccentric"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `turnip_hop` | 🥕 Turnip Hop | gold | 750 | Land in a field, then DEMAND TAKEOFF straight out of it. | `takeoff` + condition |
| `topsy` | 🙃 Topsy-Turvy | silver | 250 | Five seconds upside down, in one go. | `inverted` + condition |
| `upside_60` | 🌀 Antipodean Monarch | gold | 750 | A full minute upside down in a single flight. | one flight: `invSecs` ≥ 60 |
| `hum_along` | 🎵 Hum Along | gold | 750 | Ride the edge of the stall for ten seconds straight. | `stall` + condition |
| `parachute` | 🪂 It Was Like That When I Found It | bronze | 100 | Get yourself destroyed. Real metal is real. | `destroyed` |
| `insurance` | 🧾 Insurance Nightmare | silver | 250 | Be destroyed 10 times. | stat `destroyed` ≥ 10 |
| `fumes` | ⛽ Running on Fumes | bronze | 100 | Run the tank dry in the air. | `fuelempty` |
| `rubber_baron` | 🎈 Rubber Baron | silver | 250 | Bounce 20 times. | stat `bounces` ≥ 20 |
| `tailstrike` | 🐕 Tail Between Your Legs | bronze | 100 | Scrape the tail on the runway. | `tailstrike` |
| `vne` | 🏁 Never Exceed? Never Heard of It | gold | 750 | Go faster than your aircraft's never-exceed speed. | `air` + condition |

### 💰 Points & Plunder (8) · set bonus +1,900 PP · badge "the Loaded"

| id | task | tier | PP | what | detector |
|---|---|---|---|---|---|
| `bank_500` | 🪙 Pocket Money | bronze | 100 | Bank 500 PP in one flight. | `banked` + condition |
| `bank_2000` | 💷 Lucrative Afternoon | silver | 250 | Bank 2,000 PP in one flight. | `banked` + condition |
| `bank_10000` | 💰 Royal Haul | gold | 750 | Bank 10,000 PP in one flight. | `banked` + condition |
| `life_25k` | 🏛️ Comfortably Off | silver | 250 | Bank 25,000 PP from flights in all. | stat `bankedPP` ≥ 25000 |
| `life_100k` | 🏰 Landed Gentry | gold | 750 | Bank 100,000 PP from flights in all. | stat `bankedPP` ≥ 100000 |
| `life_500k` | 🐉 Hoard | gold | 750 | Bank 500,000 PP from flights in all. A dragon would blush. | stat `bankedPP` ≥ 500000 |
| `finish_10` | ✋ Demanded It | bronze | 100 | Finish 10 flights with DEMAND IT. | stat `finishes` ≥ 10 |
| `finish_100` | 🫅 Demanded It, Habitually | silver | 250 | Finish 100 flights with DEMAND IT. | stat `finishes` ≥ 100 |

## UI
- Menu: a full-width **✓ TASKS n/143** button under the 2×2 grid; a red dot while there are ticks you have not looked at.
- Grid popup (`.kz-tasks`): totals + bar, logbook line (time aloft, km, landings, rules), regalia chips (tap to wear), All / To do
  / Done filter, then one section per set (badge, name, reward or "✓ Complete", n/total) with tiles: icon, name, tier stripe
  (bronze/silver/gold), progress bar for counted tasks, PP. Tap a tile: a one-line description in the footer with tier,
  progress ("12 / 50", "1 h 5 min / 2 h", "best flight") and PP. Planes not yet `status: 'ready'` show 🔒 SOON tiles.
- Pause: "✓ TASKS n/143 ›" at the top of the Settings popup opens the same grid above it.
- In flight: a small pill "✓ Butter Fingers +250 PP", 2 s, queued, under the score at the left edge; it slides down past any
  visible HUD (strip, AP pill, axis chips, banner, subtitles, tower badge, warp chip) and never takes a tap. Held while a
  popup is open; dropped (the menu dot carries it) on quit.
- Set complete: a centred card (badge, +bonus, epithet, Wear it / Splendid, auto-closes after 9 s) shown only when parked
  (on the ground, < 1 m/s) or in the menu.

## Tests
```
node tools/tasks-sim.mjs            # 98 assertions, ~2 s
node tools/tasks-sim.mjs --falsify  # 17 breaks in scratch copies; each must fail the suite (~3 min)
node tools/test-tasks.mjs [--port=9671] [--url=http://127.0.0.1:8889/gms/3d/krayzee/]   # real game, 48 checks, ~4 min
```
Shots: `docs/shots/tasks/`.

## Notes / limits
- Landmarks are C-Tower 1 only (`PLACES`). New airports need their own entries (or a per-airport table).
- `STORY` mirrors mission ids/objective ids from `data/story/mission*.js` (those modules import three, so node can't load
  them); add a row when a mission is added. tasks-sim reads the mission files as text and fails if the mirror drifts.
  Missions 1–5 feed The Peerage, 6–10 The Coronation (a set holds 8–12 tasks); `finale: true` marks the coronation.
- Roster rows (Show-Offs) use three events the live adapter now makes: `touchdown` carries `airport` and `lawn` (the
  Palace Lawn strip, data/airports/palace.js LAWN), `stopped {rollM}` (touchdown to stop), `roll {secs}` (360° of bank one way);
  FSTATS `pittsRolls`. The tasks CONTROLLER maps `tower_raf` → imogen and `tower_farm` → mudge.
- Heavy Metal ids are `jumbo`, `herc`, `f35`; they unlock when `data/aircraft.js` marks them `status: 'ready'`.
