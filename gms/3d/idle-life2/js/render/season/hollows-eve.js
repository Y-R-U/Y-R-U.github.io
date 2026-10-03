// 🎃 Hollow's Eve: Old Town at night as a skin over the shared world (refs/hollows_eve_portrait.jpg).
// install(world, {kit, game}) wraps world.prepare/update: views whose id starts with `season:` (and the hero while the
// player is inside the season) get the moonlit palette, purple fog, jack-o'-lanterns, string lights, mist, bats and the
// three variant overlays (Witch's Brew on lemonade, Pumpkin Pie Wagon on foodtruck, Haunted Haircuts on barber).
import * as THREE from 'three';
import { flock, lights } from '../plots/fishchips.js?v=20261004c';

export const LIGHT = {
  sky: { top: '#1e1450', mid: '#46308e', horizon: '#8058b8' },
  sun: { color: '#a89eff', intensity: 0.92, azimuth: 115, elevation: 50 },
  fill: { sky: '#6c5ad8', ground: '#4a2f6a', intensity: 0.86 },
  rim: { color: '#ffb27a', intensity: 0.6 },
  bounce: '#ff8a3a', bounceK: 0.018,
  env: { ground: '#3a1f52' }, night: 1, lamps: 0.4, exposure: 1.2, sheen: '#b49cff', envK: 0.14,
};

export const PALETTE = {
  sky: '#2a1e4a', fog: '#6c4a8e', walls: ['#8c7bb0', '#4e8c8a', '#7a5a8e', '#9a95ae'], roofs: ['#4a3570', '#2f5560'],
  cobbles: ['#7e7896', '#6a6484', '#76708e', '#837d9b'], window: { c: '#ffb45a', r: 0.3, g: -1.4 }, accent: '#f08a2c',
};

const LINES = { witchbrew: 'lemonade', pumpkinpie: 'foodtruck', hauntedcuts: 'barber' };
const COSTUME = ['#f08a2c', '#a47ae0', '#e8d26a', '#6cc06a', '#f6f1e7', '#5ab8b0', '#e0605a', '#ffb45a'];
const C = {
  shell: { c: '#e8792e', r: 0.55, g: 0.28 }, shell2: { c: '#d8692a', r: 0.55, g: 0.22 }, stem: '#5a7a3a', glow: { c: '#ffd04a', r: 0.4, g: 2.0 }, brew: { c: '#5fe04a', r: 0.3, g: 1.25 },
  iron: '#2a2433', string: { c: '#ffa04a', r: 0.3, g: 1.2 }, lantern: { c: '#ff8a2a', r: 0.4, g: 1.6 }, lantern2: { c: '#ffc04a', r: 0.4, g: 1.5 }, purple: '#6a3f9a', orange: '#f08a2c', bone: '#efe8d8', ghost: { c: '#eef0ff', r: 0.4, g: 0.55 },
  crust: '#e3a656', filling: '#d8692a', bottle: { c: '#6fe08a', r: 0.15, m: 0.1, g: 0.6 }, cork: '#a9774f', candle: { c: '#ffd27a', r: 0.4, g: 2.4 },
  wax: '#efe6d2', web: '#d9d4e6', hay: '#d9b45a', wood: '#7a5238', moon: '#f3eedc', crater: '#cfc6e4',
};

