import * as THREE from '../../vendor/three/three.module.js';
import { createJonAI } from '../game/jonAI.js';
import { createBarks } from '../game/barks.js';
import { LINES } from '../game/lines.js';
import { createMarker } from '../game/marker.js';
import { bestShot } from '../game/shots.js';

// Level runtime shared by l01–l10: Jon AI + barks, food/eat with the guard rule, hints, goal marker,
// and the chapter-opening / first-launch intro cutscenes.

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const HINT_AFTER = 20;

export const prop = (ctx, id) => ctx.world.props?.get?.(id) || null;
export const anchor = (ctx, n) => ctx.world.anchors?.get?.(n) || null;
export const apos = (ctx, n, fallback) => { const a = anchor(ctx, n); return a ? a.pos.clone() : (fallback ? fallback.clone() : null); };

export function platePos(ctx) {
  const p = prop(ctx, 'plate');
  if (p?.pos && p.pos.lengthSq() > 0) return p.pos.clone();
  return apos(ctx, 'plateSpot', V(6.2, 0.76, 7.3));
}

// Collider helpers: find the AABB of a named piece of furniture (props register their own ids).
export function findCollider(ctx, test) {
  const cs = ctx.world.colliders || [];
  return cs.find((c) => c.enabled !== false && test(c)) || null;
}
export function tableBox(ctx) {
  let best = null;
  for (const c of ctx.world.colliders || []) {
    if (c.enabled === false || !/table/i.test(c.id) || /leg/i.test(c.id)) continue;
    if (c.max.y > 0.6 && c.max.y < 0.95 && (!best || (c.max.x - c.min.x) * (c.max.z - c.min.z) > (best.max.x - best.min.x) * (best.max.z - best.min.z))) best = c;
  }
  if (best) return { min: best.min.clone(), max: best.max.clone(), topY: best.max.y, src: best };
  const t = apos(ctx, 'tableTop', V(6.2, 0.76, 7.1));
  return { min: V(t.x - 0.8, 0, t.z - 0.5), max: V(t.x + 0.8, t.y, t.z + 0.5), topY: t.y };
}
export const inBoxXZ = (p, b, pad = 0) => p.x > b.min.x - pad && p.x < b.max.x + pad && p.z > b.min.z - pad && p.z < b.max.z + pad;
export function onTable(ctx) {
  const c = ctx.controller, b = tableBox(ctx);
  return !c.locked && c.grounded !== false && inBoxXZ(c.pos, b, 0.05) && Math.abs(c.pos.y - b.topY) < 0.2;
}

// ---------------------------------------------------------------------------
// defineLevel(spec) → the module object game.js expects.
// spec: {id, food, title, objectives, hints, jonStart, canEat(L), foodPos(L), eatRadius, guard:{grab, warn},
//        setup(L), start(L), update(L, dt), teardown(L), intro(ctx)}
export function defineLevel(spec) {
  const level = {
    id: spec.id, food: spec.food, title: spec.title, objectives: spec.objectives, hints: spec.hints,
    intro: spec.intro,
    setup(ctx) {
      const L = makeRuntime(ctx, spec);
      ctx.L = L;
      level.L = L;
      spec.setup?.(L);
    },
    update(ctx, dt) {
      const L = ctx.L;
      if (!L || L.dead) return;
      if (!L.started) { L.started = true; L.start(); }
      L.update(dt);
    },
    teardown(ctx) { ctx.L?.dispose(); ctx.L = null; },
  };
  return level;
}

