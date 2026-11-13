import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createShared } from './shared.js';
import { buildCity, cityMaterial, createCutaway } from './city.js';
import { buildGround } from './ground.js';
import { createPeople } from './people.js';
import { createCrowdSystem } from './crowd.js';
import { createCameraRig } from './camera.js';
import { createHats, createHeroes, trailEmit } from './cosmetics.js';
import { createRings, createHalos, createParticles, createWater, createCrown, createPickups, createPigeons, PICKUP_COL } from './fx.js';

const QUALITY = {
  high: { dpr: 2, bloom: true, reflCity: true, reflPeople: true, budget: 7000 },
  medium: { dpr: 1.5, bloom: false, reflCity: true, reflPeople: false, budget: 5000, cheapRefl: true },
  lite: { dpr: 1, bloom: false, reflCity: false, reflPeople: false, budget: 2000, lite: true },
};
const ORDER = ['lite', 'medium', 'high'];
const FOG_COL = new THREE.Color(0x6e5562);

export async function createRenderer({ canvas, map, quality = 'high', adaptive = true, capacity = 9000 } = {}) {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.info.autoReset = false;
  gl.setClearColor(FOG_COL);

  const scene = new THREE.Scene();
  scene.background = FOG_COL.clone();
  scene.fog = new THREE.Fog(FOG_COL.clone(), 60, 200);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 800);

  const shared = createShared();
  shared.uPointScale = { value: 500 };
  shared.uYaw = { value: 0.55 };

  const ground = buildGround(map, shared, quality);
  scene.add(ground.mesh);

  const city = buildCity(map, quality);
  const cutaway = createCutaway(city.blds);
  const cityMesh = new THREE.Mesh(city.geometry, cityMaterial(shared, 1, cutaway));
  cityMesh.frustumCulled = false;
  const cityRefl = new THREE.Mesh(city.reflGeometry, cityMaterial(shared, -1, cutaway));
  cityRefl.frustumCulled = false;
  cityRefl.renderOrder = -5;
  scene.add(cityMesh, cityRefl);

  const water = createWater(city.water, city.jets, shared);
  scene.add(water.water, water.jets);
  const halos = createHalos(city.halos, shared);
  scene.add(halos.points, halos.reflection);

  const people = createPeople(capacity, shared, { detail: quality === 'lite' ? 0 : 1 });
  scene.add(people.mesh, people.reflection, people.shadows);
  const crowd = createCrowdSystem(people, map);
  const hats = createHats(people, shared, quality === 'lite' ? 0 : 1);
  const heroes = createHeroes(shared);
  scene.add(hats.mesh, heroes.mesh);
  const lead = {};
  const perf = { update: 0, write: 0, other: 0, submit: 0, upload: 0 };

  const rings = createRings(16, shared);
  scene.add(rings.mesh);
  const crown = createCrown(shared);
  scene.add(crown.group, crown.shaft);
  const pickups = createPickups(32, shared);
  scene.add(pickups.pads, pickups.beams, pickups.icons);
  const pigeons = createPigeons(map, shared, quality === 'lite' ? 7 : 12);
  scene.add(pigeons.mesh);
  const particles = createParticles(3000, shared);
  scene.add(particles.points);

  const rig = createCameraRig(camera);
  rig.setBound((map.outer || map.size / 2 + 60) - 4);

  let composer = null, bloom = null;
  let q = QUALITY[quality] ? quality : 'high';
  let focus = 0, metaSet = false, showcase = false, cutSnap = false;
  const pickAlpha = new Map();
  const crownState = { x: 0, z: 0, y: 4, idx: -1, s: 1, a: 0 };
  const recruitWin = [];
  let punchCool = 0, stealGain = 0, stealLoss = 0, time = 0, lastLead = -1;
  const fpsS = { acc: 0, n: 0, fps: 60, low: 0, frames: 0 };
  let lastNow = performance.now();
  const tmpV = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  let cssW = 1, cssH = 1;

  function applyQuality() {
    const Q = QUALITY[q];
    cityRefl.visible = Q.reflCity;
    halos.reflection.visible = Q.reflCity;
    people.reflection.visible = Q.reflPeople;
    ground.setReflect(Q.reflCity);
    crowd.setBudget(Q.budget);
    cityMesh.geometry = Q.lite ? city.liteGeometry : city.geometry;
    cityRefl.geometry = Q.cheapRefl ? city.reflCheap : city.reflGeometry;
    fpsS.warm = fpsS.started ? 2 : 0; fpsS.low = 0; fpsS.started = true;
    if (Q.bloom && !composer) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(gl, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 1.5);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }
    resize();
  }

  function resize() {
    cssW = canvas.clientWidth || window.innerWidth;
    cssH = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[q].dpr);
    gl.setPixelRatio(dpr);
    gl.setSize(cssW, cssH, false);
    if (composer && QUALITY[q].bloom) {
      composer.setPixelRatio(dpr);
      composer.setSize(cssW, cssH);
      bloom.resolution.set(cssW * dpr / 2, cssH * dpr / 2);
    }
    camera.aspect = cssW / cssH;
    camera.updateProjectionMatrix();
  }

  function setCrowds(meta) {
    crowd.setCrowds(meta);
    crowd.setView(null);
    const em = [];
    for (const c of crowd.crowds) if (c && c.cos.flag) em[c.index % 16] = c.cos.flag.emblem;
    heroes.setEmblems(em);
    metaSet = true;
    pickAlpha.clear();
    crownState.idx = -1; crownState.a = 0;
    lastLead = -1;
    rig.setEnd(false);
    rig.snap();
    cutSnap = true;
  }

  function teamCol(i) { return crowd.crowds[i]?.color || FOG_COL; }

  function handleEvents(events, state) {
    if (!events) return;
    for (const e of events) {
      switch (e.type) {
        case 'recruit': {
          crowd.onRecruit(e);
          const c = teamCol(e.crowd);
          if (Math.random() < 0.6) particles.emit(e.x, 1.6, e.z, (Math.random() - 0.5) * 2, 3 + Math.random() * 2, (Math.random() - 0.5) * 2, c.r * 2.5, c.g * 2.5, c.b * 2.5, 0.7, 0.6, 6);
          if (e.crowd === focus) recruitWin.push(time);
          break;
        }
        case 'steal': {
          crowd.onSteal(e);
          const c = teamCol(e.to);
          for (let k = 0; k < Math.min(3, e.n); k++) particles.emit(e.x + (Math.random() - 0.5) * 3, 1.2, e.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3, c.r * 2.5, c.g * 2.5, c.b * 2.5, 0.8, 0.7, 7);
          if (e.to === focus) stealGain += e.n;
          if (e.from === focus) stealLoss += e.n;
          break;
        }
        case 'elim': {
          const v = crowd.crowds[e.victim];
          const vc = v ? v.color : FOG_COL, bc = teamCol(e.by);
          crowd.onElim(e);
          particles.burst(e.x, e.z, vc, 40, 9, 1.2, 8);
          particles.burst(e.x, e.z, bc, 30, 6, 1.0, 10);
          if (e.by === focus) rig.punch(0.9);
          else if (e.victim === focus) rig.punch(0.6);
          break;
        }
        case 'respawn': {
          crowd.onRespawn(e);
          const c = teamCol(e.crowd);
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            particles.emit(e.x + Math.cos(a) * 1.5, 0.3, e.z + Math.sin(a) * 1.5, Math.cos(a) * 4, 2 + Math.random() * 4, Math.sin(a) * 4, c.r * 2, c.g * 2, c.b * 2, 0.9, 0.8, 3);
          }
          if (e.crowd === focus) rig.punch(0.35);
          break;
        }
        case 'pickup': {
          const col = PICKUP_COL[e.kind] || PICKUP_COL.speed;
          particles.burst(e.x, e.z, col, 34, 7, 1.0, 9);
          if (e.crowd === focus) rig.punch(0.35);
          pickAlpha.set(e.id, { a: 0, s: 1 });
          break;
        }
        case 'lead': {
          if (e.crowd === focus && lastLead !== focus) {
            rig.punch(0.55);
            const sc = state?.crowds?.[e.crowd];
            if (sc) particles.burst(sc.x, sc.z, new THREE.Color(1, 0.75, 0.25), 40, 6, 1.1, 12);
          }
          lastLead = e.crowd;
          break;
        }
        case 'phase': {
          rig.setEnd(e.phase === 'over');
          break;
        }
      }
    }
  }

  function selfPunches(dt) {
    punchCool -= dt;
    while (recruitWin.length && recruitWin[0] < time - 1.2) recruitWin.shift();
    if (punchCool <= 0) {
      if (recruitWin.length >= 12) { rig.punch(0.22); punchCool = 1.6; recruitWin.length = 0; }
      else if (stealGain >= 25) { rig.punch(0.3); punchCool = 1.2; }
      else if (stealLoss >= 25) { rig.punch(0.18); punchCool = 1.2; }
    }
    stealGain *= Math.exp(-dt * 1.5); stealLoss *= Math.exp(-dt * 1.5);
  }

  function updateRings() {
    let n = 0;
    for (const c of crowd.crowds) {
      if (!c || !c.alive) continue;
      let inten = c.index === focus ? 1.25 : 1.0, alpha = 1, r = Math.max(1.2, c.visR);
      if (c.protect > 0) alpha = Math.sin(time * 16) > 0 ? 0.9 : 0.3;
      if (c.panic > 0) { r *= 1 + 0.025 * Math.sin(time * 38); inten *= 1.2 + 0.4 * Math.sin(time * 20); }
      if (c.eating > 0) inten *= 1.35;
      if (c.cos.ring === 4) r *= 1 + 0.012 * Math.sin(time * 5.5);
      rings.set(n++, c.x, c.z, r, alpha, c.color, inten * 1.7, c.cos.ring);
    }
    rings.commit(n);
  }

  // leader variants, flags, trails, flame-ring embers
  function updateCosmetics(dt) {
    heroes.begin();
    const fs = shared.uFigScale.value;
    const flagH = 2.9 * Math.min(3.4, Math.max(1.2, rig.rig.d / 34));
    const lite = q === 'lite';
    for (const c of crowd.crowds) {
      if (!c || !c.alive) continue;
      const cos = c.cos;
      if (c.hero && crowd.leaderState(c, lead)) {
        heroes.add(lead, c, cos.flag ? flagH : 0);
        if (cos.flag) {
          const S = lead.scale * 1.28 * fs, cy = Math.cos(lead.yaw), sy = Math.sin(lead.yaw);
          c.poleX = lead.x + (0.36 * cy + 0.28 * sy) * S; c.poleZ = lead.z + (-0.36 * sy + 0.28 * cy) * S;
          c.poleTop = 0.85 * S + 1.05 * flagH;
        }
      }
      if (!c.onScreen) continue;
      const sp = Math.hypot(c.vx, c.vz);
      if (cos.trail && sp > 0.8) {
        c.trailAcc = (c.trailAcc || 0) + dt * (12 + c.visR * 2) * Math.min(1, sp / 3) * (lite ? 0.5 : 1);
        const hx = -c.vx / sp, hz = -c.vz / sp;
        while (c.trailAcc >= 1) {
          c.trailAcc -= 1;
          const a = Math.atan2(hz, hx) + (Math.random() - 0.5) * 2.4, rr = c.visR * (0.55 + Math.random() * 0.45);
          trailEmit(particles, cos.trail, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, c.vx, c.vz, c.color);
        }
      }
      if (cos.ring === 3) {
        c.emberAcc = (c.emberAcc || 0) + dt * Math.min(30, 4 + c.visR * 1.2) * (lite ? 0.5 : 1);
        while (c.emberAcc >= 1) {
          c.emberAcc -= 1;
          const a = Math.random() * Math.PI * 2, rr = c.visR * (1 + Math.random() * 0.08);
          particles.emit(c.x + Math.cos(a) * rr, 0.2, c.z + Math.sin(a) * rr, Math.cos(a) * 0.4, 1.2 + Math.random() * 1.4, Math.sin(a) * 0.4,
            1.6 + c.color.r, 0.7 + c.color.g * 0.8, 0.25 + c.color.b * 0.6, 0.35 + Math.random() * 0.25, 0.5 + Math.random() * 0.4, -1, 0, 0);
        }
      }
    }
    heroes.commit();
  }

  const qv = [[0, 0], [0, 0], [0, 0], [0, 0]], vND = new THREE.Vector3();
  function updateView() {
    camera.updateMatrixWorld();
    const cp = camera.position;
    let ok = true;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], k) => {
      vND.set(sx, sy, 0.5).unproject(camera).sub(cp);
      if (vND.y > -0.02) { ok = false; return; }
      const t = -cp.y / vND.y;
      qv[k][0] = cp.x + vND.x * t; qv[k][1] = cp.z + vND.z * t;
    });
    crowd.setView(ok && !showcase ? qv : null, 3.5 * shared.uFigScale.value);
  }

  function updateCrown(state, dt) {
    let lead = state.leader;
    if (lead == null || lead < 0) {
      for (const sc of state.crowds) if (sc.alive && sc.rank === 1) lead = sc.index;
    }
    const c = lead != null && lead >= 0 ? crowd.crowds[lead] : null;
    const show = !!(c && c.alive);
    crownState.a += ((show ? 1 : 0) - crownState.a) * Math.min(1, dt * 4);
    if (show) {
      const ty = 5.5;
      if (crownState.idx !== lead) {
        if (crownState.idx < 0) { crownState.x = c.x; crownState.z = c.z; crownState.y = ty; }
        crownState.idx = lead;
      }
      const k = 1 - Math.exp(-dt * 7);
      const px = c.cos.flag && c.poleX != null ? c.poleX : c.x, pz = c.cos.flag && c.poleZ != null ? c.poleZ : c.z;
      crownState.x += (px - crownState.x) * k; crownState.z += (pz - crownState.z) * k;
      crownState.y += (ty - crownState.y) * k;
    }
    const s = Math.min(3.4, Math.max(1.2, rig.rig.d / 34)) * crownState.a;
    const bob = Math.sin(time * 2.2) * 0.18 * s;
    let cy = 2.6 + 1.1 * s;
    if (c && c.alive && c.cos.flag && c.poleTop) cy = Math.max(cy, c.poleTop + 0.25 * s);
    crownState.lift = (crownState.lift ?? cy) + (cy - (crownState.lift ?? cy)) * Math.min(1, dt * 5);
    crown.group.position.set(crownState.x, crownState.lift + bob, crownState.z);
    crown.group.scale.setScalar(Math.max(0.001, s));
    crown.crown.rotation.y = time * 1.1;
    crown.group.visible = crownState.a > 0.02;
    crown.shaft.visible = crown.group.visible;
    crown.shaft.position.set(crownState.x, 0, crownState.z);
    crown.shaft.scale.set(Math.max(0.6, s * 0.8), crownState.lift, Math.max(0.6, s * 0.8));
    if (crown.group.visible && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2, r = 0.9 * s;
      particles.emit(crownState.x + Math.cos(a) * r, crownState.lift + 0.2 * s, crownState.z + Math.sin(a) * r, Math.cos(a) * 0.6, 0.4, Math.sin(a) * 0.6, 2.2, 1.4, 0.4, 0.35 * s, 0.9, 1.5);
    }
    crown.shaftMat.uniforms.uA.value = crownState.a;
  }

  function updatePickups(state, dt) {
    let n = 0;
    const list = state.pickups || [];
    for (const p of list) {
      let st = pickAlpha.get(p.id);
      if (!st) { st = { a: 0, s: 0 }; pickAlpha.set(p.id, st); }
      const want = p.active ? 1 : 0;
      st.a += (want - st.a) * Math.min(1, dt * (want ? 3 : 8));
      st.s += ((p.active ? 1 : 1.6) - st.s) * Math.min(1, dt * 6);
      if (st.a < 0.02) continue;
      pickups.set(n++, p.x, p.z, p.kind, st.a, st.s * (1 + 0.04 * Math.sin(time * 3 + p.id)));
    }
    pickups.commit(n);
  }

  function fountainSpray() {
    for (const j of water.jetList) {
      if (Math.random() > 0.35) continue;
      const a = Math.random() * Math.PI * 2, s = j.ring ? 2.5 : 1.2;
      particles.emit(j.x + Math.cos(a) * 0.2, j.y + j.h, j.z + Math.sin(a) * 0.2, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, 0.6, 1.1, 1.5, 0.45, 0.9, 7);
    }
  }

  function frame(state, events, dt = 1 / 60, alpha = 1) {
    if (!state) return;
    dt = Math.min(Math.max(dt, 0), 0.1);
    time += dt;
    shared.uTime.value = time;
    if (!metaSet) setCrowds(state.crowds.map((c) => ({ index: c.index, name: c.name, color: c.color })));
    handleEvents(events, state);
    selfPunches(dt);
    const p0 = performance.now();
    crowd.update(state, alpha, dt);
    const p1 = performance.now();
    hats.setCount(crowd.write(dt));
    const p2 = performance.now();
    updateRings();
    updateCosmetics(dt);
    updateCrown(state, dt);
    updatePickups(state, dt);
    fountainSpray();
    particles.update(dt);
    if (!QUALITY[q].lite) pigeons.update(dt, crowd.crowds);

    const fi = showcase && state.leader != null && state.leader >= 0 ? state.leader : focus;
    const fc = crowd.crowds[fi];
    const f = fc ? { x: fc.x, z: fc.z, vx: fc.vx, vz: fc.vz, radius: fc.alive ? fc.visR : 3 } : { x: 0, z: 0, radius: 5 };
    if (showcase) {
      const pz = map.plazas && map.plazas[0];
      if (pz) { f.x = pz.x + (f.x - pz.x) * 0.3; f.z = pz.z + (f.z - pz.z) * 0.3; }
      f.radius = 9; f.vx = 0; f.vz = 0;
    }
    rig.rig.showcase = showcase;
    rig.rig.yawDrift = showcase ? (rig.rig.yawDrift || 0) + dt * 0.05 : 0;
    const d = rig.update(dt, f, cssW / cssH);
    shared.uYaw.value = rig.rig.yaw;
    pickups.setView(d);
    shared.uFigScale.value = 1 + 0.3 * Math.min(1, Math.max(0, (d - 35) / 110));
    crowd.setFigScale(shared.uFigScale.value);
    scene.fog.near = d * 1.15 + 10;
    scene.fog.far = d * 2.8 + 40;
    shared.uFocus.value.set(f.x, f.z, f.radius * 1.15 + 3, fc && fc.alive ? 1 : 0);
    updateView();
    cutaway.update(dt, camera.position, { x: fc ? fc.x : f.x, z: fc ? fc.z : f.z, r: f.radius }, !!(fc && fc.alive) && !showcase && !rig.rig.fixed);
    if (cutSnap) { cutaway.snap(); cutSnap = false; }
    shared.uPointScale.value = gl.domElement.height * camera.projectionMatrix.elements[5] / 2;

    if (QUALITY[q].lite) { crown.shaft.visible = false; pickups.beams.visible = false; pigeons.mesh.visible = false; water.jets.visible = false; halos.points.visible = false; }
    else { pickups.beams.visible = true; pigeons.mesh.visible = true; water.jets.visible = true; halos.points.visible = true; }
    const p3 = performance.now();
    gl.info.reset();
    if (composer && QUALITY[q].bloom) composer.render(dt);
    else gl.render(scene, camera);
    const p4 = performance.now();
    const ek = 0.05;
    perf.update += (p1 - p0 - perf.update) * ek; perf.write += (p2 - p1 - perf.write) * ek;
    perf.other += (p3 - p2 - perf.other) * ek; perf.submit += (p4 - p3 - perf.submit) * ek;
    perf.upload = crowd.stats.drawn * 48 + particles.top * 36 + heroes.count * 80 + 16 * 36;

    const now = performance.now();
    const ft = now - lastNow;
    lastNow = now;
    fpsS.acc += ft; fpsS.n++;
    if (fpsS.acc > 500) {
      fpsS.fps = 1000 * fpsS.n / fpsS.acc;
      fpsS.acc = 0; fpsS.n = 0;
      // step down only (never back up, so it cannot oscillate): skip 2 s after a change for shader warm-up,
      // then 3 windows in a row under 45 fps (1.5 s) drop one tier
      fpsS.warm = (fpsS.warm || 0) + 1;
      if (adaptive && fpsS.warm > 4) {
        if (fpsS.fps < 45) fpsS.low++; else fpsS.low = 0;
        if (fpsS.low >= 3) {
          const i = ORDER.indexOf(q);
          if (i > 0) { q = ORDER[i - 1]; applyQuality(); }
          fpsS.low = 0;
        }
      }
    }
    fpsS.frames++;
  }

  applyQuality();
  window.addEventListener('resize', resize);

  return {
    three: { renderer: gl, scene, camera },
    _dbg: { crowd, people, city, map },
    setCrowds,
    frame,
    setFocus(i) { if (i !== focus) focus = i; },
    punch(s) { rig.punch(s); },
    crownTop() {
      const s = Math.min(3.4, Math.max(1.2, rig.rig.d / 34));
      return (crownState.lift ?? 2.6 + 1.1 * s) + 1.4 * s;
    },
    setCameraMode(mode) { showcase = mode === 'showcase'; },
    project(x, y, z, out = {}) {
      tmpV.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      out.behind = tmpV.z > 0;
      tmpV.set(x, y, z).project(camera);
      out.x = (tmpV.x + 1) / 2 * cssW;
      out.y = (1 - tmpV.y) / 2 * cssH;
      out.visible = !out.behind && tmpV.z > -1 && tmpV.z < 1 && out.x > -40 && out.x < cssW + 40 && out.y > -40 && out.y < cssH + 40;
      return out;
    },
    groundPoint(clientX, clientY, out = {}) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      if (!ray.ray.intersectPlane(plane, tmpV)) return null;
      out.x = tmpV.x; out.z = tmpV.z;
      return out;
    },
    cameraYaw() { return rig.rig.yaw; },
    resize,
    setQuality(nq) { if (QUALITY[nq]) { q = nq; applyQuality(); } },
    setAdaptive(on) { adaptive = !!on; },
    setFixedCamera(fx) { rig.rig.fixed = fx; },
    stats() {
      return {
        fps: Math.round(fpsS.fps * 10) / 10,
        drawCalls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        instances: crowd.stats.drawn,
        hats: crowd.stats.hats, culled: crowd.stats.culled, heroes: heroes.count,
        ms: { update: +perf.update.toFixed(2), write: +perf.write.toFixed(2), other: +perf.other.toFixed(2), submit: +perf.submit.toFixed(2) }, uploadKB: Math.round(perf.upload / 1024),
        crowdFigures: crowd.stats.crowdFigs,
        neutralFigures: crowd.stats.neutralFigs,
        particles: particles.alive,
        quality: q,
        popIn: crowd.stats.popIn, popOut: crowd.stats.popOut, recruits: crowd.stats.recruits, transfers: crowd.stats.transfers,
        cityVerts: city.verts, cityBaseVerts: city.baseVerts,
        dpr: gl.getPixelRatio(),
      };
    },
    dispose() {
      window.removeEventListener('resize', resize);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { for (const v of Object.values(o.material.uniforms || {})) if (v && v.value && v.value.isTexture) v.value.dispose(); o.material.dispose(); }
      });
      ground.dispose();
      people.dispose();
      if (composer) composer.dispose();
      gl.dispose();
    },
  };
}
