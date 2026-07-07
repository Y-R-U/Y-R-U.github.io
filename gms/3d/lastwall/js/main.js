// LASTWALL — boot + game loop + mode/level state machine.
// States: TITLE → (INTRO) → PLAY ⇄ DRAFT/PAUSE → DEAD/WIN → TITLE
import * as THREE from 'three';
import { CFG, MODES, LITE } from './config.js';
import { rand, pick, onRects, inRect } from './utils.js';
import { buildWorld } from './world.js';
import { buildLevel, collapseCrack } from './wallgen.js';
import { initRagdolls, tickRagdolls, setRects, spawnRagdoll } from './ragdoll.js';
import { makeControls } from './controls.js';
import { makePlayer } from './player.js';
import { WEAPONS, TEMP_POOL, SUPER_POOL } from './weapons.js';
import * as EN from './enemies.js';
import * as fx from './fx.js';
import { sfx, unlock, bossMusic } from './audio.js';
import * as ui from './ui.js';
import { meta } from './meta.js';
import { rollChoices } from './powerups.js';
import { levelDef, draftsOwed } from './levels.js';
import { INTRO, BEATS, FINALE } from './story.js';

// ---------- renderer / scene ----------
const container = document.getElementById('game-container');
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LITE;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CFG.cam.fov, innerWidth / innerHeight, 0.1, 1200);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  world?.composer?.setSize(innerWidth, innerHeight);
});

const world = buildWorld(scene, renderer, camera);

// ---------- state ----------
let state = 'BOOT';
let levelRoot = null, level = null, P = null, run = null, controls = null;
let boss = null, bossLocked = false, superBtnBound = false;
const errors = [];
addEventListener('error', e => errors.push(String(e.message).slice(0, 200)));

const controlsCb = {
  pause() { if (state === 'PLAY') openPause(); else if (state === 'PAUSE') closePause(); },
  superFire() { if (state === 'PLAY' && P && !ui.txOpen()) P.superFire(); },
  dropTemp() { if (state === 'PLAY' && P?.temp) { P.dropTemp(); ui.toast('WEAPON DROPPED'); } },
  anyKey(code) { unlock(); if ((code === 'Space' || code === 'Enter' || code === 'pointer') && ui.txOpen()) ui.txSkip(); },
};
controls = makeControls(camera, renderer.domElement, controlsCb);
addEventListener('pointerdown', unlock); // audio needs a gesture; UI buttons unlock via their own sfx

// ---------- run / level flow ----------
function newRun(mode, startLevel) {
  run = {
    mode, n: startLevel, serum: 0, kills: 0,
    mods: meta.runMods(), claimed: new Set(), taken: new Set(),
    salt: (Math.random() * 1e9) | 0,
  };
  // rerolls live on run.mods.rerolls so the MULLIGAN powerup (+2) actually lands
  loadLevel(startLevel, true);
}

function disposeLevel() {
  if (!levelRoot) return;
  // the player (and its weapon meshes/materials) persists across levels —
  // pull it out BEFORE the dispose traversal or its materials get torn down
  if (P?.h?.group?.parent) P.h.group.removeFromParent();
  scene.remove(levelRoot);
  levelRoot.traverse(o => {
    if (o.isMesh || o.isInstancedMesh || o.isLine || o.isPoints) {
      if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) { if (!m || m.userData?.shared) continue; if (m.map) m.map.dispose(); m.dispose?.(); }
    }
  });
  levelRoot = null;
}

