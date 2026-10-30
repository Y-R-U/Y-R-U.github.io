// Fantasy battle (capture) animations — owner: battle-1. See docs/notes/battle.md.
// Four battles, picked at random (with type-biased variants: casters favour the arcane bolt,
// knights/rooks/pawns the sword clash, royals the sky strike):
//  - arcane:  the attacker levitates and charges an orb, lightning arcs into the victim, which
//             shatters into crystal shards in its own colours            (~1.9 s at 1×)
//  - clash:   duel — two blade exchanges with sparks, a sweeping slash arc, the victim is
//             knocked tumbling off the board edge (pawns shoulder-shove)  (~2.3 s)
//  - dragon:  dragon-fire breath (blue-white arcane flame for white, red-orange for black);
//             the victim chars black and crumbles to ash and embers, scorch decal fades (~2.1 s)
//  - smite:   a rune circle locks on, then a holy light pillar (white) or a flaming meteor
//             (black) slams down: explosion, debris, camera shake          (~2.1 s)
// Side colours: white = blue + gold, black = red + black. Everything reads from Top view: the
// motion is across the board (bolts, shards, slash arcs, rune circles, rings), not just up/down.
// D24: a ctx cap (capMs / battleCapMs / timedCap) time-compresses the whole battle (prep()).
import * as U from '../battle_util.js';

const { THREE, PI, sin, cos, min, max, R } = U;

// ------------------------------------------------------------------ colours
const SIDE = {
  w: { main: '#4f9dff', light: '#bfe3ff', deep: '#1f56e0', gold: '#ffd36a', bolt: '#5aa8ff',
       spark: ['#ffffff', '#bfe3ff', '#6fb4ff', '#ffe08a'], fire: ['#e8f6ff', '#8fd0ff', '#3a8cff', '#1f5fff', '#1a3fc0'] },
  b: { main: '#ff3a24', light: '#ffb08a', deep: '#a8100c', gold: '#ffb347', bolt: '#ff4a2a',
       spark: ['#ffffff', '#ffb08a', '#ff4a2a', '#ffd08a'], fire: ['#fff3b0', '#ffb43a', '#ff6a1a', '#e8361a', '#a8100c'] },
};
const side = c => SIDE[c] || SIDE.w;
/** Victim body colours (shards, debris): ivory/gold/blue vs ebony/gold/red. */
const BODY = { w: ['#f2e8d5', '#e9dcc0', '#f2c66d', '#2f6fe0'], b: ['#2a201b', '#3a2e27', '#c9a35a', '#d4262e'] };
const body = c => BODY[c] || BODY.w;

// ------------------------------------------------------------------ assets
const radialTex = U.once(() => makeCanvasTex(64, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
}));
const runeTex = U.once(() => makeCanvasTex(256, (g, w) => {
  const c = w / 2;
  g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineCap = 'round';
  const circ = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(c, c, r, 0, PI * 2); g.stroke(); };
  circ(w * 0.47, 6); circ(w * 0.40, 3); circ(w * 0.22, 4);
  // two interlocked triangles (hexagram)
  g.lineWidth = 4;
  for (const off of [0, PI]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = off - PI / 2 + i * PI * 2 / 3; g[i ? 'lineTo' : 'moveTo'](c + cos(a) * w * 0.40, c + sin(a) * w * 0.40); }
    g.stroke();
  }
  // rune glyphs between the outer circles
  g.lineWidth = 3;
  for (let i = 0; i < 16; i++) {
    const a = i * PI / 8, r0 = w * 0.415, r1 = w * 0.455;
    g.beginPath(); g.moveTo(c + cos(a) * r0, c + sin(a) * r0); g.lineTo(c + cos(a + 0.06) * r1, c + sin(a + 0.06) * r1);
    if (i % 2) { g.lineTo(c + cos(a + 0.12) * r0, c + sin(a + 0.12) * r0); }
    g.stroke();
  }
  // soft inner glow
  const r = g.createRadialGradient(c, c, 0, c, c, w * 0.22);
  r.addColorStop(0, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.beginPath(); g.arc(c, c, w * 0.22, 0, PI * 2); g.fill();
}));
function makeCanvasTex(size, draw) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const ADD = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

