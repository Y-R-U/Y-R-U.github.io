// ARBITER signature FX (sculptor-20).
// Directive Pulse (basic) = the antenna beacon flashes a hex "directive" and fires a short pulse to the nearest command drone,
// which relays it (ring flash) as a cyan pulse onto the target; impact = an order stamp: a square-cut hex snaps flat onto the
// target's plate with a chevron star.
// Executive Override (overdrive) = the antenna stamp sends a shock ring across the floor; at the release the raised drone ring
// overhead flares and drops cyan order glyphs (falling hex rings + a down-chevron) onto every ally, each ally's plate pulses.
// buff hook (haste / overclock from the override): a quick rising chevron stack on that ally, once per ally per burst.
const rnd = (a, b) => a + Math.random() * (b - a);
const C = (ctx, r, g, b) => new ctx.THREE.Color(r, g, b);
const cy = (ctx) => C(ctx, 0.4, 2.6, 3.4);
const white = (ctx) => C(ctx, 2.6, 3.0, 3.3);
const amber = (ctx) => C(ctx, 3.2, 1.9, 0.5);
function sock(ctx, who, name, fallback = 'core') {
  const s = who.unit?.socket?.(name);
  if (s && who.root.visible) { who.root.updateMatrixWorld(true); return s.getWorldPosition(new ctx.THREE.Vector3()); }
  return who.pos(fallback);
}
function relay(ctx, src, from, to) {
  let best = null, bd = Infinity, bi = 0;
  const n = (src.unit?.rank ?? 2) >= 5 ? 6 : 4;
  for (let i = 0; i < n; i++) {
    const s = src.unit?.socket?.('d' + i);
    if (!s) continue;
    const p = s.getWorldPosition(new ctx.THREE.Vector3());
    const d = p.distanceTo(from) * 0.6 + p.distanceTo(to);
    if (d < bd) { bd = d; best = p; bi = i; }
  }
  return best ? { p: best, i: bi } : null;
}
function directive(ctx, p, k = 1) {
  const { fx } = ctx;
  fx.vfx.rings.spawn({ pos: p, color: cy(ctx), r0: 0.1, r1: 0.55 * k, thick: 0.05, life: 0.22, face: true, kind: 2 });
  fx.star(p, white(ctx), 0.9 * k, 0.12);
  fx.light(p, cy(ctx), 10 * k, 0.12);
}
function pulse(ctx, src, target, from, travel, k = 1) {
  const { fx } = ctx;
  const to = target.pos('core');
  const r = relay(ctx, src, from, to);
  directive(ctx, from, k);
  if (!r) { fx.bolt(from, to, cy(ctx), travel, { size: 0.32 * k, arc: 0.1 }); return; }
  const hop = Math.min(0.12, travel * 0.35);
  fx.vfx.beams.spawn({ a: from, b: r.p, color: cy(ctx), width: 0.06, core: 0.8, life: hop + 0.12, taper: 0.05, hold: 0.5 });
  fx.after(hop, () => {
    const p = sock(ctx, src, 'd' + r.i);
    fx.vfx.rings.spawn({ pos: p, color: white(ctx), r0: 0.06, r1: 0.4 * k, thick: 0.05, life: 0.18, face: true });
    fx.bolt(p, target.pos('core'), cy(ctx), Math.max(0.06, travel - hop), { size: 0.3 * k, arc: 0.05, trail: 1 });
  });
}
function stamp(ctx, t, k = 1, color) {
  const { fx, THREE } = ctx;
  const g = new THREE.Vector3(t.x, 0.07, t.z);
  fx.vfx.rings.spawn({ pos: g, color: color || cy(ctx), r0: 1.6 * k, r1: 0.9 * k, thick: 0.1, life: 0.35, kind: 2, hold: 0.3 });
  fx.vfx.rings.spawn({ pos: g.clone().setY(0.075), color: white(ctx), r0: 0.2, r1: 1.0 * k, thick: 0.05, life: 0.22, kind: 2 });
}
// order glyph falling onto an ally: three hex rings stepping down, a down-chevron of beams, plate flash
function glyph(ctx, t, delay) {
  const { fx, THREE } = ctx;
  const g = new THREE.Vector3(t.x, 0.07, t.z), h = (t.height || 3) + 1.2;
  for (let i = 0; i < 4; i++) fx.after(delay + i * 0.06, () => fx.vfx.rings.spawn({ pos: g.clone().setY(h - i * (h / 4)), color: i === 3 ? white(ctx) : cy(ctx), r0: 0.55, r1: 0.75, thick: 0.06, life: 0.3, kind: 2 }));
  fx.after(delay + 0.24, () => {
    const top = g.clone().setY(h * 0.55);
    for (const s of [1, -1]) fx.vfx.beams.spawn({ a: top.clone().add(new THREE.Vector3(s * 0.45, 0.35, 0)), b: top, color: cy(ctx), width: 0.1, core: 0.8, life: 0.45, taper: 0.1, hold: 0.6 });
    stamp(ctx, t, 1.2);
    fx.vfx.rings.spawn({ pos: g, color: amber(ctx), r0: 0.4, r1: 1.9, thick: 0.08, life: 0.6 });
    for (let i = 0; i < 10; i++) fx.vfx.add.spawn({ pos: g.clone().add(new THREE.Vector3(rnd(-0.8, 0.8), 0.1, rnd(-0.8, 0.8))), vel: new THREE.Vector3(0, rnd(1.5, 3.5), 0), color: i % 3 ? cy(ctx) : amber(ctx), life: rnd(0.5, 0.9), size: 0.12, size1: 0.02, kind: 1, streak: 0.1, floor: false });
  });
}

