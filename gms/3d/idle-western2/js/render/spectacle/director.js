import * as THREE from 'three';
import { createCast } from './cast.js?v=20261004d';
import { createProps, PV } from './props.js?v=20261004d';
import { createParticles } from './particles.js?v=20261004d';
import { CHARS, townsfolk } from './looks.js?v=20261004d';
import { hatIndex, dressScale } from './cast.js?v=20261004d';
import { createScenes } from './scenes.js?v=20261004d';
import { createHalos, createGhosts } from './overlay.js?v=20261004d';
import { FRONTS } from '../../data/plots.js?v=20261004d';

// The spectacle director (DESIGN W9/W10): ONE slot for the big moment (a special or a story beat), a hard actor budget
// (≤ 6 animated + ≤ 24 crowd extras + ≤ 256 particles), a pre-allocated actor pool, blob shadows, hero picking in the
// W7 priority order, and per-frame bubble anchors for the UI. Scenes live in scenes.js; this file owns the rules.
export const BUDGET = { actors: 6, extras: 24, particles: 256 };
export const RANK = { minigame: 1, event: 2, fling: 3, piano: 4, char: 5, site: 6, pile: 6.5, street: 7 };
const CAP = 48;
const AMBIENT_GAP = [15, 30];

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const R = Math.random;

