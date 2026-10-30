// Fantasy battle (capture) animations — owner: battle-1, made BIG by battle-2 (staged camera,
// slow-mo impacts, shockwaves, fling/shatter; see battle_util.js). See docs/notes/battle.md.
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

U.definePool({
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
const SHARD_COLS = c => [...body(c.victimColor), ...side(c.victimColor).spark.slice(1, 3)];

// ===================================================================== battles
/** Arcane storm: levitate under a rune circle, charge a big orb, a branching lightning barrage
 *  lights the board, the victim is lifted and shatters into crystal shards. */
export async function arcane(ctx) {
  const c = U.prep(ctx, 3190);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const orb = U.take(c, 'f.orb'); orb.material.color.set(S.main); orb.scale.setScalar(0.01);
  const rune = U.take(c, 'f.rune'); rune.material.color.set(S.main); rune.material.opacity = 1; rune.scale.set(0.01, 1, 0.01);
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone();
      rune.position.set(a0.x, 0.02, a0.z);
      fx.ring(a0, { radius: 1.2, color: S.main, thick: true, ms: 420 });
      U.sound(c, 'spell', { at: a0 });
      // charge: levitate, spin, orb swells with sparkles sucked in from all round
      let last = 0;
      await c.tween(520, (e, k) => {
        A.position.y = a0.y + 0.45 * e; A.rotation.y = e * PI * 2;
        const s = 0.2 + 1.6 * e; rune.scale.set(s, 1, s); rune.rotation.y = k * 2;
        const op = head(A, hA, 1.0); op.y += 0.3; orb.position.copy(op);
        orb.scale.setScalar(0.08 + 1.7 * e * (1 + 0.14 * sin(k * 44)));
        if (k - last > 0.08 && k < 1) {
          last = k;
          const a = R(0, PI * 2), from = op.clone().add(new THREE.Vector3(cos(a) * 1.4, R(-0.3, 0.6), sin(a) * 1.4));
          fx.burst({ pos: from, count: c.n(8), colors: S.spark, speed: [2.5, 3.5], dir: op.clone().sub(from), spread: 0.15, life: [260, 380], size: [0.07, 0.13], shape: 2 });
        }
      }, kit.ease.quadOut);
      A.rotation.y = 0;
      const from = orb.position.clone(), to = victimPos.clone().setY(hV * 0.6);
      // barrage: three branching bolts, each one lights the board, forks crawl over the squares
      for (let i = 0; i < 3; i++) {
        fx.lightning(from, to.clone().add(new THREE.Vector3(R(-0.15, 0.15), R(-0.2, 0.25), R(-0.15, 0.15))),
          { color: i === 1 ? S.light : S.bolt, width: 0.15 - i * 0.025, branches: 3, branchP: 0.32, ms: 300, lightStrength: 0.45, flashRadius: 2.2 });
        fx.lightning(to.clone().setY(0.4), victimPos.clone().add(new THREE.Vector3(R(-1.6, 1.6), 0.03, R(-1.6, 1.6))), { color: S.bolt, width: 0.06, branches: 2, branchP: 0.3, ms: 260, light: false });
        fx.sparkles(to, { count: c.n(26), colors: S.spark, speed: [1.5, 3.5] });
        kit.flashObject(c, V, i % 2 ? '#ffffff' : S.light, 200, 2.4);
        kit.shake(c, 0.05, 140);
        if (!i) U.sound(c, 'zap', { at: victimPos });
        await Promise.all([jitter(c, V, 150, 0.07), c.tween(150, e => { V.position.y = 0.15 * (i + e); })]);
      }
      U.sound(c, 'thunder', { at: victimPos });
      // shatter
      U.impact(c, to, { color: S.main, power: 1.15, sparks: S.spark, debris: null, dust: ['#2a2f48', '#3a4060', '#1c2030'] });
      fx.sparkles(to, { count: c.n(60), colors: [...S.spark, ...body(c.victimColor).slice(0, 2)], speed: [2, 5.5], life: [500, 1000], size: [0.1, 0.2] });
      await Promise.all([
        U.shards(c, V, SHARD_COLS(c), { count: 100, ms: 950 }),
        c.tween(220, e => { orb.scale.setScalar(1.8 * (1 - e) + 0.01); rune.material.opacity = 1 - e; }),
        c.wait(220).then(() => kit.hopTo(c, A, c.to, { ms: 320, height: 0.45, squash: 0.2 })),
      ]);
    });
  } finally { rune.material.opacity = 1; U.park(orb, rune); U.finish(c); }
}
arcane.label = 'arcane storm & crystal shatter';
const arcaneCaster = Object.assign(c => arcane(c), { only: ['b', 'q'], weight: 2, label: 'arcane storm (caster)' });

