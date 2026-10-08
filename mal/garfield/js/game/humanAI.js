import * as THREE from '../../vendor/three/three.module.js';
import { createNewspaper } from './newspaper.js';
import { bestShot } from './shots.js';

// Chapter Two humans (Jon + Lyman): jonAI generalised. Chapter One keeps using jonAI.js unchanged.
// opts: {actor, who:'jon'|'lyman', seatProp:'chair'|'chair2', seatAnchor, chairAnchor}. Lines use `${lp}_*` families
// (j_ for Jon, l_ for Lyman). A pair (createHumans) chases together (D18).

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CANCEL = Symbol('cancel');

export const HUMAN = {
  walk: 1.35, run: 2.55, catchDist: 0.75, chaseTime: 10, glareGiveUp: 4,
  legHop: 2.5, paperWindow: 8, windup: 0.7, faceCover: 2.0, buttCover: 1.5, elevated: 0.4,
};

export function createHumanAI(ctx, opts = {}) {
  const { world, controller, events } = ctx;
  const jon = opts.actor || ctx.jon;
  const who = opts.who || 'jon', lp = who === 'jon' ? 'j' : who === 'lyman' ? 'l' : who[0];
  const seatProp = opts.seatProp || (who === 'lyman' ? 'chair2' : 'chair');
  const seatAnchor = opts.seatAnchor || (who === 'lyman' ? 'lymanSeat' : 'jonSeat');
  const chairAnchor = opts.chairAnchor || (who === 'lyman' ? 'lymanChair' : 'jonChair');
  const root = jon.root;
  const A = (n) => world.anchors?.get?.(n) || null;
  const anchorPos = (n) => { const a = A(n); return a ? (a.pos.clone ? a.pos.clone() : V(a.pos.x, a.pos.y, a.pos.z)) : null; };
  const has = (clip) => !jon.anims || jon.anims.includes(clip);
  // j_* keys are written below; Lyman gets his own family when it exists, else no line (never Jon's voice)
  const lk = (key) => { if (lp === 'j' || !/^j_/.test(key)) return key; const k = lp + key.slice(1); return k; };
  const say = (key, opt) => ctx.barks?.say(lk(key), opt);

  const ai = {
    who, actor: jon, partner: null,
    state: 'idle', home: { type: 'sit' }, t: 0, stateT: 0,
    chaseLeft: 0, enabled: true, reactHook: null, zoneOverride: null,
    seatedAlertFor: 0, papers: [], lastCatch: -99, catches: 0, reactions: 0,
    events: null,
  };

  // ---------- clips ----------
  let curClip = null;
  function clip(name, opts = {}) {
    if (!has(name)) name = opts.fallback && has(opts.fallback) ? opts.fallback : 'idle';
    if (curClip === name && !opts.once && !opts.force) return;
    curClip = opts.once ? null : name;
    try { return jon.play?.(name, { loop: !opts.once, once: !!opts.once, fade: opts.fade ?? 0.2, speed: opts.speed ?? 1 }); }
    catch (e) { console.warn('[jonAI] play', name, e); }
  }
  const expr = (e) => { try { jon.setExpression?.(e); } catch {} };

  // ---------- geometry ----------
  function floorBase(p) {
    const up = A('stairsTop'), dn = A('stairsBottom');
    const upY = up ? up.pos.y : 3.0;
    if (p.y > upY - 0.25) return upY;
    if (up && dn) {
      const minx = Math.min(up.pos.x, dn.pos.x) - 0.7, maxx = Math.max(up.pos.x, dn.pos.x) + 0.7;
      const minz = Math.min(up.pos.z, dn.pos.z) - 0.7, maxz = Math.max(up.pos.z, dn.pos.z) + 0.7;
      if (p.x > minx && p.x < maxx && p.z > minz && p.z < maxz) return p.y; // on the stairs: never "elevated"
    }
    return 0;
  }
  ai.gHeight = () => { const p = controller.pos; return p.y - floorBase(p); };
  ai.gElevated = () => ai.gHeight() > HUMAN.elevated;
  ai.gFloorPos = () => { const p = controller.pos; return V(p.x, floorBase(p), p.z); };
  // Seated convention (jon lane): while seated, root is parented to chair.seat, so root.position is LOCAL.
  let curSeat = null;
  const seatObj = () => world.props?.get?.(seatProp)?.seat || null;
  ai.seated = () => !!root.parent && root.parent !== world.scene && (root.parent === seatObj() || root.parent === curSeat);
  ai.pos = (out = V()) => root.getWorldPosition(out);
  ai.facing = () => { const q = root.getWorldQuaternion(new THREE.Quaternion()); const f = V(0, 0, 1).applyQuaternion(q); return Math.atan2(f.x, f.z); };
  ai.leave = () => {
    if (!ai.seated()) return;
    curSeat = null;
    if (jon.leaveSeat) jon.leaveSeat(world.scene);
    else { const p = ai.pos(), r = ai.facing(); world.scene.add(root); root.position.copy(p).setY(0); root.rotation.set(0, r, 0); }
    root.position.y = 0;
  };
  ai.distTo = (p) => flat(ai.pos(), p);

  function seatInfo() {
    const s = A(seatAnchor) || A(chairAnchor);
    if (!s) return { pos: V(2, 0, 8), rotY: 0 };
    return { pos: V(s.pos.x, 0, s.pos.z), rotY: s.rotY || 0 };
  }
  // Standing spot beside the chair (so Jon doesn't walk through the table).
  ai.standSpot = () => {
    const a = A(chairAnchor) || A(seatAnchor);
    const s = seatInfo();
    const base = a ? V(a.pos.x, 0, a.pos.z) : s.pos.clone();
    const f = V(Math.sin(s.rotY), 0, Math.cos(s.rotY));
    return base.addScaledVector(f, -0.55);
  };
  const faceTo = (p, k = 1) => {
    const want = Math.atan2(p.x - root.position.x, p.z - root.position.z);
    root.rotation.y += wrap(want - root.rotation.y) * k;
  };

  // ---------- navigation ----------
  let path = null, pathI = 0, moveSpeed = 0, goal = null, repathT = 0;
  function setGoal(p, speed) {
    goal = p.clone(); moveSpeed = speed;
    let pts = null;
    try { pts = world.nav?.path?.(root.position.clone(), goal.clone()); } catch (e) { pts = null; }
    path = pts && pts.length ? pts.map((q) => q.clone()) : [goal.clone()];
    // drop a first node behind us
    if (path.length > 1 && flat(path[0], root.position) < 0.3) path.shift();
    pathI = 0;
  }
  function stopMove() { path = null; goal = null; moveSpeed = 0; jon.setMove?.(0); }
  // returns true when arrived
  function stepMove(dt, arriveDist = 0.18) {
    if (!path) return true;
    let tgt = path[pathI];
    while (tgt && flat(root.position, tgt) < (pathI === path.length - 1 ? arriveDist : 0.3)) {
      pathI++; tgt = path[pathI];
    }
    if (!tgt) { root.position.y = goal ? (goal.y ?? root.position.y) : root.position.y; stopMove(); return true; }
    const dx = tgt.x - root.position.x, dz = tgt.z - root.position.z, d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const turn = wrap(want - root.rotation.y);
    root.rotation.y += turn * Math.min(1, dt * 9);
    const slow = Math.abs(turn) > 1.2 ? 0.35 : 1; // corners well: slows to pivot
    const step = Math.min(d, moveSpeed * slow * dt);
    root.position.x += (dx / d) * step; root.position.z += (dz / d) * step;
    // vertical: follow nav node heights (stairs), else world ground
    const prev = pathI > 0 ? path[pathI - 1] : null;
    if (prev && Math.abs(prev.y - tgt.y) > 0.05) {
      const seg = flat(prev, tgt) || 1, k = 1 - flat(root.position, tgt) / seg;
      root.position.y = THREE.MathUtils.lerp(prev.y, tgt.y, THREE.MathUtils.clamp(k, 0, 1));
    } else root.position.y = tgt.y ?? root.position.y;
    jon.setMove?.(moveSpeed * slow);
    return false;
  }

  // ---------- tasks (cancellable async scripts) ----------
  let task = null;
  function makeTask(fn, { interruptible = true, name = 'task' } = {}) {
    if (task) task.cancelled = true;
    const t = { cancelled: false, interruptible, name };
    const chk = () => { if (t.cancelled) throw CANCEL; };
    t.wait = (s) => new Promise((res, rej) => {
      let left = s; const tick = (dt) => { if (t.cancelled) { off(); rej(CANCEL); return; } left -= dt; if (left <= 0) { off(); res(); } };
      const off = addTicker(tick);
    });
    t.walkTo = (p, { speed = HUMAN.walk, arrive = 0.18 } = {}) => new Promise((res, rej) => {
      chk(); setGoal(p, speed);
      const off = addTicker((dt) => {
        if (t.cancelled) { off(); rej(CANCEL); return; }
        if (stepMove(dt, arrive)) { off(); res(); }
      });
    });
    t.play = async (name, dur, opts = {}) => { chk(); clip(name, { once: !opts.loop, force: true, fallback: opts.fallback }); if (opts.loop) clip(name, { force: true }); await t.wait(dur); };
    t.loop = (name, opts) => { chk(); clip(name, { ...opts, force: true }); };
    t.face = async (p, dur = 0.35) => { chk(); const off = addTicker((dt) => faceTo(p, Math.min(1, dt * 10))); await t.wait(dur).finally(off); };
    t.say = (key, opt) => { chk(); say(key, opt); };
    t.chk = chk;
    task = t;
    ai.taskName = name;
    Promise.resolve().then(() => fn(t)).then(() => { if (task === t) { task = null; ai.taskName = null; } },
      (e) => { if (e !== CANCEL) console.error('[jonAI] task', name, e); if (task === t) { task = null; ai.taskName = null; } });
    return t;
  }
  const tickers = new Set();
  function addTicker(fn) { tickers.add(fn); return () => tickers.delete(fn); }
  function cancelTask() { if (task) task.cancelled = true; task = null; stopMove(); }

  function setState(s) { ai.state = s; ai.stateT = 0; ai.events?.emit?.('state', s); }

  // ---------- home routines ----------
  ai.setHome = (h) => { ai.home = h; };
  ai.goHome = () => {
    const h = ai.home;
    if (h.type === 'sit') return ai.goSit();
    if (h.type === 'wander') return ai.wander();
    if (h.type === 'sulk') return ai.sulk(h.anchor);
    if (h.type === 'custom') return h.fn(ai);
    if (h.type === 'stay') { setState('idle'); clip('idle'); }
  };

  // Floor point in front of the seat where Jon stands before sitting.
  ai.seatFront = () => {
    const seat = seatObj();
    if (!seat) return ai.standSpot();
    const q = seat.getWorldQuaternion(new THREE.Quaternion()); const f = V(0, 0, 1).applyQuaternion(q); f.y = 0; f.normalize();
    return seat.getWorldPosition(V()).setY(0).addScaledVector(f, 0.36);
  };
  ai.sitNow = () => {
    cancelTask();
    const seat = seatObj();
    if (seat && jon.sitAt) { if (!ai.seated()) jon.sitAt(seat, 'sit_eat'); }
    else { const s = seatInfo(); root.position.copy(s.pos); root.rotation.y = s.rotY; }
    curClip = null;
    setState('sitEat'); clip('sit_eat', { fallback: 'sit', force: true });
    jon.holdProp?.('fork');
  };
  ai.goSit = () => {
    setState('goSit'); expr('happy');
    makeTask(async (t) => {
      if (ai.seated()) { ai.sitNow(); return; }
      const seat = seatObj();
      if (seat && jon.sitAt) {
        await t.walkTo(ai.seatFront(), { arrive: 0.12 });
        await t.face(ai.seatFront().add(V(0, 0, 0).subVectors(ai.seatFront(), seat.getWorldPosition(V()).setY(0)).setLength(1)), 0.3);
        jon.sitAt(seat); curClip = null;
        await t.wait(1.0);
      } else {
        await t.walkTo(ai.standSpot());
        const s = seatInfo();
        await t.face(s.pos.clone().add(V(Math.sin(s.rotY), 0, Math.cos(s.rotY))), 0.3);
        root.position.copy(s.pos); root.rotation.y = s.rotY;
        clip('sit', { once: true, force: true });
        await t.wait(0.6);
      }
      if (Math.random() < 0.6) t.say('j_back');
      ai.sitNow();
    }, { name: 'goSit' });
  };

  let wanderI = 0;
  ai.wanderRoute = ['tv', 'sofa', 'window', 'loungeChair', 'kitchenBench', 'fridgeFront', 'stairsBottom', 'livingCentre'];
  ai.wander = () => {
    ai.leave(); setState('wander'); expr('happy'); jon.holdProp?.(null);
    makeTask(async (t) => {
      for (;;) {
        const names = ai.wanderRoute.filter((n) => A(n));
        if (!names.length) { await t.play('idle', 2, { loop: true }); continue; }
        const n = names[wanderI++ % names.length];
        const p = anchorPos(n); p.y = floorBase(p);
        // stand a little off furniture anchors
        const off = V(root.position.x - p.x, 0, root.position.z - p.z); if (off.length() > 0.01) off.setLength(0.7);
        await t.walkTo(p.add(off), { arrive: 0.3 });
        await t.play(Math.random() < 0.5 ? 'scratch_head' : 'idle', 1.6 + Math.random() * 1.5, { fallback: 'idle' });
      }
    }, { name: 'wander' });
  };

  ai.sulk = (anchorName = 'loungeChair') => {
    ai.leave(); setState('sulk');
    makeTask(async (t) => {
      const a = A(anchorName);
      if (a) {
        const p = anchorPos(anchorName); const f = V(Math.sin(a.rotY || 0), 0, Math.cos(a.rotY || 0));
        await t.walkTo(p.clone().addScaledVector(f, 0.55));
        root.position.set(p.x, 0, p.z); root.rotation.y = a.rotY || 0;
      }
      expr('sad');
      t.loop('sit', { fallback: 'idle' });
      for (;;) { await t.wait(11 + Math.random() * 5); t.say('j_l10_sulk'); }
    }, { name: 'sulk' });
  };

  // ---------- investigate ----------
  // Walk to a spot, look around for `dur`, say lines, then go home (unless a level overrides via onDone).
  ai.investigate = (target, { dur = 10, arriveLine, lookLines = [], onArrive, onDone, standOff = 0.8, speed = HUMAN.walk } = {}) => {
    const seated = ai.seated();
    setState('investigate'); jon.holdProp?.(null);
    const p = target.isVector3 ? target.clone() : anchorPos(target);
    return makeTask(async (t) => {
      if (seated) await ai.standUp(t);
      const dest = p.clone(); dest.y = floorBase(p);
      const away = V(root.position.x - dest.x, 0, root.position.z - dest.z);
      if (away.length() > 0.01) away.setLength(standOff); dest.add(away);
      await t.walkTo(dest, { speed });
      await t.face(p);
      if (arriveLine) t.say(arriveLine, { force: true });
      onArrive?.();
      let left = dur, i = 0;
      while (left > 0) {
        const c = i % 2 ? 'scratch_head' : 'investigate';
        await t.play(c, Math.min(left, 3), { fallback: 'idle' });
        if (lookLines[i]) t.say(lookLines[i], { force: true });
        left -= 3; i++;
      }
      setState('returning');
      if (onDone) onDone(); else ai.goHome();
    }, { name: 'investigate' });
  };

  ai.standUp = async (t) => {
    if (!ai.seated()) return;
    jon.lookAt?.(null);
    await t.play('stand_up', 0.9, { fallback: 'idle' });
    ai.leave();
    curClip = null;
  };
  // Generic scripted task for levels (state 'scripted'; reactions still interrupt unless interruptible:false).
  ai.run = (name, fn, opts = {}) => { setState(name); return makeTask(fn, { name, ...opts }); };

  // ---------- reactions ----------
  function zoneFor(info) {
    if (ai.zoneOverride) { const z = ai.zoneOverride(info); if (z) return z; }
    if (ai.gElevated() || (controller.vel && controller.vel.y > 0.5 && ai.gHeight() > 0.15)) return 'face';
    if (ai.seated() || ai.state === 'sitEat') return 'leg';
    const r = ai.facing(), jp = ai.pos();
    const fwd = V(Math.sin(r), 0, Math.cos(r));
    const toG = V(controller.pos.x - jp.x, 0, controller.pos.z - jp.z).normalize();
    if (fwd.dot(toG) < -0.5) return 'butt';
    return 'leg';
  }
  const unreactive = new Set(['catch', 'trapped', 'stunned', 'faceplant', 'down', 'cutscene', 'off']);
  ai.canReact = () => ai.enabled && !unreactive.has(ai.state) && !(task && !task.interruptible) && !ctx.director?.active;

  function onScratch(info) {
    if (!info || info.hit !== who || !ai.canReact()) return;
    if (ai.state === 'react' && ai.stateT < 0.6) return;
    const zone = zoneFor(info);
    ai.react(zone, info);
  }
  ai.react = (zone, info = {}) => {
    ai.reactions++;
    ai.lastZone = zone;
    ai.events?.emit?.('react', zone);
    events?.emit?.('humanReact', { zone, who });
    if (ai.reactHook && ai.reactHook(zone, info)) return;
    const seated = ai.seated();
    cancelTask(); setState('react'); jon.holdProp?.(null);
    ctx.audio?.sfx?.('yowl', { vol: 0.5 });
    makeTask(async (t) => {
      // standing clips only: get out of the chair first (seated clips are sit/sit_eat/stand_up/stunned/fall_back)
      t.say(zone === 'leg' ? 'j_leg' : zone === 'butt' ? 'j_butt' : 'j_face', { force: true });
      if (seated) { expr('pain'); await ai.standUp(t); }
      if (zone === 'leg') {
        expr('pain');
        await t.play('hop_leg', HUMAN.legHop, { loop: true, fallback: 'idle' });
        ai.chase();
      } else if (zone === 'butt') {
        expr('shock');
        await t.play('cover_butt', HUMAN.buttCover, { fallback: 'idle' });
        ai.chase();
      } else {
        expr('pain');
        await t.play('cover_face', HUMAN.faceCover, { fallback: 'idle' });
        await ai._throwPaper(t);
      }
    }, { name: 'react' });
  };

  // ---------- newspaper ----------
  ai._throwPaper = async (t) => {
    expr('angry');
    setState('throw');
    await t.face(controller.pos, 0.3);
    t.say('j_paper');
    let thrown = null;
    const offThrow = jon.on?.('throw', (e) => { thrown = e || {}; });
    clip('throw_newspaper', { once: true, force: true, fallback: 'idle' });
    let own = null;
    if (!jon.on) { own = createNewspaper(ctx); jon.holdProp?.('newspaper', own.mesh); }
    for (let w = 0; w < 1.0 && !thrown; w += 0.05) await t.wait(0.05);
    offThrow?.();
    if (own) jon.holdProp?.(null);
    const paper = own || createNewspaper(ctx, thrown?.object || null);
    const from = V();
    if (thrown?.pos) from.copy(thrown.pos); else (jon.sockets?.handR || root).getWorldPosition(from);
    if (from.y < ai.pos().y + 0.8) from.y = ai.pos().y + 1.3;
    paper.launch(from, controller, (hit) => {
      if (hit) { events?.emit?.('paperHit'); ctx.barks?.say('g_paper_hit', { delay: 0.6 }); }
      else ctx.barks?.say('g_paper_dodge', { delay: 0.3, chance: 0.6 });
    });
    ai.papers.push(paper);
    const thrownAt = ai.t;
    await t.wait(0.8);
    // walk over and pick the paper up — the distraction window
    setState('fetchPaper');
    expr('sad');
    const wait = () => new Promise((r) => { const off = addTicker(() => { if (t.cancelled || paper.landed) { off(); r(); } }); });
    await wait(); t.chk();
    t.say('j_paper_fetch');
    await t.walkTo(paper.pos.clone(), { arrive: 0.5 });
    await t.play('give_bowl', 1.0, { fallback: 'idle' });
    paper.dispose(); ai.papers = ai.papers.filter((q) => q !== paper);
    // he stops to smooth out his crumpled paper: keeps the window open long enough for small hands
    jon.holdProp?.('newspaper', createNewspaper(ctx).mesh);
    const left = Math.max(1.5, HUMAN.paperWindow - (ai.t - thrownAt));
    await t.play('investigate', left, { fallback: 'idle' });
    jon.holdProp?.(null);
    ai.goHome();
  };

  // ---------- chase ----------
  ai.chase = (secs = HUMAN.chaseTime, { solo = false, quiet = false } = {}) => {
    cancelTask(); ai.leave(); setState('chase'); expr('angry');
    ai.chaseLeft = secs; ai.glareT = 0; repathT = 0;
    if (!quiet) { say('j_chase'); ctx.barks?.say(ai.partner && !solo ? 'g_c2_chased' : 'g_chased', { delay: 1.2 }); }
    events?.emit?.('chase', { on: true, who });
    ctx.audio?.music?.('chase', { fade: 0.4 });
    const p = ai.partner;
    if (!solo && p && p.canReact() && p.state !== 'chase' && p.state !== 'glare' && !p.noChase) p.chase(secs, { solo: true, quiet: true });
  };
  ai.stopChase = () => { if (ai.state === 'chase' || ai.state === 'glare') endChase(false); };
  function endChase(gaveUp) {
    events?.emit?.('chase', { on: false, who });
    ctx.ui?.hud?.set?.({ chaseTimer: null });
    ctx.audio?.music?.('sneak', { fade: 1.2 });
    stopMove();
    if (gaveUp) { say('j_giveup'); ctx.barks?.say('g_gaveup', { delay: 1.5, chance: 0.7 }); }
    setState('returning');
    makeTask(async (t) => { await t.play('sigh', 1.3, { fallback: 'idle' }); ai.goHome(); }, { name: 'afterChase' });
  }
  function updateChase(dt) {
    ai.chaseLeft -= dt;
    ctx.ui?.hud?.set?.({ chaseTimer: Math.max(0, ai.chaseLeft) });
    const gp = ai.gFloorPos();
    const elevated = ai.gElevated();
    if (ai.chaseLeft <= 0) return endChase(true);
    if (elevated) {
      if (ai.state !== 'glare') { setState('glare'); ai.glareT = 0; ctx.barks?.say('g_escape', { delay: 0.5 }); }
      ai.glareT += dt;
      const d = flat(root.position, gp);
      if (d > 0.9) {
        repathT -= dt;
        if (repathT <= 0 || !path) { setGoal(gp, HUMAN.run * 0.8); repathT = 0.5; }
        stepMove(dt, 0.85);
      } else { stopMove(); faceTo(controller.pos, Math.min(1, dt * 8)); clip('talk_angry', { fallback: 'idle' }); }
      if (ai.glareT > 0.9 && !ai._glared) { ai._glared = true; say('j_glare'); }
      if (ai.glareT > HUMAN.glareGiveUp) { ai._glared = false; return endChase(true); }
      return;
    }
    if (ai.state === 'glare') { setState('chase'); ai._glared = false; }
    // a short wind-up so a cat standing right next to him gets a fair head start
    if (ai.state === 'chase' && ai.stateT < HUMAN.windup) { stopMove(); faceTo(controller.pos, Math.min(1, dt * 8)); clip('talk_angry', { fallback: 'idle' }); return; }
    clip('run', { fallback: 'walk' });
    repathT -= dt;
    if (repathT <= 0 || !path) { setGoal(gp, HUMAN.run); repathT = 0.35; }
    stepMove(dt, 0.4);
    if (flat(root.position, gp) < HUMAN.catchDist && Math.abs(root.position.y - gp.y) < 0.6) ai.catchGarfield();
    if (Math.random() < dt / 3.5) say('j_chase');
  }

  // ---------- catch cutscene ----------
  ai.catchGarfield = async () => {
    if (ai.state === 'catch') return;
    events?.emit?.('chase', { on: false, who });
    ctx.ui?.hud?.set?.({ chaseTimer: null });
    ai.partner?.stopChase?.();
    cancelTask(); ai.leave(); setState('catch'); ai.catches++; ai.lastCatch = ai.t;
    events?.emit?.('caught');
    const g = ctx.garfield;
    const gp = ai.gFloorPos();
    // put Garfield on the floor in front of Jon (if he was on the table etc.)
    const fwd = V(gp.x - root.position.x, 0, gp.z - root.position.z);
    if (fwd.length() < 0.2) fwd.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    fwd.normalize();
    const spot = root.position.clone().addScaledVector(fwd, 0.85); spot.y = floorBase(root.position);
    const paper = createNewspaper(ctx);
    const run = async (d) => {
      controller.lock?.(true);
      controller.teleport?.(spot, Math.atan2(-fwd.x, -fwd.z));
      root.rotation.y = Math.atan2(fwd.x, fwd.z);
      stopMove(); clip('idle', { force: true });
      const side = V(-fwd.z, 0, fwd.x);
      const mid = root.position.clone().addScaledVector(fwd, 0.45);
      d.cut?.(bestShot(ctx, mid.clone().add(V(0, 0.55, 0)), { dist: 2.3, h: 0.55, prefer: Math.atan2(side.x, side.z) }));
      expr('angry');
      const ownPaper = !has('whack');
      if (ownPaper) jon.holdProp?.('newspaper', paper.mesh);
      await d.say?.(who, pick('j_catch'));
      clip('whack', { once: true, force: true, fallback: 'idle' });
      const hitAt = jon.clipInfo?.whack?.ev?.hit;
      await d.wait?.(typeof hitAt === 'number' ? hitAt : 0.5);
      ctx.audio?.sfx?.('whack');
      try { g.play?.('whacked', { once: true }); } catch {}
      ctx.camera?.shake?.(0.12);
      await d.wait?.(1.1);
      expr('happy');
      try { g.setExpression?.('sleepy'); } catch {}
      await d.say?.('garfield', pick('g_caught'), { thought: true });
      jon.holdProp?.(null); paper.dispose();
      // Jon walks off
      setState('returning');
      ai.goHome();
      await d.wait?.(1.4);
    };
    try {
      if (ctx.director?.run) await ctx.director.run(run);
      else await run(fakeDirector());
    } finally {
      jon.holdProp?.(null); paper.dispose();
      const safe = spot.clone().addScaledVector(fwd, 0.6);
      if (ctx.director && !ctx.skip) controller.teleport?.(safe, Math.atan2(fwd.x, fwd.z));
      try { g.setExpression?.('smug'); g.play?.('idle'); } catch {}
      controller.lock?.(false);
      if (ai.state === 'catch') { setState('returning'); ai.goHome(); }
      events?.emit?.('caughtEnd');
    }
  };
  // Bark key choice via barks (keeps no-repeat bags); fallback random.
  function pick(prefix) { prefix = lk(prefix); return ctx.barks?.pick?.(prefix) || prefix + '_1'; }
  function fakeDirector() {
    return { wait: (s) => new Promise((r) => setTimeout(r, s * 1000)), say: async (who, k) => say(k, { force: true }),
      cam: async () => {}, letterbox: async () => {}, follow: () => {} };
  }

  // ---------- special states ----------
  ai.stun = (dur = 18) => {
    cancelTask(); setState('stunned'); expr('dizzy');
    makeTask(async (t) => {
      t.loop('stunned_shake', { fallback: 'idle' });
      t.say('j_stunned', { force: true });
      await t.wait(dur);
      expr('happy'); setState('sitEat'); ai.sitNow();
    }, { name: 'stunned', interruptible: false });
  };
  ai.trap = () => {
    cancelTask(); setState('trapped'); expr('shock');
    makeTask(async (t) => {
      for (let i = 0; ; i++) {
        t.loop('pound_door', { fallback: 'talk_angry' });
        world.props?.get?.(ai.trapDoor || 'bedroomDoor')?.rattle?.();
        if (i % 2 === 0) t.say('j_trapped', { force: i === 0, interrupt: true });
        await t.wait(4 + Math.random() * 2);
      }
    }, { name: 'trapped', interruptible: false });
  };
  ai.faceplant = () => {
    cancelTask(); setState('faceplant'); expr('dizzy');
    makeTask(async (t) => {
      t.say('j_slip', { force: true });
      ctx.audio?.sfx?.('slip');
      await t.play('slip_faceplant', 1.5, { fallback: 'idle' });
      ctx.audio?.sfx?.('crash');
      t.say('j_faceplant', { force: true });
      t.loop('lie_still', { fallback: 'idle' });
    }, { name: 'faceplant', interruptible: false });
  };
  ai.setOff = () => { cancelTask(); setState('off'); };
  ai.cutscene = (on) => { if (on) { cancelTask(); setState('cutscene'); } else setState('idle'); };

  // ---------- update ----------
  let chatterT = 6 + Math.random() * 8;
  ai.update = (dt) => {
    ai.t += dt; ai.stateT += dt;
    for (const fn of [...tickers]) fn(dt);
    for (const p of ai.papers) p.update(dt);
    if (ai.state === 'chase' || ai.state === 'glare') updateChase(dt);
    if (ai.state === 'sitEat') { ai.seatedAlertFor += dt; jon.lookAt?.(ctx.garfield?.root?.position || null); }
    else ai.seatedAlertFor = 0;
    if (ai.state !== 'sitEat' && ai.state !== 'chase' && ai.state !== 'glare') {
      const head = ctx.garfield?.root?.position;
      jon.lookAt?.(ai.state === 'react' || ai.state === 'throw' ? head : null);
    }
    chatterT -= dt;
    if (chatterT <= 0) {
      chatterT = 15 + Math.random() * 10;
      if (ai.chatter) ai.chatter(ai.state);
      else if (ai.state === 'sitEat') say('j_eat', { lowPri: true });
      else if (ai.state === 'wander') say(lp === 'j' ? 'j_wander' : 'l_idle', { lowPri: true });
    }
  };
  // Sit on any anchor (sofa seats, armchair): a seat Object3D at the anchor, actor.sitAt() as for chairs.
  const seats = new Map();
  function seatAt(name) {
    if (seats.has(name)) return seats.get(name);
    const a = A(name);
    if (!a) return null;
    const o = new THREE.Object3D();
    o.position.copy(a.pos); o.rotation.y = a.rotY || 0;
    world.scene.add(o); seats.set(name, o);
    return o;
  }
  ai.sitOnNow = (name, clipName = 'watch_tv', state = 'sofa') => {
    cancelTask();
    const o = seatAt(name);
    if (!o) return;
    if (ai.seated()) ai.leave();
    if (jon.sitAt) { jon.sitAt(o, clipName); curSeat = o; }
    else { root.position.copy(o.position).setY(0); root.rotation.y = o.rotation.y; }
    curClip = null;
    setState(state); clip(clipName, { fallback: 'sit', force: true });
  };
  ai.sitOn = (name, clipName = 'watch_tv', state = 'sofa') => {
    setState('goSofa');
    return makeTask(async (t) => {
      if (ai.seated()) await ai.standUp(t);
      const o = seatAt(name);
      if (!o) { setState(state); return; }
      const f = V(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
      const front = o.position.clone().setY(floorBase(o.position)).addScaledVector(f, 0.45);
      await t.walkTo(front, { arrive: 0.15 });
      await t.face(front.clone().add(f), 0.3);
      ai.sitOnNow(name, clipName, state);
    }, { name: 'sitOn' });
  };
  ai.place = (p, rotY = 0) => { cancelTask(); ai.leave(); root.position.copy(p); root.rotation.y = rotY; };
  ai.walkTo = (p, speed) => ai.run('walking', async (t) => { await t.walkTo(p, { speed: speed || HUMAN.walk }); ai.goHome(); });
  ai.onScratch = onScratch;
  ai.isAlert = () => ai.state === 'sitEat' && ai.enabled;
  ai.distracted = () => !ai.isAlert();
  ai.busy = () => !!task;

  const offScratch = events?.on?.('scratch', onScratch);
  ai.dispose = () => { cancelTask(); try { ai.leave(); } catch {} offScratch?.(); for (const p of ai.papers) p.dispose(); ai.papers = []; tickers.clear(); };
  return ai;
}

// Jon + Lyman (D18): both chase together; Lyman's body is a scratch target (core's scratch only knows Jon).
export function createHumans(ctx, { lyman = null } = {}) {
  const jon = createHumanAI(ctx, { who: 'jon' });
  const out = { jon, lyman: null, list: [jon] };
  if (lyman) {
    const ly = createHumanAI(ctx, { who: 'lyman', actor: lyman });
    jon.partner = ly; ly.partner = jon;
    out.lyman = ly; out.list.push(ly);
    const hips = new THREE.Vector3();
    ctx.scratch.register({
      id: 'lyman', radius: 0.42, heightTol: 1.4,
      getPos: (o) => {
        lyman.root.getWorldPosition(hips);
        const y0 = hips.y;
        return (o || new THREE.Vector3()).copy(hips).setY(THREE.MathUtils.clamp(ctx.controller.pos.y + 0.26, y0 + 0.1, y0 + 1.7));
      },
      enabled: () => lyman.root.visible !== false && ly.canReact(),
      onHit: (info) => { ly.onScratch({ ...(info || {}), hit: 'lyman' }); ctx.events?.emit?.('humanHit', { who: 'lyman' }); },
    });
  }
  out.update = (dt) => { for (const a of out.list) a.update(dt); };
  out.dispose = () => { for (const a of out.list) a.dispose(); };
  out.any = (fn) => out.list.some(fn);
  out.all = (fn) => out.list.every(fn);
  out.chasing = () => out.list.some((a) => a.state === 'chase' || a.state === 'glare');
  return out;
}