const seen = new Map();
export default {
  attack(ctx) {
    const { src, target, timing } = ctx;
    if (!target) return 'default';
    pulse(ctx, src, target, src.pos('muzzle'), Math.max(0.12, timing.travel), 1);
  },
  impact(ctx) {
    const { fx, target, hit } = ctx;
    const p = target.pos('core'), k = hit?.crit ? 1.4 : 1;
    fx.impact(p, cy(ctx), 0.7 * k);
    fx.star(p, white(ctx), 1.2 * k, 0.12);
    fx.sparks(p, cy(ctx), 6, 4, 1);
    stamp(ctx, target, 0.8 * k, hit?.crit ? amber(ctx) : null);
  },
  shot(ctx) {
    const { fx, THREE, shot, src, target } = ctx;
    if (shot.phase === 'attack') {
      if (shot.index > 0 && target) pulse(ctx, src, target, shot.socket, 0.25, 0.8);
      return;
    }
    // overdrive: index 1 = the antenna stamps the floor
    if (shot.index === 1) {
      const p = sock(ctx, src, 'muzzle'), g = new THREE.Vector3(p.x, 0.07, p.z);
      fx.vfx.rings.spawn({ pos: g, color: cy(ctx), r0: 0.2, r1: 3.2, thick: 0.12, life: 0.5, kind: 2 });
      fx.vfx.rings.spawn({ pos: g.clone().setY(0.075), color: white(ctx), r0: 0.1, r1: 1.4, thick: 0.08, life: 0.3 });
      fx.sparks(g.clone().setY(0.2), cy(ctx), 10, 4, 1);
      fx.shake(0.2);
    }
  },
  overdrive(ctx) {
    const { fx, THREE, src, targets } = ctx;
    const tg = targets.filter(Boolean);
    const hub = new THREE.Vector3(src.x, (src.height || 3) * 1.05 + 0.6, src.z);
    fx.screenFlash(cy(ctx), 0.15);
    fx.light(hub, cy(ctx), 40, 0.6);
    // the drone ring overhead flares: two hex rings + a light column into it
    fx.vfx.rings.spawn({ pos: hub, color: cy(ctx), r0: 0.5, r1: 1.6, thick: 0.08, life: 0.8, hold: 0.5 });
    fx.vfx.rings.spawn({ pos: hub, color: white(ctx), r0: 0.4, r1: 1.2, thick: 0.05, life: 0.6, kind: 2, hold: 0.4 });
    fx.vfx.beams.spawn({ a: new THREE.Vector3(src.x, 0.1, src.z), b: hub, color: cy(ctx), width: 0.25, core: 0.7, life: 0.5, taper: 0.1, hold: 0.4 });
    // directives fan out from the ring to each ally, glyphs drop on them
    tg.forEach((t, i) => {
      const d = 0.05 + i * 0.07;
      fx.after(d, () => fx.vfx.beams.spawn({ a: hub, b: new THREE.Vector3(t.x, (t.height || 3) + 1.2, t.z), color: cy(ctx), width: 0.08, core: 0.8, life: 0.35, taper: 0.1, hold: 0.5 }));
      glyph(ctx, t, d + 0.1);
    });
    seen.clear();
  },
  // haste / overclock land: a rising chevron stack (once per ally per 0.5 s)
  buff(ctx) {
    const { fx, THREE, target, timing } = ctx;
    if (!target) return;
    const k = target.id, now = timing?.now ?? 0;
    if (seen.has(k) && now - seen.get(k) < 0.5) return;
    seen.set(k, now);
    const g = new THREE.Vector3(target.x, 0.07, target.z);
    for (let i = 0; i < 3; i++) fx.after(0.35 + i * 0.08, () => fx.vfx.rings.spawn({ pos: g.clone().setY(0.4 + i * 0.6), color: i === 2 ? amber(ctx) : cy(ctx), r0: 0.7, r1: 0.4, thick: 0.05, life: 0.35, kind: 2 }));
  },
};
