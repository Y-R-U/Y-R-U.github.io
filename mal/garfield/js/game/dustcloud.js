import * as THREE from '../../vendor/three/three.module.js';

// D23: the cartoon brawl. A tumbling ball of dust that the fighters vanish into; arms, legs, heads and Odie's tail
// pop out of it, stars and comic words fly off, brawl SFX. The caller hides the real actors while it runs.
//   const cloud = createDustCloud(ctx, { pos, who: ['jon', 'lyman', 'odie'] }); ... await cloud.stop(); (or dispose())
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const any = (a) => a[Math.floor(Math.random() * a.length)];
const UP = V(0, 1, 0);

const C = {
  jonSkin: 0xf2c2a0, jonShirt: 0xa6c8e6, jonPants: 0x7d5634, jonShoe: 0x5a3520, jonHair: 0x6a4127,
  lySkin: 0xedb894, lyShirt: 0xf1e8d4, lyVest: 0xc99a2e, lyPants: 0x3f5238, lyShoe: 0x6a3a1e, lyHair: 0x1b1d26,
  odie: 0xf0d47a, odieCream: 0xfbf0c8, odieEar: 0x1d1714, collar: 0xd8343c, tongue: 0xe46a7c,
  white: 0xfbf8f2, pupil: 0x140c08,
};

