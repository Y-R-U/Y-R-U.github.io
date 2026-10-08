import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos, anchor, scratchTarget, platePos, tableBox, inBoxXZ } from './common.js';
import { sillHelpers, vaseLevel, intoRoom } from './shared.js';
import { legPositions, dodgeFall } from './l02.js';
import { bedPos, doorPos, insideRoom } from './l08.js';
import { fallDir } from './l10.js';
import { fridgeTopPos, climbRoute, addBreadBin, onFridge, GRIP } from './l05.js';
import { bestShot } from '../game/shots.js';

// Chapter One Free Play (BRIEF2, D21; docs/LEVELS2.md §1): no objectives. Jon has a day of his own (wander / sit at
// the table NOT eating / sulk / look around). Every Ch1 trick works; knockouts recover after 10 s; trapped = 60 s or
// until Garfield opens the door. Garfield can open/close the bedroom door and the fridge.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rnd = (a, b) => a + Math.random() * (b - a);
export const FP1 = { knockout: 10, trapped: 60, curtainsMend: 60 };
const FOODS = ['steak', 'lasagna', 'meatloaf'];

const level = defineLevel({
  id: 'fp1', food: 'steak', title: 'Free Play', objectives: [], hints: [],
  jonStart: 'custom', guard: false, freePlay: true,
  canEat: (L) => !L.flags.eaten && !(L.ai.state === 'sitIdle' && L.ai.seated()),
  foodEnabled: (L) => !L.flags.eaten,
  guardLabel: "Jon's right there!",
  onAte: (L) => {
    L.flags.eaten = true;
    const c = L.ctx.controller;
    c.setBelly(Math.min(1, c.belly + 0.1));
    L.ctx.save.data.belly = c.belly;
    L.ctx.ui?.hud?.set?.({ belly: c.belly });
  },
  setup(L) {
    const { ctx, ai } = L;
    L.showMarker = false;
    L.flags.food = FOODS[Math.floor(Math.random() * FOODS.length)];
    ctx.world.setFood?.(L.flags.food);
    L.spec.food = L.flags.food;
    try { prop(ctx, 'bedroomDoor')?.open?.(); } catch {}
    ctx.ui?.hud?.set?.({ freePlay: 'Free Play' });
    ai.setHome({ type: 'custom', fn: () => nextActivity(L) });
    setupChair(L);
    setupVase(L);
    setupCurtains(L);
    setupWindow(L);
    setupBed(L);
    setupFridge(L);
    setupBumps(L);
    setupVine(L);
    ai.reactHook = (zone, info) => reactHook(L, zone, info);
    L.flags.api = { sitIdle: () => sitIdle(L), chairFall: (o) => chairFall(L, o), next: () => nextActivity(L), toggleDoor: () => toggleDoor(L) };
    ai.zoneOverride = () => (nearShards(L) ? 'leg' : null);
  },
  start(L) {
    L.say('fp1_g_start', { delay: 1.0, force: true });
    nextActivity(L);
  },
  update(L, dt) {
    const { ai, flags } = L;
    if ((ai.state === 'wander' || ai.state === 'sulk') && L.t > (flags.actEnd || 0)) ai.goHome();
    updateTrapped(L);
    updateBumps(L);
    if (flags.swinging) updateSwing(L, dt);
    if (flags.curtainsAt && L.t - flags.curtainsAt > FP1.curtainsMend && ai.state !== 'investigate') {
      flags.curtainsAt = 0; flags.curtainN = 0;
      try { prop(L.ctx, 'curtains')?.reset?.(); } catch {}
    }
  },
  teardown(L) {
    const { ctx } = L;
    ctx.controller.animHold = false;
    ctx.ui?.hud?.set?.({ freePlay: null });
    try { prop(ctx, 'bedroomDoor')?.reset?.(); prop(ctx, 'fridge')?.close?.(); prop(ctx, 'window')?.close?.(); prop(ctx, 'curtains')?.wave?.(false); prop(ctx, 'vine')?.reset?.(); } catch {}
    const b = L.flags.breadBin;
    if (b) { b.g.parent?.remove(b.g); ctx.world.removeCollider?.('breadBin'); }
  },
});
export default level;

