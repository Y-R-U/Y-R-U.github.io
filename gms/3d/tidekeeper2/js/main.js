/* ═══════════════════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════════════════ */

import * as THREE from 'three';
import { $, clamp, seedRng, rnd, rr, pick, money$, ago } from './util.js';
import { CFG } from './config.js';
import { World } from './render/world.js';
import { Orbit } from './render/camera.js';
import { buildPost } from './render/post.js';
import { FISH_U } from './render/fish.js';
import { TANK_U } from './render/tankview.js';
import { Game } from './game/game.js';
import { Coach } from './game/coach.js';
import { Save } from './game/save.js';
import { UI } from './ui/ui.js';
import { Modal } from './ui/modal.js';
import { Audio } from './audio.js';
import { SPECIES, SP } from './data/species.js';
import { PLANTS, DECOR } from './data/flora.js';
import { makeFish } from './sim/biology.js';
import { placeFish } from './sim/behaviour.js';
import { GOALS } from './data/progress.js';

const QS = new URLSearchParams(location.search);
const LITE = QS.has('lite');
const SHOT = QS.has('shot');
const AUTO = QS.has('auto');
const FRESH = QS.has('fresh');

function boot() {
  const renderer = new THREE.WebGLRenderer({
    antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true, alpha: false,
  });
  const DPR = Math.min(window.devicePixelRatio || 1, LITE ? 1.1 : 2);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;  /* the grade pass does the tonemap */
  renderer.domElement.id = 'gl';
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050e16);
  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.08, 160);

  const world = new World(scene, renderer);
  const orbit = new Orbit(camera, renderer.domElement);
  const post = buildPost(renderer, scene, camera, { lite: LITE, dpr: DPR });

  if (FRESH) Save.wipe(); else Save.load();
  const G = new Game(world, orbit, scene, camera);
  G.save = Save.data;
  G.renderer = renderer;
  const ui = new UI(G);
  ui.initPhoto(post);
  G.start();
  const coach = new Coach(G);
  G.coach = coach;

  window.__TK2 = G;
  G.api = { SPECIES, SP, PLANTS, DECOR, ui, coach, post, world, orbit, Save, Modal, makeFish, placeFish };

  G.renderOnce = () => { renderer.info.reset(); post.composer.render(); };

  /* ── picking ──────────────────────────────────────────────────────────── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerup', e => {
    if (orbit.moved > 9 || G.photo || Modal.open) return;
    ndc.x = (e.clientX / innerWidth) * 2 - 1;
    ndc.y = -(e.clientY / innerHeight) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    const meshes = [...world.batches.values()].map(b => b.mesh);
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length) {
      const h = hits[0];
      const b = [...world.batches.values()].find(x => x.mesh === h.object);
      const f = b && b.at[h.instanceId];
      if (f) { ui.showFishCard(f); Audio.blip(900, 0.07, 'sine', 0.04); return; }
    }
    G.selected = null; ui.hideFishCard(); G.setFollow(null);
  });

  /* ── resize ───────────────────────────────────────────────────────────── */
  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    post.setSize(w, h);
    orbit.refit();
    world.tank.snow.material.uniforms.uPix.value = DPR * (h / 900);
    world.tank.foodPts.material.uniforms.uPix.value = DPR * (h / 900);
  }
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  /* audio has to wait for a gesture; browsers insist */
  const wake = () => {
    Audio.init(); Audio.resume();
    Audio.setVolume(Save.data.settings.vol ?? 0.6); Audio.fadeIn();
    removeEventListener('pointerdown', wake); removeEventListener('keydown', wake);
  };
  addEventListener('pointerdown', wake); addEventListener('keydown', wake);
  addEventListener('visibilitychange', () => { if (document.hidden) G.persist(); });
  addEventListener('beforeunload', () => G.persist());

  /* ── loop ─────────────────────────────────────────────────────────────── */
  let last = performance.now(), frames = 0, fpsT = 0, coachT = 0;
  const broke = new Set();
  window.__TK2_FRAMES = 0;
  function step(name, fn) {
    try { fn(); } catch (e) {
      if (!broke.has(name)) {
        broke.add(name);
        console.error('[tidekeeper] ' + name + ' failed:', e);
        ui.toast('Something went wrong in ' + name + '. The rest of the game keeps running.');
      }
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - last) / 1000, 0.1);
    last = now;
    TANK_U.uTime.value += rdt;
    FISH_U.uTime.value += rdt * (G.paused ? 0.25 : Math.min(G.speed, 3));
    post.grade.uniforms.uTime.value = now * 0.001;
    /* One stage throwing must not take the rest of the frame with it — a
       silent dead loop is the worst failure a no-build-step game can have. */
    step('tick',  () => G.tick(rdt));
    step('orbit', () => orbit.update(rdt));
    step('ui',    () => ui.update());
    coachT -= rdt;
    if (coachT <= 0) { coachT = 0.25; step('coach', () => coach.update()); }
    if (!G.photo) post.grade.uniforms.uFocus.value += (orbit.dist * 0.98 - post.grade.uniforms.uFocus.value) * 0.08;
    if (AUTO) autoPlay(G, rdt);
    G.renderOnce();
    window.__TK2_FRAMES++;
    frames++; fpsT += rdt;
    if (fpsT > 4) {
      const fps = frames / fpsT; frames = 0; fpsT = 0;
      if (fps < 26 && post.bloom && post.bloom.enabled) post.bloom.enabled = false;
      else if (fps > 48 && post.bloom && !post.bloom.enabled && !LITE) post.bloom.enabled = true;
    }
  }
  requestAnimationFrame(frame);

  /* fade the loading screen only once a real frame is on the glass */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__TK2_BOOTED__ = true;
    $('load').classList.add('gone');
    setTimeout(() => $('load').remove(), 1100);
    G.setSpeed(1);
    if (SHOT) (QS.get('shot') === 'fish' ? fishParade(G) : shotSetup(G));
    else if (AUTO) { Save.wipe(); }
    else if (G.offlineReport) showOffline(G);
  }));
}

