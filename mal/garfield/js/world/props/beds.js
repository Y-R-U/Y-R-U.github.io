import { THREE, makeProp, addBox, Builder, roundedBox, mat, gloss, woodTex, canvasTex, rng, Particles, ease } from './util.js';

// Patchwork quilt (refs/bedroom): 4x4 patches of warm colours, each with a little motif, stitched seams.
function duvetTex() {
  return canvasTex('quilt', 512, 512, (g, w, h) => {
    const cols = ['#c8463a', '#3f5f8f', '#e0a83a', '#4f8f84', '#f1e3c4', '#d97a8a', '#6f9a48', '#e07a3a', '#8a4a6a', '#5a7ab0'];
    const r = rng(77), n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const c = cols[(x * 3 + y * 5 + (x * y) % 3) % cols.length];
      g.fillStyle = c; g.fillRect(x * s, y * s, s, s);
      const cx = x * s + s / 2, cy = y * s + s / 2, light = c === '#f1e3c4';
      g.fillStyle = light ? 'rgba(160,70,60,0.55)' : 'rgba(255,240,215,0.55)';
      const kind = (x + y * 2) % 4;
      if (kind === 0) for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(x * s + 18 + (i % 3) * 46, y * s + 18 + ((i / 3) | 0) * 46, 7, 0, 7); g.fill(); }
      else if (kind === 1) { g.beginPath(); g.moveTo(cx, cy + 26); g.bezierCurveTo(cx - 44, cy - 6, cx - 18, cy - 40, cx, cy - 14); g.bezierCurveTo(cx + 18, cy - 40, cx + 44, cy - 6, cx, cy + 26); g.fill(); }
      else if (kind === 2) { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.beginPath(); g.ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 14, 8, a, 0, 7); g.fill(); } }
      else { g.lineWidth = 7; g.strokeStyle = g.fillStyle; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x * s + k * s / 4, y * s); g.lineTo(x * s, y * s + k * s / 4); g.stroke(); g.beginPath(); g.moveTo(x * s + s, y * s + k * s / 4); g.lineTo(x * s + k * s / 4, y * s + s); g.stroke(); } }
      for (let i = 0; i < 260; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'; g.fillRect(x * s + r() * s, y * s + r() * s, 3, 3); }
    }
    g.strokeStyle = 'rgba(60,40,30,0.45)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    g.strokeStyle = 'rgba(255,245,225,0.6)'; g.lineWidth = 1.5; g.setLineDash([6, 6]);
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s + 6, 0); g.lineTo(i * s + 6, h); g.stroke(); g.beginPath(); g.moveTo(0, i * s + 6); g.lineTo(w, i * s + 6); g.stroke(); }
  }, { repeat: [1.5, 1.5] });
}
function plaidTex() {
  return canvasTex('plaid', 128, 128, (g, w, h) => {
    g.fillStyle = '#c4452f'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(40,30,30,0.35)'; for (let i = 0; i < w; i += 32) { g.fillRect(i, 0, 10, h); g.fillRect(0, i, w, 10); }
    g.fillStyle = 'rgba(255,220,140,0.5)'; for (let i = 16; i < w; i += 32) { g.fillRect(i, 0, 2, h); g.fillRect(0, i, w, 2); }
  }, { repeat: [2, 2] });
}

