import { EJECT_LOOK, OPPONENTS, townsfolk, hatFor, pomfreyHat } from './looks.js?v=20261004a';
import { CLIP as RIG } from '../kit/crowd.js?v=20261004a';
import { PCOL } from './particles.js?v=20261004a';
import { HATS, POMFREY_HATS } from '../../data/hats.js?v=20261004a';

// Every spectacle as a small state machine: { prio, slot, line, begin, update(dt) → false when done, pick, on, end }.
// prio: 3 special · 2 beat/fling · 1 ambient duel · 0 gag. Actors come from ctx.actor() and may be null (budget):
// every scene must still play (or skip a part) without them.
const CLIP = RIG;
const R = Math.random, PI = Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const pickOf = (arr) => arr[Math.floor(R() * arr.length)];

export function createScenes(ctx) {
  const { parts, PV, street, world } = ctx;
  let api = null;
  const S = {};
  S.attach = (a) => { api = a; };
  const ROAD = street.z, NORTH = (street.north ?? street.z - street.width / 2) - 2.4, SOUTH = (street.south ?? street.z + street.width / 2) + 0.8;
  const _h = [0, 0, 0], _c = [0, 0, 0];

  // ---- actor helpers
  const face = (a, x, z) => { a.h = Math.atan2(x - a.x, z - a.z); };
  function walkTo(a, x, z, speed, dt) {
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
    if (d < 0.05) { a.clip = CLIP.idle; return true; }
    const k = Math.min(1, (speed * dt) / d);
    a.x += dx * k; a.z += dz * k;
    a.h = Math.atan2(dx, dz); a.clip = CLIP.walk; a.speed = 3 + speed * 2.4;
    return k >= 1;
  }
  // Ballistic arc from → to over dur with an apex; tumble = turns of the root (thrown clip, ART_DIRECTION §2).
  function arc(o, u) {
    const k = clamp(u, 0, 1);
    _c[0] = o.from[0] + (o.to[0] - o.from[0]) * k;
    _c[2] = o.from[2] + (o.to[2] - o.from[2]) * k;
    _c[1] = o.from[1] + (o.to[1] - o.from[1]) * k + 4 * o.apex * k * (1 - k);
    return _c;
  }
  function popHat(a, vx = 0, vy = 4, vz = 1.2) {
    if (!a || a.hat.type < 0 || a.hat.off) return;
    ctx.head(a, _h);
    a.hat.off = { x: _h[0], y: _h[1] - 0.1, z: _h[2], rx: 0, ry: a.h, rz: 0, vx, vy, vz, spin: (R() - 0.5) * 14, rest: false };
  }
  function hatPhysics(a, dt, upside = false) {
    const o = a?.hat.off;
    if (!o || o.rest) return;
    o.vy -= 12 * dt;
    o.x += o.vx * dt; o.y += o.vy * dt; o.z += o.vz * dt;
    o.rx += o.spin * dt * 0.7; o.rz += o.spin * dt * 0.4;
    if (o.y <= 0.06 && o.vy < 0) { o.y = 0.06; o.rest = true; o.rx = upside ? PI : 0; o.rz = 0; parts.puff([o.x, 0, o.z], 3, { r: 0.3, size: 0.25, line: a.line }); }
  }
  const hatDef = (tier) => hatFor(HATS[tier] || HATS[0]);
  function strangerSpec(extra = {}) {
    const h = hatDef(ctx.game.state.hat || 0);
    return { char: 'stranger', hat: h, ...extra };
  }
  function setHat(a, h) { if (a) ctx.setHat(a, h); }

  // ---- fallback saloon set dressing (until lane P names the anchors on the plot)
  function saloonSet(dt) {
    if (!world.plots.has('saloon')) return;
    const L = 'saloon';
    if (!ctx.hasAnchor(L, 'trough')) { const p = ctx.anchor(L, 'trough'); ctx.prop(PV.trough, p[0], p[1], p[2], { line: L }); }
    if (!ctx.hasAnchor(L, 'haycart')) { const p = ctx.anchor(L, 'haycart'); ctx.prop(PV.haycart, p[0], p[1], p[2], { ry: PI / 2, line: L }); }
    if (!ctx.hasAnchor(L, 'wagon')) { const p = ctx.anchor(L, 'wagon'); ctx.prop(PV.wagon, p[0], p[1], p[2], { ry: PI / 2 + 0.2, line: L, rz: wagonRock }); }
    if (!ctx.hasAnchor(L, 'piano')) {
      const p = ctx.anchor(L, 'piano');
      ctx.prop(PV.piano, p[0], p[1], p[2], { ry: PI, line: L, sy: 1 + pianoBounce * 0.06 });
    }
    wagonRock *= Math.exp(-dt * 3);
    pianoBounce = Math.max(0, pianoBounce - dt * 4);
  }
  let wagonRock = 0, pianoBounce = 0;
  // Fingers at the fallback piano (a crowd extra, so he never costs the animated budget).
  S.set = () => {
    const sc = { prio: 0.5, line: 'saloon' };
    let f = null;
    sc.begin = () => {
      const p = ctx.anchor('saloon', 'piano');
      f = ctx.extra(sc, { char: 'fingers', x: p[0], y: 0.18, z: p[2] - 0.75, h: PI, clip: CLIP.piano, line: 'saloon' });
    };
    sc.update = (dt) => {
      if (!f) return sc.t < 1;
      f.clip = CLIP.piano;
      f.speed = 4 + pianoBounce * 8;
      return true;
    };
    sc.on = (k) => { if (k === 'piano') pianoBounce = 1; };
    return sc;
  };

  S.always = (dt) => {
    saloonSet(dt);
    if (!ctx.hasAnchor('saloon', 'piano') && world.plots.has('saloon') && api && !api.scenes.includes('set')) api.play('set');
  };

  // ======================================================= SALOON EJECTION + FLING (W4/W6)
  const TARGET_ANCHOR = { trough: ['saloon', 'trough', 0.55], dentist: ['dentist', 'chair', 0.4], jail: ['saloon', 'wagon', 1.3], pomfrey: ['saloon', 'pomfreyWindow', 0], haycart: ['saloon', 'haycart', 0.9] };
  function targetPos(id, out = [0, 0, 0]) {
    const [lid, name, dy] = TARGET_ANCHOR[id] || TARGET_ANCHOR.trough;
    const p = ctx.anchor(world.plots.has(lid) ? lid : 'saloon', world.plots.has(lid) ? name : 'doors', out);
    if (!p) return null;
    if (!world.plots.has(lid)) p[0] += 9;
    p[1] += dy;
    return p;
  }

  S.eject = (args) => {
    if (!world.plots.has('saloon')) return null;
    const sc = { prio: 2, line: 'saloon', ejectId: args.id, phase: 'hold', cosmetic: !!args.cosmetic };
    const lv = args.level || 1;
    const doors = ctx.anchor('saloon', 'doors');
    let mabel = null, holdProp = -1, flight = null, landAt = -1;
    const bodies = [];
    const kind = args.kind || 'drunk';
    sc.begin = () => {
      mabel = ctx.actor(sc, { char: 'mabel', x: doors[0], z: doors[2], h: 0, clip: CLIP.carry });
      const table = kind !== 'goat' && kind !== 'pianist' && lv >= 100 && R() < 0.35;
      if (kind === 'goat') holdProp = PV.goat;
      else if (kind === 'pianist') { holdProp = PV.piano; bodies.push(ctx.actor(sc, { char: 'fingers', clip: CLIP.piano, speed: 9 })); }
      else if (table) { holdProp = PV.table; for (let i = 0; i < 2; i++) bodies.push(ctx.actor(sc, { ...townsfolk(40 + i), clip: CLIP.sit })); }
      else {
        const n = lv >= 25 && R() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) bodies.push(ctx.actor(sc, { char: i ? 'drunk' : EJECT_LOOK[kind] || 'drunk', clip: CLIP.flail, speed: 9 }));
      }
      for (let i = bodies.length - 1; i >= 0; i--) if (!bodies[i]) bodies.splice(i, 1);
      parts.puff([doors[0], 0.3, doors[2] + 0.4], 5, { line: 'saloon' });
      if (args.thrown) sc.on('fling', args.thrown);
    };
    const over = () => holdProp === PV.table || holdProp === PV.piano;
    function heldPos(i, out) {
      const sway = Math.sin(sc.t * 9 + i) * 0.12;
      if (over()) { out[0] = doors[0] + (i - 0.5) * 0.7; out[1] = 2.55 + (holdProp === PV.table ? 0.75 : 0.2); out[2] = doors[2] + 0.4; }
      else { out[0] = doors[0] + (i ? -0.7 : 0.55) + sway * 0.3; out[1] = 0.45 + Math.abs(sway); out[2] = doors[2] + 0.95; }
      return out;
    }
    sc.flingInfo = () => {
      const c = heldPos(0, [0, 0, 0]);
      const o = ctx.project(c);
      const targets = ['trough', 'dentist', 'jail', 'pomfrey'].map((id) => { const p = targetPos(id); const s = p && ctx.project(p); return s ? { id, x: s.x, y: s.y, visible: s.visible } : null; }).filter(Boolean);
      return { id: sc.ejectId, x: o.x, y: o.y, targets };
    };
    // Swipe (dx, dy) in screen px → E's cardinal dir (left trough · right dentist · down jail · up Pomfrey), the same
    // mapping the UI's fling chips show. flingInfo().targets has each landing spot's true screen position.
    const dirFor = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    sc.pick = (ray, _ctx, line) => {
      if (sc.phase !== 'hold' || sc.cosmetic || (line && line !== 'saloon')) return null;
      heldPos(0, _c);
      const d = ctx.nearRay(ray, [_c[0], _c[1] + 0.6, _c[2]], 2.4);
      if (d < 0) return null;
      return { rank: 3, kind: 'fling', id: sc.ejectId, lineId: 'saloon', act: 'fling', payload: { dir: 'trough' }, dirFor, targets: sc.flingInfo().targets, dist: d };
    };
    sc.on = (k, e) => {
      if (k !== 'fling' || flight) return;
      sc.phase = 'thrown';
      const to = targetPos(e.target || 'trough');
      const from = heldPos(0, [0, 0, 0]);
      const dist = Math.hypot(to[0] - from[0], to[2] - from[2]);
      flight = { target: e.target, auto: !!e.auto, t0: sc.t, from, to, dur: clamp(dist / 9, 0.75, 1.5), apex: 1.6 + dist * 0.12 };
      if (mabel) { mabel.clip = CLIP.cheer; mabel.speed = 6; }
      parts.puff([doors[0], 0.4, doors[2] + 0.8], 6, { line: 'saloon' });
      for (const b of bodies) if (holdProp < 0) popHat(b, (to[0] - from[0]) * 0.2, 3, (to[2] - from[2]) * 0.2);
    };
    let auto = args.autoAfter ?? null;
    sc.update = (dt) => {
      if (sc.phase === 'hold') {
        if (auto != null && sc.t >= auto) sc.on('fling', { target: pickOf(['trough', 'haycart', 'jail', 'pomfrey']), auto: true });
        if (sc.t > (args.hold || 2.2) + 3) return false;
        bodies.forEach((b, i) => { heldPos(i, _c); b.x = _c[0]; b.y = _c[1]; b.z = _c[2]; b.h = 0; b.roll = Math.sin(sc.t * 9 + i) * 0.25; b.pitch = over() ? 0 : -0.2; });
        if (holdProp >= 0) { heldPos(0, _c); ctx.prop(holdProp, doors[0], over() ? 2.4 : 0.9 + Math.abs(Math.sin(sc.t * 9)) * 0.1, doors[2] + (over() ? 0.4 : 1.0), { ry: over() ? PI : 0.3, line: 'saloon', ph: sc.t * 3 }); }
        if (mabel) { mabel.clip = over() ? CLIP.cheer : CLIP.carry; mabel.speed = 2; }
        return true;
      }
      if (flight) {
        const u = (sc.t - flight.t0) / flight.dur;
        const k = Math.min(1, u);
        bodies.forEach((b, i) => {
          const p = arc(flight, k - i * 0.06);
          b.x = p[0] + (i - 0.5) * 0.4 * (over() ? 1 : 0); b.y = p[1] + (over() ? (holdProp === PV.table ? 0.75 : 0.2) : 0); b.z = p[2];
          face(b, flight.to[0] + 0.001, flight.to[2] + 1);
          if (!over() && landAt < 0) { b.pitch = -1.2 - k * PI * 2; b.clip = CLIP.flail; }
          hatPhysics(b, dt);
        });
        if (holdProp >= 0 && landAt < 0) { const p = arc(flight, k); ctx.prop(holdProp, p[0], p[1] - 0.4, p[2], { ry: PI + k * 2, rx: over() ? 0 : k * 6, line: 'saloon', ph: sc.t * 3 }); }
        if (u >= 1 && landAt < 0) land();
        if (landAt >= 0) return afterLand(dt);
      }
      return true;
    };
    function land() {
      landAt = sc.t;
      const to = flight.to, tg = flight.target;
      if (mabel) mabel.clip = CLIP.idle;
      if (tg === 'trough') { parts.splash(to, 16, 'saloon'); for (const b of bodies) { b.pitch = -0.3; b.y = 0.3; b.clip = CLIP.sit; } }
      else if (tg === 'haycart') { parts.puff(to, 10, { col: PCOL.GOLD, r: 0.8, line: 'saloon' }); for (const b of bodies) { b.pitch = -0.9; b.y = 0.55; } }
      else if (tg === 'jail') { wagonRock = 0.25; parts.stars([to[0], to[1] + 1, to[2]], 5, { line: 'saloon' }); for (const b of bodies) b.hidden = true; }
      else if (tg === 'pomfrey') { parts.shards([to[0], to[1] + 0.4, to[2]], 14, 'saloon'); parts.puff(to, 4, { line: 'saloon' }); for (const b of bodies) b.hidden = true; }
      else { parts.puff([to[0], 0, to[2]], 8, { line: 'saloon' }); for (const b of bodies) { b.pitch = 0; b.y = 0.15; b.clip = CLIP.dizzy; parts.stars([b.x, 1.6, b.z], 4, { line: 'saloon', follow: () => ctx.head(b, _h), life: 1.8 }); } }
      if (holdProp === PV.goat || holdProp === PV.piano || holdProp === PV.table) parts.puff([to[0], 0, to[2]], 10, { r: 1.2, line: 'saloon' });
    }
    function afterLand(dt) {
      const s = sc.t - landAt;
      if (holdProp >= 0 && flight.target !== 'jail' && flight.target !== 'pomfrey') ctx.prop(holdProp, flight.to[0], 0, flight.to[2], { ry: PI + 0.6, rz: holdProp === PV.goat ? 0 : 0.15, line: 'saloon', ph: sc.t * 3 });
      for (const b of bodies) {
        hatPhysics(b, dt, true);
        if (s > 1.4 && !b.hidden) { if (b.hat.off?.rest) { b.hat.off = null; } b.pitch *= 0.9; b.y = Math.max(0, b.y - dt); walkTo(b, b.x + 6, ROAD + 1.5, 1.6, dt); }
      }
      return s < 3.2;
    }
    return sc;
  };

  // ======================================================= BAR BRAWL (special, W9: also plays in the Saloon card)
  S.brawl = (args) => {
    if (!world.plots.has('saloon')) return null;
    const ev = args.event;
    const sc = { prio: 3, slot: true, line: 'saloon', eventId: ev?.id, phase: 'live', cosmetic: !!args.cosmetic };
    const max = ev?.game?.max || 7, doors = ctx.anchor('saloon', 'doors');
    const flying = [];
    let launched = 0, nextAt = 0.9, nextCloud = 0, ending = false, mabel = null;
    sc.begin = () => {
      if (ctx.heroVisible) ctx.cutIn('saloon', 14);
      mabel = ctx.actor(sc, { char: 'mabel', x: doors[0] + 1.6, z: doors[2] + 0.6, clip: CLIP.punch, speed: 9 });
    };
    function launch() {
      const kind = launched % 3;
      const from = kind === 0 ? [doors[0], 1.0, doors[2] + 0.3] : [doors[0] + (kind === 1 ? -3 : 3), 2.6, doors[2] - 0.1];
      const b = ctx.actor(sc, { ...(launched % 2 ? townsfolk(60 + launched) : { char: pickOf(['drunk', 'cowboy', 'cardsharp']) }), x: from[0], y: from[1], z: from[2], clip: CLIP.flail });
      if (!b) return false;
      if (kind) parts.shards(from, 8, 'saloon');
      parts.puff(from, 5, { line: 'saloon' });
      const to = [from[0] + (R() - 0.5) * 9, 0.15, ROAD + (R() - 0.3) * 5];
      flying.push({ b, f: { from, to, apex: 2.2 + R() * 1.4, t0: sc.t, dur: 1.5 + R() * 0.3 }, landed: -1, hit: false, spin: (R() < 0.5 ? -1 : 1) * (1.5 + R()) });
      launched++;
      return true;
    }
    sc.update = (dt) => {
      if (!ending && sc.t >= nextCloud) { nextCloud = sc.t + 0.3; parts.cloud([doors[0], 0.2, doors[2] + 0.6], 3, 0.9, 'saloon', 1.0); }
      if (!ending && launched < max && sc.t >= nextAt) nextAt = sc.t + (launch() ? 1.15 + R() * 0.5 : 0.3);
      if (mabel) { mabel.clip = CLIP.punch; mabel.speed = 7; }
      for (let i = flying.length - 1; i >= 0; i--) {
        const o = flying[i], b = o.b;
        const u = (sc.t - o.f.t0) / o.f.dur;
        if (o.landed < 0) {
          const p = arc(o.f, u);
          b.x = p[0]; b.y = p[1]; b.z = p[2];
          b.pitch = -1.1 - u * PI * 2 * o.spin; face(b, o.f.to[0], o.f.to[2] + 3);
          if (u >= 1) { o.landed = sc.t; b.pitch = -PI / 2; b.y = 0.2; b.prone = true; b.clip = CLIP.sprawl; parts.puff([b.x, 0, b.z], 7, { line: 'saloon' }); }
        } else {
          const s = sc.t - o.landed;
          if (s > 1.0) { b.pitch *= 0.85; b.prone = false; b.y = Math.max(0, b.y - dt); if (walkTo(b, doors[0], doors[2] + 0.5, 1.9, dt) || s > 5) { ctx.release(b); flying.splice(i, 1); } }
        }
        hatPhysics(b, dt);
      }
      if ((launched >= max || ending) && !flying.length && sc.t > 2) return false;
      return sc.t < 26;
    };
    sc.pick = (ray, _c2, line) => {
      if (sc.cosmetic || (line && line !== 'saloon')) return null;
      const hits = [];
      for (const o of flying) {
        if (o.hit || (o.landed >= 0 && sc.t - o.landed > 0.5)) continue;
        ctx.centre(o.b, _c);
        const d = ctx.nearRay(ray, _c, 1.5);
        if (d >= 0) hits.push({ rank: 1, kind: 'minigame', game: 'brawl', id: ev?.id, lineId: 'saloon', act: 'brawl:hit', payload: { id: ev?.id }, ref: o, dist: d });
      }
      return hits;
    };
    sc.on = (k, e, _c3, pk) => {
      if (k === 'end') { ending = true; return; }
      if (k !== 'brawl:hit' || e.event?.id !== ev?.id) return;
      const o = pk?.ref && flying.includes(pk.ref) ? pk.ref : flying.find((x) => !x.hit && x.landed < 0);
      if (!o) return;
      o.hit = true;
      ctx.centre(o.b, _c);
      parts.stars(_c, 6, { line: 'saloon', burst: 4 });
      ctx.fx?.burst?.(_c, 4);
      popHat(o.b, (R() - 0.5) * 3, 5, 1);
      o.f = { from: _c.slice(), to: [_c[0] + (R() - 0.5) * 6, 0.15, Math.min(SOUTH, _c[2] + 3)], apex: 2.4, t0: sc.t, dur: 1.1 };
      o.landed = -1; o.spin *= 2.2;
    };
    return sc;
  };

  // ======================================================= LEONE DUEL (W8) — real (minigame) or ambient (no reward)
  S.duel = (args) => {
    const ev = args.event, amb = !!args.ambient;
    const sc = { prio: amb ? 1 : 3, slot: true, eventId: ev?.id, ambient: amb, phase: 'intro', cosmetic: amb || !!args.cosmetic };
    const L = ctx.heroLook();
    const cx = L[0], z = ROAD + 0.6;
    let you = null, opp = null, mort = null, intr = null, result = null, resultAt = 0, tDraw = 0, last = 'intro';
    const I = { kind: null, a: null, t0: 0 };
    const oppId = args.opponent || pickOf(OPPONENTS);
    sc.begin = () => {
      you = ctx.actor(sc, amb ? { ...townsfolk(7 + Math.floor(R() * 20)), x: cx - 0.4, z, h: -PI / 2 } : strangerSpec({ x: cx - 0.4, z, h: -PI / 2 }));
      opp = ctx.actor(sc, { char: oppId, x: cx + 0.4, z, h: PI / 2 });
      if (!you || !opp) return;
      tDraw = (amb ? 5.4 : 8.0) + R() * 1.8;
      if (!amb && R() < 0.6) { I.kind = pickOf(['horse', 'pickles', 'fly']); tDraw += 2.0; }
      if (!amb) { sc.shotOn = true; ctx.shot(shot); }
    };
    const eye = (a, out) => ctx.local(a, 0, 1.0, 0.22, out);
    function shot(pose, dt) {
      if (!you || !opp) return false;
      const ph = sc.phase;
      if (ph !== last) { if (ph === 'ecu' || last === 'ecu') pose.snap = true; last = ph; }
      const k = 1 - Math.exp(-dt * 4);
      const set = (px, py, pz, lx, ly, lz, fov, hard) => {
        if (hard || pose.snap) { pose.pos.set(px, py, pz); pose.look.set(lx, ly, lz); pose.fov = fov; return; }
        pose.pos.x += (px - pose.pos.x) * k; pose.pos.y += (py - pose.pos.y) * k; pose.pos.z += (pz - pose.pos.z) * k;
        pose.look.x += (lx - pose.look.x) * k; pose.look.y += (ly - pose.look.y) * k; pose.look.z += (lz - pose.look.z) * k;
        pose.fov += (fov - pose.fov) * k;
      };
      const hr = you.hat.type >= 0 ? you.hat.scale * 0.55 : 0.3;
      if (ph === 'intro' || ph === 'paces') set(cx - 15 - hr, 7.5, z + 3.2, cx, 1.0, z, 34);
      else if (ph === 'ecu') { eye(opp, _c); set(_c[0] - 2.4, _c[1] + 0.05, _c[2] + 0.05, _c[0], _c[1] + 0.05, _c[2], 15, true); }
      else if (ph === 'result' && sc.t - resultAt > 1.6) set(opp.x - 6, 2.8, z + 3.2, opp.x - 0.5, 0.6, z, 34);
      else { eye(opp, _c); set(you.x - 2.2 - hr * 0.6, 1.25, z + 1.1 + hr * 0.6, _c[0], _c[1] - 0.5, _c[2], ph === 'draw' ? 32 : 28); }
      return true;
    }
    sc.update = (dt) => {
      if (!you || !opp) return false;
      const t = sc.t;
      if (result == null) {
        if (t < 1) sc.phase = 'intro';
        else if (t < 4) {
          sc.phase = 'paces';
          const u = (t - 1) / 3, step = Math.floor(u * 10);
          you.x = cx - 0.4 - u * 6; opp.x = cx + 0.4 + u * 6;
          you.clip = opp.clip = CLIP.walk; you.speed = opp.speed = 6;
          if (step !== sc.step) { sc.step = step; parts.puff([you.x, 0, z], 1, { r: 0.1, size: 0.18 }); parts.puff([opp.x, 0, z], 1, { r: 0.1, size: 0.18 }); }
        } else {
          if (t < 4.4) { you.h = PI / 2 * ((t - 4) / 0.4) * 2 - PI / 2; opp.h = PI / 2 - PI * ((t - 4) / 0.4); }
          else { you.h = PI / 2; opp.h = -PI / 2; }
          you.clip = opp.clip = sc.phase === 'draw' ? CLIP.draw : CLIP.duel;
          sc.phase = !amb && t > 5.5 && t < 6.9 ? 'ecu' : t >= tDraw ? 'draw' : 'standoff';
          if (t > 4.6 && t < 8) { const u = (t - 4.6) / 3.4; ctx.prop(PV.tumbleweed, cx, 0.45 + Math.abs(Math.sin(t * 5)) * 0.4, z - 5 + u * 11, { rx: t * 6, s: 0.8 }); }
          if (I.kind && t > 7.1 && t < tDraw - 0.3) interruption(dt, t);
        }
        if (sc.phase === 'draw' && !sc.drew) {
          sc.drew = true;
          if (!amb) { ctx.markDraw(sc); ctx.emit('duel:draw', { id: ev?.id }); }
        }
        if (sc.phase === 'draw') {
          const d = t - tDraw;
          gunUp(opp, Math.min(1, d / (amb ? 0.35 : 0.7)));
          if (amb) gunUp(you, Math.min(1, d / 0.3));
          if (amb && d > 0.4) settle(R() < 0.5 ? 'gold' : 'oppwins');
          if (!amb && sc.drawAt && performance.now() - sc.drawAt > 2600 && !sc.timedOut) {
            sc.timedOut = true;
            const r = ctx.act(sc, 'duel:result', { id: ev?.id, ms: Math.round(performance.now() - sc.drawAt) });
            if (!r?.ok) settle('basic');
          }
        }
      } else outcome(dt, t - resultAt);
      hatPhysics(you, dt); hatPhysics(opp, dt, true);
      return result == null ? t < 30 : t - resultAt < (mort ? 6.2 : 3.6);
    };
    function gunUp(a, k) {
      ctx.local(a, 0.28, 0.55 + 0.25 * k, 0.15 + 0.3 * k, _c);
      ctx.prop(PV.gun, _c[0], _c[1], _c[2], { ry: a.h, rx: -k * 1.4 + 0.6, s: 1.6 });
    }
    function interruption(dt, t) {
      if (!I.t0) I.t0 = t;
      const u = (t - I.t0) / Math.max(0.5, tDraw - 0.3 - I.t0);
      if (I.kind === 'horse') ctx.prop(PV.horse, cx + 0.5, Math.abs(Math.sin(t * 4)) * 0.05, z - 7 + u * 14, { ry: 0, s: 0.95 });
      else if (I.kind === 'pickles') {
        I.a ||= ctx.actor(sc, { char: 'pickles', x: cx, z: z - 6, clip: CLIP.stagger, speed: 4 });
        if (I.a) { I.a.z = z - 6 + u * 12; I.a.x = cx + Math.sin(t * 2.2) * 0.8; I.a.h = Math.sin(t * 2.2) * 0.6; I.a.roll = Math.sin(t * 3.1) * 0.15; }
      } else {
        eye(opp, _c);
        const land = u > 0.55;
        const fx = land ? _c[0] - 0.2 : _c[0] + Math.cos(t * 9) * 0.6, fy = land ? _c[1] - 0.05 : _c[1] + Math.sin(t * 13) * 0.3, fz = land ? _c[2] : _c[2] + Math.sin(t * 9) * 0.6;
        ctx.prop(PV.fly, fx, fy, fz, { ph: t * 40, s: 2.2, ry: t * 3 });
        if (land) opp.roll = Math.sin(t * 20) * 0.04;
      }
    }
    function settle(r) {
      if (result) return;
      result = r; resultAt = sc.t; sc.phase = 'result';
      ctx.emit('duel:phase', { id: ev?.id, phase: 'result', result: r });
      if (r === 'early') {
        ctx.local(you, 0.2, 0.05, 0.25, _c);
        parts.flash(_c, 0.7); parts.smoke(_c, 4);
      } else {
        const shooter = r === 'oppwins' ? opp : you, target = r === 'oppwins' ? you : opp;
        ctx.local(shooter, 0.28, 0.8, 0.5, _c); parts.flash(_c, 0.8); parts.smoke(_c, 4);
        if (r === 'basic') { ctx.local(opp, 0.28, 0.8, 0.5, _c); parts.flash(_c, 0.8); popHat(you, -2, 5, 0.5); }
        popHat(target, (target === opp ? 2 : -2), 4.5, 0.6);
      }
    }
    function outcome(dt, s) {
      if (result === 'early') {
        you.y = Math.abs(Math.sin(s * 9)) * 0.35 * Math.max(0, 1 - s / 2.5); you.clip = s < 1.2 ? CLIP.flail : CLIP.dizzy; you.roll = Math.sin(s * 9) * 0.2;
        if (!sc.starred) { sc.starred = true; parts.stars([you.x, 2.2, you.z], 5, { follow: () => ctx.head(you, _h), life: 2.4 }); }
        opp.clip = s < 1.6 ? CLIP.cheer : CLIP.sprawl; opp.speed = 9;
        if (s > 1.6) { opp.pitch = Math.max(-PI / 2, opp.pitch - dt * 3); opp.y = 0.15; opp.prone = true; }
      } else {
        const loser = result === 'oppwins' ? you : opp;
        if (s < 1.1) { loser.h += dt * 9; loser.roll = Math.sin(s * 8) * 0.25; loser.clip = CLIP.flail; }
        else { loser.clip = CLIP.sprawl; loser.roll *= 0.9; loser.pitch = Math.max(-PI / 2, loser.pitch - dt * 4); loser.y = 0.15; loser.prone = true; if (!sc.dust) { sc.dust = true; parts.puff([loser.x, 0, loser.z], 8); } }
        if (s > 1.4 && !mort && ctx.lineOpen('undertaker') !== undefined && !sc.noMort) {
          mort = ctx.actor(sc, { char: 'mortimer', x: loser.x + 9, z: loser.z + 1.2 });
          if (!mort) sc.noMort = true;
        }
        if (mort) {
          if (walkTo(mort, loser.x + 1.1, loser.z + 0.3, 3.2, dt)) {
            mort.clip = CLIP.work; mort.speed = 5; face(mort, loser.x, loser.z);
            ctx.local(mort, 0.2, 0.55, 0.45, _c);
            ctx.prop(PV.tape, (_c[0] + loser.x) / 2, 0.35, loser.z, { ry: PI / 2, sz: Math.max(0.2, Math.abs(_c[0] - loser.x) / 1.2) });
          }
        }
      }
    }
    sc.pick = () => {
      if (amb || sc.cosmetic || result || !you) return null;
      const ts = api.pickTime;
      const payload = sc.drawAt && ts >= sc.drawAt ? { id: ev?.id, ms: Math.max(0, Math.round(ts - sc.drawAt)) } : { id: ev?.id, early: true };
      return { rank: 1, kind: 'minigame', game: 'duel', id: ev?.id, act: 'duel:result', payload, dist: 0, phase: sc.phase };
    };
    sc.on = (k, e) => {
      if (k === 'duel:result') settle(e.early ? 'early' : e.tier || 'basic');
      else if (k === 'end') { if (!result) { if (e.expired) sc.t = 99; else settle(e.reward?.early ? 'early' : e.reward?.tier || 'basic'); } }
    };
    sc.end = () => { ctx.shot(null); };
    return sc;
  };

  // ======================================================= BANK ROBBERY CHASE (special)
  S.robbery = (args) => {
    const ev = args.event;
    const sc = { prio: 3, slot: true, eventId: ev?.id, line: null, cosmetic: !!args.cosmetic };
    const start = world.plots.has('bank') ? ctx.anchor('bank', 'doors') : ctx.heroLook();
    const x0 = start[0] + 2, signX = x0 - 44, speed = 6.2;
    const riders = [], bags = [];
    let bartFall = -1, nextBag = 0.8, ending = false, look = [x0, 1, ROAD];
    sc.begin = () => {
      ['bart', 'goon', 'goon'].forEach((c, i) => {
        const a = ctx.actor(sc, { char: c, x: x0 + i * 2.4, y: 1.25, z: ROAD + (i - 1) * 1.6, h: -PI / 2, clip: CLIP.sit });
        if (a) riders.push({ a, i, x: x0 + i * 2.4 + 6, z: ROAD + (i === 0 ? 0 : i === 1 ? -1.5 : 1.5), down: false });
      });
      sc.shotOn = true;
      ctx.shot((pose, dt) => { if (sc.t < 0.1) { pose.look.set(x0, 1.2, ROAD); pose.pos.set(x0 - 13, 5.5, ROAD + 3); } return shot(pose, dt); });
    };
    function shot(pose, dt) {
      const k = 1 - Math.exp(-dt * 2.5);
      pose.look.x += (look[0] + 1 - pose.look.x) * k; pose.look.y += (1.2 - pose.look.y) * k; pose.look.z += (ROAD - pose.look.z) * k;
      pose.pos.x += (look[0] - 13 - pose.pos.x) * k; pose.pos.y += (5.5 - pose.pos.y) * k; pose.pos.z += (ROAD + 3 - pose.pos.z) * k;
      pose.fov += (36 - pose.fov) * k;
      return true;
    }
    sc.update = (dt) => {
      const t = sc.t;
      for (const r of riders) {
        const a = r.a;
        if (r.down) continue;
        r.x -= speed * dt * (t < 1 ? t : 1);
        const gal = Math.abs(Math.sin(t * 11 + r.i));
        ctx.prop(PV.horse, r.x, gal * 0.25, r.z, { ry: -PI / 2, rz: Math.sin(t * 11 + r.i) * 0.06 });
        a.x = r.x; a.z = r.z; a.y = 1.2 + gal * 0.25; a.h = -PI / 2; a.clip = CLIP.sit;
        if (r.i === 0 && bartFall < 0 && r.x <= signX + 0.6) {
          bartFall = t; r.down = true;
          parts.stars([a.x, 2.6, a.z], 7, { burst: 3 });
          popHat(a, 2, 4, 0);
          r.fall = { from: [a.x, a.y, a.z], to: [a.x + 2.2, 0.15, a.z + 0.4], apex: 1.2, t0: t, dur: 0.9 };
        }
        if (r.i > 0 && bartFall >= 0) a.pitch = -0.5;
        if (!ending && t >= nextBag && r.i === riders.length - 1 - (Math.floor(t * 3) % riders.length) && bags.length < 24) {
          nextBag = t + 0.55 + R() * 0.3;
          bags.push({ x: a.x, y: 1.5, z: a.z + (R() - 0.5), vy: 1.5, vx: -2, rest: 0, t0: t, gone: false });
        }
      }
      const bart = riders.find((r) => r.i === 0);
      if (bart?.fall) {
        const s = (t - bart.fall.t0) / bart.fall.dur, a = bart.a;
        if (s < 1) { const p = arc(bart.fall, s); a.x = p[0]; a.y = p[1]; a.z = p[2]; a.pitch = s * PI * 1.6; a.clip = CLIP.flail; }
        else { a.clip = CLIP.sprawl; a.pitch = -PI / 2; a.y = 0.15; a.prone = true; if (!bart.puffed) { bart.puffed = true; parts.puff([a.x, 0, a.z], 9); } }
        if (s >= 1 && !bart.stars) { bart.stars = true; parts.stars([a.x, 1, a.z], 5, { follow: () => ctx.head(a, _h), life: 3 }); }
        ctx.prop(PV.horse, a.x - 6 - (t - bart.fall.t0) * speed, Math.abs(Math.sin(t * 11)) * 0.25, ROAD, { ry: -PI / 2 });
      }
      for (const r of riders) if (r.i === 0) look[0] = r.down ? r.a.x : r.x;
      ctx.prop(PV.plank, signX, 2.55, ROAD, { ry: 0, sz: 4.5 });
      ctx.prop(PV.sign, signX, 2.9, ROAD - 1.2, { s: 0.55, ry: PI / 2 });
      for (const b of bags) {
        if (b.gone) continue;
        if (!b.rest) { b.vy -= 12 * dt; b.x += b.vx * dt; b.y += b.vy * dt; if (b.y <= 0) { b.y = 0; b.rest = t; parts.puff([b.x, 0, b.z], 2, { r: 0.2, size: 0.25 }); } }
        if (b.rest && t - b.rest > 4) b.gone = true;
        ctx.prop(PV.bag, b.x, b.y, b.z, { ry: b.t0 * 7, s: 1.3 });
      }
      const done = bartFall >= 0 && t - bartFall > 3.4;
      return !(done || (ending && t > 4)) && t < 24;
    };
    sc.pick = (ray) => {
      if (sc.cosmetic) return null;
      const hits = [];
      for (const b of bags) {
        if (b.gone) continue;
        const d = ctx.nearRay(ray, [b.x, b.y + 0.35, b.z], 1.1);
        if (d >= 0) hits.push({ rank: 1, kind: 'minigame', game: 'robbery', id: ev?.id, act: 'robbery:hit', payload: { id: ev?.id }, ref: b, dist: d });
      }
      for (const r of riders) {
        ctx.centre(r.a, _c);
        const d = ctx.nearRay(ray, _c, 1.4);
        if (d >= 0) hits.push({ rank: 1, kind: 'minigame', game: 'robbery', id: ev?.id, act: 'robbery:hit', payload: { id: ev?.id }, ref: r, dist: d + 0.5 });
      }
      return hits;
    };
    sc.on = (k, e, _x, pk) => {
      if (k === 'end') { ending = true; return; }
      if (k !== 'robbery:hit') return;
      const ref = pk?.ref;
      if (ref && 'vy' in ref) { ref.gone = true; ctx.fx?.burst?.([ref.x, ref.y, ref.z], 5); parts.puff([ref.x, 0.2, ref.z], 3, { col: PCOL.GOLD, size: 0.25 }); }
      else if (ref?.a) { ctx.centre(ref.a, _c); parts.stars(_c, 4, { burst: 2.5 }); }
    };
    sc.end = () => ctx.shot(null);
    return sc;
  };

  // ======================================================= STAGECOACH ARRIVAL (special): tap a passenger to steer them
  S.stagecoach = (args) => {
    const ev = args.event;
    const sc = { prio: 3, slot: true, eventId: ev?.id, cosmetic: !!args.cosmetic };
    const L = ctx.heroLook(), stopX = L[0] + 1, z = ROAD + 0.4;
    let x = stopX + 40, leaveAt = -1, claimed = null;
    const pax = [];
    sc.update = (dt) => {
      const t = sc.t;
      if (leaveAt < 0) x = stopX + 40 * Math.pow(Math.max(0, 1 - t / 3.2), 2.2);
      else x -= Math.min(9, (t - leaveAt) * 6) * dt;
      const moving = leaveAt >= 0 ? 1 : Math.max(0, 1 - t / 3.2);
      const bob = Math.abs(Math.sin(t * 10)) * 0.08 * (moving > 0.02 ? 1 : 0);
      ctx.prop(PV.coach, x, bob, z, { ry: -PI / 2 });
      for (const k of [0, 1]) ctx.prop(PV.horse, x - 4.4, Math.abs(Math.sin(t * 10 + k)) * 0.2 * (moving > 0.02 ? 1 : 0), z + (k ? 0.75 : -0.75), { ry: -PI / 2 });
      if (moving > 0.05 && Math.floor(t * 8) % 2 === 0) parts.puff([x + 1.5, 0, z], 1, { r: 0.6, size: 0.3 });
      if (leaveAt < 0 && t > 3.4 && pax.length < 3 && t > 3.4 + pax.length * 0.6) {
        const a = ctx.actor(sc, { ...townsfolk(pax.length, true), x: x - 0.2, z: z - 1.0, h: PI });
        if (a) pax.push({ a, spot: [stopX - 2 + pax.length * 2, NORTH + 1.3] });
        else pax.push(null);
      }
      for (const p of pax) {
        if (!p) continue;
        const a = p.a;
        if (claimed && p === claimed.p) { if (walkTo(a, claimed.to[0], claimed.to[2] + 0.5, 1.6, dt)) a.hidden = true; }
        else if (walkTo(a, p.spot[0], p.spot[1], 1.4, dt)) { a.clip = claimed ? CLIP.cheer : CLIP.idle; face(a, a.x, a.z + 5); }
      }
      if (leaveAt < 0 && (claimed || t > 26)) leaveAt = t + (claimed ? 1.5 : 0);
      return leaveAt < 0 || t - leaveAt < 5;
    };
    sc.pick = (ray) => {
      if (sc.cosmetic || claimed) return null;
      const hits = [];
      for (const p of pax) {
        if (!p) continue;
        ctx.centre(p.a, _c);
        const d = ctx.nearRay(ray, [_c[0], _c[1] + 0.4, _c[2]], 1.4);
        const cur = world.heroRig.current, lineId = cur && cur !== 'hub' && ctx.lineOpen(cur) ? cur : undefined;
        if (d >= 0) hits.push({ rank: 1, kind: 'minigame', game: 'stagecoach', id: ev?.id, act: 'claimEvent', payload: { eventId: ev?.id, lineId }, ref: p, dist: d });
      }
      return hits;
    };
    sc.on = (k, e, _x, pk) => {
      if (k === 'end' && !claimed) { leaveAt = leaveAt < 0 ? sc.t : leaveAt; return; }
      if (k !== 'event:claim' || e.event?.id !== ev?.id) return;
      const p = pk?.ref && pax.includes(pk.ref) ? pk.ref : pax.find(Boolean);
      const lid = e.reward?.lineId;
      if (p) claimed = { p, to: lid && world.plots.has(lid) ? ctx.anchor(lid, 'doors') : [p.a.x + 8, 0, NORTH] };
      if (p) { ctx.head(p.a, _h); parts.stars(_h, 5, { burst: 2 }); }
    };
    return sc;
  };

  // ======================================================= OPENING (W15): thrown out face-first, derby upturned
  S.opening = () => {
    const hub = world.plots.has('hub') ? 'hub' : [...world.plots.keys()][0];
    if (!hub) return null;
    const sc = { prio: 2, line: hub };
    const hp = world.plots.get(hub).group.position;
    const land = ctx.hasAnchor(hub, 'mud') ? ctx.anchor(hub, 'mud') : [hp.x - 1.5, 0, hp.z - 1.2];
    const sd = world.plots.has('saloon') ? ctx.anchor('saloon', 'doors') : null;
    const from = ctx.hasAnchor(hub, 'doors') ? ctx.anchor(hub, 'doors') : sd ? [sd[0], 1.2, sd[2] + 0.4] : [land[0] - 6, 2.2, land[2] - 3.5];
    if (sd && !ctx.hasAnchor(hub, 'mud')) land[0] = sd[0] + 0.4;
    const fresh = (ctx.game.state.stats?.bootTaps || 0) === 0;
    let a = null, phase = fresh ? 'fly' : 'lie', getUp = -1, slideEnd = [land[0] + 1.3, 0.2, land[2] + 0.2];
    sc.begin = () => {
      a = ctx.actor(sc, { char: 'stranger', hat: ['derby', 1, 'brown'], x: fresh ? from[0] : slideEnd[0], y: fresh ? from[1] : 0.2, z: fresh ? from[2] : slideEnd[2], clip: CLIP.sit });
      if (!a) return;
      face(a, land[0], land[2]);
      if (!fresh) { lie(); a.hat.off = { x: slideEnd[0] + 0.9, y: 0.3, z: slideEnd[2] + 0.6, rx: PI, ry: 0.4, rz: 0, rest: true }; }
      else parts.puff(from, 6);
    };
    function lie() { a.pitch = PI / 2; a.y = 0.22; a.clip = CLIP.flail; a.speed = 0.6; a.prone = true; a.x = slideEnd[0]; a.z = slideEnd[2]; }
    sc.anchor = (id) => {
      if (!a) return null;
      if (id === 'hat' && a.hat.off) return [a.hat.off.x, a.hat.off.y + 0.3, a.hat.off.z];
      return null;
    };
    sc.update = (dt) => {
      if (!a) return sc.t < 1;
      const t = sc.t;
      if (phase === 'fly') {
        const u = Math.min(1, t / 1.3), k = u < 0.5 ? u * 0.6 : 0.3 + (u - 0.5) * 1.4;
        const p = arc({ from, to: land, apex: 1.6 }, k);
        a.x = p[0]; a.y = p[1]; a.z = p[2]; a.pitch = -0.6 + k * 2.1; a.clip = CLIP.flail;
        if (t > 0.25 && !a.hat.off) popHat(a, (slideEnd[0] + 0.5 - from[0]) / 1.4, 2.6, (slideEnd[2] + 1.1 - from[2]) / 1.4);
        if (k >= 1) { phase = 'slide'; sc.slide0 = t; parts.puff(land, 9, { r: 0.9 }); }
      } else if (phase === 'slide') {
        const s = Math.min(1, (t - sc.slide0) / 0.7);
        a.x = land[0] + (slideEnd[0] - land[0]) * ease(s); a.z = land[2] + (slideEnd[2] - land[2]) * ease(s); a.y = 0.22; a.pitch = 1.45; a.prone = true;
        if (Math.floor(t * 12) % 2) parts.puff([a.x, 0, a.z], 1, { r: 0.2, size: 0.3 });
        if (s >= 1) { phase = 'lie'; a.hat.off = { x: slideEnd[0] + 0.5, y: 0.3, z: slideEnd[2] + 1.1, rx: PI, ry: 0.4, rz: 0, rest: true }; parts.puff([slideEnd[0] + 0.5, 0, slideEnd[2] + 1.1], 3, { r: 0.3, size: 0.25 }); }
      } else if (phase === 'lie') {
        lie();
        a.roll = Math.sin(t * 0.7) * 0.03;
        if (ctx.game.state.bootstrap?.done) { phase = 'up'; getUp = t; }
      } else {
        const s = t - getUp;
        a.pitch = Math.max(0, 1.45 - s * 2.4); a.y = Math.max(0, 0.22 - s * 0.3); a.prone = a.pitch > 0.6;
        if (s > 0.7 && a.hat.off) {
          if (walkTo(a, a.hat.off.x - 0.3, a.hat.off.z, 1.4, dt)) { a.hat.off = null; setHat(a, hatDef(ctx.game.state.hat || 0)); parts.puff([a.x, 0, a.z], 3); }
        } else if (s > 0.7 && walkTo(a, a.x + 0.01 + 1.6 * dt * 10, ROAD - 1.5, 1.6, dt) === false && s > 5) return false;
        if (s > 6) return false;
      }
      hatPhysics(a, dt, true);
      return true;
    };
    sc.on = (k) => {
      if (k !== 'mud' || !a?.hat.off) return;
      const o = a.hat.off;
      ctx.fx?.burst?.([o.x, 0.05, o.z], 1);
      parts.puff([o.x, 0.1, o.z], 1, { r: 0.1, size: 0.15, col: PCOL.GOLD });
    };
    return sc;
  };

  function stage(lineFallback) {
    const hp = world.plots.get('hub');
    if (hp && (lineFallback === 'hub' || !world.plots.has(lineFallback))) return [hp.group.position.x, 0, hp.group.position.z];
    const id = world.plots.has(lineFallback) ? lineFallback : 'hub';
    const p = ctx.anchor(id, 'front') || ctx.heroLook();
    p[2] = Math.max(p[2], ROAD - 2.2);
    return p;
  }

  // ======================================================= HAT PROMOTION (W14): old hat tossed, new one drops on
  S.hat = (e) => {
    const sc = { prio: 2, slot: true };
    const tier = e.tier ?? ctx.game.state.hat;
    const at = stage('hub');
    let a = null, dropped = false;
    sc.begin = () => { a = ctx.actor(sc, strangerSpec({ x: at[0], z: at[2], h: 0.15, hat: hatDef(Math.max(0, tier - 1)) })); };
    sc.update = (dt) => {
      if (!a) return false;
      const t = sc.t;
      if (t > 0.9 && !sc.old && !dropped) {
        ctx.head(a, _h);
        sc.old = ctx.extra(sc, { bodyless: true, hat: hatDef(Math.max(0, tier - 1)), x: a.x, z: a.z });
        if (sc.old) { sc.old.s = a.s; sc.old.hat.off = { x: _h[0], y: _h[1] - 0.1, z: _h[2], rx: 0, ry: a.h, rz: 0, vx: -2.5, vy: 8, vz: 0.6, spin: 9, rest: false }; }
        a.hat.type = -1; a.clip = CLIP.cheer;
      }
      if (sc.old) hatPhysics(sc.old, dt);
      if (t > 1.3 && !dropped) {
        dropped = true;
        setHat(a, hatDef(tier));
        sc.newHat = { y: 6 };
      }
      if (sc.newHat) {
        const n = sc.newHat;
        n.y = Math.max(0, n.y - dt * 12);
        a.hat.lift = n.y;
        if (n.y === 0 && !n.landed) { n.landed = sc.t; ctx.head(a, _h); parts.puff([a.x, 0, a.z], 10, { r: 1.2 }); parts.stars(_h, 6, { burst: 2.5 }); ctx.fx?.sparkle?.(_h, 14, 1.5); }
        if (n.landed) { const s = sc.t - n.landed; a.hat.scale = hatDef(tier)[1] * (1 + Math.sin(Math.min(1, s * 3) * PI * 2) * 0.15 * Math.max(0, 1 - s * 2)); }
      }
      a.clip = t > 2.4 ? CLIP.tiphat : t > 1.6 ? CLIP.cheer : a.clip;
      return t < 3.4;
    };
    return sc;
  };

  // ======================================================= DEED SHOWDOWN (W3): Pomfrey's sign comes down
  S.deed = () => {
    const sc = { prio: 2, slot: true };
    const at = stage('hub');
    let you = null, pom = null, sign = { y: 3.6, rz: 0, vy: 0, fallen: false };
    sc.begin = () => {
      you = ctx.actor(sc, strangerSpec({ x: at[0] - 2.2, z: at[2] + 0.4, h: PI / 2 }));
      pom = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(POMFREY_HATS[(ctx.game.state.pomfrey ?? 1)]), x: at[0] + 2.2, z: at[2] + 0.4, h: -PI / 2 });
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (t > 1.0 && !sign.fallen) { sign.rz = Math.min(1.3, sign.rz + dt * 3); if (sign.rz >= 1.3) { sign.vy -= 14 * dt; sign.y += sign.vy * dt; } if (sign.y <= 0.05) { sign.y = 0.05; sign.fallen = true; parts.puff([at[0], 0, at[2] - 1.2], 12, { r: 1.6 }); parts.stars([at[0], 0.6, at[2] - 1.2], 4); } }
      ctx.prop(PV.sign, at[0] + Math.sin(sign.rz) * 1.2, sign.y, at[2] - 1.2, { rz: sign.rz, rx: sign.fallen ? -1.45 : 0 });
      if (you) you.clip = t > 1.9 ? CLIP.cheer : CLIP.duel;
      if (pom) { pom.clip = t > 1.9 ? CLIP.punch : CLIP.duel; pom.speed = 9; }
      return t < 3.4;
    };
    return sc;
  };

  // ======================================================= FAKE YOUR DEATH (W2): procession, coffin on the coach, new face
  S.prestige = () => {
    const sc = { prio: 2, slot: true };
    const at = stage('hub');
    const z = ROAD - 0.5, x0 = at[0] - 9, coachX = at[0] + 6;
    const who = [];
    let stranger = null, coachGo = -1, coffinOn = false;
    sc.begin = () => {
      for (const [c, dx, dz] of [['mortimer', 0, 0], ['mulligan', -1.6, -0.7], ['mulligan', -1.6, 0.7], ['mabel', -3.6, 0], ['pickles', -5, 0.4]]) {
        const a = ctx.actor(sc, { char: c, x: x0 + dx, z: z + dz, h: PI / 2 });
        who.push(a ? { a, dx, dz } : null);
      }
    };
    sc.update = (dt) => {
      const t = sc.t;
      const walkX = x0 + Math.min(t, 4.2) * 1.9;
      for (const w of who) {
        if (!w) continue;
        const a = w.a;
        if (t < 4.2) { a.x = walkX + w.dx; a.z = z + w.dz; a.clip = CLIP.walk; a.speed = 4; a.h = PI / 2; }
        else a.clip = a.char === 'mabel' ? CLIP.sip : CLIP.idle;
        if (a.char === 'mabel' && Math.floor(t * 3) % 2 === 0 && Math.floor((t - dt) * 3) % 2 === 1) { ctx.head(a, _h); parts.splash([_h[0], _h[1] - 0.4, _h[2]], 3); }
        if (a.char === 'mulligan' && t < 4.2) a.clip = CLIP.carry;
      }
      let cx = walkX - 1.6, cy = 1.15, cz = z;
      if (t > 4.2) { const u = Math.min(1, (t - 4.2) / 0.8); cx = walkX - 1.6 + (coachX - walkX + 1.6) * u; cy = 1.15 + u * 1.5; coffinOn = u >= 1; }
      if (t > 5.1 && coachGo < 0) coachGo = t;
      const cmx = coachGo < 0 ? coachX : coachX + Math.pow(t - coachGo, 2) * 3;
      if (coffinOn) { cx = cmx; cy = 2.65; }
      ctx.prop(PV.coach, cmx, 0, z + 0.2, { ry: PI / 2 });
      for (const k of [0, 1]) ctx.prop(PV.horse, cmx + 4.4, coachGo < 0 ? 0 : Math.abs(Math.sin(t * 10 + k)) * 0.2, z + 0.2 + (k ? 0.75 : -0.75), { ry: PI / 2 });
      if (coachGo >= 0 && Math.floor(t * 8) % 2 === 0) parts.puff([cmx - 1.5, 0, z], 1, { r: 0.6, size: 0.3 });
      ctx.prop(PV.coffin, cx, cy, cz, { ry: PI / 2 });
      if (t > 6.6 && !stranger) {
        for (const w of who) if (w && w.a.char === 'mulligan') ctx.release(w.a);
        const gen = ctx.game.state.gen || 1;
        stranger = ctx.actor(sc, { ...strangerSpec(), dress: null, look: { k: 'stranger' + gen, top: ['#5e8f8c', '#8fa27a', '#d9a441', '#6f8fd8'][gen % 4], bot: '#4a5878', skin: (gen * 2) % 6, hair: (gen * 3) % 10, style: gen % 5, acc: -1 }, x: coachX, z: z + 1.4, h: 0 });
        if (stranger) parts.puff([coachX, 0, z + 1.4], 10, { r: 1 });
      }
      return t < 8.6;
    };
    return sc;
  };

  // ======================================================= CONSTRUCTION FLOURISH (no actors: the cut is cameras' beat)
  S.buildFx = (e, kind) => {
    if (!e?.lineId || !world.plots.has(e.lineId)) return;
    const f = ctx.anchor(e.lineId, 'front');
    const L = e.lineId;
    if (kind === 'start') parts.puff([f[0], 0, f[2] - 2], 6, { r: 2, line: L });
    else if (kind === 'done') { parts.puff([f[0], 0, f[2] - 2.5], 18, { r: 4, line: L, size: 0.6 }); parts.stars([f[0], 4, f[2] - 2.5], 6, { line: L, burst: 4 }); }
    else if (e.stage === 1) { parts.puff([f[0], 0, f[2] - 2.5], 12, { r: 3, line: L }); parts.stars([f[0] - 1, 3.4, f[2] - 2.5], 5, { line: L, burst: 2 }); }
    else if (e.stage === 4) { parts.stars([f[0], 5.5, f[2] - 2], 8, { line: L, burst: 3 }); parts.puff([f[0], 0, f[2] - 2.5], 10, { r: 3, line: L }); ctx.fx?.sparkle?.([f[0], 4.5, f[2] - 2], 14, 3); }
    else parts.puff([f[0], 0, f[2] - 2.5], 6, { r: 2.5, line: L });
  };

  // ======================================================= AMBIENT GAGS (W4: readable at 40 px with the sound off)
  const recentGags = [];
  const GAGS = [
    { id: 'barrel', w: 3 }, { id: 'pickles', w: 3 }, { id: 'chickens', w: 3 }, { id: 'pomfrey', w: 2 },
    { id: 'vultures', w: 1.5, ok: () => ctx.lineOpen('undertaker') }, { id: 'garter', w: 2.5, ok: () => ctx.lineOpen('garter') && !ctx.game.state.sunday && garterInView() },
    { id: 'mortimer', w: 1.5, ok: () => ctx.lineOpen('undertaker') }, { id: 'duel', w: 1.2, ok: () => ctx.lineOpen('saloon') },
    { id: 'horse', w: 1.2 }, { id: 'eject', w: 2, ok: () => !ctx.lineOpen('saloon') && world.plots.has('saloon') && ctx.inHero(ctx.anchor('saloon', 'doors'), 0.8) },
    { id: 'tumbleweed', w: 1 },
  ];
  function garterInView() { const p = world.plots.has('garter') && ctx.anchor('garter', 'window'); return !!p && ctx.inHero(p, 0.85); }
  S.pickGag = (force) => {
    const pool = GAGS.filter((g) => (force ? g.id === force : !recentGags.includes(g.id) && (!g.ok || g.ok())));
    if (!pool.length) return null;
    let r = R() * pool.reduce((s, g) => s + g.w, 0), g = pool[0];
    for (const x of pool) if ((r -= x.w) <= 0) { g = x; break; }
    recentGags.push(g.id);
    if (recentGags.length > 3) recentGags.shift();
    if (g.id === 'duel') return api.play('duel', { ambient: true });
    if (g.id === 'eject') return api.play('eject', { id: 'amb', kind: 'drunk', level: 1, autoAfter: 1.0 });
    return api.play('gag', { which: g.id });
  };

  // A path across the current hero frame along the street at depth z.
  function crossing(z, span = 9) {
    const L = ctx.heroLook();
    let a = L[0] - span, b = L[0] + span;
    for (let i = 0; i < 6 && !ctx.inHero([a, 1, z], 0.95); i++) a += span * 0.15;
    for (let i = 0; i < 6 && !ctx.inHero([b, 1, z], 0.95); i++) b -= span * 0.15;
    return R() < 0.5 ? [a - 2, b + 2] : [b + 2, a - 2];
  }

  S.gag = (args) => {
    const which = args.which;
    const sc = { prio: 0, kind: 'gag', which, cosmetic: true };
    const L = ctx.heroLook();
    const G = {
      barrel() {
        const [a, b] = crossing(ROAD + 0.8);
        return () => {
          const u = sc.t / 7, x = a + (b - a) * Math.min(1, u), step = Math.sin(sc.t * 10);
          ctx.prop(PV.legs, x, Math.max(0, step) * 0.05, ROAD + 0.8, { ry: b > a ? PI / 2 : -PI / 2, sx: 1 + step * 0.15 });
          ctx.prop(PV.barrel, x, 0.3 + Math.abs(step) * 0.08, ROAD + 0.8, { rz: step * 0.12, ry: sc.t });
          return u < 1;
        };
      },
      pickles() {
        const spots = [[L[0] - 4, NORTH + 0.6], [L[0] + 4.5, NORTH + 0.4], [L[0] + 2, ROAD - 2.6]];
        const sp = spots.find((s) => ctx.inHero([s[0], 0.5, s[1]], 0.8)) || spots[2];
        const a = ctx.actor(sc, { char: 'pickles', x: sp[0], y: 0.18, z: sp[1], h: 0.4, clip: CLIP.sprawl });
        if (!a) return null;
        a.pitch = -PI / 2; a.prone = true;
        return () => {
          if (Math.floor(sc.t * 1.2) !== Math.floor((sc.t - 0.05) * 1.2)) parts.puff([a.x, 0.9, a.z], 1, { r: 0.05, size: 0.12, up: 0.6, col: PCOL.SMOKE });
          a.roll = Math.sin(sc.t * 0.9) * 0.05;
          return sc.t < 11;
        };
      },
      chickens() {
        const [a, b] = crossing(ROAD + 1.6, 8);
        return () => {
          const t = sc.t, back = t > 3.2, u = back ? Math.min(1, (t - 3.2) / 2.8) : Math.min(1, t / 3.2);
          const x1 = back ? b + (a - b) * u : a + (b - a) * u, dir = back ? Math.sign(a - b) : Math.sign(b - a);
          const ry = dir > 0 ? PI / 2 : -PI / 2;
          const hop = (k) => Math.abs(Math.sin(t * 14 + k)) * 0.25;
          ctx.prop(PV.chicken, x1, hop(0), ROAD + 1.6, { ry, ph: t * 4, s: 1.6 });
          ctx.prop(PV.chicken, x1 - dir * 1.1, hop(1), ROAD + 1.7, { ry, ph: t * 4 + 1, s: 1.6 });
          if (Math.floor(t * 6) !== Math.floor((t - 0.02) * 6)) parts.puff([x1 - dir * 0.5, 0, ROAD + 1.6], 1, { r: 0.1, size: 0.18 });
          return t < 6;
        };
      },
      pomfrey() {
        const def = POMFREY_HATS[ctx.game.state.pomfrey ?? 7];
        const [a, b] = crossing(NORTH + 1.0, 10);
        const dir = Math.sign(b - a);
        const p = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(def), x: a, z: NORTH + 1.0, h: dir * PI / 2 });
        if (!p) return null;
        const bearers = [];
        if ((def?.scale || 1) >= 2) for (const s of [-1, 1]) { const e = ctx.extra(sc, { char: 'goon', x: a, z: NORTH + 1.0 + s * def.scale * 0.42, h: dir * PI / 2, clip: CLIP.cheer, speed: 2 }); if (e) bearers.push([e, s]); }
        ctx.say('pomfrey', 'pomfrey_pass');
        return () => {
          const x = a + dir * sc.t * 1.3;
          p.x = x; p.clip = CLIP.walk; p.speed = 3.5;
          for (const [e, s] of bearers) { e.x = x - dir * 0.2; e.z = NORTH + 1.0 + s * def.scale * 0.42; e.clip = CLIP.cheer; e.y = Math.abs(Math.sin(sc.t * 7 + s)) * 0.03; }
          return Math.abs(x - a) < Math.abs(b - a);
        };
      },
      vultures() {
        const c = world.plots.has('undertaker') && ctx.lineOpen('undertaker') ? ctx.anchor('undertaker', 'center') : L;
        return () => {
          for (let i = 0; i < 3; i++) {
            const ph = sc.t * 0.5 + i * 2.1;
            ctx.prop(PV.vulture, c[0] + Math.cos(ph) * 5, 9 + i * 0.8 + Math.sin(sc.t + i) * 0.3, c[2] + Math.sin(ph) * 5, { ry: -ph, rz: 0.35, ph: sc.t * 0.6 + i, s: 1.6 });
          }
          return sc.t < 13;
        };
      },
      garter() {
        const win = ctx.anchor('garter', 'window'), door = ctx.anchor('garter', 'doors');
        const cart = ctx.hasAnchor('garter', 'haycart') ? ctx.anchor('garter', 'haycart') : [win[0] + 0.4, 0, win[2] + 2.2];
        const man = ctx.actor(sc, { char: 'longjohns', x: win[0], y: win[1] - 0.6, z: win[2] + 0.3, h: 0, clip: CLIP.cheer });
        const wife = ctx.actor(sc, { char: 'wife', x: door[0] - 7, z: door[2] + 2.2, h: PI / 2 });
        if (!man) { if (wife) ctx.release(wife); return null; }
        ctx.say('lulu', 'garter_window');
        const f = { from: [win[0], win[1] - 0.6, win[2] + 0.3], to: [cart[0], 0.9, cart[2]], apex: 0.6, t0: 1.1, dur: 0.7 };
        return () => {
          const t = sc.t;
          if (!ctx.hasAnchor('garter', 'haycart')) ctx.prop(PV.haycart, cart[0], 0, cart[2], { ry: PI / 2 });
          if (t < 1.1) { man.y = win[1] - 0.6 - Math.max(0, t - 0.5) * 0.3; man.clip = CLIP.cheer; }
          else if (t < 1.8) { const p = arc(f, (t - 1.1) / 0.7); man.x = p[0]; man.y = p[1]; man.z = p[2]; man.pitch = -0.4; man.clip = CLIP.flail; }
          else if (!sc.landed) { sc.landed = true; parts.puff(f.to, 10, { col: PCOL.GOLD, r: 0.9 }); man.y = 0.75; man.pitch = -0.7; }
          else if (t > 3.2) { man.pitch *= 0.85; man.y = Math.max(0, man.y - 0.03); walkTo(man, man.x + 12, ROAD + 1, 3.5, 1 / 60); man.speed = 12; }
          if (wife) {
            if (!wife.hidden && walkTo(wife, door[0], door[2] + 0.3, 2.6, 1 / 60)) { wife.hidden = true; parts.puff(door, 4); }
            if (!wife.hidden) { ctx.local(wife, 0.3, 0.75, 0.3, _c); ctx.prop(PV.pin, _c[0], _c[1] + Math.abs(Math.sin(t * 9)) * 0.2, _c[2], { ry: wife.h + PI / 2, s: 1.4 }); wife.clip = CLIP.walk; wife.speed = 10; }
          }
          return t < 7;
        };
      },
      mortimer() {
        const [a, b] = crossing(NORTH + 1.2, 9);
        const dir = Math.sign(b - a), mid = (a + b) / 2;
        const pass = ctx.extra(sc, { ...townsfolk(Math.floor(R() * 30)), x: a, z: NORTH + 1.2, h: dir * PI / 2 });
        const m = ctx.actor(sc, { char: 'mortimer', x: b, z: NORTH + 1.2, h: -dir * PI / 2 });
        if (!pass || !m) { if (pass) ctx.release(pass); if (m) ctx.release(m); return null; }
        return () => {
          const t = sc.t;
          if (t < 3) { walkTo(pass, mid - dir * 0.6, NORTH + 1.2, 1.5, 1 / 60); walkTo(m, mid + dir * 0.6, NORTH + 1.2, 1.5, 1 / 60); }
          else if (t < 6.5) {
            pass.clip = CLIP.idle; face(pass, m.x, m.z); m.clip = CLIP.work; face(m, pass.x, pass.z);
            const top = ctx.head(pass, _h)[1];
            ctx.prop(PV.tape, pass.x + dir * 0.35, 0.05, pass.z + 0.35, { rx: -PI / 2, sz: top / 1.2 * Math.min(1, (t - 3) / 0.8) });
          } else { walkTo(pass, b + dir * 3, NORTH + 1.2, 1.8, 1 / 60); walkTo(m, a - dir * 3, NORTH + 1.2, 1.4, 1 / 60); }
          return t < 10;
        };
      },
      horse() {
        const cam = world.heroRig.camera.position;
        const x = L[0] + (R() < 0.5 ? -3 : 3), z = ROAD + 2.5;
        return () => {
          const want = Math.atan2(cam.x - x, cam.z - z);
          const ry = sc.t < 2 ? -PI / 2 + (want + PI / 2) * Math.min(1, sc.t / 2) * ease(Math.min(1, sc.t / 2)) : want;
          ctx.prop(PV.horse, x, 0, z, { ry, rz: Math.sin(sc.t * 0.8) * 0.01 });
          return sc.t < 9;
        };
      },
      tumbleweed() {
        const [a, b] = crossing(ROAD + 0.5, 10);
        return () => {
          const u = sc.t / 5, x = a + (b - a) * Math.min(1, u);
          ctx.prop(PV.tumbleweed, x, 0.5 + Math.abs(Math.sin(sc.t * 4)) * 0.6, ROAD + 0.5 + Math.sin(sc.t) * 0.5, { rx: sc.t * 5 * Math.sign(b - a), rz: sc.t * 2, s: 0.9 });
          return u < 1;
        };
      },
    };
    let step = null;
    sc.begin = () => { step = G[which]?.() || null; };
    sc.update = (dt) => (step ? step(dt) : false);
    return sc;
  };

  return S;
}