// ---------------------------------------------------------------- Jon's day
const ACTS = ['wander', 'sit', 'sit', 'sulk', 'look'];
function nextActivity(L) {
  const { ai } = L;
  let a;
  do a = ACTS[Math.floor(Math.random() * ACTS.length)]; while (a === L.flags.lastAct && Math.random() < 0.85);
  L.flags.lastAct = a;
  if (a === 'wander') { ai.wander(); L.flags.actEnd = L.t + rnd(40, 70); L.say('fp1_j_wander', { delay: 2 }); }
  else if (a === 'sulk') { ai.sulk('loungeChair'); L.flags.actEnd = L.t + rnd(20, 30); }
  else if (a === 'look') {
    const spot = ['window', 'fridgeFront', 'tv', 'stairsBottom'].filter((n) => anchor(L.ctx, n))[Math.floor(Math.random() * 4)] || 'tv';
    ai.investigate(spot, { dur: rnd(4, 7), lookLines: [null, 'j_huh_1'] });
  } else sitIdle(L);
}

function sitIdle(L) {
  const { ctx, ai } = L;
  const seat = prop(ctx, 'chair')?.seat;
  const dur = rnd(30, 50);
  ai.run('sitIdle', async (t) => {
    if (L.flags.eaten) { L.flags.eaten = false; try { ctx.world.setFood?.(L.flags.food); } catch {} L.flags.refill = true; }
    if (!ai.seated()) {
      if (seat && ctx.jon.sitAt) {
        await t.walkTo(ai.seatFront(), { arrive: 0.12 });
        const f = ai.seatFront(), s = seat.getWorldPosition(V()).setY(0);
        await t.face(f.clone().add(V().subVectors(f, s).setLength(1)), 0.3);
        ctx.jon.sitAt(seat, 'sit');
      } else {
        await t.walkTo(ai.standSpot());
      }
    }
    ctx.jon.holdProp?.(null);
    t.loop('sit', { fallback: 'idle' });
    if (L.flags.refill) { L.flags.refill = false; t.say('fp1_j_refill', { force: true }); }
    const end = L.t + dur;
    while (L.t < end) {
      await t.wait(rnd(9, 14));
      if (Math.random() < 0.7) t.say('fp1_j_sit');
    }
    await ai.standUp(t);
    ai.goHome();
  }, { name: 'sitIdle' });
}

// 10 s knockout, then back to his day
function recover(L, t, clip = 'stunned_shake') {
  return (async () => {
    await t.wait(FP1.knockout);
    t.say('fp1_j_recover', { force: true });
    try { L.ctx.jon.setExpression?.('sad'); } catch {}
    await t.play(clip, 1.0, { fallback: 'idle' });
  })();
}

// ---------------------------------------------------------------- chair falls (leg scratch / vine face scratch)
function seatedIdle(L) { return L.ai.state === 'sitIdle' && L.ai.seated(); }

function setupChair(L) {
  [0, 1].forEach((i) => scratchTarget(L, 'chairLegBack' + i, () => legPositions(L.ctx)[i], () => chairFall(L, { leg: i }), { radius: 0.22, enabled: () => seatedIdle(L) }));
}

function chairFall(L, { leg = 0, vine = false } = {}) {
  const { ctx, ai } = L;
  if (L.flags.falling) return;
  L.flags.falling = true;
  const chair = prop(ctx, 'chair');
  ai.run('down', async (t) => {
    try { ctx.jon.setExpression?.(vine ? 'pain' : 'shock'); } catch {}
    if (vine) { t.say('fp1_j_fall_vine', { force: true }); ctx.audio?.sfx?.('yowl', { vol: 0.5 }); }
    else {
      ctx.audio?.sfx?.('crack');
      try { chair?.breakLeg?.(leg); } catch (e) { console.warn(e); }
      t.say('j_chair_crack', { force: true });
      await t.wait(0.9);
      dodgeFall(L);
      t.say('j_chair_fall', { force: true });
    }
    try { chair?.fallBack?.(); } catch (e) { console.warn(e); }
    await t.play('fall_back_chair', 1.3, { fallback: 'sit' });
    ctx.audio?.sfx?.('crash');
    ctx.camera?.shake?.(0.1);
    try { ctx.jon.setExpression?.('dizzy'); } catch {}
    L.say('g_jon_down', { delay: 1.5 });
    await t.wait(FP1.knockout);
    t.say('fp1_j_recover', { force: true });
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
    }
    try { chair?.reset?.(); } catch {}
    try { ctx.jon.setExpression?.('happy'); } catch {}
    await ai.standUp(t);
    await t.play('scratch_head', 1.0, { fallback: 'idle' });
    L.flags.falling = false;
    ai.goHome();
  }, { interruptible: false });
}

