// Halloween battle (capture) animations — owner: battle-1. See docs/notes/battle.md.
// Four battles, picked at random (type-biased variants: crypt towers favour the grave, the
// Vampire Countess the bats, the Witch the possession, imps and the Pumpkin King the bomb):
//  - grave:      a glowing grave cracks open under the victim, bony hands grab it and drag it
//                down; a tombstone pops up and the attacker stomps it into the earth  (~2.2 s)
//  - bats:       a swarm bursts out of the attacker, circles the victim in a vortex, lifts it
//                and carries it off the board edge                                     (~2.2 s)
//  - possession: a ghost rises from the attacker, loops over and dives into the victim, which
//                shudders, glows and stretches up into wisps                           (~2.1 s)
//  - pumpkin:    a lit pumpkin bomb is lobbed with a sparking fuse, bounces, and explodes into
//                seeds and goo; the victim is blown sky-high                           (~2.1 s)
// Side colours: white ("Harvest") = pumpkin orange / amber, black ("Midnight") = ghost green / violet.
import * as U from '../battle_util.js';

const { THREE, PI, sin, cos, min, max, R } = U;

const SIDE = {
  w: { main: '#ff9a1a', light: '#ffd27a', deep: '#d0540a', wisp: ['#ffb02a', '#f47a10', '#ffd27a'], goo: ['#ff8a1a', '#ffb347', '#e05a0a'] },
  b: { main: '#7dff4a', light: '#c8ff96', deep: '#3fae3a', wisp: ['#8cff52', '#4fd256', '#c8ff96', '#b07aff'], goo: ['#7dff4a', '#4fd256', '#b9ff7a'] },
};
const side = c => SIDE[c] || SIDE.w;
const BODY = { w: ['#efe6d2', '#d9cdb2', '#ff9a1a', '#b07a3a'], b: ['#2a2234', '#3c3148', '#7dff4a', '#5a3f7a'] };
const body = c => BODY[c] || BODY.w;
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

// ------------------------------------------------------------------ assets
function canvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = U.once(() => canvasTex(64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
}));
/** Vertex-colour helper for merged geometry. */
const tinted = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const nonIdx = g => (g.index ? g.toNonIndexed() : g);
function mergeColored(list) {
  // minimal merge (position, normal, color) so we don't depend on kit internals
  const parts = list.map(g => nonIdx(g));
  const n = parts.reduce((s, g) => s + g.attributes.position.count, 0);
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    if (!g.attributes.normal) g.computeVertexNormals();
    P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('normal', new THREE.BufferAttribute(N, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3));
  m.computeBoundingSphere();
  return m;
}