export function createDustCloud(ctx, { pos, radius = 0.72, who = ['jon', 'lyman', 'odie'], sfx = true } = {}) {
  const scene = ctx.world.scene;
  const root = new THREE.Group(); root.name = 'dustCloud';
  root.position.copy(pos);
  scene.add(root);
  const mats = new Map();
  const mat = (hex, o = {}) => {
    const k = hex + JSON.stringify(o);
    if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.85, ...o }));
    return mats.get(k);
  };
  const geos = [];
  const geo = (g) => (geos.push(g), g);
  const sphere = geo(new THREE.SphereGeometry(1, 18, 14));
  const cyl = geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  cyl.translate(0, 0.5, 0);
  const torus = geo(new THREE.TorusGeometry(0.065, 0.02, 6, 14));
  const mesh = (g, m, s, p) => { const o = new THREE.Mesh(g, m); if (s) o.scale.set(...s); if (p) o.position.set(...p); return o; };

  // --- the cloud body: overlapping soft puffs that boil and tumble
  const body = new THREE.Group(); root.add(body);
  const puffs = [];
  const N = 30;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const dir = V(Math.cos(a) * r, y * 0.8, Math.sin(a) * r).normalize();
    const shade = i % 4 === 0 ? 0xe4d8c2 : i % 3 === 0 ? 0xfbf6ec : 0xf1e8d8;
    const m = mesh(sphere, mat(shade, { roughness: 1, emissive: shade, emissiveIntensity: 0.22 }));
    const base = radius * rnd(0.34, 0.5);
    m.userData = { dir, base, ph: Math.random() * 6.28, sp: rnd(5, 9), d: radius * rnd(0.5, 0.7) };
    body.add(m); puffs.push(m);
  }
  const core = mesh(sphere, mat(0xeee4d2, { roughness: 1, emissive: 0xeee4d2, emissiveIntensity: 0.22 }), [radius * 0.85, radius * 0.75, radius * 0.85]);
  body.add(core);

  // --- pop-outs: built pointing along +Y from the cloud surface
  const limb = (sleeve, end, len = 0.42, r = 0.07, endS = [0.09, 0.09, 0.09]) => {
    const g = new THREE.Group();
    g.add(mesh(cyl, mat(sleeve), [r, len, r]));
    g.add(mesh(sphere, mat(end), endS, [0, len + endS[1] * 0.6, 0]));
    return g;
  };
  const leg = (pants, shoe, len = 0.5) => {
    const g = new THREE.Group();
    g.add(mesh(cyl, mat(pants), [0.085, len, 0.085]));
    g.add(mesh(sphere, mat(shoe), [0.09, 0.07, 0.16], [0, len + 0.04, 0.06]));
    return g;
  };
  const eyes = (g, y, z, r = 0.045, sp = 0.06) => {
    for (const s of [-1, 1]) {
      g.add(mesh(sphere, mat(C.white, { roughness: 0.4 }), [r, r, r * 0.8], [s * sp, y, z]));
      // dizzy: pupils rolled to different spots
      g.add(mesh(sphere, mat(C.pupil, { roughness: 0.3 }), [r * 0.45, r * 0.45, r * 0.3], [s * sp + s * r * 0.3, y + (s > 0 ? r * 0.35 : -r * 0.3), z + r * 0.7]));
    }
  };
  const head = (skin, hair, { stache = false } = {}) => {
    const g = new THREE.Group();
    g.add(mesh(cyl, mat(skin), [0.055, 0.12, 0.055]));
    const h = new THREE.Group(); h.position.y = 0.26; g.add(h);
    h.add(mesh(sphere, mat(skin), [0.15, 0.17, 0.15]));
    h.add(mesh(sphere, mat(hair), [0.155, 0.11, 0.155], [0, 0.08, -0.02]));
    h.add(mesh(sphere, mat(skin), [0.035, 0.05, 0.035], [0, -0.01, 0.15]));   // nose
    eyes(h, 0.04, 0.12);
    if (stache) h.add(mesh(sphere, mat(hair), [0.08, 0.025, 0.035], [0, -0.06, 0.135]));
    else h.add(mesh(sphere, mat(0x5a1a1c), [0.05, 0.025, 0.02], [0, -0.08, 0.13]));   // yelling mouth
    g.userData.face = h;
    return g;
  };
  const odieHead = () => {
    const g = new THREE.Group();
    g.add(mesh(cyl, mat(C.odie), [0.06, 0.12, 0.06]));
    const collar = mesh(torus, mat(C.collar), null, [0, 0.11, 0]); collar.rotation.x = Math.PI / 2; g.add(collar);
    const h = new THREE.Group(); h.position.y = 0.24; g.add(h);
    h.add(mesh(sphere, mat(C.odie), [0.13, 0.13, 0.13]));
    h.add(mesh(sphere, mat(C.odieCream), [0.075, 0.06, 0.1], [0, -0.04, 0.11]));
    h.add(mesh(sphere, mat(C.pupil, { roughness: 0.3 }), [0.03, 0.024, 0.024], [0, -0.01, 0.205]));
    h.add(mesh(sphere, mat(C.tongue), [0.035, 0.012, 0.06], [0.02, -0.1, 0.15]));
    for (const s of [-1, 1]) h.add(mesh(sphere, mat(C.odieEar), [0.04, 0.13, 0.06], [s * 0.13, -0.03, -0.01]));
    eyes(h, 0.04, 0.09, 0.04, 0.05);
    g.userData.face = h;
    return g;
  };
  const tail = () => {
    const g = new THREE.Group();
    g.add(mesh(cyl, mat(C.odieEar), [0.025, 0.32, 0.025]));
    g.add(mesh(sphere, mat(C.odieEar), [0.035, 0.05, 0.035], [0, 0.33, 0]));
    g.userData.wag = true;
    return g;
  };
  const MAKERS = {
    jon: [() => limb(C.jonShirt, C.jonSkin), () => limb(C.jonShirt, C.jonSkin), () => leg(C.jonPants, C.jonShoe), () => head(C.jonSkin, C.jonHair)],
    lyman: [() => limb(C.lyShirt, C.lySkin), () => leg(C.lyPants, C.lyShoe), () => leg(C.lyPants, C.lyShoe), () => head(C.lySkin, C.lyHair, { stache: true })],
    odie: [() => limb(C.odie, C.odieCream, 0.3, 0.045, [0.06, 0.05, 0.08]), tail, odieHead, tail],
  };
  const kinds = who.filter((w) => MAKERS[w]);
  const popsG = new THREE.Group(); root.add(popsG);
  const pops = [];
  let lastWho = null;
  function spawnPop() {
    let w = any(kinds);
    if (kinds.length > 1 && w === lastWho) w = any(kinds.filter((k) => k !== w));
    lastWho = w;
    const o = any(MAKERS[w])();
    // mostly sideways / upward; heads come out on the camera-ish side often enough to read
    const a = Math.random() * Math.PI * 2, el = rnd(-0.35, 0.9);
    const dir = V(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)).normalize();
    o.quaternion.setFromUnitVectors(UP, dir);
    o.position.copy(dir).multiplyScalar(radius * 0.7);
    o.scale.setScalar(0.001);
    o.userData = { ...o.userData, dir, t: 0, life: rnd(0.45, 0.8), ph: Math.random() * 6, twist: rnd(-1, 1) };
    popsG.add(o); pops.push(o);
  }

  // --- stars + comic words
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.045 : 0.11, a = (i / 10) * Math.PI * 2 + Math.PI / 2; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = geo(new THREE.ExtrudeGeometry(starShape, { depth: 0.02, bevelEnabled: false }));
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd84a, emissive: 0xffb020, emissiveIntensity: 0.6, roughness: 0.5 });
  const stars = [];
  function spawnStar() {
    const s = new THREE.Mesh(starGeo, starMat);
    const a = Math.random() * Math.PI * 2;
    const v = V(Math.cos(a), rnd(0.6, 1.4), Math.sin(a)).multiplyScalar(rnd(1.2, 2.0));
    s.position.copy(v).setLength(radius * 0.7);
    s.userData = { v, t: 0, spin: rnd(6, 12) };
    root.add(s); stars.push(s);
  }
  const WORDS = ['POW!', 'BONK!', 'WHACK!', 'BIFF!', 'OOF!', 'ZONK!'];
  if (who.includes('odie')) WORDS.push('YIP!');
  const texCache = new Map();
  function wordTex(w) {
    if (texCache.has(w)) return texCache.get(w);
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
    const g = cv.getContext('2d');
    g.translate(128, 64); g.rotate(-0.12);
    g.font = '900 64px "Fredoka", "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = '#3b2314'; g.strokeText(w, 0, 4);
    g.fillStyle = '#ffcf3a'; g.fillText(w, 0, 4);
    g.lineWidth = 3; g.strokeStyle = '#e8711a'; g.strokeText(w, 0, 4);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    texCache.set(w, t);
    return t;
  }
  const words = [];
  function spawnWord() {
    const m = new THREE.SpriteMaterial({ map: wordTex(any(WORDS)), transparent: true, depthTest: false });
    const s = new THREE.Sprite(m);
    s.renderOrder = 20;
    const a = Math.random() * Math.PI * 2;
    s.position.set(Math.cos(a) * radius * 0.9, radius * rnd(0.5, 1.1), Math.sin(a) * radius * 0.9);
    s.userData = { t: 0 };
    root.add(s); words.push(s);
  }

  // --- dust kicked up at the base
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xe6d8bd, roughness: 1, transparent: true, opacity: 0.8, depthWrite: false });
  const motes = [];
  function spawnMote() {
    const m = new THREE.Mesh(sphere, puffMat.clone());
    const a = Math.random() * Math.PI * 2;
    m.position.set(root.position.x + Math.cos(a) * radius * 0.7, 0.08, root.position.z + Math.sin(a) * radius * 0.7);
    m.userData = { v: V(Math.cos(a), 0.25, Math.sin(a)).multiplyScalar(rnd(0.4, 0.9)), t: 0, s: rnd(0.08, 0.16) };
    m.scale.setScalar(m.userData.s);
    scene.add(m); motes.push(m);
  }

  const SFX = ['brawl', 'whack', 'hit', 'boing', 'thud', 'whack', 'brawl'];
  let t = 0, popT = 0, starT = 0.2, wordT = 0.35, moteT = 0, sfxT = 0, stopping = false, stopK = 1, stopRes = null, raf = 0, last = performance.now();
  const centre = root.position.clone();
  const baseY = Math.max(radius * 0.9, pos.y);
  root.scale.setScalar(0.01);
  if (sfx) { ctx.audio?.sfx?.('poof'); ctx.audio?.sfx?.('brawl'); }
  ctx.camera?.shake?.(0.08);

  function update(dt) {
    t += dt;
    const grow = Math.min(1, t / 0.25);
    const k = (stopping ? stopK : 1) * (1 + 0.15 * Math.sin(grow * Math.PI)) * grow;
    // bounce + wander + squash
    const b = Math.abs(Math.sin(t * 6.5));
    root.position.set(centre.x + Math.sin(t * 1.7) * 0.14, baseY + b * 0.14, centre.z + Math.cos(t * 1.3) * 0.12);
    root.scale.set(k * (1 + (1 - b) * 0.08), k * (0.92 + b * 0.12), k * (1 + (1 - b) * 0.08));
    body.rotation.x += dt * 2.6; body.rotation.z += dt * 1.9; body.rotation.y += dt * 1.1;
    for (const p of puffs) {
      const u = p.userData, w = 1 + 0.18 * Math.sin(t * u.sp + u.ph);
      p.position.copy(u.dir).multiplyScalar(u.d * (1 + 0.08 * Math.sin(t * u.sp * 0.7 + u.ph)));
      p.scale.setScalar(u.base * w);
    }
    popsG.rotation.y += dt * 2.2;
    if (!stopping) {
      if ((popT -= dt) <= 0) { spawnPop(); popT = rnd(0.12, 0.3); }
      if ((starT -= dt) <= 0) { spawnStar(); starT = rnd(0.15, 0.35); }
      if ((wordT -= dt) <= 0) { spawnWord(); wordT = rnd(0.7, 1.1); }
      if ((moteT -= dt) <= 0) { spawnMote(); moteT = 0.09; }
      if (sfx && (sfxT -= dt) <= 0) {
        const n = any(SFX);
        ctx.audio?.sfx?.(n, { vol: rnd(0.45, 0.8), rate: rnd(0.9, 1.15), pos: root.position });
        if (who.includes('odie') && Math.random() < 0.2) ctx.audio?.sfx?.('yip', { vol: 0.6, pos: root.position });
        sfxT = rnd(0.28, 0.5);
      }
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const o = pops[i], u = o.userData;
      u.t += dt;
      const inK = Math.min(1, u.t / 0.12), outK = Math.max(0, (u.t - u.life) / 0.12);
      const s = (inK < 1 ? 1.25 * Math.sin(inK * Math.PI * 0.6) / Math.sin(Math.PI * 0.6) : 1) * (1 - outK);
      o.scale.setScalar(Math.max(0.001, s * 1.25));
      o.rotateOnAxis(UP, u.twist * dt * 3);
      o.position.copy(u.dir).multiplyScalar(radius * (0.66 + 0.1 * Math.sin(u.t * 30 + u.ph)));
      if (u.wag) o.rotation.z += Math.sin(u.t * 40) * 0.08;
      if (outK >= 1) { popsG.remove(o); pops.splice(i, 1); }
    }
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i], u = s.userData;
      u.t += dt; u.v.y -= 3.5 * dt;
      s.position.addScaledVector(u.v, dt);
      s.rotation.z += u.spin * dt; s.rotation.y += u.spin * 0.5 * dt;
      s.scale.setScalar(Math.max(0.01, 1 - Math.max(0, u.t - 0.45) / 0.3));
      if (u.t > 0.75) { root.remove(s); stars.splice(i, 1); }
    }
    for (let i = words.length - 1; i >= 0; i--) {
      const s = words[i], u = s.userData;
      u.t += dt;
      const pop = u.t < 0.15 ? u.t / 0.15 * 1.2 : 1.2 - Math.min(0.2, (u.t - 0.15) * 2);
      s.scale.set(0.62 * pop, 0.31 * pop, 1);
      s.position.y += dt * 0.25;
      s.material.opacity = 1 - Math.max(0, (u.t - 0.5) / 0.25);
      if (u.t > 0.75) { root.remove(s); s.material.dispose(); words.splice(i, 1); }
    }
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i], u = m.userData;
      u.t += dt;
      m.position.addScaledVector(u.v, dt); u.v.multiplyScalar(Math.exp(-1.5 * dt));
      m.scale.setScalar(u.s * (1 + u.t * 2.2));
      m.material.opacity = 0.8 * Math.max(0, 1 - u.t / 0.9);
      if (u.t > 0.9) { scene.remove(m); m.material.dispose(); motes.splice(i, 1); }
    }
    if (stopping) {
      stopK -= dt / cloud.fade;
      if (stopK <= 0) { finish(); }
    }
  }
  function loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!ctx.paused) update(dt);
    if (!cloud.dead) raf = requestAnimationFrame(loop);
  }
  function finish() {
    if (cloud.dead) return;
    cloud.dead = true;
    cancelAnimationFrame(raf);
    for (const m of motes) { scene.remove(m); m.material.dispose(); }
    for (const s of words) s.material.dispose();
    root.removeFromParent();
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose()); starMat.dispose(); puffMat.dispose();
    texCache.forEach((tx) => tx.dispose());
    stopRes?.();
  }
  const cloud = {
    root, dead: false, fade: 0.45,
    get t() { return t; },
    get pops() { return pops.length; },
    update,
    // ends in a final 'poof' (shrink + scatter); resolves when gone
    stop(fade = 0.45) {
      if (cloud.dead) return Promise.resolve();
      if (stopping) return new Promise((r) => { const p = stopRes; stopRes = () => { p?.(); r(); }; });
      stopping = true; cloud.fade = fade;
      if (sfx) ctx.audio?.sfx?.('poof');
      for (let i = 0; i < 6; i++) spawnStar();
      for (let i = 0; i < 8; i++) spawnMote();
      return new Promise((r) => { stopRes = r; });
    },
    dispose: finish,
  };
  raf = requestAnimationFrame(loop);
  return cloud;
}

