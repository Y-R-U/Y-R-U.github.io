import { THREE, mergeGeometries, makeProp, addBox, syncColliders, Builder, roundedBox, lathe, mat, gloss, ease, woodTex, canvasTex, rng, Particles, worldPos, palette } from './util.js';

// Chapter Two props. Ch2-only props start inactive (hidden, colliders off): setActive(true) or world.setChapter(2).

export function activatable(p, active = false) {
  p.state.active = active;
  p.defaultActive = active;
  p.setActive = (on = true) => {
    p.state.active = !!on;
    const ud = p.root.userData;
    if (ud._floorHidden) ud._prevVis = !!on; else p.root.visible = !!on;
    for (const c of p.colliders) c.enabled = !!on && !c._off;
    return p;
  };
  p.setActive(active);
  return p;
}
const wrapReset = (p, fn) => { const r0 = p.reset; p.reset = () => { r0(); fn?.(); p.setActive(p.defaultActive); }; };

const homeOf = p => {
  const home = { pos: null, rotY: 0, parent: null };
  p.place = a => { home.pos = a.pos.clone(); home.rotY = a.rotY || 0; p.root.position.copy(home.pos); p.root.rotation.set(0, home.rotY, 0); home.parent = p.root.parent; };
  p.goHome = () => {
    if (home.parent && p.root.parent !== home.parent) home.parent.add(p.root);
    if (home.pos) { p.root.position.copy(home.pos); p.root.quaternion.identity(); p.root.rotation.set(0, home.rotY, 0); }
    p.root.scale.set(1, 1, 1);
  };
  p.home = home;
  return home;
};

// ---------- Jon's dresser: sock drawer (top) + breakable drawer (bottom) ----------
const DW = 1.2, DD = 0.5, DH = 0.85, DRW = [[0.1, 0.31], [0.35, 0.56], [0.6, 0.81]];