function loadLevel(n, isRunStart = false) {
  // a knocked-down (alive) player must recover its ragdolled body parts
  // BEFORE the old level (which owns them) is disposed
  if (!isRunStart && P?.rag && P.alive) P.standUp(P.rag);
  disposeLevel();
  ui.bossBar(null); boss = null; bossLocked = false; bossMusic(false);
  const def = levelDef(run.mode, n, run.salt);
  run.n = n; run.def = def;
  levelRoot = new THREE.Group();
  scene.add(levelRoot);
  level = buildLevel(def.seed, n);
  levelRoot.add(level.group);

  fx.initFx(levelRoot);
  initRagdolls(levelRoot, level.rects, {
    slam: EN.ragCallbacks.slam,
    fall: EN.ragCallbacks.fall,
    splat: EN.ragCallbacks.splat,
    land: EN.ragCallbacks.land,
    getup(rag) { if (rag.entIsPlayer) P.standUp(rag); else EN.ragCallbacks.getup(rag); },
  });

  // player (fresh at run start; persists across levels within a run)
  if (isRunStart) {
    P = makePlayer(levelRoot, meta, run.mods);
    P.onDeath = onPlayerDeath;
    P.onTempGone = why => ui.toast(why === 'SPENT' ? 'WEAPON SPENT' : why);
    P.onSecondWind = () => { ui.announce('SECOND WIND', 'the blood refuses to stop'); sfx.boost(); fx.slowmo(.6); };
    bindSuperBtn();
  } else {
    levelRoot.add(P.h.group);
    P.rag = null; P.ragging = false;
  }
  P.level = level;
  P.maxHp = CFG.player.hp + run.mods.hpAdd;
  if (isRunStart) P.hp = P.maxHp;
  P.place(level.start.x, level.start.z);
  controls.snap(level.start.x, level.start.z);

  EN.initEnemies(levelRoot, level, () => P, {
    toast: ui.toast,
    mods: () => run.mods,
    serum(amt) { const a = Math.round(amt * run.mods.serum); run.serum += a; meta.addSerum(a); },
    bossDown() {
      bossLocked = false; ui.bossBar(null); bossMusic(false);
      ui.announce('GUARDIAN DOWN', 'the gate opens');
      sfx.gate();
    },
    longDrop() { fx.slowmo(.5); },
  });

  // pickups
  for (const p of level.pickups) {
    p.taken = false;
    p.mesh = fx.pickupMesh(p.type);
    p.mesh.position.set(p.x, CFG.wallH + 1, p.z);
    levelRoot.add(p.mesh);
  }
  // crate drops
  for (const cr of level.crates) {
    cr.drop = () => {
      const t = Math.random() < .5 ? 'serum' : Math.random() < .6 ? 'med' : 'boost';
      level.pickups.push(spawnPickup(t, cr.x, cr.z));
    };
  }

  autoWp = 0; // reset the soak-bot's route for the new level
  ui.setObjective(def.boss ? `${def.name} — KILL THE GUARDIAN` : `${def.name} — REACH THE FAR GATE`);
  ui.announce(def.name.toUpperCase(), run.mode === 'story' ? 'the wall goes north' : 'no end to it');

  // level-start order: drafts → story (game PAUSED until tap) → play
  const beat = run.mode === 'story' ? (n === 100 ? FINALE : BEATS[n]) : null;
  const begin = () => {
    if (beat && !MODES.shot) {
      state = 'STORY';
      ui.transmit(beat.from, beat.text, () => { if (state === 'STORY') state = 'PLAY'; }, { manual: true });
    } else state = 'PLAY';
  };
  const owed = draftsOwed(n, run.claimed);
  if (owed.length && !MODES.shot) { state = 'DRAFT'; chainDrafts(owed, begin); }
  else begin();

  ui.el.hud.classList.remove('hidden');
  ui.updateHUD(P, run, EN.kills());
  if (isRunStart) ui.setHint(isTouch() ? 'drag to move · 2 fingers to orbit · weapons auto-aim' : 'WASD move · SPACE super · Q drop weapon · P pause');
  setTimeout(() => ui.setHint(null), 6000);
}

function spawnPickup(type, x, z) {
  const p = { x, z, type, taken: false, rng: Math.random() };
  p.mesh = fx.pickupMesh(type);
  p.mesh.position.set(x, CFG.wallH + 1, z);
  levelRoot.add(p.mesh);
  return p;
}

