// ⚰️ Boot Hill Undertakers: a soot-and-plum parlour with coffins standing upright against the front, three vultures on
// the parapet bobbing their heads, a black glass hearse, and Mortimer (stovepipe hat) measuring every passer-by with
// his tape. Stock: coffins lined up like dominoes, which topple in a wave every so often. Takeover (W13): while unowned
// the lot shows the late Mr Grimsby's version with Pomfrey's purple board.
// L1 parlour → L25 a little Boot Hill of crosses + a gravedigger → L100 a bell tower with a gilded coffin weather vane.
import * as THREE from 'three';
import { softPuffs } from '../fx.js?v=20261004h';
import { COLORS, EXTRA_HATS, cardCam, falseFront, porch, win, lantern, blade, signBoard, hats, hatted, particles, tufts, rock, wheel, tone, vignette } from './western.js?v=20261004h';
import { createConstruction, finishPlot } from './construction.js?v=20261004h';

const BX = -2.0, FZ = 0.5, W = 7.4, D = 5.6, H = 3.6, FH = 6.4;
const DOM = { x: 1.7, z: 2.5, n: 9, gap: 0.42 };

export default function buildPlot(kit, { line, palette, rng }) {
  const P = kit.plot({ id: 'undertaker', line, palette, rng, seed: 37, colors: { ...COLORS, plum: '#5a3a5a', plum2: '#4a2e48', coffin: '#6a4a36', coffin2: '#7e5a40', lining: '#c9473a', crape: '#2a2230', vult: '#3a2e34', vultHead: '#d98a7a', lily: '#f6f0e2' } });
  const { b, t1, t2, lot } = P;
  vignette(b, -5.4, 3.7);

  parlour(b, true);
  parlour(lot, false);
  hearse(b, 4.4, -1.2);
  tufts(b, [[-6.2, 3.6], [6.2, 3.8], [-6.0, -2.6]]);
  rock(b, -5.6, 2.8, 0.9);
  tufts(lot, [[-6.2, 3.6], [6.2, 3.8]]);

  // L25: a little Boot Hill of crosses and mounds behind-right, a spade in the dirt
  {
    for (let i = 0; i < 5; i++) {
      const x = 2.6 + (i % 3) * 1.3, z = -3.4 + Math.floor(i / 3) * 1.2 + (i % 2) * 0.2;
      t1.ball('dirtM', x, -0.2, z + 0.2, 0.6, { sx: 0.8, sy: 0.45, sz: 1.3, detail: 1 });
      t1.slab('raw', x, 0, z - 0.45, 0.1, 1.1, 0.08, { round: 0.02, taper: 0, rz: (i - 2) * 0.06 });
      t1.slab('raw', x, 0.7, z - 0.45, 0.6, 0.1, 0.08, { round: 0.02, taper: 0, rz: (i - 2) * 0.06 });
    }
    t1.slab('raw2', 6.0, 0, -1.9, 0.06, 1.1, 0.06, { round: 0.01, taper: 0, rz: 0.2 });
    t1.slab('iron', 6.12, 0, -1.9, 0.3, 0.38, 0.04, { round: 0.06, taper: 0.4, rz: 0.2 });
  }
  // L100: a bell tower with a gilded coffin weather vane
  {
    const tx = BX + W / 2 - 1.0, tz = FZ - 2.4, y = H + 0.7;
    t2.slab('plum2', tx, y, tz, 1.4, 2.6, 1.4, { round: 0.06 });
    for (const s of [-1, 1]) t2.slab('soot', tx + s * 0.71, y + 1.4, tz, 0.04, 0.8, 0.7, { round: 0.02, taper: 0.4 });
    t2.slab('soot', tx, y + 1.4, tz + 0.71, 0.7, 0.8, 0.04, { round: 0.02, taper: 0.4 });
    t2.cone('brass', tx, y + 1.3, tz, 0.35, 0.55, 0, { sides: 9, curve: 0.6, rx: Math.PI, sy: -0.55 });
    t2.cone('tin', tx, y + 2.6, tz, 1.15, 1.5, 0, { sides: 4, curve: 1, ry: Math.PI / 4 });
    t2.cyl('gold', tx, y + 4.0, tz, 0.04, 0.8, 0, { sides: 5, taper: 1 });
    coffinShape(t2, tx, y + 4.6, tz, 0.35, 'gold', 0.04);
  }

  // stock: coffins standing in a domino line; their matrices are animated for the topple wave
  const cof = kit.builder(P.pal);
  coffin3d(cof, 0, 0, 0, 1);
  const pile = P.pile({ at: [DOM.x, 0.02, DOM.z], geo: cof.geometry({ ao: 0.12, aoH: 0.6 }), size: 1, max: DOM.n, layout: Array.from({ length: DOM.n }, (_, i) => [i * DOM.gap, 0, 0, 0]) });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

  // vultures on the parapet: one instanced draw, heads bob out of phase
  const vult = P.instances((d) => {
    d.ball('vult', 0, 0.35, 0, 0.32, { sx: 0.9, sy: 1.2, sz: 0.8, detail: 1, smooth: true });
    for (const k of [-1, 1]) d.slab('vult', k * 0.28, 0.25, -0.05, 0.12, 0.5, 0.4, { round: 0.06, rz: k * 0.25 });
    d.cyl('vultHead', 0, 0.68, 0.1, 0.05, 0.25, 0, { sides: 5, taper: 1, rx: 0.5 });
    d.ball('vultHead', 0, 0.9, 0.24, 0.11, { detail: 1 });
    d.cone('#e8d098', 0, 0.88, 0.35, 0.05, 0.16, 0, { sides: 4, rx: Math.PI / 2 + 0.4 });
    d.ball('#f6f0e2', 0, 0.68, 0.06, 0.12, { sy: 0.6, detail: 0 });
    for (const k of [-1, 1]) d.cyl('#e8d098', k * 0.1, 0, 0.05, 0.03, 0.12, 0, { sides: 4, taper: 1 });
  }, 3, { tier: 0, cast: false, radius: 8 });
  const tape = P.dynamic((d) => d.slab('#f2d16a', 0.5, 0, 0, 1, 0.05, 0.02, { round: 0, taper: 0 }), { tier: 0, cast: false });
  const dust = softPuffs(kit, P, 'dust', 10);

  const SC = 1.08;
  const folk = hatted(P.crowd({ count: 5, seed: 47, scale: SC }), EXTRA_HATS, ['#1e1a22', '#c9b08a', '#6a5a3a', '#8a5a3a', '#3a2c2c'], [0, 1.0, 1.1, 1.0, 0.9]);
  folk.dress(0, 'mortimer').look(0, { hatScale: 0.85 });
  folk.look(1, { top: '#8FA27A', bot: '#5a4632', skin: 2, hair: 2, style: 1 });
  folk.look(2, { top: '#D9A441', bot: '#4a5878', skin: 1, hair: 4, style: 2 });
  folk.look(3, { top: '#6a5a4a', bot: '#3a2c2c', skin: 3, hair: 0, style: 3 }).body(3, 1.15, 0.95, 1.05);
  P.walkers(folk, { ids: [1, 2], paths: [[[-6.5, 4.0], [6.5, 3.9]], [[6.5, 4.4], [-6.5, 4.5]]], loop: 'wrap', speed: 0.85, ownedOnly: false });
  const r = (() => { let a = 17; return () => { a = (a * 16807) % 2147483647; return a / 2147483647; }; })();
  let topple = -1;

  const C = createConstruction(kit, P, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, parapet: 'stepped', stakes: false, ext: { x: 4.0, z: -2.8, w: 3.4, h: 3 } });

  return finishPlot(P, C, {
    w: 13, cardW: 12, d: 9, h: FH + 2,
    acquired: true,
    camera: cardCam([-1.5, 3.0, 2.2], 24, 15, 14, 54),
    pileAnchor: [DOM.x + DOM.gap * 4, 1.0, DOM.z], pileR: 1.6,
    exit: [[0, 3.4], [5, 4.0], [6.6, 4.2]],
    focus: [0, 1],
    anchors: { door: [BX + 0.8, 0.35, FZ + 0.3], doors: [BX + 0.8, 0.35, FZ + 0.3], center: [BX + 1.6, 0.0, FZ + 2.6], coffins: [BX - 2.4, 1.2, FZ + 0.45], vultures: [BX, FH + 0.2, FZ], hearse: [4.4, 1.2, -1.2], dominoes: [DOM.x, 0, DOM.z], mortimer: [BX - 0.4, 0, FZ + 2.2] },
    update(dt, stats, time, tier, ctx) {
      const owned = ctx.owned;
      dust.visible = owned;
      // vultures (they stay on Pomfrey's version too — the town knows)
      for (let i = 0; i < 3; i++) { const bob = Math.max(0, Math.sin(time * 1.3 + i * 2.1)) * 0.25; vult.place(i, BX - 1.4 + i * 1.4, FH + 0.85 + (i === 1 ? 0.55 : 0), FZ - 0.05, Math.sin(time * 0.4 + i) * 0.4, 1, bob, 0); }
      vult.commit();
      if (!owned) { folk.hide(0); folk.hide(3); tape.visible = false; return; }
      // Mortimer measures the nearest passer-by with his tape; a customer waits by the door
      const a = folk.agents ? null : null; void a;
      const mx = BX - 0.4, mz = FZ + 2.0;
      folk.set(0, mx, 0.37, mz, Math.PI / 2 + Math.sin(time * 0.5) * 0.4, 3, 0, 2);
      tape.position.set(mx + 0.3, 1.25, mz + 0.2);
      const reach = 1.2 + Math.sin(time * 1.1) * 0.8;
      tape.scale.set(reach, 1, 1);
      tape.rotation.set(0, Math.sin(time * 0.5) * 0.4 - 0.1, -0.15);
      folk.set(3, BX + 0.8, 0.37, FZ + 1.0, Math.PI, 0, 0.7, 1);
      // the domino topple: every 20 s the line falls in a wave, lies a beat, then springs back up one by one
      const T = 20, u = time % T, k = Math.floor(time / T);
      for (let i = 0; i < DOM.n; i++) {
        const t0 = 2 + i * 0.12, fall = smooth((u - t0) / 0.35), back = smooth((u - 6 - i * 0.15) / 0.3);
        const ang = (fall - back) * (i === DOM.n - 1 ? 1.45 : 1.1);
        _e.set(0, 0, -ang);
        pile.mesh.setMatrixAt(i, _m.compose(_p.set(DOM.x + i * DOM.gap + 0.16, 0.02, DOM.z), _q.setFromEuler(_e), _s));
      }
      pile.mesh.instanceMatrix.needsUpdate = true;
      if (u > 2 + DOM.n * 0.12 && topple !== k) { topple = k; for (let i = 0; i < 8; i++) dust.emit(DOM.x + DOM.gap * DOM.n + 0.6, 0.2, DOM.z + (r() - 0.5), 0.8 * r(), 0.6 + r() * 0.4, (r() - 0.5), 1.0, 0.35, 0.3); }
      dust.step(dt);
    },
  });

  function smooth(x) { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); }

  function parlour(B, own) {
    falseFront(B, { x: BX, fz: FZ, w: W, d: D, h: H, fh: FH, front: 'plum', wall: 'plum2', parapet: 'stepped', door: 0.8, windows: [2.4], winW: 1.2, trim: own ? 'cream' : '#9a8aa0', doorC: 'soot' });
    for (const s of [-1, 1]) B.slab('crape', BX + 0.8 + s * 0.75, 2.3, FZ + 0.22, 0.3, 0.5, 0.04, { round: 0.04, taper: 0.5 });
    B.slab('crape', BX + 0.8, 2.6, FZ + 0.22, 1.8, 0.14, 0.05, { round: 0.03, taper: 0 });
    porch(B, BX - W / 2 - 0.1, BX + W / 2 + 0.1, FZ, 2.5, { awn: false, stepX: BX + 0.8 });
    signBoard(B, BX, H + 0.6, FZ + 0.18, 4.4, 0.95, { board: own ? 'cream' : '#6b3f8f', trim: own ? 'brass' : 'gold' });
    coffinShape(B, BX + 2.6, H + 1.07, FZ + 0.3, 0.3, 'soot', 0.06, true);
    // three coffins upright against the front, one open with a lily-white lining (empty, waiting)
    for (let i = 0; i < 3; i++) {
      const x = BX - 3.1 + i * 0.9;
      coffin3d(B, x, 0.35, FZ + 0.42, 1, i === 1);
    }
    lantern(B, BX + W / 2 - 0.4, 2.2, FZ + 0.45, { glow: 'lanternN' });
    if (own) blade(B, BX + W / 2 - 0.3, 1.7, FZ + 1.7, { board: 'ownTeal' });
    for (let i = 0; i < 3; i++) B.cyl('lily', BX + 2.4 - 0.3 + i * 0.3, 1.1, FZ + 0.25, 0.08, 0.35, 0, { sides: 5, taper: 1.4 });
  }
  function coffinShape(B, x, y, z, s, c, t = 0.06, cross = false) {
    const pts = [[-0.35, 1.0], [0.35, 1.0], [0.5, 0.65], [0.3, -1.0], [-0.3, -1.0], [-0.5, 0.65]];
    const m = new B.shape.Mesh(), col = B.shape.rgb(typeof c === 'string' && c[0] !== '#' ? (B.palette[c].c || B.palette[c]) : c);
    for (let i = 1; i < 5; i++) { m.tri([x + pts[0][0] * s * 2, y + pts[0][1] * s * 2, z], [x + pts[i][0] * s * 2, y + pts[i][1] * s * 2, z], [x + pts[i + 1][0] * s * 2, y + pts[i + 1][1] * s * 2, z], col); }
    B.add(m.geo(), null, { r: 0.6 });
    if (cross) { B.slab('cream', x, y - 0.35 * s * 2, z + 0.02, 0.07, 0.9 * s * 2 * 0.5, 0.02, { round: 0, taper: 0, noAo: true }); B.slab('cream', x, y + 0.05 * s * 2, z + 0.02, 0.4 * s, 0.07, 0.02, { round: 0, taper: 0, noAo: true }); }
    void t;
  }
  // an upright coffin (a stretched hexagon prism), standing on its foot; open = lid leaning beside it
  function coffin3d(B, x, y, z, s, open = false) {
    const pts = [[-0.32, 2.0], [0.32, 2.0], [0.45, 1.45], [0.28, 0], [-0.28, 0], [-0.45, 1.45]].map(([a, h]) => [a * s, h * s]);
    const ring = (dz) => pts.map(([a, h]) => [x + a, y + h, z + dz]);
    const f = ring(0.18), bk = ring(-0.18), m = new B.shape.Mesh();
    const c1 = B.shape.rgb(B.palette.coffin), c2 = B.shape.rgb(B.palette.coffin2), cl = B.shape.rgb(open ? B.palette.lining : B.palette.coffin2);
    for (let i = 1; i < 5; i++) { m.tri(f[0], f[i], f[i + 1], cl); m.tri(bk[0], bk[i + 1], bk[i], c1); }
    for (let i = 0; i < 6; i++) { const j = (i + 1) % 6; m.quad(f[i], bk[i], bk[j], f[j], i % 2 ? c1 : c2); }
    B.add(m.geo(), null, { r: 0.55 });
    if (!open) { B.slab('brass', x, y + 1.25 * s, z + 0.19, 0.08, 0.5 * s, 0.02, { round: 0, taper: 0, noAo: true }); B.slab('brass', x, y + 1.55 * s, z + 0.19, 0.32 * s, 0.08, 0.02, { round: 0, taper: 0, noAo: true }); }
    else B.slab('coffin2', x + 0.55, y, z + 0.25, 0.85, 1.9, 0.08, { round: 0.06, taper: 0.25, rz: -0.18 });
    B.contact(x, z, 0.9, 0.5);
  }
  function hearse(B, x, z) {
    B.slab('soot', x, 0.75, z, 2.8, 0.25, 1.4, { round: 0.06 });
    B.slab('glass', x, 1.0, z, 2.3, 1.2, 1.1, { round: 0.04, taper: 0 });
    B.slab('soot', x, 2.2, z, 2.7, 0.2, 1.4, { round: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { B.cyl('soot', x + sx * 1.2, 1.0, z + sz * 0.6, 0.06, 1.2, 0, { sides: 5, taper: 1 }); B.ball('gold', x + sx * 1.2, 2.5, z + sz * 0.6, 0.1, { detail: 0 }); }
    for (let i = 0; i < 3; i++) B.cone('crape', x - 0.8 + i * 0.8, 2.4, z, 0.14, 0.5, 0, { sides: 5 });
    B.slab('coffin', x, 1.05, z, 1.9, 0.38, 0.55, { round: 0.06 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wheel(B, x + sx * 0.95, 0.5, z + sz * 0.78, 0.5);
    B.slab('raw2', x + 2.0, 0.55, z, 1.6, 0.07, 0.07, { round: 0.02, rz: 0.15 });
    B.contact(x, z, 3.0, 1.8);
  }
}