const shardAssets = U.once(() => {
  const g = new THREE.OctahedronGeometry(0.075, 0); g.scale(1, 2.1, 0.8);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.35, flatShading: true, emissive: '#202838', emissiveIntensity: 1 });
  return { g, m };
});
const slashAssets = U.once(() => {
  const g = new THREE.RingGeometry(0.5, 0.86, 40, 1, 0, PI * 1.15); g.rotateX(-PI / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    let a = Math.atan2(-pos.getZ(i), pos.getX(i)); if (a < 0) a += PI * 2;
    const t = min(1, a / (PI * 1.15)), r = Math.hypot(pos.getX(i), pos.getZ(i));
    const edge = 1 - Math.abs((r - 0.68) / 0.18);                 // bright in the middle of the band
    const v = t * t * (0.35 + 0.65 * max(0, edge));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { g, m: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide }) };
});
const beamAssets = U.once(() => {
  const g = new THREE.CylinderGeometry(0.42, 0.42, 10, 28, 6, true); g.translate(0, 5, 0);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const v = (1 - pos.getY(i) / 10) ** 1.5; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return { g, m: new THREE.MeshBasicMaterial({ ...ADD, vertexColors: true, side: THREE.DoubleSide, color: '#fff2c8' }) };
});
const meteorAssets = U.once(() => {
  const g = new THREE.IcosahedronGeometry(0.3, 1);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3);
  // jitter shared corners consistently (non-indexed geometry: key by rounded position)
  const off = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!off.has(k)) off.set(k, [R(0.82, 1.15), Math.random() < 0.14]);
    const [s, hot] = off.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
    const c = hot ? [1.0, 0.45, 0.08] : [0.16, 0.11, 0.09];
    col.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  return { g, m: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, emissive: '#ff4a10', emissiveIntensity: 0.25 }) };
});
const glowMat = U.once(() => new THREE.SpriteMaterial({ map: radialTex(), ...ADD, color: '#ffffff' }));
const glowMat2 = U.once(() => new THREE.SpriteMaterial({ map: radialTex(), ...ADD, color: '#ff8a3a' }));
const runeMat = U.once(() => new THREE.MeshBasicMaterial({ map: runeTex(), ...ADD, color: '#4f9dff', side: THREE.DoubleSide }));
const runeGeo = U.once(() => new THREE.PlaneGeometry(1, 1).rotateX(-PI / 2));

const SHARDS = 36;
U.definePool({
  'f.shards': () => {
    const { g, m } = shardAssets();
    const im = new THREE.InstancedMesh(g, m, SHARDS);
    im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHARDS * 3).fill(1), 3);
    im.frustumCulled = false; return im;
  },
  'f.orb': () => { const s = new THREE.Sprite(glowMat()); s.renderOrder = 6; return s; },
  'f.slash': () => { const { g, m } = slashAssets(); const o = new THREE.Mesh(g, m); o.renderOrder = 6; return o; },
  'f.rune': () => { const o = new THREE.Mesh(runeGeo(), runeMat()); o.renderOrder = 4; return o; },
  'f.beam': () => { const { g, m } = beamAssets(); const o = new THREE.Mesh(g, m); o.renderOrder = 6; return o; },
  'f.meteor': () => {
    const { g, m } = meteorAssets(); const grp = new THREE.Group();
    grp.add(new THREE.Mesh(g, m));
    const s = new THREE.Sprite(glowMat2()); s.scale.setScalar(1.6); s.renderOrder = 6; grp.add(s);
    return grp;
  },
});

// ------------------------------------------------------------------ helpers
const head = (P, h, k = 0.85) => P.position.clone().setY(P.position.y + h * k);
function jitter(c, obj, ms, amp = 0.04) {
  const p0 = obj.position.clone();
  return c.tween(ms, (e, k) => {
    const a = amp * (k < 1 ? 1 - k * 0.3 : 0);
    obj.position.set(p0.x + (k < 1 ? R(-a, a) : 0), p0.y, p0.z + (k < 1 ? R(-a, a) : 0));
  });
}

