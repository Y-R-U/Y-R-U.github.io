// Sci-fi battle (capture) animations — owner: battle-3. "Aegis vs Nova": cyan (white) vs
// magenta (black) light. Built on the battle-2 spectacle layer (battle_util.js: stage() push-in
// + fight spotlight, impact() shockwave/slow-mo/debris, fling(), shards()). Staged for the
// locked Top view on a phone first: everything moves ACROSS the board or up TOWARD the camera.
//  - strafe:  laser strafing run — the attacker lifts off and flies a pass across the victim,
//             twin guns walking side-coloured bolts over the deck and into it (armour panels
//             blown off each hit), then turns and fires one charged shot: the victim explodes.
//  - stomp:   mech jump-jet slam — crouch, jets ignite, launch high toward the camera, slam down
//             beside the victim: EMP dome + shockwave; the victim short-circuits (crackling arcs,
//             flickering light-lines) and collapses into glowing scrap.
//  - orbital: orbital strike — a designator laser paints the victim, a targeting reticle spins
//             down and locks on, a beam slams in from the sky: explosion, a mushroom of light,
//             the victim blasted sky-high and off the board.
//  - tractor: tractor beam — a cone of light lifts the victim, spinning, into a force-field cube
//             that crushes it into a glowing scrap cube; the beam flicks it off the board and the
//             attacker teleports onto the square.
// Weighting (board.pickAnim): Drone/Bastion favour strafe, Strider stomp, Psi Oracle/AI Core
// tractor, Commander orbital; every type can get every battle (generic weight-1 entries).
// Pooled FX objects are created in the FX warm-up (U.definePool), so the theme-load compile builds
// every program; a battle only changes uniforms (colours, opacity, map offsets) and transforms.
import * as U from '../battle_util.js';
import { canvasTexture, bevelBox } from '../kit.js';

const { THREE, PI, sin, cos, min, max, abs, R } = U;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => min(b, max(a, v));
const Z = V3(0, 0, 1);

// ------------------------------------------------------------------ colours
const SIDE = {
  w: { main: '#12c6ff', light: '#8ff0ff', hot: '#e6fcff', deep: '#1a6cff',
       spark: ['#ffffff', '#9af0ff', '#2fd2ff', '#1a8cff'], jet: ['#ffffff', '#c8f8ff', '#5adcff', '#1a8cff'] },
  b: { main: '#ff1a6c', light: '#ff8ab8', hot: '#ffe6f0', deep: '#c0104e',
       spark: ['#ffffff', '#ff8ab8', '#ff2f7e', '#ff9a3a'], jet: ['#ffffff', '#ffd0e2', '#ff5a9a', '#d0105a'] },
};
const side = c => SIDE[c] || SIDE.w;
/** Victim body colours (panels, shards): pearl ceramic + silver + cyan vs gunmetal + steel + magenta. */
const BODY = { w: ['#eef1f5', '#cfd7e1', '#c9d2dd', '#aab5c3', '#12c6ff'], b: ['#4b515d', '#3a3f49', '#a7b0bf', '#2b2f37', '#ff1a6c'] };
const body = c => BODY[c] || BODY.w;
const DECK = ['#aab5c3', '#656d7c', '#3a3f49', '#d3d8df'];
const SMOKE = ['#1c2028', '#2a2f3a', '#3a404c'];
/** Glowing scrap: charred metal + hot orange + the victim's own light colour. */
const scrap = c => ['#1d1c1e', '#2e2b2a', '#46403a', '#ff7a2a', '#ffc04a', side(c).main];
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

// ------------------------------------------------------------------ assets (module-level, lazy)
/** Laser ribbon: crossed planes along +z (-0.5..0.5), bright centre line, bright head, dim tail. */
function ribbon(vertical, alphaProfile) {
  const pos = [], col = [], idx = [];
  const planes = vertical ? [[1, 0], [0, 1]] : [[1, 0]];
  let base = 0;
  for (const [ax, ay] of planes) {
    for (let j = 0; j <= 6; j++) {
      const t = j / 6, z = -0.5 + t, along = 0.12 + 0.88 * t ** 1.4;
      for (let i = 0; i <= 2; i++) {
        const u = -0.5 + i / 2, mid = i === 1 ? 1 : 0;
        pos.push(u * ax, u * ay, z);
        if (alphaProfile) col.push(1, 1, 1, mid * (0.4 + 0.6 * t)); else col.push(mid * along, mid * along, mid * along);
      }
    }
    for (let j = 0; j < 6; j++) for (let i = 0; i < 2; i++) { const a = base + j * 3 + i; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4); }
    base += 21;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, alphaProfile ? 4 : 3));
  g.setIndex(idx);
  return g;
}
const laserAsset = U.once(() => ({ g: ribbon(true, false), m: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide }) }));
const shadeAsset = U.once(() => ({ g: ribbon(false, true), m: new THREE.MeshBasicMaterial({ color: '#04060c', vertexColors: true, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }) }));
const plateAsset = U.once(() => ({ g: bevelBox(0.22, 0.035, 0.17, 0.012, 1), m: new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.35, emissive: '#10141a', emissiveIntensity: 1 }) }));