function showOffline(G) {
  const r = G.offlineReport;
  Modal.push({
    kicker: 'While you were away', title: `${ago(r.gap)} passed`,
    body: r.earned > 1
      ? `<div class="reward"><div class="rw-ic">💵</div><div><b>${money$(r.earned)}</b><span>Taken at the door by ${r.fed} auto-fed ${r.fed === 1 ? 'tank' : 'tanks'}.</span></div></div>`
      : `<p>Nothing was lost — the fish simply waited. Fit an <b>auto-feeder</b> to a tank and it keeps earning while the game is closed.</p>`,
  });
}

/* ── a dressed tank for screenshots ──────────────────────────────────────── */
function shotSetup(G) {
  seedRng(97);
  /* a dressed tank with nothing on top of it: no coach, no goal popups */
  GOALS.forEach(g => { if (!G.save.goals.includes(g.id)) G.save.goals.push(g.id); });
  G.pending.length = 0;
  Modal.hide();
  /* a screenshot wants a tank with room in it, not a crowded starter */
  G.tanks = [];
  G.addTank('t75', 'fw', 'Display');
  const T = G.T;
  G.money = 999999;
  T.fish.length = 0; T.plants.length = 0; T.decor.length = 0;
  ['driftwood', 'rockpile', 'cave'].forEach(id => T.decor.push({ id, health: 1 }));
  ['val','val','val','amazon','amazon','rotala','rotala','carpet','carpet','javafern','anubias','anubias']
    .forEach(id => T.plants.push({ id, health: 1 }));
  [['neon', 16], ['rainbow', 6], ['cory', 6], ['guppy', 5], ['gourami', 2]]
    .forEach(([id, n]) => { for (let i = 0; i < n; i++) { const f = makeFish(T, id); f.len = SP[id].size * 0.92; f.health = 1; placeFish(T, f); } });
  T.hour = 13; T.bactA = T.bactN = 1; T.processed = 30;
  G.world.syncContents(T);
  G.orbit.yawG = G.orbit.yaw = 0.26;
  G.orbit.pitchG = G.orbit.pitch = 0.04;
  G.orbit.distG = G.orbit.dist = 12.5;
  G.orbit.pitchG = G.orbit.pitch = 0.07;
  G.orbit.goal.set(0, 1.7, 0); G.orbit.tgt.set(0, 1.7, 0);
  for (const id of ['dock', 'top-left', 'top-right', 'rail', 'fishcard', 'alerts', 'prompt', 'shelf'])
    { const e = $(id); if (e) e.style.display = 'none'; }
  G.coach.busy = true;
  setTimeout(() => { Modal.hide(); Modal.queue.length = 0; G.pending.length = 0; }, 300);
}

/* ── a line-up of species at a fixed distance, for judging the models ───── */
function fishParade(G) {
  seedRng(5);
  GOALS.forEach(g => { if (!G.save.goals.includes(g.id)) G.save.goals.push(g.id); });
  G.pending.length = 0; Modal.hide(); G.coach.busy = true;
  G.tanks = [];
  G.addTank('t125', 'fw', 'Parade');
  const T = G.T;
  const ids = (QS.get('sp') || 'rainbow,betta,clown,neon,angel,gourami').split(',');
  ids.forEach((id, i) => {
    if (!SP[id]) return;
    const f = makeFish(T, id, {});
    f.len = SP[id].size; f.health = 1; f.speedMul = 1;
    placeFish(T, f);
    f.__parade = [-(ids.length - 1) * 0.85 + i * 1.7, 2.3, 0.3];
  });
  T.hour = 13; T.bactA = T.bactN = 1;
  G.world.syncContents(T);
  G.orbit.yawG = G.orbit.yaw = 0; G.orbit.pitchG = G.orbit.pitch = 0.02;
  G.orbit.distG = G.orbit.dist = +(QS.get('d') || 5.0);
  G.orbit.goal.set(0, 2.3, 0); G.orbit.tgt.set(0, 2.3, 0);
  for (const id of ['dock', 'top-left', 'top-right', 'rail', 'fishcard', 'alerts', 'prompt', 'shelf'])
    { const e = $(id); if (e) e.style.display = 'none'; }
  /* hold the line-up still so the shot is repeatable */
  setInterval(() => {
    for (const f of T.fish) if (f.__parade) { f.pos.set(...f.__parade); f.vel.set(0.4, 0, -0.02); }
  }, 16);
}

/* ── headless soak: plays badly on purpose so the sim gets exercised ─────── */
function autoPlay(G, dt) {
  if (!G.T) return;
  G.autoT = (G.autoT || 0) - dt;
  if (G.autoT > 0) return;
  G.autoT = 1.3;
  G.setSpeed(3);
  const T = G.T;
  G.money += 60;
  const pool = SPECIES.filter(s => s.water === T.water && s.price <= G.money);
  if (pool.length && T.fish.filter(f => f.alive).length < 20 && rnd() < 0.45) G.buyFish(pick(pool).id, 2, true);
  if (rnd() < 0.6) G.feed('flake', 1);
  if (T.nh3 > 0.4 || T.no3 > 50) G.waterChange(0.25);
  if (T.fish.some(f => !f.alive)) G.siphon();
  if (rnd() < 0.2) { T.plants.push({ id: pick(PLANTS.filter(p => p.water === T.water)).id, health: 0.9 }); G.world.syncContents(T); }
}

boot();