/** Sword clash: two ringing exchanges, a huge slash arc, the victim is flung bouncing off the board. */
export async function clash(ctx) {
  const c = U.prep(ctx, 3600);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const slash = U.take(c, 'f.slash'); slash.visible = false;
  try {
    await U.stage(c, async () => {
      const stand = victimPos.clone().addScaledVector(dir, -0.88);
      U.sound(c, 'swing', { at: A.position });
      if (c.type === 'n') await kit.hopTo(c, A, stand, { ms: 280, height: 0.7, squash: 0.15 });
      else await kit.slideTo(c, A, stand, { ms: 230 });
      const a0 = A.position.clone(), v0 = V.position.clone();
      for (let i = 0; i < 2; i++) {
        await c.tween(110, e => { kit.setLean(A, dir, -0.35 * e); kit.setLean(V, dir, 0.35 * e); }, kit.ease.quadOut);
        await c.tween(70, e => {
          A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.22), e); V.position.lerpVectors(v0, v0.clone().addScaledVector(dir, -0.14), e);
          kit.setLean(A, dir, -0.35 + 0.7 * e); kit.setLean(V, dir, 0.35 - 0.6 * e);
        }, kit.ease.quadIn);
        const hit = a0.clone().lerp(v0, 0.5); hit.y = 0.55 + 0.15 * i;
        fx.sparks(hit, { count: c.n(110), colors: [...S.spark, '#ffd36a', S.main], dir: new THREE.Vector3(-dir.z, 0.7, dir.x).multiplyScalar(i ? -1 : 1), spread: 1.2, speed: [3.5, 9], size: [0.09, 0.18], life: [300, 650] });
        fx.flash(hit, { color: i ? S.main : '#ffd36a', radius: 2.6, ms: 220 });
        fx.ring(hit.clone().setY(0), { radius: 1.5, color: i ? S.main : '#ffd36a', ms: 340, thick: true });
        fx.ring(hit.clone().setY(0), { radius: 1.6, dark: true, ms: 340, alpha: 0.35 });
        fx.boardFlash(i ? S.main : '#ffd36a', 200, 0.25);
        U.sound(c, 'clash', { at: hit });
        kit.shake(c, 0.06, 160);
        await c.tween(100, e => {
          A.position.lerpVectors(a0.clone().addScaledVector(dir, 0.22), a0, e); V.position.lerpVectors(v0.clone().addScaledVector(dir, -0.14), v0, e);
          kit.setLean(A, dir, 0.35 * (1 - e)); kit.setLean(V, dir, -0.25 * (1 - e));
        }, kit.ease.quadOut);
      }
      A.quaternion.identity(); V.quaternion.identity();
      // final strike: big wind up, a huge slash arc sweeps through the victim (pawns shoulder-charge)
      U.camTo(c, { point: victimPos, zoom: c._cam ? c._cam.zoom * 0.9 : 1 }, 260);
      await c.tween(190, e => { kit.setLean(A, dir, -0.5 * e); A.scale.set(1 + 0.14 * e, 1 - 0.16 * e, 1 + 0.14 * e); }, kit.ease.quadOut);
      const hitPos = victimPos.clone(); hitPos.y = min(0.9, hV * 0.55);
      const yaw = Math.atan2(dir.x, dir.z);
      if (c.type !== 'p') {
        slash.visible = true; slash.material.color.set(S.main); slash.material.opacity = 1;
        slash.position.set(victimPos.x, hitPos.y, victimPos.z);
      }
      U.sound(c, 'swing', { at: victimPos });
      await c.tween(170, e => {
        kit.setLean(A, dir, -0.5 + 0.9 * e); A.scale.set(1.14 - 0.14 * e, 0.84 + 0.16 * e, 1.14 - 0.14 * e);
        A.position.lerpVectors(a0, a0.clone().addScaledVector(dir, 0.4), e);
        slash.rotation.set(0, yaw + PI * 0.4 - e * PI * 1.15, 0.18);
        slash.scale.setScalar(1.6 + 1.4 * e);
      }, kit.ease.cubicOut);
      U.impact(c, hitPos, { color: S.main, power: 1.1, sparks: [...S.spark, '#ffd36a', S.main], debris: body(c.victimColor), sfx: 'hit' });
      kit.flashObject(c, V, '#ffffff', 200);
      await Promise.all([
        c.tween(300, e => { slash.material.opacity = 1 - e; slash.scale.setScalar(3 + 0.8 * e); }).then(() => { slash.visible = false; }),
        U.fling(c, V, dir, { ms: 1050, up: 6.5, speed: 5.5, spin: 15 }),
        c.tween(140, e => { kit.setLean(A, dir, 0.4 * (1 - e)); }).then(() => c.wait(260)).then(() => kit.hopTo(c, A, c.to, { ms: 280, height: 0.35, squash: 0.2 })),
      ]);
    });
  } finally { U.park(slash); U.finish(c); }
}
clash.label = 'sword clash & fling';
const clashMelee = Object.assign(c => clash(c), { only: ['n', 'r', 'p', 'k'], weight: 1, label: 'sword clash (melee)' });

