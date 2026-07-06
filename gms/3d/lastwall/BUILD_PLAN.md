# LASTWALL — Build Plan (living document)

> **This file is the project manager.** Every session: read this first, do the next
> unchecked items, then UPDATE this file (tick boxes, add session log entry, revise
> plans that turned out wrong). CLAUDE.md holds the architecture/conventions; this
> file holds *state + plan*.

## The pitch

A very-hard rogue-lite runner-brawler on top of a continent-spanning great wall,
after the **Halcyon Strain** turned the world below into a screaming sea of
infected. You are **Courier Seven** — the last immune carrier; the cure is your
blood, and the last lab (**Meridian Bastion**) is 100 wall-sections away. The wall
branches like a maze, cracked spans fall away behind you, and everything — enemies
AND you — ragdolls when hit hard enough. Die, bank your Serum, upgrade permanently,
run again.

Comedy physics is a core pillar: knockback scales with damage; damage boosts turn
hits into launches; the best kill is a long drop off the wall.

## Design contract (locked decisions — don't re-litigate)

- **Look**: dusk / blood-red sun, fog, torch-lit wall top, infected sea writhing
  below. Hand-built low-poly primitive models ONLY (needed for ragdoll +
  break-apart; also keeps repo 100% committable — no PolyPerfect here).
- **Ragdoll**: custom verlet (particles + distance constraints). Impulse from a
  hit = damage × knockback factor. Over a threshold → full ragdoll (may get back
  up if alive). Ragdolls can slam parapets (bonus damage) and fall off the wall
  through parapet gaps (instant kill, "LONG DROP" bonus). The PLAYER ragdolls too
  but can only leave the wall on death.
- **Weapons**: starters are unlimited (melee + sidearm), upgraded via meta tiers.
  Temp weapons are ammo- or time-limited pickups. Superweapons (one slot) are
  absurdly OP with a slow recharge meter (Gravity Maul, Howler Cannon).
- **Modes**: **Story** (100 levels, beats at set levels, gate checkpoints every 10
  levels unlock as permanent start points) and **Endless** (scales forever; may
  start at the x10 gate below your best, e.g. reached 34 → may start at 30).
- **Powerup picks**: at levels 5,10,15,20 then every 10 (30,40,…). Choice of 3;
  3 rerolls per run (meta-upgradeable). Starting at gate 30 grants the first 5
  picks immediately (5,10,15,20,30).
- **Two economies**: per-run powerups (lost on death) vs permanent Serum upgrades
  (kept). Serum drops from kills; banked at death/level-complete.
- **Maze**: levels branch — dead-end loot spurs, reconverging forks, and
  **crack-choice** forks: crossing the crack collapses the span behind you
  (one-way; enemies on it fall with it).
- **Difficulty**: brutal by design. Progress comes from meta upgrades + mastery.
- Repo conventions: vanilla JS, Three.js 0.160 importmap, no build step, in-game
  popups never alert(), localStorage saves, `?shot/?lite/?auto/?nosave` URL modes.

## Phases

### Phase 0 — Scaffold & plan ✅ (S1)
- [x] Folder, BUILD_PLAN.md, CLAUDE.md
- [x] index.html + style.css + boot screen

### Phase 1 — Core engine ✅ (S1)
- [x] config/utils/RNG (seeded per level)
- [x] World: sky, fog, dusk sun, ground far below, infected sea, lighting, bloom (+`?lite`)
- [x] Wallgen: seeded path graph → spans/towers/gates, parapets w/ gaps, props,
      colliders (rect union), branch types (spur / fork / crack-choice), collapse rig
      (gotcha fixed: rects must overlap ≥2m or the padded clamp union has seams)
- [x] Hand-built humanoid factory (player + infected variants) with procedural
      run/attack anim; parts separable for ragdoll/dismember
- [x] Controls: desktop WASD (+mouse orbit) & mobile floating joystick + 2-finger
      orbit; chase camera aligned to travel (camYaw 0 = camera south of player)
- [x] Player: move/sprint, HP, auto-aim combat (deadtown pattern)

### Phase 2 — Combat & ragdoll ✅ (S1)
- [x] Verlet ragdoll sim + enemy→ragdoll conversion + get-up
- [x] Knockback-scales-with-damage; parapet slam damage; edge falls (long drop);
      launch velocity capped ~26 m/s so arcs stay on screen
- [x] Weapons: Pipe + Scrapshot (starters), Scattergun/Stitcher (ammo temp),
      Flame Lance (time temp), Gravity Maul + Howler (slow-recharge supers)
- [x] Enemies: Shambler, Sprinter, Brute (grab-throw ragdolls the player),
      Bloater (explodes → gibs); climbers; director scaling; mass-scaled stagger
      (no stun-locking heavies with a pistol)
- [x] Boost pickups (Adrenal ×3 dmg 12s, Haste, Bulwark) — dmg boost multiplies knockback
- [x] FX: hitstop, slowmo, screenshake, blood, tracers, debris; procedural audio + wind/drone

### Phase 3 — Progression skeleton ✅ (S1)
- [x] Level flow: gate→gate, complete → next; death → bank serum → meta screen
- [x] Powerup pick UI (3 cards + reroll), pool 16 entries, cadence rule + owed-drafts
- [x] Meta: Serum currency, 10-upgrade grid, gates, save/load (localStorage `lastwall_v1`)
- [x] Story: intro sequence + WARDEN transmission popups; beats for levels 1–10
- [x] Menus: title (showcase wall bg), pause, death, win, help; L10 boss + boss bar
- [x] Endless mode with x10 start rule

