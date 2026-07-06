// Buildings: ghost → site (stakes + goods pile) → building (rises while
// hammered) → done (employs workers, functions tick). The campfire is the
// first stockpile + prayer site; the Monument is a procedural henge raised in
// three consecrated stages — finishing it wins the game.

import * as THREE from 'three';
import { CELL, GRID, SEA, CFG, BUILDINGS } from './config.js';
import { model } from './assets.js';
import { cellToWorld, worldToCell, cellIdx, inIsle } from './terrain.js';
import * as FX from './fx.js';
import { rand, pick, clamp, lerp, mesh, M, dist2 } from './utils.js';

let _glowTex = null;
function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,220,150,0.9)');
  gr.addColorStop(0.4, 'rgba(255,150,60,0.4)');
  gr.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _glowTex = new THREE.CanvasTexture(c);
  return _glowTex;
}

export function createBuildings(game) {
  const { scene, T, W } = game;
  const B = { list: [], nextId: 1, fire: null };
  const byId = new Map();
  B.byId = (id) => byId.get(id);

  // ── the campfire (town centre) ──────────────────────────────────────────────
  B.initCamp = async () => {
    const { x, z } = T.camp;
    const b = baseObj('fire', null, 0, 0);
    b.x = x; b.z = z; b.y = T.heightAt(x, z);
    b.state = 'done';
    b.hp = b.maxHp = 200;
    b.stock = true; b.prayer = true;
    const g = new THREE.Group();
    const fire = await model('fire', { ownMaterial: true });
    fire.scale.setScalar(1.5);
    fire.traverse(o => {
      if (o.isMesh) { o.material.emissive = new THREE.Color(0xff7a28); o.material.emissiveIntensity = 0.85; }
    });
    g.add(fire);
    // additive flame glow that breathes
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), color: 0xffa040, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    glow.scale.set(3.6, 3.6, 1);
    glow.position.y = 1.1;
    g.add(glow);
    b.glow = glow;
    // ring of sitting stones + a torch + supply crates
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const st = await model('rocks_small');
      st.scale.setScalar(0.8);
      st.position.set(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4);
      g.add(st);
    }
    const torch = await model('torch');
    torch.position.set(2.2, 0, -2.2);
    g.add(torch);
    const crate = await model('crate');
    crate.position.set(-2.8, 0, 2.2); crate.scale.setScalar(0.9);
    g.add(crate);
    const barrel = await model('barrel');
    barrel.position.set(-3.5, 0, 1.2); barrel.scale.setScalar(0.9);
    g.add(barrel);
    g.position.set(x, b.y, z);
    scene.add(g);
    b.mesh = g;
    // warm flicker at night
    const light = new THREE.PointLight(0xff9a40, 0, 16);
    light.position.set(x, b.y + 1.6, z);
    scene.add(light);
    b.light = light;
    b.smoke = FX.addSmokeSource(x, b.y + 1.2, z, 0.8);
    const { cx, cz } = worldToCell(x, z);
    T.blockArea(cx - 1, cz - 1, 2, 2);
    B.list.push(b); byId.set(b.id, b);
    B.fire = b;
    return b;
  };

  function baseObj(type, def, cx, cz) {
    const b = {
      id: B.nextId++, type, def, cx, cz,
      size: def?.size || 2, sizeW: (def?.size || 2) * CELL,
      x: 0, z: 0, y: 0, state: 'site',
      needs: { ...(def?.cost || {}) }, delivered: {}, incoming: {}, work: 0,
      workNeed: 8 + Object.values(def?.cost || {}).reduce((a, b2) => a + b2, 0) * 0.35,
      workers: 0, hp: 10, maxHp: def?.hp || 60, burning: 0, riseK: 0,
      stage: 1, stock: false, prayer: false, plots: null, jobWorkers: [],
    };
    return b;
  }

  // ── placement ───────────────────────────────────────────────────────────────
  B.canPlace = (type, cx, cz) => {
    const def = BUILDINGS[type];
    if (!def) return false;
    return T.canBuild(cx, cz, def.size, !!def.needsRock);
  };

  B.place = async (type, cx, cz) => {
    const def = BUILDINGS[type];
    const b = baseObj(type, def, cx, cz);
    const c = cellToWorld(cx, cz);
    b.x = c.x + (def.size - 1) * CELL / 2;
    b.z = c.z + (def.size - 1) * CELL / 2;
    T.blockArea(cx, cz, def.size, 2);
    b.y = T.levelArea(cx, cz, def.size);
    W.onTerrainEdit({ cx0: cx - 1, cz0: cz - 1, cx1: cx + def.size, cz1: cz + def.size });

    const g = new THREE.Group();
    g.position.set(b.x, b.y, b.z);
    scene.add(g);
    b.mesh = g;

    // corner stakes + rope = the site
    const stakeGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.1, 5);
    const stakeMat = M(0x8a6a42);
    const hw = b.sizeW / 2 - 0.3;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const st = mesh(stakeGeo, stakeMat, sx * hw, 0.55, sz * hw);
      g.add(st);
    }
    b.siteBits = [];
    // the building model itself, sunk underground until built
    if (def.model) {
      const m = await model(def.model);
      const s = def.scale * ((def.size * CELL) / Math.max(m.userData.size.x, m.userData.size.z, 1));
      m.scale.setScalar(s);
      b.modelH = m.userData.size.y * s;
      m.position.y = -b.modelH;
      m.visible = false;
      g.add(m);
      b.buildingMesh = m;
    } else if (type === 'monument') {
      await buildMonumentStage(b, 0);
    }
    B.attachSiteApi(b);
    B.list.push(b); byId.set(b.id, b);
    game.AU?.sfx.place();
    FX.ringPulse(b.x, b.z, 0xe8d9a0, def.size * CELL * 0.7);
    return b;
  };

  // site API used by jobs.js
  const remaining = (b, type) => (b.needs[type] || 0) - (b.delivered[type] || 0) - (b.incoming[type] || 0);
  B.sitesNeedingMaterial = () => B.list.filter(b => b.state === 'site' && ['wood', 'stone'].some(t => remaining(b, t) > 0));
  B.sitesNeedingWork = () => B.list.filter(b => b.state === 'building');
  B.attachSiteApi = (b) => {
    b.remaining = (t) => remaining(b, t);
    b.nextNeed = () => ['wood', 'stone'].find(t => remaining(b, t) > 0) || null;
    b.receive = (t, n) => {
      b.delivered[t] = (b.delivered[t] || 0) + n;
      FX.floater(b.x, b.y + 2.5, b.z, `${t === 'wood' ? '🪵' : '🪨'}`);
      if (['wood', 'stone'].every(k => (b.delivered[k] || 0) >= (b.needs[k] || 0))) {
        b.state = 'building';
        if (b.buildingMesh) b.buildingMesh.visible = true;
        game.ui?.toast(`${b.def?.name || 'Site'} materials delivered — building!`);
      }
    };
    b.tryComplete = () => { if (b.state === 'building' && b.work >= b.workNeed) completeBuilding(b); };
  };

  async function completeBuilding(b) {
    b.state = 'done';
    b.hp = b.maxHp;
    b.riseK = 1;
    if (b.buildingMesh) b.buildingMesh.position.y = 0;
    game.AU?.sfx.complete();
    FX.burst(b.x, b.y + 1, b.z, { color: 0xf0e2b6, n: 18, spread: 2.5, up: 3, size: 0.5, life: 0.9 });
    FX.ringPulse(b.x, b.z, 0xf0e2b6, b.sizeW);
    game.ui?.toast(`${b.def.name} complete!`);

    if (b.type === 'hut') {
      b.smoke = FX.addSmokeSource(b.x + 0.4, b.y + b.modelH * 0.92, b.z, 0.5);
    }
    if (b.type === 'storehouse') {
      b.stock = true;
      const crate = await model('crate');
      crate.position.set(b.sizeW / 2 - 0.6, 0, b.sizeW / 2 - 0.4); crate.scale.setScalar(0.85);
      b.mesh.add(crate);
    }
    if (b.type === 'temple') {
      b.prayer = true;
      b.smoke = FX.addSmokeSource(b.x, b.y + b.modelH * 0.95, b.z, 0.25);
      const light = new THREE.PointLight(0xffd080, 0, 14);
      light.position.set(b.x, b.y + 2.5, b.z);
      scene.add(light);
      b.light = light;
    }
    if (b.type === 'farm') await buildFarmField(b);
    if (b.type === 'quarry') {
      // face = nearest rocky cell edge
      let best = null, bd = 1e9;
      for (let cz = b.cz - 2; cz < b.cz + b.size + 2; cz++) for (let cx = b.cx - 2; cx < b.cx + b.size + 2; cx++) {
        if (!inIsle(cx, cz) || !T.isRock(cx, cz)) continue;
        const p = cellToWorld(cx, cz);
        const d = dist2(p.x, p.z, b.x, b.z);
        if (d < bd) { bd = d; best = p; }
      }
      b.facePoint = best || { x: b.x + b.sizeW / 2 + 1, z: b.z };
    }
    if (b.type === 'monument') {
      b.state = 'blessing';         // awaits consecration
      game.ui?.toast('The Monument stage awaits your blessing ✨');
      game.ui?.tip('bless', 'Tap the Monument and consecrate the stage with faith to raise it.');
    }
    // employ workers
    if (b.def?.job) {
      const need = b.def.job.n;
      const free = game.V.unemployed()
        .sort((a, c) => dist2(a.x, a.z, b.x, b.z) - dist2(c.x, c.z, b.x, b.z));
      for (let i = 0; i < need && i < free.length; i++) {
        game.V.retrain(free[i], b.def.job.type, b);
        b.jobWorkers.push(free[i]);
      }
    }
    game.onBuildingDone?.(b);
  }

  // ── farm field: 3×3 plots of corn in front of the mill ────────────────────
  async function buildFarmField(b) {
    b.plots = [];
    const soilGeo = new THREE.CircleGeometry(1.05, 10).rotateX(-Math.PI / 2);
    const soilMat = M(0x5a4630);
    // mill sits centre; plots ring the front/side edges of the 5×5 plot
    const offs = [[-3.4, 1.2], [-3.4, 3.4], [-1.2, 3.4], [1.2, 3.4], [3.4, 3.4], [3.4, 1.2], [-1.2, -3.6], [1.2, -3.6], [3.4, -1.2]];
    for (const [ox, oz] of offs) {
      const px = b.x + ox, pz = b.z + oz;
      const soil = new THREE.Mesh(soilGeo, soilMat);
      soil.position.set(px, T.heightAt(px, pz) + 0.06, pz);
      soil.receiveShadow = true;
      scene.add(soil);
      const corn = await model('corn');
      corn.position.set(px, T.heightAt(px, pz), pz);
      corn.scale.setScalar(0.01);
      corn.visible = false;
      scene.add(corn);
      b.plots.push({ x: px, z: pz, state: 'empty', t: 0, corn, soil, claimedBy: null });
    }
    b.sowPlot = (p) => { p.state = 'growing'; p.t = 0; p.corn.visible = true; p.corn.scale.setScalar(0.05); };
    b.clearPlot = (p) => { p.state = 'empty'; p.t = 0; p.corn.visible = false; FX.burst(p.x, T.heightAt(p.x, p.z) + 0.6, p.z, { color: 0xe8cf6a, n: 8, spread: 0.8, up: 1.8, size: 0.35, life: 0.6 }); };
  }

  // ── the Monument (procedural henge, 3 stages) ───────────────────────────────
  async function buildMonumentStage(b, stage) {
    if (!b.monGroup) {
      b.monGroup = new THREE.Group();
      b.mesh.add(b.monGroup);
      // dais
      const dais = mesh(new THREE.CylinderGeometry(b.sizeW * 0.52, b.sizeW * 0.58, 0.5, 24), M(0x9a948a), 0, 0.25, 0);
      b.monGroup.add(dais);
    }
    if (stage >= 1 && !b.monS1) {
      b.monS1 = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const st = await model('stone_tall');
        st.scale.setScalar(1.6);
        st.position.set(Math.cos(a) * b.sizeW * 0.38, 0.4, Math.sin(a) * b.sizeW * 0.38);
        st.rotation.y = -a;
        b.monS1.add(st);
      }
      b.monGroup.add(b.monS1);
    }
    if (stage >= 2 && !b.monS2) {
      b.monS2 = new THREE.Group();
      const lintelMat = M(0xa8a29a);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.PI / 5;
        const l = mesh(new THREE.BoxGeometry(2.6, 0.55, 0.9), lintelMat,
          Math.cos(a) * b.sizeW * 0.38, 3.6, Math.sin(a) * b.sizeW * 0.38);
        l.rotation.y = -a + Math.PI / 2;
        b.monS2.add(l);
      }
      b.monGroup.add(b.monS2);
    }
    if (stage >= 3 && !b.monS3) {
      b.monS3 = new THREE.Group();
      const ob = await model('rock_pillar');
      ob.scale.setScalar(2.3);
      b.monS3.add(ob);
      const cr = await model('crystals');
      cr.scale.setScalar(1.6);
      cr.position.y = 6.2;
      b.monS3.add(cr);
      b.crystal = cr;
      // the beam
      const beam = mesh(
        new THREE.CylinderGeometry(0.7, 1.3, 60, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xbfffe8, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
        0, 30, 0, false);
      b.monS3.add(beam);
      b.beam = beam;
      b.monGroup.add(b.monS3);
    }
  }

  // consecrate the finished stage (called by ui; costs faith)
  B.consecrate = async (b) => {
    if (b.type !== 'monument' || b.state !== 'blessing') return false;
    if (!game.spendFaith(b.def.consecrate)) { game.ui?.toast('Not enough faith'); return false; }
    await buildMonumentStage(b, b.stage);
    FX.ringPulse(b.x, b.z, 0x8effd8, 16);
    for (let i = 0; i < 14; i++) FX.moteAt(b.x + rand(-3, 3), b.y + rand(1, 5), b.z + rand(-3, 3));
    game.AU?.sfx.bless();
    if (b.stage >= (b.def.stages || 3)) {
      b.state = 'done';
      game.win?.();
    } else {
      b.stage++;
      b.state = 'site';
      b.needs = { ...b.def.cost };
      b.delivered = {}; b.incoming = {}; b.work = 0;
      game.ui?.toast(`Monument stage ${b.stage} — more stone and timber!`);
    }
    return true;
  };

  // ── queries ────────────────────────────────────────────────────────────────
  B.stockpiles = () => B.list.filter(b => b.stock && (b.state === 'done'));
  B.nearestStock = (x, z) => {
    let best = B.fire, bd = B.fire ? dist2(x, z, B.fire.x, B.fire.z) : 1e9;
    for (const b of B.stockpiles()) {
      const d = dist2(x, z, b.x, b.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best || { x: T.camp.x, z: T.camp.z };
  };
  B.prayerSites = () => B.list.filter(b => b.prayer && b.state === 'done');
  B.count = (type) => B.list.filter(b => b.type === type && (b.state === 'done' || b.state === 'blessing')).length;
  B.housing = () => B.list.filter(b => b.type === 'hut' && b.state === 'done').length * BUILDINGS.hut.houses + 6;
  B.at = (wx, wz) => {
    for (const b of B.list) {
      const h = b.sizeW / 2 + 0.5;
      if (Math.abs(wx - b.x) < h && Math.abs(wz - b.z) < h) return b;
    }
    return null;
  };
  B.demolish = (b) => {
    if (b.type === 'fire') return;
    removeB(b, true);
  };
  function removeB(b, refund = false) {
    if (b.smoke) FX.removeSmokeSource(b.smoke);
    if (b.light) scene.remove(b.light);
    if (b.plots) for (const p of b.plots) { scene.remove(p.corn); scene.remove(p.soil); }
    scene.remove(b.mesh);
    T.freeArea(b.cx, b.cz, b.size);
    for (const v of b.jobWorkers) if (!v.dead) game.V.retrain(v, 'villager');
    const i = B.list.indexOf(b);
    if (i >= 0) B.list.splice(i, 1);
    byId.delete(b.id);
    if (refund) {
      const back = Math.floor(((b.delivered.wood || 0) + (b.needs.wood || 0)) * 0.4);
      if (back > 0) W.spawnDrop('wood', back, b.x, b.z);
    }
    game.onBuildingLost?.(b);
  }

  B.damage = (b, dmg) => {
    if (b.state !== 'done' && b.state !== 'blessing') return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      FX.burst(b.x, b.y + 1, b.z, { color: 0x64554a, n: 24, spread: 3, up: 3.5, size: 0.6, life: 1 });
      game.AU?.sfx.collapse();
      game.ui?.toast(`${b.def?.name || 'A building'} was destroyed!`, true);
      removeB(b, true);
    }
  };
  B.ignite = (b) => { if (b.burning <= 0) b.burning = 10; };

  // ── tick ───────────────────────────────────────────────────────────────────
  let flameAcc = 0, employAcc = 0;
  B.tick = (dt, t) => {
    flameAcc += dt;
    const doFlame = flameAcc > 0.3;
    if (doFlame) flameAcc = 0;
    // re-employ replacements when a worker dies
    employAcc += dt;
    if (employAcc > 5) {
      employAcc = 0;
      for (const b of B.list) {
        if (b.state !== 'done' || !b.def?.job) continue;
        b.jobWorkers = b.jobWorkers.filter(w => !w.dead);
        if (b.jobWorkers.length < b.def.job.n) {
          const free = game.V.unemployed()
            .sort((a, c) => dist2(a.x, a.z, b.x, b.z) - dist2(c.x, c.z, b.x, b.z));
          for (let i = 0; i < free.length && b.jobWorkers.length < b.def.job.n; i++) {
            game.V.retrain(free[i], b.def.job.type, b);
            b.jobWorkers.push(free[i]);
          }
        }
      }
    }
    for (const b of B.list) {
      // rising while being built
      if (b.state === 'building' && b.buildingMesh) {
        const k = clamp(b.work / b.workNeed, 0, 1);
        b.buildingMesh.position.y = -b.modelH * (1 - k) * 0.92;
      }
      // fire light flicker at night
      if (b.light) {
        const night = W.nightness();
        const base = b.type === 'fire' ? 26 : 10;
        b.light.intensity = night * (base + Math.sin(t * 11 + b.id) * 4 + Math.sin(t * 23) * 2);
      }
      if (b.glow) b.glow.material.opacity = 0.45 + W.nightness() * 0.35 + Math.sin(t * 7 + b.id) * 0.08;
      // farm growth
      if (b.plots) {
        const boost = game.rainBoostAt?.(b.x, b.z) ? 3.2 : 1;
        for (const p of b.plots) {
          if (p.state === 'growing') {
            p.t += dt * boost;
            const k = clamp(p.t / CFG.econ.growTime, 0, 1);
            p.corn.scale.setScalar(lerp(0.05, 1.15, k));
            if (k >= 1) p.state = 'ripe';
          }
        }
      }
      // monument crystal spin
      if (b.crystal) {
        b.crystal.rotation.y += dt * 0.7;
        b.crystal.position.y = 6.2 + Math.sin(t * 1.3) * 0.35;
        if (b.beam) b.beam.material.opacity = 0.18 + W.nightness() * 0.2 + Math.sin(t * 2.2) * 0.05;
      }
      // burning
      if (b.burning > 0) {
        b.burning -= dt;
        if (game.rainBoostAt?.(b.x, b.z)) b.burning = 0;
        if (doFlame) FX.burst(b.x + rand(-1, 1), b.y + 1.5, b.z + rand(-1, 1), { color: 0xff7a30, n: 6, spread: 0.8, up: 2.8, size: 0.55, life: 0.6 });
        B.damage(b, CFG.raiders.torchDps * dt);
      }
    }
  };

  // ── save / load ─────────────────────────────────────────────────────────────
  B.serialize = () => B.list.filter(b => b.type !== 'fire').map(b => ({
    t: b.type, cx: b.cx, cz: b.cz, s: b.state === 'blessing' ? 'blessing' : b.state,
    d: b.delivered, w: Math.round(b.work), hp: Math.round(b.hp), st: b.stage,
    p: b.plots ? b.plots.map(p => [p.state === 'empty' ? 0 : p.state === 'growing' ? 1 : 2, Math.round(p.t)]) : null,
  }));
  B.loadState = async (data) => {
    for (const b of [...B.list]) if (b.type !== 'fire') removeB(b);
    for (const d of data) {
      const b = await B.place(d.t, d.cx, d.cz);
      B.attachSiteApi(b);
      b.delivered = d.d || {};
      b.work = d.w; b.stage = d.st || 1;
      if (d.s === 'done' || d.s === 'blessing') {
        b.state = 'building';
        if (b.buildingMesh) b.buildingMesh.visible = true;
        b.work = b.workNeed;
        await completeBuilding(b);
        if (d.s === 'blessing') b.state = 'blessing';
        else if (b.type === 'monument') {
          // rebuild consecrated stages
          for (let s2 = 1; s2 < b.stage; s2++) await buildMonumentStage(b, s2);
          b.state = d.s;
        }
        b.hp = d.hp;
        if (b.plots && d.p) d.p.forEach(([ps, pt], i) => {
          const p = b.plots[i];
          if (!p) return;
          p.t = pt;
          if (ps === 1) { b.sowPlot(p); p.t = pt; }
          else if (ps === 2) { b.sowPlot(p); p.state = 'ripe'; p.corn.scale.setScalar(1.15); }
        });
      } else if (d.s === 'building') {
        b.state = 'building';
        if (b.buildingMesh) b.buildingMesh.visible = true;
      }
    }
  };

  return B;
}