const graveAssets = U.once(() => ({
  hole: new THREE.CircleGeometry(0.56, 40).rotateX(-PI / 2),
  holeMat: new THREE.MeshBasicMaterial({ color: '#07040a', polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
  rim: new THREE.RingGeometry(0.5, 0.66, 40).rotateX(-PI / 2),
  rimMat: new THREE.MeshBasicMaterial({ ...ADD, color: '#7dff4a' }),
  glow: new THREE.PlaneGeometry(1.8, 1.8).rotateX(-PI / 2),
  glowMat: new THREE.MeshBasicMaterial({ ...ADD, map: glowTex(), color: '#7dff4a' }),
}));
const handAssets = U.once(() => {
  const bone = '#e8dfc8';
  const parts = [tinted(new THREE.CylinderGeometry(0.03, 0.04, 0.34, 7).translate(0, -0.17, 0), bone),   // forearm (top at y=0)
    tinted(new THREE.BoxGeometry(0.11, 0.08, 0.04).translate(0, 0.03, 0), bone)];                          // palm
  for (let i = 0; i < 4; i++) {
    const x = -0.042 + i * 0.028;
    parts.push(tinted(new THREE.CylinderGeometry(0.011, 0.014, 0.1, 5).translate(0, 0.05, 0).rotateX(0.5).translate(x, 0.07, 0.01), bone));
    parts.push(tinted(new THREE.CylinderGeometry(0.009, 0.011, 0.07, 5).translate(0, 0.035, 0).rotateX(1.3).translate(x, 0.15, 0.06), bone));
  }
  parts.push(tinted(new THREE.CylinderGeometry(0.012, 0.014, 0.08, 5).translate(0, 0.04, 0).rotateZ(1.0).translate(-0.06, 0.03, 0), bone)); // thumb
  return { g: mergeColored(parts), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, emissive: '#3a3020', emissiveIntensity: 0.6 }) };
});
const tombAssets = U.once(() => {
  const s = new THREE.Shape();
  s.moveTo(-0.2, 0); s.lineTo(0.2, 0); s.lineTo(0.2, 0.36); s.absarc(0, 0.36, 0.2, 0, PI, false); s.lineTo(-0.2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 2, curveSegments: 12 });
  g.translate(0, 0, -0.045);
  const cross = [new THREE.BoxGeometry(0.035, 0.2, 0.02).translate(0, 0.36, 0.055), new THREE.BoxGeometry(0.13, 0.035, 0.02).translate(0, 0.4, 0.055)];
  const body = tinted(g, '#8d877c');
  const pos = body.attributes.position, col = body.attributes.color;
  for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = 0.75 + 0.25 * min(1, y / 0.4); col.setXYZ(i, col.getX(i) * k, col.getY(i) * k * (y < 0.08 ? 1.08 : 1), col.getZ(i) * k); }
  return { g: mergeColored([body, ...cross.map(c => tinted(c, '#4a463f'))]), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }) };
});
const batAssets = U.once(() => {
  const wing = new THREE.Shape();
  wing.moveTo(0.03, 0.03); wing.lineTo(0.14, 0.07); wing.lineTo(0.25, 0.02);
  wing.quadraticCurveTo(0.2, -0.0, 0.19, -0.06); wing.quadraticCurveTo(0.14, -0.02, 0.11, -0.07); wing.quadraticCurveTo(0.07, -0.03, 0.03, -0.05); wing.lineTo(0.03, 0.03);
  const r = new THREE.ShapeGeometry(wing, 4).rotateX(-PI / 2);         // XZ plane, nose toward -z… flip below
  const l = r.clone().scale(-1, 1, 1);
  const b = new THREE.SphereGeometry(0.045, 8, 6).scale(0.8, 0.7, 1.4);
  const ears = [new THREE.ConeGeometry(0.014, 0.05, 4).translate(-0.018, 0.04, 0.03), new THREE.ConeGeometry(0.014, 0.05, 4).translate(0.018, 0.04, 0.03)];
  const g = mergeColored([tinted(r, '#2a1838'), tinted(l, '#2a1838'), tinted(b, '#140a1c'), ...ears.map(e => tinted(e, '#140a1c'))]);
  return { g, m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, emissive: '#3a1458', emissiveIntensity: 0.55 }) };
});
const ghostAssets = U.once(() => {
  const pts = [];
  pts.push(new THREE.Vector2(0.001, 0.62));
  for (let i = 1; i <= 8; i++) { const a = (i / 8) * PI / 2; pts.push(new THREE.Vector2(sin(a) * 0.2, 0.42 + cos(a) * 0.2)); }
  pts.push(new THREE.Vector2(0.22, 0.25), new THREE.Vector2(0.26, 0.06), new THREE.Vector2(0.27, 0.0));
  const g = new THREE.LatheGeometry(pts, 24);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    if (y < 0.08) pos.setY(i, y + 0.05 * sin(Math.atan2(z, x) * 6));     // wavy hem
    const k = 0.55 + 0.45 * min(1, y / 0.5);
    col.set([k, k, k], i * 3);
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const eye = new THREE.SphereGeometry(0.035, 8, 6).scale(1, 1.4, 0.6);
  const face = mergeColored([tinted(eye.clone().translate(-0.07, 0.46, 0.185), '#000000'), tinted(eye.clone().translate(0.07, 0.46, 0.185), '#000000'),
    tinted(new THREE.SphereGeometry(0.045, 8, 6).scale(0.8, 1.2, 0.5).translate(0, 0.34, 0.2), '#000000')]);
  return { g, m: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, color: '#e8fff0' }),
    face, faceMat: new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }) };
});
const pumpkinAssets = U.once(() => {
  const g = new THREE.SphereGeometry(0.2, 24, 16);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x), rib = 1 - 0.08 * (1 - Math.abs(cos(a * 4)));
    y *= 0.78; x *= rib; z *= rib;
    if (y > 0.13) y -= (y - 0.13) * 0.6;                   // dimpled top
    pos.setXYZ(i, x, y, z);
    const groove = Math.abs(cos(a * 4));
    // carved face on +z: two triangle eyes + jagged mouth, glowing yellow
    const fy = y / 0.156, fx = x / 0.2;
    const eyeL = z > 0.1 && fy > 0.05 && fy < 0.45 && Math.abs(fx + 0.32) < 0.16 * (0.45 - fy) / 0.4 + 0.02;
    const eyeR = z > 0.1 && fy > 0.05 && fy < 0.45 && Math.abs(fx - 0.32) < 0.16 * (0.45 - fy) / 0.4 + 0.02;
    const mouth = z > 0.1 && fy < -0.1 && fy > -0.5 && Math.abs(fx) < 0.5 && (fy > -0.32 || Math.abs(sin(fx * 18)) > 0.4);
    const c = eyeL || eyeR || mouth ? [1.0, 0.86, 0.3] : [0.95 * (0.7 + 0.3 * groove), 0.42 * (0.7 + 0.3 * groove), 0.05];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const stem = tinted(new THREE.CylinderGeometry(0.022, 0.035, 0.09, 6).rotateZ(0.25).translate(0.01, 0.17, 0), '#3d6a1e');
  const fuse = tinted(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 4).rotateZ(-0.6).translate(0.05, 0.22, 0), '#2a2420');
  return { g: mergeColored([g, stem, fuse]), m: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, emissive: '#ff8a1a', emissiveIntensity: 0.12 }) };
});
const glowSpriteMat = U.once(() => new THREE.SpriteMaterial({ map: glowTex(), ...ADD, color: '#ffb02a' }));