export function createSpectacle({ world, kit, host, game, bus, fx, street }) {
  const scene = world.scene;
  const cast = createCast(kit, scene, CAP);
  const props = createProps(kit, scene, 192);
  const parts = createParticles(kit, scene, 2048);
  const halos = createHalos(kit, scene, 24);
  const ghosts = createGhosts(kit, scene, 8);
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  const lim = { ...BUDGET, on: !q.has('nobudget') };
  let fxLive = 0;
  parts.setExtern(() => fxLive);

  // Pre-allocated actor pool: no allocation while a scene plays.
  const pool = Array.from({ length: CAP }, (_, i) => ({ i, used: false, extra: false, prio: 0, scene: null, char: '', x: 0, y: 0, z: 0, h: 0, pitch: 0, roll: 0, s: 1, clip: 0, phase: 0, speed: 3.8, look: null, hat: { type: -1, scale: 1, color: 'tan', lift: 0, off: null, gone: false }, dress: null, lookKey: '', bodyS: 1, line: null, hidden: false, prone: false, bodyless: false, pickR: 0 }));
  const propList = Array.from({ length: 192 }, () => ({ v: 0, x: 0, y: 0, z: 0, ry: 0, rx: 0, rz: 0, s: 1, sx: 1, sy: 1, sz: 1, ph: 0, line: null }));
  let nprops = 0;
  const scenes = [];
  const pendingSpecials = new Map();
  const stats = { actors: 0, extras: 0, particles: 0, maxActors: 0, maxExtras: 0, maxParticles: 0, denied: 0, scenes: [], calls: 0, frames: 0 };
  let t = 0, frame = 0, filled = -1, filledLine, heroVisible = true, saloonVisible = false, visAt = 0, nextAmbient = 12, lastPick = null;
  let drawPending = null, shotOwner = null, uiHero = true;
  const caps = new Set(['ghost']);
  const clear = [];

  const count = (extra) => { let n = 0; for (const a of pool) if (a.used && a.extra === extra) n++; return n; };

  function alloc(sc, spec, extra = false) {
    const cap = lim.on ? (extra ? lim.extras : lim.actors) : CAP;
    if (count(extra) >= cap || count(false) + count(true) >= CAP) {
      if (!lim.on || !evict(sc.prio, extra)) { stats.denied++; return null; }
    }
    const a = pool.find((x) => !x.used);
    if (!a) return null;
    a.used = true; a.extra = extra; a.scene = sc; a.prio = sc.prio;
    const c = typeof spec.char === 'string' ? CHARS[spec.char] : null;
    a.char = spec.id || (typeof spec.char === 'string' ? spec.char : '');
    a.dress = spec.dress !== undefined ? spec.dress : c?.dress || null;
    const tf = !a.dress && !spec.look && !c?.look ? townsfolk(a.i) : null;
    a.look = a.dress ? null : spec.look || c?.look || tf.look;
    a.lookKey = a.dress ? 'd:' + a.dress : 'l:' + (a.look?.k || a.i);
    a.bodyS = a.dress ? dressScale(a.dress) : c?.s ?? 1;
    setHat(a, spec.hat !== undefined ? spec.hat : c ? c.hat : tf?.hat);
    a.hat.lift = 0; a.hat.off = null; a.hat.gone = false;
    a.x = spec.x ?? 0; a.y = spec.y ?? 0; a.z = spec.z ?? 0; a.h = spec.h ?? 0; a.pitch = 0; a.roll = 0;
    a.s = spec.s ?? 1; a.clip = spec.clip ?? 0; a.phase = R() * 6; a.speed = spec.speed ?? 3.8;
    a.line = spec.line ?? sc.line ?? null; a.hidden = false; a.prone = false; a.bodyless = !!spec.bodyless; a.pickR = spec.pickR ?? 0;
    sc.actors.push(a);
    return a;
  }
  function setHat(a, h) {
    if (!h) { a.hat.type = -1; return; }
    if (Array.isArray(h)) { a.hat.type = hatIndex(h[0]); a.hat.scale = h[1] ?? 1; a.hat.color = h[2] || 'tan'; }
    else { a.hat.type = hatIndex(h.type); a.hat.scale = h.scale ?? 1; a.hat.color = h.color || 'tan'; }
  }
  function release(a) {
    if (!a || !a.used) return;
    a.used = false;
    const l = a.scene?.actors;
    if (l) { const k = l.indexOf(a); if (k >= 0) l.splice(k, 1); }
    a.scene = null;
  }
  // Make room for a higher-priority scene by ending the lowest-priority scene that holds actors of that kind.
  function evict(prio, extra) {
    let worst = null;
    for (const s of scenes) if (s.prio < prio && s.actors.some((a) => a.extra === extra) && (!worst || s.prio < worst.prio)) worst = s;
    if (!worst) return false;
    end(worst);
    return true;
  }

  // ---- anchors (lane P names them on the plot: plot.anchors = { doors: [x,y,z], piano, window, ... } in plot space)
  const FALLBACK = {
    doors: [-2, 0.25, 2.2], piano: [2.2, 0.25, 2.4], trough: [-7, 0, 3.4], haycart: [-10.5, 0, 6.2], wagon: [4.5, 0, 9.6],
    window: [-2, 3.4, 1.0], chair: [-2, 0.25, 2.6], front: [0, 0, 3.6], pomfreyWindow: [4, 1.8, 18.8], center: [0, 0, 0],
  };
  function anchor(lineId, name, out = [0, 0, 0]) {
    const p = world.plots.get(lineId);
    if (!p) return null;
    const local = p.anchors?.[name] || FALLBACK[name] || FALLBACK.front;
    _v.set(local[0], local[1], local[2]);
    if (!p.anchors?.[name] && name === 'pomfreyWindow') {
      let best = null;
      for (const f of FRONTS || []) if (f.kind === 'pomfrey' && (!best || Math.abs(f.x - p.group.position.x) < Math.abs(best.x - p.group.position.x))) best = f;
      if (best) { out[0] = best.x; out[1] = 2.0; out[2] = best.z - 0.3; return out; }
      out[0] = p.group.position.x + local[0]; out[1] = local[1]; out[2] = local[2]; return out;
    }
    p.group.updateMatrixWorld();
    _v.applyMatrix4(p.group.matrixWorld);
    out[0] = _v.x; out[1] = _v.y; out[2] = _v.z;
    return out;
  }
  const hasAnchor = (lineId, name) => !!world.plots.get(lineId)?.anchors?.[name];
  const lineOpen = (id) => (game.state.lines[id]?.lv || 0) > 0;
  function heroLook(out = [0, 0, 0]) {
    const f = world.heroRig.focus;
    if (f) { out[0] = f.x; out[1] = 0; out[2] = f.z; return out; }
    const cam = world.heroRig.camera;
    cam.getWorldDirection(_v);
    const k = _v.y < -0.05 ? -cam.position.y / _v.y : 30;
    out[0] = cam.position.x + _v.x * k; out[1] = 0; out[2] = cam.position.z + _v.z * k;
    return out;
  }
  // The R3 stage: a street point in the current hero shot where a 2 m character reads ~150–250 px tall on the S22
  // (STAGE_FRAC of the frame height), inside the tilt-shift focus band. `ax/az` run across the view, `fx/fz` along it.
  const STAGE_H = 2.0, STAGE_FRAC = 0.105;
  const stageP = { x: 0, z: 0, ax: 0, az: 1, fx: 1, fz: 0, ok: false };
  const _sf = new THREE.Vector3(), _sh = new THREE.Vector3();
  function stage() {
    const cam = world.heroRig.camera;
    cam.updateMatrixWorld();
    cam.getWorldDirection(_v);
    let fx = _v.x, fz = _v.z;
    const n = Math.hypot(fx, fz) || 1;
    fx /= n; fz /= n;
    const z0 = (street.north ?? street.z - street.width / 2) + 0.9, z1 = (street.south ?? street.z + street.width / 2) - 0.9;
    const at = (d) => {
      const x = cam.position.x + fx * d, z = Math.min(z1, Math.max(z0, cam.position.z + fz * d));
      _sf.set(x, 0, z).project(cam); _sh.set(x, STAGE_H, z).project(cam);
      return (_sh.y - _sf.y) / 2;
    };
    let lo = 4, hi = 80;
    for (let i = 0; i < 16; i++) { const m = (lo + hi) / 2; if (at(m) > STAGE_FRAC) lo = m; else hi = m; }
    at(lo);
    const ok = _sf.z < 1 && _sf.y > -0.85 && _sh.y < 0.6 && Math.abs(_sf.x) < 0.8;
    if (ok) { stageP.x = cam.position.x + fx * lo; stageP.z = Math.min(z1, Math.max(z0, cam.position.z + fz * lo)); }
    else { const L = heroLook(); stageP.x = L[0]; stageP.z = Math.min(z1, Math.max(z0, L[2])); }
    stageP.fx = fx; stageP.fz = fz; stageP.ax = -fz; stageP.az = fx; stageP.ok = ok;
    if (stageP.az < 0) { stageP.ax = -stageP.ax; stageP.az = -stageP.az; }
    return stageP;
  }
  function inHero(p, m = 0.9) {
    _v.set(p[0], p[1] ?? 1, p[2]).project(world.heroRig.camera);
    return _v.z < 1 && Math.abs(_v.x) < m && Math.abs(_v.y) < m;
  }

  function prop(v, x, y, z, o) {
    if (nprops >= propList.length) return;
    const p = propList[nprops++];
    p.v = v; p.x = x; p.y = y; p.z = z;
    p.ry = o?.ry || 0; p.rx = o?.rx || 0; p.rz = o?.rz || 0; p.s = o?.s || 1; p.sx = o?.sx || 1; p.sy = o?.sy || 1; p.sz = o?.sz || 1;
    p.ph = o?.ph || 0; p.line = o?.line ?? null;
  }

  function act(sc, type, payload) {
    if (sc?.cosmetic) return null;
    return game.act(type, payload);
  }

  const ctx = {
    get t() { return t; }, game, world, bus, fx, parts, street, PV, lim,
    actor: (sc, spec) => alloc(sc, spec, false),
    extra: (sc, spec) => alloc(sc, spec, true),
    release, prop, anchor, hasAnchor, lineOpen, heroLook, inHero, act, stage,
    camPos: () => world.heroRig.camera.position,
    head: (a, out) => cast.head(a, out),
    hatRest: (a) => cast.hatRest(a),
    hatRadius: (a) => cast.hatRadius(a),
    setHat,
    local: (a, x, y, z, out) => cast.local(a, x, y, z, out),
    project: (p) => (host?.project ? { ...host.project('hero', p) } : { x: 0, y: 0, visible: false }),
    nearRay: (ray, p, r) => near(ray, p, r),
    centre: (a, out) => cast.centre(a, out),
    shot: (fn) => world.heroRig.shot?.(fn),
    // A scene borrows the hero camera; a higher-priority scene may take it over, an ending scene only drops its own.
    takeShot(sc, fn) {
      if (shotOwner && shotOwner !== sc && scenes.includes(shotOwner) && (shotOwner.prio > sc.prio || (shotOwner.prio === sc.prio && shotOwner.kind !== sc.kind))) return false;
      shotOwner = sc; sc.shotOn = true; world.heroRig.shot?.(fn); return true;
    },
    dropShot(sc) { if (shotOwner === sc) { shotOwner = null; world.heroRig.shot?.(null); } sc.shotOn = false; },
    ownsShot: (sc) => shotOwner === sc,
    halo(x, y, z, r, k = 1, ph = 0, left = 2, line = null) { halos.add(x, y, z, r, k, ph, left, line); },
    ghost(x, y, z, o) { ghosts.add(x, y, z, o); },
    cutIn: (id, sec) => world.heroRig.cutIn?.(id, sec, 'spectacle'),
    markDraw(sc) { drawPending = sc; host?.markDirty?.('hero'); },
    get heroVisible() { return heroVisible && uiHero; },
    say(char, trig) { bus?.emit('bark', { char, trig, prio: false, src: 'spectacle' }); },
    emit(type, e) { bus?.emit(type, e); },
  };
  const S = createScenes(ctx);

  function start(kind, args = {}) {
    const make = S[kind];
    if (!make) return null;
    const sc = make(args);
    if (!sc) return null;
    sc.kind = kind; sc.t = 0; sc.actors = sc.actors || [];
    sc.prio ??= 1; sc.slot ??= false; sc.cosmetic = !!args.cosmetic || !!sc.cosmetic;
    if (lim.on && kind === 'gag' && scenes.some((o) => o.kind === 'gag' || (o.slot && o.prio >= 2))) return null;
    if (lim.on && kind === 'eject' && scenes.filter((o) => o.kind === 'eject').length >= 2) return null;
    if (sc.slot && lim.on) {
      // A finished special still playing its tail (bodies limping back in) gives way to the next live one.
      const stale = (o) => o.eventId && o.eventId !== sc.eventId && !game.state.events.active.some((x) => x.id === o.eventId);
      for (const o of [...scenes]) if (o.slot && (o.prio < sc.prio || (sc.eventId && stale(o)))) end(o);
      if (scenes.some((o) => o.slot)) return null;
    }
    scenes.push(sc);
    try { sc.begin?.(ctx); } catch (e) { console.error('[spectacle] ' + kind, e); end(sc); return null; }
    return sc;
  }
  function end(sc) {
    const k = scenes.indexOf(sc);
    if (k < 0) return;
    scenes.splice(k, 1);
    try { sc.end?.(ctx); } catch (e) { console.error(e); }
    for (const a of [...sc.actors]) release(a);
    if (sc.shotOn) ctx.dropShot(sc);
    if (STAGED(sc)) stageAt = Math.max(stageAt, t + 2.5 + R() * 2.5);
    if (sc.beat) bus?.emit('spectacle:beat', { kind: sc.beatKind || sc.beat, phase: 'end' });
  }
  const slotBusy = () => scenes.some((s) => s.slot && s.prio >= 2);

  // ---- game wiring
  const on = (k, fn) => game.on(k, (e) => { try { fn(e || {}); } catch (err) { console.error('[spectacle] ' + k, err); } });
  on('special:wind', (e) => { if (e.event) pendingSpecials.set(e.event.id, e.event); });
  on('special:start', (e) => {
    pendingSpecials.delete(e.event?.id);
    if (scenes.some((s) => s.eventId === e.event?.id)) return;
    const kind = e.kind;
    if (S[kind]) start(kind, { event: e.event });
  });
  on('special:end', (e) => {
    pendingSpecials.delete(e.event?.id);
    for (const s of scenes) if (s.eventId === e.event?.id) s.on?.('end', e, ctx);
  });
  for (const k of ['brawl:hit', 'robbery:hit', 'duel:result', 'event:claim']) on(k, (e) => {
    const p = lastPick && performance.now() - lastPick.at < 400 ? lastPick : null;
    for (const s of scenes) s.on?.(k, e, ctx, p);
    if (p) lastPick = null;
  });
  on('eject', (e) => {
    world.heroRig.note?.('saloon');
    start('eject', { id: e.id, kind: e.kind, level: e.level, hold: e.holdSec });
  });
  on('fling', (e) => {
    const s = scenes.find((x) => x.kind === 'eject' && x.ejectId === e.id);
    if (s) s.on('fling', e, ctx);
    else start('eject', { id: e.id, kind: e.kind, level: game.state.lines.saloon?.lv || 1, thrown: e });
  });
  on('piano', (e) => { for (const s of scenes) s.on?.('piano', e, ctx); pianoFx(e); });
  on('piano:frenzy', (e) => { if (e.brawl) start('eject', { id: 'frenzy' + t, kind: 'drunk', level: game.state.lines.saloon?.lv || 1, cosmetic: true, frenzy: true, autoAfter: 0.6 }); });
  on('build:stage', (e) => S.buildFx?.(e, 'stage'));
  on('build:done', (e) => S.buildFx?.(e, 'done'));
  on('build:start', (e) => S.buildFx?.(e, 'start'));
  on('hat:promo', (e) => queueBeat('hat', e));
  on('deed', (e) => queueBeat('deed', e));
  on('prestige', (e) => queueBeat('prestige', e));
  on('build:start', (e) => { if (e.acq === 'poker' || e.acq === 'takeover' || e.acq === 'bought') queueBeat('acquire', e); });
  const ghostLive = (g) => scenes.some((s) => s.kind === 'ghost' && s.gid === g.id);
  on('ghost:spawn', (e) => { if (e.ghost && !ghostLive(e.ghost)) start('ghost', { ghost: e.ghost }); });
  on('ghost:gone', (e) => { for (const s of scenes) if (s.kind === 'ghost') s.on?.('gone', e, ctx); });
  on('ghost:tap', (e) => { for (const s of scenes) if (s.kind === 'ghost') s.on?.('tap', e, ctx); });
  on('tap', (e) => { if (e.kind === 'mud') for (const s of scenes) s.on?.('mud', e, ctx); });
  on('unlocked', () => { for (const s of scenes) s.on?.('unlocked', null, ctx); });

  // Story beats (hat promo, Deed, Fake Your Death, acquisitions) wait until the hero is really on screen (PT#6/#7):
  // the director's view check AND the UI's `ui:hero` (sheets, Town). They keep for BEAT_TTL, then are dropped.
  const BEAT_TTL = 180;
  const beats = [];
  function queueBeat(kind, e) { beats.push({ kind, e, at: t }); }
  bus?.on?.('ui:hero', (e) => { uiHero = !!e?.visible; });

  function pianoFx(e) {
    const id = 'saloon';
    if (!world.plots.has(id)) return;
    const p = anchor(id, 'piano');
    parts.stars([p[0], p[1] + 1.6, p[2]], e.frenzy ? 6 : 2, { line: id, burst: 1.2, life: 0.9 });
    if (e.wrong) parts.smoke([p[0], p[1] + 1.4, p[2]], 4, id);
  }

  // ---- per frame
  function heroCheck(now, visibleLines) {
    if (now - visAt < 250) return;
    visAt = now;
    let hv = false, sv = false;
    for (const v of host.debug.listViews?.() || []) {
      if (v.kind === 'hero' && v.visible) hv = true;
      if (v.lineId === 'saloon' && v.visible) sv = true;
    }
    if (!host.debug.listViews) hv = !visibleLines || visibleLines.hero !== false;
    heroVisible = hv; saloonVisible = sv;
  }

  // W9: the UI begins a special (bell + chip, then once the hero has been on screen); we only drop stale wind-ups.
  function stageSpecials() {
    for (const id of pendingSpecials.keys()) if (!game.state.events.active.some((x) => x.id === id)) pendingSpecials.delete(id);
  }

  // R3: every tour/pinned shot gets one staged mid-ground gag. A new shot ends the old shot's gag and stages a fresh one
  // once the glide lands; the tour holds the shot until it has played. Town keeps the old 15–30 s ambient cadence.
  let stageShot = null, stageAt = 0;
  const STAGED = (s) => s.kind === 'gag' || (s.kind === 'duel' && s.ambient) || (s.kind === 'eject' && s.amb);
  function ambient() {
    if (!game.state.bootstrap?.done || !heroVisible) return;
    const rig = world.heroRig, mode = rig.mode;
    if (mode === 'tour' || mode === 'pin' || mode === 'town') {
      if (rig.current !== stageShot) {
        stageShot = rig.current; stageAt = t + 0.4;
        if (lim.on) for (const s of [...scenes]) if (STAGED(s)) end(s);
        return;
      }
      if (t < stageAt || rig.gliding || rig.shooting) return;
      if (scenes.some((s) => s.slot || s.kind === 'gag')) { stageAt = t + 1; return; }
      stageAt = t + 1;
      const sc = S.pickGag?.(null, { staged: true, shot: stageShot });
      if (sc && mode === 'tour') rig.hold?.((sc.dur || 8) + 0.6);
      return;
    }
    if (t < nextAmbient) return;
    if (lim.on && scenes.some((s) => s.slot || s.kind === 'gag')) { nextAmbient = t + 2; return; }
    nextAmbient = t + (lim.on ? AMBIENT_GAP[0] + R() * (AMBIENT_GAP[1] - AMBIENT_GAP[0]) : 2.5);
    S.pickGag?.();
  }

  let beatGap = 0;
  function runBeats() {
    while (beats.length) {
      const b = beats[0];
      if (t - b.at > BEAT_TTL) { beats.shift(); continue; }
      if (!heroVisible || !uiHero || t < beatGap) return;
      if (lim.on && scenes.some((s) => s.slot && s.prio >= 2)) return;
      beats.shift();
      const sc = start(b.kind, b.e);
      if (sc) { sc.beat = b.kind; beatGap = t + 0.8; bus?.emit('spectacle:beat', { kind: sc.beatKind || b.kind, phase: 'start' }); return; }
    }
  }

  function update(dt, now, visibleLines) {
    if (!game) return;
    t += dt;
    frame++;
    heroCheck(now, visibleLines);
    if (game.state.bootstrap && !game.state.bootstrap.done && !scenes.some((s) => s.kind === 'opening')) start('opening', {});
    stageSpecials();
    const g = game.state.season?.ghost;
    if (g && frame % 30 === 0 && !ghostLive(g)) start('ghost', { ghost: g });
    runBeats();
    ambient();
    nprops = 0;
    halos.clear(); ghosts.clear();
    for (const sc of [...scenes]) {
      sc.t += dt;
      let alive = true;
      try { alive = sc.update(dt, ctx) !== false; } catch (e) { console.error('[spectacle] ' + sc.kind, e); alive = false; }
      if (!alive) end(sc);
    }
    S.always?.(dt);
    clear.length = 0;
    for (const sc of scenes) if (sc.clear) for (const q of sc.clear) clear.push(q);
    parts.update(dt);
    fxLive = fx?.live ? fx.live() : 0;
    const na = count(false), ne = count(true), np = parts.live + fxLive;
    stats.actors = na; stats.extras = ne; stats.particles = np;
    if (na > stats.maxActors) stats.maxActors = na;
    if (ne > stats.maxExtras) stats.maxExtras = ne;
    if (np > stats.maxParticles) stats.maxParticles = np;
    stats.frames++;
    bubbles.frame = -1;
  }

  // ---- render: fill instance buffers once per (frame, camera filter)
  let showLine = null;
  // Hero-only scenes (R4 vignettes, the saloon ejection) never show in a card: the plot's own card gag plays there.
  const show = (a) => !showLine || (a.line === showLine && !a.scene?.heroOnly);
  function fill(line) {
    if (filled === frame && filledLine === line) return;
    filled = frame; filledLine = line;
    showLine = line;
    cast.write(pool, show);
    let n = 0;
    if (line) {
      for (let i = 0; i < nprops; i++) if (propList[i].line === line) { const tmp = propList[n]; propList[n] = propList[i]; propList[i] = tmp; n++; }
      props.write(propList, n);
    } else props.write(propList, nprops);
    parts.write(line);
    halos.write(line); ghosts.write(line);
    stats.calls = cast.calls + (props.mesh.visible ? 1 : 0) + parts.calls + halos.calls + ghosts.calls;
  }
  const prevBefore = scene.onBeforeRender;
  scene.onBeforeRender = function (renderer, sc, camera, rt) {
    prevBefore?.call(this, renderer, sc, camera, rt);
    fill(camera.userData?.iw2Line || null);
  };
  const prevAfter = scene.onAfterRender;
  scene.onAfterRender = function (renderer, sc, camera, rt) {
    prevAfter?.call(this, renderer, sc, camera, rt);
    if (drawPending && camera === world.heroRig.camera) { drawPending.drawAt = performance.now(); drawPending.onDrawn?.(ctx); drawPending = null; }
  };

  // Shader warm-up: every spectacle mesh is visible (one hidden instance) while the host compiles the boot warm-up.
  const warm0 = world.warmup;
  let warmSc = null;
  world.warmup = function (on) {
    if (on) {
      warmSc = { prio: 0, actors: [], line: null };
      alloc(warmSc, { char: 'mabel', x: 0, y: -40, z: 0 });
      cast.warm(true);
      nprops = 0;
      prop(PV.barrel, 0, -40, 0);
      parts.puff([0, -40, 0], 1); parts.stars([0, -40, 0], 1);
      halos.clear(); halos.add(0, -40, 0, 0.1, 0, 0, 2); ghosts.clear(); ghosts.add(0, -40, 0);
      filled = -1;
      fill(null);
    } else if (warmSc) {
      for (const x of [...warmSc.actors]) release(x);
      cast.warm(false);
      warmSc = null; nprops = 0; parts.clear(); halos.clear(); ghosts.clear(); filled = -1;
      fill(null);
    }
    return warm0.call(this, on);
  };

  // ---- picking (W7). host.pick asks every picker with the view's ray; in collect mode we gather our candidates.
  let collecting = null;
  function picker(ray, only, view) {
    const hits = [];
    const line = view?.kind === 'line' ? view.lineId : null;
    for (const s of scenes) {
      const h = s.pick?.(ray, ctx, line);
      if (h) for (const x of Array.isArray(h) ? h : [h]) hits.push(x);
    }
    pianoHit(ray, line, hits);
    charHits(ray, line, hits);
    if (collecting) { rayCopy = ray.clone(); for (const h of hits) collecting.push(h); return null; }
    let best = null;
    for (const h of hits) if (h.rank === RANK.minigame && (!best || h.dist < best.dist)) best = h;
    return best ? { ...best, dist: -1 } : null;
  }
  const near = (ray, p, r) => {
    _w.set(p[0], p[1], p[2]);
    const dist = _w.distanceTo(ray.origin), rad = Math.max(r, dist * 0.045);
    return ray.distanceSqToPoint(_w) <= rad * rad ? dist : -1;
  };
  function pianoHit(ray, line, hits) {
    if (!world.plots.has('saloon') || (line && line !== 'saloon')) return;
    const p = anchor('saloon', 'piano');
    const d = near(ray, [p[0], p[1] + 0.9, p[2]], 1.3);
    if (d >= 0) hits.push({ rank: RANK.piano, kind: 'piano', id: 'piano', lineId: 'saloon', act: 'piano', payload: {}, dist: d, point: p.slice() });
  }
  function charHits(ray, line, hits) {
    for (const a of pool) {
      if (!a.used || a.extra || !a.char || !CHARS[a.char] || a.hidden || (line && (a.line !== line || a.scene?.heroOnly))) continue;
      cast.centre(a, _c3);
      const d = near(ray, _c3, 0.9 * (a.s || 1));
      if (d >= 0) hits.push({ rank: RANK.char, kind: 'char', id: a.char, char: a.char, dist: d, point: _c3.slice() });
    }
  }
  const _c3 = [0, 0, 0];
  host?.addPicker?.(picker);

  function siteHit(ray, hits) {
    if (!ray.intersectPlane(_plane, _v)) return;
    for (const id of Object.keys(game.state.build || {})) {
      const p = world.plots.get(id);
      if (!p) continue;
      const dx = Math.abs(_v.x - p.group.position.x), dz = Math.abs(_v.z - p.group.position.z);
      if (dx < p.bounds.w / 2 && dz < p.bounds.d / 2 + 2) hits.push({ rank: RANK.site, kind: 'site', id, lineId: id, act: 'build:hurry', payload: { lineId: id }, dist: _v.distanceTo(ray.origin), point: _v.toArray() });
    }
  }
  const BASE_RANK = { event: RANK.event, courier: RANK.event, pile: RANK.pile, target: RANK.pile, ground: RANK.street };
  let rayCopy = null;
  // pickView(viewId, clientX, clientY, timeStamp?) → the one W7 winner: {kind:'minigame'|'event'|'fling'|'piano'|'char'|
  // 'site'|'pile'|'courier'|'street', id, act?, payload?, lineId?, ...}. When `act` is set, the UI calls game.act(act, payload).
  function pickView(viewId, x, y, ts) {
    collecting = [];
    rayCopy = null;
    pickTs = ts ?? performance.now();
    const base = host.pick(viewId, x, y);
    const hits = collecting;
    collecting = null;
    if (rayCopy) siteHit(rayCopy, hits);
    if (base) {
      const rank = BASE_RANK[base.kind] ?? RANK.street;
      hits.push({ ...base, rank, kind: base.kind === 'ground' ? 'street' : base.kind, dist: base.dist ?? 1e9 });
    }
    let best = null;
    for (const h of hits) if (!best || h.rank < best.rank || (h.rank === best.rank && h.dist < best.dist)) best = h;
    if (best) lastPick = { ...best, at: performance.now() };
    return best;
  }
  let pickTs = 0;

  // ---- bubbles: screen anchor for a character's head in a view (hero by default). Transform-only DOM on the UI side.
  const CHAR_HOME = { mabel: 'saloon', pete: 'dentist', lulu: 'garter', mortimer: 'undertaker', wendell: 'jail', thrupp: 'bank', nubbin: 'shine', hortense: 'livery', fingers: 'saloon', pickles: 'tubs' };
  const bubbles = { frame: -1, cache: new Map() };
  const _h = [0, 0, 0];
  function bubble(charId, viewId = 'hero') {
    const key = charId + '|' + viewId;
    if (bubbles.frame === frame && bubbles.cache.has(key)) return bubbles.cache.get(key);
    if (bubbles.frame !== frame) { bubbles.cache.clear(); bubbles.frame = frame; }
    let pos = null, actor = false;
    for (const sc of scenes) { const p = sc.anchor?.(charId); if (p) { _h[0] = p[0]; _h[1] = p[1]; _h[2] = p[2]; pos = _h; break; } }
    if (!pos && charId === 'mud' && world.plots.get('hub')?.anchors?.mud) pos = anchor('hub', 'mud', _h);
    if (!pos) for (const a of pool) if (a.used && a.char === charId && !a.hidden) { cast.head(a, _h); _h[1] += 0.35; pos = _h; actor = true; break; }
    if (!pos) {
      const home = CHAR_HOME[charId];
      if (home && world.plots.has(home) && (charId === 'pickles' || charId === 'fingers' || lineOpen(home))) pos = anchor(home, 'doors', _h), pos[1] += 2.4;
    }
    let out = null;
    if (pos && host?.project) {
      const pr = host.project(viewId, pos);
      out = { x: pr.x, y: pr.y, visible: pr.visible, actor };
    }
    bubbles.cache.set(key, out);
    return out;
  }

  const api = {
    update,
    pickView,
    pickHero: (x, y, ts) => pickView('hero', x, y, ts),
    get pickTime() { return pickTs; },
    bubble,
    gag(id) { return S.pickGag?.(id); },
    has(kind) { return typeof S[kind] === 'function' && !['attach', 'always', 'pickGag', 'buildFx'].includes(kind); },
    play(kind, args = {}) { return !!start(kind, { cosmetic: true, ...args }); },
    stage,
    playScene(kind, args = {}) { return start(kind, { cosmetic: true, ...args }); },
    stop(kind) { for (const s of [...scenes]) if (!kind || s.kind === kind) end(s); },
    budget(on) { if (on !== undefined) lim.on = !!on; return lim.on; },
    get scenes() { return scenes.map((s) => s.kind); },
    caps,
    // R4: open-dirt zones [[x, z, r]] around the staged vignette; cameras.heroTidy keeps townsfolk and shipments out.
    clear,
    // M's "hot" flag: the hero runs at 60 fps while a slot scene, an ejection, a duel or a borrowed camera is live.
    get hot() { return !!shotOwner || scenes.some((s) => s.slot || s.kind === 'eject' || s.kind === 'duel'); },
    get beatsQueued() { return beats.map((b) => b.kind); },
    // Queue a story beat (kind: hat | deed | prestige | acquire) — it plays once the hero is visible.
    queueBeat,
    debug: stats,
    resetStats() { stats.maxActors = stats.maxExtras = stats.maxParticles = stats.denied = 0; stats.frames = 0; },
    duel() { const s = scenes.find((x) => x.kind === 'duel' && !x.ambient); return s ? { phase: s.phase, drawAt: s.drawAt || 0, id: s.eventId } : null; },
    fling() { const s = scenes.find((x) => x.kind === 'eject' && x.phase === 'hold'); return s ? s.flingInfo?.(ctx) : null; },
    parts, cast, props, pool,
  };
  S.attach?.(api);
  return api;
}