// little cartoon sock: ribbed cuff + leg tube + foot with a contrasting heel/toe
function sockMesh(color, stripe) {
  const c1 = new THREE.Color(color), c2 = new THREE.Color(stripe);
  const paint = (g, fn) => {
    g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { const c = fn(pos.getX(i), pos.getY(i), pos.getZ(i)); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  const leg = paint(new THREE.CapsuleGeometry(0.032, 0.12, 4, 10).translate(0, 0.08, 0), (x, y) => (y > 0.13 || (y > 0.06 && y < 0.08)) ? c2 : c1);
  const foot = paint(new THREE.CapsuleGeometry(0.03, 0.08, 4, 10).rotateX(Math.PI / 2).translate(0, 0.0, 0.05), (x, y, z) => (z > 0.1 || (z < 0.01 && y < 0.0)) ? c2 : c1);
  const g = mergeGeometries([leg, foot]);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, palette().matte);
  m.castShadow = true;
  return m;
}

export function createDresser(ctx) {
  const p = makeProp('dresser', ctx);
  const PAL = palette();
  const top = mat(0xffffff, { map: woodTex('#b5743f', '#7d4825', 'dresserTop'), roughness: 0.5 });
  const b = new Builder();
  // carcass (local +Z = front, the anchor sits on the front face at floor level)
  b.add(roundedBox(DW, DH, DD, 0.02, 2), PAL.gloss, { pos: [0, DH / 2, -DD / 2] }, 0xf0e2c4);
  b.add(roundedBox(DW + 0.04, 0.04, DD + 0.03, 0.012, 2), top, { pos: [0, DH + 0.02, -DD / 2 + 0.015] });
  b.add(roundedBox(DW - 0.04, 0.06, 0.02, 0.01), PAL.gloss, { pos: [0, 0.04, 0.005] }, 0xd9c7a2);
  // dark recesses behind the drawer fronts (seen when a drawer is out)
  for (const [y0, y1] of DRW) b.add(new THREE.BoxGeometry(DW - 0.1, y1 - y0, 0.01), PAL.matte, { pos: [0, (y0 + y1) / 2, 0.002] }, 0x3a2a1e);
  p.root.add(b.build('dresserBody'));

  // the sock drawer is cartoon-deep (it pulls out further than the carcass is deep) so the cat fits in it
  const drawer = (i, { socks = false, d = DD - 0.06 } = {}) => {
    const [y0, y1] = DRW[i], h = y1 - y0, w = DW - 0.08;
    const g = new THREE.Group(); g.position.set(0, y0, 0); p.root.add(g);
    const db = new Builder();
    db.add(roundedBox(w, h, 0.025, 0.01, 2), PAL.gloss, { pos: [0, h / 2, 0.0125] }, 0xf6ead0);
    db.add(roundedBox(w - 0.1, h - 0.07, 0.01, 0.006), PAL.gloss, { pos: [0, h / 2, 0.026] }, 0xfbf1dc);
    for (const dx of [-0.3, 0.3]) db.add(new THREE.SphereGeometry(0.02, 10, 8), PAL.gloss, { pos: [dx, h / 2, 0.045] }, 0xd9a54a);
    // box: floor + sides + back
    db.add(new THREE.BoxGeometry(w - 0.02, 0.012, d), PAL.gloss, { pos: [0, 0.01, -d / 2] }, 0xc9b28a);
    for (const s of [-1, 1]) db.add(new THREE.BoxGeometry(0.012, h - 0.03, d), PAL.gloss, { pos: [s * (w / 2 - 0.016), h / 2 - 0.01, -d / 2] }, 0xd8c4a0);
    db.add(new THREE.BoxGeometry(w - 0.02, h - 0.03, 0.012), PAL.gloss, { pos: [0, h / 2 - 0.01, -d + 0.006] }, 0xd8c4a0);
    const mesh = db.build('drawer' + i);
    g.add(mesh);
    const dr = { group: g, i, out: 0, isOpen: false, h, w, d };
    if (socks) {
      const cols = [[0xd2513e, 0xfff6e0], [0x3f6e9a, 0xe8b54a], [0x5c8a4e, 0xf3ece0], [0xe8b54a, 0x7d4a8a], [0xf3ece0, 0xd2513e], [0x7d4a8a, 0xe4d6b8], [0xd2513e, 0x3f6e9a], [0x4fa0a0, 0xfff1d0], [0xf08a9a, 0xffffff], [0x6b7f4a, 0xd9a440]];
      const r = rng(31);
      dr.socks = cols.map(([a, c], k) => {
        const m = sockMesh(a, c);
        m.position.set(-w / 2 + 0.13 + (k % 5) * 0.21 + r() * 0.05, 0.05 + (k % 2) * 0.03, -0.1 - ((k / 5) | 0) * 0.22 - r() * 0.08);
        m.rotation.set(Math.PI / 2 + (r() - 0.5) * 0.5, 0, r() * 6.28);
        m.userData.home = { pos: m.position.clone(), rot: m.rotation.clone() };
        g.add(m);
        return m;
      });
      dr.showSocks = on => { for (const m of dr.socks) if (m.parent === g) m.visible = on; };
      dr.showSocks(false);
    }
    return dr;
  };
  const sock = drawer(2, { socks: true, d: 0.68 });
  const mid = drawer(1);
  const brk = drawer(0);
  // the drawer floor Garfield stands on while it's open (only the part sticking out of the carcass matters)
  const OUT = 0.64;
  sock.floor = addBox(p, 'sockFloor', sock.group, [-sock.w / 2, -0.03, -sock.d], [sock.w / 2, 0.022, 0], 'surface');
  sock.floor._off = true; sock.floor.enabled = false;

  const slide = (dr, to, dur) => {
    if (dr !== sock) to = Math.min(to, 0.4);
    const from = dr.out;
    return p.anim.tween(dur, e => { dr.out = from + (to - from) * e; dr.group.position.z = dr.out; }, to > from ? ease.outBack : ease.inQuad);
  };
  const api = (dr) => ({
    get isOpen() { return dr.isOpen; },
    group: dr.group,
    async open() {
      if (dr.isOpen || dr.broken) return;
      dr.isOpen = true; p.sfx('creak', { vol: 0.5, rate: 1.4 }); dr.showSocks?.(true);
      if (dr.floor) { dr.floor._off = false; dr.floor.enabled = true; }
      p._dyn = true; await slide(dr, OUT, 0.5); p._dyn = false; syncColliders(p);
    },
    async close() {
      if (!dr.isOpen) return;
      dr.isOpen = false; p._dyn = true;
      await slide(dr, 0, 0.4); p._dyn = false; dr.showSocks?.(false);
      if (dr.floor) { dr.floor._off = true; dr.floor.enabled = false; }
      p.sfx('door', { vol: 0.4, rate: 1.6 }); syncColliders(p);
    },
    toggle() { return dr.isOpen ? this.close() : this.open(); },
    // world point to stand in the open drawer
    standPos(out = new THREE.Vector3()) { out.set(0, 0.03, -0.32); return dr.group.localToWorld(out); },
  });
  p.sockDrawer = api(sock);
  p.sockDrawer.socks = sock.socks;
  // Garfield rolls around in the socks: they jiggle and fling about a bit
  p.sockDrawer.play = (dur = 2) => {
    p.sfx('rip', { vol: 0.25, rate: 1.8 });
    return p.anim.tween(dur, (e, r) => {
      sock.socks.forEach((m, k) => {
        const h = m.userData.home; if (m.parent !== sock.group) return;
        m.position.y = h.pos.y + Math.abs(Math.sin(r * 14 + k * 1.7)) * 0.06;
        m.rotation.z = h.rot.z + Math.sin(r * 9 + k) * 0.8;
      });
    }, ease.linear).then(() => sock.socks.forEach(m => { if (m.parent === sock.group) { m.position.copy(m.userData.home.pos); m.rotation.copy(m.userData.home.rot); } }));
  };
  p.middleDrawer = api(mid);

  // breakable bottom drawer: scratch(n) hits (3 breaks it), break() → front splinters off, spit-ball launcher revealed
  const splinters = new Particles(ctx.scene, { count: 30, geo: new THREE.BoxGeometry(0.008, 0.008, 0.05), material: mat(0xf0e2c4), floorY: (ctx.floorY ?? 0) + 0.003, bounce: 0.3 });
  p.onUpdate(dt => splinters.update(dt));
  const frontMesh = brk.group.children[0];
  p.breakDrawer = {
    get broken() { return !!brk.broken; },
    group: brk.group,
    hits: 0,
    async scratch(n = 1) {
      if (brk.broken) return;
      this.hits += n;
      p.sfx('rip', { vol: 0.5, rate: 1.3 });
      if (this.hits >= 3) return this.break();
      await p.anim.tween(0.25, (e, r) => { brk.group.position.x = Math.sin(r * 40) * 0.008 * (1 - r); brk.group.rotation.z = Math.sin(r * 30) * 0.02 * (1 - r); }, ease.linear);
      brk.group.position.x = 0; brk.group.rotation.z = 0;
    },
    async break() {
      if (brk.broken) return;
      brk.broken = true;
      p.sfx('crash', { vol: 0.8, rate: 1.4 });
      const at = brk.group.localToWorld(new THREE.Vector3(0, brk.h / 2, 0.03));
      for (let k = 0; k < 18; k++) splinters.spawn({ pos: at, vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 1.8, 0).applyQuaternion(p.root.quaternion).add(new THREE.Vector3(0, 0, 0)).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(p.root.quaternion), 1 + Math.random()), life: 1e9, size: 0.7 + Math.random(), flat: true, color: null });
      // drawer lurches out crooked and its front panel drops off
      await p.anim.tween(0.35, e => { brk.group.position.z = 0.28 * e; brk.group.rotation.x = 0.12 * e; brk.group.rotation.y = -0.1 * e; }, ease.outBack);
      frontMesh.visible = false;
      p.launcher?.reveal?.(brk.group);
    },
  };

  p.reset = () => {
    p.anim.clear(); splinters.clear();
    for (const dr of [sock, mid, brk]) { dr.out = 0; dr.isOpen = false; dr.broken = false; dr.group.position.set(0, DRW[dr.i][0], 0); dr.group.rotation.set(0, 0, 0); }
    frontMesh.visible = true; p.breakDrawer.hits = 0;
    sock.floor._off = true; sock.floor.enabled = false;
    for (const m of sock.socks) { if (m.parent !== sock.group) sock.group.add(m); m.position.copy(m.userData.home.pos); m.rotation.copy(m.userData.home.rot); m.scale.setScalar(1); m.visible = false; }
    syncColliders(p);
  };
  return p;
}

// Socks on Odie (L10): take(i) detaches a sock from the drawer and parents it to any Object3D (Odie's ear/tail/mouth).
export function createSocks(ctx, dresser) {
  const p = makeProp('socks', ctx);
  p.items = dresser.sockDrawer.socks;
  p.take = (i, parent, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) => {
    const m = p.items[i % p.items.length];
    if (!parent) return m;
    parent.add(m); m.position.set(...pos); m.rotation.set(...rot); m.scale.setScalar(scale); m.visible = true;
    return m;
  };
  p.reset = () => {}; // the dresser puts them back
  return p;
}