const BATS = 22, HANDS = 4;
U.definePool({
  'h.grave': () => {
    const a = graveAssets(), grp = new THREE.Group();
    const glow = new THREE.Mesh(a.glow, a.glowMat); glow.position.y = 0.012; glow.renderOrder = 3;
    const hole = new THREE.Mesh(a.hole, a.holeMat); hole.position.y = 0.014; hole.renderOrder = 2;
    const rim = new THREE.Mesh(a.rim, a.rimMat); rim.position.y = 0.016; rim.renderOrder = 4;
    grp.add(glow, hole, rim); return grp;
  },
  'h.hands': () => { const { g, m } = handAssets(); const im = new THREE.InstancedMesh(g, m, HANDS); im.frustumCulled = false; return im; },
  'h.tomb': () => { const { g, m } = tombAssets(); return new THREE.Mesh(g, m); },
  'h.bats': () => { const { g, m } = batAssets(); const im = new THREE.InstancedMesh(g, m, BATS); im.frustumCulled = false; return im; },
  'h.ghost': () => {
    const a = ghostAssets(), grp = new THREE.Group();
    const b = new THREE.Mesh(a.g, a.m); b.renderOrder = 6; const f = new THREE.Mesh(a.face, a.faceMat); f.renderOrder = 7;
    const s = new THREE.Sprite(glowSpriteMat()); s.position.y = 0.35; s.scale.setScalar(0.9); s.renderOrder = 5;
    grp.add(s, b, f); return grp;
  },
  'h.pumpkin': () => {
    const { g, m } = pumpkinAssets(), grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, m));
    const s = new THREE.Sprite(glowSpriteMat()); s.scale.setScalar(0.9); s.renderOrder = 6; grp.add(s);
    return grp;
  },
});

// ------------------------------------------------------------------ helpers
const facing = (obj, dir) => { obj.rotation.set(0, Math.atan2(dir.x, dir.z), 0); };
function shudder(c, obj, ms, amp = 0.04) {
  const p0 = obj.position.clone();
  return c.tween(ms, (e, k) => { const a = k < 1 ? amp : 0; obj.position.set(p0.x + R(-a, a), p0.y, p0.z + R(-a, a)); });
}

