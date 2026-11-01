# SKYPUTT — Master plan

Working title **SKYPUTT**. A 3D mini golf game for phones first (portrait), with themes, a career
story from nobody to pro, helpers and power-ups, seasonal events, ladders, and online rooms.
Folder `gms/3d/skyputt/`. Live on GitHub Pages at https://yru.br8t.com/gms/3d/skyputt/.
Refs in `refs/`: Sky Isles (launch theme), the same hole reskinned for Christmas, and a Halloween hole.

Aaron, 2026-11-02: "Use or ignore the image as you want, you can be inspired by other things."

## 1. The feel we want
- One thumb. Drag back from the ball like a slingshot, release to putt. Short guide line that
  shows the first stretch of the path (and the first bounce). Helpers lengthen it.
- Courses are winding fairways on floating islands, with gold-trimmed stone walls, loops,
  glass tubes, windmills, ramps, bridges, gaps to jump, crystals to collect, and a cup with a flag.
- The camera sits behind and above the ball looking down the fairway (like the refs). The player
  can pinch to zoom out and drag to look along the hole before shooting. A "view hole" fly-over plays
  at the start of each hole (skippable).
- Satisfying: ball roll sound, wall clinks, cup rattle, confetti, "HOLE IN ONE!" moments.

## 2. Game systems

### 2.1 Physics (own engine, deterministic)
- Fixed step (240 Hz), pure JS, no physics library. Ball = sphere. Course = static triangle
  colliders built from the same geometry as the visuals, plus kinematic obstacles (windmill blades,
  moving platforms, rotating bumpers) whose pose is a pure function of time.
- Rolling friction per surface (grass, sand, ice, sticky, boost pad), wall restitution per material,
  slopes, loops (the ball must carry enough speed), tubes, jumps, water / falling off = +1 stroke and
  return to the last resting spot.
- Same input → same result on the same device. That gives cheap ghost replays (store the shot list
  and the obstacle clock) and lets the AI plan by simulating candidate shots.
- Headless node tests for the physics (`tools/`).

### 2.2 Holes and courses
- A hole is data: a centre-line spline with width, height, bank, and wall flags per point, plus
  features placed along it (loop, tube, windmill, bumper, ramp, gap, sand, water, boost, crystals),
  the tee and the cup. A builder sweeps the spline into floor + wall + trim meshes and colliders.
- **Holes are theme-independent.** A theme skins any hole (the Christmas ref is the Sky Isles hole
  reskinned). That is how seasonal events reuse holes cheaply.
- A course = 9 (later 18) holes with par per hole. Stars per hole: 1 = finished, 2 = par or better,
  3 = under par. Crystals on the fairway are bonus coins.

### 2.3 Themes
Launch theme **Sky Isles** (ref 1). Then **Spooky Hollow** (Halloween), **Frost Fair** (Christmas /
winter), and later Candy Land, Volcano Forge, Sunken Reef, Star Station, Jungle Temple.
A theme = materials (grass, wall, trim, tee, cup), obstacle skins (windmill, loop, tube...), the
island rock under the course, skybox and lighting, backdrop set pieces (castle, airship, waterfalls)
and ambient sound and music. Themes are procedural Three.js (no downloaded models), like GAMBIT.

### 2.4 Helpers and power-ups
Earned from story, events, ladders and chests. Consumed per use. Stackable where it makes sense.
- **Long Sight**: the guide line gets longer. Stack 2–3 to see further and show a second bounce.
- **Mulligan**: retake the last shot, no stroke.
- **Magnet Cup**: the cup pulls the ball in from a wider radius for one shot.
- **Steady Hands**: slows windmills and moving obstacles for one shot.
- **Sticky Ball**: less bounce off walls for one shot.
- **Power Tee**: a little extra power cap for one shot (long carries over gaps).
- **Bumper Guard**: temporary rails on open edges for one shot, so the ball can't fall off.
- **Ghost Ball**: pass through one obstacle.
Cosmetics (not power): ball skins, trails, cup-in effects, putter colours.

### 2.5 Story mode — "Nobody to Pro"
You start as an unknown who putts at the rundown Sky Isles municipal course. A coach character
(Old Mags, the retired champion who runs the snack hut) takes you on.
- Chapters = tours: **Muni** → **Club** → **Regional Cup** → **National Tour** → **World Tour** → **Legends**.
- Each chapter: a few lesson holes (teaching a mechanic or a helper), course rounds with star
  targets, a rival you beat in head-to-head ghost matches, and a tournament against a field of AI
  golfers with a final leaderboard.
