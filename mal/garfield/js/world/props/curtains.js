import { THREE, makeProp, addBox, canvasTex, rng, Particles, lerp, worldPos, Builder } from './util.js';

const STRIPS = 9, ROWS = 16;

function fabricTex() {
  // warm linen: soft weave, slubby verticals, a stitched hem
  return canvasTex('curtainLinen', 256, 512, (g, w, h) => {
    g.fillStyle = '#e8d0a2'; g.fillRect(0, 0, w, h);
    const r = rng(9);
    for (let x = 0; x < w; x += 2) { g.fillStyle = `rgba(${r() < 0.5 ? '255,248,230' : '190,160,120'},${0.08 + r() * 0.1})`; g.fillRect(x, 0, 1, h); }
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(150,120,85,${0.04 + r() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(170,135,95,0.12)'; g.fillRect(r() * w, r() * h, 1.5, 20 + r() * 60); }
    g.fillStyle = 'rgba(160,120,80,0.25)'; g.fillRect(0, h - 26, w, 3); g.fillRect(0, h - 8, w, 2);
  }, { repeat: [1, 1] });
}

function makePanel(width, height, seed) {
  const sw = width / STRIPS;
  const pos = [], uv = [], idx = [], meta = [];
  for (let s = 0; s < STRIPS; s++) {
    const base = pos.length / 3;
    for (let r = 0; r <= ROWS; r++) for (let c = 0; c <= 1; c++) {
      const u = (s + c) / STRIPS, v = r / ROWS;
      pos.push(u * width - width / 2, -v * height, 0);
      uv.push(u, 1 - v);
      meta.push(s, c, u, v);
    }
    for (let r = 0; r < ROWS; r++) {
      const a = base + r * 2, b2 = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b2, b2, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const r = rng(seed);
  // per strip: the stage at which it tears + how much is left, and a loose-flap phase
  const strips = Array.from({ length: STRIPS }, (_, i) => ({
    tearStage: 1 + Math.floor(r() * 3), keep: [1, 0.78 + r() * 0.12, 0.52 + r() * 0.2, 0.28 + r() * 0.3],
    gap: (r() - 0.5) * 0.04, phase: r() * 6.28, jag: r(), cur: 1, curGap: 0,
  }));
  return { g, meta: new Float32Array(meta), strips, width, height, sw };
}

export function createCurtains(ctx, { width = 2.0, height = 2.3, openingW = 1.2 } = {}) {
  const p = makeProp('curtains', ctx);
  const mat = new THREE.MeshPhysicalMaterial({ map: fabricTex(), roughness: 0.9, sheen: 0.8, sheenColor: new THREE.Color(0xfff2d8), side: THREE.DoubleSide });
  const rodMat = new THREE.MeshStandardMaterial({ color: 0x6b3d1d, roughness: 0.4, metalness: 0.3 });
  const rb = new Builder();
  rb.add(new THREE.CylinderGeometry(0.015, 0.015, width + 0.12, 10), rodMat, { rot: [0, 0, Math.PI / 2] });
  for (const s of [-1, 1]) rb.add(new THREE.SphereGeometry(0.03, 10, 8), rodMat, { pos: [s * (width / 2 + 0.07), 0, 0] });
  p.root.add(rb.build('rod'));

  // both panels live in one geometry (one draw call); each panel owns a vertex range
  const panelW = (width - openingW) / 2 + 0.12;
  const pos = [], uv = [], idx = [], meta = [];
  const panels = [-1, 1].map((side, i) => {
    const pn = makePanel(panelW, height - 0.04, 4 + i * 13);
    const off = pos.length / 3, cx = side * (width / 2 - panelW / 2 + 0.02);
    const pa = pn.g.attributes.position.array, ua = pn.g.attributes.uv.array;
    for (let k = 0; k < pa.length; k += 3) pos.push(pa[k] + cx, pa[k + 1] - 0.02, pa[k + 2] + 0.02);
    uv.push(...ua); meta.push(...pn.meta);
    for (const v of pn.g.index.array) idx.push(v + off);
    Object.assign(pn, { side, off, count: pa.length / 3, cx });
    return pn;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false;
  p.root.add(mesh);
  const BASE = new Float32Array(pos), META = new Float32Array(meta);

  const scrapGeo = new THREE.PlaneGeometry(0.05, 0.12);
  const scraps = new Particles(ctx.scene, { count: 50, geo: scrapGeo, material: mat, gravity: -2.2, drag: 2.5, floorY: (ctx.floorY ?? 0) + 0.004, bounce: 0 });

  Object.assign(p.state, { stage: 0, wind: 0, windTarget: 0 });
  let t = 0, gust = 0;

  const deform = () => {
    const W = p.state.wind, P = geo.attributes.position.array, M = META, B = BASE;
    for (const pn of panels) {
      for (const s of pn.strips) {
        const target = p.state.stage >= s.tearStage ? s.keep[p.state.stage] : 1;
        s.cur = lerp(s.cur, target, 0.2);
        s.curGap = lerp(s.curGap, p.state.stage >= s.tearStage ? s.gap * p.state.stage : 0, 0.2);
      }
      for (let i = pn.off, n = pn.off + pn.count; i < n; i++) {
        const si = M[i * 4], c = M[i * 4 + 1], u = M[i * 4 + 2], v = M[i * 4 + 3];
        const s = pn.strips[si];
        const torn = s.cur < 0.999;
        let vv = Math.min(v, s.cur);
        if (torn && v >= s.cur - 1e-3) vv = s.cur - (c ? s.jag : 1 - s.jag) * 0.04;
        const y = -vv * pn.height - 0.02;
        const fold = Math.sin(u * Math.PI * 7 + pn.side) * 0.035 * (0.6 + 0.4 * vv);
        const loose = torn ? 1.6 : 1;
        const sway = (Math.sin(t * 1.3 + u * 5 + s.phase) * 0.01 + W * (0.18 + 0.12 * Math.sin(t * 3.1 + u * 4 + s.phase) + gust * 0.1)) * vv * vv * loose;
        const swayX = (Math.sin(t * 2.3 + s.phase) * 0.012 * loose + W * 0.06 * Math.sin(t * 2 + vv * 3)) * vv * (torn ? 1 : 0.3);
        P[i * 3] = B[i * 3] + s.curGap + swayX - pn.side * W * 0.08 * vv;
        P[i * 3 + 1] = y + W * 0.05 * vv * vv;
        P[i * 3 + 2] = 0.02 + fold + sway;
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  };

  let accum = 0;
  p.onUpdate(dt => {
    t += dt;
    p.state.wind = lerp(p.state.wind, p.state.windTarget, Math.min(1, dt * 1.5));
    gust = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.7));
    scraps.update(dt);
    // re-deform at ~30 Hz is plenty for cloth; always when windy or tearing
    accum += dt;
    if (accum > 1 / 30) { accum = 0; deform(); }
  });

  // scratch → next stage; stage 0..3
  p.shred = (stage = p.state.stage + 1) => {
    stage = Math.max(0, Math.min(3, stage));
    if (stage <= p.state.stage) { p.state.stage = stage; return; }
    p.state.stage = stage;
    p.sfx('rip', { vol: 0.9 });
    for (const pn of panels) {
      for (let i = 0; i < 5; i++) {
        const at = new THREE.Vector3(pn.cx + (Math.random() - 0.5) * pn.width, -pn.height * (0.4 + Math.random() * 0.5), 0.05);
        p.root.localToWorld(at);
        scraps.spawn({ pos: at, vel: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, 0.4 + Math.random() * 0.4), life: 1e9, size: 0.5 + Math.random() * 0.7, flat: true, spin: new THREE.Vector3(Math.random() * 3, Math.random() * 3, Math.random() * 3) });
      }
    }
  };
  p.wave = (on = true) => { p.state.windTarget = on === true ? 1 : on === false ? 0 : +on; };
  p.reset = () => {
    p.state.stage = 0; p.state.wind = p.state.windTarget = 0; scraps.clear();
    for (const pn of panels) for (const s of pn.strips) { s.cur = 1; s.curGap = 0; }
    deform();
  };
  // world points near each panel's bottom half — what Garfield's claws reach
  p.scratchPoints = () => panels.map(pn => { const v = new THREE.Vector3(pn.cx, -pn.height + 0.35, 0.05); return p.root.localToWorld(v); });
  deform();
  return p;
}