// ===================================================================== battles
/** The grave: hands drag the victim down into a glowing grave; a tombstone gets stomped flat. */
export async function grave(ctx) {
  const c = U.prep(ctx, 3530);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hV = U.vh(V);
  const gr = U.take(c, 'h.grave'), hands = U.take(c, 'h.hands'), tomb = U.take(c, 'h.tomb');
  const [glow, , rim] = gr.children;
  glow.material.color.set(S.main); rim.material.color.set(S.main);
  gr.position.copy(victimPos); gr.scale.setScalar(0.01);
  tomb.visible = false;
  const dirt = ['#3b2c20', '#5a4532', '#2a1e16'];
  try {
    await U.focus(c, async () => {
      // the attacker beckons: a stretch and a side-coloured puff under the victim
      await c.tween(200, (e, k) => { const s = sin(k * PI) * 0.15; A.scale.set(1 - s * 0.4, 1 + s, 1 - s * 0.4); });
      fx.smoke(victimPos.clone().setY(0.05), { count: c.n(8), colors: S.wisp, alpha: 0.4, size: [0.2, 0.35], up: 0.1 });
      // the grave cracks open
      fx.debris(victimPos.clone().setY(0.05), { count: c.n(12), colors: dirt, speed: [1, 2.5], up: 2 });
      fx.dust(victimPos.clone().setY(0.05), { count: c.n(22), colors: dirt, speed: [0.8, 2], up: 0.6 });
      kit.shake(c, 0.05, 260);
      await Promise.all([
        c.tween(340, (e, k) => { gr.scale.setScalar(0.01 + e); rim.material.opacity = 0.6 + 0.4 * sin(k * 20) ** 2; }, kit.ease.backOut),
        shudder(c, V, 340, 0.03),
      ]);
      // hands rise around the rim and clench inward
      const items = [];
      for (let i = 0; i < HANDS; i++) {
        const a = i * PI / 2 + PI / 4 + R(-0.2, 0.2);
        items.push({ a, p: new THREE.Vector3(), ax: new THREE.Vector3(), s: R(0.9, 1.15), q: new THREE.Quaternion() });
      }
      const placeHands = (rise, lean, sink = 0) => {
        for (let i = 0; i < items.length; i++) {
          const it = items[i], r = 0.42 - 0.1 * lean;
          it.p.set(victimPos.x + cos(it.a) * r, -0.3 + 0.62 * rise - sink, victimPos.z + sin(it.a) * r);
          // face the centre, lean in
          const yaw = Math.atan2(-cos(it.a), -sin(it.a));
          it.q.setFromEuler(new THREE.Euler(0.15 + 0.7 * lean, yaw, 0, 'YXZ'));
          U._m4.compose(it.p, it.q, U._s.setScalar(it.s * 1.5));
          hands.setMatrixAt(i, U._m4);
        }
        hands.count = items.length; hands.instanceMatrix.needsUpdate = true;
      };
      await c.tween(280, e => placeHands(e, 0), kit.ease.backOut);
      await c.tween(140, e => placeHands(1, e), kit.ease.quadIn);
      kit.flashObject(c, V, S.main, 300, 1.4);
      // yank down: spinning, shrinking, wisps erupt
      fx.burst({ pos: victimPos.clone().setY(0.1), count: c.n(30), colors: S.wisp, speed: [0.4, 1.4], up: 1.6, spread: 0.6, life: [500, 900],
        size: [0.18, 0.32], sizeEnd: 1.6, gravity: -1.2, drag: 2, shape: 0, alpha: 0.7, jitter: 0.25 });
      fx.boardFlash(S.main, 400, 0.25);
      const v0 = V.position.clone();
      let lastP = 0;
      await c.tween(460, (e, k) => {
        V.position.set(v0.x, -hV * 0.9 * e, v0.z); V.rotation.y = e * PI * 3;
        const s = max(0.05, 1 - 0.75 * e); V.scale.set(s, 1, s);
        placeHands(1, 1, 0.9 * e);
        if (k - lastP > 0.15 && k < 1) { lastP = k; fx.dust(victimPos.clone().setY(0.03), { count: c.n(6), colors: dirt, speed: [0.5, 1.5], up: 0.8 }); }
      }, kit.ease.quadIn);
      V.visible = false; U.park(hands);
      // grave closes, a tombstone pops up
      fx.smoke(victimPos.clone().setY(0.1), { count: c.n(10), colors: ['#3a3040', '#5a5060'], alpha: 0.5 });
      tomb.visible = true; tomb.position.copy(victimPos); facing(tomb, c.color === 'w' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 0, -1));
      await Promise.all([
        c.tween(220, e => gr.scale.setScalar(max(0.01, 1 - e)), kit.ease.quadIn),
        c.tween(260, (e, k) => { tomb.scale.set(1, max(0.01, e), 1); tomb.rotation.z = 0.25 * sin(k * PI * 2) * (1 - k); }, kit.ease.backOut),
      ]);
      gr.visible = false;
      // attacker hops on top and stomps it into the ground
      const a0 = A.position.clone(), top = victimPos.clone(); top.y = 0.62;
      await c.tween(300, (e, k) => { kit.arc(A.position, a0, top, 0.5, e); }, kit.ease.sineInOut);
      fx.dust(victimPos.clone().setY(0.05), { count: c.n(26), colors: ['#8a8070', '#6c6458', '#a59b88'], speed: [1, 2.6], up: 0.4 });
      fx.ring(victimPos, { radius: 1.0, color: S.light });
      kit.shake(c, 0.08, 200);
      await c.tween(160, e => { tomb.scale.set(1 + 0.2 * e, max(0.01, 1 - e), 1 + 0.2 * e); A.position.y = 0.62 * (1 - e); }, kit.ease.quadIn);
      tomb.visible = false;
      A.position.copy(c.to);
      await kit.squash(c, A, 0.25, 90);
    }, { zoom: 0.8, tilt: 0.2 });
  } finally { U.park(gr, hands, tomb); U.finish(c); }
}
grave.label = 'grave snatch';
const graveCrypt = Object.assign(c => grave(c), { only: ['r', 'k'], weight: 2, label: 'grave snatch (crypt/king)' });