// Open floor near `near` for a cloud of radius r: the grid spot (±2 m) overlapping the least low furniture.
export function clearSpot(ctx, near, r = 0.75) {
  const cols = (ctx.world.colliders || []).filter((c) => c.enabled !== false && c.min.y < near.y + 1.2 && c.max.y > near.y + 0.05);
  const overlap = (x, z) => {
    let o = 0;
    for (const c of cols) {
      const dx = Math.max(c.min.x - x, 0, x - c.max.x), dz = Math.max(c.min.z - z, 0, z - c.max.z);
      const d = Math.hypot(dx, dz);
      if (d < r) o += (r - d) * (c.max.y - c.min.y > 1.5 ? 4 : 1);   // walls count extra
    }
    return o;
  };
  let best = near.clone(), bs = Infinity;
  for (let ix = -8; ix <= 8; ix++) for (let iz = -8; iz <= 8; iz++) {
    const x = near.x + ix * 0.25, z = near.z + iz * 0.25;
    const g = ctx.world.groundAt?.(x, z, near.y + 0.3);
    if (g != null && Math.abs(g - near.y) > 0.1) continue;
    const sc = overlap(x, z) * 10 + Math.hypot(x - near.x, z - near.z);
    if (sc < bs) { bs = sc; best = V(x, near.y, z); }
  }
  return best;
}

// The brawl itself: the given actors ({jon, lyman, odie}) vanish into one cloud and reappear when it ends.
// cloud.end(fade) → Promise (poof, actors back); cloud.kill() (instant, actors back).
export function brawlCloud(ctx, spot, actors) {
  const who = Object.keys(actors).filter((k) => actors[k]);
  const hidden = who.map((w) => actors[w]).filter((a) => a?.root?.visible);
  hidden.forEach((a) => (a.root.visible = false));
  const cloud = createDustCloud(ctx, { pos: spot.clone().setY(spot.y + 0.75), who, radius: 0.62 });
  const show = () => hidden.forEach((a) => (a.root.visible = true));
  cloud.end = async (fade) => { await cloud.stop(fade); show(); };
  cloud.kill = () => { cloud.dispose(); show(); };
  return cloud;
}