function chainDrafts(owed, then) {
  const k = owed[0];
  const roll = () => {
    ui.showDraft(rollChoices(run.taken), run.mods.rerolls,
      p => { // pick
        p.apply(run.mods);
        run.taken.add(p.id);
        run.claimed.add(k);
        recomputePlayer(p);
        ui.hideDraft();
        const rest = owed.slice(1);
        if (rest.length) chainDrafts(rest, then);
        else then();
      },
      () => { if (run.mods.rerolls > 0) { run.mods.rerolls--; roll(); } });
  };
  roll();
}

function recomputePlayer(p) {
  const old = P.maxHp;
  P.maxHp = Math.max(40, CFG.player.hp + run.mods.hpAdd);
  if (P.maxHp > old) P.hp += P.maxHp - old;
  P.hp = Math.min(P.hp, P.maxHp);
  ui.toast(p.name, 'drop');
}

// ---------- pickups / boosts ----------
function applyPickup(p) {
  p.taken = true;
  levelRoot.remove(p.mesh);
  sfx.pickup();
  switch (p.type) {
    case 'loot': {
      const id = TEMP_POOL[Math.floor(p.rng * TEMP_POOL.length)];
      const def = WEAPONS[id];
      P.temp = { id, def, ammo: def.ammo, time: def.time };
      ui.toast(def.name + ' ACQUIRED', 'drop');
      break;
    }
    case 'super': {
      const id = SUPER_POOL[Math.floor(p.rng * SUPER_POOL.length)];
      P.super = { id, def: WEAPONS[id], charge: .5 };
      ui.announce(WEAPONS[id].name, 'space / tap meter to unleash');
      sfx.boost();
      break;
    }
    case 'boost': {
      const r = p.rng;
      if (r < .55) { P.boosts.dmg = { mult: 3, t: 12 * run.mods.boostDur, max: 12 * run.mods.boostDur }; ui.announce('ADRENAL SURGE', '×3 damage — LAUNCH THEM'); }
      else if (r < .8) { P.boosts.spd = { mult: 1.5, t: 10 * run.mods.boostDur, max: 10 * run.mods.boostDur }; ui.toast('HASTE', 'drop'); }
      else { P.boosts.shield = { t: 8 * run.mods.boostDur, max: 8 * run.mods.boostDur }; ui.toast('BULWARK', 'drop'); }
      sfx.boost();
      break;
    }
    case 'med': P.heal(45); ui.toast('+45 HP', 'drop'); break;
    case 'serum': { const a = Math.round(30 * run.mods.serum); run.serum += a; meta.addSerum(a); ui.toast('+' + a + ' SERUM', 'drop'); break; }
  }
}

function bindSuperBtn() {
  if (superBtnBound) return; superBtnBound = true;
  document.getElementById('wpn-super').style.pointerEvents = 'auto';
  document.getElementById('wpn-super').addEventListener('pointerdown', e => { e.stopPropagation(); P?.superFire(); });
  document.getElementById('btn-pause').addEventListener('pointerdown', e => { e.stopPropagation(); controlsCb.pause(); });
}

