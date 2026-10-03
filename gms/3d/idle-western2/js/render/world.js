import * as THREE from 'three';
import { createCardRig, createHeroDirector } from './cameras.js?v=20261004c';
import { createLighting, lerpLight } from './kit/lighting.js?v=20261004c';
import { createField, buildTerrain, terrainMesh } from './kit/terrain.js?v=20261004c';
import { buildTown } from './kit/town.js?v=20261004c';
import { createAmbient } from './kit/ambient.js?v=20261004c';
import { LIGHTS, DAY_KEYS } from '../data/palette.js?v=20261004c';
import { gameClock, CYCLE_SEC } from '../data/clock.js?v=20261004c';
import * as PL from '../data/plots.js?v=20261004c';

import { PLOT_BUILDERS, FALLBACK_PLOT } from './plots/index.js?v=20261004c';

export { PLOT_BUILDERS };
const HUB = PL.HUB;

function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const TOD = params.has('tod') ? +params.get('tod') : null;
const TM = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, none: THREE.NoToneMapping, cineon: THREE.CineonToneMapping }[params.get('tm') || 'aces'];
const EXPO = params.has('expo') ? +params.get('expo') : 1;
// ?cycle=60 runs the W18 day in 60 s (tests); ?clock=sec offsets the game clock.
const CYCLE = params.has('cycle') ? +params.get('cycle') : CYCLE_SEC;
const CLOCK0 = params.has('clock') ? +params.get('clock') : 0;
const CARD_R = 40, SHADOW_R = 60;

function lightAt(hour) {
  let i = 0;
  while (i < DAY_KEYS.length - 2 && hour >= DAY_KEYS[i + 1][0]) i++;
  const [h0, k0] = DAY_KEYS[i], [h1, k1] = DAY_KEYS[i + 1];
  return lerpLight(LIGHTS[k0], LIGHTS[k1], Math.max(0, Math.min(1, (hour - h0) / Math.max(1e-3, h1 - h0))));
}

