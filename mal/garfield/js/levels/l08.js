import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos, anchor, scratchTarget } from './common.js';

// Upstairs: scratch Jon's bed 3× → he comes up to look → close the bedroom door on him → eat.
const NEED = 3;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function bedPos(ctx) {
  const b = prop(ctx, 'jonBed');
  if (b?.root) return b.root.getWorldPosition(V());
  return apos(ctx, 'jonBed', V(2.5, 3, 3));
}
function doorPos(ctx) {
  const d = prop(ctx, 'bedroomDoor');
  return apos(ctx, 'bedroomDoor') || (d?.root ? d.root.getWorldPosition(V()) : V(6.4, 3, 5.7));
}
// Which side of the door is a point on? Uses the bedroomInside / landing anchors when present.
function insideRoom(ctx, p) {
  const ins = apos(ctx, 'bedroomInside'), out = apos(ctx, 'landing');
  const dp = doorPos(ctx);
  if (p.y < dp.y - 1) return false;
  if (ins && out) return p.distanceTo(ins) < p.distanceTo(out) ? (V().subVectors(p, dp).dot(V().subVectors(ins, dp)) > 0) : false;
  const bed = bedPos(ctx);
  return V().subVectors(p, dp).setY(0).dot(V().subVectors(bed, dp).setY(0).normalize()) > 0.2;
}

export default defineLevel({
  id: 8, food: 'meatloaf', title: 'Bedroom Lock-In',
  objectives: [`Scratch up Jon's bed (0/${NEED})`, 'Shut Jon in the bedroom', "Eat Jon's meatloaf"],
  hints: ['l08_hint_1', 'l08_hint_2', 'l08_hint_3'],
  canEat: (L) => L.flags.trapped,
  setup(L) {
    const { ctx } = L;
    L.flags.n = 0;
    try { prop(ctx, 'bedroomDoor')?.open?.(); } catch {}
    scratchTarget(L, 'jonBed', () => {
      // nearest point of the bed to Garfield, at claw height
      const b = prop(ctx, 'jonBed'), p = bedPos(ctx), g = ctx.controller.pos;
      const half = b?.size ? V(b.size.w / 2, 0, b.size.d / 2) : V(0.75, 0, 1.0);
      return V(THREE.MathUtils.clamp(g.x, p.x - half.x, p.x + half.x), THREE.MathUtils.clamp(g.y + 0.26, p.y, p.y + 0.8),   // (clamped: not from the living room below)
         THREE.MathUtils.clamp(g.z, p.z - half.z, p.z + half.z));
    }, () => scratchBed(L), { radius: 0.3, heightTol: 0.8, enabled: () => !L.flags.called });
    ctx.interact.register({
      id: 'bedroomDoor', radius: 1.1, heightTol: 0.6, markerHeight: 1.0,
      get label() { return 'Close the door!'; },
      getPos: (o) => (o || V()).copy(doorPos(ctx)),
      enabled: () => !L.flags.trapped && L.flags.called && insideRoom(ctx, ctx.jonAI.pos()) && !insideRoom(ctx, ctx.controller.pos),
      onInteract: () => trap(L),
    });
  },
  update(L) {
    const { ctx, ai, flags } = L;
    if (flags.trapped) L.target((o) => o.copy(L.foodPos()), { height: 0.4 });
    else if (flags.called && insideRoom(ctx, ctx.jonAI.pos())) L.target((o) => o.copy(doorPos(ctx)).setY(doorPos(ctx).y + 0.6), { height: 0.3 });
    else if (flags.called) L.target(null);
    else L.target((o) => o.copy(bedPos(ctx)), { height: 0.7 });
    // re-arm: he gave up and came back down
    if (flags.called && !flags.trapped && ai.state === 'sitEat' && ai.stateT > 1) {
      flags.called = false; flags.n = NEED - 1;
      L.obj(0, false);
      L.setObjText(0, `Scratch up Jon's bed (${flags.n}/${NEED})`);
    }
  },
  teardown(L) { try { prop(L.ctx, 'bedroomDoor')?.reset?.(); } catch {} },
});

function scratchBed(L) {
  const { ctx, ai } = L;
  L.flags.n++;
  const n = L.flags.n;
  try { prop(ctx, 'jonBed')?.shred?.(Math.min(3, n)); } catch {}
  ctx.audio?.sfx?.('rip');
  L.setObjText(0, `Scratch up Jon's bed (${Math.min(n, NEED)}/${NEED})`);
  L.progress();
  if (n < NEED) return;
  L.flags.called = true;
  L.obj(0);
  L.say('j_bed_hear', { force: true });
  L.say('g_door_1', { delay: 3 });
  const bed = bedPos(ctx);
  ai.investigate(bed, {
    dur: 14, standOff: 0.9, arriveLine: 'j_bed_see', lookLines: [null, 'j_huh_1', null, 'j_huh_2'],
  });
}

async function trap(L) {
  const { ctx, ai } = L;
  L.flags.trapped = true;
  L.obj(1);
  const door = prop(ctx, 'bedroomDoor');
  ctx.audio?.sfx?.('door');
  try { await door?.close?.(); } catch {}
  // Keep Jon inside the room if he was standing in the doorway.
  const ins = apos(ctx, 'bedroomInside');
  if (ins && ctx.jon.root.position.distanceTo(doorPos(ctx)) < 0.6) ctx.jon.root.position.copy(ins);
  ai.trap();
  L.say('g_escape_2', { delay: 1.5 });
}