const reticleTex = U.once(() => canvasTexture(256, 256, (g, w) => {
  const c = w / 2; g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'butt';
  g.lineWidth = 10; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(c, c, w * 0.44, i * PI / 3 + 0.12, (i + 1) * PI / 3 - 0.12); g.stroke(); }
  g.lineWidth = 3; g.beginPath(); g.arc(c, c, w * 0.36, 0, PI * 2); g.stroke();
  for (let i = 0; i < 48; i++) { const a = i * PI / 24, r0 = w * (i % 4 ? 0.385 : 0.37), r1 = w * 0.405; g.lineWidth = i % 4 ? 2 : 4; g.beginPath(); g.moveTo(c + cos(a) * r0, c + sin(a) * r0); g.lineTo(c + cos(a) * r1, c + sin(a) * r1); g.stroke(); }
  for (let i = 0; i < 4; i++) {   // inward triangles + crosshair stubs
    const a = i * PI / 2, ca = cos(a), sa = sin(a), px = -sa, py = ca;
    g.beginPath(); g.moveTo(c + ca * w * 0.3, c + sa * w * 0.3); g.lineTo(c + ca * w * 0.35 + px * 10, c + sa * w * 0.35 + py * 10); g.lineTo(c + ca * w * 0.35 - px * 10, c + sa * w * 0.35 - py * 10); g.fill();
    g.lineWidth = 5; g.beginPath(); g.moveTo(c + ca * w * 0.08, c + sa * w * 0.08); g.lineTo(c + ca * w * 0.24, c + sa * w * 0.24); g.stroke();
  }
}));
const bracketTex = U.once(() => canvasTexture(256, 256, (g, w) => {
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 12; g.lineJoin = 'miter';
  const a = w * 0.08, b = w * 0.3;
  for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = w / 2 + sx * (w / 2 - a), y = w / 2 + sy * (w / 2 - a);
    g.beginPath(); g.moveTo(x - sx * b, y); g.lineTo(x, y); g.lineTo(x, y - sy * b); g.stroke();
  }
  g.beginPath(); g.arc(w / 2, w / 2, 9, 0, PI * 2); g.fill();
  g.lineWidth = 3; g.beginPath(); g.arc(w / 2, w / 2, w * 0.14, 0, PI * 2); g.stroke();
}));
const hexTex = U.once(() => {
  // flat-top hex grid, seamless: tile = 2 columns (3r) x 1 row (sqrt3 r)
  const r = 128 / 3, H = Math.round(Math.sqrt(3) * r);
  return canvasTexture(128, H, (g, w, h) => {
    g.strokeStyle = '#fff'; g.lineWidth = 3;
    for (let col = -1; col <= 3; col++) for (let row = -1; row <= 2; row++) {
      const cx = col * 1.5 * r, cy = row * h + (col % 2 ? h / 2 : 0);
      g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * PI / 3; g[i ? 'lineTo' : 'moveTo'](cx + cos(a) * r, cy + sin(a) * r); } g.stroke();
    }
  }, { repeat: true });
});
const stripeTex = U.once(() => canvasTexture(16, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 4; i++) { gr.addColorStop(i / 4, 'rgba(255,255,255,0.95)'); if (i < 4) gr.addColorStop(i / 4 + 0.06, 'rgba(255,255,255,0.25)'); if (i < 4) gr.addColorStop(i / 4 + 0.2, 'rgba(255,255,255,0.12)'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}, { repeat: true }));
const fieldTex = U.once(() => canvasTexture(128, 128, (g, w) => {
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, w); g.moveTo(0, i * w / 4); g.lineTo(w, i * w / 4); g.stroke(); }
  g.strokeStyle = '#fff'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, w - 10);
  g.fillStyle = '#fff'; for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.fillRect(x * (w - 26), y * (w - 26), 26, 26);
}));
const scrapMap = U.once(() => canvasTexture(128, 128, (g, w) => {
  g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, w, w);
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 9; i++) g.fillRect(R(0, w), R(0, w), R(8, 40), R(6, 30));
  g.strokeStyle = '#2a2e35'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, w - 4);
  g.beginPath(); g.moveTo(0, w * 0.5); g.lineTo(w, w * 0.5); g.moveTo(w * 0.35, 0); g.lineTo(w * 0.35, w * 0.5); g.moveTo(w * 0.7, w * 0.5); g.lineTo(w * 0.7, w); g.stroke();
}));
const scrapGlow = U.once(() => canvasTexture(128, 128, (g, w) => {
  g.fillStyle = '#000'; g.fillRect(0, 0, w, w);
  g.strokeStyle = '#fff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, w * 0.5 + 5); g.lineTo(w, w * 0.5 + 5); g.moveTo(w * 0.35 + 5, 0); g.lineTo(w * 0.35 + 5, w * 0.5); g.stroke();
  g.fillStyle = '#fff'; g.fillRect(w * 0.12, w * 0.68, w * 0.36, 7); g.fillRect(w * 0.78, w * 0.16, 8, 8);
  g.fillStyle = 'rgba(255,140,40,0.9)'; g.fillRect(w * 0.55, w * 0.2, 14, 4);
}));
const gradCyl = (rt, rb, h, seg, fall = 1.4) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 8, true); g.translate(0, h / 2, 0);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = (1 - p.getY(i) / h) ** fall; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
};
const beamAsset = U.once(() => ({ halo: gradCyl(0.62, 0.62, 16, 28, 1.2), core: gradCyl(0.2, 0.2, 16, 16, 0.8),
  mh: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide }), mc: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide }) }));
const mushAsset = U.once(() => {
  const cap = new THREE.IcosahedronGeometry(1, 3); cap.scale(1, 0.5, 1);
  const p = cap.attributes.position, col = new Float32Array(p.count * 3), seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
    if (!seen.has(k)) seen.set(k, R(0.35, 1));
    const v = seen.get(k) * (p.getY(i) < 0 ? 0.45 : 1);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  cap.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const ring = new THREE.TorusGeometry(1, 0.22, 8, 40); ring.rotateX(PI / 2);
  ring.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ring.attributes.position.count * 3).fill(0.75), 3));
  const stem = gradCyl(0.42, 0.6, 1, 20, 0.6);
  return { cap, ring, stem, m: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide }) };
});
const domeAsset = U.once(() => {
  const g = new THREE.SphereGeometry(1, 40, 12, 0, PI * 2, 0, PI / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const v = 0.3 + 0.7 * (1 - p.getY(i)) ** 3; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const t = hexTex(); t.repeat.set(10, 3);
  return { g, m: new THREE.MeshBasicMaterial({ ...ADD, map: t, vertexColors: true, side: THREE.DoubleSide }) };
});
const coneAsset = U.once(() => {
  const g = new THREE.CylinderGeometry(0.62, 0.07, 1, 28, 1, true); g.translate(0, 0.5, 0); g.rotateX(PI / 2);   // apex at origin, opens along +z
  const t = stripeTex(); t.repeat.set(1, 3);
  return { g, m: new THREE.MeshBasicMaterial({ ...ADD, map: t, side: THREE.DoubleSide }) };
});
const fieldAsset = U.once(() => ({ g: new THREE.BoxGeometry(1, 1, 1), m: new THREE.MeshBasicMaterial({ ...ADD, map: fieldTex(), side: THREE.DoubleSide }) }));
const scrapAsset = U.once(() => {
  const g = bevelBox(1, 1, 1, 0.07, 1); g.translate(0, 0.5, 0);
  // bevelBox has no useful UVs on the sides for a panel map: box-project them
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = abs(n.getX(i)), ay = abs(n.getY(i));
    const [u, v] = ax > 0.6 ? [p.getZ(i), p.getY(i)] : ay > 0.6 ? [p.getX(i), p.getZ(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u + 0.5; uv[i * 2 + 1] = v + (ay > 0.6 ? 0.5 : 0);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { g, m: new THREE.MeshStandardMaterial({ map: scrapMap(), emissiveMap: scrapGlow(), emissive: '#12c6ff', emissiveIntensity: 1.6, roughness: 0.4, metalness: 0.5 }) };
});
const PANELS = 48, LASERS = 72, SHADES = 36;

U.definePool({
  's.lasers': () => { const { g, m } = laserAsset(); const im = new THREE.InstancedMesh(g, m, LASERS); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LASERS * 3).fill(1), 3); im.frustumCulled = false; im.renderOrder = 7; return im; },
  's.shade': () => { const { g, m } = shadeAsset(); const im = new THREE.InstancedMesh(g, m, SHADES); im.frustumCulled = false; im.renderOrder = 5; return im; },
  's.panels': () => { const { g, m } = plateAsset(); const im = new THREE.InstancedMesh(g, m, PANELS); im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PANELS * 3).fill(1), 3); im.frustumCulled = false; return im; },
  's.reticle': () => {
    const grp = new THREE.Group(), pl = new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2);
    const a = new THREE.Mesh(pl, new THREE.MeshBasicMaterial({ ...ADD, map: reticleTex(), side: THREE.DoubleSide }));
    const b = new THREE.Mesh(pl, new THREE.MeshBasicMaterial({ ...ADD, map: bracketTex(), side: THREE.DoubleSide }));
    a.renderOrder = b.renderOrder = 5; grp.add(a, b); return grp;
  },
  's.beam': () => { const A = beamAsset(), grp = new THREE.Group(); const h = new THREE.Mesh(A.halo, A.mh), k = new THREE.Mesh(A.core, A.mc); h.renderOrder = k.renderOrder = 6; grp.add(h, k); return grp; },
  's.mush': () => { const A = mushAsset(), grp = new THREE.Group(); for (const g of [A.cap, A.ring, A.stem]) { const o = new THREE.Mesh(g, A.m); o.renderOrder = 6; grp.add(o); } return grp; },
  's.dome': () => { const { g, m } = domeAsset(); const o = new THREE.Mesh(g, m); o.renderOrder = 6; return o; },
  's.cone': () => { const { g, m } = coneAsset(); const o = new THREE.Mesh(g, m); o.renderOrder = 6; return o; },
  's.field': () => { const { g, m } = fieldAsset(); const o = new THREE.Mesh(g, m); o.renderOrder = 7; return o; },
  's.scrap': () => { const { g, m } = scrapAsset(); return new THREE.Mesh(g, m); },
});