// ---------------------------------------------------------------- vase + slip
function setupVase(L) {
  const { ai } = L;
  L.flags.sill = sillHelpers(L);
  vaseLevel(L, {
    objIndex: 0, spareLine: 'j_vase_spare', homeStates: ['wander', 'sitIdle', 'sulk', 'investigate'],
    onBroken: (frag) => {
      if (!ai.canReact() || ['down', 'stunned', 'faceplant', 'trapped', 'hopToShards'].includes(ai.state)) return;
      L.say('j_vase_hear', { force: true });
      ai.investigate(frag, { dur: 14, standOff: 0.75, arriveLine: 'j_vase_see', lookLines: [null, 'j_vase_sweep', null, 'j_huh_2'] });
    },
  });
}
function nearShards(L) {
  const f = L.flags.frag;
  if (!L.flags.vaseBroken || !f) return false;
  const j = L.ai.pos();
  return Math.hypot(j.x - f.x, j.z - f.z) < 2.5 && !L.ai.seated();
}
function slip(L) {
  const { ctx, ai } = L;
  const frag = L.flags.frag.clone();
  ai.run('hopToShards', async (t) => {
    try { ctx.jon.setExpression?.('pain'); } catch {}
    t.say('j_leg', { force: true });
    t.loop('hop_leg', { fallback: 'idle' });
    const dir = fallDir(ctx, frag, ai.pos());
    await t.walkTo(frag.clone().addScaledVector(dir, -0.45).setY(0), { speed: 1.1, arrive: 0.12 });
    await t.face(frag.clone().addScaledVector(dir, 2), 0.25);
    t.say('j_slip', { force: true });
    ctx.audio?.sfx?.('slip');
    await t.play('slip_faceplant', 1.5, { fallback: 'idle' });
    ctx.audio?.sfx?.('crash');
    t.say('j_faceplant', { force: true });
    try { ctx.jon.setExpression?.('dizzy'); } catch {}
    t.loop('lie_still', { fallback: 'idle' });
    L.say('g_jon_down', { delay: 2.5 });
    await recover(L, t, 'idle');
    try { ctx.jon.setExpression?.('happy'); } catch {}
    ai.goHome();
  }, { interruptible: false });
}

function reactHook(L, zone) {
  const { ctx, ai } = L;
  if (nearShards(L)) { slip(L); return true; }
  if (seatedIdle(L) && zone === 'leg') {
    const g = ctx.controller.pos;
    const d = legPositions(ctx).map((p) => Math.hypot(p.x - g.x, p.z - g.z));
    if (Math.min(...d) < 0.55) { chairFall(L, { leg: d[0] <= d[1] ? 0 : 1 }); return true; }
  }
  return false;
}

// ---------------------------------------------------------------- curtains
function setupCurtains(L) {
  const { ctx, ai } = L;
  L.flags.curtainN = 0;
  const cpos = () => apos(ctx, 'curtains') || V(0.2, 0, 2.7);
  scratchTarget(L, 'curtains', () => {
    const p = cpos().clone(), g = ctx.controller.pos;
    p.y = Math.min(g.y + 0.26, 1.7);
    const along = V(0, 0, 1), a = anchor(ctx, 'curtains');
    if (a?.rotY != null) along.set(Math.cos(a.rotY), 0, -Math.sin(a.rotY));
    return p.addScaledVector(along, THREE.MathUtils.clamp(V().subVectors(g, p).dot(along), -0.9, 0.9));
  }, () => {
    const n = ++L.flags.curtainN;
    try { prop(ctx, 'curtains')?.shred?.(Math.min(3, n)); } catch {}
    ctx.audio?.sfx?.('rip');
    if (n === 4) {
      L.flags.curtainsAt = L.t;
      if (!ai.canReact() || ['down', 'stunned', 'trapped', 'hopToShards'].includes(ai.state)) return;
      L.say('j_curtain_see', { force: true });
      ai.investigate(cpos(), { dur: 8, lookLines: [null, 'j_curtain_fix'], standOff: 0.9 });
    }
  }, { radius: 0.4, heightTol: 1.2, enabled: () => L.flags.curtainN < 4 });
}

