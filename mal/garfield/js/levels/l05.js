import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos } from './common.js';
import { bestShot } from '../game/shots.js';

// Climb to the fridge top → grab the vine → swing over the table → Space over the pan to catch it → eat it up top.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GRIP = V(0, 0.82, -0.07);   // paws midpoint in Garfield's root space during the 'hang' clip
const SLOW = 0.8;           // swing slower than real physics, for small hands
const PASSES = 6;
const OVER_R = 0.65;       // generous catch radius around the pan
const OVER_SLOW = 0.4;     // time runs slower while over the pan

function fridgeBox(ctx) {
  let best = null;
  for (const c of ctx.world.colliders || []) {
    if (c.enabled === false || !/fridge/i.test(c.id)) continue;
    if (c.max.y > 1.6 && (!best || c.max.y > best.max.y)) best = c;
  }
  return best;
}
export function fridgeTopPos(ctx) {
  const a = apos(ctx, 'fridgeTop');
  if (a) return a;
  const b = fridgeBox(ctx);
  return b ? V((b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2) : V(8.75, 1.85, 9.0);
}
const panPos = (ctx) => { const p = prop(ctx, 'pan'); return p?.pos?.lengthSq() ? p.pos.clone() : apos(ctx, 'panSpot', apos(ctx, 'plateSpot', V(6.2, 0.76, 7.3))); };

// Shortest chain of standable boxes from the floor to the fridge top (each step ≤ 0.9 up, ≤ 0.55 gap).
function climbRoute(ctx) {
  const fb = fridgeBox(ctx);
  if (!fb) return null;
  const cs = (ctx.world.colliders || []).filter((c) => c.enabled !== false && !c.noWalk && c.max.y > 0.2 && c.max.y <= fb.max.y + 0.01
    && (c.max.x - c.min.x) > 0.12 && (c.max.z - c.min.z) > 0.12 && !(c.max.y - c.min.y > 2.2));
  const gap = (a, b) => Math.hypot(Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x), Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z));
  const start = cs.filter((c) => c.max.y <= 0.95);
  const prev = new Map(); const q = [...start]; start.forEach((c) => prev.set(c, null));
  while (q.length) {
    const a = q.shift();
    if (a === fb) break;
    for (const b of cs) {
      if (prev.has(b)) continue;
      const up = b.max.y - a.max.y;
      if (up > 0.9 || up < -0.1 || gap(a, b) > 0.55) continue;
      prev.set(b, a); q.push(b);
    }
  }
  if (!prev.has(fb)) return null;
  const route = []; for (let c = fb; c; c = prev.get(c)) route.unshift(c);
  return route;
}

function addBreadBin(L) {
  const { ctx } = L;
  const fb = fridgeBox(ctx);
  if (!fb) return;
  // nearest counter-height box beside the fridge
  let counter = null, bd = Infinity;
  const fc = V((fb.min.x + fb.max.x) / 2, 0, (fb.min.z + fb.max.z) / 2);
  for (const c of ctx.world.colliders || []) {
    if (c === fb || c.enabled === false || c.max.y < 0.8 || c.max.y > 1.0) continue;
    const cc = V((c.min.x + c.max.x) / 2, 0, (c.min.z + c.max.z) / 2);
    const d = cc.distanceTo(fc);
    if (d < bd && d < 2.5) { bd = d; counter = c; }
  }
  if (!counter) return;
  const W = 0.34, D = 0.28, H = 0.36;
  // place on the counter, as close to the fridge as fits
  const cx = THREE.MathUtils.clamp(fc.x, counter.min.x + W / 2, counter.max.x - W / 2);
  const cz = THREE.MathUtils.clamp(fc.z, counter.min.z + D / 2, counter.max.z - D / 2);
  const y0 = counter.max.y;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), new THREE.MeshStandardMaterial({ color: 0xd9433a, roughness: 0.45, metalness: 0.1 }));
  body.position.y = H / 2; body.castShadow = body.receiveShadow = true;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(D / 2, D / 2, W, 20, 1, false, 0, Math.PI), body.material);
  lid.rotation.z = Math.PI / 2; lid.position.y = H; lid.castShadow = true;
  const label = new THREE.Mesh(new THREE.BoxGeometry(W * 0.6, 0.06, 0.005), new THREE.MeshStandardMaterial({ color: 0xfff4dc }));
  label.position.set(0, H * 0.6, D / 2 + 0.003);
  g.add(body, lid, label);
  g.position.set(cx, y0, cz);
  ctx.world.scene.add(g);
  const col = { id: 'breadBin', min: V(cx - W / 2, y0, cz - D / 2), max: V(cx + W / 2, y0 + H + D / 4, cz + D / 2), kind: 'surface', enabled: true };
  ctx.world.addCollider?.(col) ?? ctx.world.colliders.push(col);
  L.flags.breadBin = { g, col };
}