// ------------------------------------------------------------------ small systems
/** Background integrator: runs step(dtMs) every frame on the battle timeline until stop(). Skip-safe. */
function runner(c, step) {
  const st = { on: true, stop() { st.on = false; } };
  (async () => { while (st.on && !c.tl.instant) await U.sim(c, 500, dt => { if (st.on) step(dt); }); })();
  return st;
}
const _m = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _ss = V3(), _pp = V3(), _d = V3(), _h = V3(), _t = V3();
const _col = new THREE.Color();
/** Laser bolts (instanced: halo + core per bolt, a dark under-ribbon so they read on pale tiles). */
function lasers(c) {
  const im = U.take(c, 's.lasers'), sh = U.take(c, 's.shade');
  im.position.set(0, 0, 0); sh.position.set(0, 0, 0);
  const items = [];
  const S = {
    /** Bolt a→b over ms; onHit when it lands. o: {w, len, color, core} */
    fire(a, b, o = {}) { items.push({ a: a.clone(), b: b.clone(), t: 0, ms: o.ms ?? 110, w: o.w ?? 0.13, len: o.len ?? 1.1, col: new THREE.Color(o.color || '#12c6ff'), core: new THREE.Color(o.core || '#ffffff'), onHit: o.onHit }); },
    /** Steady flickering beam a→b for ms (designator). */
    beam(a, b, o = {}) { const it = { a: a.clone(), b: b.clone(), t: 0, ms: o.ms ?? 600, w: o.w ?? 0.05, col: new THREE.Color(o.color || '#12c6ff'), core: new THREE.Color(o.core || '#ffffff'), steady: true }; items.push(it); return it; },
    step(dt) {
      let n = 0, s = 0;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.t += dt;
        let w = it.w;
        if (it.steady) {
          if (it.t >= it.ms) { items.splice(i, 1); continue; }
          _h.copy(it.b); _t.copy(it.a); w *= 0.7 + 0.6 * Math.random();
        } else {
          const k = it.t / it.ms;
          if (k >= 1) { items.splice(i, 1); try { it.onHit?.(); } catch (e) { console.error(e); } continue; }
          const L = it.a.distanceTo(it.b) || 1;
          _h.lerpVectors(it.a, it.b, k); _t.lerpVectors(it.a, it.b, max(0, k - it.len / L));
        }
        const len = _h.distanceTo(_t); if (len < 1e-4 || n + 2 > LASERS) continue;
        _d.subVectors(_h, _t).normalize(); _qq.setFromUnitVectors(Z, _d); _pp.addVectors(_h, _t).multiplyScalar(0.5);
        _m.compose(_pp, _qq, _ss.set(w * 2.4, w * 2.4, len)); im.setMatrixAt(n, _m); im.setColorAt(n++, it.col);
        _m.compose(_pp, _qq, _ss.set(w * 0.8, w * 0.8, len * 1.02)); im.setMatrixAt(n, _m); im.setColorAt(n++, it.core);
        if (s < SHADES) { _m.compose(_pp, _qq, _ss.set(w * 4.2, w * 4.2, len)); sh.setMatrixAt(s++, _m); }
      }
      im.count = n; sh.count = s;
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; sh.instanceMatrix.needsUpdate = true;
    },
    get busy() { return items.length > 0; },
    park() { items.length = 0; U.park(im, sh); },
  };
  return S;
}
/** Armour panels blown off: instanced plates with simple physics (bounce on the deck). */
function panels(c) {
  const im = U.take(c, 's.panels'); im.position.set(0, 0, 0);
  const items = [];
  return {
    pop(pos, n, { away = null, colors, speed = [1.5, 3.8], up = [2.5, 6], size = 1 } = {}) {
      const cols = colors.map(h => new THREE.Color(h));
      for (let i = 0; i < c.n(n) && items.length < PANELS; i++) {
        const a = R(0, PI * 2), sp = R(speed[0], speed[1]);
        const v = V3(cos(a) * sp, R(up[0], up[1]), sin(a) * sp); if (away) v.addScaledVector(away, R(0.8, 2.4));
        items.push({ p: pos.clone().add(V3(R(-0.12, 0.12), R(-0.1, 0.1), R(-0.12, 0.12))), v, ax: V3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(),
          a: R(0, 6), av: R(7, 18), s: R(0.7, 1.35) * size, life: 0, max: R(900, 1400), col: cols[i % cols.length] });
      }
    },
    step(dt) {
      const s = dt / 1000;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.life += dt;
        if (it.life >= it.max) { items.splice(i, 1); continue; }
        it.v.y -= 15 * s; it.p.addScaledVector(it.v, s); it.a += it.av * s;
        if (it.p.y < 0.03 && abs(it.p.x) < 4.15 && abs(it.p.z) < 4.15) { it.p.y = 0.03; it.v.y *= -0.38; it.v.x *= 0.55; it.v.z *= 0.55; it.av *= 0.5; }
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i], k = it.life / it.max, sc = it.s * (k > 0.75 ? max(0.01, 1 - (k - 0.75) / 0.25) : 1);
        _m.compose(it.p, _qq.setFromAxisAngle(it.ax, it.a), _ss.set(sc, sc, sc)); im.setMatrixAt(i, _m); im.setColorAt(i, it.col);
      }
      im.count = items.length; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    },
    park() { items.length = 0; U.park(im); },
  };
}
/** Own the victim's materials and return a setter for their emissive (short-circuit flicker / scrap glow). */
function emissiveCtl(c, V) {
  c.kit.ownMaterials(V);
  const mats = [];
  V.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.emissive && mats.push(m)); });
  return (color, intensity) => { _col.set(color); for (const m of mats) { m.emissive.copy(_col); m.emissiveIntensity = intensity; } };
}
const mid = (P, h, k = 0.55) => P.position.clone().setY(P.position.y + h * k);
/** Random point on/around a piece's body. */
const onBody = (V, h, r) => { const a = R(0, PI * 2), rr = R(0.2, 1) * r; return V.position.clone().add(V3(cos(a) * rr, R(0.1, 1) * h, sin(a) * rr)); };
function jets(c, pos, S, n = 1, dir = V3(0, -1, 0)) {
  c.fx.burst({ pos, count: c.n(10 * n), colors: S.jet, speed: [2, 4.5], dir, spread: 0.25, life: [140, 300], size: [0.12, 0.24], sizeEnd: 0.2, gravity: 0, drag: 2, shape: 0 });
}
function teleportColumn(c, beam, pos, S, e, out) {
  // column of light that flares and thins (e: 0..1 through the effect)
  beam.position.set(pos.x, 0, pos.z);
  const k = out ? e : 1 - e, w = 0.18 + 0.32 * sin(PI * min(1, e * 1.2));
  beam.scale.set(w, 0.19 * (0.4 + 0.6 * sin(PI * e)), w);
  beam.children[0].material.opacity = 0.9 * sin(PI * e); beam.children[1].material.opacity = sin(PI * e);
  return k;
}

