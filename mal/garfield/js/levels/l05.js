import * as THREE from '../../vendor/three/three.module.js';
import { defineLevel, prop, apos } from './common.js';
import { bestShot } from '../game/shots.js';

// Climb to the fridge top → grab the vine → swing over the table → Space over the pan to catch it → eat it up top.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const GRIP = V(0, 0.82, -0.07);   // paws midpoint in Garfield's root space during the 'hang' clip
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
export function climbRoute(ctx) {
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

export function addBreadBin(L) {
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

export function onFridge(L) {
  const c = L.ctx.controller, ft = fridgeTopPos(L.ctx);
  return c.grounded && c.pos.y > ft.y - 0.15 && Math.hypot(c.pos.x - ft.x, c.pos.z - ft.z) < 0.9;
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
  ctx.ui?.toast?.(ctx.ui?.isTouch ? 'Tap any button when you are over the pan!' : 'Press Space when you are over the pan!');
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

// The swing is a smooth root path from the fridge top over the pan and back, timed like a pendulum
// (s = (1 − cos ωt)/2 · sEnd). The path is built once per swing: a dip-and-rise arc pushed up over everything
// below it (fridge, counter, bench, table), dilated + blurred so it never jumps at a furniture edge.
// His paws are where the vine tip is drawn, every frame (gripLocal from the live skeleton).
// exported for Ch1 Free Play (target = Jon's plate there); call with L.flags.sw = null at each grab
export function swingTip(L, t, target = null) {
  const { ctx } = L;
  let P = L.flags.sw;
  if (!P) {
    const vine = prop(ctx, 'vine');
    const ft = fridgeTopPos(ctx), pan = target || panPos(ctx);
    const dir = V(pan.x - ft.x, 0, pan.z - ft.z).normalize();
    const F = ft.clone().addScaledVector(dir, -0.12); F.y = ft.y;
    const sC = Math.hypot(pan.x - F.x, pan.z - F.z), sE = sC + 0.45;
    const yaw = Math.atan2(dir.x, dir.z), side = V(dir.z, 0, -dir.x);
    const N = 96, ds = sE / N, need = new Float32Array(N + 1);
    const foot = [[0, 0, 0], [0.16, 0, 0], [-0.16, 0, 0], [0, 0.17, 0], [0, -0.14, 0], [0.1, 0.1, 0], [-0.1, 0.1, 0], [0, -0.46, 0.4]];
    for (let i = 0; i <= N; i++) {
      const s = i * ds; let m = 0;
      for (const [x, z, up] of foot) {
        const px = F.x + dir.x * (s + z) + side.x * x, pz = F.z + dir.z * (s + z) + side.z * x;
        m = Math.max(m, (ctx.world.groundAt?.(px, pz, ft.y - 0.05) ?? 0) - up);
      }
      need[i] = m + (m >= ft.y - 0.01 ? 0 : 0.05);
    }
    const R = Math.round(0.16 / ds), r = Math.floor(R / 2);
    const dil = need.map((_, i) => { let m = 0; for (let j = Math.max(0, i - R); j <= Math.min(N, i + R); j++) m = Math.max(m, need[j]); return m; });
    const sb = sC * 0.5, yb = 0.45, yEnd = Math.max(ft.y * 0.6, pan.y + 0.5);
    let y = dil.map((d, i) => {
      const s = i * ds;
      const arc = s < sb ? yb + (ft.y - yb) * (1 - s / sb) ** 2 : yb + (yEnd - yb) * ((s - sb) / (sE - sb)) ** 2;
      const hop = s < 0.5 ? 0.08 * Math.sin(Math.PI * s / 0.5) : 0;   // feet just off the fridge top as he pushes off / comes in
      return Math.max(arc, d) + hop;
    });
    // no cliffs: limit the slope both ways (only ever raises the path, so it stays clear)
    const slope = 1.8 * ds;
    for (let i = 1; i <= N; i++) y[i] = Math.max(y[i], y[i - 1] - slope);
    for (let i = N - 1; i >= 0; i--) y[i] = Math.max(y[i], y[i + 1] - slope);
    const blur = (a) => a.map((_, i) => { let w = 0, v = 0; for (let j = -r; j <= r; j++) { const k = Math.min(N, Math.max(0, i + j)), q = 1 - Math.abs(j) / (r + 1); w += q; v += a[k] * q; } return v / w; });
    y = blur(blur(y));
    y[0] = ft.y;
    P = L.flags.sw = { F, dir, yaw, sE, ds, N, y, w: (vine?.omega || 2.5) * SLOW, ceil: (vine?.pivot?.y ?? 2.7) - 0.08,
      start: ctx.controller.pos.clone(), yaw0: ctx.garfield.root.rotation.y };
  }
  const phase = P.w * t, u = (1 - Math.cos(phase)) / 2, s = u * P.sE;
  const f = Math.min(P.N - 1e-6, s / P.ds), i = Math.floor(f), fr = f - i;
  const root = P.F.clone().addScaledVector(P.dir, s);
  root.y = P.y[i] + (P.y[i + 1] - P.y[i]) * fr;
  // standing on the fridge top: arms bent, feet planted; the further out, the more he dangles
  const tuck = THREE.MathUtils.smoothstep(root.y, P.F.y - 0.65, P.F.y - 0.05);
  return { root, phase, s, tuck, dir: P.dir, P };
}

// Puts Garfield on the swing path at time st with his paws on the vine tip; returns { root, paws, phase, s, P }.
export function rideVine(L, st, target = null) {
  const { ctx } = L;
  const c = ctx.controller, g = ctx.garfield;
  const { root, phase, s, tuck, P } = swingTip(L, st, target);
  // ease in from wherever he grabbed the vine (anywhere on the fridge top)
  const e0 = THREE.MathUtils.smoothstep(st, 0, 0.45);
  root.lerp(P.start, 1 - e0);
  let dy = P.yaw - P.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  g.root.rotation.y = P.yaw0 + dy * e0;
  // never let his raised paws go through the ceiling: bend the arms more instead
  const grip0 = 0.77, grip1 = 0.6;
  const k = Math.max(tuck, THREE.MathUtils.clamp((root.y + grip0 - P.ceil) / (grip0 - grip1), 0, 1));
  g.setHangTuck?.(k);
  c.pos.copy(root);
  c.vel.set(0, 0, 0);
  g.root.position.copy(root);
  const paws = g.gripLocal ? g.gripLocal().applyAxisAngle(V(0, 1, 0), g.root.rotation.y).add(root) : root.clone().add(GRIP);
  const vine = prop(ctx, 'vine');
  if (vine?.setTip) {
    // the tip comes up from its draped spot into his paws as he takes hold
    const e1 = THREE.MathUtils.smoothstep(st, 0, 0.25);
    if (!L.flags.tip0) L.flags.tip0 = vine.tip?.clone?.() || paws.clone();
    vine.setTip(L.flags.tip0.clone().lerp(paws, e1), 0);
  }
  return { root, paws, phase, s, P };
}

function updateSwing(L, dt) {
  const { ctx } = L;
  L.flags.st += dt * (L.flags.wasOver ? OVER_SLOW : 1);
  const { root, paws, phase, s, P } = rideVine(L, L.flags.st);
  const pp = panPos(ctx);
  const over = Math.hypot(paws.x - pp.x, paws.z - pp.z) < OVER_R;
  L.flags.wasOver = over && !L.flags.caught;
  if (over) L.flags.overAt = L.t;
  const nearlyOver = over || L.t - (L.flags.overAt ?? -9) < 0.3;   // forgiving: a slightly late press still counts
  ctx.ui?.hud?.set?.({ interactLabel: !L.flags.caught && over ? (ctx.ui?.isTouch ? 'GRAB!' : 'SPACE!') : null });
  // count passes (each time the swing turns around)
  const side = Math.sign(Math.sin(phase)) || 1;
  if (side !== L.flags.lastSide) { L.flags.lastSide = side; L.flags.passes++; }
  const pressed = L.flags.st > 0.4 && (ctx.input?.jumpPressed || ctx.input?.interact || ctx.input?.scratch);
  if (!L.flags.caught && pressed) {
    if (nearlyOver) catchPan(L);
    else if (!L.flags.missT || L.t - L.flags.missT > 3) { L.flags.missT = L.t; L.say('g_l05_miss', { force: true }); }
  }
  if (L.flags.caught && L.flags.panObj) {
    // carried at his feet; over the last stretch home it slides out to where it will sit on the fridge top
    const home = 1 - THREE.MathUtils.smoothstep(s, 0.05, 0.6);
    L.flags.panObj.position.copy(root).addScaledVector(P.dir, 0.3 * home);
    L.flags.panObj.position.y = root.y - 0.01 + 0.015 * home;
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
  const P = L.flags.sw;
  L.flags.swinging = false;
  L.flags.sw = null; L.flags.tip0 = null;
  try { if (vine?.letGo) vine.letGo(0.35); else { vine?.release?.(); vine?.reset?.(); } vine && (vine.autoSwing = true); } catch {}
  const ft = fridgeTopPos(ctx);
  // he is already standing on the fridge top at the end of the path: no teleport, just settle the controller there
  const at = P ? P.F.clone() : ft.clone();
  at.y = ft.y + 0.005;
  ctx.controller.teleport(at, ctx.garfield.root.rotation.y);
  ctx.garfield.setHangTuck?.(0);
  ctx.controller.animHold = false;
  ctx.controller.lock(false);
  ctx.camera.follow?.({ dur: 0.6 });
  ctx.ui?.hud?.set?.({ interactLabel: null });
  ctx.events.emit('swing', { on: false });
  if (L.flags.caught) {
    L.flags.havePan = true;
    const dir = P?.dir || V(Math.sin(ctx.garfield.root.rotation.y), 0, Math.cos(ctx.garfield.root.rotation.y));
    const spot = at.clone().addScaledVector(dir, 0.3); spot.y = ft.y + 0.005;
    if (L.flags.panObj) { L.flags.panObj.position.copy(spot); L.flags.panObj.rotation.set(0, 0, 0); }
    L.say('g_near_lasagna', { delay: 0.6, force: true });
  } else {
    L.say('g_jumpfail', { force: true });
  }
}