function makeRuntime(ctx, spec) {
  const barks = createBarks(ctx);
  ctx.barks = barks;
  const ai = createJonAI(ctx);
  ctx.jonAI = ai;
  // a restart can leave Jon parented to the chair seat: put him back at his spawn
  if (ai.seated()) {
    ai.leave();
    const js = anchor(ctx, 'jonSpawn');
    if (js) { ctx.jon.root.position.copy(js.pos); ctx.jon.root.rotation.set(0, js.rotY || 0, 0); }
  }
  const marker = createMarker(ctx);
  const L = {
    ctx, spec, ai, barks, marker, flags: {}, t: 0, started: false, dead: false,
    eating: false, won: false, lastProgress: 0, hintI: 0, hintT: 0, guardT: 0, warned: false,
    objDone: (spec.objectives || []).map(() => false),
  };

  L.obj = (i, done = true) => {
    if (L.objDone[i] === done) return;
    L.objDone[i] = done;
    ctx.objective(i, done);
    if (done) L.progress();
  };
  L.setObjText = (i, text) => {
    const list = (ctx.objectives || []).map((o, j) => ({ text: j === i ? text : o.text, done: L.objDone[j] }));
    ctx.objectives = list;
    ctx.ui?.hud?.set?.({ objectives: list.map((o) => ({ ...o })) });
  };
  L.progress = () => { L.lastProgress = L.t; L.hintT = 0; };
  L.say = (k, o) => barks.say(k, o);
  L.target = (getPos, opts) => marker.set(getPos, opts);
  L.tutorial = (o) => { try { ctx.ui?.tutorial?.show?.(ctx.ui?.isTouch && o.touchText ? { ...o, text: o.touchText } : o); } catch {} };
  L.tutorialHide = () => { try { ctx.ui?.tutorial?.hide?.(); } catch {} };
  L.gpos = () => ctx.controller.pos;
  L.elevated = () => ai.gElevated();
  L.onTable = () => onTable(ctx);

  // ---------------- food ----------------
  const canEat = () => !L.eating && !L.won && (spec.canEat ? spec.canEat(L) : ai.distracted());
  L.canEat = canEat;
  L.foodPos = () => (spec.foodPos ? spec.foodPos(L) : platePos(ctx));
  const foodItem = {
    id: 'food', radius: spec.eatRadius || 0.6, heightTol: spec.eatHeightTol ?? 0.45,
    getPos: (o) => (o || V()).copy(L.foodPos()),
    get label() { return canEat() ? 'Eat!' : (spec.guardLabel || "Jon's watching!"); },
    enabled: () => !L.eating && !L.won && (spec.foodEnabled ? spec.foodEnabled(L) : true),
    onInteract: () => {
      if (canEat()) L.eat();
      else { barks.say(spec.guardedBark || 'g_guarded', { force: true }); L.guardedTries = (L.guardedTries || 0) + 1; }
    },
    markerHeight: 0.35,
  };
  ctx.interact.register(foodItem);
  let lastLabel = null;

  L.eat = async () => {
    if (L.eating || L.won) return;
    L.eating = true;
    L.progress();
    const c = ctx.controller, g = ctx.garfield;
    c.lock(true);
    const fp = L.foodPos();
    g.root.rotation.y = Math.atan2(fp.x - c.pos.x, fp.z - c.pos.z);
    try { g.setExpression?.('chew'); } catch {}
    ctx.events.emit('eatStart');
    const food = spec.eatProp ? spec.eatProp(L) : prop(ctx, 'plate');
    const eatAnim = Promise.resolve(g.play?.('eat', { once: true }));
    const DUR = 2.4;
    let t = 0;
    await new Promise((res) => {
      const off = ctx.every(0.05, () => {
        t += 0.05;
        try { food?.eaten?.(Math.min(1, t / DUR)); } catch {}
        if (Math.floor(t / 0.45) !== Math.floor((t - 0.05) / 0.45)) ctx.audio?.sfx?.('chomp', { rate: 0.9 + Math.random() * 0.2 });
        if (t >= DUR) { off(); res(); }
      });
    });
    await Promise.race([eatAnim, new Promise((r) => setTimeout(r, 300))]);
    if (!food?.eaten) ctx.world.eatFood?.();
    ctx.audio?.sfx?.('gulp');
    try { g.setExpression?.('happy'); } catch {}
    L.objDone.forEach((d, i) => { if (!d) L.obj(i, true); });
    L.won = true;
    marker.set(null);
    ctx.events.emit('ate');
    barks.say('g_win', { force: true });
    if (ai.state !== 'trapped' && ai.state !== 'faceplant') barks.say('j_lost', { delay: 1.2, force: true });
    await new Promise((r) => setTimeout(r, 900));
    ctx.win();
  };

  // ---------------- guard rule ----------------
  const grab = spec.guard?.grab ?? 5, warnAt = spec.guard?.warn ?? 0.5;
  function updateGuard(dt) {
    if (spec.guard === false || L.eating || L.won || ctx.director?.active) { L.guardT = 0; return; }
    const near = L.onTable() && flat(ctx.controller.pos, platePos(ctx)) < 1.0;
    if (ai.isAlert() && near) {
      L.guardT += dt;
      if (L.guardT > warnAt && !L.warned) { L.warned = true; barks.say('j_offtable', { force: true }); }
      if (L.guardT > grab) { L.guardT = 0; L.warned = false; ai.catchGarfield(); }
    } else {
      L.guardT = Math.max(0, L.guardT - dt * 2);
      if (L.guardT === 0) L.warned = false;
    }
  }

  // ---------------- hints ----------------
  function updateHints(dt) {
    if (ctx.director?.active || ctx.controller.locked || ai.state === 'chase' || ai.state === 'glare' || L.eating || L.won) return;
    L.hintT += dt;
    const hints = spec.hints || [];
    if (!hints.length) return;
    const wait = L.hintI === 0 ? HINT_AFTER : HINT_AFTER + 5;
    if (L.hintT > wait) {
      L.hintT = 0;
      // never hint at a step that's already done (hint N roughly matches objective N)
      const done = L.objDone.filter(Boolean).length;
      L.hintI = Math.max(L.hintI, Math.min(done, hints.length - 1));
      const k = hints[Math.min(L.hintI, hints.length - 1)];
      L.hintI++;
      barks.say(k, { force: true });
      L.showMarker = true;
      ctx.events.emit('hint', { key: k, i: L.hintI });
    }
  }

  // Near-food barks
  let nearT = 0;
  function updateNear(dt) {
    nearT -= dt;
    if (nearT > 0) return;
    nearT = 0.5;
    if (flat(ctx.controller.pos, L.foodPos()) < 1.4) barks.near(spec.food);
  }

  // Jon's body is solid to the cat (standing, walking or lying on the floor); seated upright, the chair handles it
  // (and L9 needs the cat under the chair).
  const hA = V(), hB = V(), seg = V(), cp = V();
  function separateFromJon() {
    const c = ctx.controller, jon = ctx.jon;
    if (ctx.director?.active || c.locked || L.eating || L.won || ai.state === 'catch') return;
    const head = jon.sockets?.head, hips = jon.sockets?.hips;
    if (!head || !hips || jon.root.visible === false) return;
    head.getWorldPosition(hA); hips.getWorldPosition(hB);
    if (ai.seated() && hA.y - hB.y > 0.35) return;
    if (c.pos.y > Math.max(hA.y, hB.y) - 0.05 || c.pos.y + 0.44 < Math.min(hA.y, hB.y) - 0.9) return;
    // head → hips, carried on past the hips for the legs when he's lying down
    seg.subVectors(hB, hA).setY(0);
    const len = seg.length();
    const lying = hA.y - hB.y < 0.35;
    const ext = lying ? len + 0.55 : len;
    if (len > 1e-3) seg.multiplyScalar(1 / len);
    const px = c.pos.x - hA.x, pz = c.pos.z - hA.z;
    const k = len > 1e-3 ? Math.max(0, Math.min(ext, px * seg.x + pz * seg.z)) : 0;
    cp.set(hA.x + seg.x * k, 0, hA.z + seg.z * k);
    const R = (lying ? 0.26 : 0.2) + (c.radius || 0.22);
    let dx = c.pos.x - cp.x, dz = c.pos.z - cp.z, d = Math.hypot(dx, dz);
    if (d >= R) return;
    if (d < 1e-3) { dx = -seg.z || 1; dz = seg.x; d = Math.hypot(dx, dz); }
    const push = R - d, nx = c.pos.x + (dx / d) * push, nz = c.pos.z + (dz / d) * push;
    if (!c._blocked?.(nx, nz, c.pos.y)) { c.pos.x = nx; c.pos.z = nz; }
  }

  L.start = () => {
    const js = spec.jonStart || 'sit';
    if (js === 'sit') { ai.setHome({ type: 'sit' }); ai.sitNow(); }
    else if (js === 'wander') { ai.setHome({ type: 'wander' }); ai.wander(); }
    else if (js === 'sulk') { ai.setHome({ type: 'sulk', anchor: spec.sulkAnchor || 'loungeChair' }); ai.sulk(spec.sulkAnchor || 'loungeChair'); }
    L.progress();
    spec.start?.(L);
  };

  L.update = (dt) => {
    L.t += dt;
    barks.update(dt);
    ai.update(dt);
    updateGuard(dt);
    updateHints(dt);
    updateNear(dt);
    spec.update?.(L, dt);
    separateFromJon();
    marker.visible = L.showMarker !== false && !L.won && !ctx.director?.active;
    marker.update(dt);
    // interact.register copies the def (a getter label is read once), so keep the live label in sync ourselves
    const cur = ctx.interact.current;
    if (cur && cur.id === 'food') {
      const lab = foodItem.label;
      cur.label = lab;
      if (lab !== lastLabel) { lastLabel = lab; ctx.ui?.hud?.set?.({ interactLabel: lab, interactHint: lab !== 'Eat!' }); }
    } else { if (lastLabel) ctx.ui?.hud?.set?.({ interactHint: false }); lastLabel = null; }
  };

  L.dispose = () => {
    L.dead = true;
    try { spec.teardown?.(L); } catch (e) { console.error(e); }
    ai.dispose(); barks.dispose(); marker.dispose();
    L.tutorialHide();
  };
  return L;
}