/** Bat swarm: bats burst out, circle the victim, lift it and carry it off the board. */
export async function bats(ctx) {
  const c = U.prep(ctx, 2950);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const im = U.take(c, 'h.bats');
  const n = c.lite ? 14 : BATS;
  const src = A.position.clone().setY(hA * 0.8);
  const bs = [];
  for (let i = 0; i < n; i++) bs.push({ ph: R(0, PI * 2), r: R(0.35, 0.75), h: R(0.25, hV + 0.35), sp: R(5, 8) * (i % 2 ? 1 : -1), flap: R(20, 30),
    s: R(0.8, 1.25), p: src.clone(), q: new THREE.Quaternion(), prev: src.clone(), ox: R(-1, 1), oz: R(-1, 1) });
  const _d = new THREE.Vector3(), _e = new THREE.Euler();
  let T = 0;
  const draw = () => {
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      _d.subVectors(b.p, b.prev); b.prev.copy(b.p);
      if (_d.lengthSq() > 1e-8) b.yaw = Math.atan2(_d.x, _d.z);
      _e.set(0.0, b.yaw || 0, sin(T * b.sp) * 0.3);
      b.q.setFromEuler(_e);
      const f = 0.35 + 0.65 * Math.abs(sin(T * b.flap + b.ph));      // wing beat = span squash
      U._m4.compose(b.p, b.q, U._s.set(b.s * 1.6 * f, b.s * 1.6, b.s * 1.6));
      im.setMatrixAt(i, U._m4);
    }
    im.count = bs.length; im.instanceMatrix.needsUpdate = true;
  };
  try {
    await U.focus(c, async () => {
      // the attacker shudders, the swarm bursts out of it
      await c.tween(150, (e, k) => { const s = sin(k * PI) * 0.18; A.scale.set(1 + s * 0.5, 1 - s, 1 + s * 0.5); });
      fx.smoke(src, { count: c.n(10), colors: ['#2a1838', '#3a2050'], alpha: 0.6, size: [0.25, 0.4] });
      fx.sparkles(src, { count: c.n(12), colors: S.wisp, speed: [0.8, 2] });
      await U.sim(c, 300, (dt, k) => {
        T += dt / 1000;
        for (const b of bs) b.p.set(src.x + b.ox * 0.9 * k + cos(b.ph + T * b.sp) * 0.25 * k, src.y + 0.3 * k + 0.2 * sin(b.ph), src.z + b.oz * 0.9 * k + sin(b.ph + T * b.sp) * 0.25 * k);
        draw();
      });
      // stream over and form a vortex around the victim
      const start = bs.map(b => b.p.clone());
      await U.sim(c, 320, (dt, k) => {
        T += dt / 1000; const e = kit.ease.quadInOut(k);
        bs.forEach((b, i) => {
          const a = b.ph + T * b.sp;
          const tgt = _d.set(victimPos.x + cos(a) * b.r, b.h, victimPos.z + sin(a) * b.r);
          b.p.lerpVectors(start[i], tgt, e);
        });
        draw();
      });
      kit.flashObject(c, V, S.main, 300, 1.2);
      // vortex lifts the victim
      let lastW = 0;
      await U.sim(c, 460, (dt, k) => {
        T += dt / 1000;
        V.position.y = 0.45 * kit.ease.quadOut(k); V.rotation.y += dt / 1000 * 9;
        kit.setLean(V, dir, 0.15 * sin(k * PI * 4), V.rotation.y);
        bs.forEach(b => { const a = b.ph + T * b.sp, r = b.r * (1 - 0.35 * k); b.p.set(victimPos.x + cos(a) * r, b.h + 0.45 * k, victimPos.z + sin(a) * r); });
        if (k - lastW > 0.1 && k < 1) { lastW = k; fx.burst({ pos: victimPos.clone().setY(0.4 + 0.5 * k), count: c.n(4), colors: S.wisp, speed: [0.6, 1.4], up: 0.4, life: [300, 500], size: [0.05, 0.09], shape: 1 }); }
        draw();
      });
      // carry it off over the board edge (continuing in the attack direction)
      const v0 = V.position.clone();
      const tEdge = min(...['x', 'z'].map(ax => (dir[ax] ? (Math.sign(dir[ax]) * 5.8 - v0[ax]) / dir[ax] : Infinity)));
      const end = v0.clone().addScaledVector(dir, max(2.5, tEdge)); end.y = 2.6;
      const q0 = V.quaternion.clone();
      await Promise.all([
        U.sim(c, 640, (dt, k) => {
          T += dt / 1000; const e = kit.ease.quadIn(k);
          V.position.lerpVectors(v0, end, e); V.quaternion.copy(q0);
          const s = max(0.01, 1 - 0.5 * k); V.scale.setScalar(s);
          bs.forEach(b => { const a = b.ph + T * b.sp, r = b.r * 0.65; b.p.set(V.position.x + cos(a) * r, V.position.y + b.h * 0.6, V.position.z + sin(a) * r); });
          draw();
        }).then(() => { V.visible = false; }),
        c.wait(180).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.3, squash: 0.2 })),
      ]);
    }, { zoom: 0.85, tilt: 0.2 });
  } finally { U.park(im); U.finish(c); }
}
bats.label = 'bat swarm';
const batsQueen = Object.assign(c => bats(c), { only: ['q', 'n'], weight: 2, label: 'bat swarm (countess/nightmare)' });