export default defineLevel({
  id: 5, food: 'lasagna', title: 'Jungle Cat',
  objectives: ['Climb up to the top of the fridge', 'Grab the vine', 'Catch the lasagna pan', 'Eat it'],
  hints: ['l05_hint_1', 'l05_hint_2', 'l05_hint_3'],
  canEat: (L) => L.flags.havePan,
  foodEnabled: (L) => L.flags.havePan,
  foodPos: (L) => panPos(L.ctx),
  eatProp: (L) => prop(L.ctx, 'pan'),
  eatRadius: 0.75,
  setup(L) {
    const { ctx } = L;
    if (!climbRoute(ctx)) addBreadBin(L);
    L.flags.route = climbRoute(ctx);
    ctx.interact.register({
      id: 'vine', label: 'Grab the vine!', radius: 0.8, heightTol: 0.35,
      getPos: (o) => { const v = prop(ctx, 'vine'); return (o || V()).copy(v?.grabPoint ? v.grabPoint.clone().setY(fridgeTopPos(ctx).y) : fridgeTopPos(ctx)); },
      enabled: () => !L.flags.swinging && !L.flags.havePan && onFridge(L),
      onInteract: () => startSwing(L),
    });
  },
  update(L, dt) {
    const { ctx } = L;
    if (onFridge(L)) L.obj(0);
    if (L.flags.swinging) return updateSwing(L, dt);
    // marker: next climb step → vine → pan
    if (L.flags.havePan) L.target((o) => o.copy(panPos(ctx)), { height: 0.35 });
    else if (onFridge(L)) L.target((o) => o.copy(fridgeTopPos(ctx)), { height: 0.6 });
    else {
      const r = L.flags.route;
      const y = ctx.controller.pos.y;
      const next = r?.find((c) => c.max.y > y + 0.1);
      if (next) L.target((o) => o.set((next.min.x + next.max.x) / 2, next.max.y, (next.min.z + next.max.z) / 2), { height: 0.35 });
      else L.target((o) => o.copy(fridgeTopPos(ctx)), { height: 0.4 });
    }
  },
  teardown(L) {
    L.ctx.controller.animHold = false;
    const b = L.flags.breadBin;
    if (b) { b.g.parent?.remove(b.g); L.ctx.world.removeCollider?.('breadBin'); }
    const pan = prop(L.ctx, 'pan'); if (pan && L.flags.panHome) { try { pan.reset?.(); } catch {} }
    try { prop(L.ctx, 'vine')?.reset?.(); } catch {}
  },
});

function onFridge(L) {
  const c = L.ctx.controller, ft = fridgeTopPos(L.ctx);
  return c.pos.y > ft.y - 0.15 && Math.hypot(c.pos.x - ft.x, c.pos.z - ft.z) < 0.9;
}

function startSwing(L) {
  const { ctx } = L;
  if (L.flags.swinging) return;
  const vine = prop(ctx, 'vine');
  L.obj(1);
  L.flags.swinging = true; L.flags.st = 0; L.flags.passes = 0; L.flags.lastSide = 1; L.flags.caught = false;
  ctx.controller.lock(true);
  ctx.controller.animHold = true;
  if (vine) { vine.autoSwing = false; vine.grab?.(); }
  try { ctx.garfield.play?.('hang', { fade: 0.12 }); ctx.garfield.setExpression?.('happy'); } catch {}
  L.say('g_l05_grab', { force: true });
  ctx.ui?.toast?.('Press Space when you are over the pan!');
  ctx.events.emit('swing', { on: true });
  // side-on view of the whole arc so the kid can see the pan coming
  try {
    const a = fridgeTopPos(ctx), b = panPos(ctx);
    const look = a.clone().lerp(b, 0.55); look.y = (a.y + b.y) / 2 + 0.25;
    const dir = V(b.x - a.x, 0, b.z - a.z).normalize();
    const shot = bestShot(ctx, look, { dist: 2.8, h: 0.35, prefer: Math.atan2(-dir.z, dir.x), min: 1.6 });
    ctx.camera.shot(shot, { dur: 0.7 });
  } catch (e) { console.warn(e); }
}

// Pendulum: θ(t) = θ0·cos(ωt). Uses the vine prop's own geometry when present.
function swingTip(L, t) {
  const { ctx } = L;
  const vine = prop(ctx, 'vine');
  if (vine?.swingAngle && vine.pivot) {
    const w = vine.omega * SLOW;
    return { tip: vine.swingAngle(vine.theta0 * Math.cos(w * t)).clone(), phase: w * t, dir: vine.dirH };
  }
  // fallback: our own arc from the fridge top over the pan and a bit past
  const a = fridgeTopPos(ctx).add(V(0, 0.42, 0)), b = panPos(ctx).add(V(0, 0.55, 0));
  const dir = V(b.x - a.x, 0, b.z - a.z).normalize();
  const far = b.clone().addScaledVector(dir, 0.5);
  const w = 2.2 * SLOW, s = (1 - Math.cos(w * t)) / 2;
  const tip = a.clone().lerp(far, s); tip.y -= Math.sin(Math.PI * s) * 0.25;
  return { tip, phase: w * t, dir };
}

