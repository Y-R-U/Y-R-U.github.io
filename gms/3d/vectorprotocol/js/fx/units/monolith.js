// MONOLITH signature FX (sculptor-13). Gravity Maul = a gravity wave rolls along the floor from the obelisk to the
// target (stacked violet rings), and the slam lands as an inward implosion: a dark core, debris sucked in, a floor ring.
// Event Horizon (overdrive) = a lensing dark sphere settles over the enemy side for ~2 s: rings contract into it,
// debris and dust stream inward, tethers pull from every enemy, and the enemies visibly lean toward the centre.
// Mass Anchor (fortify) and the self taunt get their own gravity flares; deploy is a braked fall with descending rings.
const VIO = (T) => new T.Color(1.2, 0.35, 2.3);
const GOLD = (T) => new T.Color(2.0, 1.3, 0.4);
const DARK = (T) => new T.Color(0.03, 0.0, 0.08);

function implode(ctx, p, k = 1) {
  const { fx, THREE } = ctx;
  fx.darkCore(p, 0.6 * k, 0.5, DARK(THREE), 0.85);
  for (let i = 0; i < Math.round(10 * k); i++) {
    const a = Math.random() * Math.PI * 2, r = 0.9 * k, off = new THREE.Vector3(Math.cos(a) * r, (Math.random() - 0.3) * 0.8, Math.sin(a) * r);
    fx.vfx.add.spawn({ pos: p.clone().add(off), vel: off.clone().multiplyScalar(-2.4), color: VIO(THREE), life: 0.35, size: 0.12, size1: 0.02, kind: 1, streak: 0.6, drag: 0.5, floor: false });
  }
  fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: VIO(THREE), r0: 1.3 * k, r1: 0.2, thick: 0.09, life: 0.35, kind: 0 });
  fx.vfx.rings.spawn({ pos: p.clone().setY(0.06), color: VIO(THREE), r0: 0.2, r1: 1.5 * k, thick: 0.12, life: 0.5, kind: 2 });
  fx.vfx.add.spawn({ pos: p.clone(), color: new THREE.Color(2, 1.6, 2.6), life: 0.1, size: 0.8 * k, size1: 0.05, kind: 0 });
}
// lean a unit toward a world point (and back) through the battle-owned fx.lean hook (robots kit round 4: no body.rotation writes)
function lean(ctx, actor, toward, amt, hold) {
  const { fx, THREE } = ctx, root = actor?.unit?.root;
  if (!root || !fx.lean) return;
  const d = toward.clone().sub(root.getWorldPosition(new THREE.Vector3())).setY(0);
  if (d.lengthSq() < 0.01) return;
  d.normalize();
  fx.lean(actor, d.z * amt, -d.x * amt, hold + 0.6);
}