/** Dragon-fire: a roaring layered flame stream (core + flames + smoke + embers) engulfs the
 *  victim, which chars black and bursts into ash, embers and burning shards. */
export async function dragon(ctx) {
  const c = U.prep(ctx, 3620);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hA = U.vh(A), hV = U.vh(V);
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  try {
    await U.stage(c, async () => {
      const d = kit.flatDist(A.position, victimPos);
      if (d > 1.9) await kit.slideTo(c, A, victimPos.clone().addScaledVector(dir, -1.8), { ms: 240 });
      const mouth = () => A.position.clone().addScaledVector(dir, 0.28).setY(A.position.y + hA * 0.8);
      // rear back and inhale: embers and smoke sucked into the mouth
      U.sound(c, 'roar', { at: A.position });
      await c.tween(260, (e, k) => {
        kit.setLean(A, dir, -0.45 * e);
        if (k < 1 && ((k * 10) | 0) !== (((k - 0.1) * 10) | 0)) {
          const m = mouth(), a = R(0, PI * 2), from = m.clone().add(new THREE.Vector3(cos(a) * 1.1, R(-0.2, 0.5), sin(a) * 1.1));
          fx.burst({ pos: from, count: c.n(6), colors: S.fire.slice(1, 4), speed: [2.8, 3.6], dir: m.clone().sub(from), spread: 0.12, life: [260, 340], size: [0.06, 0.1], shape: 1 });
        }
      }, kit.ease.quadOut);
      // breath: smoke under-layer + flames + white-hot core along the stream
      fx.boardFlash(S.fire[3], 900, 0.3);
      U.sound(c, 'fire', { at: victimPos });
      const target = victimPos.clone().setY(hV * 0.45);
      let lastE = 0, lastF = 0;
      const char = U.darken(c, V, '#120a06', 760, 0.9);
      kit.flashObject(c, V, S.fire[2], 760, 1.6);
      await Promise.all([char, c.tween(860, (e, k) => {
        kit.setLean(A, dir, -0.45 + 0.6 * min(1, k * 4) + 0.04 * sin(k * 60));
        if (k - lastE > 0.03 && k < 1) {
          lastE = k;
          const m = mouth(), aim = target.clone().sub(m).normalize();
          if (((k * 100) | 0) % 2) fx.burst({ pos: m.clone().setY(m.y - 0.15), count: c.n(2), colors: ['#1a1210', '#2c2420'], speed: [3, 4.5], dir: aim, spread: 0.3, life: [420, 620],
            size: [0.25, 0.4], sizeEnd: 2.4, gravity: -1.2, drag: 1.8, shape: 0, blend: 'normal', alpha: 0.28 });
          fx.burst({ pos: m, count: c.n(14), colors: S.fire, speed: [5, 8.5], dir: aim, spread: 0.22, life: [240, 420],
            size: [0.28, 0.5], sizeEnd: 2.4, gravity: -2, drag: 1.2, shape: 0 });
          fx.burst({ pos: m, count: c.n(5), colors: [S.fire[0], '#ffffff'], speed: [6, 8.5], dir: aim, spread: 0.08, life: [200, 320], size: [0.24, 0.4], sizeEnd: 1.8, drag: 1, shape: 0 });
          fx.burst({ pos: m, count: c.n(3), colors: S.fire.slice(1, 4), speed: [6, 9], dir: aim, spread: 0.35, life: [400, 700], size: [0.05, 0.09], sizeEnd: 0.4, gravity: 3, drag: 0.8, shape: 1 });
        }
        if (k - lastF > 0.12 && k > 0.12 && k < 1) {
          lastF = k;
          fx.inferno(victimPos.clone().setY(R(0.05, hV * 0.5)), { scale: 1.1, count: c.n(22), colors: S.fire.slice(0, 4) });
        }
        V.position.set(victimPos.x + R(-0.03, 0.03) * (k < 1), 0, victimPos.z + R(-0.03, 0.03) * (k < 1));
      })]);
      // burst: ash shards, embers, inferno column, scorch
      fx.scorch(victimPos, { radius: 1.1, ms: 3000 });
      U.impact(c, target, { color: S.fire[2], power: 1.1, tint: S.fire[3], debris: ['#1a1310', '#2e2620', '#4a4038'], dust: ['#2a2220', '#3a302a', '#1a1412'], sfx: 'explosion' });
      fx.inferno(victimPos.clone().setY(0.3), { scale: 1.7, count: c.n(60), colors: S.fire.slice(0, 4) });
      fx.embers(victimPos.clone().setY(0.3), { count: c.n(50), colors: S.fire.slice(1, 4), radius: 0.6, size: [0.05, 0.09] });
      await Promise.all([
        U.shards(c, V, ['#1a1310', '#2e2620', '#120c08', S.fire[2], S.fire[3]], { count: 80, ms: 950, up: [2.5, 6.5] }),
        c.tween(150, e => kit.setLean(A, dir, 0.15 * (1 - e))).then(() => c.wait(240)).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.35, squash: 0.2 })),
      ]);
    });
  } finally { U.finish(c); }
}
dragon.label = 'dragon-fire breath';
const dragonKnight = Object.assign(c => dragon(c), { only: ['n', 'k'], weight: 1, label: 'dragon-fire (knight/king)' });

