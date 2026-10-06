import * as THREE from '../../vendor/three/three.module.js';
import { prop, anchor, apos, scratchTarget } from './common.js';

// Pieces reused by several levels: the windowsill, the vase knock + re-arm.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function sillHelpers(L) {
  const { ctx } = L;
  const pos = () => apos(ctx, 'windowsill', V(0.16, 0.9, 2.7));
  const isOn = () => {
    const c = ctx.controller, p = pos();
    if (c.surfaceId && /sill/i.test(c.surfaceId) && c.grounded) return true;
    return c.grounded && Math.hypot(c.pos.x - p.x, c.pos.z - p.z) < 0.75 && Math.abs(c.pos.y - p.y) < 0.2;
  };
  const fns = [];
  ctx.events.on('land', () => { if (isOn()) fns.forEach((f) => f()); });
  return { pos, isOn, onLand: (f) => fns.push(f) };
}

// Direction from the window into the room (for the vase's fall and Jon's approach).
export function intoRoom(ctx) {
  const s = apos(ctx, 'windowsill', V(0.16, 0.9, 2.7));
  const c = apos(ctx, 'livingCentre', V(3, 0, 2.7));
  const d = V(c.x - s.x, 0, c.z - s.z);
  return d.lengthSq() > 1e-4 ? d.normalize() : V(1, 0, 0);
}

export function vaseLevel(L, { objIndex, onBroken, spareLine, homeStates = ['sitEat', 'sulk'] }) {
  const { ctx } = L;
  const vase = () => prop(ctx, 'vase');
  L.flags.vasePos = () => {
    const v = vase();
    if (v?.root) { const p = V(); v.root.getWorldPosition(p); return p; }
    return apos(ctx, 'vase', apos(ctx, 'windowsill', V(0.16, 0.9, 2.7)));
  };
  L.flags.fragPos = () => {
    const v = vase();
    if (v?.fragments?.pos) return v.fragments.pos.clone();
    return L.flags.vasePos().setY(0).addScaledVector(intoRoom(ctx), 0.55);
  };
  scratchTarget(L, 'vase', () => L.flags.vasePos(), () => knock(), {
    radius: 0.3, heightTol: 0.55, enabled: () => !L.flags.vaseBroken && ctx.controller.pos.y > 0.45,
  });
  async function knock() {
    if (L.flags.vaseBroken) return;
    L.flags.vaseBroken = true;
    L.obj(objIndex);
    const v = vase();
    const dir = intoRoom(ctx);
    let p = null;
    try { p = v?.knock?.({ dir }); } catch (e) { console.warn(e); }
    ctx.audio?.sfx?.('crash', { vol: 0.4 });
    if (v?.knock) await Promise.race([p, new Promise((r) => setTimeout(r, 1800))]);
    if (!v?.knock) ctx.audio?.sfx?.('shatter');
    L.say('g_vase_1', { delay: 0.8 });
    const frag = L.flags.fragPos();
    L.flags.frag = frag;
    ctx.events.emit('vaseBroken', { pos: frag });
    onBroken?.(frag);
  }
  // re-arm: Jon is back home with the vase broken and the food not eaten → spare vase
  let homeT = 0;
  const off = ctx.every(0.25, () => {
    if (!L.flags.vaseBroken || L.won || L.eating || L.flags.noRearm) { homeT = 0; return; }
    if (homeStates.includes(L.ai.state)) homeT += 0.25; else homeT = 0;
    if (homeT > 1.5) {
      homeT = 0;
      L.say(spareLine, { force: true });
      try { vase()?.reset?.(); } catch {}
      L.flags.vaseBroken = false;
      L.obj(objIndex, false);
      ctx.events.emit('vaseReset');
    }
  });
  return { knock, off };
}