// ---------- spit-ball launcher (straw pea-shooter), hidden in the breakable drawer ----------
export function createLauncher(ctx) {
  const p = makeProp('spitballLauncher', ctx);
  const PAL = palette();
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 12), PAL.gloss, { rot: [0, 0, Math.PI / 2] }, 0xd2513e);
  for (let i = 0; i < 4; i++) b.add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.025, 12), PAL.gloss, { pos: [-0.09 + i * 0.06, 0, 0], rot: [0, 0, Math.PI / 2] }, 0xfff6e0);
  b.add(new THREE.CylinderGeometry(0.02, 0.016, 0.03, 12), PAL.gloss, { pos: [-0.14, 0, 0], rot: [0, 0, Math.PI / 2] }, 0x3f6e9a);
  b.add(new THREE.SphereGeometry(0.018, 10, 8), PAL.matte, { pos: [0.02, 0.01, 0.055] }, 0xf3eee2);
  b.add(new THREE.SphereGeometry(0.016, 10, 8), PAL.matte, { pos: [0.06, 0.01, 0.05] }, 0xf3eee2);
  const body = b.build('launcher'); p.root.add(body);
  const home = homeOf(p);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), PAL.matte); ball.visible = false; ctx.scene.add(ball);
  ball.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ball.geometry.attributes.position.count * 3).fill(0.95), 3));
  p.reveal = parent => { parent.add(p.root); p.root.position.set(0.05, 0.05, -0.12); p.root.rotation.set(0, 0.4, 0); p.setActive(true); };
  // fire(from, to): spit-ball arcs from the straw to a world point (Odie)
  p.fire = async (from, to, { dur = 0.45 } = {}) => {
    from = from || worldPos(p.root, new THREE.Vector3());
    p.sfx('spit', { vol: 0.9, rate: 1.4 });
    ball.visible = true;
    await p.anim.tween(dur, (e, r) => { ball.position.lerpVectors(from, to, r); ball.position.y += Math.sin(r * Math.PI) * 0.18; }, ease.linear);
    p.sfx('pop', { vol: 0.6 });
    await p.anim.tween(0.15, e => ball.scale.setScalar(1 + e * 1.5), ease.outQuad);
    ball.visible = false; ball.scale.setScalar(1);
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); ball.visible = false; p.goHome(); });
  return p;
}