// Repeatable scratch target helper. Returns the unregister fn.
export function scratchTarget(L, id, getPos, onHit, opts = {}) {
  return L.ctx.scratch.register({ id, getPos: (o) => (o || V()).copy(getPos()), radius: opts.radius ?? 0.35,
    heightTol: opts.heightTol ?? 0.5, enabled: opts.enabled || (() => true), onHit });
}

// ---------------------------------------------------------------------------
// Cutscenes
const say = (d, ctx, who, key, opts = {}) => {
  const L = LINES[key];
  const man = ctx.audio?.voLines?.[key];
  return d.say(who, key, { text: man?.text || L?.text || '…', thought: who === 'garfield', ...opts });
};
const pickKey = (ctx, prefix) => {
  const keys = Object.keys(LINES).concat(Object.keys(ctx.audio?.voLines || {})).filter((k) => new RegExp('^' + prefix + '(_\\d+)?$').test(k));
  const uniq = [...new Set(keys)];
  return uniq[Math.floor(Math.random() * uniq.length)] || prefix;
};
// A camera shot looking at `look` from `dist` away in direction `yaw` (radians, 0 = +Z), `h` above it.
export function orbitShot(look, yaw, dist, h, ctx) {
  if (ctx) return bestShot(ctx, look, { dist, h, prefer: yaw });
  return { pos: V(look.x + Math.sin(yaw) * dist, look.y + h, look.z + Math.cos(yaw) * dist), look: look.clone() };
}
export function camAnchor(ctx, n) {
  const a = anchor(ctx, n);
  return a ? { pos: a.pos.clone(), look: (a.look || a.target || a.pos).clone(), fov: a.fov } : null;
}
// A high shot from the nearest open-floor anchor (kitchen/living centre), pulled back from the subject.
export function fromOpenFloor(ctx, look, h = 1.5) {
  const cands = ['kitchenCentre', 'livingCentre'].map((n) => apos(ctx, n)).filter(Boolean);
  if (!cands.length) return orbitShot(look, 0, 2.5, 0.9, ctx);
  cands.sort((a, b) => a.distanceTo(look) - b.distanceTo(look));
  const c = cands[0].clone();
  const back = V(c.x - look.x, 0, c.z - look.z);
  if (back.length() < 1.2) back.setLength(1.8);
  return { pos: V(look.x + back.x, h, look.z + back.z), look: look.clone() };
}
function standOff(target, from, d) {
  const dir = V(from.x - target.x, 0, from.z - target.z);
  if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
  return target.clone().add(dir.setLength(d)).setY(0);
}