export function createWorld({ kit, data, skin = null }) {
  const P = Object.assign({}, data.palette, skin?.palette || {});
  const scene = new THREE.Scene();
  const rig = createLighting(scene, null);
  const clock = { sec: 0, ...gameClock(CLOCK0, CYCLE) };
  let light = lightAt(TOD ?? clock.hour);
  rig.apply(light);
  kit.setNight(light.night);
  kit.setLight?.(light);

  const ST = data.street;
  // No sea or river in the desert: the field's shore/coast/river sit far outside the world.
  const geo = {
    bounds: { x0: PL.WORLD_BOUNDS.x0 - 60, x1: PL.WORLD_BOUNDS.x1 + 60, z0: PL.WORLD_BOUNDS.z0 - 60, z1: PL.WORLD_BOUNDS.z1 + 50 },
    core: { x0: ST.x0 - 60, x1: ST.x1 + 50, z0: -70, z1: 60 },
    shore: [[-1e5, -1e6], [1e5, -1e6]], coast: [[-1e5, -2e6], [1e5, -2e6]], river: [[1e6, 1e6], [1e6 + 1, 1e6 + 1]], riverW: 1, quays: [],
  };
  const field = createField(geo);
  const ground = terrainMesh(buildTerrain(field, P), kit.materials.uber);
  ground.name = 'terrain';
  scene.add(ground);
  const town = buildTown(kit, { ...PL, STREET: ST }, field, P);
  for (const m of town.chunks) scene.add(m);
  const casters = town.chunks.filter((m) => m.castShadow);
  const cells = town.chunks.filter((m) => m.userData.cell);
  const farMesh = town.chunks.find((m) => m.name === 'town:far');
  const bulbMesh = town.chunks.find((m) => m.name === 'town:bulbs');
  const cellDist = (c, x, z) => Math.max(0, c.x0 - x, x - c.x1) + (c.band === 'n' ? Math.max(0, z - 5) : c.band === 's' ? Math.max(0, 13 - z) : Math.max(0, 5 - z, z - 13));
  // P#5: only chunks near what the view looks at cast into the shadow map; far ones never do.
  const setTownCast = (on, x = 0, z = 0) => { for (const m of casters) m.castShadow = on && (!m.userData.cell || cellDist(m.userData.cell, x, z) < SHADOW_R); };
  // P#2: cards draw only the chunks around their plot; Pomfrey's side only when a card camera is turned to face it.
  const cullTown = (card, x, southOn) => {
    for (const m of cells) {
      const c = m.userData.cell;
      m.visible = !card || (c.x1 > x - CARD_R && c.x0 < x + CARD_R && (c.band !== 's' || southOn));
    }
    if (farMesh) farMesh.visible = !card;
    if (bulbMesh) bulbMesh.visible = !card;
  };
  const pool = kit.materials.crowdPool;
  const CARD_L = kit.CROWD_LAYER?.card ?? 1, TOWN_L = kit.CROWD_LAYER?.town ?? 2;
  pool?.activate(scene);
  const ambient = createAmbient(kit, scene, { lamps: town.lamps, life: town.life, street: ST });

  const plots = new Map();
  const lineOf = Object.fromEntries(data.lines.map((l) => [l.id, l]));
  for (const p of data.plots) {
    const build = PLOT_BUILDERS[p.id] || (p.kind === 'line' ? FALLBACK_PLOT : null);
    if (!build) continue;
    const pal = Object.assign({}, P, data.districtPalettes?.[p.district] || {});
    let plot;
    try { plot = build(kit, { line: lineOf[p.id] || null, palette: pal, skin, rng: rngFrom(p.x * 13 + 1), district: p.district }); }
    catch (e) { console.error('plot ' + p.id + ' failed', e); continue; }
    plot.id = p.id;
    plot.district = p.district;
    plot.group.position.set(p.x, 0, p.z);
    plot.group.rotation.y = p.rotY;
    plot.group.userData.plotId = p.id;
    plot.group.traverse((o) => { o.userData.plotId = p.id; });
    scene.add(plot.group);
    plots.set(p.id, plot);
    plot.lamps?.forEach((l) => ambient.addLamp([l[0] + p.x, l[1], l[2] + p.z]));
  }
  // Warm spill on the dirt in front of every lit frontage (night pools; same decal draw as the lamps).
  const spill = [];
  for (const p of data.plots) if (p.kind === 'line') spill.push([p.x, p.z + 4.1, (p.w || 14) * 0.3, 2.1]);
  for (const f of PL.FRONTS || []) if (f.side === 's') spill.push([f.x, f.z - 3.4, (f.w || 12) * 0.28, 1.6]);
  ambient.addSpill?.(spill);
  scene.updateMatrixWorld(true);

  const bounds = { ...PL.WORLD_BOUNDS };
  const rigs = new Map();
  const heroRig = createHeroDirector({ plots, bounds });
  let time = 0, lightClock = 0, simSec = null, splitClock = 0, warmCam = null, primed = false, cfgRenderer = null, cfgTier = null, tierName = 'mid';
  const hubStats = { owned: true, managed: false, visualTier: 0, stockRatio: 0, state: null };
  const _look = new THREE.Vector3(), _dir = new THREE.Vector3(), _lamps = [];

  function configureRenderer(renderer, tier = tierName) {
    if (renderer === cfgRenderer && tier === cfgTier) return;
    cfgRenderer = renderer; cfgTier = tier;
    renderer.shadowMap.enabled = tier !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = TM;
    renderer.toneMappingExposure = EXPO * (light.exposure ?? 1);
    rig.setShadowMap(tier === 'high' ? 2048 : 1024);
    rig.sun.castShadow = tier !== 'low';
  }
  scene.onBeforeRender = (renderer) => configureRenderer(renderer);

  function lookOf(cam, out) {
    cam.getWorldDirection(_dir);
    const t = _dir.y < -0.05 ? -cam.position.y / _dir.y : 40;
    return out.copy(cam.position).addScaledVector(_dir, Math.min(t, 400));
  }

  const renderConfig = { bloom: { strength: 0.25, threshold: 2.4, knee: 1.0 }, tilt: { focus: 0.5, band: 0.2, feather: 0.34, strength: 0.6 } };
  const tuneBloom = () => { const n = light.night || 0; renderConfig.bloom.threshold = 2.6 - 1.8 * n; renderConfig.bloom.strength = 0.22 + 0.2 * n; };
  tuneBloom();
  const world = {
    renderConfig,
    scene, plots, heroRig, bounds, field, rig, ambient, town, clock, pool,
    get light() { return light; },
    // W18 game clock for U/E: { sec, f, hour, phase, night (bool), golden } — same object every call, updated per tick.
    gameClock() { return clock; },
    roads: data.roadGraph, hub: data.hubAnchor,
    configureRenderer,
    warmup(on) {
      if (!on) return null;
      kit.materials.splitUber(scene);
      for (const p of plots.values()) p.group.visible = true;
      setTownCast(true);
      const b = geo.bounds, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, hw = (b.x1 - b.x0) / 2, hd = (b.z1 - b.z0) / 2;
      warmCam ||= new THREE.OrthographicCamera(-hw, hw, hd, -hd, 1, 600);
      warmCam.layers.enableAll();
      if (pool) { pool.mesh.count = pool.blob.count = 1; pool.mesh.visible = pool.blob.visible = true; }
      warmCam.position.set(cx, 300, cz);
      warmCam.lookAt(cx, 0, cz);
      warmCam.updateMatrixWorld();
      rig.place(_look.set(cx, 0, cz), Math.max(hw, hd));
      return warmCam;
    },
    cardRig(lineId) {
      if (!rigs.has(lineId)) rigs.set(lineId, createCardRig(plots.get(lineId)));
      return rigs.get(lineId);
    },
    prepare(view) {
      let cam;
      if (view.kind === 'line') {
        for (const [id, p] of plots) p.group.visible = id === view.lineId;
        setTownCast(false);
        const r = this.cardRig(view.lineId);
        kit.FIT.card = true;
        try { r.fit(view.w / view.h); } finally { kit.FIT.card = false; }
        cam = r.camera;
        cam.layers.enable(CARD_L); cam.layers.disable(TOWN_L);
        lookOf(cam, _look);
        cullTown(true, plots.get(view.lineId)?.group.position.x ?? _look.x, cam.getWorldDirection(_dir).z > 0.2);
        rig.place(_look, 22);
        scene.fog.near = 120; scene.fog.far = 560;
      } else {
        for (const p of plots.values()) p.group.visible = true;
        heroRig.setAspect(view.w / view.h);
        cam = heroRig.camera;
        cam.layers.enable(TOWN_L); cam.layers.disable(CARD_L);
        lookOf(cam, _look);
        cullTown(false);
        setTownCast(true, _look.x, _look.z);
        const dist = cam.position.distanceTo(_look);
        rig.place(_look, Math.min(160, Math.max(30, dist * 0.9)));
        scene.fog.near = dist + 110;
        scene.fog.far = dist * 3 + 980;
        if (pool) { cam.updateMatrixWorld(); pool.gather(cam); }
      }
      if (light.lamps > 0.01) {
        _dir.copy(cam.position).sub(_look).setY(0).normalize();
        kit.setLamps(ambient.nearest(_look.x + _dir.x * 6, _look.z + _dir.z * 6, 8, _lamps));
      }
      ambient.prepare(view, cam);
      return cam;
    },
    update(dt, game, shipments, visibleLineIds, tier = 'mid') {
      time += dt;
      tierName = typeof tier === 'string' ? tier : tier?.name || 'mid';
      kit.setTime(time);
      if ((splitClock -= dt) <= 0) { splitClock = 4; kit.materials.splitUber(scene); }
      // W18: the game's own day, from game time (simTime is saved, so a fresh save boots in golden hour).
      const sim = typeof game?.simTime === 'number' ? game.simTime : (simSec ?? 0) + dt;
      simSec = sim;
      Object.assign(clock, gameClock(sim + CLOCK0, CYCLE), { sec: sim + CLOCK0 });
      lightClock -= dt;
      if (lightClock <= 0) {
        lightClock = 1;
        light = lightAt(TOD ?? clock.hour);
        rig.apply(light);
        kit.setNight(light.night);
        kit.setLight?.(light);
        tuneBloom();
        cfgTier = null;
      }
      const st = game.state;
      hubStats.state = st;
      const tour = [];
      for (const l of data.lines) if (st.lines[l.id]?.lv > 0) tour.push(l.id);
      if (!tour.length) tour.push(HUB);
      heroRig.update(dt, tour);
      lookOf(heroRig.camera, _look);
      const heroOn = !visibleLineIds || visibleLineIds.hero !== false;
      if (!primed) { primed = true; for (const [id, p] of plots) p.update(0, id === HUB ? hubStats : game.stats(id), time, tierName); }
      for (const [id, p] of plots) {
        const near = heroOn && Math.abs(p.group.position.x - _look.x) < 45;
        if (visibleLineIds && !visibleLineIds.has(id) && !(heroOn && id === heroRig.current) && !near) continue;
        p.update(dt, id === HUB ? hubStats : game.stats(id), time, tierName);
      }
      ambient.update(dt, time, light.night, light);
      town.tick?.(dt, time);
      town.graves?.setCount(st.graves?.length || 0);
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    },
  };
  return world;
}