// ---------- bowls ----------
function boneGeo() {
  const parts = [new THREE.CapsuleGeometry(0.008, 0.03, 3, 6).rotateZ(Math.PI / 2)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(new THREE.SphereGeometry(0.009, 6, 5).translate(sx * 0.022, 0, sz * 0.007));
  return parts;
}
const BONE = (() => { let g = null; return () => g || (g = mergeGeometries(boneGeo().map(x => x.index ? x.toNonIndexed() : x).map(x => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal'].includes(k)) x.deleteAttribute(k); return x; }))); })();

function heapOf(geo, material, n, radius, height, seed, hsl = [0.08, 0.5, 0.45]) {
  const heap = new THREE.InstancedMesh(geo, material, n);
  heap.castShadow = false; heap.receiveShadow = true;
  const r = rng(seed), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    const h = 0.01 + height * (1 - (d / radius) ** 2) * (0.5 + r() * 0.5);
    m4.compose(new THREE.Vector3(Math.cos(a) * d, h, Math.sin(a) * d), q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(1, 1, 1).multiplyScalar(0.85 + r() * 0.35));
    heap.setMatrixAt(i, m4);
    heap.setColorAt(i, c.setHSL(hsl[0] + r() * 0.02, hsl[1], hsl[2] + r() * 0.12));
  }
  return heap;
}

export function createOdieBowl(ctx) {
  const p = makeProp('odieBowl', ctx);
  const b = new Builder();
  b.add(lathe([[0, 0], [0.12, 0], [0.135, 0.008], [0.14, 0.04], [0.135, 0.075], [0.126, 0.078]], 36), palette().gloss, null, 0xc8382c);
  b.add(lathe([[0.1405, 0.03], [0.1405, 0.05]], 36), palette().gloss, null, 0xfff1d0);
  b.add(lathe([[0.126, 0.078], [0.118, 0.074], [0.105, 0.022], [0.08, 0.014], [0, 0.014]], 36), palette().gloss, null, 0xf4e6d4);
  // biscuits merged into the bowl mesh (one draw call); eating trims the drawRange from the top of the heap down
  const start = b.marks().get(palette().gloss);
  const N = 46, r = rng(9), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
  const bones = [];
  for (let i = 0; i < N; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.1, h = 0.022 + 0.05 * (1 - (d / 0.1) ** 2) * (0.5 + r() * 0.5);
    bones.push([h, a, d, r() * 3, r() * 3, r() * 3, 0.85 + r() * 0.35, r()]);
  }
  bones.sort((x, y) => x[0] - y[0]);
  const per = BONE().attributes.position.count;
  for (const [h, a, d, rx, ry, rz, sc, k] of bones) {
    m4.compose(new THREE.Vector3(Math.cos(a) * d, h, Math.sin(a) * d), q.setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sc, sc, sc));
    b.add(BONE().clone().applyMatrix4(m4), palette().gloss, null, c.setHSL(0.09 + k * 0.02, 0.45, 0.55 + k * 0.12).getHex());
  }
  const bowlMesh = b.build('dogBowl').children[0];
  p.root.add(bowlMesh.parent);
  p.eaten = t => { p.state.eaten = Math.max(0, Math.min(1, t)); bowlMesh.geometry.setDrawRange(0, start + per * Math.round(N * (1 - p.state.eaten))); };
  p.bitePos = (out = new THREE.Vector3()) => { out.set(0, 0.07, 0); return p.root.localToWorld(out); };
  p.state.eaten = 0;
  addBox(p, 'body', p.root, [-0.14, 0, -0.14], [0.14, 0.08, 0.14], 'surface');
  activatable(p, false);
  wrapReset(p, () => p.eaten(0));
  return p;
}

// Chicken soup (Ch2 L3): splash() throws broth everywhere and leaves splatter decals on the table + floor.
export function createSoupBowl(ctx) {
  const p = makeProp('soupBowl', ctx);
  const PAL = palette();
  const b = new Builder();
  b.add(lathe([[0, 0], [0.05, 0], [0.06, 0.008], [0.095, 0.05], [0.1, 0.07], [0.096, 0.072]], 32), PAL.gloss, null, 0xfffaf0);
  b.add(lathe([[0.096, 0.072], [0.09, 0.068], [0.056, 0.02], [0, 0.018]], 32), PAL.gloss, null, 0xfffaf0);
  b.add(lathe([[0.096, 0.07], [0.1, 0.07]], 32), PAL.gloss, { pos: [0, 0.001, 0] }, 0x3d7cc9);
  b.add(lathe([[0, 0.002], [0.17, 0.0], [0.18, 0.012], [0.172, 0.014], [0, 0.008]], 32), PAL.gloss, { pos: [0, -0.002, 0] }, 0xfffaf0);
  // spoon resting in the bowl
  b.add(new THREE.CylinderGeometry(0.006, 0.005, 0.2, 8), PAL.metal, { pos: [0.07, 0.1, 0.02], rot: [0, 0, -0.95] }, 0xd8d8de);
  b.add(new THREE.SphereGeometry(0.022, 10, 8).scale(1, 0.35, 1.4), PAL.metal, { pos: [0.0, 0.05, 0.02], rot: [0, 0, -0.3] }, 0xd8d8de);
  p.root.add(b.build('soupBowl', { cast: false }));
  const broth = new THREE.MeshPhysicalMaterial({ color: 0xf2c24a, roughness: 0.15, clearcoat: 1, transmission: 0, emissive: 0x3a2400, emissiveIntensity: 0.25 });
  const surf = new THREE.Mesh(new THREE.CircleGeometry(0.083, 28).rotateX(-Math.PI / 2), broth);
  surf.position.y = 0.058; p.root.add(surf);
  // noodles + carrot + chicken bits floating on top
  const bits = new THREE.InstancedMesh(new THREE.SphereGeometry(0.01, 6, 4).scale(1, 0.4, 1), PAL.matte, 22);
  { const r = rng(4), m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < 22; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 0.07; const k = i % 3;
      m4.compose(new THREE.Vector3(Math.cos(a) * d, 0.002, Math.sin(a) * d), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 3, 0)), k === 0 ? new THREE.Vector3(2.4, 1, 0.5) : new THREE.Vector3(1, 1, 1));
      bits.setMatrixAt(i, m4); bits.setColorAt(i, c.set(k === 0 ? 0xfbe7a8 : k === 1 ? 0xf08a2c : 0xf6ecd8)); } }
  surf.add(bits);
  // splatter decals: one instanced mesh of irregular flat blobs
  const blobGeo = new THREE.CircleGeometry(0.06, 14).rotateX(-Math.PI / 2);
  { const pos = blobGeo.attributes.position; for (let i = 1; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), a = Math.atan2(z, x), k = 0.85 + 0.1 * Math.sin(a * 3 + 2) + 0.08 * Math.sin(a * 7) + 0.25 * Math.max(0, Math.sin(a * 2)) ** 6; pos.setX(i, x * k); pos.setZ(i, z * k); } }
  const splatMat = new THREE.MeshPhysicalMaterial({ color: 0xf0b848, roughness: 0.08, clearcoat: 1, transparent: true, opacity: 0.7, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
  const NS = 26;
  const splats = new THREE.InstancedMesh(blobGeo, splatMat, NS); splats.count = 0; splats.frustumCulled = false; splats.renderOrder = 2;
  ctx.scene.add(splats);
  const drops = new Particles(ctx.scene, { count: 40, geo: new THREE.SphereGeometry(0.012, 6, 5), material: splatMat, floorY: (ctx.floorY ?? 0) + 0.004, bounce: 0.1 });
  p.onUpdate(dt => drops.update(dt));
  const home = homeOf(p);
  p.state.level = 1;
  p.eaten = t => { p.state.level = 1 - Math.max(0, Math.min(1, t)); surf.position.y = 0.022 + 0.036 * p.state.level; surf.scale.setScalar(0.7 + 0.3 * p.state.level); surf.visible = p.state.level > 0.02; };
  // around: optional world centre for the floor splatter (default the table under the bowl)
  p.splash = async ({ tableY = 0.765, floorY = ctx.floorY ?? 0, spread = 1 } = {}) => {
    if (p.state.splashed) return;
    p.state.splashed = true;
    p.sfx('pop', { vol: 0.9, rate: 0.6 }); p.sfx('crash', { vol: 0.4, rate: 1.8 });
    const c = worldPos(p.root, new THREE.Vector3());
    const v = new THREE.Vector3();
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, sp = (0.8 + Math.random() * 1.6) * spread;
      drops.spawn({ pos: c.clone().setY(c.y + 0.07), vel: v.set(Math.cos(a) * sp, 1.4 + Math.random() * 1.6, Math.sin(a) * sp).clone(), life: 1.6, size: 0.8 + Math.random() * 0.8 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    let k = 0;
    const put = (x, y, z, sc) => { if (k >= NS) return; m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)), s.set(sc, 1, sc * (0.7 + Math.random() * 0.5))); splats.setMatrixAt(k++, m4); };
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, d = 0.12 + Math.random() * 0.35; put(c.x + Math.cos(a) * d, tableY + 0.003, c.z + Math.sin(a) * d * 0.8, 0.5 + Math.random() * 0.9); }
    for (let i = 0; i < 12; i++) { const a = Math.random() * 6.28, d = 0.6 + Math.random() * 0.9 * spread; put(c.x + Math.cos(a) * d * 1.3, floorY + 0.004, c.z + Math.sin(a) * d, 0.8 + Math.random() * 1.3); }
    splats.instanceMatrix.needsUpdate = true;
    p.eaten(0.85);
    await p.anim.tween(0.5, (e, r) => {
      p.root.rotation.z = Math.sin(r * 25) * 0.12 * (1 - r); p.root.position.y = home.pos ? home.pos.y + Math.sin(r * Math.PI) * 0.06 : p.root.position.y;
      splats.count = Math.min(k, Math.ceil(k * Math.min(1, r * 1.6)));
    }, ease.linear);
    p.root.rotation.z = 0; splats.count = k;
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); drops.clear(); splats.count = 0; p.state.splashed = false; p.goHome(); p.eaten(0); });
  return p;
}