// Puffy quilt: subdivided slab, top bulged, edges drooping over the sides.
function quilt(w, l, thick, drop, seg = 18) {
  const g = new THREE.BoxGeometry(w, thick, l, seg, 2, seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = Math.abs(x) / (w / 2), ez = (z + l / 2) / l;
    const puff = (1 - ex * ex) * 0.6 + 0.4;
    if (y > 0) y += thick * 0.8 * puff + 0.006 * Math.sin(x * 22) * Math.sin(z * 18);
    // drape the sides and foot downward
    const dx = Math.max(0, ex - 0.82) / 0.18;
    const dz = Math.max(0, ez - 0.9) / 0.1;
    const d = Math.max(dx, dz);
    y -= drop * d * d;
    x *= 1 + 0.04 * dx; z += 0.04 * dz * l * 0.1;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export function createJonBed(ctx) {
  const p = makeProp('jonBed', ctx);
  const W = 1.5, L = 2.05, MT = 0.55;
  const wood = mat(0xffffff, { map: woodTex('#c08a52', '#8a5a30', 'bed'), roughness: 0.55 });
  const sheet = new THREE.MeshPhysicalMaterial({ color: 0xfaf6ee, roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color(0xffffff) });
  const duvet = new THREE.MeshPhysicalMaterial({ map: duvetTex(), roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0xfff0dc) });
  const b = new Builder();
  b.add(roundedBox(W + 0.06, 0.22, L, 0.03, 2), wood, { pos: [0, 0.2, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(roundedBox(0.07, 0.12, 0.07, 0.015), wood, { pos: [sx * (W / 2 - 0.02), 0.06, sz * (L / 2 - 0.04)] });
  b.add(roundedBox(W + 0.1, 1.05, 0.07, 0.03, 2), wood, { pos: [0, 0.525, -L / 2 - 0.02] });
  b.add(roundedBox(W + 0.1, 0.12, 0.09, 0.04, 2), wood, { pos: [0, 1.06, -L / 2 - 0.02] });
  b.add(roundedBox(W + 0.06, 0.55, 0.06, 0.03, 2), wood, { pos: [0, 0.3, L / 2 + 0.01] });
  b.add(roundedBox(W - 0.02, 0.24, L - 0.04, 0.07, 3), sheet, { pos: [0, 0.43, 0] });
  p.root.add(b.build('bedFrame'));

  const top = new THREE.Group(); p.root.add(top);
  const pillows = [];
  for (const sx of [-0.36, 0.36]) {
    const pg = roundedBox(0.6, 0.16, 0.38, 0.075, 3);
    const pp = pg.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), z = pp.getZ(i); pp.setY(i, pp.getY(i) * (1 - 0.5 * (x * x / 0.09) * (z * z / 0.036))); }
    pg.computeVertexNormals();
    const pm = new THREE.Mesh(pg, sheet); pm.position.set(sx, MT + 0.07, -L / 2 + 0.26); pm.rotation.x = -0.15; pm.castShadow = pm.receiveShadow = true;
    top.add(pm); pillows.push(pm);
  }
  const quiltM = new THREE.Mesh(quilt(W - 0.02, L * 0.66, 0.05, 0.26), duvet);
  quiltM.position.set(0, MT + 0.0, L * 0.15 + 0.02); quiltM.castShadow = quiltM.receiveShadow = true;
  top.add(quiltM);

  // claw rips + stuffing tufts, revealed by stage
  const r = rng(31);
  const ripGeo = new THREE.CapsuleGeometry(0.008, 0.26, 3, 6); ripGeo.rotateX(Math.PI / 2); ripGeo.scale(1, 0.4, 1);
  const rips = new THREE.InstancedMesh(ripGeo, mat(0x4a3038, { roughness: 1 }), 12);
  const tuftGeo = new THREE.IcosahedronGeometry(0.035, 1);
  const tufts = new THREE.InstancedMesh(tuftGeo, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 1, sheen: 1, sheenColor: new THREE.Color(0xffffff) }), 36);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const sets = [[-0.3, 0.1, 0.2], [0.25, 0.45, -0.3], [-0.05, -0.15, 0.6], [0.4, -0.2, 0.1]];
  let ri = 0, ti = 0;
  for (const [cx, cz, ang] of sets) {
    for (let k = -1; k <= 1; k++) {
      const off = new THREE.Vector3(k * 0.06, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang);
      const qx = (cx + off.x) / ((W - 0.02) / 2);
      const pos = new THREE.Vector3(cx + off.x, MT + 0.025 + 0.04 * ((1 - qx * qx) * 0.6 + 0.4) + 0.004, cz + off.z + L * 0.15);
      m4.compose(pos, q.setFromEuler(new THREE.Euler(0, ang, 0)), s.set(1, 1, 1));
      rips.setMatrixAt(ri++, m4);
      for (let t = 0; t < 3; t++) {
        const tp = pos.clone().add(new THREE.Vector3(0, 0.01, (t - 1) * 0.1).applyAxisAngle(new THREE.Vector3(0, 1, 0), ang));
        m4.compose(tp, q.setFromEuler(new THREE.Euler(r(), r(), r())), s.set(1, 0.6, 1).multiplyScalar(0.35 + r() * 0.4));
        tufts.setMatrixAt(ti++, m4);
      }
    }
  }
  rips.count = 0; tufts.count = 0; rips.visible = tufts.visible = false;
  top.add(rips, tufts);

  const featherGeo = new THREE.SphereGeometry(0.025, 6, 4); featherGeo.scale(1, 0.15, 0.45);
  const feathers = new Particles(ctx.scene, { count: 90, geo: featherGeo, material: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), gravity: -0.45, drag: 2.2, floorY: (ctx.floorY ?? 0) + 0.005, bounce: 0 });
  p.onUpdate(dt => feathers.update(dt));

  Object.assign(p.state, { stage: 0 });
  p.shred = (stage = p.state.stage + 1) => {
    stage = Math.max(0, Math.min(3, stage));
    if (stage <= p.state.stage) return;
    p.state.stage = stage;
    p.sfx('rip', { vol: 1 });
    rips.count = Math.min(12, stage * 3 + (stage === 3 ? 3 : 0));
    tufts.count = Math.min(36, rips.count * 3);
    rips.visible = tufts.visible = true;
    const n = stage === 3 ? 40 : 14;
    const floorY = (ctx.floorY ?? 0) + 0.005;
    for (let i = 0; i < n; i++) {
      const at = new THREE.Vector3((Math.random() - 0.5) * W * 0.8, MT + 0.15, (Math.random() - 0.3) * L * 0.6);
      if (stage === 3 && i < 20) at.set(pillows[i % 2].position.x, MT + 0.15, pillows[0].position.z);
      p.root.localToWorld(at);
      const fy = Math.random() < 0.5 ? at.y - 0.2 : floorY;
      feathers.spawn({ pos: at, vel: new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2.2, (Math.random() - 0.5) * 2), life: 1e9, size: 0.7 + Math.random() * 0.8, sway: 3, floorY: Math.max(floorY, fy), flat: true });
    }
    if (stage === 3) {
      p.anim.tween(0.4, e => { pillows[0].scale.set(1 + 0.1 * e, 1 - 0.55 * e, 1); pillows[0].rotation.z = 0.2 * e; quiltM.rotation.y = 0.12 * e; quiltM.position.x = 0.12 * e; }, ease.outBack);
    }
  };
  p.reset = () => {
    p.anim.clear(); p.state.stage = 0; rips.count = 0; tufts.count = 0; rips.visible = tufts.visible = false; feathers.clear();
    pillows[0].scale.set(1, 1, 1); pillows[0].rotation.z = 0; quiltM.rotation.y = 0; quiltM.position.x = 0;
  };
  addBox(p, 'bed', p.root, [-W / 2 - 0.03, 0, -L / 2 - 0.05], [W / 2 + 0.03, MT + 0.05, L / 2 + 0.04]);
  addBox(p, 'head', p.root, [-W / 2 - 0.05, 0, -L / 2 - 0.06], [W / 2 + 0.05, 1.12, -L / 2 + 0.02]);
  p.topY = MT + 0.05;
  return p;
}