/** Shatter V into crystal shards in its colours, flying outward (mostly horizontal: reads from Top). */
async function shatter(c, V, { ms = 650, speed = [1.6, 3.6], away = null } = {}) {
  const im = U.take(c, 'f.shards');
  const cols = body(c.victimColor).map(h => new THREE.Color(h));
  const h = U.vh(V), n = c.lite ? 22 : SHARDS, base = V.position.clone();
  const items = [];
  for (let i = 0; i < n; i++) {
    const a = R(0, PI * 2), sp = R(speed[0], speed[1]);
    const v = new THREE.Vector3(cos(a) * sp, R(1.2, 3.6), sin(a) * sp);
    if (away) v.addScaledVector(away, R(0.6, 1.6));
    items.push({ p: base.clone().add(new THREE.Vector3(R(-0.15, 0.15), R(0.1, h * 0.95), R(-0.15, 0.15))), v,
      ax: new THREE.Vector3(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), a: R(0, 6), av: R(8, 18), s: R(0.7, 1.5) });
    im.setColorAt(i, cols[i % cols.length]);
  }
  im.instanceColor.needsUpdate = true;
  V.visible = false;
  try {
    await U.sim(c, ms, (dt, k) => {
      const s = dt / 1000;
      for (const it of items) {
        it.v.y -= 9.8 * s; it.p.addScaledVector(it.v, s); it.a += it.av * s;
        if (it.p.y < 0.04) { it.p.y = 0.04; it.v.y *= -0.35; it.v.x *= 0.55; it.v.z *= 0.55; it.av *= 0.5; }
      }
      U.writeInstances(im, items, it => it.s * (k > 0.65 ? max(0.01, 1 - (k - 0.65) / 0.35) : 1));
    });
  } finally { U.park(im); }
}

// ===================================================================== battles
/** Arcane bolt: levitate, charge an orb, lightning, the victim shatters into crystal. */
export async function arcane(ctx) {
  const c = U.prep(ctx, 2520);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const orb = U.take(c, 'f.orb'); orb.material.color.set(S.main); orb.scale.setScalar(0.01);
  try {
    await U.focus(c, async () => {
      const a0 = A.position.clone();
      fx.ring(a0, { radius: 0.7, color: S.main });
      // charge: levitate + one slow turn; orb grows over the head with in-falling sparkles
      let last = 0;
      await c.tween(430, (e, k) => {
        A.position.y = a0.y + 0.28 * e; A.rotation.y = e * PI * 2;
        const op = head(A, hA, 1.0); op.y += 0.18; orb.position.copy(op);
        orb.scale.setScalar(0.05 + 0.85 * e * (1 + 0.12 * sin(k * 40)));
        if (k - last > 0.12 && k < 1) { last = k; fx.sparkles(op, { count: c.n(6), colors: S.spark, speed: [0.2, 0.7], up: 0, life: [200, 380], size: [0.05, 0.1] }); }
      }, kit.ease.quadOut);
      A.rotation.y = 0;
      // bolt(s)
      const from = orb.position.clone(), to = victimPos.clone().setY(hV * 0.6);
      fx.lightning(from, to, { color: S.bolt, width: 0.09, branches: 2, ms: 340 });
      fx.boardFlash(S.main, 380, 0.35);
      kit.flashObject(c, V, S.light, 380, 2.2);
      fx.sparkles(to, { count: c.n(20), colors: S.spark, speed: [1, 2.6] });
      await jitter(c, V, 140, 0.05);
      fx.lightning(from, to.clone().setY(hV * 0.35), { color: S.light, width: 0.05, branches: 1, ms: 220 });
      await c.tween(160, e => { V.position.y = 0.12 * e; orb.scale.setScalar(0.9 * (1 - 0.6 * e)); });
      // shatter
      fx.flash(to, { color: '#ffffff', radius: 1.6, ms: 240 });
      fx.ring(victimPos, { radius: 1.3, color: S.main });
      fx.sparkles(to, { count: c.n(26), colors: [...S.spark, ...body(c.victimColor).slice(0, 2)], speed: [1.5, 3.5], life: [400, 800] });
      kit.shake(c, 0.08, 240);
      await Promise.all([
        shatter(c, V, { ms: 660 }),
        c.tween(160, e => orb.scale.setScalar(0.36 * (1 - e) + 0.01)),
        c.wait(160).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.35, squash: 0.2 })),
      ]);
    }, { zoom: 0.8, tilt: 0.18 });
  } finally { U.park(orb); U.finish(c); }
}
arcane.label = 'arcane bolt & crystal shatter';
const arcaneCaster = Object.assign(c => arcane(c), { only: ['b', 'q'], weight: 2, label: 'arcane bolt (caster)' });

