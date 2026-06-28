// Boot + orchestration for "Deadtown". Loads the protected asset pack, builds
// the town, interiors, the player + auto-aim arsenal and the zombie horde, then
// runs the loop: joystick → move → aim.js locks a target → player auto-fires →
// zombies chase → spawner refills the town. Handles the bedroom cold-open, the
// area-swap into/out of buildings, pickups, collisions, the minimap and save.

import * as THREE from 'three';
import { CFG, SHOT, LITE, AUTO, NOSAVE, SKIP_INTRO, WPOSE, SITES } from './config.js';
import { createWposeTuner } from './wpose.js';
import { clamp, rand, pick, unlockAudio, chime } from './utils.js';
import { initAssets } from './assets.js';
import { initHero, makeHumanoid } from './hero.js';
import { buildWorld } from './world.js';
import { buildTown } from './townobj.js';
import { buildInteriors, makePickupVisual, tickPickup } from './interiors.js';
import { createPlayer } from './player.js';
import { makeZombie, preloadZombies, ZTYPES } from './zombies.js';
import { makeSurvivor, preloadSurvivors } from './survivors.js';
import { createControls } from './controls.js';
import { createAim } from './aim.js';
import { createMinimap } from './minimap.js';
import { createObjectives } from './objectives.js';
import { createIntro } from './intro.js';
import { initFx, tickFx } from './fx.js';
import { model as loadModel } from './assets.js';
import { WEAPONS } from './weapons.js';
import * as audio from './audio.js';
import * as ui from './ui.js';

window.__errors = [];
addEventListener('error', e => window.__errors.push(String(e.message)));
addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LITE ? 1.4 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
if (!LITE) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
document.getElementById('game-container').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const SAVE_KEY = 'deadtown_save_v1';
boot();

async function boot() {
  try {
    ui.setBoot('decoding asset pack…', 0.12);
    await initAssets(renderer, s => ui.setBoot(s));
    ui.setBoot('loading survivor…', 0.4);
    await initHero();
    ui.setBoot('raising the dead…', 0.62);
    await preloadZombies();
    await preloadSurvivors();
    ui.setBoot('building the town…', 0.8);
    start();
  } catch (e) {
    window.__errors.push('boot: ' + e);
    ui.setBoot('failed to load: ' + (e.message || e), 0);
    console.error(e);
  }
}

