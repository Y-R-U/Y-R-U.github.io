// The hotspot runtime — DEV_CONTRACT §5. Evaluates every hotspot in the level against the player
// each frame and fires its actions. Pure geometry and state: no three, no DOM, so node drives it.
//
// A hotspot attached to a character has no shape of its own; its circle follows that character,
// and it is simply inert on any frame the character is not in the world.

import { evalPred } from './predicate.js';
import { runActions } from './actions.js';

export function inShape(shape, x, z) {
  if (!shape) return false;
  if (shape.k === 'circle') {
    const dx = x - shape.x, dz = z - shape.z;
    return dx * dx + dz * dz <= shape.r * shape.r;
  }
  return x >= shape.x0 && x <= shape.x1 && z >= shape.z0 && z <= shape.z1;
}

export class Hotspots {
  constructor(list = [], ctx = {}) {
    this.ctx = ctx;
    this.load(list);
  }

  load(list) {
    this.list = list.filter(h => h && h.id);
    this.state = new Map(this.list.map(h => [h.id, { in: false, fired: 0, cool: 0 }]));
    this.log = [];
  }

  get(id) { return this.list.find(h => h.id === id) || null; }

  // Where this hotspot's circle is right now, or null if it cannot be tested this frame.
  shapeOf(h) {
    if (!h.attach) return h.shape;
    const p = this.ctx.characterAt?.(h.attach);
    return p ? { k: 'circle', x: p.x, z: p.z, r: h.r || 2.5 } : null;
  }

  // `p` is the player, `{x, z}`. Returns the ids that fired this frame.
  update(dt, p) {
    const out = [];
    for (const h of this.list) {
      const st = this.state.get(h.id);
      st.cool = Math.max(0, st.cool - dt);
      const shape = this.shapeOf(h);
      const inside = !!shape && !!p && inShape(shape, p.x, p.z);
      const was = st.in;
      st.in = inside;
      if (h.trigger === 'enter' && inside && !was) { if (this.fire(h, st)) out.push(h.id); }
      else if (h.trigger === 'exit' && !inside && was) { if (this.fire(h, st)) out.push(h.id); }
      else if (h.trigger === 'always' && inside) { if (this.fire(h, st)) out.push(h.id); }
    }
    return out;
  }

  // The player pressed the interact button, or tapped this hotspot. Only the nearest one that is
  // both in range and allowed answers, so a doorway and the person standing in it do not both go.
  press(p, kinds = ['interact', 'click']) {
    let best = null, bd = Infinity;
    for (const h of this.list) {
      if (!kinds.includes(h.trigger)) continue;
      const shape = this.shapeOf(h);
      if (!shape || !p || !inShape(shape, p.x, p.z)) continue;
      const cx = shape.k === 'circle' ? shape.x : (shape.x0 + shape.x1) / 2;
      const cz = shape.k === 'circle' ? shape.z : (shape.z0 + shape.z1) / 2;
      const d = (p.x - cx) ** 2 + (p.z - cz) ** 2;
      if (d < bd) { bd = d; best = h; }
    }
    if (!best) return null;
    return this.fire(best, this.state.get(best.id)) ? best.id : null;
  }

  // `once` and `cooldown` are checked before `if`, so a predicate that is false does not burn the
  // one shot a `once` hotspot has.
  fire(h, st) {
    if (h.once && st.fired) return false;
    if (st.cool > 0) return false;
    if (!evalPred(h.if, this.ctx.world?.() ?? this.ctx)) return false;
    st.fired++;
    st.cool = h.cooldown || 0;
    const results = runActions(h.actions, this.ctx);
    for (const r of results) if (!r.ok) this.log.push(`${h.id}: ${r.why}`);
    return true;
  }

  report() {
    return this.list.map(h => ({ id: h.id, ...this.state.get(h.id) }));
  }
}