/** Sky strike: a huge rune circle locks on, then a holy pillar (white) or a flaming meteor
 *  (black) slams down: explosion across several squares, the victim blasted sky-high. */
export async function smite(ctx) {
  const c = U.prep(ctx, 3030);
  const { kit, attacker: A, victim: V, victimPos, fx } = c;
  const S = side(c.color), hV = U.vh(V), holy = c.color === 'w';
  const dir = kit.flatDir(A.position, victimPos, c.dir);
  const rune = U.take(c, 'f.rune'), beam = U.take(c, 'f.beam'), met = U.take(c, 'f.meteor');
  rune.visible = false; beam.visible = false; met.visible = false;
  try {
    await U.stage(c, async () => {
      const a0 = A.position.clone();
      fx.sparkles(head(A, U.vh(A), 1).setY(U.vh(A) + 0.1), { count: c.n(30), colors: S.spark, speed: [0.8, 2.2] });
      U.sound(c, 'spell', { at: a0 });
      await c.tween(220, (e, k) => { A.position.y = a0.y + 0.3 * sin(k * PI); A.scale.set(1 - 0.08 * e, 1 + 0.14 * e, 1 - 0.08 * e); }, kit.ease.quadOut);
      A.scale.set(1, 1, 1); A.position.copy(a0);
      // the rune circle (2.5 squares wide) locks onto the victim
      U.camTo(c, { point: victimPos }, 300);
      rune.visible = true; rune.material.color.set(holy ? '#ffd36a' : S.main); rune.material.opacity = 1;
      rune.position.set(victimPos.x, 0.02, victimPos.z);
      await Promise.all([
        c.tween(400, (e, k) => { const s = 0.3 + 2.3 * e; rune.scale.set(s, 1, s); rune.rotation.y = k * 1.8; }, kit.ease.backOut),
        jitter(c, V, 400, 0.03),
      ]);
      const impact = victimPos.clone().setY(0.3);
      if (holy) {
        beam.visible = true; beam.material.color.set('#ffe7a8'); beam.material.opacity = 0.75;
        beam.position.set(victimPos.x, 0, victimPos.z);
        U.sound(c, 'laser', { at: victimPos });
        await c.tween(180, (e, k) => { beam.scale.set(0.4 + 0.9 * e, 1, 0.4 + 0.9 * e); beam.position.y = 9 * (1 - e); rune.rotation.y = 1.8 + k; }, kit.ease.quadIn);
        fx.sparkles(impact.clone().setY(0.6), { count: c.n(70), colors: ['#ffffff', '#fff2c8', '#ffd36a', S.light], speed: [2, 5.5], life: [500, 1100], size: [0.1, 0.2] });
      } else {
        met.visible = true; met.scale.setScalar(2);
        const start = victimPos.clone().addScaledVector(dir, -3).add(new THREE.Vector3(-dir.z * 1.4, 8, dir.x * 1.4));
        let last = 0;
        U.sound(c, 'fire', { at: victimPos });
        await c.tween(420, (e, k) => {
          met.position.lerpVectors(start, impact, e);
          met.rotation.set(k * 9, k * 5, 0);
          rune.rotation.y = 1.8 + k;
          if (k - last > 0.04 && k < 1) {
            last = k;
            fx.inferno(met.position.clone(), { scale: 1.0, count: c.n(10) });
          }
        }, kit.ease.quadIn);
        met.visible = false;
      }
      // impact: explosion, debris toward the camera, victim blasted up and away
      fx.explosion(impact, { scale: holy ? 1.1 : 1.4, flashColor: holy ? '#ffd890' : '#ff8a3a', ringColor: holy ? '#ffd36a' : S.main,
        debrisColors: [...body(c.victimColor), '#6f6a64', '#a39b8f'], boardFlash: false });
      U.impact(c, impact, { color: holy ? '#ffd36a' : S.main, power: 1.25, ring: 3.0, debris: [...body(c.victimColor), '#6f6a64'], sfx: 'explosion', shake: 0.14 });
      
      await Promise.all([
        c.tween(440, e => {
          rune.material.opacity = 1 - e; const s = 2.6 + 0.9 * e; rune.scale.set(s, 1, s);
          if (holy) { beam.material.opacity = 0.75 * (1 - e); beam.scale.set(1.3 + 0.6 * e, 1, 1.3 + 0.6 * e); }
        }),
        U.fling(c, V, dir, { ms: 1000, up: 9, speed: 4.2, spin: 18, bounce: 0.45 }),
        c.wait(380).then(() => kit.hopTo(c, A, c.to, { ms: 300, height: 0.45, squash: 0.25 })),
      ]);
      rune.visible = false; beam.visible = false;
    });
  } finally {
    rune.material.opacity = 1; beam.material.opacity = 1; met.scale.setScalar(1);
    U.park(rune, beam, met); U.finish(c);
  }
}
smite.label = 'holy smite / meteor';
const smiteRoyal = Object.assign(c => smite(c), { only: ['q', 'k'], weight: 1, label: 'smite (royals)' });

export const battleAnims = [arcane, arcaneCaster, clash, clashMelee, dragon, dragonKnight, smite, smiteRoyal];
