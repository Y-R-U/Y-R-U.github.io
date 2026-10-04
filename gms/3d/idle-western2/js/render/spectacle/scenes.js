import { EJECT_LOOK, OPPONENTS, townsfolk, hatFor, pomfreyHat } from './looks.js?v=20261004g';
import { CLIP as RIG, CHARACTERS } from '../kit/crowd.js?v=20261004g';
import { PCOL } from './particles.js?v=20261004g';
import { HATS, POMFREY_HATS } from '../../data/hats.js?v=20261004g';
import { createVignettes } from './vignettes.js?v=20261004g';

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
  const HAT_TEN = hatFor(HATS[HATS.length - 1]).type;
  // The Stranger wears the current disguise's moustache (Fake Your Death swaps it), so he is a look, not a dress.
  const STACHE_OF = { handlebar: 'handlebar', walrus: 'walrus', pencil: 'pencil', horseshoe: 'walrus', chevron: 'walrus', 'mutton chops': 'chops', imperial: 'pencil', 'painted-on': 'pencil' };
  let wornStache = STACHE_OF[ctx.game.state.disguise?.moustache] ?? -1;
  function youLook(st) {
    const c = CHARACTERS.you || {};
    return { k: 'you:' + st, top: c.top, bot: c.bot, skin: c.skin, hair: c.hair, style: c.style, acc: c.acc, stache: st, head: c.head, legs: c.legs, girth: c.girth };
  }
  const strangerLook = (st) => ({ look: youLook(st), lookKey: 'l:you:' + st });
  function strangerSpec(extra = {}) {
    const { stache, ...rest } = extra;
    return { id: 'stranger', look: youLook(stache !== undefined ? stache : wornStache), s: 1.15, hat: hatDef(ctx.game.state.hat || 0), ...rest };
  }
  function setHat(a, h) { if (a) ctx.setHat(a, h); }
  // Spectacle camera: pos/look as offsets from a (possibly moving) world point; the director blends in and out.
  function frameAt(sc, at, o) {
    return ctx.takeShot(sc, (pose) => {
      const a = typeof at === 'function' ? at() : at;
      pose.pos.set(a[0] + o.p[0], a[1] + o.p[1], a[2] + o.p[2]);
      pose.look.set(a[0] + o.l[0], a[1] + o.l[1], a[2] + o.l[2]);
      pose.fov = o.fov || 50;
      return true;
    });
  }
  const ring = (a, r = 0.95, ph = 0, k = 1) => { if (!a || a.hidden) return; ctx.centre(a, _c); ctx.halo(_c[0], _c[1] + 0.15, _c[2], r, k, ph, 2, a.line); };

  // ---- fallback saloon set dressing (until lane P names the anchors on the plot)
  function saloonSet(dt) {
    if (!world.plots.has('saloon')) return;
    const L = 'saloon';
    if (!ctx.hasAnchor(L, 'trough')) { const p = ctx.anchor(L, 'trough'); ctx.prop(PV.trough, p[0], p[1], p[2], { line: L }); }
    if (!ctx.hasAnchor(L, 'haycart')) { const p = ctx.anchor(L, 'haycart'); ctx.prop(PV.haycart, p[0], p[1], p[2], { ry: PI / 2, line: L }); }
    if (!ctx.hasAnchor(L, 'jailWagon') && !ctx.hasAnchor(L, 'wagon')) { const p = ctx.anchor(L, 'wagon'); ctx.prop(PV.wagon, p[0], p[1], p[2], { ry: PI / 2 + 0.2, line: L, rz: wagonRock }); }
    if (!ctx.hasAnchor(L, 'pomfreyWindow') && ctx.hasAnchor(L, 'upstairs')) { const p = ctx.anchor(L, 'upstairs'); ctx.prop(PV.pomsign, p[0], p[1] + 0.95, p[2] + 0.12, { line: L }); }
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
  // Every landing spot is in the fling shot: trough ← left of the doors, Pete's chair → next door, Wendell's jail wagon ↓ in
  // the street, Pomfrey's room ↑ upstairs (his nameplate over the saloon's upper window).
  const TARGET_ANCHOR = { trough: ['saloon', 'trough', -0.2], dentist: ['dentist', 'chairLanding', 0], jail: ['saloon', 'jailWagon', 1.3], pomfrey: ['saloon', 'pomfreyWindow', 0], haycart: ['saloon', 'haycart', 0.9], street: ['saloon', 'street', 0] };
  const ALT = { jailWagon: 'wagon', pomfreyWindow: 'upstairs', chairLanding: 'chair' };
  function targetPos(id, out = [0, 0, 0]) {
    let [lid, name, dy] = TARGET_ANCHOR[id] || TARGET_ANCHOR.trough;
    if (world.plots.has(lid) && !ctx.hasAnchor(lid, name) && ALT[name] && (ctx.hasAnchor(lid, ALT[name]) || name === 'jailWagon')) name = ALT[name];
    const p = ctx.anchor(world.plots.has(lid) ? lid : 'saloon', world.plots.has(lid) ? name : 'doors', out);
    if (!p) return null;
    if (!world.plots.has(lid)) p[0] += 9;
    p[1] += dy;
    return p;
  }

  S.eject = (args) => {
    if (!world.plots.has('saloon')) return null;
    const sc = { prio: 2, line: 'saloon', ejectId: args.id, phase: 'hold', cosmetic: !!args.cosmetic, heroOnly: true };
    const lv = args.level || 1;
    const D = ctx.anchor('saloon', 'doors');
    // Mabel steps out to the porch step so the held drunk is clear of the balcony roof.
    const doors = ctx.hasAnchor('saloon', 'doorsOut') ? ctx.anchor('saloon', 'doorsOut') : [D[0], D[1], D[2] + 2.6];
    doors[2] -= 0.55;
    // R5: Mabel works a step west of the doorway so the batwing doors stay readable behind the fling.
    const MX = doors[0] - 1.3;
    let mabel = null, holdProp = -1, flight = null, landAt = -1;
    const bodies = [];
    const kind = args.kind || 'drunk';
    sc.begin = () => {
      mabel = ctx.actor(sc, { char: 'mabel', x: MX, z: doors[2], h: over() ? 0 : PI / 2 - 0.5, clip: CLIP.carry });
      const table = kind !== 'goat' && kind !== 'pianist' && lv >= 100 && R() < 0.35;
      if (kind === 'goat') holdProp = PV.goat;
      else if (kind === 'pianist') { holdProp = PV.piano; bodies.push(ctx.actor(sc, { char: 'fingers', clip: CLIP.piano, speed: 9 })); }
      else if (table) { holdProp = PV.table; for (let i = 0; i < 2; i++) bodies.push(ctx.actor(sc, { ...townsfolk(40 + i), clip: CLIP.sit })); }
      else {
        const n = lv >= 25 && R() < 0.4 ? 2 : 1;
        for (let i = 0; i < n; i++) bodies.push(ctx.actor(sc, { char: i ? 'drunk' : EJECT_LOOK[kind] || 'drunk', clip: CLIP.flail, speed: 9 }));
      }
      for (let i = bodies.length - 1; i >= 0; i--) if (!bodies[i]) bodies.splice(i, 1);
      // His hat drops into the dirt under him while he dangles (it hid Mabel's face).
      if (!over()) for (const b of bodies) { heldPos(bodies.indexOf(b), _f); b.x = _f[0]; b.y = _f[1]; b.z = _f[2]; popHat(b, 0.3, 1.5, 0.4); }
      parts.puff([doors[0], 0.3, doors[2] + 0.4], 5, { line: 'saloon' });
      world.plots.get('saloon')?.kickDoors?.();
      // The landings stay on screen even when they stand between the lens and Mabel (heroTidy's occluder cut).
      sc.keep = Object.keys(TARGET_ANCHOR).map((id) => targetPos(id)).filter(Boolean);
      if (((!sc.cosmetic || args.frenzy) && args.id !== 'amb') || args.ambient) if (ctx.heroVisible) ctx.takeShot(sc, flingShot);
      if (args.thrown) sc.on('fling', args.thrown);
    };
    function over() { return holdProp === PV.table || holdProp === PV.piano; }
    // PT2#9: Mabel stands side-on to the lens and dangles him by the collar at arm's length, feet off the ground, so his
    // whole body reads clear of hers; a second drunk dangles from her other hand.
    function heldPos(i, out) {
      const sway = Math.sin(sc.t * 7 + i) * 0.1;
      if (over()) { out[0] = MX + (i - 0.5) * 0.7; out[1] = 2.55 + (holdProp === PV.table ? 0.75 : 0.2); out[2] = doors[2] + 0.4; }
      else { out[0] = MX + (i ? -1.3 : 1.4) + sway * 0.4; out[1] = 0.4 + Math.abs(sway) * 0.5; out[2] = doors[2] + 0.35; }
      return out;
    }
    // Hold: a frontal medium shot on Mabel + the dangling drunk (≥ 120 CSS px on the S22). Thrown: the camera follows the
    // bundle and settles wide on the landing spot, so every target (the jail wagon too) lands on screen.
    const _f = [0, 0, 0];
    function flingShot(pose, dt) {
      let lx, ly, lz, px, py, pz, fov;
      const ZC = SOUTH - 1.2;
      if (!flight) { heldPos(0, _f); lx = (MX + _f[0]) / 2 + 0.3; ly = 1.6; lz = doors[2] + 0.2; px = lx + 1.0; py = 5.0; pz = Math.min(ZC, lz + 8); fov = 46; }
      else {
        const u = Math.min(1, (sc.t - flight.t0) / flight.dur), p = arc(flight, u), to = flight.to;
        const k = landAt >= 0 ? 1 : u;
        lx = p[0] + (to[0] - p[0]) * k * 0.5; ly = Math.max(1, p[1] * 0.6); lz = p[2] + (to[2] - p[2]) * k * 0.5;
        const up = flight.target === 'pomfrey';
        px = lx + (to[0] < MX ? -6.5 : 6.5); py = up ? 4.5 : 6; pz = Math.min(ZC, Math.max(lz, doors[2]) + 8.5); fov = 46;
      }
      if (pose.snap || sc.t < 0.05) { pose.pos.set(px, py, pz); pose.look.set(lx, ly, lz); pose.fov = fov; pose.snap = false; return true; }
      const a = 1 - Math.exp(-dt * (flight ? 5 : 3));
      pose.pos.x += (px - pose.pos.x) * a; pose.pos.y += (py - pose.pos.y) * a; pose.pos.z += (pz - pose.pos.z) * a;
      pose.look.x += (lx - pose.look.x) * a; pose.look.y += (ly - pose.look.y) * a; pose.look.z += (lz - pose.look.z) * a;
      pose.fov += (fov - pose.fov) * a;
      return true;
    }
    sc.flingInfo = () => {
      const c = heldPos(0, [0, 0, 0]);
      const o = ctx.project([c[0], c[1] + 1.0, c[2]]);
      const top = bodies[0] ? ctx.project(ctx.head(bodies[0], [0, 0, 0])).y : o.y - 40;
      const targets = ['trough', 'dentist', 'jail', 'pomfrey'].map((id) => { const p = targetPos(id); const s = p && ctx.project(p); return s ? { id, x: s.x, y: s.y, visible: s.visible } : null; }).filter(Boolean);
      // top: the held body's head (hero px): U puts the ↑ chip above it, never on him.
      return { id: sc.ejectId, x: o.x, y: o.y, top, targets };
    };
    // Swipe (dx, dy) in screen px → E's cardinal dir (left trough · right dentist · down jail · up Pomfrey), the same
    // mapping the UI's fling chips show. flingInfo().targets has each landing spot's true screen position.
    const dirFor = (dx, dy) => (Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    sc.pick = (ray, _ctx, line) => {
      if (sc.phase !== 'hold' || sc.cosmetic || (line && line !== 'saloon')) return null;
      heldPos(0, _c);
      const d = ctx.nearRay(ray, [_c[0], _c[1] + 1.0, _c[2]], 2.4);
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
      if (args.ambient) ctx.emit('bark', { char: 'mabel', trig: 'eject', src: 'spectacle' });
      parts.puff([doors[0], 0.4, doors[2] + 0.8], 6, { line: 'saloon' });
      for (const b of bodies) if (holdProp < 0) popHat(b, (to[0] - from[0]) * 0.2, 3, (to[2] - from[2]) * 0.2);
    };
    let auto = args.autoAfter ?? null;
    sc.update = (dt) => {
      if (sc.phase === 'hold') {
        if (auto != null && sc.t >= auto) sc.on('fling', { target: args.target || pickOf(['trough', 'haycart', 'jail', 'pomfrey']), auto: true });
        if (sc.t > (args.hold || 2.2) + 3) return false;
        bodies.forEach((b, i) => { heldPos(i, _c); b.x = _c[0]; b.y = _c[1]; b.z = _c[2]; b.h = 0.25 * (i ? 1 : -1); b.roll = Math.sin(sc.t * 7 + i) * 0.18; b.pitch = over() ? 0 : 0.08; hatPhysics(b, dt, true); });
        if (holdProp >= 0) { heldPos(0, _c); ctx.prop(holdProp, MX, over() ? 2.4 : 0.9 + Math.abs(Math.sin(sc.t * 9)) * 0.1, doors[2] + (over() ? 0.4 : 1.0), { ry: over() ? PI : 0.3, line: 'saloon', ph: sc.t * 3 }); }
        if (mabel) { mabel.clip = over() ? CLIP.cheer : CLIP.carry; mabel.speed = 2; }
        if (!sc.cosmetic && bodies[0]) ring(bodies[0], 1.25, 0, 0.8);
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
      if (tg === 'pomfrey') {
        const ph = ctx.extra(sc, { bodyless: true, hat: pomfreyHat(POMFREY_HATS[ctx.game.state.pomfrey ?? 3]), x: to[0], z: to[2] });
        if (ph) { ph.s = 1; ph.hat.off = { x: to[0], y: to[1] + 0.3, z: to[2] + 0.3, rx: 0, ry: 0, rz: 0, vx: 1.2, vy: 3.5, vz: 2.2, spin: 6, rest: false }; sc.pomHat = ph; }
      }
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
      if (sc.pomHat) hatPhysics(sc.pomHat, dt, true);
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
      if (ctx.heroVisible) { ctx.cutIn('saloon', 14); frameAt(sc, doors, BRAWL_SHOT); }
      mabel = ctx.actor(sc, { char: 'mabel', x: doors[0] + 1.6, z: doors[2] + 1.4, clip: CLIP.punch, speed: 9 });
    };
    function launch() {
      const kind = launched % 3;
      const from = kind === 0 ? [doors[0], 1.0, doors[2] + 0.3] : [doors[0] + (kind === 1 ? -3 : 3), 2.6, doors[2] - 0.1];
      const b = ctx.actor(sc, { ...(launched % 2 ? townsfolk(60 + launched) : { char: pickOf(['drunk', 'cowboy', 'cardsharp']) }), x: from[0], y: from[1], z: from[2], clip: CLIP.flail });
      if (!b) return false;
      if (kind) parts.shards(from, 8, 'saloon');
      parts.puff(from, 5, { line: 'saloon' });
      const to = [from[0] + (R() - 0.35) * 8, 0.15, ROAD - 1 + R() * 3.5];
      flying.push({ b, f: { from, to, apex: 2.6 + R() * 1.4, t0: sc.t, dur: 1.7 + R() * 0.3 }, landed: -1, hit: false, spin: (R() < 0.5 ? -1 : 1) * (1.5 + R()) });
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
        if (!sc.cosmetic && !o.hit && (o.landed < 0 || sc.t - o.landed < 0.5)) ring(b, 1.05, i);
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

  // Card-like: tight on the doors and both upper windows, bodies flying at the lens.
  const BRAWL_SHOT = { p: [-7.6, 7.2, 10.2], l: [1.6, 2.0, 3.2], fov: 50 };

  // ======================================================= LEONE DUEL (W8) — real (minigame) or ambient (no reward)
  S.duel = (args) => {
    const ev = args.event, amb = !!args.ambient;
    const sc = { prio: amb ? 1 : 3, slot: true, eventId: ev?.id, ambient: amb, phase: 'intro', cosmetic: amb || !!args.cosmetic, dur: 12 };
    // R3 staged ambient duel: across the street at the shot's stage point, side-on to the lens, paces 2.8 m each.
    const staged = amb && !!args.staged, st = staged ? ctx.stage() : null;
    const L = ctx.heroLook();
    const cx = staged ? st.x : L[0], z = ROAD + 0.6, cz = ROAD, pace = staged ? 2.6 : 6, ro = staged ? -PI / 2 : 0;
    const place = (a, off) => { if (staged) { a.x = cx; a.z = cz + off; } else { a.x = cx + off; a.z = z; } };
    let you = null, opp = null, mort = null, intr = null, result = null, resultAt = 0, tDraw = 0, last = 'intro';
    const I = { kind: null, a: null, t0: 0 };
    const oppId = args.opponent || pickOf(OPPONENTS);
    sc.begin = () => {
      you = ctx.actor(sc, amb ? { ...townsfolk(7 + Math.floor(R() * 20)), x: cx - 0.4, z, h: -PI / 2 } : strangerSpec({ x: cx - 0.4, z, h: -PI / 2 }));
      opp = ctx.actor(sc, { char: oppId, x: cx + 0.4, z, h: PI / 2 });
      if (!you || !opp) return;
      place(you, -0.4); place(opp, 0.4); you.h = -PI / 2 + ro; opp.h = PI / 2 + ro;
      // The duel lane is open dirt: no townsfolk or shipments walk through it (heroTidy/heroNearCut).
      sc.lane = true;
      sc.clear = [];
      for (let k = -2; k <= 2; k++) sc.clear.push(staged ? [cx, cz + k * 1.8, 2.6] : [cx + k * (pace + 2) / 2, z, 3.2]);
      // PT2#7: a Hundred-Gallon brim seen from behind fills the lens; the duel Stranger wears it capped and tipped forward
      // like the vignettes' foreground Stranger (the shot-off hat still flies at full size).
      if (!amb) { you.hat.scale = Math.min(you.hat.scale, 0.62); you.hat.tilt = 0.34; you.hat.brim = 0.84; }
      // PT2#7: DRAW lands ~5.3–7 s after the start (was 10–11.5 s); an interruption (40%) costs 0.8 s of that.
      tDraw = (amb ? 5.0 : 5.3) + R() * 0.9;
      if (!amb && R() < 0.4) { I.kind = pickOf(['horse', 'pickles', 'fly']); tDraw += 0.8; }
      if (!amb) ctx.takeShot(sc, shot);
    };
    const eye = (a, out) => ctx.local(a, 0, 1.0, 0.22, out);
    const T = { p0: 0.6, p1: 3.0, e0: 3.9, e1: 5.0 };
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
      // PT2#7: the over-the-shoulder shot stands well back and high, so only the top of his brim sits in a lower
      // corner (≤ 20% of the frame) and the opponent reads across the street; the close-up is head-and-shoulders.
      const R = ctx.hatRadius(you);
      if (ph === 'intro' || ph === 'paces') set(cx - 15 - R * 3, 7.5 + R * 1.2, z + 3.2 + R * 0.6, cx, 1.0, z, 34);
      else if (ph === 'ecu') { eye(opp, _c); set(_c[0] - OTS.cu[0], _c[1] + OTS.cu[1], _c[2] + OTS.cu[2], _c[0], _c[1] - 0.12, _c[2], OTS.cu[3], true); }
      else if (ph === 'result' && sc.t - resultAt > 1.6) { const l = result === 'oppwins' || result === 'early' ? you : opp; set(l.x - 5.5, 5.2, Math.min(SOUTH - 0.6, z + 5.5), l.x + 0.8, 0.3, z, 40); }
      else { eye(opp, _c); set(you.x - OTS.back - R * 1.5, 2.1 + OTS.up + R * 0.6, z + OTS.side + R * 0.4, _c[0], _c[1] - 0.9, _c[2], ph === 'draw' ? OTS.fov + 3 : OTS.fov); }
      return true;
    }
    sc.update = (dt) => {
      if (!you || !opp) return false;
      const t = sc.t;
      if (result == null) {
        if (t < T.p0) sc.phase = 'intro';
        else if (t < T.p1) {
          sc.phase = 'paces';
          const u = (t - T.p0) / (T.p1 - T.p0), step = Math.floor(u * 10);
          sc.pace = Math.min(10, step + 1);
          place(you, -0.4 - u * pace); place(opp, 0.4 + u * pace);
          you.clip = opp.clip = CLIP.walk; you.speed = opp.speed = 6;
          if (step !== sc.step) { sc.step = step; parts.puff([you.x, 0, you.z], 1, { r: 0.1, size: 0.18 }); parts.puff([opp.x, 0, opp.z], 1, { r: 0.1, size: 0.18 }); }
        } else {
          if (t < T.p1 + 0.4) { const w = (t - T.p1) / 0.4; you.h = PI * w - PI / 2 + ro; opp.h = PI / 2 - PI * w + ro; }
          else { you.h = PI / 2 + ro; opp.h = -PI / 2 + ro; }
          you.clip = opp.clip = sc.phase === 'draw' ? CLIP.draw : CLIP.duel;
          sc.phase = !amb && t > T.e0 && t < T.e1 ? 'ecu' : t >= tDraw ? 'draw' : 'standoff';
          if (t > T.p1 + 0.5 && t < tDraw + 0.4) {
            const u = (t - T.p1 - 0.5) / (tDraw - T.p1 + 0.1), b = 0.45 + Math.abs(Math.sin(t * 5)) * 0.4;
            if (staged) ctx.prop(PV.tumbleweed, cx + st.fx * (7 - u * 9), b, cz + 0.3 + st.fz * (7 - u * 9), { rx: t * 6, s: 0.9 });
            else ctx.prop(PV.tumbleweed, cx, b, z - 5 + u * 11, { rx: t * 6, s: 0.8 });
          }
          if (I.kind && t > T.e1 && t < tDraw - 0.3) interruption(dt, t);
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
      result = r; resultAt = sc.t; sc.resultAt = resultAt; sc.phase = 'result';
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
    return sc;
  };

  // Duel cameras (tuned with docs/shots/spectacle/r6 measurements): OTS back/up/side metres from the Stranger, fov;
  // cu = head-and-shoulders close-up offset from the opponent's eyes [back, up, side, fov].
  const OTS = { back: 7.5, up: 0.9, side: 1.35, fov: 19, cu: [8.5, -0.35, 1.3, 19] };
  S.OTS = OTS;

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
      ctx.takeShot(sc, (pose, dt) => { if (sc.t < 0.1) { pose.look.set(x0, 1.2, ROAD); pose.pos.set(x0 - 13, 5.5, ROAD + 3); } return shot(pose, dt); });
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
    return sc;
  };

  // ======================================================= STAGECOACH ARRIVAL (special): tap a passenger to steer them
  S.stagecoach = (args) => {
    const ev = args.event;
    const sc = { prio: 3, slot: true, eventId: ev?.id, cosmetic: !!args.cosmetic };
    const L = ctx.heroLook(), stopX = L[0] + 1, z = ROAD + 0.4;
    let x = stopX + 40, leaveAt = -1, claimed = null;
    const pax = [];
    // The coach pulls up in the hero and the camera holds on it for the whole pick window (PT#2).
    sc.begin = () => frameAt(sc, [stopX, 0, ROAD], COACH_SHOT);
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
        if (a) a.hat.scale = Math.min(a.hat.scale, 0.85);
        if (a) pax.push({ a, spot: [stopX - 3.4 + pax.length * 1.7, ROAD - 1.3 - (pax.length % 2) * 0.4] });
        else pax.push(null);
      }
      for (const p of pax) {
        if (!p) continue;
        const a = p.a;
        if (claimed && p === claimed.p) { if (walkTo(a, claimed.to[0], claimed.to[2] + 0.5, 1.6, dt)) a.hidden = true; }
        else if (walkTo(a, p.spot[0], p.spot[1], 1.4, dt)) { a.clip = claimed ? CLIP.cheer : CLIP.idle; face(a, stopX - 6, ROAD - 6); }
        if (!claimed && !sc.cosmetic) ring(a, 1.0, pax.indexOf(p));
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

  // PT2#11: low from the north boardwalk, diagonal across the street: the passengers face the lens in a row in front,
  // the whole coach and team stand behind them (no top-down giant hats).
  const COACH_SHOT = { p: [-8.6, 3.9, -5.8], l: [0.2, 1.3, -0.2], fov: 50 };

  // ======================================================= OPENING (W15): thrown out face-first, derby upturned
  // Mabel throws him off the saloon step (slow-mo start), he belly-slides in the mud, the derby lands upturned ahead of
  // him (the hat the UI rings). He gets up when the first business opens. cameras.openingPose frames this from the street.
  S.opening = () => {
    const hub = world.plots.has('hub') ? 'hub' : [...world.plots.keys()][0];
    if (!hub) return null;
    const sc = { prio: 2, line: hub };
    const hp = world.plots.get(hub).group.position;
    const sd = world.plots.has('saloon') ? ctx.anchor('saloon', 'doors') : null;
    const land = ctx.hasAnchor(hub, 'mud') ? ctx.anchor(hub, 'mud') : sd ? [sd[0] + 0.2, 0, sd[2] + 4.2] : [hp.x - 1.5, 0, hp.z - 1.2];
    const from = sd ? [sd[0], 1.1, sd[2] + 0.6] : [land[0] - 3, 2.2, land[2] - 3.5];
    const fresh = (ctx.game.state.stats?.bootTaps || 0) === 0;
    const slideEnd = [land[0] + 1.1, 0.2, land[2] + 0.5];
    const HAT_AT = [slideEnd[0] + 1.5, 0.32, slideEnd[2] + 0.9];
    const DERBY = ['derby', 1.3, 'brown'];
    let a = null, mabel = null, phase = fresh ? 'fly' : 'lie', getUp = -1;
    sc.begin = () => {
      a = ctx.actor(sc, { char: 'stranger', hat: DERBY, x: fresh ? from[0] : slideEnd[0], y: fresh ? from[1] : 0.2, z: fresh ? from[2] : slideEnd[2], clip: CLIP.sit });
      if (!a) return;
      a.h = Math.atan2(slideEnd[0] - from[0], slideEnd[2] - from[2]);
      if (!fresh) { lie(); restHat(); }
      else {
        parts.puff(from, 6);
        if (sd) mabel = ctx.actor(sc, { char: 'mabel', x: sd[0] + 0.5, z: sd[2] + 1.5, h: 0.3, clip: CLIP.punch, speed: 7 });
        world.plots.get('saloon')?.kickDoors?.();
        ctx.emit('bark', { char: 'mabel', trig: 'opening', prio: true, src: 'spectacle' });
        ctx.emit('spectacle:beat', { kind: 'opening', phase: 'start' });
      }
    };
    function restHat() { a.hat.off = { x: HAT_AT[0], y: ctx.hatRest(a), z: HAT_AT[2], rx: PI, ry: 0.5, rz: 0, rest: true }; }
    function lie() { a.pitch = PI / 2; a.y = 0.22; a.clip = CLIP.flail; a.speed = 0.6; a.prone = true; a.x = slideEnd[0]; a.z = slideEnd[2]; }
    sc.anchor = (id) => {
      if (!a) return null;
      if (id === 'hat' && a.hat.off) return [a.hat.off.x, a.hat.off.rest ? 0.3 : a.hat.off.y, a.hat.off.z];
      return null;
    };
    sc.update = (dt) => {
      if (!a) return sc.t < 1;
      const t = sc.t;
      if (mabel) {
        if (t < 2.4) { mabel.clip = t < 0.9 ? CLIP.punch : CLIP.cheer; mabel.speed = t < 0.9 ? 7 : 3; }
        else if (walkTo(mabel, sd[0], sd[2] - 0.6, 1.2, dt) || t > 4.5) { ctx.release(mabel); mabel = null; }
      }
      if (phase === 'fly') {
        const u = Math.min(1, t / 1.5), k = u >= 1 ? 1 : u < 0.45 ? u * 0.55 : 0.2475 + (u - 0.45) * 1.368;
        const p = arc({ from, to: land, apex: 1.5 }, k);
        a.x = p[0]; a.y = p[1]; a.z = p[2]; a.pitch = -0.4 + k * 1.9; a.clip = CLIP.flail; a.speed = 9;
        if (t > 0.3 && !a.hat.off) popHat(a, (HAT_AT[0] - a.x) / 1.5, 3.4, (HAT_AT[2] - a.z) / 1.5);
        if (k >= 1) { phase = 'slide'; sc.slide0 = t; parts.puff(land, 10, { r: 0.9 }); parts.splash([land[0], 0.1, land[2]], 6); }
      } else if (phase === 'slide') {
        const s = Math.min(1, (t - sc.slide0) / 0.8);
        a.x = land[0] + (slideEnd[0] - land[0]) * ease(s); a.z = land[2] + (slideEnd[2] - land[2]) * ease(s); a.y = 0.22; a.pitch = 1.45; a.prone = true;
        if (Math.floor(t * 12) % 2) parts.puff([a.x, 0, a.z], 1, { r: 0.2, size: 0.3 });
        if (s >= 1) { phase = 'lie'; if (!a.hat.off?.rest) { restHat(); parts.puff([HAT_AT[0], 0, HAT_AT[2]], 3, { r: 0.3, size: 0.25 }); } }
      } else if (phase === 'lie') {
        lie();
        a.roll = Math.sin(t * 0.7) * 0.03;
        if (a.hat.off && !a.hat.off.rest) hatPhysics(a, dt, true);
        else if (a.hat.off) { a.hat.off.x = HAT_AT[0]; a.hat.off.z = HAT_AT[2]; a.hat.off.rx = PI; a.hat.off.y = ctx.hatRest(a); }
        if (ctx.game.state.bootstrap?.done) { phase = 'up'; getUp = t; }
      } else {
        const s = t - getUp;
        a.pitch = Math.max(0, 1.45 - s * 2.4); a.y = Math.max(0, 0.22 - s * 0.3); a.prone = a.pitch > 0.6;
        if (s > 0.7 && a.hat.off) {
          if (walkTo(a, a.hat.off.x - 0.3, a.hat.off.z, 1.4, dt)) { a.hat.off = null; setHat(a, hatDef(ctx.game.state.hat || 0)); parts.puff([a.x, 0, a.z], 3); }
        } else if (s > 0.7 && walkTo(a, a.x + 0.01 + 1.6 * dt * 10, ROAD - 1.5, 1.6, dt) === false && s > 5) return false;
        if (s > 6) return false;
      }
      if (phase !== 'lie') hatPhysics(a, dt, true);
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

  // Beats play where the hero already looks (on the street in front of the tour's focus), framed close.
  function stage() {
    const L = ctx.heroLook();
    return [L[0], 0, Math.max(L[2] + 1.5, ROAD - 2.4)];
  }
  // Low and side-on: a giant brim is seen edge-on above the faces instead of covering them.
  const BEAT_SHOT = { p: [-2.8, 2.4, 5.8], l: [0.3, 1.4, -0.4], fov: 46 };
  // Pull back for the Stranger's hat (a Twenty-Gallon is ~3× a derby) so the beat still shows his face.
  function hatShot(base, tier = ctx.game.state.hat || 0, at = null) {
    const h = hatDef(tier), k = clamp(0.4 + (h.scale || 1) * (h.type === HAT_TEN ? 1.05 : 0.6), 1, 3.2);
    const zMax = at ? (SOUTH - 1.2 - at[2]) / Math.max(0.01, base.p[2]) : 9;
    const kz = Math.min(k, Math.max(1, zMax));
    return { p: [base.p[0] * k, base.p[1] + (k - 1) * 0.5, base.p[2] * kz], l: [base.l[0], base.l[1] + (k - 1) * 0.8, base.l[2]], fov: base.fov };
  }

  // ======================================================= HAT PROMOTION (W14): old hat tossed, new one drops on
  S.hat = (e) => {
    const sc = { prio: 2, slot: true, beatKind: 'promo' };
    const tier = e.tier ?? ctx.game.state.hat;
    const at = stage();
    let a = null, dropped = false;
    sc.begin = () => {
      a = ctx.actor(sc, strangerSpec({ x: at[0], z: at[2], h: -0.9, hat: hatDef(Math.max(0, tier - 1)) }));
      frameAt(sc, at, hatShot(BEAT_SHOT, tier, at));
    };
    sc.update = (dt) => {
      if (!a) return false;
      const t = sc.t;
      if (t > 0.9 && !sc.old && !dropped) {
        ctx.head(a, _h);
        sc.old = ctx.extra(sc, { bodyless: true, hat: hatDef(Math.max(0, tier - 1)), x: a.x, z: a.z });
        if (sc.old) { sc.old.s = a.s; sc.old.bodyS = a.bodyS; sc.old.hat.off = { x: _h[0], y: _h[1] - 0.1, z: _h[2], rx: 0, ry: a.h, rz: 0, vx: -2.5, vy: 8, vz: 0.6, spin: 9, rest: false }; }
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
        if (n.landed) { const s = sc.t - n.landed; a.hat.scale = hatDef(tier).scale * (1 + Math.sin(Math.min(1, s * 3) * PI * 2) * 0.15 * Math.max(0, 1 - s * 2)); }
      }
      a.clip = t > 2.4 ? CLIP.tiphat : t > 1.6 ? CLIP.cheer : a.clip;
      return t < 3.6;
    };
    return sc;
  };

  // ======================================================= DEED SHOWDOWN (W3): Pomfrey's sign comes down
  S.deed = () => {
    const sc = { prio: 2, slot: true };
    const at = stage();
    let you = null, pom = null, sign = { y: 3.6, rz: 0, vy: 0, fallen: false };
    sc.begin = () => {
      you = ctx.actor(sc, strangerSpec({ x: at[0] - 1.8, z: at[2] + 0.4, h: PI / 2 - 0.5 }));
      pom = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(POMFREY_HATS[(ctx.game.state.pomfrey ?? 1)]), x: at[0] + 1.8, z: at[2] + 0.4, h: -PI / 2 + 0.5 });
      if (you) { you.hat.scale = Math.min(you.hat.scale, 0.62); you.hat.tilt = 0.2; }
      if (pom) pom.hat.scale = Math.min(pom.hat.scale, 0.75);
      // PT2#11: frontal and wide enough that his sign (3.6 m up behind them) tears and falls in frame.
      frameAt(sc, at, { p: [0.4, 2.4, Math.min(8.5, SOUTH - 1.2 - at[2])], l: [0, 2.1, -0.6], fov: 52 });
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (t > 1.0 && !sign.fallen) { sign.rz = Math.min(1.3, sign.rz + dt * 3); if (sign.rz >= 1.3) { sign.vy -= 14 * dt; sign.y += sign.vy * dt; } if (sign.y <= 0.05) { sign.y = 0.05; sign.fallen = true; parts.puff([at[0], 0, at[2] - 1.2], 12, { r: 1.6 }); parts.stars([at[0], 0.6, at[2] - 1.2], 4); } }
      ctx.prop(PV.sign, at[0] + Math.sin(sign.rz) * 1.2, sign.y, at[2] - 1.2, { rz: sign.rz, rx: sign.fallen ? -1.45 : 0 });
      if (you) you.clip = t > 1.9 ? CLIP.cheer : CLIP.duel;
      if (pom) { pom.clip = t > 1.9 ? CLIP.punch : CLIP.duel; pom.speed = 9; }
      return t < 3.6;
    };
    return sc;
  };

  // ======================================================= ACQUISITIONS (W13): won at poker, a takeover, bought
  // Played at the lot front when the buy starts (queued until the hero is visible). The UI captions on spectacle:beat.
  const SIGNER = { jail: 'wendell', bank: 'thrupp' };
  S.acquire = (e) => {
    const id = e.lineId;
    if (!id || !world.plots.has(id)) return null;
    const sc = { prio: 2, slot: true, line: id, beatKind: e.acq === 'bought' ? 'bought' : e.acq };
    const f = ctx.anchor(id, 'front');
    const at = [f[0], 0, Math.max(f[2], ROAD - 3.4)];
    const kind = e.acq;
    let you = null, other = null, done = false;
    sc.begin = () => {
      ctx.cutIn(id, 9);
      frameAt(sc, at, hatShot(BEAT_SHOT, undefined, at));
      if (kind === 'poker') {
        you = ctx.actor(sc, strangerSpec({ x: at[0] - 0.95, y: 0.12, z: at[2], h: PI / 2, clip: CLIP.sit }));
        other = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(POMFREY_HATS[(ctx.game.state.pomfrey ?? 1)]), x: at[0] + 0.95, y: 0.12, z: at[2], h: -PI / 2, clip: CLIP.sit });
      } else if (kind === 'takeover') {
        you = ctx.actor(sc, strangerSpec({ x: at[0] - 0.9, z: at[2] + 0.3, h: PI / 2 }));
        other = ctx.actor(sc, { look: WIDOW, hat: ['bonnet', 1.1, 'black'], s: 1.05, id: 'widow', x: at[0] + 6, z: at[2] + 0.3, h: -PI / 2 });
      } else {
        you = ctx.actor(sc, strangerSpec({ x: at[0] - 1.2, z: at[2] + 0.5, h: PI / 2 + 0.3 }));
        other = ctx.actor(sc, { char: SIGNER[id] || 'thrupp', x: at[0] + 0.6, y: 0.12, z: at[2] - 0.2, h: -0.2, clip: CLIP.sit });
      }
    };
    sc.update = (dt) => {
      const t = sc.t;
      if (kind === 'poker') poker(t, dt);
      else if (kind === 'takeover') takeover(t, dt);
      else bought(t, dt);
      return t < 6.4;
    };
    function poker(t, dt) {
      ctx.prop(PV.table, at[0], 0, at[2], { line: id });
      for (const s of [-1, 1]) ctx.prop(PV.chair, at[0] + s * 1.0, 0, at[2], { ry: -s * PI / 2, line: id });
      if (you) { you.clip = t > 3.4 ? CLIP.cheer : CLIP.sit; you.y = t > 3.4 ? 0 : 0.12; if (t > 3.4) you.x = at[0] - 1.5; }
      if (other) {
        if (t < 2.0) { other.clip = CLIP.sit; other.roll = Math.sin(t * 2) * 0.05; }
        else if (t < 2.6) { other.roll = Math.sin(t * 40) * 0.08; }
        else {
          if (!sc.fell) { sc.fell = true; popHat(other, 1.5, 4, 0.5); parts.puff([other.x, 0, other.z], 8); }
          const k = Math.min(1, (t - 2.6) / 0.45);
          other.pitch = -k * PI / 2; other.y = 0.12 + k * 0.05; other.x = at[0] + 0.95 + k * 0.9; other.prone = k > 0.5; other.clip = CLIP.flail;
        }
        hatPhysics(other, dt, true);
      }
      // five aces fan up out of the Stranger's hand and hang over the table
      if (t > 1.6) {
        const u = Math.min(1, (t - 1.6) / 0.5);
        if (!sc.aces) { sc.aces = true; parts.stars([at[0] - 0.3, 2.2, at[2]], 8, { burst: 3, line: id }); ctx.fx?.sparkle?.([at[0] - 0.3, 2.0, at[2]], 12, 1.2); }
        for (let i = 0; i < 5; i++) {
          const k = (i - 2) * 0.32 * u;
          ctx.prop(PV.card, at[0] - 0.3 + Math.sin(k) * 0.55, 1.0 + u * 1.0 + Math.cos(k) * 0.35, at[2] + 0.25, { rz: -k, s: 1.6, line: id });
        }
      }
    }
    function takeover(t, dt) {
      if (other) {
        if (t < 2.2) { walkTo(other, at[0] + 0.5, at[2] + 0.3, 2.6, dt); other.clip = CLIP.walk; other.speed = 7; }
        else if (t < 3.4) { face(other, you?.x ?? at[0], other.z); other.clip = CLIP.idle; }
        else { other.clip = CLIP.cheer; other.speed = 8; other.y = Math.abs(Math.sin(t * 7)) * 0.3; other.x += dt * 2.2; other.h = PI / 2; if (!sc.hop) { sc.hop = true; parts.stars([other.x, 2.2, other.z], 4, { line: id }); } }
      }
      // the giant key passes from her hand to his: she skips off, delighted
      const giver = t < 3.0 ? other : you;
      if (giver) {
        ctx.local(giver, 0.35, 0.75, 0.35, _c);
        const lift = t > 2.7 && t < 3.2 ? Math.sin((t - 2.7) / 0.5 * PI) * 0.4 : 0;
        ctx.prop(PV.key, _c[0], _c[1] + lift, _c[2], { rz: giver === you ? -0.3 : 0.3, ry: giver.h, s: 1.6, line: id });
      }
      if (you) you.clip = t > 3.1 ? CLIP.tiphat : CLIP.idle;
      if (t > 3.0 && !sc.got) { sc.got = true; if (you) { ctx.head(you, _h); parts.stars(_h, 5, { burst: 2, line: id }); } }
    }
    function bought(t, dt) {
      ctx.prop(PV.table, at[0] + 0.6, 0, at[2] + 0.55, { line: id });
      ctx.prop(PV.deed, at[0] + 0.6, 0.79, at[2] + 0.55, { ry: 0.2, line: id });
      if (!other) return;
      if (t < 3.6) {
        // the quivering hand
        other.clip = CLIP.sit; other.roll = Math.sin(t * 38) * 0.035; other.y = 0.12;
        ctx.local(other, 0.3, 0.55, 0.42, _c);
        const scr = t > 2.0 ? Math.sin(t * 22) * 0.12 : 0;
        ctx.prop(PV.pen, _c[0] + Math.sin(t * 47) * 0.04 + scr, Math.max(0.8, _c[1] + Math.sin(t * 53) * 0.04), _c[2] + Math.cos(t * 41) * 0.03, { rz: 0.5 + Math.sin(t * 61) * 0.2, line: id });
        if (t > 2.0 && Math.floor(t * 10) !== Math.floor((t - dt) * 10)) parts.puff([at[0] + 0.6, 0.85, at[2] + 0.55], 1, { r: 0.1, size: 0.1, line: id });
      } else {
        if (!done) { done = true; parts.stars([other.x, 2, other.z], 5, { line: id }); if (id === 'jail') { other.hat.lift = 0; other.hat.scale *= 1.25; } }
        const k = Math.min(1, (t - 3.6) / 0.5);
        if (id === 'bank') { other.pitch = -k * PI / 2; other.prone = k > 0.5; other.clip = CLIP.sprawl; }
        else { other.clip = CLIP.dizzy; other.roll = Math.sin(t * 3) * 0.15; }
      }
      if (you) you.clip = t > 3.8 ? CLIP.tiphat : CLIP.idle;
    }
    return sc;
  };
  const WIDOW = { k: 'widow', top: '#2b2230', bot: '#2b2230', skin: 0, hair: 6, style: 3, acc: ['dress'], stache: -1 };

  // ======================================================= FAKE YOUR DEATH (W2): procession, coffin on the coach, new face
  // ... then the Stranger peeks out from behind the coffin cart, rips off his moustache and slaps on the new disguise's.
  S.prestige = () => {
    const sc = { prio: 2, slot: true };
    const at = stage();
    const z = ROAD - 0.6, x0 = at[0] - 7, coachX = at[0] - 0.8, cz1 = z - 2.6;
    const who = [];
    let stranger = null, coachGo = -1, coffinOn = false, swapAt = -1, stache = null;
    const gen = ctx.game.state.gen || 1;
    const prev = wornStache;
    void gen;
    sc.begin = () => {
      for (const [c, dx, dz] of [['mortimer', -3.4, -1.0], ['mulligan', 0, -0.75], ['mulligan', 0, 0.75], ['mabel', -2.4, 0.9], ['pickles', -4.6, 0.3]]) {
        const a = ctx.actor(sc, { char: c, x: x0 + dx, z: z + dz, h: PI / 2 });
        if (a && c === 'mortimer') a.hat.scale = Math.min(a.hat.scale, 0.8);
        who.push(a ? { a, dx, dz } : null);
      }
      frameAt(sc, [at[0], 0, z], { p: [9.5, 6.0, Math.min(5.8, SOUTH - 1.2 - z)], l: [-2.2, 1.0, -1.0], fov: 46 });
    };
    sc.update = (dt) => {
      const t = sc.t;
      const walkX = x0 + Math.min(t, 4.2) * 1.9;
      for (const w of who) {
        if (!w) continue;
        const a = w.a;
        if (t < 4.2) { a.x = walkX + w.dx; a.z = z + w.dz; a.clip = CLIP.walk; a.speed = 4; a.h = PI / 2; }
        else a.clip = a.char === 'mabel' ? CLIP.sip : t > 7.4 ? CLIP.cheer : CLIP.idle;
        if (a.char === 'mabel' && t < 7 && Math.floor(t * 3) % 2 === 0 && Math.floor((t - dt) * 3) % 2 === 1) { ctx.head(a, _h); parts.splash([_h[0], _h[1] - 0.4, _h[2]], 3); }
        if (a.char === 'mulligan' && t < 4.2) a.clip = CLIP.carry;
      }
      let cx = walkX, cy = 2.75, cz = z;
      const cz0 = cz1;
      if (t > 4.2) { const u = Math.min(1, (t - 4.2) / 0.8); cx = walkX + (coachX - walkX) * u; cy = 2.75 - u * 0.1; cz = z + (cz0 - z) * u; coffinOn = u >= 1; }
      if (t > 5.1 && coachGo < 0) coachGo = t;
      const cmx = coachGo < 0 ? coachX : coachX + Math.pow(t - coachGo, 2) * 3;
      if (coffinOn) { cx = cmx; cy = 2.65; cz = cz1; }
      ctx.prop(PV.coach, cmx, 0, cz1, { ry: PI / 2 });
      for (const k of [0, 1]) ctx.prop(PV.horse, cmx + 4.4, coachGo < 0 ? 0 : Math.abs(Math.sin(t * 10 + k)) * 0.2, cz1 + (k ? 0.75 : -0.75), { ry: PI / 2 });
      if (coachGo >= 0 && Math.floor(t * 8) % 2 === 0) parts.puff([cmx - 1.5, 0, cz1], 1, { r: 0.6, size: 0.3 });
      ctx.prop(PV.coffin, cx, cy, cz, { ry: coffinOn ? PI / 2 : 0, s: 1.35, rx: coffinOn ? 0 : Math.sin(t * 5) * 0.06 });
      // the barrel he was hiding in, then the moustache swap
      const bx = at[0] + 1.2, bz = z + 1.8;
      if (t > 6.2) ctx.prop(PV.barrel, bx + 0.9, 0, bz - 0.2, { ry: 0.4 });
      if (t > 6.6 && !stranger) {
        for (const w of who) if (w && w.a.char === 'mulligan') ctx.release(w.a);
        stranger = ctx.actor(sc, strangerSpec({ x: bx, z: bz, h: 0.9, stache: prev ?? -1 }));
        if (stranger) { stranger.hat.scale = Math.min(stranger.hat.scale, 0.62); stranger.hat.tilt = 0.2; }
        if (stranger) parts.puff([bx, 0, bz], 10, { r: 1 });
        swapAt = t + 0.9;
      }
      if (stranger && swapAt > 0 && t >= swapAt && !stache) {
        ctx.head(stranger, _h);
        stache = { x: _h[0], y: _h[1] - 0.55, z: _h[2] + 0.3, vx: -1.8, vy: 4.5, vz: 1.2, r: 0 };
        const next = STACHE_OF[ctx.game.state.disguise?.moustache] || 'handlebar';
        wornStache = next;
        Object.assign(stranger, strangerLook(next));
        parts.puff([_h[0], _h[1] - 0.5, _h[2] + 0.3], 6, { r: 0.3, size: 0.2 });
        parts.stars(_h, 5, { burst: 2 });
      }
      if (stranger) stranger.clip = t > swapAt + 1.2 && swapAt > 0 ? CLIP.tiphat : t > swapAt - 0.4 && t < swapAt + 0.3 ? CLIP.punch : CLIP.idle;
      if (stache) {
        stache.vy -= 12 * dt; stache.x += stache.vx * dt; stache.y = Math.max(0.05, stache.y + stache.vy * dt); stache.z += stache.vz * dt; stache.r += dt * 14;
        if (stache.y <= 0.05) { stache.vx = stache.vz = 0; stache.vy = 0; }
        ctx.prop(PV.stache, stache.x, stache.y, stache.z, { rz: stache.r, rx: stache.r * 0.5, s: 2.2 });
      }
      return t < 9.8;
    };
    return sc;
  };

  // ======================================================= GHOST TOWN (W12): 3D sheet-ghosts drift down Main Street
  // One per state.season.ghost (E spawns them; tap → U acts ghost:tap). Ghost duels are an ambient gag in the season.
  S.ghost = (args) => {
    const g = args.ghost;
    if (!g) return null;
    const sc = { prio: 0.4, gid: g.id, cosmetic: false };
    // R3: drifts ACROSS the tour shot a little behind the stage point (mid-ground, not at the lens).
    const st = world.heroRig.mode !== 'town' ? ctx.stage() : null;
    let z = Math.min(ROAD - 1.5, ctx.heroLook()[2] + 2 + R() * 1.5);
    const [a, b] = st?.ok ? (R() < 0.5 ? [-5, 5] : [5, -5]) : crossing(z, 9);
    const life = Math.max(3, (g.until - g.born) || 9);
    let lift = 0, x = a, y = 1.6, h = st?.ok ? Math.atan2(st.ax * Math.sign(b - a), st.az * Math.sign(b - a)) : Math.sign(b - a) * PI / 2, fade = 0, out = -1, caught = -1;
    sc.update = (dt) => {
      const t = sc.t;
      if (caught < 0) {
        const u = Math.min(1, t / life);
        x = a + (b - a) * u;
        if (st?.ok) { const k = x; x = st.x + st.ax * k + st.fx * 30; z = st.z + st.az * k + st.fz * 30; }
        // R5: while a vignette plays it rides high over the rooftops instead of crossing the gag.
        lift += ((world.spectacle?.clear?.length || api?.hot ? 6 : 0) - lift) * Math.min(1, dt * 2);
        y = 1.5 + lift + Math.sin(t * 2.2) * 0.25;
        fade = Math.min(1, t / 0.6) * (out < 0 ? 1 : Math.max(0, 1 - (t - out) / 0.6));
        if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) parts.puff([x - Math.sign(b - a) * 0.4, y - 0.4, z], 1, { r: 0.15, size: 0.18, up: 0.3, col: PCOL.ECTO, life: 1.2 });
        if ((out >= 0 && t - out > 0.6) || t > life + 1.5) return false;
        ctx.ghost(x, y, z, { h, s: 1.45, a: fade, roll: Math.sin(t * 1.7) * 0.12 });
        if (out < 0) ctx.halo(x, y + 1.2, z, 1.5, 0.55, 0, 2);
      } else {
        const s = t - caught;
        ctx.ghost(x, y + s * 4, z, { h: h + s * 14, s: 1.45 * (1 - s * 0.8), a: Math.max(0, 1 - s * 1.8) });
        if (s > 0.55) return false;
      }
      return true;
    };
    sc.pick = (ray) => {
      if (caught >= 0 || out >= 0 || sc.t < 0.3) return null;
      const d = ctx.nearRay(ray, [x, y + 1.1, z], 1.7);
      return d >= 0 ? { rank: 2, kind: 'ghost', id: g.id, act: 'ghost:tap', payload: { id: g.id }, dist: d } : null;
    };
    sc.on = (k, e) => {
      if (e?.ghost?.id !== g.id) return;
      if (k === 'gone' && out < 0) out = sc.t;
      if (k === 'tap' && caught < 0) {
        caught = sc.t;
        parts.splash([x, y + 0.8, z], 14);
        parts.puff([x, y + 0.6, z], 10, { r: 0.8, col: PCOL.ECTO, size: 0.35 });
        parts.stars([x, y + 1.6, z], 4, { burst: 2.5 });
      }
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
    { id: 'vultures', w: 1.5, stage: false, ok: () => ctx.lineOpen('undertaker') }, { id: 'garter', w: 2.5, ok: () => ctx.lineOpen('garter') && !ctx.game.state.sunday && garterInView() },
    { id: 'mortimer', w: 1.5, ok: () => ctx.lineOpen('undertaker') }, { id: 'duel', w: 1.2, ok: () => ctx.lineOpen('saloon') },
    { id: 'horse', w: 1.2 }, { id: 'eject', w: 2, ok: () => !ctx.lineOpen('saloon') && world.plots.has('saloon') && ctx.inHero(ctx.anchor('saloon', 'doors'), 0.8) },
    { id: 'tumbleweed', w: 1, sw: 0.3 },
    { id: 'ghostduel', w: 4, ok: () => !!ctx.game.state.season?.live },
  ];
  function garterInView() { const p = world.plots.has('garter') && ctx.anchor('garter', 'window'); return !!p && ctx.inHero(p, 0.85); }
  // R4: every hero shot stages one composed vignette (vignettes.js): you in the foreground, a 1–3 character gag in the
  // mid-ground, open dirt around it. The ejection is the showpiece on the saloon/hub shots.
  const VIG = createVignettes(ctx, { CLIP, strangerSpec, popHat, hatPhysics, arc, face, walkTo, hv: [0, 0, 0], c3: [0, 0, 0], pick: pickOf, OPPONENTS });
  const VIGS = [{ id: 'eject', w: 2 }, { id: 'duel', w: 2.2 }, { id: 'pickles', w: 1.8 }, { id: 'barrel', w: 1.8 }, { id: 'pomfrey', w: 1.4 }];
  const VPREFER = { saloon: ['eject'], hub: ['eject'], jail: ['barrel'], tubs: ['pickles'], bank: ['pomfrey'], shine: ['pomfrey'], undertaker: ['duel'], dentist: ['duel'], livery: ['pickles'], garter: ['pomfrey'], '@town': ['duel', 'eject'] };
  const recentVig = [];
  function pickVignette(o) {
    const pref = VPREFER[o.shot] || [];
    const pool = VIGS.filter((g) => !(recentVig.includes(g.id) && !(pref[0] === g.id && recentVig[recentVig.length - 1] !== g.id)));
    const w = (g) => g.w * (pref[0] === g.id ? 6 : pref.includes(g.id) ? 2.5 : 1);
    const tried = new Set();
    while (tried.size < pool.length) {
      let r = R() * pool.reduce((s, g) => s + (tried.has(g.id) ? 0 : w(g)), 0), g = null;
      for (const x of pool) if (!tried.has(x.id) && (r -= w(x)) <= 0) { g = x; break; }
      g ||= pool.find((x) => !tried.has(x.id));
      tried.add(g.id);
      const sc = api.playScene('gag', { which: g.id, staged: true, vig: true });
      if (sc) { recentVig.push(g.id); if (recentVig.length > 2) recentVig.shift(); return sc; }
    }
    return null;
  }
  // R3: the tour stages one gag per shot; the shot's own business pulls its character's gag forward.
  const PREFER = { jail: ['barrel'], undertaker: ['mortimer', 'duel'], tubs: ['pickles'], saloon: ['duel', 'pickles', 'eject'], bank: ['pomfrey'], shine: ['pomfrey', 'chickens'], dentist: ['chickens', 'mortimer'], garter: ['garter', 'pomfrey'], livery: ['horse', 'chickens'], hub: ['pickles', 'eject'] };
  S.pickGag = (force, o = {}) => {
    const staged = !!o.staged;
    if (staged && !force && !(ctx.game.state.season?.live && R() < 0.15)) { const v = pickVignette(o); if (v) return v; }
    if (force && VIG[force] && o.vig !== false) return api.playScene('gag', { which: force, staged: true, vig: true });
    const pool = GAGS.filter((g) => (force ? g.id === force : !recentGags.includes(g.id) && (!g.ok || g.ok()) && !(staged && (g.stage === false || (g.id === 'garter' && o.shot !== 'garter') || (g.id === 'eject' && o.shot !== 'saloon' && o.shot !== 'hub')))));
    if (!pool.length) return null;
    const pref = PREFER[o.shot] || [];
    const w = (g) => (staged ? g.sw ?? g.w : g.w) * (pref.includes(g.id) ? 3 : 1);
    let r = R() * pool.reduce((s, g) => s + w(g), 0), g = pool[0];
    for (const x of pool) if ((r -= w(x)) <= 0) { g = x; break; }
    recentGags.push(g.id);
    if (recentGags.length > 3) recentGags.shift();
    if (g.id === 'duel') return api.playScene('duel', { ambient: true, staged });
    if (g.id === 'eject') { const sc = api.playScene('eject', { id: 'amb', kind: 'drunk', level: 1, autoAfter: 1.0 }); if (sc) { sc.amb = true; sc.dur = 6; } return sc; }
    return api.playScene('gag', { which: g.id, staged });
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
    if (args.vig && VIG[which]) return VIG[which](args);
    const sc = { prio: 0, kind: 'gag', which, cosmetic: true, dur: 8 };
    const L = ctx.heroLook();
    // Staged (R3): placed on ctx.stage(), moving ACROSS the view (u) so they stay big and in frame; idle = face the lens.
    const st = args.staged ? ctx.stage() : null, cam = ctx.camPos();
    const P = (u, v = 0) => [st.x + st.ax * u + st.fx * v, st.z + st.az * u + st.fz * v];
    const faceCam = (a) => face(a, cam.x, cam.z);
    const toward = (a, b) => Math.atan2(st.ax * Math.sign(b - a), st.az * Math.sign(b - a));
    function spanU(max) {
      const ok = (u) => { const p = P(u); return p[1] > NORTH + 0.4 && p[1] < SOUTH - 0.4 && ctx.inHero([p[0], 1, p[1]], 0.92); };
      let a = -max, b = max;
      for (let i = 0; i < 12 && !ok(a) && a < -1; i++) a += max / 12;
      for (let i = 0; i < 12 && !ok(b) && b > 1; i++) b -= max / 12;
      return R() < 0.5 ? [a, b] : [b, a];
    }
    const G = st ? {
      barrel() {
        const [a, b] = spanU(5.5), mid = (a + b) / 2;
        const T1 = Math.abs(mid - a) / 1.1, T2 = T1 + 2.2;
        sc.dur = T2 + Math.abs(b - mid) / 1.1;
        return () => {
          const t = sc.t, stop = t > T1 && t < T2;
          const u = t <= T1 ? a + (mid - a) * (t / T1) : stop ? mid : mid + (b - mid) * Math.min(1, (t - T2) / (sc.dur - T2));
          const step = stop ? 0 : Math.sin(t * 10), [x, z] = P(u);
          const ry = stop ? Math.atan2(cam.x - x, cam.z - z) : toward(a, b);
          const hop = stop && t - T1 > 0.6 && t - T1 < 1.6 ? Math.abs(Math.sin((t - T1 - 0.6) * PI * 2)) * 0.35 : 0;
          if (stop && hop > 0.3 && !sc.hopped) { sc.hopped = true; parts.puff([x, 0, z], 4, { r: 0.4 }); }
          ctx.prop(PV.legs, x, Math.max(0, step) * 0.08 + hop, z, { ry, sx: 1 + step * 0.15, s: 1.7 });
          ctx.prop(PV.barrel, x, 0.5 + Math.abs(step) * 0.1 + hop, z, { rz: step * 0.12, ry: stop ? ry : t, s: 1.7 });
          return t < sc.dur;
        };
      },
      pickles() {
        const [x, z] = P(R() < 0.5 ? -1 : 1);
        const a = ctx.actor(sc, { char: 'pickles', x, y: 0.18, z, h: 0, clip: CLIP.sprawl });
        if (!a) return null;
        a.h = Math.atan2(cam.x - x, cam.z - z) + PI / 2;
        a.pitch = -PI / 2; a.prone = true;
        sc.dur = 10;
        return () => {
          const t = sc.t;
          if (t > 4 && t < 7.2) {
            const k = Math.min(1, (t - 4) / 0.5) * Math.min(1, (7.2 - t) / 0.3);
            a.pitch = -PI / 2 * (1 - k); a.y = 0.18 * (1 - k); a.prone = k < 0.5;
            a.clip = k > 0.5 ? CLIP.slump : CLIP.sprawl;
            if (k > 0.5) faceCam(a);
            if (t > 5.4 && !sc.hic) { sc.hic = true; parts.stars([a.x, 2.2, a.z], 3, { follow: () => ctx.head(a, _h), life: 1.6 }); }
          } else {
            if (t >= 7.2 && !sc.flop) { sc.flop = true; parts.puff([a.x, 0, a.z], 8, { r: 0.8 }); a.h = Math.atan2(cam.x - a.x, cam.z - a.z) + PI / 2; }
            a.pitch = -PI / 2; a.y = 0.18; a.prone = true; a.clip = CLIP.sprawl;
            if (Math.floor(t * 1.2) !== Math.floor((t - 0.05) * 1.2)) parts.puff([a.x, 0.9, a.z], 1, { r: 0.05, size: 0.14, up: 0.6, col: PCOL.SMOKE });
          }
          a.roll = Math.sin(t * 0.9) * 0.05;
          return t < sc.dur;
        };
      },
      chickens() {
        const [a, b] = spanU(5);
        const dir = Math.sign(b - a);
        const man = ctx.extra(sc, { ...townsfolk(3 + Math.floor(R() * 20)), x: P(a)[0], z: P(a)[1], clip: CLIP.walk });
        sc.dur = 7;
        return () => {
          const t = sc.t, back = t > 3.4, k = back ? Math.min(1, (t - 3.4) / 3.2) : Math.min(1, t / 3.4);
          const u = back ? b + (a - b) * k : a + (b - a) * k, d = back ? -dir : dir;
          const ry = toward(0, d);
          const hop = (q) => Math.abs(Math.sin(t * 14 + q)) * 0.25;
          const lead = back ? 1.6 : 0, chase = back ? 0 : 1.6;
          for (let i = 0; i < 2; i++) { const [x, z] = P(u - d * (lead ? 0 : 0.9 * i) + d * (lead ? -0.9 * i - 1.4 : 0), 0.4 * i); ctx.prop(PV.chicken, x, hop(i), z, { ry, ph: t * 4 + i, s: 1.9 }); }
          if (man) {
            const [x, z] = P(u - d * chase + (back ? d * 0.4 : 0), 0.2);
            man.x = x; man.z = z; man.h = ry; man.clip = back ? CLIP.flail : CLIP.walk; man.speed = back ? 8 : 9;
            if (t > 3.0 && t < 3.6) { faceCam(man); man.clip = CLIP.handsup; }
          }
          if (Math.floor(t * 6) !== Math.floor((t - 0.02) * 6)) { const [x, z] = P(u); parts.puff([x, 0, z], 1, { r: 0.1, size: 0.18 }); }
          return t < sc.dur;
        };
      },
      pomfrey() {
        const def = POMFREY_HATS[ctx.game.state.pomfrey ?? 7];
        const [a, b] = spanU(6), dir = Math.sign(b - a), mid = (a + b) / 2;
        const p = ctx.actor(sc, { char: 'pomfrey', hat: pomfreyHat(def), x: P(a)[0], z: P(a)[1] });
        if (!p) return null;
        const bearers = [];
        if ((def?.scale || 1) >= 2) for (const s of [-1, 1]) { const e = ctx.extra(sc, { char: 'goon', x: p.x, z: p.z, clip: CLIP.cheer, speed: 2 }); if (e) bearers.push([e, s]); }
        ctx.say('pomfrey', 'pomfrey_pass');
        const T1 = Math.abs(mid - a) / 1.2, T2 = T1 + 2.2;
        sc.dur = T2 + Math.abs(b - mid) / 1.2;
        return () => {
          const t = sc.t, stop = t > T1 && t < T2;
          const u = t <= T1 ? a + (mid - a) * (t / T1) : stop ? mid : mid + (b - mid) * Math.min(1, (t - T2) / (sc.dur - T2));
          [p.x, p.z] = P(u);
          if (stop) { faceCam(p); p.clip = t - T1 < 1.4 ? CLIP.tiphat : CLIP.idle; p.speed = 4; }
          else { p.h = toward(0, dir); p.clip = CLIP.walk; p.speed = 3.5; }
          for (const [e, s] of bearers) {
            [e.x, e.z] = P(u - dir * 0.2, s * (def.scale || 1) * 0.42);
            e.h = p.h; e.clip = stop ? CLIP.idle : CLIP.cheer; e.y = stop ? 0 : Math.abs(Math.sin(t * 7 + s)) * 0.03;
          }
          return t < sc.dur;
        };
      },
      mortimer() {
        const [a, b] = spanU(5), dir = Math.sign(b - a);
        const pass = ctx.extra(sc, { ...townsfolk(Math.floor(R() * 30)), x: P(a)[0], z: P(a)[1] });
        const m = ctx.actor(sc, { char: 'mortimer', x: P(b)[0], z: P(b)[1] });
        if (!pass || !m) { if (pass) ctx.release(pass); if (m) ctx.release(m); return null; }
        const pa = P(-dir * 0.5), pm = P(dir * 0.5), ea = P(a - dir * 3), eb = P(b + dir * 3);
        sc.dur = 10;
        return () => {
          const t = sc.t, dt = 1 / 60;
          if (t < 3) { walkTo(pass, pa[0], pa[1], 1.6, dt); walkTo(m, pm[0], pm[1], 1.6, dt); }
          else if (t < 6.8) {
            m.clip = CLIP.work; face(m, pass.x, pass.z);
            if (t < 5) { pass.clip = CLIP.idle; face(pass, m.x, m.z); } else { faceCam(pass); pass.clip = CLIP.handsup; }
            const top = ctx.head(pass, _h)[1];
            ctx.prop(PV.tape, pass.x + (m.x - pass.x) * 0.3, 0.05, pass.z + (m.z - pass.z) * 0.3, { rx: -PI / 2, sz: top / 1.2 * Math.min(1, (t - 3) / 0.8) });
          } else { walkTo(pass, ea[0], ea[1], 3.2, dt); pass.clip = CLIP.flail; pass.speed = 10; walkTo(m, eb[0], eb[1], 1.2, dt); }
          return t < sc.dur;
        };
      },
      horse() {
        const [x, z] = P(R() < 0.5 ? -1.2 : 1.2);
        const man = ctx.extra(sc, { ...townsfolk(Math.floor(R() * 30)), x: x, z: z, clip: CLIP.idle });
        const [mx, mz] = P(x > st.x ? -0.6 : 0.6, -1.5);
        if (man) { man.x = mx; man.z = mz; }
        sc.dur = 9;
        return () => {
          const want = Math.atan2(cam.x - x, cam.z - z);
          const ry = sc.t < 2 ? -PI / 2 + (want + PI / 2) * ease(Math.min(1, sc.t / 2)) : want;
          ctx.prop(PV.horse, x, 0, z, { ry, rz: Math.sin(sc.t * 0.8) * 0.01, s: 1.1 });
          if (man) {
            if (sc.t < 3) { face(man, x, z); man.clip = CLIP.point; }
            else if (sc.t < 6) { faceCam(man); man.clip = CLIP.idle; }
            else { faceCam(man); man.clip = CLIP.handsup; }
          }
          return sc.t < sc.dur;
        };
      },
      tumbleweed() {
        const [a, b] = spanU(7);
        sc.dur = 5;
        return () => {
          const u = sc.t / 5, [x, z] = P(a + (b - a) * Math.min(1, u), Math.sin(sc.t) * 0.5);
          ctx.prop(PV.tumbleweed, x, 0.5 + Math.abs(Math.sin(sc.t * 4)) * 0.6, z, { rx: sc.t * 5 * Math.sign(b - a), rz: sc.t * 2, s: 1.1 });
          return u < 1;
        };
      },
    } : {};
    const LEGACY = {
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
      // Two dead gunslingers re-fight their last duel: both fire, nothing happens, both shrug.
      ghostduel() {
        const L2 = ctx.heroLook(), cx = L2[0] + 4, z = Math.min(ROAD - 1.5, L2[2] + 2.5);
        const g = [{ x: cx - 2.8, h: PI / 2 }, { x: cx + 2.8, h: -PI / 2 }];
        return () => {
          const t = sc.t, fade = Math.min(1, t / 0.8) * Math.max(0, Math.min(1, (8 - t) / 0.8));
          g.forEach((o, i) => {
            const bob = Math.sin(t * 2 + i * 2) * 0.12;
            let roll = Math.sin(t * 1.4 + i) * 0.05, y = 1.35 + bob;
            if (t > 4.3 && t < 6.2) { const s = t - 4.3; roll = Math.sin(s * 9) * 0.25 * Math.max(0, 1 - s / 1.9); y += Math.sin(Math.min(1, s * 2) * PI) * 0.35; }
            ctx.ghost(o.x, y, z, { h: o.h, s: 1.5, a: fade * 0.95, v: 1, roll });
            if (t > 2.6 && t < 4.6) {
              const gx = o.x + Math.sin(o.h) * 0.95, gy = y + 1.2;
              ctx.prop(PV.gun, gx, gy, z + 0.1, { ry: o.h, s: 1.8 });
              if (t > 3.4 && !o.shot) { o.shot = true; parts.flash([gx + Math.sin(o.h) * 0.3, gy, z + 0.1], 0.7); parts.smoke([gx, gy, z], 4); }
            }
          });
          if (t > 3.4 && t < 3.75) { const u = (t - 3.4) / 0.35; for (const s of [-1, 1]) parts.puff([cx - s * 2.8 * (1 - 2 * u), 2.6, z], 1, { r: 0.02, size: 0.1, up: 0, col: PCOL.FLASH, life: 0.2 }); }
          return t < 8;
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
    for (const k in LEGACY) G[k] ||= LEGACY[k];
    let step = null;
    sc.begin = () => { step = G[which]?.() || null; };
    sc.update = (dt) => (step ? step(dt) : false);
    return sc;
  };

  return S;
}