// ===================================================================== battles
/** Laser strafing run: lift off, fly a pass with twin guns walking bolts across the victim
 *  (armour panels blown off), turn, charge and fire one big shot — the victim explodes. */
export async function strafe(ctx) {
  const c = U.prep(ctx, 4640);
  const { kit, attacker: A, victim: V, victimPos: VP, fx } = c;
  const S = side(c.color), T = side(c.victimColor), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, VP, c.dir), perp = V3(-dir.z, 0, dir.x);
  const L = lasers(c), P = panels(c);
  const phys = runner(c, dt => { L.step(dt); P.step(dt); });
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone(), d = kit.flatDist(a0, VP);
      const lane = VP.clone().addScaledVector(dir, -clamp(d, 1.4, 2.1));
      const H = 0.95, s0 = lane.clone().addScaledVector(perp, -1.6).setY(H), s1 = lane.clone().addScaledVector(perp, 1.6).setY(H);
      // take-off: thruster ring + wash, rise and swing out to the start of the run
      U.sound(c, 'whoosh', { at: a0 });
      fx.ring(a0, { radius: 1.1, color: S.main, thick: true, ms: 380 });
      fx.burst({ pos: a0.clone().setY(0.05), count: c.n(26), colors: SMOKE, speed: [1.6, 3], flat: 0.9, up: 0.1, life: [400, 700], size: [0.2, 0.36], sizeEnd: 2, gravity: 0, drag: 3, shape: 0, blend: 'normal', alpha: 0.5 });
      let lastJ = 0;
      await c.tween(360, (e, k) => {
        A.position.lerpVectors(a0, s0, e); A.position.y = a0.y + H * kit.ease.cubicOut(k);
        kit.setLean(A, perp, -0.35 * sin(k * PI));
        if (k - lastJ > 0.12 && k < 1) { lastJ = k; jets(c, A.position.clone().setY(A.position.y + 0.05), S, 0.6); }
      }, kit.ease.sineInOut);
      // the run
      U.camTo(c, { point: lane.clone().lerp(VP, 0.55) }, 400);
      const N = c.n(14);
      let fired = 0, hits = 0;
      const fire = i => {
        const gun = A.position.clone().setY(A.position.y + hA * 0.45).addScaledVector(perp, i % 2 ? 0.16 : -0.16).addScaledVector(dir, 0.2);
        const off = -1.5 + 3 * (i / max(1, N - 1)) + R(-0.1, 0.1);
        const onV = abs(off) < 0.42;
        const tgt = VP.clone().addScaledVector(perp, off).addScaledVector(dir, R(-0.25, 0.2));
        tgt.y = onV ? R(0.25, hV * 0.8) : 0.03;
        fx.flash(gun, { color: S.light, radius: 0.5, ms: 80 });
        if (i % 2 === 0) U.sound(c, 'laser', { at: gun, gain: 0.8 });
        L.fire(gun, tgt, { color: S.main, core: S.hot, w: 0.12, ms: 100, onHit: () => {
          if (c.tl.instant) return;
          if (onV) {
            fx.sparks(tgt, { count: c.n(26), colors: [...S.spark, T.main], dir: dir.clone().setY(0.4).negate(), spread: 1, speed: [2.5, 6], size: [0.07, 0.14] });
            fx.flash(tgt, { color: S.main, radius: 1.0, ms: 140 });
            P.pop(tgt, 3, { away: dir, colors: body(c.victimColor), speed: [1, 2.6], up: [2.5, 5.5] });
            kit.flashObject(c, V, S.light, 110, 2);
            V.position.addScaledVector(dir, 0.035); kit.setLean(V, dir, 0.1 + 0.03 * hits);
            kit.shake(c, 0.035, 110);
            if (hits++ % 2 === 0) U.sound(c, 'hit', { at: tgt, gain: 0.7 });
          } else {
            fx.sparks(tgt, { count: c.n(14), colors: S.spark, speed: [1.5, 4], up: 0.8, size: [0.06, 0.11] });
            fx.ring(tgt, { radius: 0.5, color: S.main, ms: 240 });
            fx.burst({ pos: tgt.clone().setY(0.05), count: c.n(5), colors: SMOKE, speed: [0.3, 0.9], up: 0.6, life: [400, 700], size: [0.12, 0.2], sizeEnd: 2, gravity: -0.4, drag: 2, shape: 0, blend: 'normal', alpha: 0.5 });
          }
        } });
      };
      await c.tween(1000, (e, k) => {
        A.position.lerpVectors(s0, s1, e); A.position.y = H + 0.05 * sin(k * PI * 6);
        kit.setLean(A, perp, 0.3 * sin(k * PI));
        if (k - lastJ > 0.1 && k < 1) { lastJ = k; jets(c, A.position.clone(), S, 0.4, perp.clone().negate().setY(-0.4)); }
        if (c.tl.instant) fired = N;
        while (fired < N && k >= (fired + 0.4) / N) fire(fired++);
      });
      lastJ = 0;
      // swing round to face the victim, charge
      const hover = VP.clone().addScaledVector(dir, -1.25).setY(0.85), h0 = A.position.clone();
      U.camTo(c, { point: hover.clone().lerp(VP, 0.6) }, 300);
      await c.tween(260, (e, k) => { A.position.lerpVectors(h0, hover, e); kit.setLean(A, perp, 0.3 * (1 - e)); }, kit.ease.cubicInOut);
      const muzzle = () => A.position.clone().setY(A.position.y + hA * 0.45).addScaledVector(dir, 0.3);
      U.sound(c, 'zap', { at: A.position });
      let lastC = 0;
      await c.tween(320, (e, k) => {
        kit.setLean(A, dir, -0.25 * e);
        if (k - lastC > 0.1 && k < 1) {
          lastC = k; const m = muzzle(), a = R(0, PI * 2), from = m.clone().add(V3(cos(a) * 0.9, R(-0.3, 0.5), sin(a) * 0.9));
          fx.burst({ pos: from, count: c.n(8), colors: S.spark, speed: [2.6, 3.4], dir: m.clone().sub(from), spread: 0.12, life: [240, 320], size: [0.07, 0.12], shape: 2 });
          fx.flash(m, { color: S.light, radius: 0.4 + 1.0 * e, ms: 120 });
        }
      }, kit.ease.quadIn);
      // the big shot
      const hit = mid(V, hV, 0.5), m = muzzle();
      U.sound(c, 'laser', { at: m });
      L.fire(m, hit, { color: S.main, core: S.hot, w: 0.34, len: 2.2, ms: 90 });
      fx.flash(m, { color: S.hot, radius: 1.4, ms: 140 });
      await c.tween(90, e => kit.setLean(A, dir, -0.25 - 0.2 * e));
      U.impact(c, hit, { color: S.main, power: 1.25, ring: 3.0, sparks: [...S.spark, T.main], debris: body(c.victimColor), sfx: 'explosion', tintStrength: 0.22,
        dust: c.victimColor === 'w' ? ['#cfd7e1', '#aab5c3', '#8a93a3'] : SMOKE });
      fx.inferno(hit, { scale: 1.1, count: c.n(36), colors: [S.hot, S.light, S.main, S.deep], smoke: SMOKE });
      fx.scorch(VP, { radius: 0.9 });
      P.pop(hit, 22, { away: dir, colors: body(c.victimColor), speed: [2, 4.6], up: [3, 7.5], size: 1.15 });
      await Promise.all([
        U.shards(c, V, body(c.victimColor), { count: 90, ms: 950, away: dir }),
        c.tween(200, e => kit.setLean(A, dir, -0.45 * (1 - e))).then(() => c.wait(180)).then(() => kit.hopTo(c, A, c.to, { ms: 320, height: 0.25, squash: 0.22 })),
      ]);
    });
  } finally { phys.stop(); L.park(); P.park(); U.finish(c); }
}
strafe.label = 'laser strafing run';
const strafeGun = Object.assign(c => strafe(c), { only: ['p', 'r'], weight: 3, label: 'laser strafe (drone/bastion)' });