// ---------- level events ----------
function tickLevelEvents(dt) {
  // cracks
  for (const c of level.cracks) {
    if (c.done) continue;
    if (P.z < c.at - 1.6 && P.x > c.x0 - 1 && P.x < c.x1 + 1) {
      const box = collapseCrack(c);
      setRects(level.rects);
      fx.collapseFx(box);
      sfx.rumble();
      ui.announce('THE SPAN FALLS', 'no way back');
      // everything standing on it goes down with it
      for (const e of [...EN.enemies]) {
        if (e.dead || e.state === 'rag') continue;
        if (inRect(c.rectA, e.x, e.z)) {
          e.rag = spawnRagdoll(e.h, new THREE.Vector3(rand(-2, 2), -1, rand(-2, 2)), e, { dead: false });
          e.state = 'rag';
        }
      }
    }
  }
  // pickups
  for (const p of level.pickups) {
    if (p.taken) continue;
    p.mesh.rotation.y += dt * 2;
    p.mesh.position.y = CFG.wallH + 1 + Math.sin(perfNow() * .003 + p.x) * .18;
    if (Math.hypot(p.x - P.x, p.z - P.z) < 1.5) applyPickup(p);
  }
  // boss gate
  if (run.def.boss && !boss && Math.hypot(P.x - level.endGate.x, P.z - level.endGate.z) < 60) {
    boss = EN.spawnBoss(level.endGate.x, level.endGate.z - 4);
    bossLocked = true;
    bossMusic(true);
    ui.announce('GATE GUARDIAN', 'it remembers being human');
  }
  if (boss) {
    ui.bossBar(boss.dead ? null : 'GATE GUARDIAN', Math.max(0, boss.hp / boss.maxHp));
    if (boss.dead) boss = null;
  }
  // exit gate: portcullis rises as you approach (when unlocked); walking under
  // the arch completes the level — no hidden trigger spot, no button to hunt for
  const eg = level.endGate;
  const gdx = P.x - eg.x, gdz = P.z - eg.gz;
  if (!bossLocked && Math.hypot(gdx, gdz) < 26) {
    if (!eg.opened) { eg.opened = true; sfx.gate(); ui.toast('THE GATE OPENS'); }
    const bars = eg.gate.userData.bars;
    bars.position.y = Math.min(bars.position.y + dt * 3.2, 5.2);
  }
  if (!bossLocked && P.alive && !P.ragging && gdz < 3.5 && Math.abs(gdx) < 9) levelComplete();
}

function levelComplete() {
  if (state !== 'PLAY') return;
  state = 'FADE';
  const n = run.n;
  const bonus = Math.round((CFG.serumLevelBonus + n * 4) * run.mods.serum);
  run.serum += bonus; meta.addSerum(bonus);
  if (run.mode === 'story') meta.completeStory(n);
  else meta.reachEndless(n + 1);
  sfx.levelup();
  if (run.mode === 'story' && n >= 100) { winStory(); return; }
  ui.announce('SECTION CLEAR', `+${bonus} serum`);
  ui.fadeBlack(() => loadLevel(n + 1));
}

function winStory() {
  state = 'WIN';
  ui.modal('MERIDIAN', `
    <p class="story-para">The last gate closes behind you. Hands — human hands — pull you inside.</p>
    <p class="story-para">They take your blood. They grow the cure. It works.</p>
    <p class="story-para">Below the wall, for the first time in three years… quiet.</p>
    <div class="stat-row"><span>Serum banked this run</span><b>${run.serum} ⬢</b></div>
    <div class="stat-row"><span>Kills</span><b>${EN.kills()}</b></div>`,
    [['TITLE', 'primary', () => { ui.closeModal(); toTitle(); }]]);
}

function onPlayerDeath() {
  if (run.mode === 'endless') meta.reachEndless(run.n);
  // DYING immediately: blocks pause, gate completion, cracks — the sim keeps
  // running so the death ragdoll plays out. Token ties the modal to THIS run.
  state = 'DYING';
  const r = run;
  setTimeout(() => { if (run === r && state === 'DYING') { state = 'DEAD'; showDeathModal(); } }, 2400);
}

function showDeathModal() {
  const gates = run.mode === 'story' ? meta.storyGates() : meta.endlessGates();
  const retryAt = gates[gates.length - 1];
  ui.modal('COURIER LOST', `
    <p class="story-para">${run.mode === 'story' ? 'WARDEN: "…logging courier loss at section ' + run.n + '. Waking the next one. The blood remembers what you learned."' : 'The wall keeps going. You did not.'}</p>
    <div class="stat-row"><span>Reached</span><b>${run.def.name}</b></div>
    <div class="stat-row"><span>Kills</span><b>${EN.kills()}</b></div>
    <div class="stat-row"><span>Serum banked</span><b>+${run.serum} ⬢</b></div>`,
    [
      [`RUN AGAIN <small>from ${run.mode === 'story' ? 'section' : 'depth'} ${retryAt}</small>`, 'primary', () => { ui.closeModal(); newRun(run.mode, retryAt); }],
      ['UPGRADES', '', () => { ui.closeModal(); state = 'META'; ui.renderMeta(() => { state = 'DEAD'; showDeathModal(); }); }],
      ['TITLE', 'ghost', () => { ui.closeModal(); toTitle(); }],
    ]);
}