/** Sword clash: two exchanges with sparks, a sweeping slash arc, the victim tumbles off the board. */
export async function clash(ctx) {
  const c = U.prep(ctx, 3160);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const slash = U.take(c, 'f.slash'); slash.visible = false;
  try {
    await U.focus(c, async () => {
      const stand = victimPos.clone().addScaledVector(dir, -0.88);
      if (c.type === 'n') await kit.hopTo(c, A, stand, { ms: 280, height: 0.6, squash: 0.15 });   // knight charges in
      else await kit.slideTo(c, A, stand, { ms: 230 });
      const a0 = A.position.clone(), v0 = V.position.clone();
      for (let i = 0; i < 2; i++) {
        // both rear back, then meet in the middle
        await c.tween(110, e => { kit.setLean(A, dir, -0.3 * e); kit.setLean(V, dir, 0.3 * e); }, kit.ease.quadOut);
        await c.tween(70, e => {
          A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.2), e); V.position.lerpVectors(v0, v0.clone().addScaledVector(dir, -0.12), e);
          kit.setLean(A, dir, -0.3 + 0.6 * e); kit.setLean(V, dir, 0.3 - 0.55 * e);
        }, kit.ease.quadIn);
        const hit = a0.clone().lerp(v0, 0.5); hit.y = 0.55 + 0.15 * i;
        fx.sparks(hit, { count: c.n(50), colors: [...S.spark, '#ffd36a', S.main], dir: new THREE.Vector3(-dir.z, 0.6, dir.x).multiplyScalar(i ? -1 : 1), spread: 1.1, speed: [2.5, 6], size: [0.08, 0.15] });
        fx.flash(hit, { color: i ? S.main : '#ffd36a', radius: 1.4, ms: 200 });
        fx.ring(hit.clone().setY(0), { radius: 0.8, color: i ? S.main : '#ffd36a', ms: 300 });
        kit.shake(c, 0.05, 160);
        await c.tween(100, e => {
          A.position.lerpVectors(a0.clone().addScaledVector(dir, 0.2), a0, e); V.position.lerpVectors(v0.clone().addScaledVector(dir, -0.12), v0, e);
          kit.setLean(A, dir, 0.3 * (1 - e)); kit.setLean(V, dir, -0.25 * (1 - e));
        }, kit.ease.quadOut);
      }
      A.quaternion.identity(); V.quaternion.identity();
      // final strike: wind up, then a slash arc sweeps through the victim (pawns shoulder-shove)
      await c.tween(150, e => { kit.setLean(A, dir, -0.4 * e); A.scale.set(1 + 0.1 * e, 1 - 0.12 * e, 1 + 0.1 * e); }, kit.ease.quadOut);
      const hitPos = victimPos.clone(); hitPos.y = min(0.9, hV * 0.55);
      const yaw = Math.atan2(dir.x, dir.z);
      if (c.type !== 'p') {
        slash.visible = true; slash.material.color.set(S.main); slash.material.opacity = 1;
        slash.position.set(victimPos.x, hitPos.y, victimPos.z);
      }
      await c.tween(170, e => {
        kit.setLean(A, dir, -0.4 + 0.75 * e); A.scale.set(1.1 - 0.1 * e, 0.88 + 0.12 * e, 1.1 - 0.1 * e);
        A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.35), e);
        slash.rotation.set(0, yaw + PI * 0.4 - e * PI * 1.1, 0.18);
        slash.scale.setScalar(1.0 + 0.7 * e);
      }, kit.ease.cubicOut);
      fx.sparks(hitPos, { count: c.n(80), colors: [...S.spark, '#ffd36a', S.main], dir: dir.clone().setY(0.5), speed: [3, 7.5], size: [0.08, 0.16] });
      fx.flash(hitPos, { color: S.light, radius: 1.5, ms: 220 });
      fx.ring(victimPos, { radius: 1.1, color: S.main });
      fx.boardFlash(S.main, 300, 0.3);
      kit.flashObject(c, V, '#ffffff', 160);
      kit.shake(c, 0.12, 280);
      await Promise.all([
        c.tween(240, e => { slash.material.opacity = 1 - e; slash.scale.setScalar(1.7 + 0.4 * e); }).then(() => { slash.visible = false; }),
        U.tumbleOff(c, V, dir, { ms: 720, lift: 1.9 }),
        c.tween(120, e => { kit.setLean(A, dir, 0.35 * (1 - e)); }).then(() => kit.hopTo(c, A, c.to, { ms: 260, height: 0.3, squash: 0.2 })),
      ]);
    }, { zoom: 0.85, tilt: 0.2 });
  } finally { U.park(slash); U.finish(c); }
}
clash.label = 'sword clash & knock-back';
const clashMelee = Object.assign(c => clash(c), { only: ['n', 'r', 'p', 'k'], weight: 1, label: 'sword clash (melee)' });