/** Possession: a ghost loops into the victim, which shudders, glows and dissolves into wisps. */
export async function possession(ctx) {
  const c = U.prep(ctx, 2930);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const g = U.take(c, 'h.ghost');
  const [glow, gb] = g.children;
  gb.material.color.set(c.color === 'w' ? '#ffe0b0' : '#d0ffc8'); gb.material.opacity = 0.85;
  glow.material.color.set(S.main);
  const start = A.position.clone().setY(hA * 0.6);
  g.position.copy(start); g.scale.setScalar(0.01); facing(g, dir);
  try {
    await U.focus(c, async () => {
      // rise out of the attacker
      kit.flashObject(c, A, S.main, 400, 1.0);
      await c.tween(260, (e, k) => { g.scale.setScalar(0.01 + 1.59 * e); g.position.y = start.y + 0.45 * e; }, kit.ease.backOut);
      // loop over to the victim: a sideways bezier (reads as a swoop from Top)
      const p0 = g.position.clone(), p3 = victimPos.clone().setY(hV * 0.55);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(R(0.9, 1.4) * (Math.random() < 0.5 ? 1 : -1));
      const p1 = p0.clone().add(perp).setY(p0.y + 0.8), p2 = p3.clone().add(perp.clone().multiplyScalar(-0.6)).setY(p3.y + 0.9);
      const bez = (t, o) => o.set(0, 0, 0).addScaledVector(p0, (1 - t) ** 3).addScaledVector(p1, 3 * (1 - t) ** 2 * t).addScaledVector(p2, 3 * (1 - t) * t * t).addScaledVector(p3, t ** 3);
      const prev = p0.clone(); let lastW = 0;
      await c.tween(470, (e, k) => {
        bez(e, g.position);
        const d = g.position.clone().sub(prev); if (d.lengthSq() > 1e-7) g.rotation.set(0, Math.atan2(d.x, d.z), 0);
        prev.copy(g.position);
        if (k - lastW > 0.06 && k < 1) {
          lastW = k;
          fx.burst({ pos: g.position.clone().setY(g.position.y + 0.1), count: c.n(4), colors: S.wisp, speed: [0.05, 0.3], up: 0.2, life: [300, 600],
            size: [0.14, 0.24], sizeEnd: 0.2, gravity: -0.4, drag: 2, shape: 0, alpha: 0.7 });
        }
      }, kit.ease.sineInOut);
      // dive in
      await c.tween(140, e => { g.scale.setScalar(max(0.01, 1.6 * (1 - e))); g.position.y = p3.y - 0.3 * e; }, kit.ease.quadIn);
      g.visible = false;
      fx.flash(p3, { color: S.light, radius: 1.3 });
      fx.ring(victimPos, { radius: 0.9, color: S.main });
      kit.flashObject(c, V, S.main, 900, 2.0);
      fx.boardFlash(S.main, 700, 0.3);
      // possessed: violent shudder, lifts and spins
      const v0 = V.position.clone(); let lastS = 0;
      await c.tween(440, (e, k) => {
        const a = 0.06 * (k < 1 ? 1 : 0);
        V.position.set(v0.x + R(-a, a), 0.3 * e, v0.z + R(-a, a));
        kit.setLean(V, dir, 0.25 * sin(k * PI * 9), e * PI * 2);
        if (k - lastS > 0.12 && k < 1) { lastS = k; fx.sparkles(V.position.clone().setY(hV * 0.7), { count: c.n(6), colors: S.wisp, speed: [0.5, 1.4], life: [300, 500] }); }
      }, kit.ease.quadOut);
      // dissolve upward into wisps
      fx.burst({ pos: V.position.clone().setY(hV * 0.5), count: c.n(40), colors: S.wisp, speed: [0.3, 1.2], up: 2.2, spread: 0.5, life: [600, 1100],
        size: [0.2, 0.36], sizeEnd: 1.8, gravity: -1.5, drag: 1.8, shape: 0, alpha: 0.75, jitter: 0.2 });
      fx.sparkles(V.position.clone().setY(hV * 0.6), { count: c.n(24), colors: S.wisp, speed: [0.8, 2.2] });
      fx.ring(victimPos, { radius: 1.4, color: S.light, ms: 450 });
      const y0 = V.position.y;
      await Promise.all([
        c.tween(440, (e, k) => {
          const s = max(0.02, 1 - e); V.scale.set(s, 1 + 0.9 * e, s); V.position.y = y0 + 0.6 * e;
          kit.setLean(V, dir, 0, PI * 2 + e * PI * 4);
        }, kit.ease.quadIn).then(() => { V.visible = false; }),
        c.wait(160).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.3, squash: 0.2 })),
      ]);
    }, { zoom: 0.82, tilt: 0.2 });
  } finally { U.park(g); U.finish(c); }
}
possession.label = 'ghostly possession';
const possessionWitch = Object.assign(c => possession(c), { only: ['b', 'q'], weight: 2, label: 'possession (witch/countess)' });

