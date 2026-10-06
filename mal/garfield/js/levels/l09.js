import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, anchor, tableBox, inBoxXZ } from './common.js';

// Jump under the table 3× (head-bumps) → walk under Jon's chair (it bounces) → Jon's stunned → jump up and eat.
const NEED = 3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function chairCentre(ctx) {
  const c = prop(ctx, 'chair');
  if (c?.root) { const p = c.root.getWorldPosition(V()); p.y = 0; return p; }
  const a = anchor(ctx, 'jonChair') || anchor(ctx, 'jonSeat');
  return a ? V(a.pos.x, 0, a.pos.z) : V(6.2, 0, 8.4);
}

export default defineLevel({
  id: 9, food: 'meatloaf', title: 'Belly Quake',
  objectives: [`Bump the table from underneath (0/${NEED})`, "Walk under Jon's chair", "Eat Jon's meatloaf"],
  hints: ['l09_hint_1', 'l09_hint_2', 'l09_hint_3'],
  canEat: (L) => L.ai.state === 'stunned',
  setup(L) {
    const { ctx } = L;
    L.flags.n = 0; L.flags.lastBump = -9;
    const bump = () => {
      if (L.t - L.flags.lastBump < 0.35) return;
      L.flags.lastBump = L.t;
      L.flags.n++;
      const n = L.flags.n;
      try { prop(ctx, 'table')?.bump?.(0.6 + Math.min(n, 3) * 0.15); } catch {}
      try { ctx.garfield.play?.('belly_bounce', { once: true }); } catch {}
      ctx.audio?.sfx?.('boing', { rate: 0.8 + n * 0.05 });
      ctx.camera?.shake?.(0.06);
      if (n <= NEED) {
        L.setObjText(0, `Bump the table from underneath (${Math.min(n, NEED)}/${NEED})`);
        L.progress();
        if (L.ai.isAlert()) L.say('j_bump_' + Math.min(n, 3), { force: true });
      }
      if (n === NEED) { L.obj(0); L.say('g_l09_ready', { delay: 1.8 }); }
    };
    // Head hits the tabletop's underside (core 'bonk'), or a jump that starts under the table (fallback).
    ctx.events.on('bonk', (e) => { if (/table/i.test(e?.surfaceId || '')) bump(); });
    ctx.events.on('jump', (e) => {
      const b = tableBox(ctx);
      if (inBoxXZ(e?.pos || ctx.controller.pos, b, -0.05) && ctx.controller.pos.y < 0.2) setTimeout(() => {
        if (L.t - L.flags.lastBump > 0.35 && inBoxXZ(ctx.controller.pos, b, 0)) bump();
      }, 220);
    });
  },
  update(L) {
    const { ctx, ai, flags } = L;
    const g = ctx.controller.pos;
    const b = tableBox(ctx);
    if (ai.state === 'stunned') L.target((o) => o.copy(L.foodPos()), { height: 0.4 });
    else if (flags.n < NEED) L.target((o) => o.set((b.min.x + b.max.x) / 2, 0.05, (b.min.z + b.max.z) / 2), { height: 0.4 });
    else L.target((o) => o.copy(chairCentre(ctx)), { height: 0.35 });
    // under the chair?
    const cc = chairCentre(ctx);
    const under = g.y < 0.2 && Math.hypot(g.x - cc.x, g.z - cc.z) < 0.42;
    if (under && !flags.underLatch) {
      flags.underLatch = true;
      if (ai.state !== 'sitEat') return;
      if (flags.n < NEED) { ctx.audio?.sfx?.('creak'); L.say('g_l09_early', { force: true }); return; }
      bounce(L);
    }
    if (!under) flags.underLatch = false;
  },
});

async function bounce(L) {
  const { ctx, ai } = L;
  L.obj(1);
  const chair = prop(ctx, 'chair');
  ctx.audio?.sfx?.('boing');
  try { chair?.bounce?.(0.35); } catch {}
  ai.run('bounced', async (t) => {
    t.say('j_chair_bounce', { force: true });
    try { ctx.jon.setExpression?.('shock'); } catch {}
    await t.wait(0.7);   // the chair (and Jon, parented to its seat) hops
    ctx.audio?.sfx?.('crash', { vol: 0.5 });
    ai.stun(18);
  }, { interruptible: false });
}