export function createGarfieldBed(ctx) {
  const p = makeProp('garfieldBed', ctx);
  const plush = new THREE.MeshPhysicalMaterial({ map: plaidTex(), roughness: 0.9, sheen: 1, sheenColor: new THREE.Color(0xffb090) });
  const cushionM = new THREE.MeshPhysicalMaterial({ color: 0xf3dfb8, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xffffff) });
  const blanketM = new THREE.MeshPhysicalMaterial({ color: 0x5aa0d8, roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0xd8ecff), side: THREE.DoubleSide });
  const R = 0.36;
  const b = new Builder();
  const rim = new THREE.TorusGeometry(R, 0.09, 12, 32); rim.rotateX(Math.PI / 2); rim.scale(1, 1.2, 0.92);
  b.add(rim, plush, { pos: [0, 0.11, 0] });
  b.add(new THREE.CylinderGeometry(R + 0.04, R + 0.06, 0.06, 32), plush, { pos: [0, 0.03, 0], scale: [1, 1, 0.92] });
  const cush = new THREE.SphereGeometry(R - 0.02, 24, 12); cush.scale(1, 0.18, 0.9);
  b.add(cush, cushionM, { pos: [0, 0.075, 0] });
  // blanket: rumpled sheet draped over half the bed and over the rim
  const bl = new THREE.PlaneGeometry(0.46, 0.5, 24, 24); bl.rotateX(-Math.PI / 2);
  const bp = bl.attributes.position;
  const surf = d => {
    const rr = 0.09, cy = 0.11, ry = 0.108;
    if (d < R - rr) return 0.135;
    if (d < R + rr) { const k = (d - R) / rr; return Math.max(0.135 * (d < R ? 1 : 0), cy + ry * Math.sqrt(Math.max(0, 1 - k * k))); }
    return Math.max(0.0, cy - (d - R - rr) * 2.2);
  };
  const off = new THREE.Vector3(0.12, 0, 0.03), rotB = 0.4;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), z = bp.getZ(i);
    const wx = off.x + x * Math.cos(rotB) + z * Math.sin(rotB), wz = off.z - x * Math.sin(rotB) + z * Math.cos(rotB);
    const d = Math.hypot(wx, wz / 0.92);
    const wr = 0.008 * Math.sin(x * 30 + z * 9) * Math.cos(z * 21) + 0.006 * Math.sin(x * 11 - z * 17);
    bp.setY(i, surf(d) + 0.014 + wr);
  }
  bl.computeVertexNormals();
  b.add(bl, blanketM, { pos: [off.x, 0, off.z], rot: [0, rotB, 0] });
  p.root.add(b.build('garfieldBed'));
  p.blanket = p.root.children[0];
  addBox(p, 'bed', p.root, [-R - 0.08, 0, -R - 0.08], [R + 0.08, 0.12, R + 0.08], 'surface');
  p.sleepPos = (out = new THREE.Vector3()) => { out.set(0, 0.1, 0); return p.root.localToWorld(out); };
  p.reset = () => {};
  return p;
}
