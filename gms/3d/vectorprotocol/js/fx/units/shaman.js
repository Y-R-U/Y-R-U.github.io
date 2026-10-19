// HORDE SHAMAN signature FX (sculptor-19). Keyed by model id `shaman` (horde_shaman falls through to it).
// Hex Bolt (basic, the mage `cast` anim): the femur strikes the drum (event 0: a red drum-beat pulse ring + embers off the hide),
//   then the staff skull spits a spirit flame (event 1): a burning skull-fire bolt with a red smoke trail. Impact: spirit fire
//   bursts on the target and a hex sigil (weaken) circles it.
// Blood Totem (overdrive, war chant): the staff slams down and a pillar of fire rises from its foot; each frenzied drum beat sends a
//   blood-red pulse rolling over the whole squad; allies catch red spirit flames (buff hook: overclock/haste + War Drums aura).
// Deploy (noDrop): steps out of a burst of red smoke and embers.
const rnd = (a, b) => a + Math.random() * (b - a);
let K = null;
function cols(ctx) {
  if (!K) {
    const C = ctx.THREE.Color;
    K = { fire: new C(3.4, 0.95, 0.2), core: new C(3.6, 2.4, 1.1), blood: new C(3.0, 0.22, 0.18), spirit: new C(3.0, 1.4, 0.5),
      smoke: new C(0.2, 0.04, 0.03), ash: new C(0.1, 0.07, 0.06), hex: new C(2.4, 0.3, 1.0) };
  }
  return K;
}
const gpos = (ctx, who) => who.root.getWorldPosition(new ctx.THREE.Vector3()).setY(0.06);
function smoke(ctx, p, n, k = 1, up = 1.4) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) fx.vfx.alpha.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.15, 0.15), 0, rnd(-0.15, 0.15))), vel: new THREE.Vector3(rnd(-0.5, 0.5), rnd(up * 0.6, up), rnd(-0.5, 0.5)), color: C.smoke, alpha: 0.55, life: rnd(0.9, 1.5), size: 0.3 * k, size1: 1.2 * k, kind: 2, drag: 1.4, floor: false });
}
function embers(ctx, p, n, speed = 2.5) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(rnd(-1, 1) * speed, rnd(0.6, 1.6) * speed, rnd(-1, 1) * speed), color: i % 3 ? C.fire : C.core, life: rnd(0.35, 0.8), size: rnd(0.06, 0.12), size1: 0.01, kind: 1, streak: 0.05, drag: 1.5, grav: -1.5, floor: false });
}
// flame tongue: a quick column of glow particles rising (size in metres; flames need ~1.5+ to read on the board)
function flame(ctx, p, { h = 1.6, n = 10, size = 1.6, life = 0.5, color } = {}) {
  const { fx, THREE } = ctx, C = cols(ctx);
  for (let i = 0; i < n; i++) fx.vfx.add.spawn({ pos: p.clone().add(new THREE.Vector3(rnd(-0.12, 0.12), rnd(0, 0.2), rnd(-0.12, 0.12))), vel: new THREE.Vector3(rnd(-0.3, 0.3), h * rnd(1.2, 2.2), rnd(-0.3, 0.3)), color: i % 3 === 0 ? C.core : (color || C.fire), life: rnd(life * 0.6, life), size: size * rnd(0.5, 0.9), size1: size * 0.1, kind: 0, drag: 1.2, floor: false });
}
// drum-beat pulse: a ring rolling out from the drum (k = strength)
function pulse(ctx, src, k = 1, color) {
  const { fx } = ctx, C = cols(ctx), c = color || C.fire;
  const d = src.pos('drum');
  fx.vfx.rings.spawn({ pos: d, color: c, r0: 0.15, r1: 1.0 * k, thick: 0.08, life: 0.3, face: true });
  fx.vfx.rings.spawn({ pos: gpos(ctx, src), color: c, r0: 0.4, r1: 2.6 * k, thick: 0.12 * k, life: 0.5 });
  fx.star(d, C.core, 0.7 * k, 0.1);
  embers(ctx, d, Math.round(6 * k), 2);
  fx.light(d, c, 12 * k, 0.15);
}
// spirit flame bolt: the generic bolt plus a burning trail and smoke, arcing slightly
function spiritBolt(ctx, a, b, travel) {
  const { fx, THREE } = ctx, C = cols(ctx);
  fx.bolt(a, b, C.fire, travel, { size: 0.5, arc: 0.45, trail: 1 });
  fx.muzzle(a, C.fire, 1.1);
  smoke(ctx, a, 3, 0.6, 0.8);
  const n = Math.max(3, Math.round(travel / 0.04));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    fx.after(travel * t, () => {
      const p = new THREE.Vector3().lerpVectors(a, b, t); p.y += Math.sin(t * Math.PI) * 0.45 * a.distanceTo(b) * 0.25;
      fx.vfx.add.spawn({ pos: p, vel: new THREE.Vector3(0, 0.6, 0), color: i % 2 ? C.fire : C.spirit, life: 0.3, size: 0.55, size1: 0.1, kind: 0, drag: 1, floor: false });
      if (i % 2) fx.vfx.alpha.spawn({ pos: p, vel: new THREE.Vector3(0, 0.5, 0), color: C.smoke, alpha: 0.4, life: 0.7, size: 0.2, size1: 0.6, kind: 2, drag: 1, floor: false });
    });
  }
}
// hex sigil circling the target's feet (weaken)
function hex(ctx, t) {
  const { fx, THREE } = ctx, C = cols(ctx), g = gpos(ctx, t);
  fx.vfx.rings.spawn({ pos: g, color: C.hex, r0: 1.0, r1: 0.8, thick: 0.06, life: 1.2, hold: 0.6 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    fx.vfx.add.spawn({ pos: g.clone().add(new THREE.Vector3(Math.cos(a) * 0.85, 0.1, Math.sin(a) * 0.85)), vel: new THREE.Vector3(0, 0.8, 0), color: C.hex, life: 0.9, size: 0.2, size1: 0.04, kind: 4, drag: 1, floor: false });
  }
}

export default {
  attack(ctx) {
    // event 0 of the cast (Hex Bolt) / attack_alt anims = the drum strike; the attack anim's 0 is the staff jab itself
    if (ctx.src.unit?.state?.action === 'attack') { const { src, target, timing } = ctx; if (target) spiritBolt(ctx, src.pos('muzzle'), target.pos('core'), Math.max(0.12, timing.travel)); return; }
    pulse(ctx, ctx.src, 0.8);
  },
  shot(ctx) {
    const { fx, shot, src, target, targets, timing } = ctx, C = cols(ctx);
    if (shot.phase === 'attack') {
      if (shot.index === 0) return;   // handled by attack()
      if (shot.type === 'cast') { pulse(ctx, src, 0.8); return; }
      if (shot.type === 'fire' && target) spiritBolt(ctx, shot.socket, target.pos('core'), Math.max(0.1, timing.travel));
      return;
    }
    // overdrive anim: staff slam -> fire pillar at the staff foot; each drum beat -> a blood pulse over the squad
    if (shot.type === 'impact') {
      const foot = src.pos('staffFoot').setY(0.08);
      fx.vfx.rings.spawn({ pos: foot, color: C.blood, r0: 0.2, r1: 2.4, thick: 0.15, life: 0.55 });
      flame(ctx, foot, { h: 2.2, n: 16, size: 1.8, life: 0.7 });
      smoke(ctx, foot, 6, 1, 2);
      fx.shake(0.25);
      return;
    }
    const last = shot.index >= 5;
    pulse(ctx, src, last ? 1.6 : 1.1, C.blood);
    const allies = (targets || []).filter(Boolean);
    allies.forEach((t, i) => fx.after(0.05 + i * 0.03, () => fx.vfx.rings.spawn({ pos: gpos(ctx, t), color: C.blood, r0: 0.3, r1: last ? 1.6 : 1.1, thick: 0.1, life: 0.4 })));
    if (last) { fx.screenFlash(C.blood, 0.05); flame(ctx, src.pos('staff'), { h: 1.6, n: 12, size: 1.5 }); }
  },
  impact(ctx) {
    const { fx, target, hit } = ctx, C = cols(ctx);
    const p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.impact(p, C.fire, 0.9 * k);
    flame(ctx, p.clone().setY(p.y - 0.3), { h: 1.2, n: Math.round(7 * k), size: 1.4 * k, life: 0.45 });
    smoke(ctx, p, 4, 0.7, 1);
    embers(ctx, p, Math.round(8 * k));
    hex(ctx, target);
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx, C = cols(ctx);
    const g = gpos(ctx, src), staff = src.pos('staff');
    // blood totem: a fire pillar on the staff, a war-chant circle under the shaman, a red wave across the squad
    flame(ctx, staff, { h: 2.6, n: 20, size: 2.0, life: 0.8 });
    fx.vfx.beams.spawn({ a: g.clone(), b: g.clone().setY(4.5), color: C.blood, width: 0.7, width1: 0.1, core: 0.35, life: 1.2, taper: 0.5, hold: 0.5 });
    fx.vfx.rings.spawn({ pos: g, color: C.blood, r0: 0.5, r1: 1.8, thick: 0.12, life: 2.2, hold: 0.8 });
    fx.vfx.rings.spawn({ pos: g, color: C.fire, r0: 0.3, r1: 7, thick: 0.25, life: 0.8 });
    fx.screenFlash(C.blood, 0.07);
    fx.light(staff, C.fire, 50, 0.6);
    smoke(ctx, g, 10, 1.3, 1.6);
    (targets || []).filter(Boolean).forEach((t, i) => fx.after(0.12 + i * 0.06, () => {
      const tg = gpos(ctx, t);
      flame(ctx, tg, { h: 1.6, n: 10, size: 1.5, life: 0.6, color: C.blood });
      fx.vfx.rings.spawn({ pos: tg, color: C.blood, r0: 0.3, r1: 1.4, thick: 0.12, life: 0.6 });
      embers(ctx, t.pos('core'), 8, 2);
    }));
  },
  buff(ctx) {
    // overclock / haste / War Drums on an ally: red spirit flames lick up its body, a war-paint ring at its feet
    const { fx, target, buff } = ctx, C = cols(ctx);
    if (!target) return;
    const g = gpos(ctx, target), k = /haste/.test(buff?.status || '') ? 0.7 : 1;
    fx.vfx.rings.spawn({ pos: g, color: C.blood, r0: 0.5, r1: 1.1, thick: 0.1, life: 0.7, hold: 0.3 });
    for (let i = 0; i < 3; i++) fx.after(i * 0.12, () => flame(ctx, g.clone().setY(0.3), { h: 1.4, n: 6, size: 1.2 * k, life: 0.5, color: i % 2 ? C.fire : C.blood }));
    embers(ctx, target.pos('core'), 6, 1.6);
  },
  deploy(ctx) {
    const { fx, src } = ctx, C = cols(ctx), g = gpos(ctx, src);
    smoke(ctx, g.clone().setY(0.3), 16, 1.4, 1.6);
    embers(ctx, g.clone().setY(0.5), 16, 2.5);
    fx.vfx.rings.spawn({ pos: g, color: C.fire, r0: 0.3, r1: 2.0, thick: 0.12, life: 0.6 });
    fx.after(0.45, () => pulse(ctx, src, 1, C.blood));
    fx.light(g.clone().setY(1), C.fire, 20, 0.5);
  },
};