/** Dragon-fire breath: a flame stream chars the victim, which crumbles into ash and embers. */
export async function dragon(ctx) {
  const c = U.prep(ctx, 2910);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  try {
    await U.focus(c, async () => {
      const d = kit.flatDist(A.position, victimPos);
      if (d > 1.6) await kit.slideTo(c, A, victimPos.clone().addScaledVector(dir, -1.5), { ms: 240 });
      // rear back and inhale (embers sucked toward the mouth)
      const mouth = () => A.position.clone().addScaledVector(dir, 0.28).setY(A.position.y + hA * 0.8);
      await c.tween(200, e => kit.setLean(A, dir, -0.35 * e), kit.ease.quadOut);
      fx.burst({ pos: mouth().addScaledVector(dir, 0.6), count: c.n(14), colors: S.fire.slice(1, 3), speed: [0.3, 0.8], dir: dir.clone().negate(), spread: 0.6, life: [200, 300], size: [0.04, 0.07], shape: 1 });
      // breath: stream of flame particles along dir, victim engulfed and charring
      fx.boardFlash(S.fire[3], 600, 0.3);
      const target = victimPos.clone().setY(hV * 0.5);
      let lastE = 0, lastF = 0;
      const char = U.darken(c, V, '#140c08', 650, 0.88);
      kit.flashObject(c, V, S.fire[2], 650, 1.3);
      await Promise.all([char, c.tween(720, (e, k) => {
        kit.setLean(A, dir, -0.35 + 0.5 * min(1, k * 4) + 0.03 * sin(k * 60));
        if (k - lastE > 0.035 && k < 1) {
          lastE = k;
          const m = mouth(), aim = target.clone().sub(m).normalize();
          fx.burst({ pos: m, count: c.n(7), colors: S.fire, speed: [4.5, 7.5], dir: aim, spread: 0.2, life: [220, 360],
            size: [0.2, 0.38], sizeEnd: 2.4, gravity: -2, drag: 1.2, shape: 0 });
          fx.burst({ pos: m, count: c.n(2), colors: [S.fire[0]], speed: [5, 7], dir: aim, spread: 0.06, life: [160, 260], size: [0.1, 0.18], sizeEnd: 1.5, drag: 1, shape: 1 });
        }
        if (k - lastF > 0.14 && k > 0.15 && k < 1) {
          lastF = k;
          fx.fire(victimPos.clone().setY(R(0.05, hV * 0.5)), { scale: 0.8, count: c.n(18), colors: S.fire.slice(0, 4) });
          fx.embers(victimPos.clone().setY(0.2), { count: c.n(5), colors: S.fire.slice(1, 4) });
        }
        V.position.set(victimPos.x + R(-0.02, 0.02) * (k < 1), 0, victimPos.z + R(-0.02, 0.02) * (k < 1));
      })]);
      fx.ring(victimPos, { radius: 1.0, color: S.fire[2] });
      // crumble: collapse to ash, embers rise, scorch
      fx.scorch(victimPos, { radius: 0.62, ms: 2800 });
      fx.dust(victimPos.clone().setY(hV * 0.4), { count: c.n(36), colors: ['#1a1310', '#2e2620', '#4a4038', '#0c0908'], speed: [0.4, 1.6], up: 0.6, life: [500, 900] });
      fx.embers(victimPos.clone().setY(0.3), { count: c.n(26), colors: S.fire.slice(1, 4), radius: 0.35 });
      fx.smoke(victimPos.clone().setY(0.3), { count: c.n(10), colors: ['#2c2622', '#4a4440'], alpha: 0.55 });
      kit.shake(c, 0.05, 200);
      await Promise.all([
        c.tween(460, e => { V.scale.set(1 + 0.25 * e, max(0.02, 1 - e), 1 + 0.25 * e); V.position.y = -0.05 * e; }, kit.ease.quadIn).then(() => { V.visible = false; }),
        c.tween(150, e => kit.setLean(A, dir, 0.15 * (1 - e))).then(() => c.wait(80)).then(() => kit.hopTo(c, A, c.to, { ms: 280, height: 0.32, squash: 0.2 })),
      ]);
    }, { zoom: 0.82, tilt: 0.18 });
  } finally { U.finish(c); }
}
dragon.label = 'dragon-fire breath';
const dragonKnight = Object.assign(c => dragon(c), { only: ['n', 'k'], weight: 1, label: 'dragon-fire (knight/king)' });