function start() {
  initFx(scene);
  const world = buildWorld(scene, renderer);

  // player rig + state
  const rig = makeHumanoid({});
  scene.add(rig.group);
  const bus = {};
  const player = createPlayer(rig, world, scene, bus);
  const townArea = { heightAt: player.heightAt, clampPos: player.clampPos };

  // town props + interiors
  const town = buildTown(scene, world);
  const interiors = buildInteriors(scene);
  // map interior id -> the town door it returns to (for the exit)
  const returnDoor = {};
  for (const it of town.interactables) if (it.interior) returnDoor[it.interior] = it;

  // zombies + survivors live under one group so we can hide them inside buildings
  const zGroup = new THREE.Group(); scene.add(zGroup);
  const zombies = [];
  const survivors = [];
  function placeSurvivors() {
    const spots = [['casual', -14, 9], ['biz', 25, 7], ['doc', -31, -15]];
    for (const [ty, sx, sz] of spots) survivors.push(makeSurvivor(ty, sx, sz, zGroup, bus, world.groundHeight));
  }
  const liveSurvivorInteracts = () => survivors.filter(s => !s.rescued && !s.remove).map(s => s.interact);
  function spawnZombie(type, x, z) {
    const c = makeZombie(type, x, z, zGroup, bus, world.groundHeight, zCollide);
    zombies.push(c); return c;
  }

  // ── area state ──
  let area = 'town';
  const visited = new Set();   // interiors entered (for objectives)
  const intro = createIntro(interiors.get('home').tv);
  const activeZombies = () => area === 'town' ? zombies : [];
  const activeInteractables = () => area === 'town' ? town.interactables.concat(liveSurvivorInteracts()) : interiors.get(area).interactables;
  const activePickups = () => area === 'town' ? townPickups : interiors.get(area).pickups;
  const activeColliders = () => area === 'town' ? town.colliders.circles : interiors.get(area).colliders;
  const activeBoxes = () => area === 'town' ? town.colliders.boxes : [];
  const overFog = scene.fog;

  function enterInterior(id) {
    const it = interiors.get(id); if (!it) return;
    area = id; visited.add(id);
    player.setArea({ heightAt: it.heightAt, clampPos: it.clampPos });
    player.pos.copy(it.entryPos); player.yaw = 0; player.target = null;
    it.root.visible = true; town.group.visible = false; zGroup.visible = false; world.groundVisual.visible = false;
    scene.fog = new THREE.Fog(0x14110c, 8, 40);
    world.sun.visible = false;
    controls.setPreset('interior');
    controls.snap();
    ui.prompt(null);
  }
  function exitToStreet(fromId) {
    area = 'town';
    const it = interiors.get(fromId);
    if (it) it.root.visible = false;
    player.setArea(townArea);
    const rp = returnDoor[fromId];
    // step out onto the doormat, nudged along the door's outward normal so we
    // never spawn inside the building regardless of its orientation.
    if (rp) player.pos.set(rp.pos.x + rp.nx * 1.6, 0, rp.pos.z + rp.nz * 1.6);
    else player.pos.set(SITES.home.x, 0, SITES.home.z + 3);
    player.target = null;
    town.group.visible = true; zGroup.visible = true; world.groundVisual.visible = true;
    scene.fog = overFog; world.sun.visible = !LITE;
    controls.setPreset('town');
    controls.snap();
  }

  // ── pickups (town loot from kills + interior loot) ──
  const townPickups = [];
  function makeTownPickup(kind, opts, x, z) {
    const v = makePickupVisual(kind, opts.id);
    v.holder.position.set(x, 0, z); zGroup.add(v.holder);
    townPickups.push({ kind, ...opts, pos: new THREE.Vector3(x, 0, z), group: v.holder, itemNode: v.itemNode, ring: v.ring, taken: false });
  }
  function applyPickup(pk) {
    if (pk.taken) return;
    pk.taken = true;
    pk.group.parent?.remove(pk.group);          // free the scene node…
    pk.ring?.material.dispose();                // …+ its per-instance ring (shared model mats/geo stay)
    if (pk.kind === 'weapon') { const fresh = player.giveWeapon(pk.id); ui.buildWeapons(); ui.toast(`${WEAPONS[pk.id].icon} ${fresh ? 'Picked up' : 'More'} ${WEAPONS[pk.id].name}`); }
    else if (pk.kind === 'ammo') { player.addAmmo(pk.ammo, pk.n); ui.toast(`🔫 +${pk.n} ${pk.ammo}`); }
    else if (pk.kind === 'medkit') { player.addMedkit(1); ui.toast('🩹 +1 Medkit'); }
    audio.pickup();
  }

  // ── event bus ──
  Object.assign(bus, {
    toast: ui.toast,
    hurt: () => { ui.hurtFlash(); audio.hurt(); },
    hpChanged: () => {},
    ammoChanged: () => {},
    invChanged: () => {},
    weaponChanged: (id) => ui.setWeaponActive(id),
    shot: (def) => audio.gunshot(def),
    swung: () => audio.melee(),
    dryFire: () => chime(110),
    reload: () => audio.reload(),
    combo: (n, mult) => ui.setCombo(n, mult),
    celebrate: () => audio.objective(),
    zombieKilled: (z) => {
      audio.zombieDie();
      // drop loot at the corpse; tougher types (brute/skeleton) drop better
      const tough = z.type === 'brute' || z.type === 'skeleton';
      const r = Math.random();
      const gx = z.group.position.x, gz = z.group.position.z;
      if (r < (tough ? 0.22 : 0.08)) makeTownPickup('weapon', { id: pick(['revolver', 'smg', 'rifle', 'shotgun', 'bat']) }, gx, gz);
      else if (r < 0.48) makeTownPickup('ammo', { ammo: pick(['9mm', '9mm', 'shells', 'rifle']), n: 8 + (Math.random() * 12 | 0) }, gx, gz);
      else if (r < 0.60) makeTownPickup('medkit', {}, gx, gz);
    },
    died: () => ui.showDeath(`You were overrun after ${player.kills} kills.`),
  });

  // ── controls / aim / minimap / objectives ──
  const controls = createControls({ camera, dom: renderer.domElement, player });
  const aim = createAim(scene);
  const minimap = createMinimap(document.getElementById('minimap'));
  const objectives = createObjectives({ player, visited, get kills() { return player.kills; } }, bus);
  addEventListener('pointerdown', () => audio.unlock(), { passive: true });   // unlock SFX on first touch (joystick)

  // interaction: nearest door/exit within range → prompt + Use button
  let nearIt = null;
  function refreshPrompt() {
    nearIt = null; let best = 1e9;
    for (const it of activeInteractables()) {
      const d = Math.hypot(player.pos.x - it.pos.x, player.pos.z - it.pos.z);
      if (d < it.range && d < best) { best = d; nearIt = it; }
    }
    ui.prompt(nearIt ? nearIt.verb : null);
  }
  function doInteract() {
    unlockAudio();
    if (!nearIt) return;
    if (nearIt.kind === 'door') {
      if (nearIt.locked || !nearIt.interior) { ui.toast('🚪 Barricaded — no way in.'); return; }
      enterInterior(nearIt.interior);
    } else if (nearIt.kind === 'exit') {
      exitToStreet(nearIt.interior);
    } else if (nearIt.kind === 'rescue') {
      const reward = nearIt.survivor.rescue();
      if (reward) {
        player.rescued++;
        if (reward.medkit) player.addMedkit(reward.medkit);
        if (reward.ammo) player.addAmmo(reward.ammo, reward.n);
        ui.toast(`🆘 Survivor rescued! ${reward.medkit ? `+${reward.medkit} medkit` : `+${reward.n} ${reward.ammo}`}`);
        audio.objective();
      }
    }
  }

  ui.initHud(player, {
    selectWeapon: (id) => { unlockAudio(); player.selectWeapon(id); },
    useMedkit: () => { unlockAudio(); player.useMedkit(); },
    reload: () => { audio.unlock(); player.reload(); },
    interact: doInteract,
    restart: () => { if (area !== 'town') exitToStreet(area); player.respawn(); ui.hideDeath(); },
  });
  ui.bars();
  ui.setObjective(objectives.text());

  // keyboard shortcuts (desktop)
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') doInteract();
    else if (k === 'q') player.cycleWeapon();
    else if (k === 'r') player.reload();
    else if (k === 'h') player.useMedkit();
    else if (k >= '1' && k <= '9') { const id = player.weapons[+k - 1]; if (id) player.selectWeapon(id); }
  });

  // fixed world loot so every weapon is reliably findable (the rifle by the
  // police station, etc.), plus ammo caches. Placed once at boot.
  function placeStarterLoot() {
    const spots = [
      ['weapon', { id: 'rifle' }, 33, -11],     // by the police station
      ['weapon', { id: 'smg' }, -27, 12],       // near the café
      ['weapon', { id: 'revolver' }, 12, 26],
      ['weapon', { id: 'bat' }, -4, 17],
      ['weapon', { id: 'machinegun' }, 40, -38],// far reward by the car wash
      ['ammo', { ammo: 'rifle', n: 30 }, 30, -9],
      ['ammo', { ammo: 'shells', n: 16 }, 8, 27],
      ['ammo', { ammo: '9mm', n: 30 }, -25, 14],
      ['medkit', {}, 0, 19], ['medkit', {}, -30, -10],
    ];
    for (const [kind, opts, x, z] of spots) makeTownPickup(kind, opts, x, z);
  }

  // ── load / fresh ──
  placeStarterLoot();
  placeSurvivors();
  const saved = !NOSAVE && load();
  if (!saved) {
    // fresh: scatter the starting horde, then either cold-open in the bedroom
    // or (?town) drop straight into the street.
    seedHorde(14);
    if (!SKIP_INTRO && !SHOT && !WPOSE) {
      enterInterior('home');
      player.pos.set(interiors.get('home').entryPos.x + 6, 0, interiors.get('home').entryPos.z - 9); // on the bed
      setTimeout(() => intro.run(), 400);
    }
  } else {
    seedHorde(14);
  }
  setInterval(save, 8000);
  addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  function save() {
    // only persist street state — interior coords sit at x~200 and we always
    // resume in town, so never autosave while inside a building or dead.
    if (!player.alive || area !== 'town') return;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ p: player.serialize(), o: objectives.serialize() })); } catch {}
  }
  function load() {
    let d; try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch { return false; }
    if (!d) return false;
    player.load(d.p); objectives.load(d.o); ui.buildWeapons(); ui.bars();
    ui.toast('💾 Welcome back to the apocalypse.');
    return true;
  }

  // shot mode: stage a thumbnail in the street
  if (SHOT) { document.body.classList.add('shot-mode'); area = 'town'; player.pos.set(2, 0, 8); controls.setPreset('town'); controls.state.dist = 16; }

  ui.setBoot('ready', 1);
  setTimeout(ui.hideBoot, 250);

  // ── zombie horde helpers (difficulty ramps with your kill count) ──
  const maxZ = () => Math.min(36, 16 + player.kills * 0.3);          // bigger horde over time
  function seedHorde(n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, 6.28), r = rand(16, CFG.townHalf - 6);
      spawnZombie(pickType(), Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  function pickType() {
    const k = player.kills;
    const tough = Math.min(0.5, 0.12 + k * 0.005);                   // brutes/skeletons grow common
    const r = Math.random();
    if (r < tough) return Math.random() < 0.5 ? 'brute' : 'skeleton';
    if (r < tough + 0.25) return 'runner';
    return Math.random() < 0.5 ? 'walker' : 'woman';
  }
  let spawnT = 4;
  function spawnTick(dt) {
    spawnT -= dt;
    const alive = zombies.filter(z => z.alive).length;
    if (spawnT <= 0 && alive < maxZ()) {
      spawnT = rand(2.4, 5) / (1 + player.kills / 70);              // spawns quicken as it ramps
      // spawn out past the fog edge, away from the player
      let x, z, tries = 0;
      do { const a = rand(0, 6.28), r = rand(40, CFG.townHalf - 3); x = player.pos.x + Math.cos(a) * r; z = player.pos.z + Math.sin(a) * r; tries++; }
      while ((Math.abs(x) > CFG.townHalf - 3 || Math.abs(z) > CFG.townHalf - 3) && tries < 8);
      x = clamp(x, -CFG.townHalf + 3, CFG.townHalf - 3); z = clamp(z, -CFG.townHalf + 3, CFG.townHalf - 3);
      spawnZombie(pickType(), x, z);
    }
  }

  // ── collisions ──
  function zCollide(p) {
    for (const b of town.colliders.boxes) {
      const minX = b.x - b.hx - 0.5, maxX = b.x + b.hx + 0.5, minZ = b.z - b.hz - 0.5, maxZ = b.z + b.hz + 0.5;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;
      const dl = p.x - minX, dr = maxX - p.x, dd = p.z - minZ, du = maxZ - p.z, m = Math.min(dl, dr, dd, du);
      if (m === dl) p.x = minX; else if (m === dr) p.x = maxX; else if (m === dd) p.z = minZ; else p.z = maxZ;
    }
    for (const cc of town.colliders.circles) {
      const minD = cc.r + 0.45, dx = p.x - cc.x, dz = p.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { p.x = cc.x + (dx / d) * minD; p.z = cc.z + (dz / d) * minD; }
    }
  }
  // line-of-sight: does the muzzle→target segment cross any building footprint?
  // Liang–Barsky clip of the 2D segment against each (slightly padded) box.
  function segHitsBox(ax, az, bx, bz, b) {
    const pad = 0.3;
    const minX = b.x - b.hx - pad, maxX = b.x + b.hx + pad, minZ = b.z - b.hz - pad, maxZ = b.z + b.hz + pad;
    const dx = bx - ax, dz = bz - az;
    let t0 = 0, t1 = 1;
    const edges = [[-dx, ax - minX], [dx, maxX - ax], [-dz, az - minZ], [dz, maxZ - az]];
    for (const [p, q] of edges) {
      if (Math.abs(p) < 1e-9) { if (q < 0) return false; }
      else { const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } }
    }
    return t0 <= t1;
  }
  function losBlocked(from, to) {
    for (const b of town.colliders.boxes) if (segHitsBox(from.x, from.z, to.x, to.z, b)) return true;
    return false;
  }

  function resolvePlayer() {
    const px = player.pos;
    for (const cc of activeColliders()) {
      const minD = cc.r + CFG.playerRadius;
      const dx = px.x - cc.x, dz = px.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { px.x = cc.x + (dx / d) * minD; px.z = cc.z + (dz / d) * minD; }
    }
    for (const b of activeBoxes()) {
      const pr = CFG.playerRadius;
      const minX = b.x - b.hx - pr, maxX = b.x + b.hx + pr, minZ = b.z - b.hz - pr, maxZ = b.z + b.hz + pr;
      if (px.x <= minX || px.x >= maxX || px.z <= minZ || px.z >= maxZ) continue;
      const dl = px.x - minX, dr = maxX - px.x, dd = px.z - minZ, du = maxZ - px.z, m = Math.min(dl, dr, dd, du);
      if (m === dl) px.x = minX; else if (m === dr) px.x = maxX; else if (m === dd) px.z = minZ; else px.z = maxZ;
    }
  }

  // ── loop ──
  const clock = new THREE.Clock();
  let t = 0, fps = 60, frames = 0, fpsT = 0, mmT = 0, objT = 0, objShown = false, groanT = 3, frameCount = 0;
  let autoT = 0, autoMv = { x: 0, z: 0, run: false };
  let paused = false;   // ?wpose tuner freezes the sim while its panel is open
  function loop() {
    requestAnimationFrame(loop);
    let dt = clamp(clock.getDelta(), 0, 0.05);
    frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    t += dt;

    // When the wpose panel is open the sim is frozen (no zombies, no movement)
    // so the tuner is the only thing posing the rig — render + camera still run
    // at the bottom so you can orbit and inspect the weapon.
    if (!paused) {
    // 1. move from joystick (or the soak driver)
    if (AUTO) autoTick(dt);
    player.move(dt, t, AUTO ? autoMv : controls.getMove());
    resolvePlayer();
    rig.group.position.x = player.pos.x; rig.group.position.z = player.pos.z;   // sync after pushout so the muzzle/laser are correct this frame

    // 2. auto-aim: lock a target (only where there are enemies)
    let target = null;
    const def = player.weaponDef();
    if (player.alive) {
      const rng = def.kind === 'melee' ? 5 : Math.min(CFG.aimRange, def.range);
      target = aim.update({ muzzlePos: player.muzzle(), faceDir: player.faceDir(), zombies: activeZombies(), range: rng, cone: CFG.aimCone, blocked: area === 'town' ? losBlocked : null });
      aim.setVisible(true);
    } else aim.setVisible(false);

    // 3. combat: turn + auto-fire / swing
    player.combat(dt, t, target);

    // 4. zombies
    for (const z of activeZombies()) z.update(dt, t, player);
    // cull removed (dispose per-instance materials + health bar)
    for (let i = zombies.length - 1; i >= 0; i--) if (zombies[i].remove) { zombies[i].dispose?.(); zGroup.remove(zombies[i].group); zombies.splice(i, 1); }
    // prune collected town pickups (already detached from the scene)
    for (let i = townPickups.length - 1; i >= 0; i--) if (townPickups[i].taken) townPickups.splice(i, 1);
    // survivors (town only)
    if (area === 'town') for (const s of survivors) s.update(dt, t, player);
    for (let i = survivors.length - 1; i >= 0; i--) if (survivors[i].remove) { zGroup.remove(survivors[i].group); survivors.splice(i, 1); }
    if (area === 'town' && player.alive) spawnTick(dt);

    // 5. pickups (spin/glow, auto collect on walk-over)
    for (const pk of activePickups()) {
      if (pk.taken) continue;
      if (Math.hypot(player.pos.x - pk.pos.x, player.pos.z - pk.pos.z) < CFG.pickupRange) applyPickup(pk);
      else tickPickup(pk, t);
    }

    // 6. interaction prompt
    refreshPrompt();

    // 7. world / interior tick
    town.tick(dt, t);
    if (area !== 'town') interiors.get(area).tick(t);
    intro.update(dt, t);
    world.tick(dt, t);
    if (area === 'town') world.tickSky(dt);   // day→night cycle (interiors swap the fog)
    tickFx(dt);

    if (!LITE && area === 'town') { world.sun.position.set(player.pos.x + CFG.sunDir[0], CFG.sunDir[1], player.pos.z + CFG.sunDir[2]); world.sunTarget.position.copy(player.pos); }

    // minimap (a few times a second)
    mmT += dt; if (mmT > 0.18) { mmT = 0; minimap.update({ player, zombies: activeZombies(), buildings: town.buildings, pickups: townPickups, survivors }); }
    objT += dt; if (objT > 1) { objT = 0; if (objectives.check() || !objShown) { objShown = true; ui.setObjective(objectives.text()); } }
    groanT -= dt; if (groanT <= 0) { groanT = rand(4, 9); if (area === 'town' && activeZombies().some(z => z.alive && Math.hypot(z.group.position.x - player.pos.x, z.group.position.z - player.pos.z) < 22)) audio.groan(); }
    }   // end if (!paused)

    ui.bars();
    controls.tick(dt);
    renderer.render(scene, camera);
    frameCount++;
    if (SHOT && frameCount === 12) window.__shotReady = true;
  }
  loop();

  // ── auto soak ──
  function autoTick(dt) {
    autoT -= dt;
    if (autoT <= 0) { autoT = rand(1.5, 3); const a = rand(0, 6.28); autoMv = { x: Math.cos(a), z: Math.sin(a), run: Math.random() < 0.3 }; }
  }

  // ── test hooks ──
  window.__game = { player, world, town, interiors, controls, aim, zombies, survivors, doInteract, get area() { return area; }, enterInterior, exitToStreet, scene, camera };
  window.__state = {
    get fps() { return Math.round(fps); },
    get pos() { return { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) }; },
    get hp() { return Math.ceil(player.hp); },
    get ammo() { return player.ammo; },
    get weapon() { return player.curWeapon; },
    get kills() { return player.kills; },
    get area() { return area; },
    get zombies() { return activeZombies().filter(z => z.alive).length; },
    get target() { return player.target ? player.target.type : null; },
    get errors() { return window.__errors; },
  };
  window.__camera = camera;

  // ?wpose → live weapon-pose tuner. Pausing also hides the horde so the posing
  // stage is just the player (the seeded zombies are frozen, but out of view).
  if (WPOSE) createWposeTuner(player, controls, { setPaused: (v) => { paused = v; zGroup.visible = !v; aim.setVisible(!v); } });
}