// ---------------------------------------------------------------- window
function setupWindow(L) {
  const { ctx, ai } = L;
  const sill = L.flags.sill;
  ctx.interact.register({
    id: 'window', label: 'Open the window', radius: 0.95, heightTol: 0.5,
    getPos: (o) => (o || V()).copy(sill.pos()),
    enabled: () => sill.isOn() && !L.flags.winOpen,
    onInteract: () => {
      L.flags.winOpen = true;
      try { prop(ctx, 'window')?.open?.(); prop(ctx, 'curtains')?.wave?.(true); } catch {}
      ctx.audio?.sfx?.('wind', { vol: 0.8 });
      const sillP = sill.pos(), stand = sillP.clone().setY(0).addScaledVector(intoRoom(ctx), 0.55);
      const closeIt = async () => { try { await prop(ctx, 'window')?.close?.(); prop(ctx, 'curtains')?.wave?.(false); } catch {} L.flags.winOpen = false; };
      if (!ai.canReact() || ['down', 'stunned', 'trapped', 'hopToShards', 'faceplant'].includes(ai.state)) { setTimeout(() => { if (!L.dead) closeIt(); }, 15000); return; }
      ai.run('cold', async (t) => {
        await t.wait(1.5);
        t.say('j_cold_1', { force: true });
        await ai.standUp(t);
        t.say('j_cold_2', { force: true });
        await t.walkTo(stand, { arrive: 0.25 });
        await t.face(sillP);
        if (sill.isOn()) {
          t.say('j_shoo', { force: true });
          const away = V().subVectors(ctx.controller.pos, apos(ctx, 'window') || sillP).setY(0);
          away.x *= 0.3; if (away.lengthSq() < 1e-4) away.set(0, 0, 1);
          ctx.controller.knockback(away.normalize(), 3.4);
          await t.wait(0.6);
        }
        await t.play('close_window', 1.4, { fallback: 'idle' });
        await closeIt();
        t.say('j_cold_3', { force: true });
        await t.play('stunned_shake', 2, { fallback: 'idle' });
        ai.goHome();
      });
    },
  });
}

// ---------------------------------------------------------------- bed + bedroom door (trap)
function setupBed(L) {
  const { ctx, ai } = L;
  L.flags.bedN = 0;
  const door = () => prop(ctx, 'bedroomDoor');
  scratchTarget(L, 'jonBed', () => {
    const b = prop(ctx, 'jonBed'), p = bedPos(ctx), g = ctx.controller.pos;
    const half = b?.size ? V(b.size.w / 2, 0, b.size.d / 2) : V(0.75, 0, 1.0);
    return V(THREE.MathUtils.clamp(g.x, p.x - half.x, p.x + half.x), THREE.MathUtils.clamp(g.y + 0.26, p.y, p.y + 0.8), THREE.MathUtils.clamp(g.z, p.z - half.z, p.z + half.z));
  }, () => {
    const n = ++L.flags.bedN;
    try { prop(ctx, 'jonBed')?.shred?.(Math.min(3, n)); } catch {}
    ctx.audio?.sfx?.('rip');
    if (n % 3 !== 0) return;
    if (!ai.canReact() || ['down', 'stunned', 'trapped', 'hopToShards', 'faceplant'].includes(ai.state)) return;
    L.say('j_bed_hear', { force: true });
    if (!door()?.state?.open) { try { door()?.open?.(); } catch {} }
    ai.investigate(bedPos(ctx), { dur: 14, standOff: 0.9, arriveLine: 'j_bed_see', lookLines: [null, 'j_huh_1', null, 'j_huh_2'] });
  }, { radius: 0.3, heightTol: 0.8 });

  ctx.interact.register({
    id: 'bedroomDoor', radius: 1.1, heightTol: 0.7, markerHeight: 1.0,
    get label() { return door()?.state?.open === false ? 'Open the door' : 'Close the door'; },
    getPos: (o) => (o || V()).copy(doorPos(ctx)),
    enabled: () => !L.flags.doorBusy,
    onInteract: () => toggleDoor(L),
  });
}

