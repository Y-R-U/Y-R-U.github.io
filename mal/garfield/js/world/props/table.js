import { THREE, makeProp, addBox, syncColliders, Builder, roundedBox, lathe, mat, woodTex, canvasTex, ease } from './util.js';

const W = 1.5, D = 0.9, TOP = 0.76;

function clothTex() {
  return canvasTex('gingham', 256, 256, (g, w, h) => {
    g.fillStyle = '#fbf3e4'; g.fillRect(0, 0, w, h);
    const n = 8, s = w / n;
    g.fillStyle = 'rgba(214,92,60,0.55)';
    for (let i = 0; i < n; i += 2) { g.fillRect(i * s, 0, s, h); g.fillRect(0, i * s, w, s); }
    g.fillStyle = 'rgba(190,60,40,0.35)';
    for (let i = 0; i < n; i += 2) for (let j = 0; j < n; j += 2) g.fillRect(i * s, j * s, s, s);
  }, { repeat: [6, 4] });
}

function turnedLeg(h) {
  return lathe([[0, 0], [0.026, 0], [0.03, 0.02], [0.022, 0.06], [0.024, h * 0.45], [0.032, h * 0.5], [0.024, h * 0.55],
    [0.028, h * 0.85], [0.034, h * 0.88], [0.034, h], [0, h]], 14);
}

export function createTable(ctx) {
  const p = makeProp('table', ctx);
  const wood = mat(0xffffff, { map: woodTex('#b5743f', '#7d4825'), roughness: 0.55 });
  const cloth = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: clothTex(), roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color(0xffe6d6), side: THREE.DoubleSide });

  const b = new Builder();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(turnedLeg(TOP - 0.05), wood, { pos: [sx * (W / 2 - 0.08), 0, sz * (D / 2 - 0.08)] });
  // long aprons + top are sliced along X so table.warp() bends the wood, not just the cloth
  b.add(roundedBox(W - 0.14, 0.08, 0.025, 0.008, 3, 24), wood, { pos: [0, TOP - 0.09, D / 2 - 0.08] });
  b.add(roundedBox(W - 0.14, 0.08, 0.025, 0.008, 3, 24), wood, { pos: [0, TOP - 0.09, -D / 2 + 0.08] });
  b.add(roundedBox(0.025, 0.08, D - 0.14, 0.008), wood, { pos: [W / 2 - 0.08, TOP - 0.09, 0] });
  b.add(roundedBox(0.025, 0.08, D - 0.14, 0.008), wood, { pos: [-W / 2 + 0.08, TOP - 0.09, 0] });
  const base = b.build('tableBase');
  p.root.add(base);

  // top + tablecloth move together on bump
  const top = new THREE.Group(); top.name = 'tableTop';
  const tb = new Builder();
  tb.add(roundedBox(W, 0.045, D, 0.015, 2, 30), wood, { pos: [0, TOP - 0.0275, 0] });
  // cloth: flat top + wavy skirt hanging over each edge
  const cw = W - 0.1, cd = D - 0.1;
  tb.add(new THREE.BoxGeometry(cw, 0.004, cd, 30, 1, 1), cloth, { pos: [0, TOP + 0.001, 0] });
  const skirt = (len, drop) => {
    const g = new THREE.PlaneGeometry(len, drop, Math.round(len * 40), 3);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), k = (drop / 2 - y) / drop;
      pos.setZ(i, 0.012 * Math.sin(x * 26) * k + 0.01 * k * k);
      pos.setY(i, y - 0.01 * Math.cos(x * 13) * k);
    }
    g.computeVertexNormals();
    return g;
  };
  const drop = 0.16;
  tb.add(skirt(cw, drop), cloth, { pos: [0, TOP - drop / 2, cd / 2 + 0.005] });
  tb.add(skirt(cw, drop), cloth, { pos: [0, TOP - drop / 2, -cd / 2 - 0.005], rot: [0, Math.PI, 0] });
  tb.add(skirt(cd, drop), cloth, { pos: [cw / 2 + 0.005, TOP - drop / 2, 0], rot: [0, Math.PI / 2, 0] });
  tb.add(skirt(cd, drop), cloth, { pos: [-cw / 2 - 0.005, TOP - drop / 2, 0], rot: [0, -Math.PI / 2, 0] });
  top.add(tb.build('tableTopMesh'));
  p.root.add(top);
  p.top = top;

  const topC = addBox(p, 'top', p.root, [-W / 2, TOP - 0.06, -D / 2], [W / 2, TOP, D / 2], 'surface');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 0.08), z = sz * (D / 2 - 0.08);
    addBox(p, `leg${sx}${sz}`, p.root, [x - 0.035, 0, z - 0.035], [x + 0.035, TOP - 0.06, z + 0.035]);
  }

  p.riders = []; // props on the table that hop when it's bumped (set by index.js)
  p.state.bumps = 0;
  p.bump = async (strength = 1) => {
    p.state.bumps++;
    p.sfx('crash', { vol: 0.4 + 0.3 * strength, rate: 1.2 });
    const s = Math.min(1.5, strength);
    const tilt = (Math.random() - 0.5) * 0.03 * s;
    for (const r of p.riders) r.jolt?.(s);
    await p.anim.tween(0.45, (e, r) => {
      const hop = Math.sin(Math.min(1, r * 2.2) * Math.PI) * 0.045 * s;
      const ring = Math.sin(r * 30) * (1 - r) * 0.006 * s;
      top.position.y = hop + ring;
      top.rotation.z = tilt * Math.sin(r * Math.PI);
      top.rotation.x = ring * 0.4;
    }, x => x);
    top.position.y = 0; top.rotation.set(0, 0, 0);
  };
  // L4 gag: warp(t) 0..1 sags the middle of the table down to the floor (1 = touching), warpTo animates.
  const SAG = TOP - 0.035;
  const prof = x => Math.max(0, 1 - (x / (W / 2 + 0.02)) ** 2) ** 1.3;
  const warpSets = [];
  const grab = (grp, base) => grp.traverse(o => { if (o.isMesh) warpSets.push({ g: o.geometry, orig: o.geometry.attributes.position.array.slice(), base }); });
  grab(top, false); grab(base, true);
  const riderY = new Map();
  p.state.warp = 0;
  p.warp = t => {
    t = Math.max(0, Math.min(1.15, t));
    p.state.warp = t;
    const sag = SAG * t;
    for (const w of warpSets) {
      const a = w.g.attributes.position, o = w.orig;
      for (let i = 0; i < a.count; i++) {
        const x = o[i * 3], y = o[i * 3 + 1];
        const k = w.base ? Math.min(1, Math.max(0, y / (TOP - 0.13))) ** 2 : 1;   // aprons ride with the top; legs bend from the floor up
        a.array[i * 3 + 1] = y - sag * prof(x) * k;
      }
      a.needsUpdate = true;
      if (t === 0) w.g.computeVertexNormals(); else if (!w._n || Math.abs(w._n - t) > 0.08) { w.g.computeVertexNormals(); w._n = t; }
      w.g.computeBoundingSphere();
    }
    const centreTop = TOP - sag;
    topC._lmax.y = Math.max(0.03, centreTop); topC._lmin.y = Math.max(0, centreTop - 0.06);
    for (const r of p.riders) {
      if (!r?.root || r.state?.onFloor || r.state?.flying || r.state?.inFridge) continue;
      const lp = p.root.worldToLocal(r.root.getWorldPosition(new THREE.Vector3()));
      const off = -sag * prof(lp.x), prev = riderY.get(r) || 0;
      r.root.position.y += off - prev; riderY.set(r, off);
    }
    syncColliders(p);
  };
  p.warpTo = (t, dur = 0.7) => {
    const t0 = p.state.warp;
    p.sfx(t > t0 ? 'creak' : 'boing', { vol: 0.8, rate: t > t0 ? 0.7 : 1 });
    return p.anim.tween(dur, e => p.warp(t0 + (t - t0) * e), t > t0 ? ease.inOut : ease.outBounce);
  };
  p.reset = () => { p.anim.clear(); top.position.set(0, 0, 0); top.rotation.set(0, 0, 0); p.state.bumps = 0; if (p.state.warp) { riderY.clear(); p.warp(0); } };
  p.topY = TOP;
  p.size = { w: W, d: D, top: TOP };
  return p;
}

