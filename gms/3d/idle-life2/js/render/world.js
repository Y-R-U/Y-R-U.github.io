import * as THREE from 'three';
import { createCardRig, createHeroDirector } from './cameras.js?v=20261004a';
import { createLighting, lerpLight } from './kit/lighting.js?v=20261004a';
import { createField, buildTerrain, buildWater, terrainMesh } from './kit/terrain.js?v=20261004a';
import { buildTown } from './kit/town.js?v=20261004a';
import { createAmbient } from './kit/ambient.js?v=20261004a';
import { LIGHTS, DAY_KEYS } from '../data/palette.js?v=20261004a';
import * as PL from '../data/plots.js?v=20261004a';
import lemonade from './plots/lemonade.js?v=20261004a';
import foodtruck from './plots/foodtruck.js?v=20261004a';
import barber from './plots/barber.js?v=20261004a';
import cafe from './plots/cafe.js?v=20261004a';
import carwash from './plots/carwash.js?v=20261004a';
import petsalon from './plots/petsalon.js?v=20261004a';
import fishchips from './plots/fishchips.js?v=20261004a';
import ferry from './plots/ferry.js?v=20261004a';
import boatyard from './plots/boatyard.js?v=20261004a';
import boutique from './plots/boutique.js?v=20261004a';
import bistro from './plots/bistro.js?v=20261004a';
import appstudio from './plots/appstudio.js?v=20261004a';
import home from './plots/home.js?v=20261004a';

export const PLOT_BUILDERS = { home, lemonade, foodtruck, barber, cafe, carwash, petsalon, fishchips, ferry, boatyard, boutique, bistro, appstudio };

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
  let light = lightAt(TOD ?? new Date().getHours() + new Date().getMinutes() / 60);
  rig.apply(light);
  kit.setNight(light.night);
  kit.setLight?.(light);

  const ST = data.street;
  const geo = {
    bounds: { x0: PL.WORLD_BOUNDS.x0 - 60, x1: PL.WORLD_BOUNDS.x1 + 60, z0: PL.WORLD_BOUNDS.z0 - 60, z1: PL.WORLD_BOUNDS.z1 + 50 },
    core: { x0: ST.x0 - 50, x1: ST.x1 + 40, z0: -78, z1: 48 },
    shore: PL.SHORE, coast: PL.COAST, river: PL.RIVER, riverW: 13, quays: [PL.QUAY],
  };
  const field = createField(geo);
  const ground = terrainMesh(buildTerrain(field, P), kit.materials.uber);
  ground.name = 'terrain';
  const water = new THREE.Mesh(buildWater(field, P), kit.materials.water);
  water.name = 'water';
  water.receiveShadow = true;
  water.renderOrder = 2;
  scene.add(ground, water);
  const town = buildTown(kit, { ...PL, STREET: ST }, field, P, data.districtPalettes);
  for (const m of town.chunks) scene.add(m);
  const casters = town.chunks.filter((m) => m.castShadow);
  const setTownCast = (on) => { for (const m of casters) m.castShadow = on; };
  const ambient = createAmbient(kit, scene, { lamps: town.lamps, life: town.life, street: ST, span: PL.DISTRICT_SPAN, field, palette: P });

  const plots = new Map();
  const lineOf = Object.fromEntries(data.lines.map((l) => [l.id, l]));
  for (const p of data.plots) {
    const build = PLOT_BUILDERS[p.id];
    if (!build) continue;
    const pal = Object.assign({}, P, data.districtPalettes[p.district] || {});
    let plot;
    try { plot = build(kit, { line: lineOf[p.id] || null, palette: pal, skin, rng: rngFrom(p.x * 13 + 1), district: p.district }); }
    catch (e) { console.error('plot ' + p.id + ' failed', e); continue; }
    plot.id = p.id;
    plot.district = p.district;
    if (!plot.heroBox && p.district === 'oldtown' && p.id !== 'home') plot.heroBox = { z0: -9.0, z1: 0.8, h: 7.4, hf: 1.6 };
    plot.group.position.set(p.x, 0, p.z);
    plot.group.rotation.y = p.rotY;
    plot.group.userData.plotId = p.id;
    plot.group.traverse((o) => { o.userData.plotId = p.id; });
    scene.add(plot.group);
    plots.set(p.id, plot);
    plot.lamps?.forEach((l) => ambient.addLamp([l[0] + p.x, l[1], l[2] + p.z]));
  }
  scene.updateMatrixWorld(true);

  const bounds = { ...PL.WORLD_BOUNDS };
  const rigs = new Map();
  const heroRig = createHeroDirector({ plots, bounds });
  let time = 0, lightClock = 0, cfgRenderer = null, cfgTier = null, tierName = 'mid';
  const homeStats = { owned: true, managed: false, visualTier: 0, stockRatio: 0 };
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
    scene, plots, heroRig, bounds, field, rig, ambient,
    roads: data.roadGraph, hub: data.homeAnchor,
    configureRenderer,
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
        lookOf(cam, _look);
        rig.place(_look, 22);
        scene.fog.near = 120; scene.fog.far = 560;
      } else {
        for (const p of plots.values()) p.group.visible = true;
        setTownCast(true);
        heroRig.setAspect(view.w / view.h);
        cam = heroRig.camera;
        lookOf(cam, _look);
        const dist = cam.position.distanceTo(_look);
        rig.place(_look, Math.min(160, Math.max(30, dist * 0.9)));
        scene.fog.near = dist + 90;
        scene.fog.far = dist * 3 + 480;
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
      lightClock -= dt;
      if (lightClock <= 0) {
        lightClock = 20;
        const d = new Date();
        light = lightAt(TOD ?? d.getHours() + d.getMinutes() / 60);
        rig.apply(light);
        kit.setNight(light.night);
        kit.setLight?.(light);
        tuneBloom();
        cfgTier = null;
      }
      const st = game.state;
      homeStats.visualTier = 0;
      homeStats.stockRatio = Math.min(1, (st.bootstrap?.cans || 0) / 30);
      homeStats.state = st;
      const tour = [];
      for (const l of data.lines) if (st.lines[l.id]?.lv > 0) tour.push(l.id);
      if (!tour.length) tour.push('home');
      heroRig.update(dt, tour);
      lookOf(heroRig.camera, _look);
      for (const [id, p] of plots) {
        const near = Math.abs(p.group.position.x - _look.x) < 45;
        if (visibleLineIds && !visibleLineIds.has(id) && id !== heroRig.current && !near) continue;
        p.update(dt, id === 'home' ? homeStats : game.stats(id), time, tierName);
      }
      ambient.update(dt, time, light.night);
    },
    dispose() {
      scene.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); });
    },
  };
  return world;
}
