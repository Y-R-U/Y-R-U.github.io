import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createShared, applyThemeLight } from './shared.js';
import { buildCity, cityMaterial, createCutaway } from './city.js';
import { buildGround } from './ground.js';
import { createPeople } from './people.js';
import { createCrowdSystem } from './crowd.js';
import { createCameraRig } from './camera.js';
import { createHats, createHeroes, trailEmit } from './cosmetics.js';
import { createRings, createZoneWalls, createPrecip, PRECIP, ZONE_STYLES, KIND_IDX, createHalos, createParticles, createWater, createCrown, createPickups, createPigeons, PICKUP_COL } from './fx.js';
import { THEMES, THEME_IDS, WEATHER_IDS, getTheme } from './themes.js';

const QUALITY = {
  high: { dpr: 2, bloom: true, reflCity: true, reflPeople: true, budget: 7000, precip: 5000 },
  medium: { dpr: 1.5, bloom: false, reflCity: true, reflPeople: false, budget: 5000, cheapRefl: true, precip: 3200 },
  lite: { dpr: 1, bloom: false, reflCity: false, reflPeople: false, budget: 2000, lite: true, precip: 0 },
};
const ORDER = ['lite', 'medium', 'high'];
const ZONE_COL = { crown: 0xffc23a, safe: 0x9ff2ff, danger: 0xff3a2a, capture: 0xffe08a, next: 0xffc23a, 'safe-next': 0xffffff };