// ---------- TV box (delivery) ----------
export function createTvBox(ctx) {
  const p = makeProp('tvBox', ctx);
  const card = canvasTex('cardboard', 128, 128, (g, w, h) => {
    g.fillStyle = '#c9a271'; g.fillRect(0, 0, w, h);
    const r = rng(3); for (let i = 0; i < 300; i++) { g.fillStyle = r() < 0.5 ? 'rgba(90,60,30,0.08)' : 'rgba(255,240,210,0.08)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = '#3a2a1e'; g.lineWidth = 3; g.strokeRect(36, 44, 56, 40); g.fillStyle = '#3a2a1e'; g.fillRect(44, 52, 40, 26);
    g.fillStyle = '#c8382c'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('THIS SIDE UP', 64, 112);
  });
  const m = mat(0xffffff, { map: card, roughness: 0.9 });
  const W = 0.68, H = 0.58, D = 0.56;
  const b = new Builder();
  b.add(new THREE.BoxGeometry(W, H, D), m, { pos: [0, H / 2, 0] });
  p.root.add(b.build('tvBox'));
  const flaps = [];
  for (const [ax, sx, w, d] of [['x', 1, W, D / 2], ['x', -1, W, D / 2], ['z', 1, W / 2, D], ['z', -1, W / 2, D]]) {
    const hinge = new THREE.Group();
    if (ax === 'x') hinge.position.set(0, H, sx * D / 2); else hinge.position.set(sx * W / 2, H, 0);
    const f = new THREE.Mesh(new THREE.BoxGeometry(ax === 'x' ? w - 0.004 : w, 0.006, ax === 'x' ? d : d - 0.004), m);
    if (ax === 'x') f.position.set(0, 0.004, -sx * d / 2); else f.position.set(-sx * w / 2, 0.004 + (sx > 0 ? 0.004 : 0), 0);
    f.castShadow = true; hinge.add(f); p.root.add(hinge);
    flaps.push({ hinge, ax, sx });
  }
  // a TV-shaped shadow inside for when it's open
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.02).rotateX(-Math.PI / 2), mat(0x2a2018)); inner.position.y = H - 0.08; p.root.add(inner);
  addBox(p, 'body', p.root, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  homeOf(p);
  p.state.open = false;
  p.open = async () => {
    if (p.state.open) return; p.state.open = true; p.sfx('rip', { vol: 0.6, rate: 1.2 });
    await p.anim.tween(0.6, e => { for (const f of flaps) { const a = 2.2 * e; if (f.ax === 'x') f.hinge.rotation.x = f.sx * a; else f.hinge.rotation.z = -f.sx * a; } }, ease.outBack);
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); p.state.open = false; for (const f of flaps) f.hinge.rotation.set(0, 0, 0); p.goHome(); });
  return p;
}

// ---------- carpet (living room rug the old TV sits on): pull({target}) yanks it, the TV arcs onto the target ----------
export function createCarpet(ctx) {
  const p = makeProp('carpet', ctx);
  const L = 1.7, Wd = 0.9;
  const tex = canvasTex('carpetRug', 256, 512, (g, w, h) => {
    g.fillStyle = '#7a2e2a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d9a440'; g.fillRect(14, 14, w - 28, h - 28);
    g.fillStyle = '#2f5a6a'; g.fillRect(26, 26, w - 52, h - 52);
    g.strokeStyle = '#e8d4a8'; g.lineWidth = 6;
    for (let i = 0; i < 4; i++) { const cy = 90 + i * 110; g.beginPath(); g.moveTo(w / 2, cy - 44); g.lineTo(w / 2 + 60, cy); g.lineTo(w / 2, cy + 44); g.lineTo(w / 2 - 60, cy); g.closePath(); g.stroke(); g.fillStyle = '#b8463a'; g.beginPath(); g.arc(w / 2, cy, 14, 0, 7); g.fill(); }
    g.fillStyle = '#e8d4a8'; for (let y = 4; y < h; y += 9) { g.fillRect(0, y, 10, 4); g.fillRect(w - 10, y, 10, 4); }
    const r = rng(12); for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * w, r() * h, 2, 2); }
  });
  const rugMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1 });
  // local: length along X (anchor rotY π/2 → along world -Z/+Z), slight thickness; fringe at both ends
  const g = new THREE.PlaneGeometry(L, Wd, 24, 4).rotateX(-Math.PI / 2);
  g.translate(0, 0.008, 0);
  const rug = new THREE.Mesh(g, rugMat); rug.receiveShadow = true;
  const orig = g.attributes.position.array.slice();
  p.root.add(rug);
  homeOf(p);
  p.load = null; // prop riding on the carpet (index.js sets it to the old TV)
  p.state.pulled = false;
  // rug-local point Garfield grabs (+X end)
  p.edgePos = (out = new THREE.Vector3()) => { out.set(L / 2 + 0.25, 0, 0); return p.root.localToWorld(out); };
  p.pull = async ({ target = null, dur = 0.85, height = 1.0 } = {}) => {
    if (p.state.pulled) return;
    p.state.pulled = true;
    p.sfx('rip', { vol: 0.8, rate: 0.8 }); p.sfx('swipe', { vol: 0.8, rate: 0.7 });
    const load = p.load, lr = load?.root;
    let from, to, rot0;
    if (lr) {
      from = worldPos(lr, new THREE.Vector3());
      to = target ? target.clone() : from.clone().add(new THREE.Vector3(1.4, 0, 0).applyQuaternion(p.root.quaternion));
      ctx.scene.attach(lr); rot0 = lr.rotation.clone(); load._dyn = true;
    }
    // the rug slides 0.7 m toward the puller, rumpling into waves
    const slideTo = 0.7, pa = g.attributes.position;
    const rugAnim = p.anim.tween(0.45, (e, r) => {
      rug.position.x = slideTo * e;
      for (let i = 0; i < pa.count; i++) { const x = orig[i * 3]; pa.array[i * 3 + 1] = orig[i * 3 + 1] + Math.max(0, Math.sin((x + r * 3) * 9)) * 0.05 * Math.sin(r * Math.PI); }
      pa.needsUpdate = true;
    }, ease.outQuad);
    if (lr) {
      const peak = Math.max(from.y, to.y) + height;
      const a = from.y, c = to.y, bq = 2 * peak - (a + c) / 2;
      await p.anim.tween(dur, (e, r) => {
        lr.position.x = from.x + (to.x - from.x) * r; lr.position.z = from.z + (to.z - from.z) * r;
        lr.position.y = (1 - r) * (1 - r) * a + 2 * (1 - r) * r * bq + r * r * c;
        lr.rotation.set(rot0.x - Math.sin(r * Math.PI) * 0.6, rot0.y + r * Math.PI * 2, rot0.z + Math.sin(r * Math.PI * 2) * 0.3);
        syncColliders(load);
      }, ease.linear);
      lr.rotation.copy(rot0);
      p.sfx('crash', { vol: 1, rate: 0.8 }); p.sfx('whack', { vol: 0.8, rate: 0.6 });
      await p.anim.tween(0.35, (e, r) => { const s = 1 + Math.sin(r * Math.PI * 3) * (1 - r) * 0.2; lr.scale.set(s, 1 / s, s); }, ease.linear);
      lr.scale.set(1, 1, 1); load._dyn = false; syncColliders(load);
    }
    await rugAnim;
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); p.state.pulled = false; rug.position.set(0, 0, 0); g.attributes.position.array.set(orig); g.attributes.position.needsUpdate = true; p.goHome(); });
  return p;
}