export async function playOpening(ctx) {
  const { jon, garfield, director } = ctx;
  const food = ctx.level?.food || 'steak';
  const lvl = ctx.levelN;
  const bowlA = anchor(ctx, 'catBowl');
  const bowl = bowlA ? bowlA.pos.clone() : V(7.6, 0, 4.4);
  const seat = anchor(ctx, 'jonSeat') || anchor(ctx, 'jonChair');
  const chair = anchor(ctx, 'jonChair') || seat;
  const plate = platePos(ctx);
  const standAtChair = chair ? V(chair.pos.x, 0, chair.pos.z).add(V(Math.sin(seat.rotY || 0), 0, Math.cos(seat.rotY || 0)).multiplyScalar(-0.55)) : V(6.2, 0, 8.9);
  const bowlProp = prop(ctx, 'catBowl');
  const plateProp = prop(ctx, 'plate'), panProp = prop(ctx, 'pan');
  ctx.jonAI?.cutscene?.(true);

  await director.run(async (d) => {
    // Garfield waits near his bowl; Jon brings it in.
    const jStart = apos(ctx, 'jonSpawn', V(4, 0, 8));
    // Garfield waits on the far side of the bowl from Jon's approach (so Jon never walks through him)
    const away = V(bowl.x - jStart.x, 0, bowl.z - jStart.z).normalize();
    const side = V(-away.z, 0, away.x);
    let gStart = bowl.clone().addScaledVector(away, 0.55).addScaledVector(side, 0.35).setY(0);
    if (ctx.world.groundAt && ctx.world.groundAt(gStart.x, gStart.z, 0.3) > 0.1) gStart = bowl.clone().addScaledVector(side, 0.7).setY(0);
    d.place(garfield, gStart, Math.atan2(bowl.x - gStart.x, bowl.z - gStart.z));
    garfield.play?.('sit');
    try { garfield.setExpression?.('happy'); } catch {}
    d.place(jon, jStart);
    jon.holdProp?.('bowl');
    // the floor bowl only appears when Jon sets his down (no second bowl waiting on the mat)
    const bowlRoot = bowlProp?.root;
    if (bowlRoot) bowlRoot.visible = false;
    const showBowl = () => { if (bowlRoot) bowlRoot.visible = true; jon.holdProp?.(null); };
    const offPlace = jon.on?.('place', showBowl);
    const jAtBowl = standOff(bowl, jStart, 0.55);
    {
      const look = V((bowl.x + jAtBowl.x) / 2, 0.55, (bowl.z + jAtBowl.z) / 2);
      const appr = V(bowl.x - jStart.x, 0, bowl.z - jStart.z);
      d.cut(bestShot(ctx, look, { dist: 2.6, h: 0.95, prefer: Math.atan2(-appr.z, appr.x) }));
    }
    jon.play?.('walk');
    await d.walk(jon, jAtBowl, { faceEnd: false });
    await d.face(jon, bowl);
    try { await d.parallel(d.play(jon, 'give_bowl', { once: true, max: 2 }), say(d, ctx, 'jon', pickKey(ctx, 'j_open_bowl'))); }
    finally { offPlace?.(); showBowl(); }

    // Jon's meal.
    const tbl = apos(ctx, 'tableTop', plate);
    // pan to watch him walk off (the dining camera sits on his path), then cut to the table
    {
      const mid = V((jAtBowl.x + standAtChair.x) / 2, 0.9, (jAtBowl.z + standAtChair.z) / 2);
      const pathYaw = Math.atan2(standAtChair.z - jAtBowl.z, -(standAtChair.x - jAtBowl.x));
      d.cam(orbitShot(mid, pathYaw, 3.4, 0.9, ctx), { dur: 1.0 });
    }
    await d.walk(jon, standAtChair, { faceEnd: false });
    d.cut(camAnchor(ctx, 'cam_dining') || orbitShot(V(plate.x, 0.85, plate.z), (seat?.rotY || 0) + Math.PI + 0.7, 2.6, 0.9, ctx));
    await d.face(jon, plate);
    if (food === 'lasagna') {
      jon.holdProp?.('fork');
      const sp = d.play(jon, 'serve', { once: true, max: 2.5 });
      try { await Promise.race([panProp?.serveScoop?.(), new Promise((r) => setTimeout(r, 1500))]); } catch {}
      await d.parallel(sp, say(d, ctx, 'jon', pickKey(ctx, 'j_open_lasagna')));
    } else {
      await say(d, ctx, 'jon', pickKey(ctx, 'j_open_' + food));
    }
    if (lvl !== 1) {
      const chairSeat = prop(ctx, 'chair')?.seat;
      if (chairSeat && jon.sitAt && ctx.jonAI) {
        await d.walk(jon, ctx.jonAI.seatFront(), { faceEnd: false });
        await d.turn(jon, ctx.jonAI.facing ? Math.atan2(...(() => { const q = chairSeat.getWorldQuaternion(new THREE.Quaternion()); const f = V(0, 0, 1).applyQuaternion(q); return [f.x, f.z]; })()) : 0);
        await Promise.race([Promise.resolve(jon.sitAt(chairSeat)), d.wait(1.2)]);
      } else if (seat) {
        d.place(jon, V(seat.pos.x, 0, seat.pos.z), seat.rotY);
        await d.play(jon, 'sit', { once: true, max: 1 });
      }
      jon.play?.('sit_eat');
      jon.holdProp?.('fork');
    }

    // Garfield tries a biscuit.
    d.cut(camAnchor(ctx, 'cam_bowl') || orbitShot(V(bowl.x, 0.2, bowl.z), Math.atan2(gStart.x - bowl.x, gStart.z - bowl.z) + 0.9, 1.5, 0.35, ctx));
    await d.walk(garfield, standOff(bowl, gStart, 0.3), { speed: 0.8, faceEnd: false });
    await d.face(garfield, bowl);
    {
      // front three-quarter on his face for the bite + spit
      const gp = garfield.root.position;
      d.cut(orbitShot(V(gp.x, 0.3, gp.z), garfield.root.rotation.y + 0.75, 1.25, 0.12, ctx));
    }
    await d.play(garfield, 'eat', { once: true, max: 1.4 });
    try { garfield.setExpression?.('disgust'); } catch {}
    d.sfx('spit');
    const mouth = V(); (garfield.sockets?.mouth || garfield.root).getWorldPosition(mouth);
    try { bowlProp?.spitBits?.(mouth, V(Math.sin(garfield.root.rotation.y), 0.3, Math.cos(garfield.root.rotation.y))); } catch {}
    await d.parallel(d.play(garfield, 'spit', { once: true, max: 1.4 }), say(d, ctx, 'garfield', pickKey(ctx, 'g_open_spit')));
    await d.face(garfield, plate);
    try { garfield.setExpression?.('smug'); } catch {}
    d.cam(orbitShot(V(garfield.root.position.x, 0.3, garfield.root.position.z), garfield.root.rotation.y + Math.PI + 0.35, 1.4, 0.35, ctx), { dur: 0.8 });
    await say(d, ctx, 'garfield', lvl === 1 ? 'g_tut_1' : 'g_open_plan_' + food);
  });
  ctx.jonAI?.cutscene?.(false);
}