// ---------- pause / title / intro ----------
function openPause() {
  state = 'PAUSE';
  ui.modal('PAUSED', `<div class="stat-row"><span>${run.def.name}</span><b>${run.mode.toUpperCase()}</b></div>
    <div class="stat-row"><span>Serum this run</span><b>${run.serum} ⬢</b></div>`,
    [
      ['RESUME', 'primary', closePause],
      ['ABANDON RUN', 'ghost', () => { ui.closeModal(); toTitle(); }],
    ]);
}
function closePause() { ui.closeModal(); if (state === 'PAUSE') state = 'PLAY'; }

function toTitle() {
  state = 'TITLE';
  ui.el.hud.classList.add('hidden');
  ui.bossBar(null); bossMusic(false);
  // showcase wall behind the menu
  disposeLevel(); P = null; level = null; run = null;
  levelRoot = new THREE.Group(); scene.add(levelRoot);
  levelRoot.add(buildLevel(0xBEEF, 3).group);
  ui.showTitle({
    story() {
      const gates = meta.storyGates();
      const go = lv => {
        ui.hideGates(); ui.hideTitle();
        if (lv === 1 && !meta.seenIntro && !MODES.nointro) playIntro(() => newRun('story', 1));
        else newRun('story', lv);
      };
      if (gates.length === 1) go(1);
      else ui.showGates('START AT GATE', gates, null, go, null);
    },
    endless() {
      const gates = meta.endlessGates();
      const go = lv => { ui.hideGates(); ui.hideTitle(); newRun('endless', lv); };
      if (gates.length === 1) go(1);
      else ui.showGates('CHOOSE YOUR DEPTH', gates, null, go, null);
    },
    meta() { state = 'META'; ui.renderMeta(() => { state = 'TITLE'; }); },
    help() {
      ui.modal('HOW TO PLAY', `
        <p class="story-para"><b>Move</b>: ${isTouch() ? 'hold & drag anywhere. Two fingers to orbit.' : 'WASD. Mouse-drag to orbit. Shift to sprint.'}</p>
        <p class="story-para"><b>Fight</b>: weapons auto-aim and auto-swing. Get close for melee, keep range for the gun. Temp weapons from <b>▣ caches</b> run out; the starter never does.</p>
        <p class="story-para"><b>Launch</b>: knockback scales with damage. Grab a <b>⚡ boost</b> and hits become launches — off the wall is an instant kill. Watch the parapet gaps; what applies to them applies to you.</p>
        <p class="story-para"><b>Cracked spans</b> collapse behind you. One way only.</p>
        <p class="story-para"><b>Superweapons ★</b> recharge slowly. ${isTouch() ? 'Tap the meter' : 'SPACE'} to unleash.</p>
        <p class="story-para"><b>Die</b>: keep your serum ⬢, buy permanent upgrades, run again. Gates every 10 sections save your progress.</p>`,
        [['CLOSE', 'primary', () => ui.closeModal()]]);
    },
  });
}

function playIntro(then) {
  state = 'INTRO';
  meta.seenIntro = true;
  let i = 0;
  const next = () => {
    if (i >= INTRO.length) { ui.fadeBlack(then); return; }
    const s = INTRO[i++];
    ui.transmit(s.from, s.text, next);
  };
  next();
}