// ---------- dog biscuit box in the cupboard: burst() spills a heap Odie can eat (eaten(t)) ----------
export function createBiscuitBox(ctx) {
  const p = makeProp('biscuitBox', ctx);
  const tex = canvasTex('biscuitBoxTex', 128, 128, (g, w, h) => {
    g.fillStyle = '#e8b54a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8382c'; g.fillRect(0, 0, w, 30); g.fillRect(0, h - 16, w, 16);
    g.fillStyle = '#fff1d0'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText('WOOF!', w / 2, 23);
    g.fillStyle = '#8a5a2a'; g.fillRect(w / 2 - 30, 62, 60, 14); for (const sx of [-1, 1]) for (const sy of [-1, 1]) { g.beginPath(); g.arc(w / 2 + sx * 30, 69 + sy * 8, 11, 0, 7); g.fill(); }
  });
  const m = mat(0xffffff, { map: tex, roughness: 0.75 });
  const W = 0.32, H = 0.4, D = 0.14;
  const box = new THREE.Mesh(roundedBox(W, H, D, 0.01, 1).translate(0, H / 2, 0), m); box.castShadow = true;
  p.root.add(box);
  const biscuitMat = gloss(0xffffff, { roughness: 0.6, clearcoat: 0.2 });
  const N = 60;
  const heap = heapOf(BONE(), biscuitMat, N, 0.28, 0.07, 21, [0.08, 0.5, 0.5]);
  heap.visible = false; p.root.add(heap); heap.position.set(0, 0, 0.35);
  const fly = new Particles(ctx.scene, { count: 30, geo: BONE(), material: biscuitMat, floorY: (ctx.floorY ?? 0) + 0.008, bounce: 0.35 });
  p.onUpdate(dt => fly.update(dt));
  addBox(p, 'body', p.root, [-W / 2, 0, -D / 2], [W / 2, H, D / 2]);
  homeOf(p);
  p.state.burst = false; p.state.eaten = 0;
  p.burst = async () => {
    if (p.state.burst) return; p.state.burst = true;
    p.sfx('rip', { vol: 0.8 }); p.sfx('crash', { vol: 0.5, rate: 1.5 });
    const at = box.localToWorld(new THREE.Vector3(0, H * 0.7, 0)), fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(p.root.getWorldQuaternion(new THREE.Quaternion()));
    for (let i = 0; i < 26; i++) fly.spawn({ pos: at, vel: fwd.clone().multiplyScalar(0.6 + Math.random() * 1.4).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.6)), life: 1.1, size: 1.2 + Math.random() * 0.5 });
    await p.anim.tween(0.35, (e, r) => { box.rotation.x = -1.35 * e; box.scale.set(1 + Math.sin(r * 9) * 0.06 * (1 - r), 1, 1); }, ease.outBounce);
    heap.visible = true;
    await p.anim.tween(0.4, e => heap.scale.setScalar(0.3 + 0.7 * e), ease.outBack);
  };
  p.eaten = t => { p.state.eaten = Math.max(0, Math.min(1, t)); heap.count = Math.round(N * (1 - p.state.eaten)); };
  p.heapPos = (out = new THREE.Vector3()) => { out.set(0, 0.05, 0.35); return p.root.localToWorld(out); };
  wrapReset(p, () => { p.anim.clear(); fly.clear(); box.rotation.set(0, 0, 0); box.scale.set(1, 1, 1); heap.visible = false; heap.scale.setScalar(1); p.state.burst = false; p.eaten(0); p.goHome(); });
  activatable(p, true);
  return p;
}

// ---------- cheese wedges + mouse holes ----------
export function createCheese(ctx) {
  const p = makeProp('cheese', ctx);
  const spots = ctx.anchors?.get?.('cheeseSpots') || [];
  const cheeseMat = gloss(0xf6c443, { roughness: 0.45, clearcoat: 0.3 });
  const wedge = () => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.12, 0); sh.absarc(0, 0, 0.12, 0, 0.9, false); sh.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 10 });
    g.rotateX(-Math.PI / 2); g.translate(-0.04, 0.008, 0.03);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, cheeseMat); m.castShadow = true;
    // holes
    for (let k = 0; k < 3; k++) { const h = new THREE.Mesh(new THREE.CircleGeometry(0.008 + k * 0.003, 10), mat(0xd9a02a)); const a = 0.15 + k * 0.28; h.position.set(Math.cos(a) * 0.129 - 0.04, 0.03 + (k % 2) * 0.025, -Math.sin(a) * 0.129 + 0.03); h.rotation.y = Math.PI / 2 - a; m.add(h); }
    return m;
  };
  p.wedges = [];
  for (let i = 0; i < Math.max(6, spots.length); i++) { const w = wedge(); w.visible = false; p.root.add(w); p.wedges.push(w); }
  p.place = () => {}; // root stays at origin; wedges are positioned in world space
  // place(i, pos?) → shows wedge i at pos (default cheeseSpots[i]); returns its world position
  p.put = (i, pos) => {
    const w = p.wedges[i % p.wedges.length], at = pos || spots[i % spots.length]?.pos;
    if (!at) return null;
    w.position.copy(at); w.rotation.y = i * 1.7; w.visible = true; w.scale.setScalar(1);
    p.setActive(true); p.sfx('pop', { vol: 0.4 });
    return w.position;
  };
  p.putAll = () => spots.map((_, i) => p.put(i));
  p.remove = i => { const w = p.wedges[i]; if (w) w.visible = false; };
  p.nibble = (i, t) => { const w = p.wedges[i]; if (w) w.scale.setScalar(Math.max(0.05, 1 - t)); };
  Object.defineProperty(p, 'placed', { get: () => p.wedges.filter(w => w.visible).length });
  activatable(p, false);
  wrapReset(p, () => { for (const w of p.wedges) { w.visible = false; w.scale.setScalar(1); } });
  return p;
}