async function toggleDoor(L) {
  const { ctx, ai } = L;
  const d = prop(ctx, 'bedroomDoor');
  if (!d) return;
  L.flags.doorBusy = true;
  ctx.audio?.sfx?.('door');
  try { ctx.garfield.play?.('interact', { once: true }); } catch {}
  if (d.state?.open === false) {
    try { await d.open?.(); } catch {}
    if (ai.state === 'trapped') free(L);
  } else {
    try { await d.close?.(); } catch {}
    const jonIn = insideRoom(ctx, ai.pos()), gIn = insideRoom(ctx, ctx.controller.pos);
    if (jonIn && ai.canReact() && !['down', 'stunned', 'faceplant', 'hopToShards'].includes(ai.state)) {
      if (gIn) {
        // shut in together: Jon just lets him out
        ai.run('letout', async (t) => { await t.wait(2); t.say('j_letout', { force: true }); try { await d.open?.(); } catch {} ai.goHome(); });
      } else {
        const ins = apos(ctx, 'bedroomInside');
        if (ins && ctx.jon.root.position.distanceTo(doorPos(ctx)) < 0.6) ctx.jon.root.position.copy(ins);
        ai.trap();
        L.flags.trappedAt = L.t;
        L.say('g_escape_2', { delay: 1.5 });
      }
    }
  }
  L.flags.doorBusy = false;
}

function free(L) {
  const { ctx, ai } = L;
  L.flags.trappedAt = 0;
  L.say('fp1_j_free', { force: true });
  ai.setOff();
  ai.goHome();
  void ctx;
}

function updateTrapped(L) {
  const { ctx, ai } = L;
  if (ai.state !== 'trapped' || !L.flags.trappedAt) return;
  if (L.t - L.flags.trappedAt > FP1.trapped) {
    // he finally finds a way out: the door opens from the inside
    try { prop(ctx, 'bedroomDoor')?.open?.(); } catch {}
    ctx.audio?.sfx?.('door');
    free(L);
  }
}

// ---------------------------------------------------------------- fridge (open / close, nothing happens)
function setupFridge(L) {
  const { ctx } = L;
  const f = () => prop(ctx, 'fridge');
  const front = () => apos(ctx, 'fridgeFront') || (f()?.root ? f().root.getWorldPosition(V()).setY(0) : V(8, 0, 9));
  ctx.interact.register({
    id: 'fridge', radius: 0.85, heightTol: 0.5,
    get label() { return f()?.state?.open ? 'Close the fridge' : 'Open the fridge'; },
    getPos: (o) => (o || V()).copy(front()),
    enabled: () => !L.flags.fridgeBusy,
    onInteract: async () => {
      L.flags.fridgeBusy = true;
      ctx.audio?.sfx?.('fridge');
      try { ctx.garfield.play?.('interact', { once: true }); } catch {}
      if (f()?.state?.open) { try { await f()?.close?.(); } catch {} }
      else { try { await f()?.open?.(); } catch {} L.say('fp1_g_fridge', { delay: 0.6, chance: 0.6 }); }
      L.flags.fridgeBusy = false;
    },
  });
}