export async function createRenderer({ canvas, map, quality = 'high', adaptive = true, capacity = 9000 } = {}) {
  const URLP = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  // test override: ?theme= / ?weather= win over setTheme / setWeather calls
  const forceTheme = THEMES[URLP.get('theme')] ? URLP.get('theme') : null;
  const forceWeather = WEATHER_IDS.includes(URLP.get('weather')) ? URLP.get('weather') : null;

  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = 1.0;
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.info.autoReset = false;

  const fogCol = new THREE.Color(0x6e5562);
  const scene = new THREE.Scene();
  scene.background = fogCol.clone();
  scene.fog = new THREE.Fog(fogCol.clone(), 60, 200);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 800);

  const shared = createShared();
  shared.uPointScale = { value: 500 };
  shared.uYaw = { value: 0.55 };
  shared.uHaloK = { value: 1 };

  const people = createPeople(capacity, shared, { detail: quality === 'lite' ? 0 : 1 });
  people.mesh.renderOrder = 1;
  scene.add(people.mesh, people.reflection, people.shadows);
  const crowd = createCrowdSystem(people, map);
  const hats = createHats(people, shared, quality === 'lite' ? 0 : 1);
  const heroes = createHeroes(shared);
  hats.mesh.renderOrder = 1; heroes.mesh.renderOrder = 1;
  scene.add(hats.mesh, heroes.mesh);
  const lead = {};
  const perf = { update: 0, write: 0, other: 0, submit: 0, upload: 0 };

  const rings = createRings(16 + 16 + 32, shared);
  scene.add(rings.mesh, rings.ghost);
  const walls = createZoneWalls(16, shared);
  scene.add(walls.mesh);
  const precip = createPrecip(5000, shared);
  scene.add(precip.mesh);
  const crown = createCrown(shared);
  scene.add(crown.group, crown.shaft);
  const pickups = createPickups(32, shared);
  scene.add(pickups.beams, pickups.icons);
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

  // ---------- world: city, ground, lamps, water; rebuilt by setTheme ----------
  let T = getTheme(forceTheme || 'evening');
  let W = null, water = null;
  function buildWorld() {
    applyThemeLight(shared, T);
    const ground = buildGround(map, shared, q === 'lite' && quality === 'lite' ? 'lite' : quality, T);
    const city = buildCity(map, quality, T);
    const cutaway = createCutaway(city.blds);
    const cityMesh = new THREE.Mesh(city.geometry, cityMaterial(shared, 1, cutaway));
    cityMesh.frustumCulled = false;
    const cityRefl = new THREE.Mesh(city.reflGeometry, cityMaterial(shared, -1, cutaway));
    cityRefl.frustumCulled = false;
    cityRefl.renderOrder = -5;
    const halos = createHalos(city.halos, shared, T.halo);
    if (!water) { water = createWater(city.water, city.jets, shared); scene.add(water.water, water.jets); }
    scene.add(ground.mesh, cityMesh, cityRefl, halos.points, halos.reflection);
    crowd.setProps(city.props.length ? city.props : null);
    crowd.setNeutralPalette(T.neutrals);
    fogCol.setHex(T.fog);
    gl.toneMappingExposure = T.exposure;
    if (bloom) { bloom.threshold = T.bloomT || 1.5; bloom.strength = T.bloomS || 0.6; }
    W = { ground, city, cutaway, cityMesh, cityRefl, halos };
    applyWeather();
  }
  function disposeWorld() {
    if (!W) return;
    scene.remove(W.ground.mesh, W.cityMesh, W.cityRefl, W.halos.points, W.halos.reflection);
    W.ground.dispose();
    for (const g of [W.city.geometry, W.city.reflGeometry, W.city.liteGeometry, W.city.reflCheap]) g.dispose();
    W.cityMesh.material.dispose(); W.cityRefl.material.dispose();
    W.cutaway.uniforms.uCut.value.dispose();
    for (const p of [W.halos.points, W.halos.reflection]) { p.geometry.dispose(); p.material.dispose(); }
    W = null;
  }

  // ---------- weather ----------
  let weatherId = forceWeather || T.weather || 'clear';
  let weatherSet = !!forceWeather;
  const wx = { rain: 0, fog: 0, wind: 0, snow: 0, acc: 0 };
  function applyWeather() {
    const sunBase = T.sunCol;
    const rain = weatherId === 'rain' ? 1 : 0;
    shared.uSunCol.value.setRGB(sunBase[0], sunBase[1], sunBase[2]).multiplyScalar(sunBase[3] * (rain ? 0.6 : 1));
    shared.uWet.value = rain ? Math.max(1.8, T.wet + 1.0) : T.wet;
    gl.toneMappingExposure = T.exposure * (rain ? 0.86 : weatherId === 'fog' ? 0.95 : 1);
    shared.uRain.value = rain;
    shared.uWind.value = weatherId === 'wind' ? 1 : 0;
    shared.uHaloK.value = weatherId === 'fog' ? 1.9 : 1;
    fogCol.setHex(T.fog);
    if (weatherId === 'fog') fogCol.lerp(new THREE.Color(T.snow ? 0xc8ccd8 : T.lampsOn ? 0x9a90a0 : 0xd6dde6), 0.7);
    if (rain) fogCol.lerp(new THREE.Color(0x3c4250), 0.4);
    if (W) {
      const reflect = T.reflect || rain;
      W.ground.setReflect(QUALITY[q].reflCity && reflect);
      W.ground.mesh.material.uniforms.uSkyRefl.value.setRGB(T.skyRefl[0], T.skyRefl[1], T.skyRefl[2]);
    }
    scene.background.copy(fogCol); scene.fog.color.copy(fogCol); gl.setClearColor(fogCol);
    applyQuality(true);
  }

  function applyQuality(keepWarm) {
    const Q = QUALITY[q];
    const reflect = Q.reflCity && (T.reflect || weatherId === 'rain');
    if (W) {
      W.cityRefl.visible = reflect;
      W.halos.reflection.visible = reflect && T.lampsOn;
      W.ground.setReflect(reflect);
      W.cityMesh.geometry = Q.lite ? W.city.liteGeometry : W.city.geometry;
      W.cityRefl.geometry = Q.cheapRefl ? W.city.reflCheap : W.city.reflGeometry;
    }
    people.reflection.visible = Q.reflPeople && (T.reflect || weatherId === 'rain');
    crowd.setBudget(Q.budget);
    rings.ghost.visible = !Q.lite;
    if (!keepWarm) { fpsS.warm = fpsS.started ? 2 : 0; fpsS.low = 0; fpsS.started = true; }
    if (Q.bloom && !composer) {
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
      composer = new EffectComposer(gl, rt);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), T.bloomS || 0.6, 0.5, T.bloomT || 1.5);
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

  function refreshEmblems() {
    const em = [];
    for (const c of crowd.crowds) if (c && c.cos.flag) em[c.index % 16] = c.cos.flag.emblem;
    heroes.setEmblems(em);
  }

  function setCrowds(meta) {
    crowd.setCrowds(meta);
    crowd.setView(null);
    refreshEmblems();
    metaSet = true;
    pickAlpha.clear();
    crownState.idx = -1; crownState.a = 0;
    lastLead = -1;
    fireworks.on = false;
    rig.setEnd(false);
    if (!showcase) rig.rig.orbit = 0;
    rig.snap();
    cutSnap = true;
  }

  function teamCol(i) { return crowd.crowds[i]?.color || fogCol; }

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
          const vc = v ? v.color : fogCol, bc = teamCol(e.by);
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
          if (e.phase === 'over' && T.fireworks) { fireworks.on = true; fireworks.t = 0; fireworks.next = 0; }
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

  // ---------- zones ----------
  const zones = new Map();
  const zCol = new THREE.Color();
  function setZones(list) {
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((z, i) => {
      if (!z || !Number.isFinite(z.x) || !Number.isFinite(z.z)) return;
      const id = z.id ?? `${z.style || 'zone'}${i}`;
      seen.add(id);
      const style = ZONE_STYLES[z.style] ? z.style : 'capture';
      let o = zones.get(id);
      const r = Math.max(0.5, Number.isFinite(z.r) ? z.r : 8);
      const fresh = !o;
      if (!o) { o = { cx: z.x, cz: z.z, cr: style === 'safe' || style === 'safe-next' ? r * 1.15 : r * 0.4, a: 0, col: new THREE.Color(), tcol: new THREE.Color(), cp: 0 }; zones.set(id, o); }
      o.x = z.x; o.z = z.z; o.r = r; o.style = style; o.dead = false;
      o.tcol.set(z.color != null ? z.color : ZONE_COL[style]);
      if (fresh) o.col.copy(o.tcol);
      o.progress = Number.isFinite(z.progress) ? Math.min(1, Math.max(0, z.progress)) : (style === 'capture' ? 0 : 1);
    });
    for (const [id, o] of zones) if (!seen.has(id)) o.dead = true;
  }
  function updateZones(dt, base) {
    let n = base, nw = 0, safe = null;
    const k = 1 - Math.exp(-dt * 4);
    for (const [id, o] of zones) {
      o.a += ((o.dead ? 0 : 1) - o.a) * Math.min(1, dt * (o.dead ? 5 : 2.5));
      if (o.dead && o.a < 0.02) { zones.delete(id); continue; }
      o.cx += (o.x - o.cx) * k; o.cz += (o.z - o.cz) * k; o.cr += (o.r - o.cr) * k;
      o.cp += (o.progress - o.cp) * Math.min(1, dt * 6);
      o.col.lerp(o.tcol, Math.min(1, dt * 3));
      const st = ZONE_STYLES[o.style];
      rings.set(n++, o.cx, o.cz, o.cr, o.a, o.col, o.style === 'safe' ? 1.1 : 1.0, st, o.cp, 0);
      if (o.style === 'safe' && !safe) safe = o;
      if (!QUALITY[q].lite && nw < 16 && st < 9) {
        const h = o.style === 'safe' ? 9 : o.style === 'danger' ? 2.6 : o.style === 'crown' ? 26 : 18;
        const rr = o.style === 'safe' || o.style === 'danger' ? o.cr : o.cr * 0.92;
        zCol.copy(o.col);
        if (o.style === 'capture') zCol.multiplyScalar(0.5 + 0.7 * o.cp);
        walls.set(nw++, o.cx, o.cz, rr, h, zCol, st, o.a);
      }
      if ((o.style === 'crown' || o.style === 'capture') && Math.random() < dt * (8 + o.cr) * (QUALITY[q].lite ? 0.4 : 1)) {
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * o.cr;
        particles.emit(o.cx + Math.cos(a) * rr, 0.3, o.cz + Math.sin(a) * rr, 0, 1.5 + Math.random() * 2, 0, o.col.r * 1.8, o.col.g * 1.8, o.col.b * 1.8, 0.35, 1.6, -0.3);
      }
    }
    walls.commit(nw);
    if (safe) shared.uSafe.value.set(safe.cx, safe.cz, safe.cr, safe.a);
    else shared.uSafe.value.w = 0;
    return n;
  }

  // ---------- ground decals: crowd rings, then zones, then pickup pads ----------
  let ghostTick = 0;
  function updateDecals(state, dt) {
    let n = 0;
    ghostTick = (ghostTick + 1) % 4;
    const kc = Math.min(1, dt * 3);
    for (const c of crowd.crowds) {
      if (!c || !c.alive) continue;
      c.ringCol.lerp(c.color, kc);
      let inten = c.index === focus ? 1.25 : 1.0, alpha = 1, r = Math.max(1.2, c.visR);
      if (c.protect > 0) alpha = Math.sin(time * 16) > 0 ? 0.9 : 0.3;
      if (c.panic > 0) { r *= 1 + 0.025 * Math.sin(time * 38); inten *= 1.2 + 0.4 * Math.sin(time * 20); }
      if (c.eating > 0) inten *= 1.35;
      if (c.boost > 0) inten *= 1.35 + 0.35 * Math.sin(time * 9);
      if (c.cos.ring === 4) r *= 1 + 0.012 * Math.sin(time * 5.5);
      if (ghostTick === 0) c.hidden = !QUALITY[q].lite && W.cutaway.hidden(camera.position, { x: c.x, z: c.z, r: Math.max(1.2, c.visR) });
      rings.set(n++, c.x, c.z, r, alpha, c.ringCol, inten * 1.7, c.cos.ring, 0, (c.remote && c.index !== focus ? 1 : 0) + (c.hidden ? 2 : 0));
    }
    rings.markCrowds(n);
    n = updateZones(dt, n);
    const list = state.pickups || [];
    let np = 0;
    for (const p of list) {
      let st = pickAlpha.get(p.id);
      if (!st) { st = { a: 0, s: 0 }; pickAlpha.set(p.id, st); }
      const want = p.active ? 1 : 0;
      st.a += (want - st.a) * Math.min(1, dt * (want ? 3 : 8));
      st.s += ((p.active ? 1 : 1.6) - st.s) * Math.min(1, dt * 6);
      if (st.a < 0.02) continue;
      const sc = st.s * (1 + 0.04 * Math.sin(time * 3 + p.id));
      pickups.set(np++, p.x, p.z, p.kind, st.a, sc);
      const col = PICKUP_COL[p.kind] || PICKUP_COL.speed;
      zCol.copy(col).multiplyScalar(1.6);
      rings.set(n++, p.x, p.z, 2.6 * sc, st.a, zCol, 1, 9, KIND_IDX[p.kind] ?? 0, 0);
    }
    pickups.commit(np);
    rings.commit(n);
  }

  // leader variants, flags, trails, flame-ring embers
  const trailPool = { sk: 1, emit(...a) { a[9] *= trailPool.sk; particles.emit(...a); } };
  function updateCosmetics(dt) {
    heroes.begin();
    const fs = shared.uFigScale.value;
    const flagH = 2.9 * Math.min(3.4, Math.max(1.2, rig.rig.d / 34));
    const lite = q === 'lite';
    trailPool.sk = Math.min(2.6, Math.max(1, rig.rig.d / 40));
    for (const c of crowd.crowds) {
      if (!c || !c.alive) continue;
      const cos = c.cos;
      if (c.hero && crowd.leaderState(c, lead)) {
        heroes.add(lead, c, cos.flag ? flagH : 0);
        c.headTop = cos.leader ? lead.scale * 1.28 * fs * 1.95 : 0;
        if (cos.flag) {
          const S = lead.scale * 1.28 * fs, cy = Math.cos(lead.yaw), sy = Math.sin(lead.yaw);
          c.poleX = lead.x + (0.36 * cy + 0.28 * sy) * S; c.poleZ = lead.z + (-0.36 * sy + 0.28 * cy) * S;
          c.poleTop = 0.85 * S + 1.05 * flagH;
        }
      }
      if (!c.onScreen) continue;
      const sp = Math.hypot(c.vx, c.vz);
      if (cos.trail && sp > 0.8) {
        c.trailAcc = (c.trailAcc || 0) + dt * (8 + c.visR * 3.2) * Math.min(1.4, sp / 2.5) * (lite ? 0.5 : 1);
        const hx = -c.vx / sp, hz = -c.vz / sp;
        while (c.trailAcc >= 1) {
          c.trailAcc -= 1;
          const a = Math.atan2(hz, hx) + (Math.random() - 0.5) * 2.6, rr = c.visR * (0.6 + Math.random() * 0.45);
          trailEmit(trailPool, cos.trail, c.x + Math.cos(a) * rr, c.z + Math.sin(a) * rr, c.vx, c.vz, c.color);
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
      // infection horde: green spores drifting up off the crowd
      if (c.horde && Math.random() < dt * (5 + c.visR * 1.2) * (lite ? 0.5 : 1)) {
        const a = Math.random() * Math.PI * 2, rr = c.visR * Math.sqrt(Math.random());
        particles.emit(c.x + Math.cos(a) * rr, 1.6, c.z + Math.sin(a) * rr, (Math.random() - 0.5) * 0.6, 0.7 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6, 0.55, 1.5, 0.15, 0.4 * trailPool.sk, 1.6, -0.2, 6, 0);
      }
      // teams merge boost: sparks along the contact between touching teammates
      if (c.boost > 0) for (const o of crowd.crowds) {
        if (!o || o === c || !o.alive || !(o.boost > 0) || o.index < c.index) continue;
        const dx = o.x - c.x, dz = o.z - c.z, dd = Math.hypot(dx, dz);
        if (dd > c.visR + o.visR + 3 || Math.random() > dt * 30) continue;
        const t = c.visR / Math.max(0.1, c.visR + o.visR), px = (Math.random() - 0.5) * Math.min(c.visR, o.visR);
        particles.emit(c.x + dx * t - dz / (dd || 1) * px, 0.6, c.z + dz * t + dx / (dd || 1) * px, 0, 2 + Math.random() * 2, 0, c.color.r * 2.2 + 0.4, c.color.g * 2.2 + 0.4, c.color.b * 2.2 + 0.4, 0.5 * trailPool.sk, 0.6, 2);
      }
      // rain: splashes under a running crowd
      if (wx.rain > 0.5 && sp > 1.5 && Math.random() < dt * (6 + c.visR * 1.5) * (lite ? 0.4 : 1)) {
        const a = Math.random() * Math.PI * 2, rr = c.visR * Math.sqrt(Math.random());
        for (let k = 0; k < 3; k++) particles.emit(c.x + Math.cos(a) * rr, 0.1, c.z + Math.sin(a) * rr, (Math.random() - 0.5) * 1.6, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6, 0.55, 0.62, 0.75, 0.18 * trailPool.sk, 0.35, 9);
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
    let ld = state.leader;
    if (ld == null || ld < 0) {
      for (const sc of state.crowds) if (sc.alive && sc.rank === 1) ld = sc.index;
    }
    const c = ld != null && ld >= 0 ? crowd.crowds[ld] : null;
    const show = !!(c && c.alive);
    crownState.a += ((show ? 1 : 0) - crownState.a) * Math.min(1, dt * 4);
    if (show) {
      const ty = 5.5;
      if (crownState.idx !== ld) {
        if (crownState.idx < 0) { crownState.x = c.x; crownState.z = c.z; crownState.y = ty; }
        crownState.idx = ld;
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
    // a leader variant (king, robot, mascot, caped) is 2x tall: the rank-1 crown floats clear of its head
    else if (c && c.alive && c.cos.leader && c.headTop) cy = Math.max(cy, c.headTop + 0.45 * s + 0.3);
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

  function fountainSpray() {
    for (const j of water.jetList) {
      if (Math.random() > 0.35) continue;
      const a = Math.random() * Math.PI * 2, s = j.ring ? 2.5 : 1.2;
      particles.emit(j.x + Math.cos(a) * 0.2, j.y + j.h, j.z + Math.sin(a) * 0.2, Math.cos(a) * s, 1 + Math.random() * 2, Math.sin(a) * s, 0.6, 1.1, 1.5, 0.45, 0.9, 7);
    }
  }

  // ---------- weather particles: one GPU draw on medium/high, the shared particle pool on lite ----------
  function updateWeather(dt, d) {
    const id = weatherId;
    const tgt = { rain: id === 'rain' ? 1 : 0, fog: id === 'fog' ? 1 : 0, wind: id === 'wind' ? 1 : 0, snow: id === 'snow' ? 1 : 0 };
    for (const k of ['rain', 'fog', 'wind', 'snow']) wx[k] += (tgt[k] - wx[k]) * Math.min(1, dt * 1.5);
    let mode = id === 'rain' ? PRECIP.rain : id === 'snow' ? PRECIP.snow : id === 'wind' ? PRECIP.wind : T.confetti ? PRECIP.confetti : 0;
    const Q = QUALITY[q];
    const cp = camera.position, tx = rig.rig.tx + rig.rig.ex, tz = rig.rig.tz + rig.rig.ez;
    const wind = id === 'wind' ? 7 : id === 'rain' ? 3 : 1.2;
    const U = precip.U;
    U.uWindV.value.set(Math.cos(0.7 + time * 0.05) * wind, Math.sin(0.7 + time * 0.05) * wind);
    if (mode && !Q.lite) {
      const n = mode === PRECIP.rain ? Q.precip : mode === PRECIP.snow ? Q.precip * 0.55 : mode === PRECIP.wind ? 260 : 240;
      precip.setCount(n);
      U.uMode.value = mode;
      const toward = mode === PRECIP.wind || mode === PRECIP.confetti ? 0.15 : 0.4;
      U.uCenter.value.set(tx + (cp.x - tx) * toward, 0, tz + (cp.z - tz) * toward);
      const hb = Math.max(18, d * 0.55);
      U.uBox.value.set(hb, mode === PRECIP.rain ? Math.max(14, cp.y * 0.45) : Math.max(10, cp.y * 0.4), hb);
      U.uNear.value = d * 0.5;
      U.uSize.value = Math.max(1, d / 38) * (mode === PRECIP.rain ? 1.2 : mode === PRECIP.snow ? 0.7 : 1);
      U.uDens.value = mode === PRECIP.rain ? wx.rain : mode === PRECIP.snow ? wx.snow : 1;
      const lit = shared.uSkyCol.value;
      U.uLit.value.setRGB(0.55 + lit.r, 0.55 + lit.g, 0.55 + lit.b).multiplyScalar(mode === PRECIP.snow ? 0.95 : 0.8);
    } else precip.setCount(0);
    if (mode && Q.lite) {
      const rate = mode === PRECIP.rain ? 260 : mode === PRECIP.snow ? 140 : mode === PRECIP.wind ? 22 : 30;
      wx.acc += dt * rate;
      const hb = Math.max(16, d * 0.5), sk = Math.max(1, d / 38);
      while (wx.acc >= 1) {
        wx.acc -= 1;
        const x = tx + (cp.x - tx) * 0.3 + (Math.random() - 0.5) * 2 * hb, z = tz + (cp.z - tz) * 0.3 + (Math.random() - 0.5) * 2 * hb;
        const vx = U.uWindV.value.x, vz = U.uWindV.value.y;
        if (mode === PRECIP.rain) particles.emit(x, 8 + Math.random() * 10, z, vx * 0.3, -24, vz * 0.3, 0.32, 0.36, 0.42, 1.1 * sk, 0.6, 0, 7, 0);
        else if (mode === PRECIP.snow) particles.emit(x, 6 + Math.random() * 12, z, vx * 0.3, -1.2, vz * 0.3, 0.6, 0.62, 0.68, 0.32 * sk, 6, 0, 6, 0);
        else if (mode === PRECIP.wind) particles.emit(x, 0.5 + Math.random() * 3, z, vx * 1.4, 0.5, vz * 1.4, 0.55, 0.32, 0.1, 0.3 * sk, 3, 0.3, 2, Math.random() * 6);
        else particles.emit(x, 6 + Math.random() * 6, z, vx * 0.5, -1.5, vz * 0.5, 1.2 * Math.random() + 0.3, 1.2 * Math.random() + 0.3, 1.2 * Math.random() + 0.3, 0.25 * sk, 4, 0.2, 5, Math.random() * 6);
      }
    }
  }

  // ---------- festival fireworks at match end ----------
  const fireworks = { on: false, t: 0, next: 0 };
  const fwCols = [new THREE.Color(1, 0.3, 0.3), new THREE.Color(1, 0.85, 0.3), new THREE.Color(0.3, 0.7, 1), new THREE.Color(0.5, 1, 0.5), new THREE.Color(1, 0.45, 0.9)];
  function updateFireworks(dt, d) {
    if (!fireworks.on) return;
    fireworks.t += dt; fireworks.next -= dt;
    if (fireworks.t > 9) { fireworks.on = false; return; }
    if (fireworks.next > 0) return;
    fireworks.next = 0.35 + Math.random() * 0.5;
    const tx = rig.rig.tx, tz = rig.rig.tz, yaw = rig.rig.yaw + (rig.rig.orbit || 0);
    const x = tx - Math.sin(yaw) * d * 0.35 + (Math.random() - 0.5) * d * 0.7, z = tz - Math.cos(yaw) * d * 0.35 + (Math.random() - 0.5) * d * 0.4;
    const y = 18 + Math.random() * d * 0.25, col = fwCols[(Math.random() * fwCols.length) | 0];
    const n = QUALITY[q].lite ? 40 : 90, sp = 6 + d * 0.06;
    for (let k = 0; k < n; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      particles.emit(x, y, z, Math.cos(a) * r * sp, u * sp + 1, Math.sin(a) * r * sp, col.r * 3, col.g * 3, col.b * 3, 0.5 * Math.max(1, d / 40), 1.4 + Math.random() * 0.6, 3);
    }
  }

  // ---------- showcase: slow orbit over the central plaza, framing the biggest crowds; optional theme cycle ----------
  const show = { cycle: false, t: 0, fade: 0, pending: null };
  function showcaseFocus(state, f) {
    const pz = map.plazas && map.plazas[0];
    if (!pz) return;
    let sx = 0, sz = 0, sw = 0;
    const list = [...state.crowds].filter((c) => c.alive).sort((a, b) => b.count - a.count).slice(0, 3);
    for (const c of list) { sx += c.x * c.count; sz += c.z * c.count; sw += c.count; }
    let ax = pz.x, az = pz.z;
    if (sw > 0) {
      ax = sx / sw; az = sz / sw;
      const dx = ax - pz.x, dz = az - pz.z, dl = Math.hypot(dx, dz), lim = pz.r * 0.55;
      if (dl > lim) { ax = pz.x + dx / dl * lim; az = pz.z + dz / dl * lim; }
    }
    show.x = show.x == null ? ax : show.x + (ax - show.x) * 0.01;
    show.z = show.z == null ? az : show.z + (az - show.z) * 0.01;
    f.x = pz.x + (show.x - pz.x) * 0.6; f.z = pz.z + (show.z - pz.z) * 0.6;
    f.radius = 10; f.vx = 0; f.vz = 0;
  }
  function updateShowcaseCycle(dt) {
    if (!showcase || !show.cycle || forceTheme) { if (show.fade > 0) { show.fade = Math.max(0, show.fade - dt * 2); gl.toneMappingExposure = T.exposure * (1 - show.fade); } return; }
    show.t += dt;
    if (show.t > 14 && !show.pending) { const i = THEME_IDS.indexOf(T.id); show.pending = THEME_IDS[(i + 1) % THEME_IDS.length]; }
    if (show.pending) {
      show.fade = Math.min(1, show.fade + dt * 2.2);
      if (show.fade >= 1) { const id = show.pending; show.pending = null; show.t = 0; T = getTheme(id); if (!weatherSet) weatherId = T.weather || 'clear'; disposeWorld(); buildWorld(); cutSnap = true; }
    } else show.fade = Math.max(0, show.fade - dt * 1.6);
    gl.toneMappingExposure = T.exposure * (1 - show.fade * 0.92);
  }

  let stampT = 0;
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
    for (const sc of state.crowds) { const c = crowd.crowds[sc.index]; if (c) c.remote = !!sc.remote; }
    const p1 = performance.now();
    hats.setCount(crowd.write(dt));
    const p2 = performance.now();
    updateDecals(state, dt);
    updateCosmetics(dt);
    updateCrown(state, dt);
    fountainSpray();
    particles.update(dt);
    pigeons.update(dt, crowd.crowds);
    if ((stampT += dt) > 0.12) { W.ground.stamp(crowd.crowds, stampT); stampT = 0; }
    updateShowcaseCycle(dt);

    const fi = showcase && state.leader != null && state.leader >= 0 ? state.leader : focus;
    const fc = crowd.crowds[fi];
    const f = fc ? { x: fc.x, z: fc.z, vx: fc.vx, vz: fc.vz, radius: fc.alive ? fc.visR : 3 } : { x: 0, z: 0, radius: 5 };
    if (showcase) showcaseFocus(state, f);
    rig.rig.showcase = showcase;
    if (showcase) rig.rig.orbit = (rig.rig.orbit || 0) + dt * 0.055;
    const d = rig.update(dt, f, cssW / cssH);
    shared.uYaw.value = rig.rig.yaw + (rig.rig.orbit || 0);
    pickups.setView(d);
    shared.uFigScale.value = 1 + 0.3 * Math.min(1, Math.max(0, (d - 35) / 110));
    shared.uAccScale.value = 1 + 0.55 * Math.min(1, Math.max(0, (d - 30) / 110));
    crowd.setFigScale(shared.uFigScale.value);
    const fg = wx.fog;
    const fn = (d * T.fogNear + 10) * (1 - 0.25 * wx.rain), ff = (d * T.fogFar + 40) * (1 - 0.3 * wx.rain);
    scene.fog.near = fn + (d * 0.8 - fn) * fg;
    scene.fog.far = ff + (d * 1.75 + 25 - ff) * fg;
    shared.uFocus.value.set(f.x, f.z, f.radius * 1.15 + 3, fc && fc.alive ? 1 : 0);
    updateView();
    updateWeather(dt, d);
    updateFireworks(dt, d);
    W.cutaway.update(dt, camera.position, { x: fc ? fc.x : f.x, z: fc ? fc.z : f.z, r: f.radius }, !!(fc && fc.alive) && !showcase && !rig.rig.fixed);
    if (cutSnap) { W.cutaway.snap(); cutSnap = false; }
    shared.uPointScale.value = gl.domElement.height * camera.projectionMatrix.elements[5] / 2;

    const lite = QUALITY[q].lite;
    crown.shaft.visible = crown.shaft.visible && !lite;
    pickups.beams.visible = !lite;
    water.jets.visible = !lite;
    W.halos.points.visible = !lite && T.lampsOn;
    const p3 = performance.now();
    gl.info.reset();
    if (composer && QUALITY[q].bloom) composer.render(dt);
    else gl.render(scene, camera);
    const p4 = performance.now();
    const ek = 0.05;
    perf.update += (p1 - p0 - perf.update) * ek; perf.write += (p2 - p1 - perf.write) * ek;
    perf.other += (p3 - p2 - perf.other) * ek; perf.submit += (p4 - p3 - perf.submit) * ek;
    perf.upload = crowd.stats.drawn * 48 + particles.top * 36 + heroes.count * 80 + 64 * 44;

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

  buildWorld();
  window.addEventListener('resize', resize);

  return {
    three: { renderer: gl, scene, camera },
    _dbg: { crowd, people, hats, heroes, get city() { return W.city; }, map, rings, walls, precip, zones, wx },
    setCrowds,
    frame,
    setFocus(i) { if (i !== focus) focus = i; },
    punch(s) { rig.punch(s); },
    crownTop() {
      const s = Math.min(3.4, Math.max(1.2, rig.rig.d / 34));
      return (crownState.lift ?? 2.6 + 1.1 * s) + 1.4 * s;
    },
    setCameraMode(mode, opts = {}) {
      showcase = mode === 'showcase';
      show.cycle = showcase && !!opts.cycle;
      show.t = 0; show.x = show.z = null;
      if (opts.theme) this.setTheme(opts.theme);
    },
    // optional (R4): city theme; rebuilds the city and ground (~0.2 s on desktop), keeps crowds and camera
    setTheme(id) {
      if (forceTheme || !THEMES[id] || id === T.id) return T.id;
      T = getTheme(id);
      if (!weatherSet) weatherId = T.weather || 'clear';
      disposeWorld(); buildWorld();
      cutSnap = true;
      return T.id;
    },
    setWeather(id) {
      if (forceWeather || forceTheme) return weatherId;
      weatherSet = id != null;
      weatherId = WEATHER_IDS.includes(id) ? id : (T.weather || 'clear');
      applyWeather();
      return weatherId;
    },
    setZones,
    updateCrowdMeta(index, meta, opts = {}) {
      const ok = crowd.updateMeta(index, meta, opts.from);
      if (ok) refreshEmblems();
      return ok;
    },
    themes() { return THEME_IDS.slice(); },
    weathers() { return WEATHER_IDS.slice(); },
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
    cameraYaw() { return rig.rig.yaw + (rig.rig.orbit || 0); },
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
        quality: q, theme: T.id, weather: weatherId, zones: zones.size,
        popIn: crowd.stats.popIn, popOut: crowd.stats.popOut, recruits: crowd.stats.recruits, transfers: crowd.stats.transfers,
        cityVerts: W.city.verts, cityBaseVerts: W.city.baseVerts,
        dpr: gl.getPixelRatio(),
      };
    },
    dispose() {
      window.removeEventListener('resize', resize);
      disposeWorld();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) { for (const v of Object.values(o.material.uniforms || {})) if (v && v.value && v.value.isTexture) v.value.dispose(); o.material.dispose(); }
      });
      people.dispose();
      if (composer) composer.dispose();
      gl.dispose();
    },
  };
}
