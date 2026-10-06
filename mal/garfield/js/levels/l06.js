import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, platePos, tableBox, scratchTarget, anchor } from './common.js';

// The only way: scratch the plate on the table → it flings onto the floor → eat it before Jon rescues it.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// A clear floor spot beside the table, away from Jon: nothing overhead (not under the bench/chairs/table),
// not against a wall, the plate's arc doesn't pass through anything, and Jon can walk to it.
export function flingSpot(ctx, dbg) {
  const b = tableBox(ctx), p = platePos(ctx);
  const j = ctx.jonAI.pos();
  const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  const cols = (ctx.world.colliders || []).filter((c) => c.enabled !== false);
  const R = 0.45;
  const clearAt = (x, z) => !cols.some((c) => c.min.y < 1.0 && c.max.y > 0.02
    && x > c.min.x - R && x < c.max.x + R && z > c.min.z - R && z < c.max.z + R);
  const arcClear = (to) => {
    const peak = Math.max(p.y, 0) + 0.55, a = p.y, cc = to.y, bb = 2 * peak - (a + cc) / 2;
    for (let i = 3; i <= 9; i++) {
      const r = i / 10, x = p.x + (to.x - p.x) * r, z = p.z + (to.z - p.z) * r;
      const y = (1 - r) * (1 - r) * a + 2 * (1 - r) * r * bb + r * r * cc;
      if (cols.some((c) => c !== b.src && c.max.y > 0.1 && x > c.min.x - 0.08 && x < c.max.x + 0.08 && z > c.min.z - 0.08 && z < c.max.z + 0.08 && y > c.min.y - 0.05 && y < c.max.y + 0.05)) return false;
    }
    return true;
  };
  const reachable = (to) => {
    const path = ctx.world.nav?.path?.(j, to);
    if (path === null) return false;
    const last = path?.[path.length - 1];
    return !last || Math.hypot(last.x - to.x, last.z - to.z) < 0.6;
  };
  const awayJ = V(cx - j.x, 0, cz - j.z).normalize();
  let best = null, bestS = -Infinity;
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2, dir = V(Math.sin(a), 0, Math.cos(a));
    const half = Math.abs(dir.x) * (b.max.x - b.min.x) / 2 + Math.abs(dir.z) * (b.max.z - b.min.z) / 2;
    for (const extra of [0.7, 0.95, 1.2, 0.5]) {
      const to = V(cx, 0, cz).addScaledVector(dir, half + extra);
      to.y = ctx.world.groundAt?.(to.x, to.z, 0.2) ?? 0;
      if (dbg) dbg.push([k, extra, to.y.toFixed(2), clearAt(to.x, to.z), arcClear(to), reachable(to)].join(' '));
      if (to.y > 0.05 || !clearAt(to.x, to.z) || !arcClear(to)) continue;
      const score = dir.dot(awayJ) * 2 - Math.abs(extra - 0.8) - to.distanceTo(V(p.x, 0, p.z)) * 0.3;
      if (score > bestS && reachable(to)) { bestS = score; best = to; }
      break;
    }
  }
  if (best) return best;
  const half = Math.abs(awayJ.x) * (b.max.x - b.min.x) / 2 + Math.abs(awayJ.z) * (b.max.z - b.min.z) / 2;
  return V(p.x, 0, p.z).addScaledVector(awayJ, half + 0.75);
}

export default defineLevel({
  id: 6, food: 'lasagna', title: 'Food Fling',
  objectives: ["Scratch Jon's food off the table", 'Eat it off the floor'],
  hints: ['l06_hint_1', 'l06_hint_2', 'l06_hint_3'],
  guard: { grab: 7, warn: 0.6 },
  canEat: (L) => L.flags.onFloor,
  guardLabel: 'Scratch it off the table!',
  guardedBark: 'l06_hint_2',
  eatRadius: 0.7,
  setup(L) {
    const { ctx } = L;
    scratchTarget(L, 'plateFood', () => platePos(ctx), () => fling(L), {
      radius: 0.3, heightTol: 0.45, enabled: () => !L.flags.flung && L.onTable(),
    });
    // A swipe on the table near the plate means the plate, even if Jon's face is also in reach.
    L.ai.reactHook = () => {
      if (L.flags.flung || !L.onTable()) return false;
      const g = ctx.controller.pos, p = platePos(ctx);
      if (Math.hypot(g.x - p.x, g.z - p.z) < 0.7) { fling(L); return true; }
      return false;
    };
  },
  update(L) {
    const { ctx } = L;
    if (L.flags.onFloor) L.target((o) => o.copy(platePos(ctx)), { height: 0.35 });
    else L.target((o) => o.copy(platePos(ctx)), { height: 0.45 });
  },
  teardown(L) {},
});

async function fling(L) {
  const { ctx, ai } = L;
  if (L.flags.flung) return;
  L.flags.flung = true;
  const plate = prop(ctx, 'plate');
  const to = flingSpot(ctx);
  ctx.audio?.sfx?.('swipe');
  L.obj(0);
  L.guardT = 0;
  try { await Promise.race([plate?.fling?.(to), new Promise((r) => setTimeout(r, 1200))]); } catch (e) { console.warn(e); }
  ctx.audio?.sfx?.('splat');
  L.flags.onFloor = true;
  ctx.events.emit('plateFlung', { pos: to });
  L.say('j_fling_1', { force: true });
  // Jon: shock, stands, "five-second rule!" and shuffles round to the plate — slowly, on purpose.
  ai.run('rescue', async (t) => {
    try { ctx.jon.setExpression?.('shock'); } catch {}
    await ai.standUp(t);   // out of the chair first (walking while parented to the seat moves him in chair space)
    await t.play('cover_face', 1.3, { fallback: 'idle' });
    t.say('j_fling_2', { force: true });
    await t.walkTo(platePos(ctx), { speed: 0.85, arrive: 0.55 });   // slow on purpose: a fair race for small hands
    if (L.eating || L.won) return;
    await t.play('give_bowl', 1.0, { fallback: 'idle' });
    if (L.eating || L.won) return;
    // saved it: plate back on the table, re-arm
    try { plate?.reset?.(); plate?.setFood?.('lasagna'); } catch {}
    L.flags.flung = false; L.flags.onFloor = false;
    L.obj(0, false);
    t.say('j_fling_save', { force: true });
    ai.goSit();
  });
}