// ---------------------------------------------------------------- table bumps + chair bounce (L9)
function setupBumps(L) {
  const { ctx } = L;
  L.flags.bumps = 0; L.flags.lastBump = -9;
  const bump = () => {
    if (L.t - L.flags.lastBump < 0.35) return;
    L.flags.lastBump = L.t;
    const n = ++L.flags.bumps;
    try { prop(ctx, 'table')?.bump?.(0.6 + Math.min(n, 3) * 0.15); } catch {}
    try { ctx.garfield.play?.('belly_bounce', { once: true }); } catch {}
    ctx.audio?.sfx?.('boing', { rate: 0.8 + n * 0.05 });
    ctx.camera?.shake?.(0.06);
    if (seatedIdle(L) && n <= 3) L.say('j_bump_' + Math.min(n, 3), { force: true });
    if (n === 3) L.say('g_l09_ready', { delay: 1.8 });
  };
  ctx.events.on('bonk', (e) => { if (/table/i.test(e?.surfaceId || '')) bump(); });
  ctx.events.on('jump', (e) => {
    const b = tableBox(ctx);
    if (inBoxXZ(e?.pos || ctx.controller.pos, b, -0.05) && ctx.controller.pos.y < 0.2) setTimeout(() => {
      if (!L.dead && L.t - L.flags.lastBump > 0.35 && inBoxXZ(ctx.controller.pos, b, 0)) bump();
    }, 220);
  });
}
function updateBumps(L) {
  const { ctx, ai, flags } = L;
  const c = prop(ctx, 'chair');
  const cc = c?.root ? c.root.getWorldPosition(V()).setY(0) : (anchor(ctx, 'jonChair')?.pos.clone().setY(0) || V(4.4, 0, 8));
  const g = ctx.controller.pos;
  const under = g.y < 0.2 && Math.hypot(g.x - cc.x, g.z - cc.z) < 0.42;
  if (under && !flags.underLatch) {
    flags.underLatch = true;
    if (!seatedIdle(L)) return;
    if (flags.bumps < 3) { ctx.audio?.sfx?.('creak'); L.say('g_l09_early', { force: true }); return; }
    flags.bumps = 0;
    ctx.audio?.sfx?.('boing');
    try { c?.bounce?.(0.35); } catch {}
    ai.run('stunned', async (t) => {
      t.say('j_chair_bounce', { force: true });
      try { ctx.jon.setExpression?.('shock'); } catch {}
      await t.wait(0.7);
      ctx.audio?.sfx?.('crash', { vol: 0.5 });
      try { ctx.jon.setExpression?.('dizzy'); } catch {}
      t.loop('stunned_shake', { fallback: 'idle' });
      t.say('j_stunned', { force: true });
      await t.wait(FP1.knockout);
      t.say('fp1_j_recover', { force: true });
      try { ctx.jon.setExpression?.('happy'); } catch {}
      await ai.standUp(t);
      ai.goHome();
    }, { interruptible: false });
  }
  if (!under) flags.underLatch = false;
}

// ---------------------------------------------------------------- vine swing → scratch seated Jon's face
function setupVine(L) {
  const { ctx } = L;
  if (!climbRoute(ctx)) addBreadBin(L);
  ctx.interact.register({
    id: 'vine', label: 'Grab the vine!', radius: 0.8, heightTol: 0.35,
    getPos: (o) => { const v = prop(ctx, 'vine'); return (o || V()).copy(v?.grabPoint ? v.grabPoint.clone().setY(fridgeTopPos(ctx).y) : fridgeTopPos(ctx)); },
    enabled: () => !L.flags.swinging && onFridge(L),
    onInteract: () => startSwing(L),
  });
}

const SLOW = 0.8;
function jonHead(L) {
  const h = L.ctx.jon.sockets?.head;
  return h ? h.getWorldPosition(V()) : L.ai.pos().setY(1.25);
}
function tipAt(L, t) {
  const vine = prop(L.ctx, 'vine');
  if (vine?.swingAngle) return vine.swingAngle(vine.theta0 * Math.cos(vine.omega * SLOW * t)).clone();
  const a = fridgeTopPos(L.ctx).add(V(0, 0.42, 0)), b = platePos(L.ctx).add(V(0, 0.55, 0));
  const s = (1 - Math.cos(2.2 * SLOW * t)) / 2;
  return a.lerp(b.addScaledVector(V(b.x - a.x, 0, b.z - a.z).normalize(), 0.6), s);
}
// How close does the swing ever get to Jon's head? The "over Jon" radius adapts so it's always reachable.
function overRadius(L) {
  const vine = prop(L.ctx, 'vine'), head = jonHead(L);
  if (!vine?.swingAngle) return 0.8;
  let best = 9;
  for (let k = 0; k <= 40; k++) {
    const tip = vine.swingAngle(vine.theta0 * Math.cos((k / 40) * Math.PI)).clone();
    best = Math.min(best, flat(tip, head));
  }
  vine.swingAngle(vine.theta0);
  return Math.max(0.65, best + 0.3);
}