export function createMouseHoles(ctx) {
  const p = makeProp('mouseHoles', ctx);
  const list = ctx.anchors?.get?.('mouseHoles') || [];
  const shape = new THREE.Shape();
  shape.moveTo(-0.075, 0); shape.lineTo(-0.075, 0.06); shape.absarc(0, 0.06, 0.075, Math.PI, 0, true); shape.lineTo(0.075, 0); shape.lineTo(-0.075, 0);
  const hole = new THREE.ShapeGeometry(shape, 12);
  const rimShape = new THREE.Shape();
  rimShape.moveTo(-0.095, 0); rimShape.lineTo(-0.095, 0.06); rimShape.absarc(0, 0.06, 0.095, Math.PI, 0, true); rimShape.lineTo(0.095, 0); rimShape.lineTo(-0.095, 0);
  const rim = new THREE.ShapeGeometry(rimShape, 12);
  const PAL = palette();
  const b = new Builder();
  for (const a of list) {
    const m = new THREE.Matrix4().makeTranslation(a.pos.x, a.pos.y + 0.001, a.pos.z).multiply(new THREE.Matrix4().makeRotationY(a.rotY));
    b.add(rim.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.028)).applyMatrix4(m), PAL.matte, null, 0x6a4a34);
    b.add(hole.clone().applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, 0.031)).applyMatrix4(m), PAL.matte, null, 0x0e0806);
  }
  if (list.length) p.root.add(b.build('mouseHoles', { cast: false }));
  p.place = () => {};
  p.list = list;
  activatable(p, false);
  wrapReset(p);
  return p;
}

// ---------- shedding: fur pile + progressive hair coverage on bed/sofa/armchair/table ----------
function furTex() {
  return canvasTex('furAlpha', 256, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const r = rng(17);
    // each strand gets a random grey level: alphaTest threshold reveals strands progressively
    for (let i = 0; i < 2600; i++) {
      const x = r() * w, y = r() * h, a = r() * Math.PI, l = 5 + r() * 9, v = Math.floor(30 + r() * 225);
      g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1 + r() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 2, y + Math.sin(a) * l * 0.5 - 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  }, { srgb: false, repeat: [2, 2] });
}
const furColor = () => canvasTex('furCol', 64, 64, (g, w, h) => { const r = rng(5); for (let i = 0; i < 400; i++) { g.fillStyle = ['#f08a1c', '#e57a10', '#f6a64a', '#d9690c'][(r() * 4) | 0]; g.fillRect(r() * w, r() * h, 3, 3); } }, { repeat: [2, 2] });

export function createShed(ctx) {
  const p = makeProp('shedDecals', ctx);
  const A = n => ctx.anchors?.get?.(n);
  // name → [anchor, width, depth]
  const defs = { bed: ['shedBed', 1.9, 1.35], sofa: ['shedSofa', 1.75, 0.75], armchair: ['shedArmchair', 0.6, 0.62], table: ['shedTable', 1.42, 0.82] };
  const alias = { jonBed: 'bed', loungeChair: 'armchair', tableTop: 'table', couch: 'sofa' };
  p.spots = {};
  for (const [name, [an, w, d]] of Object.entries(defs)) {
    const a = A(an); if (!a) continue;
    const m = new THREE.MeshStandardMaterial({ map: furColor(), alphaMap: furTex(), alphaTest: 0.999, roughness: 1, color: 0xffffff, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
    const g = new THREE.PlaneGeometry(w, d, 8, 6).rotateX(-Math.PI / 2);
    // soft dome so it hugs cushions
    const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) / (w / 2), z = pos.getZ(i) / (d / 2); pos.setY(i, 0.025 * (1 - x * x) * (1 - z * z)); }
    const mesh = new THREE.Mesh(g, m);
    mesh.position.copy(a.pos); mesh.position.y += 0.01; mesh.rotation.y = a.rotY; mesh.visible = false; mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    mesh.userData.upper = a.pos.y > 2.5;
    p.spots[name] = { mesh, t: 0 };
  }
  p.meshes = Object.values(p.spots).map(s => s.mesh);
  p.place = () => {};
  // set(name, t): 0 = clean .. 1 = covered in orange hair
  p.set = (name, t) => {
    const s = p.spots[alias[name] || name]; if (!s) return;
    s.t = Math.max(0, Math.min(1, t));
    s.mesh.visible = s.t > 0.01 && p.state.active !== false;
    s.mesh.material.alphaTest = 1 - s.t * 0.88;
  };
  p.add = (name, dt) => { const s = p.spots[alias[name] || name]; if (s) p.set(name, s.t + dt); return s ? s.t : 0; };
  p.get = name => p.spots[alias[name] || name]?.t ?? 0;
  p.puff = async (name) => p.anim.tween(0.4, () => {}, ease.linear);
  activatable(p, true);
  const sa = p.setActive; p.setActive = on => { sa(on); for (const s of Object.values(p.spots)) s.mesh.visible = !!on && s.t > 0.01; return p; };
  wrapReset(p, () => { for (const k of Object.keys(p.spots)) p.set(k, 0); });
  return p;
}

export function createFurPile(ctx) {
  const p = makeProp('furPile', ctx);
  // a fluffy heap: lumpy sphere cap with spiky tufts, Garfield-orange
  const g = new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = g.attributes.position, r = rng(8);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = 1 + 0.18 * Math.sin(x * 40 + z * 31) * Math.cos(z * 37) + (y > 0.02 ? (r() - 0.3) * 0.12 : 0);
    pos.setXYZ(i, x * k, y * 0.55 * k, z * k);
  }
  g.computeVertexNormals();
  const furM = new THREE.MeshStandardMaterial({ color: 0xf29a3a, roughness: 1 });
  const heap = new THREE.Mesh(g, furM); heap.castShadow = true; p.root.add(heap);
  const tuft = new THREE.ConeGeometry(0.02, 0.09, 5);
  const tufts = new THREE.InstancedMesh(tuft, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 70);
  { const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(); for (let i = 0; i < 70; i++) { const a = r() * 6.28, el = r() * 1.2; tufts.setColorAt(i, new THREE.Color([0xf6a64a, 0xf08a1c, 0xfbd9a8, 0xe57a10][i % 4])); const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.55 + 0.1, Math.sin(a) * Math.cos(el)).normalize(); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m4.compose(d.clone().multiplyScalar(0.2).multiply(new THREE.Vector3(1, 0.55, 1)), q, new THREE.Vector3(1, 1, 1).multiplyScalar(0.7 + r() * 0.6)); tufts.setMatrixAt(i, m4); } }
  p.root.add(tufts);
  const puffs = new Particles(ctx.scene, { count: 30, geo: new THREE.SphereGeometry(0.02, 6, 4), material: new THREE.MeshStandardMaterial({ color: 0xf6a64a, roughness: 1 }), gravity: -0.6, drag: 2, floorY: ctx.floorY ?? 0 });
  p.onUpdate(dt => puffs.update(dt));
  homeOf(p);
  // drop(pos?) → the heap plops down (Ch2 L8 opening); puff() → hair wisps fly
  p.drop = async (pos) => {
    if (pos) p.root.position.copy(pos);
    p.setActive(true); p.sfx('pop', { vol: 0.6, rate: 0.7 });
    p.puff();
    await p.anim.tween(0.45, (e, rr) => { const s = Math.min(1, e * 1.2); p.root.scale.set(s * (1 + Math.sin(rr * 12) * 0.1 * (1 - rr)), s, s); }, ease.outBack);
    p.root.scale.set(1, 1, 1);
  };
  p.puff = (at) => {
    const c = at || worldPos(p.root, new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0));
    for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; puffs.spawn({ pos: c, vel: new THREE.Vector3(Math.cos(a) * 0.6, 0.5 + Math.random() * 0.8, Math.sin(a) * 0.6), life: 1.4, size: 0.6 + Math.random(), sizeEnd: 0.1, sway: 2 }); }
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); puffs.clear(); p.goHome(); });
  return p;
}