/** Sky strike: rune circle locks on, then a holy pillar (white) or meteor (black) slams down. */
export async function smite(ctx) {
  const c = U.prep(ctx, 2460);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hV = U.vh(V), holy = c.color === 'w';
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const rune = U.take(c, 'f.rune'), beam = U.take(c, 'f.beam'), met = U.take(c, 'f.meteor');
  rune.visible = false; beam.visible = false; met.visible = false;
  try {
    await U.focus(c, async () => {
      // attacker raises up (call down the strike)
      const a0 = A.position.clone();
      fx.sparkles(head(A, U.vh(A), 1).setY(U.vh(A) + 0.1), { count: c.n(16), colors: S.spark, speed: [0.5, 1.5] });
      await c.tween(200, (e, k) => { A.position.y = a0.y + 0.22 * sin(k * PI); A.scale.set(1 - 0.06 * e, 1 + 0.1 * e, 1 - 0.06 * e); }, kit.ease.quadOut);
      A.scale.set(1, 1, 1); A.position.copy(a0);
      // rune circle locks onto the victim
      rune.visible = true; rune.material.color.set(holy ? '#ffd36a' : S.main); rune.material.opacity = 1;
      rune.position.set(victimPos.x, 0.02, victimPos.z);
      await Promise.all([
        c.tween(360, (e, k) => { const s = 0.2 + 1.25 * e; rune.scale.set(s, 1, s); rune.rotation.y = k * 1.6; }, kit.ease.backOut),
        jitter(c, V, 360, 0.025),
      ]);
      // the strike
      const impact = victimPos.clone().setY(0.25);
      if (holy) {
        beam.visible = true; beam.material.color.set('#fff2c8'); beam.material.opacity = 1;
        beam.position.set(victimPos.x, 0, victimPos.z);
        await c.tween(170, (e, k) => { beam.scale.set(0.3 + 0.7 * e, 1, 0.3 + 0.7 * e); beam.position.y = 9 * (1 - e); rune.rotation.y = 1.6 + k; }, kit.ease.quadIn);
        fx.sparkles(impact.clone().setY(0.6), { count: c.n(40), colors: ['#ffffff', '#fff2c8', '#ffd36a', S.light], speed: [1.5, 4], life: [500, 1000] });
      } else {
        met.visible = true;
        const start = victimPos.clone().addScaledVector(dir, -2.8).add(new THREE.Vector3(-dir.z * 1.2, 7.5, dir.x * 1.2));
        let last = 0;
        await c.tween(380, (e, k) => {
          met.position.lerpVectors(start, impact, e);
          met.rotation.set(k * 9, k * 5, 0);
          rune.rotation.y = 1.6 + k;
          if (k - last > 0.05 && k < 1) {
            last = k;
            fx.fire(met.position.clone(), { scale: 0.75, count: c.n(10) });
            fx.smoke(met.position.clone(), { count: c.n(2), colors: ['#3a302a', '#5a4a40'], alpha: 0.5, size: [0.25, 0.4], up: 0.2 });
          }
        }, kit.ease.quadIn);
        met.visible = false;
      }
      // impact
      V.visible = false;
      fx.explosion(impact, { scale: holy ? 1.0 : 1.2, flashColor: holy ? '#fff2c8' : '#ff8a3a',
        debrisColors: [...body(c.victimColor), '#6f6a64', '#a39b8f'] });
      fx.debris(impact.clone().setY(hV * 0.5), { count: c.n(10), colors: body(c.victimColor), speed: [2, 4.5] });
      fx.ring(victimPos, { radius: 2.0, color: holy ? '#ffd36a' : S.main, ms: 480 });
      if (holy) fx.boardFlash('#fff2c8', 420, 0.5);
      kit.shake(c, 0.18, 380);
      await Promise.all([
        c.tween(380, e => {
          rune.material.opacity = 1 - e; const s = 1.45 + 0.6 * e; rune.scale.set(s, 1, s);
          if (holy) { beam.material.opacity = 1 - e; beam.scale.set(1 + 0.6 * e, 1, 1 + 0.6 * e); }
        }),
        c.wait(260).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.4, squash: 0.25 })),
      ]);
      rune.visible = false; beam.visible = false;
    }, { zoom: 0.88, tilt: 0.22 });
  } finally {
    rune.material.opacity = 1; beam.material.opacity = 1;
    U.park(rune, beam, met); U.finish(c);
  }
}
smite.label = 'holy smite / meteor';
const smiteRoyal = Object.assign(c => smite(c), { only: ['q', 'k'], weight: 1, label: 'smite (royals)' });

export const battleAnims = [arcane, arcaneCaster, clash, clashMelee, dragon, dragonKnight, smite, smiteRoyal];