// ---------- auto bot (?auto soak testing) ----------
let autoWp = 0;
function autoInput() {
  if (!P.alive || P.ragging) return { x: 0, z: 0, mag: 0, sprint: false };
  const wps = level.waypoints;
  if (autoWp >= wps.length) autoWp = wps.length - 1;
  let t = wps[autoWp];
  if (Math.hypot(t.x - P.x, t.z - P.z) < 6 && autoWp < wps.length - 1) { autoWp++; t = wps[autoWp]; }
  // final approach: walk through the arch
  if (autoWp === wps.length - 1) t = { x: level.endGate.x, z: level.endGate.gz + 1 };
  const dx = t.x - P.x, dz = t.z - P.z, d = Math.hypot(dx, dz) || 1;
  if (P.super?.charge >= 1 && EN.enemies.filter(e => !e.dead && Math.hypot(e.x - P.x, e.z - P.z) < 8).length >= 3) P.superFire();
  return { x: dx / d, z: dz / d, mag: 1, sprint: d > 20 };
}
setInterval(() => { // auto: clear blocking UI
  if (!MODES.auto) return;
  if (state === 'DRAFT') document.querySelector('#draft-cards .pcard')?.click();
  else if (state === 'DEAD' || state === 'WIN') document.querySelector('#modal-btns .mbtn')?.click();
  if (ui.txOpen()) { ui.txSkip(); ui.txSkip(); }
}, 1500);

// ---------- loop ----------
const clock = new THREE.Clock();
let fps = 60, perfT = 0;
const perfNow = () => performance.now();

function frame() {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  fps = fps * .95 + (1 / Math.max(1e-3, rawDt)) * .05;

  const playing = state === 'PLAY' || state === 'DYING'; // DYING: sim runs, triggers don't
  const dt = playing ? rawDt * fx.timeScale(rawDt) : 0;

  if (level && P) {
    if (playing) {
      const input = MODES.auto ? autoInput() : controls.read();
      P.tick(dt, t, input);
      EN.tickEnemies(dt, t);
      tickRagdolls(dt);
      if (state === 'PLAY') tickLevelEvents(dt);
      ui.updateHUD(P, run, EN.kills());
    }
    const px = P.ragging && P.rag ? P.rag.pts.hip.x : P.x;
    const pz = P.ragging && P.rag ? P.rag.pts.hip.z : P.z;
    controls.updateCamera(rawDt, px, pz, P.vx, P.vz, Math.hypot(P.vx, P.vz));
    fx.applyShake(camera, rawDt);
    world.tick(t, rawDt, px, pz);
    fx.tickFx(playing ? dt : rawDt * .2, t);
  } else {
    // title ambience: slow drift over a showcase wall
    world.tick(t, rawDt, Math.sin(t * .05) * 20, -t * 2 % 400);
    camera.position.set(Math.sin(t * .05) * 30, CFG.wallH + 14, -((t * 2) % 400) + 26);
    camera.lookAt(Math.sin(t * .05) * 20, CFG.wallH, -((t * 2) % 400));
  }

  if (world.composer && !LITE) world.composer.render();
  else renderer.render(scene, camera);

  // telemetry for headless testing
  if ((perfT += rawDt) > .5) {
    perfT = 0;
    window.__state = {
      fps: Math.round(fps), state, level: run?.n || 0, mode: run?.mode || '',
      hp: P ? Math.round(P.hp) : 0, alive: P?.alive ?? false,
      enemies: EN.enemies.length, kills: EN.kills(), serum: run?.serum || 0,
      pos: P ? [Math.round(P.x), Math.round(P.z)] : [0, 0], errors,
    };
  }
}

// ---------- boot ----------
window.__game = { get P() { return P; }, get level() { return level; }, get run() { return run; }, EN, loadLevel, newRun, meta };

(async function boot() {
  ui.bootProgress(.3, 'forging the wall…');
  // pre-warm a level offscreen so first level load is instant-ish
  await new Promise(r => setTimeout(r, 50));
  ui.bootProgress(.7, 'waking the warden…');
  await new Promise(r => setTimeout(r, 50));
  ui.bootProgress(1, 'gate zero');
  setTimeout(() => {
    ui.el.boot.style.opacity = 0;
    setTimeout(() => ui.el.boot.remove(), 500);
    if (MODES.lvl || MODES.shot || MODES.auto) {
      newRun(MODES.endless ? 'endless' : 'story', MODES.lvl || 1);
      if (MODES.shot) { ui.el.hud.classList.add('hidden'); }
    } else toTitle();
  }, 300);
  frame();
})();

function isTouch() { return matchMedia('(pointer: coarse)').matches; }