function updateSwing(L, dt) {
  const { ctx } = L;
  const c = ctx.controller, g = ctx.garfield;
  L.flags.st += dt * (L.flags.wasOver ? OVER_SLOW : 1);
  const { tip, phase, dir } = swingTip(L, L.flags.st);
  const tipRaw = tip.clone();
  // always face the table (fridge → pan) so he doesn't spin round at each turnaround
  const yaw = Math.atan2(dir.x, dir.z);
  g.root.rotation.y = yaw;
  const grip = GRIP.clone().applyAxisAngle(V(0, 1, 0), yaw);
  // the ceiling is low: when his feet would sink into the fridge/table, his paws slide up the strand instead
  const gy = ctx.world.groundAt?.(tip.x - grip.x, tip.z - grip.z, tip.y) ?? 0;
  const lift = Math.max(0, gy + 0.04 - (tip.y - grip.y));
  if (lift > 0) {
    const vine = prop(ctx, 'vine');
    const up = vine?.pivot ? vine.pivot.clone().sub(tip).normalize() : V(0, 1, 0);
    tip.addScaledVector(up, lift / Math.max(0.3, up.y));
  }
  c.pos.set(tip.x - grip.x, tip.y - grip.y, tip.z - grip.z);
  c.vel.set(0, 0, 0);
  const pp = panPos(ctx);
  const over = Math.hypot(tipRaw.x - pp.x, tipRaw.z - pp.z) < OVER_R;
  L.flags.wasOver = over && !L.flags.caught;
  if (over) L.flags.overAt = L.t;
  const nearlyOver = over || L.t - (L.flags.overAt ?? -9) < 0.3;   // forgiving: a slightly late press still counts
  ctx.ui?.hud?.set?.({ interactLabel: !L.flags.caught && over ? 'SPACE!' : null });
  // count passes (each time the swing turns around)
  const side = Math.sign(Math.sin(phase)) || 1;
  if (side !== L.flags.lastSide) { L.flags.lastSide = side; L.flags.passes++; }
  const pressed = L.flags.st > 0.4 && (ctx.input?.jumpPressed || ctx.input?.interact || ctx.input?.scratch);
  if (!L.flags.caught && pressed) {
    if (nearlyOver) catchPan(L);
    else if (!L.flags.missT || L.t - L.flags.missT > 3) { L.flags.missT = L.t; L.say('g_l05_miss', { force: true }); }
  }
  if (L.flags.caught && L.flags.panObj) {
    L.flags.panObj.position.set(c.pos.x, c.pos.y - 0.01, c.pos.z);
  }
  // back at the fridge (cos ≈ 1): land if we've caught it, or after PASSES without one
  const back = Math.cos(phase) > 0.995 && L.flags.st > 1;
  if (back && (L.flags.caught || L.flags.passes >= PASSES)) endSwing(L);
}

function catchPan(L) {
  const { ctx } = L;
  const pan = prop(ctx, 'pan');
  L.flags.caught = true;
  L.obj(2);
  ctx.audio?.sfx?.('pop');
  try { pan?.swingCatch?.(); } catch {}
  if (pan?.root) {
    L.flags.panHome = true;
    ctx.world.scene.attach(pan.root);
    L.flags.panObj = pan.root;
  }
  ctx.events.emit('panCaught');
  L.say('j_pan_gone', { delay: 1.2, force: true });
  setTimeout(() => {
    if (L.dead || L.won) return;
    const fr = apos(ctx, 'fridgeFront') || fridgeTopPos(ctx).setY(0);
    L.ai.investigate(fr, { dur: 30, arriveLine: 'j_glare', lookLines: [null, 'j_glare'], standOff: 0.5 });
  }, 1500);
}

function endSwing(L) {
  const { ctx } = L;
  const vine = prop(ctx, 'vine');
  L.flags.swinging = false;
  try { vine?.release?.(); vine && (vine.autoSwing = true); vine?.reset?.(); } catch {}
  const ft = fridgeTopPos(ctx);
  const v = prop(ctx, 'vine');
  const land = v?.grabPoint ? v.grabPoint.clone().setY(ft.y) : ft.clone();
  // keep the landing on the fridge top
  land.lerp(ft, 0.4);
  ctx.controller.teleport(land.clone().setY(ft.y + 0.05), ctx.garfield.root.rotation.y + Math.PI);
  ctx.controller.animHold = false;
  ctx.controller.lock(false);
  ctx.camera.follow?.({ dur: 0.6 });
  ctx.ui?.hud?.set?.({ interactLabel: null });
  ctx.events.emit('swing', { on: false });
  if (L.flags.caught) {
    L.flags.havePan = true;
    const fwd = V(Math.sin(ctx.garfield.root.rotation.y), 0, Math.cos(ctx.garfield.root.rotation.y));
    const spot = ft.clone().addScaledVector(fwd, 0.18); spot.y = ft.y + 0.005;
    if (L.flags.panObj) { L.flags.panObj.position.copy(spot); L.flags.panObj.rotation.set(0, 0, 0); }
    ctx.controller.teleport(ft.clone().addScaledVector(fwd, -0.22).setY(ft.y + 0.05), ctx.garfield.root.rotation.y);
    L.say('g_near_lasagna', { delay: 0.6, force: true });
  } else {
    L.say('g_jumpfail', { force: true });
  }
}