export function install(world, { kit, game = null, always = false } = {}) {
  const scene = world.scene, rig = world.rig, plots = world.plots;
  const pal = Object.assign({}, C);
  const root = new THREE.Group();
  root.name = 'season:hollows-eve';
  root.visible = false;
  scene.add(root);

  // ---- town dressing: pumpkins along the Old Town kerbs and doorsteps, string lights across the terrace fronts
  const deco = kit.builder(pal, { seed: 1031 });
  let r = 77;
  const rnd = () => { r = (r * 16807) % 2147483647; return r / 2147483647; };
  const oldTown = [...plots.values()].filter((p) => p.district === 'oldtown');
  const xs = oldTown.map((p) => p.group.position.x);
  const x0 = Math.min(...xs) - 14, x1 = Math.max(...xs) + 14;
  const glowPts = [], lanternPts = [];
  const pk = (B, x, z, sz, ry, face) => { pumpkin(B, x, z, sz, ry, face); if (face !== 0) glowPts.push([x, sz * 0.8, z, sz * 2.5]); };
  for (let x = x0; x < x1; x += 2.6 + rnd() * 2.2) pk(deco, x, 4.05 + rnd() * 0.2, 0.32 + rnd() * 0.16, rnd() * 0.6 - 0.3);
  for (let x = x0 + 1; x < x1; x += 3.4 + rnd() * 2) { pk(deco, x, -7.75, 0.34 + rnd() * 0.12, 0); if (rnd() < 0.4) pk(deco, x + 0.55, -7.6, 0.24, 0.3); }
  for (let x = x0 + 0.5; x < x1; x += 3.2 + rnd() * 2.4) { pk(deco, x, 11.3 + rnd() * 0.3, 0.36 + rnd() * 0.12, rnd() - 0.5); if (rnd() < 0.6) pk(deco, x + 0.5, 11.0, 0.26, 0.4); }
  for (let x = x0; x < x1 - 4; x += 6.5) lights(deco, [x, 3.3, -8.3], [x + 6.5, 3.3, -8.3], 9, 0.55, { c: 'string', g: 1.3, r: 0.1 });
  for (const p of oldTown) {
    const px = p.group.position.x;
    for (const s of [-1, 1]) {
      const ex = px + s * 6.6;
      for (const z of [3.7, 11.2]) { deco.cyl('iron', ex, 0, z, 0.06, 3.3, 0, { sides: 5 }); deco.ball('iron', ex, 3.32, z, 0.1, { detail: 0 }); }
      lanterns(deco, [ex, 3.2, 3.7], [ex, 3.2, 11.2], 6, 0.6);
      lanterns(deco, [ex, 3.2, 3.7], [ex, 3.5, -8.3], 8, 0.5);
    }
    for (const [dx, dz] of [[-4.6, 3.3], [4.4, 3.4]]) { pk(deco, px + dx, dz, 0.46, 0.2); pk(deco, px + dx + 0.6, dz + 0.15, 0.34, -0.4); pk(deco, px + dx + 0.25, dz - 0.15, 0.28, 0.1, 1); }
    hay(deco, px + 7.6, 2.9);
    candles(deco, px - 7.8, 3.1);
    web(deco, px - 6.55, 2.4, 3.72);
  }
  const decoMesh = deco.finish();
  decoMesh.name = 'season:deco';
  root.add(decoMesh);

  // ---- the moon and ground mist
  const mb = kit.builder(pal);
  mb.ball('moon', 0, 0, 0, 1, { detail: 2, sz: 0.2, smooth: false });
  for (const [x, y, s] of [[-0.35, 0.3, 0.28], [0.25, -0.2, 0.36], [0.4, 0.42, 0.17], [-0.2, -0.45, 0.2], [-0.55, -0.1, 0.14]]) mb.ball('crater', x, y, 0.16, s, { detail: 1, sz: 0.12 });
  const moonMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  const moon = new THREE.Mesh(mb.geometry({ ao: 0 }), moonMat);
  moon.castShadow = false;
  moon.matrixAutoUpdate = true;
  moon.renderOrder = -1;
  root.add(moon);
  const mistMat = new THREE.MeshBasicMaterial({ color: 0x8a6bb0, map: kit.materials.basicBlob.map, transparent: true, opacity: 0.4, depthWrite: false, fog: false });
  const mistGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const mist = new THREE.InstancedMesh(mistGeo, mistMat, 18);
  mist.renderOrder = 3;
  mist.frustumCulled = false;
  const mm = new THREE.Matrix4();
  for (let i = 0; i < 18; i++) {
    const x = x0 + (i / 17) * (x1 - x0) + (rnd() - 0.5) * 6, z = (rnd() - 0.5) * 10 - 1, s = 9 + rnd() * 8;
    mist.setMatrixAt(i, mm.compose(new THREE.Vector3(x, 0.25 + rnd() * 0.3, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s * 0.6)));
  }
  root.add(mist);
  const poolMat = new THREE.MeshBasicMaterial({ color: 0xff7a26, map: kit.materials.basicBlob.map, transparent: true, opacity: 0.17, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const pools = new THREE.InstancedMesh(mistGeo, poolMat, glowPts.length);
  pools.renderOrder = 3;
  pools.frustumCulled = false;
  glowPts.forEach(([x, , z, r], i) => pools.setMatrixAt(i, mm.compose(new THREE.Vector3(x, 0.06, z), new THREE.Quaternion(), new THREE.Vector3(r * 0.8, 1, r * 0.8))));
  root.add(pools);

  // ---- bats: one flock that follows whichever view is being drawn
  const batHost = { pal, group: root };
  const bats = flock(kit, batHost, 9, 'bat');

  // ---- variant overlays (children of the base plots so they move with them)
  const variants = {};
  for (const [vid, base] of Object.entries(LINES)) {
    const plot = plots.get(base);
    if (!plot) continue;
    const g = new THREE.Group();
    g.name = 'season:' + vid;
    g.visible = false;
    plot.group.add(g);
    const v = { id: vid, base, plot, group: g, parts: {} };
    ({ witchbrew, pumpkinpie, hauntedcuts })[vid](v);
    variants[vid] = v;
  }

  // ---- per-view switching
  let on = false, saved = null, focus = null, insideHero = false, usedAt = -1e9;
  const _look = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _lampList = [], _lampMix = [], _lampPool = [], byDist = (a, b) => a[4] - b[4];
  const lampPts = lanternPts.map((p) => [p[0], p[1], p[2], 0.6]).concat(glowPts.filter((_, i) => i % 3 === 0).map((p) => [p[0], 0.7, p[2], 0.42]));
  const crowdSave = new Map();
  const glow = world.ambient?.group?.children?.find((o) => o.isPoints) || null;

  let hairSave = null;
  function costume(enable) {
    const hair = kit.materials.crowd?.userData.hair;
    if (hair && enable && !hairSave) { hairSave = hair.map((c) => c.clone()); const hsl = {}; for (const c of hair) { c.getHSL(hsl); c.setHSL(hsl.h, Math.min(0.75, hsl.s * 1.1 + 0.08), 0.36 + hsl.l * 0.55); } }
    else if (hair && !enable && hairSave) { hair.forEach((c, i) => c.copy(hairSave[i])); hairSave = null; }
    for (const v of Object.values(variants)) {
      v.plot.group.traverse((o) => {
        if (!o.isInstancedMesh || o.material !== kit.materials.crowd || o.parent?.name?.startsWith('season:')) return;
        const a = o.geometry.attributes.aTop;
        if (!a) return;
        if (enable) {
          if (!crowdSave.has(a)) crowdSave.set(a, a.array.slice());
          const c = new THREE.Color();
          for (let i = 0; i < a.count; i++) { c.set(COSTUME[(i * 3 + 1) % COSTUME.length]); a.setXYZ(i, c.r, c.g, c.b); }
          a.needsUpdate = true;
        } else if (crowdSave.has(a)) { a.array.set(crowdSave.get(a)); a.needsUpdate = true; crowdSave.delete(a); }
      });
    }
  }

  function basePiles(show) {
    for (const v of Object.values(variants)) for (const o of v.plot.group.children) {
      if (o.isInstancedMesh && o.material?.userData.uber && !o.place && o !== v.group) o.visible = show;
    }
  }

  function enter() {
    saved = { lampCol: kit.materials.uLampCol.value.clone(), light: rig.palette, night: kit.materials.uNight.value, glow: glow ? glow.material.opacity : 0, glowVis: glow?.visible };
    rig.apply(LIGHT);
    kit.setNight(1.3);
    root.visible = true;
    for (const v of Object.values(variants)) v.group.visible = true;
    costume(true);
    basePiles(false);
    on = true;
  }

  function leave() {
    if (saved?.light) { rig.apply(saved.light); kit.setLight?.(saved.light); }
    if (saved?.lampCol) kit.materials.uLampCol.value.copy(saved.lampCol);
    kit.setNight(saved?.light?.night ?? saved?.night ?? 0);
    if (glow) { glow.material.opacity = saved.glow; glow.visible = saved.glowVis; }
    root.visible = false;
    for (const v of Object.values(variants)) v.group.visible = false;
    costume(false);
    basePiles(true);
    on = false;
  }

  const origPrepare = world.prepare.bind(world);
  world.prepare = function prepare(view) {
    const cam = origPrepare(view);
    const sid = typeof view.id === 'string' && view.id.startsWith('season:') ? view.id.slice(7) : null;
    const want = always || !!sid || (insideHero && view.kind === 'hero');
    if (want && !on) enter();
    else if (!want && on) leave();
    if (!want) return cam;
    usedAt = performance.now();
    if (rig.palette !== LIGHT) { saved.light = rig.palette; rig.apply(LIGHT); }
    kit.setNight(1.3);
    kit.setLight?.(LIGHT);
    kit.materials.uRimCrowd.value.set('#ffc49a').multiplyScalar(0.5);
    kit.materials.uLampCol.value.set('#ffa83c');
    if (glow) { glow.material.opacity = 0.9; glow.visible = true; }
    cam.getWorldDirection(_f);
    {
      const t0 = _f.y < -0.05 ? -cam.position.y / _f.y : 40;
      const cx = cam.position.x + _f.x * Math.min(t0, 300), cz = cam.position.z + _f.z * Math.min(t0, 300);
      const list = _lampMix;
      list.length = 0;
      if (world.ambient?.nearest) for (const e of world.ambient.nearest(cx, cz, 8, _lampList)) list.push(e);
      let j = 0;
      for (const g of lampPts) {
        const d = (g[0] - cx) ** 2 + (g[2] - cz) ** 2;
        if (d >= 900) continue;
        const e = (_lampPool[j++] ||= [0, 0, 0, 0, 0]);
        e[0] = g[0]; e[1] = g[1]; e[2] = g[2]; e[3] = g[3]; e[4] = d;
        list.push(e);
      }
      list.sort(byDist);
      list.length = Math.min(8, list.length);
      kit.setLamps?.(list);
    }
    const t = _f.y < -0.05 ? -cam.position.y / _f.y : 40;
    _look.copy(cam.position).addScaledVector(_f, Math.min(t, 300));
    const dist = cam.position.distanceTo(_look);
    rig.place(_look, view.kind === 'line' ? 22 : Math.min(160, Math.max(30, dist * 0.9)));
    if (view.kind === 'line') { scene.fog.near = dist * 0.9; scene.fog.far = dist + 34; }
    else { scene.fog.near = dist * 0.85; scene.fog.far = dist * 1.9 + 50; }
    // the moon lives far out in the sky: depth-tested, so it only shows where the frame actually has sky
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    _r.crossVectors(_f, _u).normalize();
    const md = cam.far * 0.9, mk = Math.tan(((cam.fov || 40) / 2) * Math.PI / 180) * md;
    moon.position.copy(cam.position).addScaledVector(_f, md).addScaledVector(_u, mk * 0.6).addScaledVector(_r, -mk * cam.aspect * 0.3);
    moon.scale.setScalar(mk * 0.16);
    moon.quaternion.copy(cam.quaternion);
    focus = sid ? variants[sid]?.plot.group.position : _look;
    mist.visible = true;
    return cam;
  };

  const origUpdate = world.update.bind(world);
  world.update = function update(dt, g, shipments, visible, tier) {
    origUpdate(dt, g, shipments, visible, tier);
    const st = (g || game)?.state;
    insideHero = !!st?.seasons?.['hollows-eve']?.inside;
    const t = performance.now() / 1000;
    if (!always && !insideHero && t * 1000 - usedAt > 1000) return;
    for (const v of Object.values(variants)) v.update?.(dt, t, (g || game)?.seasonStats?.(v.id) || null);
    if (focus) {
      for (let i = 0; i < 9; i++) {
        const a = t * (0.55 + (i % 3) * 0.12) + i * 0.7, rr = 3.5 + (i % 4) * 1.2;
        bats.set(i, focus.x + Math.cos(a) * rr, 4.2 + (i % 3) * 0.9 + Math.sin(a * 3) * 0.3, (focus.z ?? 0) - 2 + Math.sin(a) * rr * 0.6, -a, 0.3 + Math.abs(Math.sin(t * 14 + i)) * 0.9, 0.4, 1.5);
      }
      bats.commit();
    }
  };

  return {
    root, variants,
    get on() { return on; },
    set always(v) { always = v; },
    dispose() { world.prepare = origPrepare; world.update = origUpdate; if (on) leave(); scene.remove(root); for (const v of Object.values(variants)) v.plot.group.remove(v.group); mistMat.dispose(); moonMat.dispose(); poolMat.dispose(); },
  };

  // ------------------------------------------------------------------ variants

  function finishInto(v, B, cast = true) { const m = B.finish({ cast }); v.group.add(m); return m; }
  function dyn(v, build, cast = true) { const B = kit.builder(pal); build(B); const m = B.finish({ cast }); m.matrixAutoUpdate = true; v.group.add(m); return m; }
  function seasonPile(v, geo, at, o = {}) { const p = kit.pile({ geo, size: o.size ?? 0.2, max: o.max ?? 8, cols: o.cols ?? 4, layout: o.layout ?? 'pyramid', palette: pal }); p.mesh.position.set(...at); v.group.add(p.mesh); return p; }
  function seasonCrowd(v, n, seed) { const c = kit.crowd({ count: n, seed, scale: 1.22 }); v.group.add(c.mesh); return c; }

  function witchbrew(v) {
    const SX = -0.6, SZ = 0.2;
    const B = kit.builder(pal);
    B.awning('purple', SX, 2.77, SZ + 0.3, 3.55, 1.66, 0, { alt: 'orange', drop: 0.57 });
    B.slab('iron', SX, 2.92, SZ - 0.36, 1.5, 0.46, 0.1, { round: 0.06 });
    B.cone('iron', SX - 0.1, 3.18, SZ - 0.3, 0.32, 0.6, 0, { sides: 7, curve: 1.4 });
    B.cyl('iron', SX - 0.1, 3.16, SZ - 0.3, 0.42, 0.05, 0, { sides: 9 });
    const CX = 1.55, CZ = 1.9;
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; B.cyl('iron', CX + Math.cos(a) * 0.42, 0, CZ + Math.sin(a) * 0.42, 0.05, 0.42, 0, { sides: 5, rz: Math.cos(a) * 0.25, rx: -Math.sin(a) * 0.25 }); }
    B.ball('iron', CX, 0.72, CZ, 0.62, { sy: 0.78, detail: 2, smooth: true });
    B.cyl('iron', CX, 1.1, CZ, 0.56, 0.12, 0, { sides: 13, taper: 1.06 });
    B.cyl('brew', CX, 1.12, CZ, 0.5, 0.06, 0, { sides: 13, taper: 1 });
    for (let i = 0; i < 6; i++) B.ball({ c: '#ff8a3a', g: 2.2 }, CX + Math.cos(i) * 0.25, 0.06, CZ + Math.sin(i) * 0.25, 0.12, { sy: 1.6, detail: 0 });
    for (let i = 0; i < 4; i++) B.slab('wood', CX + Math.cos(i * 1.6) * 0.3, 0.04, CZ + Math.sin(i * 1.6) * 0.3, 0.5, 0.08, 0.08, { round: 0.02, ry: i * 1.6 });
    B.cyl('wood', CX - 0.9, 0, CZ + 0.2, 0.03, 1.5, 0, { sides: 5, rz: 0.3 });
    for (let i = 0; i < 9; i++) B.slab('hay', CX - 1.3 + (i % 3) * 0.04, 0.0, CZ + 0.2 + (i - 4) * 0.03, 0.04, 0.45, 0.04, { rz: 0.1 + (i - 4) * 0.06, round: 0.01 });
    for (let i = 0; i < 4; i++) bottle(B, SX - 1.1 + i * 0.22, 1.12, SZ + 0.2, i % 2 ? 'bottle' : { c: '#b07ae0', r: 0.15, g: 0.6 });
    web(B, SX - 1.45, 2.3, SZ + 1.1);
    pumpkin(B, SX - 1.9, SZ + 1.5, 0.36, 0.3);
    pumpkin(B, SX + 1.75, SZ + 1.05, 0.28, -0.4);
    finishInto(v, B);
    const ladle = dyn(v, (d) => { d.cyl('wood', 0, 0, 0, 0.03, 1.2, 0, { sides: 5 }); d.ball('iron', 0, 0, 0, 0.09, { detail: 0 }); });
    ladle.position.set(CX, 0.95, CZ);
    const bub = new THREE.InstancedMesh((() => { const bb = kit.builder(pal); bb.ball('brew', 0, 0, 0, 1, { detail: 1, smooth: true }); return bb.geometry({ ao: 0 }); })(), kit.materials.uber, 10);
    bub.castShadow = false; bub.frustumCulled = false; v.group.add(bub);
    const bt = kit.builder(pal); bottle(bt, 0, 0, 0, 'bottle');
    const pile = seasonPile(v, bt.geometry({ ao: 0.1 }), [SX + 0.55, 1.1, SZ + 0.42], { size: 0.9, max: 8, cols: 4 });
    const crew = seasonCrowd(v, 1, 3);
    crew.look(0, { top: '#4a2a6a', bot: '#2a2238', skin: 1, hair: 4, style: 1 }).body(0, 1.2, 0.8, 0.95);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    v.update = (dt, t, st) => {
      ladle.rotation.set(0.35 * Math.cos(t * 1.8), 0, 0.35 * Math.sin(t * 1.8));
      for (let i = 0; i < 10; i++) {
        const u = (t * 0.55 + i / 10) % 1, a = i * 2.4;
        p.set(CX + Math.cos(a) * 0.2 * (1 + u), 1.15 + u * 1.6, CZ + Math.sin(a) * 0.2 * (1 + u));
        s.setScalar((0.06 + u * 0.1) * (u > 0.85 ? (1 - u) / 0.15 : 1));
        bub.setMatrixAt(i, m.compose(p, q, s));
      }
      bub.instanceMatrix.needsUpdate = true;
      pile.set(st ? st.stockRatio ?? 0.4 : 0.5);
      crew.set(0, CX + 0.85, 0.02, CZ - 0.25, -1.9, 3, 0, 3.2);
      crew.commit();
    };
  }

  function pumpkinpie(v) {
    const TX = -1.2, TZ = -0.4, top = 2.42;
    const B = kit.builder(pal);
    B.cyl('crust', TX - 0.3, top, TZ, 1.15, 0.22, 0, { sides: 15, taper: 1.08 });
    B.cyl('filling', TX - 0.3, top + 0.2, TZ, 1.08, 0.05, 0, { sides: 15, taper: 1 });
    for (let i = 0; i < 5; i++) { B.slab('crust', TX - 0.3 - 0.8 + i * 0.4, top + 0.24, TZ, 0.12, 0.05, 2.0 - Math.abs(i - 2) * 0.35, { round: 0.03 }); B.slab('crust', TX - 0.3, top + 0.27, TZ - 0.8 + i * 0.4, 2.0 - Math.abs(i - 2) * 0.35, 0.05, 0.12, { round: 0.03 }); }
    for (let i = 0; i < 15; i++) { const a = (i / 15) * Math.PI * 2; B.ball('crust', TX - 0.3 + Math.cos(a) * 1.1, top + 0.22, TZ + Math.sin(a) * 1.1, 0.12, { detail: 0, sy: 0.7 }); }
    B.slab({ c: '#b27aff', g: 1.6 }, TX - 0.3, 1.25, TZ + 1.02, 1.9, 0.8, 0.03, { round: 0.02, noAo: true });
    for (const [x, z, s] of [[TX + 3.4, TZ + 1.4, 0.42], [TX + 3.9, TZ + 0.8, 0.34], [TX + 3.0, TZ + 2.0, 0.3], [TX - 3.3, TZ + 1.6, 0.4], [TX - 3.8, TZ + 2.1, 0.3]]) pumpkin(B, x, z, s, (x * 7) % 1 - 0.5);
    const KX = TX + 2.6, KZ = TZ + 2.4;
    B.slab('wood', KX, 0, KZ, 1.2, 0.8, 0.7, { round: 0.05 });
    B.cyl('bone', KX + 0.35, 0.8, KZ, 0.03, 0.02, 0, { sides: 5 });
    finishInto(v, B);
    const carveGeo = [0, 1, 2].map((k) => { const cb = kit.builder(pal); pumpkin(cb, 0, 0, 0.36, 0, k); return cb.geometry(); });
    const carve = new THREE.Mesh(carveGeo[0], kit.materials.uber);
    carve.position.set(KX - 0.15, 0.8, KZ);
    carve.castShadow = true;
    v.group.add(carve);
    const pb = kit.builder(pal);
    pb.cyl('crust', 0, 0, 0, 0.5, 0.16, 0, { sides: 11, taper: 1.1 });
    pb.cyl('filling', 0, 0.15, 0, 0.47, 0.03, 0, { sides: 11 });
    const pile = seasonPile(v, pb.geometry({ ao: 0.1 }), [TX + 2.6, 0.8, TZ + 2.4], { size: 0.5, max: 6, cols: 3, layout: [[0.3, 0, -0.15, 0], [0.3, 0.09, -0.15, 0.3], [0.3, 0.18, -0.15, 0.6], [-0.15, 0, 0.18, 0], [-0.15, 0.09, 0.18, 0.4], [0.3, 0.27, -0.15, 0.9]] });
    let k = 0;
    v.update = (dt, t, st) => {
      const nk = Math.floor(t / 1.6) % 3;
      if (nk !== k) { k = nk; carve.geometry = carveGeo[k]; }
      pile.set(st ? st.stockRatio ?? 0.4 : 0.5);
    };
  }

  function hauntedcuts(v) {
    const X = -2.9, Z = -1.75;
    const B = kit.builder(pal);
    for (let i = 0; i < 5; i++) B.cyl('wax', -4.2 + i * 0.22, 1.0, -3.6, 0.05, 0.18 + (i % 3) * 0.08, 0, { sides: 5 });
    for (let i = 0; i < 5; i++) B.ball('candle', -4.2 + i * 0.22, 1.22 + (i % 3) * 0.08, -3.6, 0.035, { sy: 1.6, detail: 0 });
    skull(B, 2.9, 2.6, 0.75, 0.3);
    web(B, -4.5, 2.7, 0.45);
    web(B, 2.4, 2.75, 0.45);
    pumpkin(B, 3.3, 1.2, 0.32, 0.2);
    pumpkin(B, -5.1, 1.0, 0.36, -0.3);
    finishInto(v, B);
    const ghost = dyn(v, (d) => {
      d.ball('ghost', 0, 0.75, 0, 0.38, { sy: 1.25, detail: 2, smooth: true });
      d.cone('ghost', 0, 0.2, 0, 0.4, 0.55, 0, { sides: 9, rx: Math.PI });
      for (let i = 0; i < 5; i++) d.cone('ghost', Math.cos(i * 1.25) * 0.28, 0.0, Math.sin(i * 1.25) * 0.28, 0.1, 0.3, 0, { sides: 5, rx: Math.PI });
      for (const s of [-1, 1]) { d.ball('#2a2238', s * 0.12, 0.92, 0.33, 0.07, { sy: 1.4, detail: 0 }); d.ball('ghost', s * 0.36, 0.55, 0.05, 0.12, { sy: 1.6, detail: 0, rz: s * 0.6 }); }
      d.ball('#2a2238', 0, 0.68, 0.36, 0.06, { sy: 0.7, detail: 0 });
    }, false);
    const hair = new THREE.InstancedMesh((() => { const hb = kit.builder(pal); hb.cone('#ffffff', 0, 0, 0, 0.09, 0.4, 0, { sides: 5, curve: 1.6 }); return hb.geometry({ ao: 0 }); })(), kit.materials.uber, 5);
    hair.castShadow = false; hair.frustumCulled = false; v.group.add(hair);
    const HC = ['#7bea5a', '#b27aff', '#f08a2c', '#5fe0ff'];
    const col = new THREE.Color();
    for (let i = 0; i < 5; i++) hair.setColorAt(i, col.set(HC[i % 4]));
    const scissors = dyn(v, (d) => {
      for (const s of [-1, 1]) {
        d.slab({ c: '#d6dde4', r: 0.2, m: 0.9 }, 0.18, 0, s * 0.02, 0.4, 0.03, 0.05, { round: 0.01, ry: s * 0.0 });
        d.cyl({ c: '#c9483f', r: 0.4 }, -0.1, -0.03, s * 0.06, 0.07, 0.03, 0, { sides: 7, rx: Math.PI / 2 });
      }
    }, false);
    const sb = kit.builder(pal);
    sb.cyl('wax', 0, 0, 0, 0.35, 0.8, 0, { sides: 7, taper: 0.9 });
    sb.ball('candle', 0, 0.95, 0, 0.14, { sy: 1.6, detail: 0 });
    const pile = seasonPile(v, sb.geometry({ ao: 0.1 }), [1.9, 0.0, 1.1], { size: 0.28, max: 8, cols: 4 });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
    let hue = 0;
    v.update = (dt, t, st) => {
      const bob = Math.sin(t * 1.6) * 0.08;
      ghost.position.set(X, 0.55 + bob, Z + 0.05);
      ghost.rotation.set(0, Math.sin(t * 0.7) * 0.3, Math.sin(t * 1.1) * 0.05);
      const snip = Math.abs(Math.sin(t * 7));
      scissors.position.set(X + 0.35 + Math.sin(t * 1.3) * 0.25, 1.95 + bob + Math.sin(t * 2.1) * 0.08, Z + 0.15 + Math.cos(t * 1.3) * 0.2);
      scissors.rotation.set(0, t * 0.6, -0.4 + snip * 0.25);
      hue += dt;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        e.set(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5);
        hair.setMatrixAt(i, m.compose(p.set(X + Math.cos(a) * 0.12, 1.55 + bob, Z + 0.05 + Math.sin(a) * 0.12), q.setFromEuler(e), s.setScalar(1 + Math.sin(t * 3 + i) * 0.1)));
        if (hue > 1.4) hair.setColorAt(i, col.set(HC[(i + Math.floor(t / 1.4)) % 4]));
      }
      if (hue > 1.4) { hue = 0; hair.instanceColor.needsUpdate = true; }
      hair.instanceMatrix.needsUpdate = true;
      pile.set(st ? st.stockRatio ?? 0.4 : 0.5);
    };
  }

  // ------------------------------------------------------------------ props

  function pumpkin(B, x, z, s = 0.35, ry = 0, face = 2) {
    const M = kit.shape.matrix({ pos: [x, 0, z], ry });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      B.ball(i % 2 ? 'shell' : 'shell2', Math.cos(a) * s * 0.32, s * 0.82, Math.sin(a) * s * 0.32, s * 0.72, { parent: M, sy: 0.95, detail: 1, smooth: true });
    }
    B.cyl('stem', 0, s * 1.55, 0, s * 0.09, s * 0.32, 0, { parent: M, sides: 5, rz: 0.3 });
    if (face === 0) return;
    const fz = s * 1.0, y = s * 0.85;
    for (const sx of [-1, 1]) B.cone('glow', sx * s * 0.3, y + s * 0.14, fz, s * 0.19, s * 0.3, 0, { parent: M, sides: 3, rx: -Math.PI / 2 });
    if (face === 2) for (let i = 0; i < 4; i++) B.slab('glow', -s * 0.36 + i * s * 0.24, y - s * 0.32 + (i % 2 ? -0.03 : 0.03) * s * 3, fz - s * 0.04, s * 0.2, s * 0.16, s * 0.08, { parent: M, round: 0.005, noAo: true });
    else B.slab('glow', 0, y - s * 0.22, fz - s * 0.04, s * 0.5, s * 0.06, s * 0.06, { parent: M, round: 0.005, noAo: true });
  }

  function bottle(B, x, y, z, slot) {
    B.cyl(slot, x, y, z, 0.07, 0.16, 0, { sides: 7, taper: 1 });
    B.ball(slot, x, y + 0.17, z, 0.08, { detail: 0 });
    B.cyl(slot, x, y + 0.2, z, 0.03, 0.1, 0, { sides: 5 });
    B.cyl('cork', x, y + 0.29, z, 0.035, 0.05, 0, { sides: 5 });
  }

  function lanterns(B, a, c, n, sag) {
    lights(B, a, c, n * 2, sag, { c: 'string', g: 1.2, r: 0.075 });
    for (let i = 1; i < n; i++) {
      const t = i / n, x = a[0] + (c[0] - a[0]) * t, y = a[1] + (c[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, z = a[2] + (c[2] - a[2]) * t;
      B.cyl('iron', x, y - 0.12, z, 0.012, 0.12, 0, { sides: 3, noAo: true });
      B.ball(i % 2 ? 'lantern' : 'lantern2', x, y - 0.3, z, 0.17, { sy: 1.25, detail: 1 });
      B.cyl('iron', x, y - 0.12, z, 0.07, 0.04, 0, { sides: 5, noAo: true });
      if (i % 2) lanternPts.push([x, y - 0.6, z]);
    }
  }

  function hay(B, x, z) {
    B.slab('hay', x, 0, z, 1.0, 0.55, 0.62, { round: 0.12 });
    for (let i = 0; i < 2; i++) B.slab('#c49a44', x, 0.12 + i * 0.28, z + 0.32, 1.02, 0.04, 0.02, { round: 0.01, noAo: true });
    pumpkin(B, x + 0.1, z, 0.3, 0.2);
  }

  function candles(B, x, z) {
    for (let i = 0; i < 4; i++) {
      const h = 0.2 + (i % 3) * 0.14, cx = x + (i % 2) * 0.22, cz = z + Math.floor(i / 2) * 0.2;
      B.cyl('wax', cx, 0, cz, 0.06, h, 0, { sides: 5 });
      B.ball('candle', cx, h + 0.06, cz, 0.04, { sy: 1.6, detail: 0 });
    }
  }

  function web(B, x, y, z) {
    for (let i = 0; i < 4; i++) B.slab('web', x + 0.2, y - i * 0.05, z, 0.5 - i * 0.08, 0.012, 0.012, { rz: -0.6 + i * 0.4, round: 0.003, noAo: true });
    for (let i = 0; i < 3; i++) B.slab('web', x + 0.15, y - 0.12 - i * 0.08, z, 0.25 + i * 0.05, 0.012, 0.012, { rz: 0.9, round: 0.003, noAo: true });
    B.ball('#2a2238', x + 0.3, y - 0.3, z, 0.05, { detail: 0 });
  }

  function skull(B, x, y, z, s) {
    B.slab('wood', x, y - s * 0.9, z, s * 3, s * 1.8, 0.08, { round: 0.04 });
    B.ball('bone', x, y, z + 0.08, s * 0.5, { detail: 1, smooth: true, sz: 0.6 });
    for (const sx of [-1, 1]) B.ball('#2a2238', x + sx * s * 0.2, y + s * 0.02, z + 0.36 * s, s * 0.12, { detail: 0 });
    for (const sx of [-1, 1]) B.slab('bone', x + sx * s * 0.8, y - s * 0.35, z + 0.06, s * 0.9, s * 0.12, 0.04, { rz: sx * 0.5, round: 0.02 });
  }
}

export default { id: 'hollows-eve', palette: PALETTE, light: LIGHT, lines: LINES, install };
