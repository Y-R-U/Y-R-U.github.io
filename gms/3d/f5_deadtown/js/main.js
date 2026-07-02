// Boot + orchestration for F5 Deadtown. Loads the protected asset pack and the
// game data (SQLite via the Go server's API, or the published snapshot on
// static hosting), shows the start menu, plays the TV-news cinematic on a new
// game, then runs the loop: joystick → move → aim.js locks a target → player
// auto-fires → zombies chase → spawn zones + the ambient spawner refill the
// level. ONE level is live at a time; exit hotspots swap levels (fade, full
// dispose + rebuild). Progress (player, flags, fired hotspots, taken pickups,
// mission index, current level) saves back to the DB every few seconds.

import * as THREE from 'three';
import { CFG, SHOT, LITE, AUTO, NOSAVE, WPOSE, CINE, START_LEVEL } from './config.js';
import { createWposeTuner } from './wpose.js';
import { clamp, rand, pick, unlockAudio, chime } from './utils.js';
import { initAssets } from './assets.js';
import { initHero, makeHumanoid } from './hero.js';
import { buildEnv, groundHeight } from './world.js';
import { buildLevel, makePickupVisual, firedFlag, takenFlag } from './level.js';
import { hotspotVerb, runDialog, showCard } from './hotspots.js';
import { createPlayer } from './player.js';
import { makeZombie, preloadZombies, ZTYPES } from './zombies.js';
import { createControls } from './controls.js';
import { createAim } from './aim.js';
import { createMinimap } from './minimap.js';
import { createMissions } from './missions.js';
import { playCinematic } from './cinematic.js';
import { showMenu } from './menu.js';
import { data } from './data.js';
import { initFx, tickFx } from './fx.js';
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

boot();

async function boot() {
  try {
    ui.setBoot('decoding asset pack…', 0.1);
    await initAssets(renderer, s => ui.setBoot(s));
    ui.setBoot('loading survivor…', 0.35);
    await initHero();
    ui.setBoot('raising the dead…', 0.55);
    await preloadZombies();
    ui.setBoot('dialing the newsroom…', 0.72);
    await data.init();
    const cfg = (await data.config()) || { startLevel: 'home', title: 'DEADTOWN', subtitle: '', missions: [] };
    ui.setBoot('building the town…', 0.85);
    await start(cfg);
  } catch (e) {
    window.__errors.push('boot: ' + e);
    ui.setBoot('failed to load: ' + (e.message || e), 0);
    console.error(e);
  }
}