// the horizon itself: a temporary dark lens sphere (toolkit darkCore does not show in the battle yet, see notes)
let LENS = null;
function lensMesh(THREE) {
  if (!LENS) LENS = {
    geo: new THREE.SphereGeometry(1, 36, 24),
    mat: () => new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(1.4, 0.45, 2.6) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uA, uTime; uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          float rim = pow(f, 4.0);
          float sw = 0.5 + 0.5 * sin(atan(vP.z, vP.x) * 5.0 + vP.y * 6.0 - uTime * 5.0);
          vec3 c = mix(vec3(0.01, 0.0, 0.03), uColor, clamp(rim * 1.4 + sw * 0.18 * f, 0.0, 1.0)) * (1.0 + rim * 1.5);
          gl_FragColor = vec4(c, clamp(0.82 + rim, 0.0, 1.0) * uA);
        }`,
      transparent: true, depthWrite: false,
    }),
  };
  const m = new THREE.Mesh(LENS.geo, LENS.mat());
  m.renderOrder = 18; m.frustumCulled = false;
  return m;
}

export default {
  attack(ctx) {
    const { fx, THREE, src, target, timing } = ctx;
    if (!target) return 'default';
    const a = new THREE.Vector3(src.x, 0.08, src.z), b = new THREE.Vector3(target.x, 0.08, target.z);
    const travel = Math.max(0.12, Math.min(0.5, timing.travel || 0.3)), n = 6;
    fx.vfx.rings.spawn({ pos: a.clone(), color: VIO(THREE), r0: 0.3, r1: 1.3, thick: 0.1, life: 0.35, kind: 2 });
    for (let i = 1; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      fx.after(travel * i / n, () => fx.vfx.rings.spawn({ pos: p, color: VIO(THREE), r0: 0.15, r1: 0.65, thick: 0.08, life: 0.3, kind: 0 }));
    }
    fx.shake(0.12);
  },
  impact(ctx) {
    const { fx, THREE, target, hit } = ctx;
    const p = target.pos('core');
    const main = !hit || hit.dst === ctx.event?.dst || !ctx.event?.splash;
    implode(ctx, p, hit?.crit ? 1.4 : main ? 1 : 0.6);
    fx.light(p, VIO(THREE), hit?.crit ? 12 : 7, 0.18);
    fx.shake(hit?.crit ? 0.3 : 0.18);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const live = targets.filter(Boolean);
    if (!live.length) return 'default';
    const pts = live.map((t) => t.pos('core'));
    const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    c.y = 2.9;
    const col = VIO(THREE), dur = 2.0;
    fx.shake(0.35);
    // a beam of force from the eye to the field centre as it forms
    fx.vfx.beams.spawn({ a: src.pos('eye'), b: c, color: col, width: 0.35, width1: 0.12, core: 0.6, life: 0.4, taper: 1 });
    // the horizon: dark sphere pulses + contracting lens rings + a floor well
    const host = src.root?.parent;
    if (host) {
      const m = lensMesh(THREE);
      m.position.copy(c); m.scale.setScalar(0.01); host.add(m);
      const S = 30;
      for (let i = 0; i <= S; i++) fx.after(i * (dur + 0.25) / S, () => {
        const k = i / S, g = Math.min(1, k * 5) * (k > 0.92 ? Math.max(0, 1 - (k - 0.92) / 0.08) : 1);
        m.scale.setScalar(1.25 * g * (1 + 0.04 * Math.sin(i * 1.9)));
        m.material.uniforms.uA.value = Math.min(1, g * 1.4); m.material.uniforms.uTime.value = k * dur;
        if (i === S) { m.removeFromParent(); m.material.dispose(); }
      });
    }
    const N = 16;
    for (let i = 0; i < N; i++) fx.after(i * dur / N, () => {
      const g = Math.min(1, (i + 1) / 4);
      fx.darkCore(c, (3.0 + 0.25 * Math.sin(i * 1.7)) * g, 0.45, DARK(THREE), 0.92);
      fx.vfx.rings.spawn({ pos: c.clone(), color: col, r0: 1.5 * g, r1: 1.38 * g, thick: 0.14, life: dur / N * 1.8, kind: 0, face: true });
      fx.vfx.rings.spawn({ pos: c.clone(), color: new THREE.Color(2.2, 1.6, 2.8), r0: 1.34 * g, r1: 1.3 * g, thick: 0.03, life: dur / N * 1.6, kind: 0, face: true });
      // accretion: motes skimming round the sphere surface
      for (let m = 0; m < 6; m++) {
        const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * 1.2, R = 1.45 * g;
        const p = c.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(e) * R, Math.sin(e) * R, Math.sin(a) * Math.cos(e) * R));
        const v = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(3.2).addScaledVector(c.clone().sub(p), 0.6);
        fx.vfx.add.spawn({ pos: p, vel: v, color: m % 2 ? col : GOLD(THREE), life: 0.4, size: 0.1, size1: 0.0, kind: 1, streak: 0.5, floor: false });
      }
      if (i % 2 === 0) fx.vfx.rings.spawn({ pos: c.clone(), color: col, r0: 3.0, r1: 1.1, thick: 0.05, life: 0.4, kind: 0, face: true });
      if (i % 4 === 0) fx.vfx.rings.spawn({ pos: c.clone().setY(0.06), color: col, r0: 3.0, r1: 0.4, thick: 0.1, life: 0.6, kind: 2 });
    });
    fx.after(0.05, () => fx.areaField(c.clone().setY(0.05), { radius: 2.4, color: col, life: dur + 0.3, kind: 'debuff', motes: 14 }));
    fx.light(c, col, 7, dur);
    // debris and dust streaming inward
    for (let i = 0; i < 40; i++) fx.after(Math.random() * dur * 0.9, () => {
      const a = Math.random() * Math.PI * 2, r = 2.6 + Math.random() * 1.2;
      const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r, -1.4 + Math.random() * 2.2, Math.sin(a) * r));
      const v = c.clone().sub(p).multiplyScalar(1.6);
      if (i % 3 === 0) fx.vfx.alpha.spawn({ pos: p, vel: v, color: new THREE.Color(0.12, 0.1, 0.16), life: 0.6, size: 0.12, size1: 0.04, kind: 3, floor: false });
      else fx.vfx.add.spawn({ pos: p, vel: v, color: i % 2 ? col : GOLD(THREE), life: 0.6, size: 0.1, size1: 0.0, kind: 1, streak: 0.8, floor: false });
    });
    // tethers + lean + slow mark on every enemy
    live.forEach((t, j) => {
      const p = pts[j];
      fx.after(0.1 + j * 0.05, () => {
        fx.vfx.beams.spawn({ a: p, b: c, color: col, width: 0.08, width1: 0.03, core: 0.4, life: dur - 0.2, jitter: 0.05, hold: 0.8 });
        fx.debuffAura(p.clone().setY(0), col);
        implode(ctx, p, 0.7);
      });
      lean(ctx, t, c, 0.22, dur - 0.4);
    });
    // collapse: the horizon pops
    fx.after(dur, () => { implode(ctx, c, 2.2); fx.explosion(c, col, 0.9); fx.shake(0.4); });
  },
  buff(ctx) {
    const { fx, THREE, src, buff } = ctx;
    const base = new THREE.Vector3(src.x, 0.06, src.z), col = VIO(THREE);
    if (buff?.status === 'fortify') {
      // MASS ANCHOR: the field clamps down: rings slam inward, a dark shell, gold glyph sparks
      for (let i = 0; i < 3; i++) fx.after(i * 0.12, () => fx.vfx.rings.spawn({ pos: base.clone(), color: col, r0: 2.0 - i * 0.3, r1: 0.5, thick: 0.12, life: 0.4, kind: 2 }));
      fx.shieldBubble({ follow: src.root, offsetY: (src.height || 4) * 0.5, radius: 1.5, color: col, life: 2.2, alpha: 0.55 });
      fx.sparks(src.pos('core'), GOLD(THREE), 18, 3);
      fx.shake(0.2);
      return;
    }
    if (buff?.status === 'taunt') {
      fx.vfx.rings.spawn({ pos: base.clone(), color: col, r0: 0.4, r1: 2.4, thick: 0.1, life: 0.7, kind: 2 });
      fx.vfx.rings.spawn({ pos: src.pos('eye'), color: col, r0: 0.1, r1: 0.9, thick: 0.06, life: 0.4, kind: 0, face: true });
      fx.light(src.pos('eye'), col, 10, 0.4);
      return;
    }
    return 'default';
  },
  deploy(ctx) {
    const { fx, THREE, src } = ctx;
    const base = new THREE.Vector3(src.x, 0.06, src.z), col = VIO(THREE);
    // gravity brake: rings stack and descend with it, then a heavy floor ring when it settles
    for (let i = 0; i < 6; i++) fx.after(i * 0.09, () => fx.vfx.rings.spawn({ pos: base.clone().setY(6 - i), color: col, r0: 1.4, r1: 1.0, thick: 0.08, life: 0.45, kind: 0 }));
    fx.after(0.6, () => {
      fx.vfx.rings.spawn({ pos: base.clone(), color: col, r0: 0.3, r1: 2.2, thick: 0.14, life: 0.6, kind: 2 });
      fx.darkCore(base.clone().setY(0.4), 0.8, 0.5, DARK(THREE), 0.6);
      fx.sparks(base.clone().setY(0.2), col, 16, 4, 0.5);
      fx.shake(0.3);
    });
  },
};