// ---------- small hand props ----------
export function createCoffeeMug(ctx) {
  const p = makeProp('coffeeMug', ctx);
  const PAL = palette();
  const b = new Builder();
  b.add(lathe([[0, 0], [0.04, 0], [0.043, 0.01], [0.043, 0.095], [0.039, 0.097], [0.037, 0.012], [0, 0.012]], 24), PAL.gloss, null, 0x3f6e9a);
  b.add(new THREE.TorusGeometry(0.026, 0.008, 8, 14, Math.PI * 1.2), PAL.gloss, { pos: [0.043, 0.05, 0], rot: [0, 0, -Math.PI * 0.6] }, 0x3f6e9a);
  b.add(new THREE.CircleGeometry(0.037, 20).rotateX(-Math.PI / 2), PAL.gloss, { pos: [0, 0.082, 0] }, 0x4a2a14);
  p.root.add(b.build('mug'));
  const drops = new Particles(ctx.scene, { count: 30, geo: new THREE.SphereGeometry(0.012, 6, 4), material: gloss(0x5a321a, { roughness: 0.1 }), floorY: ctx.floorY ?? 0, bounce: 0.1 });
  p.onUpdate(dt => drops.update(dt));
  homeOf(p);
  // spill(dir) → coffee sloshes out toward dir (world Vector3)
  p.spill = async (dir = new THREE.Vector3(1, 0, 0)) => {
    p.sfx('pop', { vol: 0.7, rate: 0.5 });
    const at = p.root.localToWorld(new THREE.Vector3(0, 0.1, 0)), d = dir.clone().setY(0).normalize();
    for (let i = 0; i < 20; i++) drops.spawn({ pos: at, vel: d.clone().multiplyScalar(1 + Math.random() * 1.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6)), life: 1.3, size: 0.7 + Math.random() * 0.8 });
    await p.anim.tween(0.4, (e, r) => { p.root.rotation.z = Math.sin(r * Math.PI) * 0.9; }, ease.linear);
    p.root.rotation.z = 0;
  };
  activatable(p, false);
  wrapReset(p, () => { p.anim.clear(); drops.clear(); p.goHome(); });
  return p;
}

export function createSuitcase(ctx) {
  const p = makeProp('suitcase', ctx);
  const PAL = palette();
  const leather = mat(0x8a5a32, { roughness: 0.55 });
  const W = 0.62, H = 0.44, D = 0.2;
  const b = new Builder();
  b.add(roundedBox(W, H, D, 0.04, 2), leather, { pos: [0, H / 2 + 0.02, 0] });
  for (const s of [-1, 1]) b.add(roundedBox(0.05, H + 0.01, D + 0.012, 0.012), PAL.gloss, { pos: [s * 0.18, H / 2 + 0.02, 0] }, 0x5a3a20);
  b.add(new THREE.TorusGeometry(0.06, 0.012, 8, 14, Math.PI), PAL.gloss, { pos: [0, H + 0.02, 0] }, 0x3a2414);
  for (const s of [-1, 1]) b.add(roundedBox(0.04, 0.03, 0.03, 0.006), PAL.metal, { pos: [s * 0.1, H + 0.005, D / 2 + 0.005] }, 0xd9a54a);
  b.add(roundedBox(0.12, 0.08, 0.004, 0.003), PAL.matte, { pos: [0.18, H * 0.62, D / 2 + 0.008], rot: [0, 0, 0.1] }, 0xf3eee2);
  p.root.add(b.build('suitcase'));
  // handle socket (where a hand holds it)
  const handle = new THREE.Object3D(); handle.position.set(0, H + 0.08, 0); p.root.add(handle); p.handle = handle;
  addBox(p, 'body', p.root, [-W / 2, 0, -D / 2], [W / 2, H + 0.04, D / 2]);
  homeOf(p);
  activatable(p, false);
  wrapReset(p, () => p.goHome());
  return p;
}

export function createWhistle(ctx) {
  const p = makeProp('whistle', ctx);
  const PAL = palette();
  const b = new Builder();
  b.add(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 16).rotateZ(Math.PI / 2), PAL.metal, { pos: [0, 0.022, 0] }, 0xd8d8e0);
  b.add(roundedBox(0.06, 0.016, 0.02, 0.006), PAL.metal, { pos: [-0.045, 0.034, 0] }, 0xd8d8e0);
  b.add(new THREE.TorusGeometry(0.018, 0.004, 6, 12), PAL.metal, { pos: [0.03, 0.03, 0], rot: [0, Math.PI / 2, 0] }, 0xd9a54a);
  b.add(new THREE.TorusGeometry(0.09, 0.005, 6, 24), PAL.matte, { pos: [0.1, 0.004, 0], rot: [Math.PI / 2, 0, 0] }, 0xd2513e);
  const wb = b.build('whistle'); wb.scale.setScalar(1.8); p.root.add(wb);
  homeOf(p);
  const glint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })); glint.position.set(0, 0.07, 0); p.root.add(glint);
  let t = 0; p.onUpdate(dt => { t += dt; if (p.root.parent === p.home.parent) glint.material.opacity = Math.max(0, Math.sin(t * 3)) ** 8 * 0.6; else glint.material.opacity = 0; });
  // blow() → silent joke: a faint airy puff
  p.blow = () => { p.sfx('wind', { vol: 0.15, rate: 2.2 }); return p.anim.wait(0.8); };
  activatable(p, false);
  wrapReset(p, () => p.goHome());
  return p;
}
