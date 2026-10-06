import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos, scratchTarget } from './common.js';

// Shred the curtains (4 scratches) → Jon comes to look → eat. Two more scratches re-trigger him.
const NEED = 4;
const curtainPos = (ctx) => {
  const c = prop(ctx, 'curtains');
  const p = apos(ctx, 'curtains') || (c?.root ? c.root.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0.2, 0, 2.7));
  return p;
};

export default defineLevel({
  id: 4, food: 'meatloaf', title: 'Curtain Call',
  objectives: [`Shred the curtains (0/${NEED})`, "Eat Jon's meatloaf"],
  hints: ['l04_hint_1', 'l04_hint_2', 'l04_hint_3'],
  canEat: (L) => L.flags.busy && L.ai.distracted(),
  setup(L) {
    const { ctx, ai } = L;
    L.flags.n = 0; L.flags.need = NEED;
    scratchTarget(L, 'curtains', () => {
      // the hem hangs to the floor and spans the window: test at Garfield's height, nearest point along the curtain
      const p = curtainPos(ctx).clone();
      const g = ctx.controller.pos;
      p.y = Math.min(g.y + 0.26, 1.7);   // ground floor only (the bedroom is right above)
      const span = 0.9;
      const along = new THREE.Vector3(0, 0, 1);
      const a = ctx.world.anchors?.get('curtains');
      if (a?.rotY != null) along.set(Math.cos(a.rotY), 0, -Math.sin(a.rotY));
      const k = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(g, p).dot(along), -span, span);
      return p.addScaledVector(along, k);
    }, () => shred(L), { radius: 0.4, heightTol: 1.2, enabled: () => !L.flags.busy });
  },
  update(L) {
    const { ctx, ai } = L;
    if (L.flags.busy && ai.distracted()) L.target((o) => o.copy(L.foodPos()), { height: 0.4 });
    else L.target((o) => o.copy(curtainPos(ctx)).setY(0.6), { height: 0.3 });
    // re-arm when he's back in his chair
    if (L.flags.busy && ai.state === 'sitEat' && ai.stateT > 1) {
      L.flags.busy = false;
      L.flags.n = NEED - 2;
      L.obj(0, false);
      L.setObjText(0, `Shred the curtains (${L.flags.n}/${NEED})`);
    }
  },
});

function shred(L) {
  const { ctx, ai } = L;
  L.flags.n++;
  const n = L.flags.n;
  const c = prop(ctx, 'curtains');
  try { c?.shred?.(Math.min(3, n)); } catch (e) { console.warn(e); }
  ctx.audio?.sfx?.('rip');
  L.setObjText(0, `Shred the curtains (${Math.min(n, NEED)}/${NEED})`);
  L.progress();
  if (n === 2 && ai.isAlert()) L.say('j_curtain_hear', { force: true });
  if (n === 1) L.say('g_curtain_1', { delay: 0.6 });
  if (n >= NEED) {
    L.flags.busy = true;
    L.obj(0);
    L.say('j_curtain_see', { force: true });
    ai.investigate(curtainPos(ctx), { dur: 10, lookLines: [null, 'j_curtain_fix'], standOff: 0.9 });
  }
}