/** Mech stomp: crouch, jump-jets, launch toward the camera, slam down beside the victim:
 *  EMP dome + shockwave; the victim short-circuits and collapses into glowing scrap. */
export async function stomp(ctx) {
  const c = U.prep(ctx, 4680);
  const { kit, attacker: A, victim: V, victimPos: VP, fx } = c;
  const S = side(c.color), T = side(c.victimColor), hV = U.vh(V), rV = U.vr(V);
  const dir = kit.flatDir(A.position, VP, c.dir);
  const dome = U.take(c, 's.dome'); dome.visible = false;
  const P = panels(c);
  const phys = runner(c, dt => P.step(dt));
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone(), d = kit.flatDist(a0, VP);
      const land = VP.clone().addScaledVector(dir, -min(0.78, max(0.5, d - 0.2))).setY(0);
      // crouch + ignition
      U.sound(c, 'whoosh', { at: a0 });
      await c.tween(170, e => { A.scale.set(1 + 0.12 * e, 1 - 0.2 * e, 1 + 0.12 * e); kit.setLean(A, dir, -0.12 * e); }, kit.ease.quadOut);
      U.sound(c, 'fire', { at: a0, gain: 0.8 });
      fx.inferno(a0.clone().setY(0.08), { scale: 0.9, count: c.n(34), colors: S.jet, smoke: SMOKE });
      fx.ring(a0, { radius: 1.3, color: S.main, thick: true, ms: 380 });
      fx.burst({ pos: a0.clone().setY(0.05), count: c.n(34), colors: SMOKE, speed: [2, 3.6], flat: 0.92, up: 0.1, life: [450, 800], size: [0.22, 0.4], sizeEnd: 2.1, gravity: 0, drag: 3, shape: 0, blend: 'normal', alpha: 0.55 });
      kit.shake(c, 0.04, 160);
      // launch: high arc toward the camera, exhaust trail
      const top = a0.clone().lerp(land, 0.6).setY(2.7);
      U.camTo(c, { point: a0.clone().lerp(VP, 0.6), zoom: c._cam ? c._cam.zoom * 1.12 : 1 }, 420);
      let last = 0;
      await c.tween(440, (e, k) => {
        A.position.lerpVectors(a0, top, e); A.position.y = top.y * kit.ease.cubicOut(k);
        A.scale.set(1.12 - 0.12 * min(1, k * 3), 0.8 + 0.2 * min(1, k * 3), 1.12 - 0.12 * min(1, k * 3));
        kit.setLean(A, dir, -0.12 + 0.3 * k);
        if (k - last > 0.07 && k < 1) { last = k; jets(c, A.position.clone(), S, 1.1); fx.burst({ pos: A.position.clone(), count: c.n(3), colors: SMOKE, speed: [0.2, 0.6], life: [500, 800], size: [0.18, 0.3], sizeEnd: 2, gravity: 0.2, drag: 2, shape: 0, blend: 'normal', alpha: 0.45 }); }
      }, kit.ease.sineOut);
      A.scale.set(1, 1, 1);
      // hang, victim looks up (wobbles)
      U.sound(c, 'zap', { at: VP, gain: 0.6 });
      await Promise.all([
        c.tween(130, (e, k) => { A.position.y = top.y + 0.08 * sin(k * PI); jets(c, A.position.clone(), S, 0.5); kit.setLean(A, dir, 0.18 + 0.2 * e); }),
        c.tween(130, (e, k) => kit.setLean(V, dir, -0.08 * sin(k * PI * 2))),
      ]);
      // SLAM
      const t0 = A.position.clone();
      await c.tween(120, e => { A.position.lerpVectors(t0, land, e); kit.setLean(A, dir, 0.38 * (1 - e)); }, kit.ease.quadIn);
      A.quaternion.identity();
      U.impact(c, land.clone().setY(0.2), { color: S.main, power: 1.3, ring: 3.2, debris: DECK, sfx: 'stomp', shake: 0.16, tintStrength: 0.22, sparks: S.spark, dust: SMOKE });
      fx.scorch(land, { radius: 0.8 });
      kit.squash(c, A, 0.34, 150);
      // EMP: hex dome + second shockwave sweeps over the victim
      dome.visible = true; dome.position.copy(land); dome.material.color.set(S.main); dome.material.opacity = 1;
      fx.shockwave(land, { radius: 3.8, color: S.light, ms: 700, dust: false });
      U.sound(c, 'thunder', { at: VP, gain: 0.8 });
      const setE = emissiveCtl(c, V);
      let lastA = 0, lastF = 0;
      const v0 = VP.clone();
      await Promise.all([
        c.tween(560, (e, k) => { const s = 0.3 + 3.3 * e; dome.scale.set(s, s * 0.55, s); dome.material.opacity = (1 - k) ** 1.4; dome.rotation.y = k * 0.6; }, kit.ease.cubicOut),
        // short-circuit: arcs crawl over the victim, its light-lines flicker, it shudders
        c.wait(90).then(() => c.tween(720, (e, k) => {
          if (k < 1) {
            V.position.set(v0.x + R(-0.04, 0.04), 0, v0.z + R(-0.04, 0.04));
            kit.setLean(V, dir, 0.12 * sin(k * 38) * (1 - k * 0.4) + 0.1);
          }
          if (k - lastA > 0.075 && k < 0.98) {
            lastA = k;
            fx.lightning(onBody(V, hV, rV), Math.random() < 0.6 ? onBody(V, hV, rV) : V.position.clone().add(V3(R(-0.9, 0.9), 0.03, R(-0.9, 0.9))),
              { color: Math.random() < 0.7 ? S.light : S.hot, width: 0.045, branches: 1, branchP: 0.4, ms: 120, light: false, flashRadius: 0.55 });
            fx.sparks(onBody(V, hV, rV), { count: c.n(10), colors: S.spark, speed: [1.5, 4], up: 1.2, size: [0.05, 0.1] });
          }
          if (k - lastF > 0.05) { lastF = k; setE(Math.random() < 0.5 ? S.main : '#000000', Math.random() * 1.6); }
          if (k > 0.5 && k < 0.53) U.sound(c, 'zap', { at: VP });
        })),
      ]);
      dome.visible = false;
      // collapse into glowing scrap
      U.sound(c, 'topple', { at: VP });
      const tilt = kit.flatDir(land, VP, dir);
      await c.tween(300, (e, k) => {
        V.scale.set(1 + 0.3 * e, 1 - 0.72 * e, 1 + 0.3 * e); kit.setLean(V, tilt, 0.1 + 0.5 * e);
        setE(k > 0.3 ? '#ff6a1a' : S.main, 0.4 + 1.6 * e);
      }, kit.ease.quadIn);
      U.sound(c, 'stone', { at: VP });
      const cp = VP.clone().setY(0.18);
      fx.flash(cp, { color: '#ff9a3a', radius: 1.6, ms: 260 });
      fx.ring(VP, { radius: 1.5, color: '#ff8a3a', thick: true, ms: 360 });
      fx.ring(VP, { radius: 1.6, dark: true, thick: true, ms: 360, alpha: 0.4 });
      fx.embers(cp, { count: c.n(46), colors: ['#ffcf6a', '#ff7a2a', T.main], radius: 0.45, size: [0.05, 0.09] });
      fx.smoke(cp, { count: c.n(14), colors: SMOKE, size: [0.3, 0.5], alpha: 0.55, up: 0.9 });
      fx.scorch(VP, { radius: 0.75, ms: 3000 });
      kit.shake(c, 0.06, 200);
      P.pop(cp, 10, { colors: [...scrap(c.victimColor).slice(0, 3), body(c.victimColor)[0]], speed: [1.2, 3], up: [2, 4.5] });
      await Promise.all([
        U.shards(c, V, scrap(c.victimColor), { count: 80, ms: 900, speed: [0.8, 2.6], up: [1.5, 4.5] }),
        c.wait(160).then(() => kit.hopTo(c, A, c.to, { ms: 280, height: 0.35, squash: 0.25 })),
      ]);
    });
  } finally { phys.stop(); P.park(); dome.material.opacity = 1; U.park(dome); U.finish(c); }
}
stomp.label = 'jump-jet stomp & EMP';
const stompStrider = Object.assign(c => stomp(c), { only: ['n'], weight: 4, label: 'jump-jet stomp (strider)' });
const stompHeavy = Object.assign(c => stomp(c), { only: ['r', 'k'], weight: 1, label: 'jump-jet stomp (heavies)' });