/** Pumpkin bomb: lobbed with a sparking fuse, bounces, BOOM — seeds and goo everywhere. */
export async function pumpkin(ctx) {
  const c = U.prep(ctx, 2670);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const pk = U.take(c, 'h.pumpkin');
  const glow = pk.children[1]; glow.material.color.set('#ffb02a');
  pk.scale.setScalar(0.01); facing(pk, dir.clone().negate());
  const fuse = () => pk.localToWorld(new THREE.Vector3(0.08, 0.27, 0));
  try {
    await U.focus(c, async () => {
      // crouch and conjure the pumpkin over the attacker's head
      const top = A.position.clone().setY(hA + 0.25);
      pk.position.copy(top);
      await c.tween(200, (e, k) => { A.scale.set(1 + 0.12 * e, 1 - 0.16 * e, 1 + 0.12 * e); pk.scale.setScalar(0.01 + 1.29 * e); }, kit.ease.backOut);
      fx.sparkles(top, { count: c.n(10), colors: S.wisp, speed: [0.5, 1.4] });
      // lob it: high arc, tumbling, fuse spitting sparks
      const land = victimPos.clone().addScaledVector(dir, -0.45).setY(0.16);
      let lastF = 0;
      await c.tween(440, (e, k) => {
        if (k < 0.3) A.scale.set(1.12 - 0.12 * (k / 0.3), 0.84 + 0.16 * (k / 0.3), 1.12 - 0.12 * (k / 0.3));
        kit.arc(pk.position, top, land, 1.1, e); pk.rotation.x = -k * PI * 2;
        if (k - lastF > 0.06 && k < 1) { lastF = k; fx.sparks(fuse(), { count: c.n(4), speed: [0.5, 1.5], life: [150, 300], gravity: 2 }); }
      }, kit.ease.linear);
      A.scale.set(1, 1, 1); pk.rotation.x = 0;
      // bounce twice toward the victim; the victim leans away in fear
      const l0 = land.clone(), l1 = victimPos.clone().addScaledVector(dir, -0.25).setY(0.16);
      fx.dust(l0.clone().setY(0.03), { count: c.n(8), colors: ['#8a8070', '#6c6458'], speed: [0.4, 1], up: 0.3 });
      let lastF2 = 0;
      await c.tween(330, (e, k) => {
        kit.arc(pk.position, l0, l1, k < 0.6 ? 0.25 : 0.1, e);
        const pulse = 1.3 * (1 + 0.15 * Math.abs(sin(k * PI * 6)) * k);
        pk.scale.setScalar(pulse);
        glow.scale.setScalar(0.9 + 0.8 * k * Math.abs(sin(k * 30)));
        kit.setLean(V, dir, 0.25 * kit.ease.quadOut(k));
        if (k - lastF2 > 0.05 && k < 1) { lastF2 = k; fx.sparks(fuse(), { count: c.n(6), speed: [0.8, 2], life: [150, 300], gravity: 2 }); }
      }, kit.ease.quadOut);
      // BOOM
      pk.visible = false;
      const boom = victimPos.clone().addScaledVector(dir, -0.2).setY(0.3);
      fx.explosion(boom, { scale: 1.15, flashColor: c.color === 'w' ? '#ffb347' : '#a6ff6a', debrisColors: ['#e8781a', '#c85a0a', '#3d6a1e', ...body(c.victimColor).slice(0, 2)] });
      // seeds (cream, tumbling) and goo splats (side colour)
      fx.burst({ pos: boom, count: c.n(40), colors: ['#f6ead0', '#e8d8b0', '#fff8e6'], speed: [2, 5], up: 1.5, spread: 1, life: [500, 900],
        size: [0.04, 0.06], sizeEnd: 0.8, gravity: 9, drag: 1, shape: 1, blend: 'normal' });
      fx.burst({ pos: boom, count: c.n(26), colors: S.goo, speed: [1.5, 4], up: 1.2, spread: 1, life: [500, 900],
        size: [0.1, 0.2], sizeEnd: 1.3, gravity: 9, drag: 1.2, shape: 0, blend: 'normal', alpha: 0.95 });
      fx.burst({ pos: boom, count: c.n(20), colors: S.goo, speed: [2, 5], up: 1, spread: 1, life: [250, 500], size: [0.08, 0.14], sizeEnd: 0.3, gravity: 6, shape: 1 });
      fx.boardFlash(S.main, 340, 0.28);
      kit.shake(c, 0.17, 360);
      kit.flashObject(c, V, '#ffffff', 160);
      // victim blown sky-high, tumbling, and gone
      const v0 = V.position.clone(), axis = kit.tiltAxis(dir), drift = dir.clone().multiplyScalar(1.2);
      await Promise.all([
        c.tween(620, (e, k) => {
          V.position.set(v0.x + drift.x * k, 3.4 * sin(k * PI * 0.6), v0.z + drift.z * k);
          V.quaternion.setFromAxisAngle(axis, k * PI * 3.5);
          const s = max(0.01, 1 - 0.8 * k * k); V.scale.setScalar(s);
        }).then(() => { V.visible = false; fx.smoke(V.position.clone(), { count: c.n(6), colors: ['#3a3040', '#5a5060'], alpha: 0.5 }); }),
        c.wait(300).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.35, squash: 0.25 })),
      ]);
    }, { zoom: 0.82, tilt: 0.2 });
  } finally { U.park(pk); U.finish(c); }
}
pumpkin.label = 'pumpkin bomb';
const pumpkinImp = Object.assign(c => pumpkin(c), { only: ['p', 'k'], weight: 2, label: 'pumpkin bomb (imp/king)' });

export const battleAnims = [grave, graveCrypt, bats, batsQueen, possession, possessionWitch, pumpkin, pumpkinImp];
