import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, anchor, scratchTarget, platePos } from './common.js';

// Scratch a BACK leg of Jon's chair → it breaks, Jon falls back with it → eat while he's on the floor.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function legPositions(ctx) {
  const chair = prop(ctx, 'chair');
  if (chair?.legPos) return [chair.legPos(V()), chair.legPosR(V())].map((p) => p.setY(0.15));
  const a = anchor(ctx, 'jonChair') || anchor(ctx, 'jonSeat');
  const r = a?.rotY || 0, c = a ? a.pos.clone().setY(0.15) : V(6.2, 0.15, 8.4);
  const back = V(-Math.sin(r), 0, -Math.cos(r)).multiplyScalar(0.19), side = V(Math.cos(r), 0, -Math.sin(r)).multiplyScalar(0.19);
  return [c.clone().add(back).add(side), c.clone().add(back).sub(side)];
}
export function frontLegs(ctx) {
  const a = anchor(ctx, 'jonChair') || anchor(ctx, 'jonSeat');
  const r = a?.rotY || 0, c = a ? a.pos.clone().setY(0.15) : V(6.2, 0.15, 8.4);
  const fw = V(Math.sin(r), 0, Math.cos(r)).multiplyScalar(0.19), side = V(Math.cos(r), 0, -Math.sin(r)).multiplyScalar(0.19);
  return [c.clone().add(fw).add(side), c.clone().add(fw).sub(side)];
}

export default defineLevel({
  id: 2, food: 'steak', title: 'Timber!',
  objectives: ["Scratch a back leg of Jon's chair", "Eat Jon's steak"],
  hints: ['l02_hint_1', 'l02_hint_2', 'l02_hint_3'],
  canEat: (L) => L.flags.down,
  setup(L) {
    const { ctx, ai } = L;
    const seated = () => ai.state === 'sitEat';
    [0, 1].forEach((i) => scratchTarget(L, 'chairLegBack' + i, () => legPositions(ctx)[i], () => breakChair(L, i), { radius: 0.22, enabled: seated }));
    [0, 1].forEach((i) => scratchTarget(L, 'chairLegFront' + i, () => frontLegs(ctx)[i], () => {
      ctx.audio?.sfx?.('creak'); L.say('g_l02_frontleg', { force: true });
    }, { radius: 0.18, enabled: seated }));
    ai.reactHook = (zone) => {
      // A floor-level scratch near the chair's back legs counts as the chair, not Jon's shin.
      if (!seated() || zone !== 'leg') return false;
      const g = ctx.controller.pos;
      const d = legPositions(ctx).map((p) => Math.hypot(p.x - g.x, p.z - g.z));
      if (Math.min(...d) < 0.55) { breakChair(L, d[0] <= d[1] ? 0 : 1); return true; }
      return false;
    };
  },
  start(L) {
    L.target((o) => { const ps = legPositions(L.ctx); return o.copy(ps[0]).lerp(ps[1], 0.5).setY(0.1); }, { height: 0.5 });
  },
  update(L) {
    if (L.flags.down) L.target((o) => o.copy(platePos(L.ctx)), { height: 0.4 });
    else if (L.ai.isAlert()) L.target((o) => { const ps = legPositions(L.ctx); return o.copy(ps[0]).lerp(ps[1], 0.5).setY(0.1); }, { height: 0.5 });
  },
});

function breakChair(L, leg = 0) {
  const { ctx, ai } = L;
  if (L.flags.breaking) return;
  L.flags.breaking = true;
  L.obj(0);
  const chair = prop(ctx, 'chair');
  ai.run('down', async (t) => {
    ctx.audio?.sfx?.('crack');
    try { chair?.breakLeg?.(leg); } catch (e) { console.warn(e); }
    t.say('j_chair_crack', { force: true });
    try { ctx.jon.setExpression?.('shock'); } catch {}
    await t.wait(0.9);
    dodgeFall(L);
    L.flags.down = true;
    L.progress();
    ctx.events.emit('jonDown');
    t.say('j_chair_fall', { force: true });
    // Jon is parented to chair.seat while seated, so the chair carries him over.
    try { chair?.fallBack?.(); } catch (e) { console.warn(e); }
    await t.play('fall_back_chair', 1.3, { fallback: 'sit' });
    ctx.audio?.sfx?.('crash');
    ctx.camera?.shake?.(0.1);
    try { ctx.jon.setExpression?.('dizzy'); } catch {}
    L.say('g_jon_down', { delay: 1.5 });
    await t.wait(10);
    t.say('j_chair_floor', { force: true });
    // Jon rocks the chair back upright (he's parented to the seat, so he rides it), then the leg is fixed
    const pivot = chair?.root?.children?.[0];
    if (pivot) {
      ctx.audio?.sfx?.('creak');
      const x0 = pivot.rotation.x, z0 = pivot.rotation.z, N = 24;
      for (let k = 1; k <= N; k++) {
        await t.wait(0.035);
        const r = k / N, e = r * r * (3 - 2 * r);
        pivot.rotation.x = x0 * (1 - e) + Math.sin(r * Math.PI) * 0.12;
        pivot.rotation.z = z0 * (1 - e);
      }
      ctx.audio?.sfx?.('land', { vol: 0.6 });
    }
    try { chair?.reset?.(); } catch {}
    try { ctx.jon.setExpression?.('sad'); } catch {}
    await ai.standUp(t);
    await t.play('scratch_head', 1.0, { fallback: 'idle' });
    L.flags.down = false; L.flags.breaking = false;
    ai.goSit();
  }, { interruptible: false });
}

// Jon topples backwards over the chair's back legs: if the cat is standing in that patch, he leaps aside.
export function dodgeFall(L) {
  const { ctx } = L, c = ctx.controller;
  if (c.pos.y > 0.4) return;
  const [a, b] = legPositions(ctx);
  const mid = a.clone().lerp(b, 0.5).setY(0);
  const seat = prop(ctx, 'chair')?.seat;
  const sc = seat ? seat.getWorldPosition(V()).setY(0) : (anchor(ctx, 'jonChair')?.pos.clone().setY(0) || mid.clone().add(V(0, 0, 0.2)));
  const back = V().subVectors(mid, sc).setY(0);
  if (back.lengthSq() < 1e-4) return;
  back.normalize();
  const side = V(-back.z, 0, back.x);
  const rel = V(c.pos.x - mid.x, 0, c.pos.z - mid.z);
  const along = rel.dot(back), lat = rel.dot(side);
  if (along < -0.3 || along > 1.9 || Math.abs(lat) > 0.65) return;
  const dir = side.clone().multiplyScalar(lat >= 0 ? 1 : -1).addScaledVector(back, 0.15);
  c.hop(dir, (0.85 - Math.abs(lat)) * 3 + 1.2);
}