/** Orbital strike: designator laser, a reticle spins down and locks on, a beam from the sky:
 *  explosion, mushroom of light, the victim blasted sky-high. */
export async function orbital(ctx) {
  const c = U.prep(ctx, 3660);
  const { kit, attacker: A, victim: V, victimPos: VP, fx } = c;
  const S = side(c.color), T = side(c.victimColor), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, VP, c.dir);
  const ret = U.take(c, 's.reticle'), beam = U.take(c, 's.beam'), mush = U.take(c, 's.mush');
  ret.visible = beam.visible = mush.visible = false;
  const L = lasers(c);
  const phys = runner(c, dt => L.step(dt));
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone(), ant = () => A.position.clone().setY(A.position.y + hA + 0.04);
      // uplink: the commander rises a little, antenna flares, rings pulse
      U.sound(c, 'zap', { at: a0, gain: 0.7 });
      fx.ring(a0, { radius: 1.0, color: S.main, thick: true, ms: 360 });
      await c.tween(220, (e, k) => { A.position.y = a0.y + 0.14 * e; A.scale.set(1 - 0.06 * e, 1 + 0.1 * e, 1 - 0.06 * e); if (k < 1 && ((k * 6) | 0) !== (((k - 0.2) * 6) | 0)) fx.sparkles(ant(), { count: c.n(8), colors: S.spark, speed: [0.6, 1.8] }); }, kit.ease.quadOut);
      A.scale.set(1, 1, 1);
      fx.flash(ant(), { color: S.light, radius: 1.2, ms: 200 });
      // designator paints the victim; the reticle spins down onto it
      const paint = mid(V, hV, 0.5);
      L.beam(ant(), paint, { ms: 760, w: 0.045, color: S.main, core: S.hot });
      U.sound(c, 'laser', { at: VP, gain: 0.55 });
      U.camTo(c, { point: VP, zoom: c._cam ? c._cam.zoom * 0.92 : 1 }, 420);
      ret.visible = true; ret.position.set(VP.x, 0.035, VP.z);
      const [ring, brk] = ret.children;
      ring.material.color.set(S.main); brk.material.color.set(S.light); ring.material.opacity = brk.material.opacity = 1;
      let lastS = 0;
      await c.tween(620, (e, k) => {
        const s1 = 3.4 - 2.0 * e, s2 = 2.8 - 1.65 * e;
        ring.scale.set(s1, 1, s1); ring.rotation.y = 2.2 * (1 - e);
        brk.scale.set(s2, 1, s2); brk.rotation.y = -PI * 0.75 * (1 - e) + PI / 4;
        const blink = k > 0.82 ? (((k * 30) | 0) % 2 ? 0.25 : 1) : 1;
        ring.material.opacity = blink; brk.material.opacity = blink;
        if (k < 1) { V.position.x = VP.x + R(-0.02, 0.02); V.position.z = VP.z + R(-0.02, 0.02); }
        if (k - lastS > 0.25 && k < 1) { lastS = k; fx.ring(VP, { radius: 0.9 + 0.4 * (1 - e), color: S.light, ms: 220, alpha: 0.7 }); }
      }, kit.ease.cubicOut);
      V.position.copy(VP);
      U.sound(c, 'zap', { at: VP });
      fx.flash(VP.clone().setY(0.2), { color: S.light, radius: 1.3, ms: 160 });
      // pilot beam then the strike
      beam.visible = true; beam.position.set(VP.x, 0, VP.z);
      const [halo, core] = beam.children;
      halo.material.color.set(S.main); core.material.color.set(S.hot);
      halo.material.opacity = 0; core.material.opacity = 1;
      U.sound(c, 'laser', { at: VP });
      await c.tween(150, (e, k) => { beam.scale.set(0.25 + 0.15 * Math.random(), 1, 0.25 + 0.15 * Math.random()); core.material.opacity = 0.6 + 0.4 * Math.random(); fx.boardFlash(S.main, 80, 0.12); });
      await c.tween(140, e => { beam.scale.set(0.4 + 0.85 * e, 1, 0.4 + 0.85 * e); halo.material.opacity = 0.7 * e; beam.position.y = 6 * (1 - e); }, kit.ease.quadIn);
      beam.position.y = 0;
      const hit = VP.clone().setY(0.3);
      U.impact(c, hit, { color: S.main, power: 1.45, ring: 3.4, debris: [...body(c.victimColor), ...DECK.slice(1, 3)], sfx: 'explosion', shake: 0.19, tintStrength: 0.18, sparks: S.spark, dust: SMOKE });
      fx.explosion(hit, { scale: 1.15, flashColor: S.light, ringColor: S.main, fireColors: [S.hot, S.light, S.main, S.deep], sparkColors: S.spark,
        debrisColors: [...body(c.victimColor), '#6f6a64'], boardFlash: false });
      fx.smoke(hit, { count: c.n(22), colors: SMOKE, size: [0.4, 0.7], alpha: 0.6, up: 1.4, speed: [0.8, 2] });
      ret.visible = false;
      // mushroom of light rises toward the camera; the beam fades; the victim is blasted up and away
      mush.visible = true; mush.position.set(VP.x, 0, VP.z);
      mush.children[0].material.color.set(S.main); mush.children[0].material.opacity = 0.75;
      const [cap, tor, stem] = mush.children;
      c.wait(220).then(() => U.sound(c, 'thunder', { at: VP, gain: 0.8 }));
      let lastE = 0;
      await Promise.all([
        c.tween(950, (e, k) => {
          const up = 0.35 + 1.6 * e, cs = 0.3 + 1.05 * kit.ease.cubicOut(k);
          cap.position.y = up; cap.scale.set(cs, cs * (0.9 + 0.3 * e), cs); cap.rotation.y = k * 0.8;
          tor.position.y = up * 0.42; tor.scale.setScalar(0.3 + 1.6 * e);
          stem.scale.set(0.5 + 0.5 * e, up, 0.5 + 0.5 * e);
          cap.material.opacity = 0.75 * (k < 0.35 ? 1 : (1 - (k - 0.35) / 0.65) ** 1.5);
          halo.material.opacity = 0.7 * max(0, 1 - k * 2.6); core.material.opacity = max(0, 1 - k * 3); beam.scale.set(1.25 + 0.5 * k, 1, 1.25 + 0.5 * k);
          if (k - lastE > 0.12 && k < 0.8) { lastE = k; fx.inferno(cap.position.clone().add(mush.position), { scale: 0.8 + e, count: c.n(10), colors: [S.hot, S.light, S.main], smoke: SMOKE }); }
        }, kit.ease.quadOut),
        U.fling(c, V, dir, { ms: 1100, up: 11, speed: 3.4, spin: 20, bounce: 0.45, trail: '#3a404c', dust: SMOKE }),
        c.wait(420).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.4, squash: 0.22 })),
      ]);
    });
  } finally {
    phys.stop(); L.park();
    for (const o of [...ret.children, ...beam.children, mush.children[0]]) o.material.opacity = 1;
    for (const o of mush.children) { o.position.set(0, 0, 0); o.scale.set(1, 1, 1); }
    beam.position.set(0, 0, 0);
    U.park(ret, beam, mush); U.finish(c);
  }
}
orbital.label = 'orbital strike';
const orbitalCmd = Object.assign(c => orbital(c), { only: ['k'], weight: 4, label: 'orbital strike (commander)' });
const orbitalRoyal = Object.assign(c => orbital(c), { only: ['q', 'r'], weight: 1, label: 'orbital strike (core/bastion)' });