function startSwing(L) {
  const { ctx } = L;
  const vine = prop(ctx, 'vine');
  L.flags.swinging = true; L.flags.st = 0; L.flags.passes = 0; L.flags.lastSide = 1; L.flags.hitJon = false;
  L.flags.overR = overRadius(L);
  ctx.controller.lock(true);
  ctx.controller.animHold = true;
  if (vine) { vine.autoSwing = false; vine.grab?.(); }
  try { ctx.garfield.play?.('hang', { fade: 0.12 }); } catch {}
  L.say('fp1_g_vine', { force: true });
  try {
    const a = fridgeTopPos(ctx), b = platePos(ctx);
    const look = a.clone().lerp(b, 0.55); look.y = (a.y + b.y) / 2 + 0.25;
    const dir = V(b.x - a.x, 0, b.z - a.z).normalize();
    ctx.camera.shot(bestShot(ctx, look, { dist: 3.0, h: 0.4, prefer: Math.atan2(-dir.z, dir.x), min: 1.6 }), { dur: 0.7 });
  } catch {}
}

function updateSwing(L, dt) {
  const { ctx } = L;
  const c = ctx.controller, g = ctx.garfield, vine = prop(ctx, 'vine');
  L.flags.st += dt * (L.flags.over ? 0.45 : 1);
  const tip = tipAt(L, L.flags.st);
  const dir = vine?.dirH || V(0, 0, -1);
  const yaw = Math.atan2(dir.x, dir.z);
  g.root.rotation.y = yaw;
  const grip = GRIP.clone().applyAxisAngle(V(0, 1, 0), yaw);
  const gy = ctx.world.groundAt?.(tip.x - grip.x, tip.z - grip.z, tip.y) ?? 0;
  const lift = Math.max(0, gy + 0.04 - (tip.y - grip.y));
  if (lift > 0) tip.y += lift;
  c.pos.set(tip.x - grip.x, tip.y - grip.y, tip.z - grip.z);
  c.vel.set(0, 0, 0);
  const canHit = seatedIdle(L) && !L.flags.hitJon;
  const over = canHit && flat(tip, jonHead(L)) < L.flags.overR;
  L.flags.over = over;
  if (over) L.flags.overAt = L.t;
  ctx.ui?.hud?.set?.({ interactLabel: over ? 'SCRATCH!' : null });
  const phase = (vine?.omega || 2.2) * SLOW * L.flags.st;
  const side = Math.sign(Math.sin(phase)) || 1;
  if (side !== L.flags.lastSide) { L.flags.lastSide = side; L.flags.passes++; }
  const pressed = L.flags.st > 0.4 && (ctx.input?.jumpPressed || ctx.input?.interact || ctx.input?.scratch);
  if (pressed && canHit && (over || L.t - (L.flags.overAt ?? -9) < 0.3)) {
    L.flags.hitJon = true;
    ctx.audio?.sfx?.('swipe');
    try { g.claw?.(true); setTimeout(() => g.claw?.(false), 500); } catch {}
    ctx.events.emit('jonReact', { zone: 'face' });
    chairFall(L, { vine: true });
  }
  const back = Math.cos(phase) > 0.995 && L.flags.st > 1;
  if (back && (L.flags.hitJon || L.flags.passes >= 6)) endSwing(L);
}

function endSwing(L) {
  const { ctx } = L;
  const vine = prop(ctx, 'vine');
  L.flags.swinging = false; L.flags.over = false;
  try { vine?.release?.(); vine && (vine.autoSwing = true); vine?.reset?.(); } catch {}
  const ft = fridgeTopPos(ctx);
  const land = vine?.grabPoint ? vine.grabPoint.clone().setY(ft.y).lerp(ft, 0.4) : ft.clone();
  ctx.controller.teleport(land.setY(ft.y + 0.05), ctx.garfield.root.rotation.y + Math.PI);
  ctx.controller.animHold = false;
  ctx.controller.lock(false);
  ctx.camera.follow?.({ dur: 0.6 });
  ctx.ui?.hud?.set?.({ interactLabel: null });
}