### Phase 4 — Make it fantastic (polish pass 1)
- [ ] Player model/anim polish (weapon-specific poses, hurt flash, boost glow)
- [ ] Wall dressing: banners, braziers w/ flicker, corpse piles, wrecks, ash particles
- [ ] Collapse spectacle: chunk debris, dust, rumble, camera shake
- [ ] Long-drop camera moment (brief slow-mo on multi-kill launches)
- [ ] Balance pass: levels 1–10 hard-but-fair
- [ ] Screenshot + `?shot` stage

### Phase 5 — Story content
- [ ] Story beats ALL levels (1–100): transmissions + found logs
- [ ] Level themes: 10-level biome bands (ash→rust→bone→frost→blood→dark…)
- [ ] Bosses every 10th level (bespoke for 10/50/100 at minimum)
- [ ] Elite enemy modifiers (armoured/frenzied/venomous) from L15+
- [ ] Mid-run vignettes: survivor cages, shrine choices (risk/reward)
- [ ] Finale: level 100 Meridian Bastion approach + ending cinematic + credits

### Phase 6 — Content breadth
- [ ] More temp weapons (Rail Lance, Chainblade, Concussion Mortar)
- [ ] 2nd superweapon fully tuned (Howler Cannon)
- [ ] More enemies: Spitter (ranged), Screamer (summons), Crawler (low profile)
- [ ] Powerup pool → 24+; meta tree → 16+ nodes incl. reroll+, Second Wind
- [ ] Daily seed? (stretch)

### Phase 7 — Ship
- [ ] Soak test headless (`?auto`), fix leaks; mobile perf check (`?lite` auto-detect)
- [ ] Full playthrough sanity: L1→L20 manual, L20→100 simulated
- [ ] Screenshot, projects.js entry (selective stage!), commit + push
- [ ] Update memory + this file to SHIPPED

## Session log

- **S1 (2026-07-07, Fable 5)**: Project created; Phases 0–3 COMPLETE. 17 modules,
  no build step, no external assets. Headless-verified (puppeteer + swiftshader,
  scripts recreatable — see CLAUDE.md testing notes): boot clean; auto-bot
  completed L1→L2; Gravity Maul ring-launch screenshot shows 8 simultaneous
  ragdoll arcs incl. off-wall long drops; L10 boss + bar; crack collapse kills
  span + riders; draft/death/title/endless flows all exercised; zero console
  errors. Balance fixes made: rect-seam overlap, mass-scaled stagger, launch
  velocity cap, camera yaw flip, lighting brightened. NEXT (S2): play-feel pass
  on desktop+mobile by Aaron; then Phase 4 polish (esp. collapse spectacle
  timing, player-ragdoll feel, `?shot` stage + screenshot) and Phase 5 story
  beats 11–100 + themes + more bosses.

- **S1.1 (2026-07-07, Fable 5)** — Aaron's first mobile playtest fixes:
  (1) left/right was genuinely reversed — sign error in the input rotation;
  (2) movement "hard" — input was rotated through the LIVE camera frame while
  the camera auto-chased travel, so holding a direction spiralled; fixed with
  **direction latching** (world dir locks while the stick is held steady,
  re-reads the camera frame only on >23° steer) + a deadband so backing up
  doesn't whip the camera. Headless-verified: D→straight east, W→straight
  north, touch-right→straight east, zero spiral.
  (3) end-gate was an invisible 5.5m spot at the plaza CENTRE — now the
  portcullis visibly rises as you approach and walking under the arch
  completes the level with a fade-to-black (no button-hunting).
  (4) story intro soft-locked on mobile — taps on the transmission panel were
  swallowed and there was no auto-advance, so STORY hung in the flyby until a
  refresh (seenIntro had saved). Now: panel taps skip, and transmissions
  auto-advance after reading time (RULE: no transmission may ever block
  progress). Verified: hands-free intro→PLAY in 23s; tap-through in 7 taps.
  Aaron retest pending. Story beats 11–100 still Phase 5 (confirmed intended).
- **S1.2 (2026-07-07, Fable 5)** — Aaron's 2nd mobile pass: objective banner
  covered the health bar → moved below the vitals block + fades to 0.15 after
  4s (bossbar moved down with it); level-start story was too fast to read →
  level-start beats now PAUSE the game (state STORY, `transmit(...,{manual})`,
  no auto-advance) until the player taps — the auto-advance rule now applies
  only to non-blocking/cinematic transmissions. Verified on 390×844 viewport:
  paused hands-off indefinitely, taps resume, no HUD overlap, fade works,
  `?auto` soak still clears L1→L2. Aaron retest pending.

## Known debts / decisions pending

- Mid-run save: runs are one-sitting; only meta persists. Fine for now; revisit at ship.
- projects.js registration intentionally deferred until ship (folder committed as WIP).
- Howler Cannon exists but needs a feel pass (Phase 6).
- Player swing() uses setTimeout — lands during pause/hitstop; harmless today, tidy later.
- Boss can still be kited backwards forever; wants a leash/enrage (Phase 5).
- Draft can offer stackable duplicates by design; verify epic weights feel right in play.
