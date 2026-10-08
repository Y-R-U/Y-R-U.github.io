import * as THREE from '../../vendor/three/three.module.js';

// Odie's brain: idle/pant/sit, walk/run on the pet nav (world.navPet: fits under the table, into the cupboard),
// flee, arcs (launched / falls), knockouts that recover, and a scratch target the level decides about.
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CANCEL = Symbol('cancel');
export const ODIE = { walk: 0.85, run: 2.6, recover: 10 };

export function createOdieAI(ctx, odie) {
  const { world } = ctx;
  const root = odie.root;
  const A = (n) => world.anchors?.get?.(n) || null;
  const has = (c) => !odie.anims || odie.anims.includes(c);
  const ai = { state: 'idle', t: 0, stateT: 0, onScratch: null, scratchable: () => true, sounds: true };
  const tickers = new Set();
  const addTicker = (fn) => { tickers.add(fn); return () => tickers.delete(fn); };
  let curClip = null, task = null;

  function clip(name, o = {}) {
    if (!has(name)) name = o.fallback && has(o.fallback) ? o.fallback : 'idle';
    if (curClip === name && !o.once && !o.force) return;
    curClip = o.once ? null : name;
    try { return odie.play?.(name, { loop: !o.once, once: !!o.once, fade: o.fade ?? 0.18 }); } catch {}
  }
  ai.clip = clip;
  ai.expr = (e) => { try { odie.setExpression?.(e); } catch {} };
  ai.noise = (key, o) => { if (ai.sounds) ctx.barks?.say(key, { force: true, ...o }); };
  ai.pos = () => root.position.clone();
  ai.distTo = (p) => flat(root.position, p);
  ai.place = (p, rotY) => {
    cancel();
    const pp = p.isVector3 ? p : (A(p)?.pos || V());
    root.position.copy(pp);
    if (rotY != null) root.rotation.y = rotY; else if (!p.isVector3 && A(p)) root.rotation.y = A(p).rotY || 0;
    odie.setMove?.(0);
  };
  ai.face = (p) => { root.rotation.y = Math.atan2(p.x - root.position.x, p.z - root.position.z); };

  // ---- movement ----
  function pathTo(goal) {
    let pts = null;
    const nav = world.navPet || world.nav;
    try { pts = nav?.path?.(root.position.clone(), goal.clone()); } catch {}
    if (!pts || !pts.length) pts = [goal.clone()];
    if (pts.length > 1 && flat(pts[0], root.position) < 0.25) pts.shift();
    return pts.map((q) => q.clone());
  }
  function stepAlong(st, dt) {
    let tgt = st.path[st.i];
    while (tgt && flat(root.position, tgt) < (st.i === st.path.length - 1 ? st.arrive : 0.25)) { st.i++; tgt = st.path[st.i]; }
    if (!tgt) { odie.setMove?.(0); return true; }
    const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z, d = Math.hypot(dx, dz);
    root.rotation.y += wrap(Math.atan2(dx, dz) - root.rotation.y) * Math.min(1, dt * 10);
    const step = Math.min(d, st.speed * dt);
    root.position.x += (dx / d) * step; root.position.z += (dz / d) * step;
    const prev = st.i > 0 ? st.path[st.i - 1] : null;
    if (prev && Math.abs(prev.y - tgt.y) > 0.05) {
      const seg = flat(prev, tgt) || 1, k = THREE.MathUtils.clamp(1 - flat(root.position, tgt) / seg, 0, 1);
      root.position.y = THREE.MathUtils.lerp(prev.y, tgt.y, k);
    } else if (st.keepY == null) root.position.y = tgt.y ?? root.position.y;
    odie.setMove?.(st.speed);
    return false;
  }

  function cancel() { if (task) task.cancelled = true; task = null; odie.setMove?.(0); }
  function setState(s) { ai.state = s; ai.stateT = 0; }
  // cancellable scripted behaviour (same shape as the humans' tasks)
  ai.run = (name, fn) => {
    cancel();
    const t = { cancelled: false, name };
    const chk = () => { if (t.cancelled) throw CANCEL; };
    t.wait = (s) => new Promise((res, rej) => { let left = s; const off = addTicker((dt) => { if (t.cancelled) { off(); rej(CANCEL); return; } if ((left -= dt) <= 0) { off(); res(); } }); });
    t.walkTo = (p, { speed = ODIE.walk, arrive = 0.15, direct = false } = {}) => new Promise((res, rej) => {
      chk();
      const st = { path: direct ? [p.clone()] : pathTo(p), i: 0, speed, arrive };
      clip(speed > 1.6 ? (has('gallop_goofy') && speed > 2.2 ? 'gallop_goofy' : 'run') : 'walk', { fallback: 'walk' });
      const off = addTicker((dt) => { if (t.cancelled) { off(); rej(CANCEL); return; } if (stepAlong(st, dt)) { off(); res(); } });
    });
    t.play = async (name, dur, o = {}) => { chk(); clip(name, { once: !o.loop, force: true, fallback: o.fallback }); await t.wait(dur); };
    t.loop = (name, o = {}) => { chk(); clip(name, { ...o, force: true }); };
    t.chk = chk;
    t.tween = (fn, dur) => new Promise((res, rej) => { let k = 0; const off = addTicker((dt) => { if (t.cancelled) { off(); rej(CANCEL); return; } k = Math.min(1, k + dt / dur); fn(k); if (k >= 1) { off(); res(); } }); });
    task = t; setState(name);
    Promise.resolve().then(() => fn(t)).then(() => { if (task === t) task = null; }, (e) => { if (e !== CANCEL) console.error('[odieAI]', name, e); if (task === t) task = null; });
    return t;
  };
  ai.busy = () => !!task;
  ai.taskName = () => task?.name || null;

  // ---- behaviours ----
  ai.idle = (c = 'idle_pant') => { cancel(); setState('idle'); clip(c, { fallback: 'idle', force: true }); };
  ai.sit = (c = 'sit_pant') => { cancel(); setState('sit'); clip(c, { fallback: 'sit', force: true }); };
  ai.goTo = (p, { run = false, then = 'sit_pant', speed } = {}) => ai.run('goTo', async (t) => {
    const pp = p.isVector3 ? p.clone() : A(p)?.pos?.clone();
    if (!pp) return;
    await t.walkTo(pp, { speed: speed || (run ? ODIE.run : ODIE.walk) });
    if (!p.isVector3 && A(p)?.rotY != null) root.rotation.y = A(p).rotY;
    setState(then === 'sit_pant' || then === 'sit' ? 'sit' : 'idle');
    clip(then, { fallback: 'idle', force: true });
  });
  ai.flee = (p, { then = 'sit_pant' } = {}) => ai.run('flee', async (t) => {
    ai.noise('o_yip');
    ctx.audio?.sfx?.('yip', { pos: root.position });
    await t.play('yip_flee', 0.55, { fallback: 'jump_up' });
    const pp = p.isVector3 ? p.clone() : A(p)?.pos?.clone();
    if (pp) await t.walkTo(pp, { speed: ODIE.run });
    setState('sit'); clip(then, { fallback: 'idle', force: true });
  });
  // Ballistic arc from here to `to` (world). The level picks the end clip.
  ai.arc = (to, { h = 0.8, dur = 0.8, spin = 'launched', yaw } = {}) => ai.run('arc', async (t) => {
    const from = root.position.clone();
    if (yaw == null) ai.face(to); else root.rotation.y = yaw;
    clip(spin, { fallback: 'fall', force: true });
    await t.tween((k) => {
      root.position.lerpVectors(from, to, k);
      root.position.y = THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * h;
    }, dur);
  });
  ai.knockout = (c = 'dizzy', secs = ODIE.recover, after = null) => ai.run('down', async (t) => {
    t.loop(c, { fallback: 'idle' });
    ai.expr('dazed');
    await t.wait(secs);
    ai.noise('o_shake_off');
    ai.expr('dopey');
    await t.play('idle_pant', 0.6, { fallback: 'idle' });
    if (after) after(); else ai.idle();
  });
  ai.at = (name) => { const a = A(name); return a ? a.pos.clone() : null; };

  // ---- scratch target ----
  const hp = V();
  const offScratch = ctx.scratch?.register?.({
    id: 'odie', radius: 0.38, heightTol: 0.55,
    getPos: (o) => { (odie.sockets?.body || odie.sockets?.back || root).getWorldPosition(hp); return (o || V()).copy(hp); },
    enabled: () => root.visible !== false && !!ai.onScratch && ai.scratchable(),
    onHit: (info) => ai.onScratch?.(info),
  });

  ai.update = (dt) => {
    ai.t += dt; ai.stateT += dt;
    for (const fn of [...tickers]) fn(dt);
  };
  ai.dispose = () => { cancel(); tickers.clear(); offScratch?.(); };
  return ai;
}
