import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos, anchor, orbitShot, platePos, fromOpenFloor } from './common.js';
import { sillHelpers, vaseLevel } from './shared.js';
import { LINES } from '../game/lines.js';

// Finale: pan goes in the fridge. Vase off the sill → Jon comes to look → scratch him by the shards → he slips
// and faceplants → open the fridge → eat the lasagna.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const SLIP_RADIUS = 2.5;

const fridgeFront = (ctx) => {
  const a = apos(ctx, 'fridgeFront');
  if (a) return a;
  const f = prop(ctx, 'fridge');
  return f?.root ? f.root.getWorldPosition(V()).setY(0) : V(8.0, 0, 9.0);
};
const panInFridge = (ctx) => {
  const f = prop(ctx, 'fridge'), pan = prop(ctx, 'pan');
  if (pan?.pos?.lengthSq() && pan.state?.inFridge) return pan.pos.clone();
  if (f?.slotPos) return f.slotPos(V());
  return fridgeFront(ctx).setY(0.9);
};

export default defineLevel({
  id: 10, food: 'lasagna', title: 'The Fridge Job',
  objectives: ['Knock the vase off the windowsill', 'Scratch Jon by the broken vase', 'Open the fridge', 'Eat the lasagna'],
  hints: ['l10_hint_1', 'l10_hint_2', 'l10_hint_3'],
  jonStart: 'sulk', sulkAnchor: 'loungeChair',
  guard: false,
  canEat: (L) => L.flags.fridgeOpen && L.ai.state === 'faceplant',
  foodEnabled: (L) => L.flags.fridgeOpen,
  foodPos: (L) => { const p = fridgeFront(L.ctx); return p; },
  eatHeightTol: 0.6,
  eatRadius: 0.8,
  eatProp: (L) => prop(L.ctx, 'pan'),

  async intro(ctx) { await playL10Extra(ctx); },

  setup(L) {
    const { ctx, ai } = L;
    // If the cutscene was skipped the pan still needs to be in the fridge.
    L.flags.ensurePan = () => {
      const pan = prop(ctx, 'pan'), f = prop(ctx, 'fridge');
      if (pan && !pan.state?.inFridge) {
        try { pan.serveScoop?.(0.01); } catch {}
        const slot = pan.fridgeSlot || f?.slot;
        if (slot) { slot.add(pan.root); pan.root.position.set(0, 0, 0); pan.root.rotation.set(0, 0, 0); pan.state.inFridge = true; }
      }
      try { prop(ctx, 'plate')?.eaten?.(1); } catch {}
    };
    const sill = sillHelpers(L);
    L.flags.sill = sill;
    vaseLevel(L, {
      objIndex: 0, spareLine: 'j_vase_spare2', homeStates: ['sulk'],
      onBroken: (frag) => {
        L.say('j_vase_hear', { force: true });
        ai.investigate(frag, { dur: 20, standOff: 0.75, arriveLine: 'j_vase_see2', lookLines: [null, 'j_vase_sweep', null, 'j_huh_2'] });
      },
    });
    // Any scratch on Jon while he's near the shards → hop onto them → slip → faceplant.
    ai.zoneOverride = () => (nearShards(L) ? 'leg' : null);
    ai.reactHook = (zone) => {
      if (!nearShards(L)) return false;
      slip(L);
      return true;
    };
    ctx.interact.register({
      id: 'fridge', radius: 0.85, heightTol: 0.5,
      get label() { return 'Open the fridge'; },
      getPos: (o) => (o || V()).copy(fridgeFront(ctx)),
      enabled: () => !L.flags.fridgeOpen && !L.flags.fridgeBusy,
      onInteract: () => openFridge(L),
    });
  },
  start(L) {
    L.flags.ensurePan();
    // he paws the pan out of the fridge onto the floor and eats it there (not off a shelf at head height)
    L.ctx.events.on('eatStart', () => {
      const pan = prop(L.ctx, 'pan'), g = L.ctx.garfield.root;
      if (!pan?.root) return;
      L.ctx.world.scene.attach(pan.root);
      const fwd = V(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
      pan.root.position.copy(g.position).addScaledVector(fwd, 0.36).setY(0.005);
      pan.root.rotation.set(0, g.rotation.y, 0);
      L.ctx.audio?.sfx?.('land', { vol: 0.4 });
    });
  },
  update(L) {
    const { ctx, ai, flags } = L;
    if (flags.fridgeOpen && ai.state === 'faceplant') L.target((o) => o.copy(panInFridge(ctx)), { height: 0.3 });
    else if (ai.state === 'faceplant') L.target((o) => o.copy(fridgeFront(ctx)).setY(0.9), { height: 0.4 });
    else if (flags.vaseBroken && nearShards(L)) L.target((o) => o.copy(ctx.jonAI.pos()).setY(1.0), { height: 0.3 });
    else if (!flags.vaseBroken) L.target((o) => o.copy(flags.vasePos()), { height: 0.45 });
    else L.target(null);
  },
  teardown(L) { try { prop(L.ctx, 'fridge')?.close?.(); } catch {} },
});

function nearShards(L) {
  const f = L.flags.frag;
  if (!L.flags.vaseBroken || !f) return false;
  const j = L.ctx.jonAI.pos();
  return Math.hypot(j.x - f.x, j.z - f.z) < SLIP_RADIUS && L.ai.state !== 'faceplant';
}

function slip(L) {
  const { ctx, ai } = L;
  if (L.flags.slipping) return;
  L.flags.slipping = true;
  L.flags.noRearm = true;
  const frag = L.flags.frag.clone();
  ai.run('hopToShards', async (t) => {
    try { ctx.jon.setExpression?.('pain'); } catch {}
    t.say('j_leg', { force: true });
    t.loop('hop_leg', { fallback: 'idle' });
    // he falls ~1.4 m forward: hop to a spot behind the shards so he lands ON them, facing open floor
    const dir = fallDir(ctx, frag, ai.pos());
    const start = frag.clone().addScaledVector(dir, -0.45).setY(0);
    await t.walkTo(start, { speed: 1.1, arrive: 0.12 });
    await t.face(frag.clone().addScaledVector(dir, 2), 0.25);
    L.obj(1);
    ai.faceplant();
    L.say('g_jon_down', { delay: 2.5 });
  }, { interruptible: false });
}

// Clear direction for Jon's faceplant (body + head reach ~1.5 m forward of his feet), preferring his approach direction.
function fallDir(ctx, frag, from) {
  const cols = (ctx.world.colliders || []).filter((c) => c.enabled !== false && c.max.y > 0.12 && c.min.y < 0.6);
  const app = V(frag.x - from.x, 0, frag.z - from.z);
  if (app.lengthSq() < 1e-4) app.set(0, 0, 1);
  app.normalize();
  let best = app.clone(), bestS = -Infinity;
  for (let k = 0; k < 24; k++) {
    const a = k / 24 * Math.PI * 2, d = V(Math.sin(a), 0, Math.cos(a));
    let ok = true;
    for (let s = 0.2; s <= 1.6 && ok; s += 0.1) {
      const x = frag.x + d.x * s, z = frag.z + d.z * s;
      for (const c of cols) if (x > c.min.x - 0.22 && x < c.max.x + 0.22 && z > c.min.z - 0.22 && z < c.max.z + 0.22) { ok = false; break; }
    }
    if (!ok) continue;
    const sc = d.dot(app);
    if (sc > bestS) { bestS = sc; best = d; }
  }
  return best;
}

async function openFridge(L) {
  const { ctx, ai } = L;
  const f = prop(ctx, 'fridge');
  if (ai.state !== 'faceplant') {
    // Jon's still up: he sees, the fridge shuts, and he chases.
    L.flags.fridgeBusy = true;
    try { await f?.open?.(); } catch {}
    L.say('j_fridge_hey', { force: true });
    setTimeout(async () => { try { await f?.close?.(); } catch {} L.flags.fridgeBusy = false; }, 700);
    if (ai.canReact()) ai.chase();
    return;
  }
  L.flags.fridgeOpen = true;
  L.obj(2);
  ctx.audio?.sfx?.('fridge');
  try { await f?.open?.(); } catch {}
}

// "You won't let me eat my food…" — Jon puts the pan in the fridge and sulks.
async function playL10Extra(ctx) {
  const { jon, garfield, director } = ctx;
  const pan = prop(ctx, 'pan'), fridge = prop(ctx, 'fridge');
  const ff = fridgeFront(ctx);
  const seat = anchor(ctx, 'jonSeat') || anchor(ctx, 'jonChair');
  const say = (d, who, key) => d.say(who, key, { text: ctx.audio?.voLines?.[key]?.text || LINES[key]?.text });
  await director.run(async (d) => {
    const plate = platePos(ctx);
    // Jon stands up from the table and faces Garfield
    const chair = anchor(ctx, 'jonChair') || seat;
    const stand = chair ? V(chair.pos.x, 0, chair.pos.z).add(V(Math.sin(seat.rotY || 0), 0, Math.cos(seat.rotY || 0)).multiplyScalar(-0.55)) : V(6.2, 0, 8.9);
    if (ctx.jonAI?.seated?.()) {
      await d.play(jon, 'stand_up', { once: true, max: 1.2 });
      ctx.jonAI.leave();
    } else d.place(jon, stand);
    await d.face(jon, garfield.root.position.clone());
    await d.face(garfield, jon.root.getWorldPosition(V()));
    const mid = jon.root.position.clone().lerp(garfield.root.position, 0.5);
    d.cut(orbitShot(mid.setY(0.9), Math.atan2(garfield.root.position.x - jon.root.position.x, garfield.root.position.z - jon.root.position.z) + Math.PI / 2, 3.0, 0.4, ctx));
    try { jon.setExpression?.('angry'); } catch {}
    jon.play?.('talk_angry');
    await say(d, 'jon', 'j_l10_1');
    // pan → fridge
    jon.play?.('walk');
    d.cut(fromOpenFloor(ctx, ff.clone().setY(1.0), 1.55));
    await d.walk(jon, ff.clone().add(V(plate.x - ff.x, 0, plate.z - ff.z).setLength(0.75)), { faceEnd: false });
    await d.face(jon, ff);
    try { fridge?.open?.(); } catch {}
    d.sfx('fridge');
    await d.play(jon, 'open_fridge', { once: true, max: 1.2 });
    const putP = d.play(jon, 'put_in_fridge', { once: true, max: 1.5 });
    try { await Promise.race([pan?.toFridge?.(), new Promise((r) => setTimeout(r, 1200))]); } catch {}
    await putP;
    try { await fridge?.close?.(); } catch {}
    try { jon.setExpression?.('happy'); } catch {}
    await say(d, 'jon', 'j_l10_2');
    d.cut(orbitShot(garfield.root.position.clone().setY(0.3), garfield.root.rotation.y + 0.3, 1.4, 0.35, ctx));
    try { garfield.setExpression?.('smug'); } catch {}
    await say(d, 'garfield', 'g_l10_1');
  });
  try { jon.setExpression?.('sad'); } catch {}
}