- Rivals have personalities (see 2.6). Beating one unlocks the next tour, a cosmetic and a helper pack.
- Short dialogue cards between events (portrait plus a few lines); no cut-scene videos needed.
- Your profile: name, rank title (Nobody → Amateur → Club Player → Semi-pro → Pro → Legend), trophies.

### 2.6 Ghost AIs
- An AI golfer = a skill rating plus a personality:
  - **Careful Carl** lays up safely.
  - **Big Bertha** blasts power shots and takes risky carries.
  - **Banks** loves wall bank shots.
  - **Lucky Lou** is erratic but sometimes brilliant.
  - **The Pro** is near optimal.
- Planner: simulate many candidate shots with the physics engine (web worker), score by result,
  pick using personality weights, add aim and power noise scaled by skill. Their balls play as
  translucent ghosts on the same hole.

### 2.7 Ladders and competitions
- **Weekly ladder** (local first, like GAMBIT's bot ladder): a table of generated players plus you.
  Ladder points come from playing rounds; better scores, harder courses and streaks earn more.
  Tiers (Bronze → Silver → Gold → Platinum → Diamond → Legend) with tier rewards at week end.
  The more you play, the higher you go (Aaron confirmed). No real-money ranking.
- **Event ladders**: each special event has its own ladder and goal track ("sink 20 hole-in-ones",
  "collect 300 candy canes", "finish all 9 under par") with rewards by milestone and by final rank,
  inside a time window.
- Later, with the server: a global ladder of real players.

### 2.8 Special events
Data-driven, dated. Each event names a theme skin, a set of holes, goals with rewards, an event
currency (pumpkins, candy canes), an event ladder, and start/end dates. Halloween and Christmas
first. Works offline from the bundled schedule; the server can publish new events later.

### 2.9 Online
Go + SQLite server like GAMBIT's (`server/`), behind Caddy on br8t.com. **Not deployed until Aaron okays it.**
- Rooms: private (code to invite friends) or public (global list), quick play.
- Room options: hole count / course / theme, max players, helpers mode (**off**, **everyone starts
  with X of each**, **own inventory**), shot clock, and **fill with ghost AIs** (choose
  personality and rank).
- Everyone plays the same hole at the same time; other players' balls appear as live ghosts
  (the server relays shot inputs and results). Scoreboard after each hole.
- Client-reported results, so the same "no cheat detection yet" warning as GAMBIT.
- Accounts via the shared `/lib/auth/`, progress cloud sync, allowance via br8t-payments like GAMBIT.

### 2.10 Economy
Coins (earned in play, crystals on holes) buy helpers and cosmetics in a shop. Chests from
stars, events and ladders hold helpers. Everything is earnable by playing. No real-money purchases
are planned beyond the existing BR8T Pass (which could, say, double daily chest rewards); that is Aaron's call.

## 3. Milestones (commit and push at each so Aaron can play on Pages)
- **M1 First putt.** Engine and physics, the hole builder, aim with a short guide line, camera,
  hole flow, scorecard, and 3 Sky Isles holes on mobile. Greybox is OK, with the Sky Isles look coming in.
- **M2 Sky Isles front nine.** 9 holes, stars, crystals and coins, sound, hole fly-over, menus,
  settings, first helpers (Long Sight, Mulligan), save progress.
- **M3 Story chapter 1.** Coach, Muni tour, first rival, ghost AI planner, tournament.
- **M4 Themes and events.** Spooky Hollow and Frost Fair skins, the event framework, and the
  Halloween/Christmas events.
- **M5 Ladder and shop.** Weekly ladder, tiers, chests, all helpers, cosmetics.
- **M6 Online.** Server, rooms, ghost AI fill, helpers modes (deploy only after Aaron's OK).
- **M7 More.** Story chapters 2–6, more themes, a back nine per theme, polish.

## 4. Architecture (vanilla ES modules, no build step, like GAMBIT)
```
index.html            import map → /gms/lib/three/0.180.0/
css/app.css
js/app/               main.js, screens (menu, map, hole, results), ui, store, settings, sound
js/engine/            physics.js (ball, colliders, step), shapes.js, rng.js, sim.js (headless)
js/course/            builder.js (spline sweep → meshes + colliders), features/*.js, holes/*.js
js/game/              hole.js (hole flow), aim.js (input + guide line), camera.js, hud.js
js/themes/<id>/       index.js + parts (materials, sky, backdrop, obstacle skins)
js/story/, js/ai/, js/events/, js/ladder/, js/net/   (later milestones)
server/               (M6)
tools/                headless physics tests, screenshots
```