export async function playIntro(ctx) {
  const { jon, garfield, director, world } = ctx;
  const seat = anchor(ctx, 'jonSeat') || anchor(ctx, 'jonChair');
  const plate = platePos(ctx);
  const house = V(4.6, 1.2, 5.5);
  const front = apos(ctx, 'frontDoor', V(4.6, 0, 0));
  await director.run(async (d) => {
    const chairSeat = prop(ctx, 'chair')?.seat;
    if (chairSeat && jon.sitAt) { if (jon.root.parent !== chairSeat) jon.sitAt(chairSeat, 'sit_eat'); }
    else if (seat) d.place(jon, V(seat.pos.x, 0, seat.pos.z), seat.rotY);
    jon.play?.('sit_eat'); jon.holdProp?.('fork');
    try { jon.setExpression?.('happy'); } catch {}
    const tb = tableBox(ctx);
    // Garfield hides at the far end of the table
    const gHide = V(tb.min.x - 0.9, 0, (tb.min.z + tb.max.z) / 2);
    d.place(garfield, gHide, Math.PI / 2);
    garfield.play?.('idle');

    const sh = (n, fb) => { const a = anchor(ctx, n); return a ? { pos: a.pos.clone(), look: (a.look || a.target || house).clone(), fov: a.fov } : fb; };
    d.music('cutscene');
    // cul-de-sac fly-in → the house → the front door
    // one continuous Catmull-Rom glide through the anchors (no stop-start at each one)
    const legs = [
      sh('cam_culdesac', { pos: V(house.x - 14, 16, -26), look: V(house.x, 0, house.z - 6) }),
      sh('cam_culdesacLow', { pos: V(house.x - 8, 8, -18), look: V(house.x, 1.5, 0) }),
      sh('cam_houseFront', { pos: V(house.x - 4, 4, -10), look: V(house.x, 1.5, 0) }),
      sh('cam_porch', { pos: V(front.x, 1.6, front.z - 3), look: V(front.x, 1.4, front.z) }),
      sh('cam_frontDoor', { pos: V(front.x, 1.6, front.z - 1.2), look: V(front.x, 1.4, front.z + 2) }),
    ];
    const posC = new THREE.CatmullRomCurve3(legs.map((l) => l.pos.clone()), false, 'centripetal');
    const lookC = new THREE.CatmullRomCurve3(legs.map((l) => l.look.clone()), false, 'centripetal');
    const fovs = legs.map((l) => l.fov ?? 55);
    const fovAt = (u) => { const f = u * (fovs.length - 1), i = Math.min(fovs.length - 2, Math.floor(f)); return fovs[i] + (fovs[i + 1] - fovs[i]) * (f - i); };
    const flyPose = (u) => ({ pos: posC.getPointAt(u), look: lookC.getPointAt(u), fov: fovAt(u) });
    d.cut(flyPose(0));
    await d.tween((k) => ctx.camera.cut(flyPose(Math.min(1, k))), 11.5, (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2));
    await d.fade(true, 0.45);
    world.exterior?.show?.(false);
    const dinner = anchor(ctx, 'cam_dining') || anchor(ctx, 'cam_table');
    d.cut(dinner ? { pos: dinner.pos.clone(), look: (dinner.look || dinner.target || plate).clone(), fov: dinner.fov ?? 55 } : orbitShot(V(plate.x, 0.85, plate.z), (seat?.rotY || 0) + 0.9, 2.4, 0.7, ctx));
    await d.fade(false, 0.45);
    await say(d, ctx, 'jon', 'j_intro_1');
    d.cut(orbitShot(V(gHide.x, 0.3, gHide.z), Math.PI / 2 + 0.55, 1.15, 0.2, ctx));
    try { garfield.setExpression?.('smug'); } catch {}
    await say(d, ctx, 'garfield', 'g_intro_1');
    // Pounce!
    // side-on to the leap, on the side away from Jon's chair so he never blocks it
    const sideYaw = (a, b, avoid) => {
      const y0 = Math.atan2(b.z - a.z, -(b.x - a.x));
      const m = V((a.x + b.x) / 2, 0, (a.z + b.z) / 2);
      const dist = (y) => Math.hypot(m.x + Math.sin(y) - avoid.x, m.z + Math.cos(y) - avoid.z);
      return dist(y0) >= dist(y0 + Math.PI) ? y0 : y0 + Math.PI;
    };
    const jonAt = jon.root.getWorldPosition(V());
    d.cut(orbitShot(V((gHide.x + plate.x) / 2, 0.6, (gHide.z + plate.z) / 2), sideYaw(gHide, plate, jonAt), 2.8, 0.7, ctx));
    garfield.play?.('pounce', { once: true });
    const start = gHide.clone(), end = plate.clone();
    end.y = tb.topY;
    const toPlate = V(end.x - start.x, 0, end.z - start.z);
    end.addScaledVector(toPlate.normalize(), -0.18);
    await d.tween((k) => {
      garfield.root.position.lerpVectors(start, end, k);
      garfield.root.position.y = THREE.MathUtils.lerp(start.y, end.y, k) + Math.sin(k * Math.PI) * 0.7;
    }, 0.7, (k) => k);
    d.sfx('land');
    try { jon.setExpression?.('shock'); } catch {}
    // Jon leaps up out of his chair
    if (jon.leaveSeat && jon.root.parent && jon.root.parent !== world.scene) {
      await d.play(jon, 'stand_up', { once: true, max: 1.0 });
      jon.leaveSeat(world.scene);
      d.face(jon, garfield.root.position.clone());
    }
    jon.play?.('talk_angry');
    {
      // two-shot: Jon's face and the cat on the table, both in profile
      const jp = jon.root.getWorldPosition(V()), gp = garfield.root.position;
      const look = V((jp.x + gp.x) / 2, 0.95, (jp.z + gp.z) / 2);
      d.cut(orbitShot(look, sideYaw(jp, gp, V(tb.min.x - 5, 0, tb.min.z - 5)), 2.3, 0.35, ctx));
    }
    await say(d, ctx, 'jon', 'j_intro_2');
    try { garfield.setExpression?.('chew'); } catch {}
    garfield.play?.('eat');
    d.sfx('chomp');
    await d.wait(1.6);
    ctx.ui?.toast?.('Garfield: Hungry Heist');
    await d.wait(1.2);
    await d.fade(true, 0.5);
  });
  ctx.ui?.fade?.(false, 0.4);
}