async function start(cfg) {
  initFx(scene);

  // player rig + state
  const rig = makeHumanoid({});
  scene.add(rig.group);
  const bus = {};
  const player = createPlayer(rig, { groundHeight }, scene, bus);

  // ── run state ──
  const flags = new Set();
  const visited = new Set();
  let level = null;        // current level bundle (level.js)
  let env = null;          // current environment bundle (world.js)
  let paused = false;
  const onPause = (v) => { paused = v; };

  // zombies live under one group, rebuilt per level
  const zGroup = new THREE.Group(); scene.add(zGroup);
  const zombies = [];
  const drops = [];        // runtime loot from kills (not persisted)

  function spawnZombie(type, x, z, zone) {
    const c = makeZombie(type, x, z, zGroup, bus, groundHeight, zCollide);
    c.zone = zone || null;
    if (zone) zone.alive++;
    zombies.push(c);
    return c;
  }
  function clearZombies() {
    for (const z of zombies) { z.dispose?.(); zGroup.remove(z.group); }
    zombies.length = 0;
  }

  // ── level swap (the ONLY way around the world is exit hotspots) ──
  const fadeEl = document.getElementById('fade');
  const fade = (on) => new Promise(r => { fadeEl.classList.toggle('on', on); setTimeout(r, on ? 320 : 120); });
  let swapping = false;

  async function gotoLevel(id, { atHotspot = null, atPos = null } = {}) {
    if (swapping) return;
    swapping = true;
    await fade(true);
    // teardown
    clearZombies();
    for (const d of drops) { d.ring?.material.dispose(); d.group.parent?.remove(d.group); }
    drops.length = 0;
    level?.dispose(); env?.dispose();
    player.target = null;

    let doc;
    try { doc = await data.level(id); }
    catch (e) { ui.toast(`⚠ Level "${id}" failed to load`); window.__errors.push('level: ' + e); swapping = false; await fade(false); return; }

    env = buildEnv(scene, renderer, doc);
    level = await buildLevel(scene, doc, { flags });
    visited.add(id);

    // place the player: arriving exit hotspot (nudged toward the level centre,
    // facing in) > explicit position (save restore) > authored start
    if (atHotspot) {
      const h = (doc.hotspots || []).find(x => x.uid === atHotspot) || level.playerStart;
      const cx = -(h.x || 0), cz = -(h.z || 0);
      const l = Math.hypot(cx, cz) || 1;
      player.pos.set((h.x || 0) + (cx / l) * 2.0, 0, (h.z || 0) + (cz / l) * 2.0);
      player.yaw = Math.atan2(cx, cz);
    } else if (atPos) {
      player.pos.set(atPos.x, 0, atPos.z); player.yaw = atPos.yaw || 0;
    } else {
      player.pos.set(level.playerStart.x, 0, level.playerStart.z);
      player.yaw = level.playerStart.yaw || 0;
    }
    player.setArea({ heightAt: level.heightAt, clampPos: level.clampPos });
    player.setRespawn({ x: level.playerStart.x, z: level.playerStart.z, yaw: level.playerStart.yaw });

    // seed the spawn zones (never right on top of the player)
    for (const zone of level.zones) {
      const s = zone.def;
      for (let i = 0; i < (s.count || 0); i++) {
        const p = zonePoint(s);
        if (p) spawnZombie(pick(s.types || ['walker']), p.x, p.z, zone);
      }
      zone.seeded = true;
    }

    controls.setPreset(level.interior ? 'interior' : 'outdoor');
    controls.snap();
    ui.prompt(null);
    swapping = false;
    await fade(false);
  }

  function zonePoint(s, minFromPlayer = 7) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, 6.28), r = Math.sqrt(Math.random()) * (s.r || 6);
      const x = clamp(s.x + Math.cos(a) * r, -level.bounds.hx + 2, level.bounds.hx - 2);
      const z = clamp(s.z + Math.sin(a) * r, -level.bounds.hz + 2, level.bounds.hz - 2);
      if (Math.hypot(x - player.pos.x, z - player.pos.z) > minFromPlayer) return { x, z };
    }
    return null;
  }

  // ── pickups + kill drops ──
  function makeDrop(kind, opts, x, z) {
    const v = makePickupVisual(kind, opts.id);
    v.holder.position.set(x, 0, z); zGroup.add(v.holder);
    drops.push({ kind, ...opts, pos: new THREE.Vector3(x, 0, z), group: v.holder, itemNode: v.itemNode, ring: v.ring, taken: false });
  }
  function applyPickup(pk) {
    if (pk.taken) return;
    pk.taken = true;
    if (pk.uid) flags.add(takenFlag(level.id, pk.uid));   // authored loot stays looted
    pk.group.parent?.remove(pk.group);
    pk.ring?.material.dispose();
    if (pk.kind === 'weapon') { const fresh = player.giveWeapon(pk.id); ui.buildWeapons(); ui.toast(`${WEAPONS[pk.id].icon} ${fresh ? 'Picked up' : 'More'} ${WEAPONS[pk.id].name}`); }
    else if (pk.kind === 'ammo') { player.addAmmo(pk.ammo, pk.n); ui.toast(`🔫 +${pk.n} ${pk.ammo}`); }
    else if (pk.kind === 'medkit') { player.addMedkit(1); ui.toast('🩹 +1 Medkit'); }
    audio.pickup();
  }
  const activePickups = () => level ? level.pickups.concat(drops) : drops;

  // ── event bus ──
  Object.assign(bus, {
    toast: ui.toast,
    hurt: () => { ui.hurtFlash(); audio.hurt(); },
    hpChanged: () => {}, ammoChanged: () => {}, invChanged: () => {},
    weaponChanged: (id) => ui.setWeaponActive(id),
    shot: (def) => audio.gunshot(def),
    swung: () => audio.melee(),
    dryFire: () => chime(110),
    reload: () => audio.reload(),
    combo: (n, mult) => ui.setCombo(n, mult),
    celebrate: () => audio.objective(),
    zombieKilled: (z) => {
      audio.zombieDie();
      if (z.zone) z.zone.alive--;
      // scarcity: the dead NEVER drop weapons — only a little ammo for guns you
      // actually own, or the odd medkit
      const gx = z.group.position.x, gz = z.group.position.z;
      const owned = player.weapons.map(id => WEAPONS[id]?.ammo).filter(Boolean);
      const r = Math.random();
      if (owned.length && r < 0.10) makeDrop('ammo', { ammo: pick(owned), n: 8 + (Math.random() * 9 | 0) }, gx, gz);
      else if (r < 0.16) makeDrop('medkit', {}, gx, gz);
    },
    died: () => ui.showDeath(`You were overrun after ${player.kills} kills.`),
  });

  // ── controls / aim / minimap / missions ──
  const controls = createControls({ camera, dom: renderer.domElement, player });
  const aim = createAim(scene);
  const minimap = createMinimap(document.getElementById('minimap'));
  const missions = createMissions(cfg.missions, { player, flags, visited }, bus);
  addEventListener('pointerdown', () => audio.unlock(), { passive: true });

  // ── hotspot interaction ──
  let nearHs = null;
  function refreshPrompt() {
    nearHs = null; let best = 1e9;
    if (!level) { ui.prompt(null); return; }
    for (const hs of level.hotspots) {
      const h = hs.h;
      if (h.type === 'trigger') continue;
      if (hs.fired && h.type !== 'exit') continue;         // spent one-shots go quiet
      const d = Math.hypot(player.pos.x - h.x, player.pos.z - h.z);
      if (d < Math.max(h.r || 2, 1.6) + 0.6 && d < best) { best = d; nearHs = hs; }
    }
    ui.prompt(nearHs ? hotspotVerb(nearHs.h, flags) : null);
  }
  function markFired(hs) {
    if (hs.h.sets) flags.add(hs.h.sets);
    if (hs.h.once) {
      flags.add(firedFlag(level.id, hs.h.uid));
      hs.fired = true;
      hs.marker.setFired?.();
    }
  }
  async function doInteract() {
    unlockAudio(); audio.unlock();
    if (!nearHs || swapping) return;
    const h = nearHs.h, hs = nearHs;
    if (h.type === 'exit') {
      if (h.requires && !flags.has(h.requires)) { ui.toast(`🔒 ${h.lockedMsg || 'Locked.'}`); return; }
      markFired(hs);
      gotoLevel(h.target?.level, { atHotspot: h.target?.hotspot });
    } else if (h.type === 'dialog') {
      await runDialog(h.lines || [], { onPause });
      markFired(hs);
    } else if (h.type === 'item') {
      for (const gv of (h.gives || [])) {
        if (gv.kind === 'weapon' && WEAPONS[gv.item]) { player.giveWeapon(gv.item); ui.buildWeapons(); }
        else if (gv.kind === 'ammo') player.addAmmo(gv.ammo, gv.n || 0);
        else if (gv.kind === 'medkit') player.addMedkit(gv.n || 1);
      }
      audio.pickup();
      markFired(hs);
      await showCard(h.label || 'Found', h.text || '', { onPause });
    } else if (h.type === 'note') {
      markFired(hs);
      await showCard(h.label || 'Note', h.text || '', { onPause });
    }
  }
  function checkTriggers() {
    if (!level) return;
    for (const hs of level.hotspots) {
      const h = hs.h;
      if (h.type !== 'trigger' || hs.fired) continue;
      if (Math.hypot(player.pos.x - h.x, player.pos.z - h.z) > (h.r || 3)) continue;
      hs.fired = true; markFired(hs);
      if (h.event === 'wave') {
        const P = h.params || {};
        const n = P.count || 4, rr = P.r || 15;
        for (let i = 0; i < n; i++) {
          const a = rand(0, 6.28);
          const x = clamp(player.pos.x + Math.cos(a) * rr, -level.bounds.hx + 2, level.bounds.hx - 2);
          const z = clamp(player.pos.z + Math.sin(a) * rr, -level.bounds.hz + 2, level.bounds.hz - 2);
          spawnZombie(pick(P.types || ['walker']), x, z);
        }
        ui.toast('🧟 You hear them coming…');
        audio.groan();
      }
    }
  }

  ui.initHud(player, {
    selectWeapon: (id) => { unlockAudio(); player.selectWeapon(id); },
    useMedkit: () => { unlockAudio(); player.useMedkit(); },
    reload: () => { audio.unlock(); player.reload(); },
    interact: doInteract,
    restart: () => {
      player.respawn();
      // clear the welcoming committee around the respawn point
      for (const z of zombies) if (z.alive && Math.hypot(z.group.position.x - player.pos.x, z.group.position.z - player.pos.z) < 9) { z.alive = false; z.remove = true; if (z.zone) z.zone.alive--; }
      ui.hideDeath();
    },
  });
  ui.bars();

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === 'e' || k === ' ') { if (!paused) doInteract(); }
    else if (k === 'q') player.cycleWeapon();
    else if (k === 'r') player.reload();
    else if (k === 'h') player.useMedkit();
    else if (k >= '1' && k <= '9') { const id = player.weapons[+k - 1]; if (id) player.selectWeapon(id); }
  });

  // ── save / load (DB slot `main`, localStorage on static hosting) ──
  function snapshotSave() {
    return {
      level: level?.id, p: player.serialize(),
      flags: [...flags], visited: [...visited], missions: missions.serialize(),
    };
  }
  let saveT = 0;
  function saveNow() {
    if (NOSAVE || !player.alive || !level || swapping) return;
    data.storeSave(snapshotSave());
  }
  addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

  // ── boot flow: menu → cinematic → first level ──
  const saved = NOSAVE ? null : await data.loadSave();
  if (START_LEVEL) {
    await gotoLevel(START_LEVEL);
  } else if (SHOT || AUTO || WPOSE) {
    await gotoLevel(cfg.startLevel === 'home' ? 'street1' : cfg.startLevel).catch(() => gotoLevel(cfg.startLevel));
  } else {
    ui.setBoot('ready', 1);
    ui.hideBoot(false);   // drop the boot screen but keep the HUD for gameplay
    const choice = await showMenu({ hasSave: !!saved, title: cfg.title, subtitle: cfg.subtitle, apiLive: data.api });
    unlockAudio(); audio.unlock();
    if (choice.mode === 'continue' && saved) {
      for (const f of (saved.flags || [])) flags.add(f);
      for (const v of (saved.visited || [])) visited.add(v);
      missions.load(saved.missions);
      player.load(saved.p);
      ui.buildWeapons();
      await gotoLevel(saved.level || cfg.startLevel, { atPos: { x: saved.p?.pos?.[0] || 0, z: saved.p?.pos?.[1] || 0, yaw: saved.p?.yaw || 0 } });
      ui.toast('💾 Welcome back to the apocalypse.');
    } else {
      await data.clearSave();
      if (!SHOT) await playCinematic();
      await gotoLevel(cfg.startLevel);
    }
  }
  if (CINE) { await playCinematic(); }

  if (SHOT) { document.body.classList.add('shot-mode'); controls.state.dist = 16; }
  ui.setObjective(missions.text());
  ui.setBoot('ready', 1);
  setTimeout(ui.hideBoot, 250);

  // ── spawners ──
  let ambT = 4;
  function ambientTick(dt) {
    const amb = level?.ambient;
    if (!amb) return;
    ambT -= dt;
    const cap = (amb.maxAlive || 10) + (amb.growth ? Math.min(12, player.kills * 0.15) : 0);
    const alive = zombies.filter(z => z.alive).length;
    if (ambT <= 0 && alive < cap) {
      ambT = (amb.rate || 5) * rand(0.7, 1.3) / (amb.growth ? (1 + player.kills / 80) : 1);
      // spawn out past the fog edge, away from the player, inside the barriers
      let x, z, tries = 0;
      do {
        const a = rand(0, 6.28), r = rand(28, 46);
        x = player.pos.x + Math.cos(a) * r; z = player.pos.z + Math.sin(a) * r; tries++;
      } while ((Math.abs(x) > level.bounds.hx - 3 || Math.abs(z) > level.bounds.hz - 3) && tries < 10);
      x = clamp(x, -level.bounds.hx + 3, level.bounds.hx - 3);
      z = clamp(z, -level.bounds.hz + 3, level.bounds.hz - 3);
      if (Math.hypot(x - player.pos.x, z - player.pos.z) > 12) spawnZombie(pick(amb.types || ['walker']), x, z);
    }
  }
  function zoneTick(dt) {
    if (!level) return;
    for (const zone of level.zones) {
      const s = zone.def;
      if (!s.respawn || !zone.seeded) continue;
      if (zone.alive >= (s.maxAlive || s.count || 1)) continue;
      zone.timer -= dt;
      if (zone.timer <= 0) {
        zone.timer = (s.rate || 6) * rand(0.8, 1.3);
        const p = zonePoint(s);
        if (p) spawnZombie(pick(s.types || ['walker']), p.x, p.z, zone);
      }
    }
  }

  // ── collisions + line of sight (current level's shapes) ──
  function zCollide(p) {
    if (!level) return;
    for (const b of level.colliders.boxes) {
      const minX = b.x - b.hx - 0.5, maxX = b.x + b.hx + 0.5, minZ = b.z - b.hz - 0.5, maxZ = b.z + b.hz + 0.5;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;
      const dl = p.x - minX, dr = maxX - p.x, dd = p.z - minZ, du = maxZ - p.z, m = Math.min(dl, dr, dd, du);
      if (m === dl) p.x = minX; else if (m === dr) p.x = maxX; else if (m === dd) p.z = minZ; else p.z = maxZ;
    }
    for (const cc of level.colliders.circles) {
      const minD = cc.r + 0.45, dx = p.x - cc.x, dz = p.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { p.x = cc.x + (dx / d) * minD; p.z = cc.z + (dz / d) * minD; }
    }
    p.x = clamp(p.x, -level.bounds.hx + 1, level.bounds.hx - 1);
    p.z = clamp(p.z, -level.bounds.hz + 1, level.bounds.hz - 1);
  }
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
    if (!level) return false;
    for (const b of level.colliders.boxes) if (segHitsBox(from.x, from.z, to.x, to.z, b)) return true;
    return false;
  }
  function resolvePlayer() {
    if (!level) return;
    const px = player.pos;
    for (const cc of level.colliders.circles) {
      const minD = cc.r + CFG.playerRadius;
      const dx = px.x - cc.x, dz = px.z - cc.z, d = Math.hypot(dx, dz);
      if (d < minD && d > 1e-5) { px.x = cc.x + (dx / d) * minD; px.z = cc.z + (dz / d) * minD; }
    }
    for (const b of level.colliders.boxes) {
      const pr = CFG.playerRadius;
      const minX = b.x - b.hx - pr, maxX = b.x + b.hx + pr, minZ = b.z - b.hz - pr, maxZ = b.z + b.hz + pr;
      if (px.x <= minX || px.x >= maxX || px.z <= minZ || px.z >= maxZ) continue;
      const dl = px.x - minX, dr = maxX - px.x, dd = px.z - minZ, du = maxZ - px.z, m = Math.min(dl, dr, dd, du);
      if (m === dl) px.x = minX; else if (m === dr) px.x = maxX; else if (m === dd) px.z = minZ; else px.z = maxZ;
    }
  }

  // ── WebGL context recovery (mobile background/foreground) ──
  let glLost = false, resumeEl = null;
  const glCanvas = renderer.domElement;
  glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glLost = true; showResume(); }, false);
  glCanvas.addEventListener('webglcontextrestored', () => { glLost = false; clock.getDelta(); hideResume(); }, false);
  addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    clock.getDelta();
    setTimeout(() => { if (renderer.getContext().isContextLost()) { glLost = true; showResume(); } }, 350);
  });
  function showResume() {
    if (resumeEl) { resumeEl.style.display = 'flex'; return; }
    resumeEl = document.createElement('div');
    resumeEl.id = 'gl-resume';
    resumeEl.innerHTML = `<div class="card"><div class="t">▶ Resume</div><div class="s">The 3D view was dropped while the game was in the background. Tap to restore it.</div><button>Tap to resume</button></div>`;
    resumeEl.querySelector('button').onclick = () => {
      if (renderer.getContext().isContextLost()) { saveNow(); location.reload(); return; }
      glLost = false; clock.getDelta(); hideResume();
    };
    document.body.appendChild(resumeEl);
  }
  function hideResume() { if (resumeEl) resumeEl.style.display = 'none'; }

  // ── loop ──
  const clock = new THREE.Clock();
  let t = 0, fps = 60, frames = 0, fpsT = 0, mmT = 0, objT = 0, groanT = 3, frameCount = 0;
  let autoT = 0, autoMv = { x: 0, z: 0, run: false };

  function loop() {
    requestAnimationFrame(loop);
    if (glLost) { clock.getDelta(); return; }
    let dt = clamp(clock.getDelta(), 0, 0.05);
    frames++; fpsT += dt; if (fpsT >= 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
    t += dt;

    if (!paused && level && !swapping) {
      // 1. move
      if (AUTO) autoTick(dt);
      player.move(dt, t, AUTO ? autoMv : controls.getMove());
      resolvePlayer();
      rig.group.position.x = player.pos.x; rig.group.position.z = player.pos.z;

      // 2. auto-aim
      let target = null;
      const def = player.weaponDef();
      if (player.alive) {
        const rng = def.kind === 'melee' ? 5 : Math.min(CFG.aimRange, def.range);
        target = aim.update({ muzzlePos: player.muzzle(), faceDir: player.faceDir(), zombies, range: rng, cone: CFG.aimCone, blocked: level.interior ? null : losBlocked });
        aim.setVisible(true);
      } else aim.setVisible(false);

      // 3. combat
      player.combat(dt, t, target);

      // 4. zombies
      for (const z of zombies) z.update(dt, t, player);
      for (let i = zombies.length - 1; i >= 0; i--) if (zombies[i].remove) { if (zombies[i].alive && zombies[i].zone) zombies[i].zone.alive--; zombies[i].dispose?.(); zGroup.remove(zombies[i].group); zombies.splice(i, 1); }
      if (player.alive) { ambientTick(dt); zoneTick(dt); }

      // 5. pickups + drops
      for (const pk of activePickups()) {
        if (pk.taken) continue;
        if (Math.hypot(player.pos.x - pk.pos.x, player.pos.z - pk.pos.z) < CFG.pickupRange) applyPickup(pk);
      }
      for (let i = drops.length - 1; i >= 0; i--) if (drops[i].taken) drops.splice(i, 1);
      for (let i = level.pickups.length - 1; i >= 0; i--) if (level.pickups[i].taken) level.pickups.splice(i, 1);

      // 6. hotspots
      refreshPrompt();
      checkTriggers();

      // 7. world tick
      level.tick(dt, t);
      env.tickSky(dt);
      tickFx(dt);
      if (!LITE && !level.interior) { env.sun.position.set(player.pos.x + CFG.sunDir[0], CFG.sunDir[1], player.pos.z + CFG.sunDir[2]); env.sunTarget.position.copy(player.pos); }

      mmT += dt; if (mmT > 0.18) { mmT = 0; minimap.update({ player, zombies, level, pickups: activePickups() }); }
      objT += dt; if (objT > 1) {
        objT = 0;
        if (missions.check()) ui.setObjective(missions.text());
        saveT += 1; if (saveT >= 8) { saveT = 0; saveNow(); }
      }
      groanT -= dt; if (groanT <= 0) { groanT = rand(4, 9); if (zombies.some(z => z.alive && Math.hypot(z.group.position.x - player.pos.x, z.group.position.z - player.pos.z) < 22)) audio.groan(); }
    }

    ui.bars();
    controls.tick(dt);
    renderer.render(scene, camera);
    frameCount++;
    if (SHOT && frameCount === 12) window.__shotReady = true;
  }
  loop();

  function autoTick(dt) {
    autoT -= dt;
    if (autoT <= 0) { autoT = rand(1.5, 3); const a = rand(0, 6.28); autoMv = { x: Math.cos(a), z: Math.sin(a), run: Math.random() < 0.3 }; }
  }

  // ── test hooks ──
  window.__game = { player, controls, aim, zombies, doInteract, gotoLevel, get level() { return level; }, get flags() { return flags; }, scene, camera, missions };
  window.__state = {
    get fps() { return Math.round(fps); },
    get pos() { return { x: +player.pos.x.toFixed(1), z: +player.pos.z.toFixed(1) }; },
    get hp() { return Math.ceil(player.hp); },
    get ammo() { return player.ammo; },
    get weapon() { return player.curWeapon; },
    get weapons() { return [...player.weapons]; },
    get kills() { return player.kills; },
    get level() { return level?.id || null; },
    get zombies() { return zombies.filter(z => z.alive).length; },
    get target() { return player.target ? player.target.type : null; },
    get mission() { return missions.cur()?.id || null; },
    get flags() { return [...flags]; },
    get api() { return data.api; },
    get errors() { return window.__errors; },
  };
  window.__camera = camera;

  if (WPOSE) createWposeTuner(player, controls, { setPaused: (v) => { paused = v; zGroup.visible = !v; aim.setVisible(!v); } });
}