/** Tractor beam: lift the victim spinning into a force-field cube, crush it into a scrap cube,
 *  flick it off the board; the attacker teleports onto the square. */
export async function tractor(ctx) {
  const c = U.prep(ctx, 4280);
  const { kit, attacker: A, victim: V, victimPos: VP, fx } = c;
  const S = side(c.color), T = side(c.victimColor), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, VP, c.dir);
  const cone = U.take(c, 's.cone'), field = U.take(c, 's.field'), cube = U.take(c, 's.scrap'), col = U.take(c, 's.beam');
  cone.visible = field.visible = cube.visible = col.visible = false;
  const P = panels(c);
  const phys = runner(c, dt => P.step(dt));
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone();
      const emit = () => A.position.clone().setY(A.position.y + hA * 0.8 + 0.12);
      // power up: hover, emitter glow, ring
      U.sound(c, 'zap', { at: a0, gain: 0.7 });
      fx.ring(a0, { radius: 1.0, color: S.main, thick: true, ms: 380 });
      await c.tween(220, (e, k) => { A.position.y = a0.y + 0.28 * e; if (k < 1 && ((k * 5) | 0) !== (((k - 0.2) * 5) | 0)) fx.sparkles(emit(), { count: c.n(8), colors: S.spark, speed: [0.5, 1.6] }); }, kit.ease.quadOut);
      fx.flash(emit(), { color: S.light, radius: 1.1, ms: 200 });
      // beam reaches out
      cone.visible = true; cone.material.color.set(S.main); cone.material.opacity = 1;
      const tex = cone.material.map;
      const aim = (len, rad) => {
        const H = emit(), Vc = mid(V, hV * V.scale.y, 0.5);
        cone.position.copy(H); cone.quaternion.setFromUnitVectors(Z, _d.subVectors(Vc, H).normalize());
        const L = H.distanceTo(Vc) * len; cone.scale.set(rad, rad, max(0.01, L));
        tex.offset.y -= 0.045;
      };
      U.sound(c, 'laser', { at: VP, gain: 0.7 });
      await c.tween(220, e => aim(e, 0.4 + 0.6 * e), kit.ease.cubicOut);
      // lift: victim rises toward the camera, spinning; motes stream up the beam
      const v0 = VP.clone(), LIFT = 1.35;
      U.camTo(c, { point: a0.clone().lerp(VP, 0.65), zoom: c._cam ? c._cam.zoom * 0.95 : 1 }, 400);
      let lastM = 0;
      await c.tween(560, (e, k) => {
        V.position.set(v0.x + 0.03 * sin(k * 31), LIFT * e, v0.z + 0.03 * cos(k * 27));
        V.rotation.set(0.25 * sin(k * PI * 2), k * PI * 1.6, 0.2 * sin(k * PI * 3));
        aim(1, 1 + 0.08 * sin(k * 40));
        if (k - lastM > 0.08 && k < 1) {
          lastM = k; const Vc = mid(V, hV, 0.5);
          fx.burst({ pos: Vc, count: c.n(7), colors: S.spark, speed: [2, 3.2], dir: emit().sub(Vc), spread: 0.25, life: [260, 420], size: [0.06, 0.12], shape: 2, jitter: 0.2 });
          fx.ring(v0, { radius: 0.8, color: S.main, ms: 260, alpha: 0.6 });
        }
      }, kit.ease.sineInOut);
      // force-field cube closes round it
      const fc = () => V.position.clone().setY(V.position.y + hV * 0.5 * V.scale.y);
      field.visible = true; field.material.color.set(S.light); field.material.opacity = 1;
      const fs = max(0.75, hV * 0.95);
      U.sound(c, 'zap', { at: VP });
      await c.tween(170, (e, k) => { const s = fs * (1.8 - 0.8 * e); field.scale.setScalar(s); field.position.copy(fc()); field.rotation.y = V.rotation.y; aim(1, 1); V.rotation.y += 0.05; }, kit.ease.backOut);
      // CRUSH
      let lastS = 0;
      const Ys = V.position.y;
      await c.tween(380, (e, k) => {
        const s = 1 - 0.68 * e;
        V.scale.set(s * (1 + 0.15 * sin(k * 40)), s * (1 - 0.1 * sin(k * 40)), s);
        V.position.y = Ys + hV * 0.5 * (1 - s);
        field.scale.setScalar(fs * (1 - 0.66 * e)); field.position.copy(fc()); field.rotation.y = V.rotation.y;
        aim(1, 1 - 0.4 * e);
        if (k - lastS > 0.1 && k < 1) {
          lastS = k; const p = fc();
          fx.sparks(p, { count: c.n(14), colors: [...S.spark, T.main], speed: [2.5, 6], size: [0.06, 0.12], up: 0.4 });
          kit.shake(c, 0.02 + 0.04 * e, 90);
          kit.flashObject(c, V, S.light, 80, 1.6);
        }
      }, kit.ease.quadIn);
      // snap: it IS a cube now
      const cp = fc(), cs = 0.44;
      V.visible = false; field.visible = false;
      cube.visible = true; cube.scale.setScalar(cs); cube.position.copy(cp).setY(cp.y - cs / 2); cube.rotation.set(0, V.rotation.y, 0);
      cube.material.color.set(c.victimColor === 'w' ? '#f2f5f9' : '#5a616e'); cube.material.emissive.set(T.main);
      U.sound(c, 'stone', { at: VP }); U.sound(c, 'hit', { at: VP });
      fx.flash(cp, { color: '#ffffff', radius: 1.6, ms: 200 });
      fx.flash(cp, { color: S.main, radius: 2.4, ms: 300 });
      fx.sparks(cp, { count: c.n(60), colors: [...S.spark, T.main], speed: [3, 8], size: [0.07, 0.15], up: 0.6 });
      fx.ring(v0, { radius: 2.2, color: S.main, thick: true, ms: 420 });
      fx.ring(v0, { radius: 2.3, dark: true, thick: true, ms: 420, alpha: 0.4 });
      fx.boardFlash(S.main, 300, 0.22);
      if (c.big) fx.vignette(S.main, 420, 0.6);
      P.pop(cp, 9, { colors: body(c.victimColor), speed: [1.5, 3.5], up: [2, 5] });
      kit.shake(c, 0.09, 260);
      U.slowmo(c, { factor: 0.2, ms: 180 });
      U.punch(c, cp, 0.88);
      await c.tween(150, (e, k) => { cube.rotation.y += 0.04; cube.position.y = cp.y - cs / 2 + 0.05 * sin(k * PI); aim(1, 0.6); });
      // flick it away; the attacker teleports onto the square
      U.sound(c, 'whoosh', { at: cp });
      const flick = c.tween(110, e => aim(1 - e, 0.6 * (1 - e) + 0.05)).then(() => { cone.visible = false; });
      const beamCol = () => { col.children[0].material.color.set(S.main); col.children[1].material.color.set(S.hot); col.visible = true; };
      await Promise.all([
        flick,
        U.fling(c, cube, dir, { ms: 1000, up: 4.5, speed: 6.5, spin: 13, bounce: 0.5, trail: '#3a404c', dust: SMOKE }),
        (async () => {
          await c.wait(120);
          U.sound(c, 'poof', { at: A.position });
          beamCol();
          const p0 = A.position.clone();
          await c.tween(150, (e, k) => { teleportColumn(c, col, p0, S, e * 0.5, true); A.scale.set(max(0.02, 1 - e), 1 + 1.4 * e, max(0.02, 1 - e)); A.position.y = p0.y + 0.4 * e; }, kit.ease.quadIn);
          fx.sparkles(p0.clone().setY(0.5), { count: c.n(24), colors: S.spark, speed: [0.8, 2.4] });
          fx.ring(p0, { radius: 0.9, color: S.main, ms: 300 });
          A.visible = false; A.position.copy(c.to).setY(0.4);
          fx.lightning(p0.clone().setY(hA), c.to.clone().setY(hA * 0.6), { color: S.light, width: 0.05, branches: 0, ms: 110, light: false, flashRadius: 0.9 });
          await c.tween(90, (e) => teleportColumn(c, col, p0, S, 0.5 + 0.5 * e, true));
          A.visible = true;
          U.sound(c, 'zap', { at: c.to, gain: 0.6 });
          await c.tween(190, (e, k) => { teleportColumn(c, col, c.to, S, e, false); A.scale.set(min(1, 0.02 + e * 1.1), 2.4 - 1.4 * e, min(1, 0.02 + e * 1.1)); A.position.y = 0.4 * (1 - e); }, kit.ease.backOut);
          col.visible = false;
          fx.ring(c.to, { radius: 1.2, color: S.main, thick: true, ms: 340 });
          fx.sparkles(c.to.clone().setY(0.4), { count: c.n(24), colors: S.spark, speed: [0.8, 2.2] });
          await kit.squash(c, A, 0.2, 90);
        })(),
      ]);
    });
  } finally {
    phys.stop(); P.park(); A.visible = true;
    cone.material.opacity = 1; field.material.opacity = 1;
    for (const o of col.children) o.material.opacity = 1;
    cube.rotation.set(0, 0, 0); cone.scale.set(1, 1, 1); col.scale.set(1, 1, 1);
    U.park(cone, field, cube, col); U.finish(c);
  }
}
tractor.label = 'tractor beam crush';
const tractorPsi = Object.assign(c => tractor(c), { only: ['b', 'q'], weight: 4, label: 'tractor beam (oracle/core)' });

export const battleAnims = [strafe, strafeGun, stomp, stompStrider, stompHeavy, orbital, orbitalCmd, orbitalRoyal, tractor, tractorPsi];