export function createBench(ctx) {
  const p = makeProp('bench', ctx);
  const wood = mat(0xffffff, { map: woodTex('#a96a3a', '#71401f', 'bench'), roughness: 0.6 });
  const L = 1.3, Dd = 0.35, H = 0.45;
  const b = new Builder();
  b.add(roundedBox(L, 0.05, Dd, 0.015, 2), wood, { pos: [0, H - 0.025, 0] });
  for (const sx of [-1, 1]) {
    b.add(roundedBox(0.05, H - 0.05, Dd - 0.06, 0.012, 2), wood, { pos: [sx * (L / 2 - 0.12), (H - 0.05) / 2, 0] });
  }
  b.add(roundedBox(L - 0.3, 0.05, 0.03, 0.01), wood, { pos: [0, 0.12, 0] });
  p.root.add(b.build('bench'));
  addBox(p, 'seat', p.root, [-L / 2, H - 0.05, -Dd / 2], [L / 2, H, Dd / 2], 'surface');
  for (const sx of [-1, 1]) addBox(p, 'leg' + sx, p.root, [sx * (L / 2 - 0.12) - 0.03, 0, -Dd / 2 + 0.03], [sx * (L / 2 - 0.12) + 0.03, H - 0.05, Dd / 2 - 0.03]);
  p.reset = () => {};
  return p;
}

export { syncColliders, ease };
