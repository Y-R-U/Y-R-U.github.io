import * as THREE from 'three';
import { createBattle, TICKS_PER_SEC, autoSlots } from '../sim/battle.js';
import { lookupUnit } from '../sim/stats.js';
import { loadData } from '../sim/data.js';
import { BOARD, slotPos, plateColor, RARITY_INDEX, RARITY_COLORS, LANE_PROFILES, applyLaneProfile } from './layout.js';
import { buildArena, prewarmArena, themeFor } from './arena.js';
import { createBattleCamera } from './camera.js';
import { createVFX } from '../fx/vfx.js';
import { createEffects, PAL } from '../fx/toolkit.js';
import { createOverlay } from './overlay.js';
import { REFLECT_LAYER, MIRROR_ONLY_LAYER } from '../fx/reflection.js';
const qsNoProxy = typeof location !== 'undefined' && /[?&]proxy=0/.test(location.search);
const qsNum = (k) => { const m = typeof location !== 'undefined' && location.search.match(new RegExp('[?&]' + k + '=([0-9.]+)')); return m ? +m[1] : null; };
import { UNIT_FX } from '../fx/units/index.js';
import { setStealth, tickStealth, disposeStealth } from '../fx/stealth.js';
import * as placeholder from './placeholder_unit.js';
import { expandPrecise, primeSkinnedBounds } from './geo.js';

// Battle playback (TEAM_BRIEF "Battle"): owns the sim stepper, drives units + VFX from sim events.
// createBattleScene(engine, { playerSquad, enemyWaves, seed, arena, data?, overlay?, auto?, speed?, bars?, audio?, goals? })
//  goals = the level's star goals (game.startLevel cfg.goals, js/sim/README "Star goals"); the sim scores the end stars with them
//  → scene object { scene, camera, update, resize, preRender, dispose, pick } +
//    { ready (Promise), start(), setSpeed(1|2|4|8; 8 = dev), setAuto(bool), fireOverdrive(slot|id), on('state'|'end'|'event', fn), state, units }
//  BATTLE-L (docs/LANDSCAPE.md §2): setMargins({top, bottom, left?, right?}), setLaneProfile('tall'|'wide', {animate}), laneProfile,
//    overlay.setFrame({left, right, top}). The lane profile follows the aspect (w/h >= 1 = 'wide') unless opts.laneProfile pins it.
const TPS = TICKS_PER_SEC;
const FCOL = { corporate: PAL.cyan, rogue: PAL.orange, experimental: PAL.purple, legendary: PAL.gold, order: PAL.blue, horde: PAL.red, wild: PAL.green };

const unitFxCache = new Map();
function unitFx(keys) {
  for (const k of keys) {
    if (!k || !UNIT_FX[k]) continue;
    if (!unitFxCache.has(k)) {
      const rec = { mod: null };
      unitFxCache.set(k, rec);
      UNIT_FX[k]().then((m) => { rec.mod = m.default || m; }).catch((e) => console.warn('[battle] unit fx ' + k + ' failed', e));
    }
    return unitFxCache.get(k);
  }
  return null;
}

// QA Q11: one failed fetch used to mean placeholder units until a reload. 3 tries with backoff (a cache-busting query on the retries),
// and a fallback to placeholders is not cached, so the next battle tries again. (A failed transitive import can stay in the browser's
// module map for the page; the busting query only helps when units.js itself failed.)
let unitsModP = null;
function unitsModule() {
  if (unitsModP) return unitsModP;
  unitsModP = (async () => {
    let err = null;
    for (let i = 0; i < 3; i++) {
      try { return await import(i ? `../actors/units.js?retry=${i}-${Date.now()}` : '../actors/units.js'); } catch (e) { err = e; }
      await new Promise((r) => setTimeout(r, 300 * 3 ** i));
    }
    console.warn('[battle] js/actors/units.js failed 3x, using placeholder units', err);
    unitsModP = null;
    return import('./placeholder_unit.js');
  })();
  return unitsModP;
}

function realmFromWaves(waves, data) {
  let n = 0, f = 0;
  for (const w of waves || []) for (const u of w?.units || []) {
    const id = typeof u?.def === 'string' ? u.def : u?.def?.id;
    const d = u?.def?.realm ? u.def : (id && (data?.enemies?.[id] || data?.units?.[id])) || null;
    n++; if ((u?.realm || d?.realm) === 'fantasy') f++;
  }
  return n && f / n > 0.5 ? 'fantasy' : null;
}

// battle-10: start the slow, cacheable parts of a battle ahead (idle time), e.g. while the formation screen is open. Safe to call
// repeatedly; createBattleScene picks up whatever has finished (or is still in flight).
export function prewarmBattle(engine, { theme = 'scifi' } = {}) {
  try { return prewarmArena(engine, themeFor(theme)); } catch (e) { console.warn('[battle] prewarm failed', e); return Promise.resolve(); }
}

export function createBattleScene(engine, opts = {}) {
  const {
    playerSquad = { units: [] }, enemyWaves = [], seed = 1,
    auto: autoInit = true, speed: speedInit = 1, bars = true,
  } = opts;
  const audio = opts.audio || { sfx() {} };
  // theme id: opts.theme, or opts.arena when it is a string (D21: 'scifi' now, 'fantasy' later); unknown -> scifi
  // battle-6: ui passes theme = level.realm || map.realm ('scifi' | 'fantasy'); arena.js also maps map themes ('forest') and
  // `opts.realm`. With nothing given, a wave made mostly of realm:'fantasy' units picks the fantasy arena.
  const themeId = (typeof opts.theme === 'string' && opts.theme) || (typeof opts.arena === 'string' && opts.arena) || opts.arena?.theme
    || opts.realm || realmFromWaves(enemyWaves, opts.data) || 'scifi';
  const tier = engine.quality;
  // BATTLE-L: lane profile from the aspect at creation (resize() flips it later); the board furniture is built on it
  const pinnedProfile = LANE_PROFILES[opts.laneProfile] ? opts.laneProfile : null;
  let laneProfile = pinnedProfile || ((engine.size?.w || 1) / (engine.size?.h || 1) >= 1 ? 'wide' : 'tall');
  applyLaneProfile(laneProfile);
  const scene = new THREE.Scene();
  const arena = buildArena(engine, { theme: themeId, seed: 7 });
  scene.environment = arena.theme.environment || engine.env;
  scene.environmentIntensity = arena.theme.envIntensity ?? 0.6; // the neon env is very blue; units should keep their paint colours
  scene.add(arena.group);
  if (arena.theme.fog) scene.fog = arena.theme.fog;
  arena.theme.setWide?.(laneProfile === 'wide');
  const rig = createBattleCamera({ nearRim: arena.theme.nearRim, ...(arena.theme.frameWide || {}), ...(opts.frame || {}), backdrop: arena.theme.backdrop });
  if (opts.margins) rig.setMargins(opts.margins);
  const camera = rig.camera;
  // battle-10: the Overdrive push keeps every unit's idle top (+10% for wings / raised arms) under the top HUD margin
  const guardPts = [];
  rig.setPushGuard?.(() => {
    let n = 0;
    for (const a of U.values()) {
      if (!a.alive || a.removed || !a.deployed || !a.foot) continue;
      const f = a.foot, S = a.scale, r = a.unit.root.position, y = arena.plateH + f.y1 * S * 1.1;
      for (const x of [f.x0, f.x1]) (guardPts[n++] ||= new THREE.Vector3()).set(r.x + x * S, y, r.z + f.z0 * S);
    }
    guardPts.length = n;
    return guardPts;
  });
  const vfx = createVFX(scene, tier);
  const fx = createEffects(vfx, {
    shake: (a) => rig.shake(a),
    push: (k, to, dur = 1) => { odPush = Math.max(odPush, Math.min(1, dur)); odK = k; if (to) odTarget.copy(to); },
    slowmo: (sc, dur) => { slow = sc; slowT = dur; },
    flash: (c, a) => flashPulse(c, a),
    lean: (id, x, z, dur) => { const a = U.get(id); if (a) a.lean2 = { x: +x || 0, z: +z || 0, t: 0, dur: Math.max(0, +dur || 0) }; },
    dim: (k, dur) => { dimFx = { k: Math.max(0, Math.min(1, +k || 0)), t: 0, dur: Math.max(0, +dur || 0) }; },
  });
  let dimFx = null;
  const container = opts.overlay || engine.canvas.parentElement || document.body;
  const overlay = createOverlay(container, camera, { bars });
  overlay.setSpeed(speedInit); overlay.setTop(opts.margins?.top ?? 64); overlay.setBottom(opts.margins?.bottom ?? 0);
  // battle-9 (QL6): live unit rects for the OD callout's placement (cheap fastBox projection, only when a callout fires)
  overlay.obstacles = () => {
    const el = engine.renderer.domElement, W = el.clientWidth, H = el.clientHeight, out = [], bb = new THREE.Box3(), c = new THREE.Vector3();
    for (const a of U.values()) {
      if (!a.alive || !a.unit.root.visible) continue;
      fastBox(a.unit.root, bb); if (bb.isEmpty()) continue;
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(camera);
        const sx = (c.x * 0.5 + 0.5) * W, sy = (0.5 - c.y * 0.5) * H;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      out.push([x0, y0, x1, y1]);
    }
    return out;
  };
  if (opts.margins) overlay.setFrame(opts.margins);

  // D26 intro: the camera flies in from a wide backdrop view; no sim ticks (and no queued events) until it ends, the squad drop-ins
  // overlap its last INTRO_OVERLAP s. opts.intro: true = start it now (camera parked at the start pose until ready); or playIntro().
  const INTRO_OVERLAP = 0.5;
  const intro = { on: false, t: 0, dur: 3, s: 1, speed: 1, done: null, resolve: null };
  function playIntro({ strength } = {}) {
    if (intro.on) return intro.done;
    const wide = (engine.size?.w || 1) / (engine.size?.h || 1) >= 1;
    intro.on = true; intro.t = 0; intro.speed = 1; intro.deadline = 0;
    intro.s = Math.max(0, Math.min(1, strength ?? (wide ? 1 : 0.6)));
    intro.dur = 2.6 + 0.8 * intro.s;
    rig.setIntro(0, intro.s); arena.theme.setIntro?.(true);
    intro.done = new Promise((r) => { intro.resolve = r; });
    return intro.done;
  }
  function endIntro() {
    if (!intro.on) return;
    intro.on = false; intro.t = intro.dur; rig.setIntro(1); arena.theme.setIntro?.(false);
    const r = intro.resolve; intro.resolve = null; r?.();
    stateDirty = true;
  }
  function tickIntro(dtReal) {
    if (!intro.on) return;
    if (sim && !paused) intro.t += dtReal * intro.speed; // parked at the start pose until the units are loaded
    rig.setIntro(intro.t / intro.dur, intro.s);
    if (intro.t >= intro.dur || (intro.deadline && performance.now() >= intro.deadline)) endIntro();
  }
  if (opts.intro) playIntro(typeof opts.intro === 'object' ? opts.intro : {});

  const listeners = { state: new Set(), end: new Set(), event: new Set() };
  const emit = (k, v) => { for (const f of listeners[k]) { try { f(v); } catch (e) { console.error(e); } } };
  const U = new Map(); // sim id -> actor record
  const spawnT = []; // battle-10: per-unit build times (debug, api._spawnT)
  let sim = null, data = null, mod = null, started = false, ended = false;
  let paused = false, forfeited = false, odSrc = null, disposed = false;
  const procSeen = new Set();
  let simT = 0, speed = speedInit, slow = 1, slowT = 0, odPush = 0, odK = 0.6, odTarget = new THREE.Vector3(), stateDirty = true, stateAcc = 0;
  const queue = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const leanQ = new THREE.Quaternion(), leanE = new THREE.Euler();

  // battle-10: no frames (the engine shows a clear) until the arena's programs are compiled (async), its sliced textures have landed and
  // wave 1 is built, compiled and warmed (api.ready); then the first visible frame has nothing left to compile or upload.
  // HOLD_MAX is a safety net: show whatever there is by then.
  const compileRT = new THREE.WebGLRenderTarget(1, 1);
  let hold = opts.hold !== false;
  const holdT0 = performance.now();
  const arenaReady = (async () => {
    await nextFrame(); // not inside the creating task (that one already carries the arena build)
    if (arena.ready) await Promise.race([arena.ready, new Promise((r) => setTimeout(r, 3000))]).catch(() => {});
    await precompile([]);
  })();
  const api = {
    scene, camera, backdropCamera: rig.bgCamera, arena, rig, vfx, fx, overlay, units: U,
    look: arena.theme.look,
    get state() { return sim ? { ...sim.state, speed, auto: sim.state.auto, started, ended, paused, done: sim.state.done || ended,
      overtime: !!sim.state.overtime, overtimeMult: sim.state.overtimeMult || 1 } : null; },
    get sim() { return sim; },
    ready: null,
    on(k, fn) { listeners[k]?.add(fn); return () => listeners[k]?.delete(fn); },
    start() { api.ready.then(() => { started = true; stateDirty = true; audio.sfx('ambience', { theme: arena.theme.id }); }); return api.ready; },
    // paused: sim, anims and VFX freeze; the engine keeps rendering (idle camera breathing continues)
    setPaused(b) { paused = !!b; stateDirty = true; },
    get paused() { return paused; },
    // per-unit draw-call budget: the kit's unit.drawCalls plus meshes a model adds itself (unit.extraDrawCalls, e.g. PHASE ghosts)
    unitStats() {
      let units = 0, calls = 0, extra = 0, tris = 0;
      for (const a of U.values()) {
        if (a.removed || !a.unit.root.visible) continue;
        const x = +(typeof a.unit.extraDrawCalls === 'function' ? a.unit.extraDrawCalls() : a.unit.extraDrawCalls) || 0;
        units++; extra += x; calls += (a.unit.drawCalls || 0) + x; tris += a.unit.tris || 0;
      }
      return { units, calls, extra, tris };
    },
    get _spawnT() { return spawnT; },
    get holdRender() { return hold && performance.now() - holdT0 < HOLD_MAX; },
    get arenaReady() { return arenaReady; },
    _dbg() { return { paused, speed, slow, slowT, simT, forfeited }; },
    // test helper: each live unit's screen rect in CSS px (projected world bbox) + its HP-bar anchor y
    _bounds() {
      const el = engine.renderer.domElement, W = el.clientWidth, H = el.clientHeight, out = [];
      const bb = new THREE.Box3(), c = new THREE.Vector3();
      for (const a of U.values()) {
        if (!a.unit.root.visible) continue;
        bb.makeEmpty();
        a.unit.root.updateMatrixWorld(true);
        a.unit.root.traverseVisible((o) => { if (o.isMesh && o.layers.isEnabled(0) && o.material?.blending !== THREE.AdditiveBlending) bb.expandByObject(o, true); });
        if (bb.isEmpty()) continue;
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (let i = 0; i < 8; i++) {
          c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(camera);
          const sx = (c.x * 0.5 + 0.5) * W, sy = (0.5 - c.y * 0.5) * H;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
        a.barAnchor.getWorldPosition(c).project(camera);
        out.push({ id: a.id, def: a.v.def, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1), hPct: +((y1 - y0) / H * 100).toFixed(1), bar: Math.round((0.5 - c.y * 0.5) * H) });
      }
      return out;
    },
    // give up: ends as a defeat (reason 'forfeit'); uses sim.forfeit() when the sim provides it
    forfeit() {
      if (!sim || ended) return false;
      if (typeof sim.forfeit === 'function') { for (const e of sim.forfeit() || []) queue.push(e); if (!queue.length) for (const e of sim.events.slice(-1)) if (e.type === 'end') queue.push(e); }
      else {
        const st = sim.state, pl = st.player.units;
        const result = { win: false, reason: 'forfeit', stars: 0, seed, ticks: sim.t, time: sim.t / TPS, waves: st.waves, wavesCleared: st.wave - 1,
          integrity: st.player.integrity, enemyIntegrity: st.enemy.integrity, survivors: pl.filter((u) => u.alive).map((u) => u.id),
          lost: pl.filter((u) => !u.alive).map((u) => u.id), playerHp: Object.fromEntries(pl.map((u) => [u.id, u.hp])),
          uids: Object.fromEntries(pl.map((u) => [u.id, u.uid ?? null])), stats: {}, mvp: null, inputs: (sim.inputs || []).slice(), auto: st.auto };
        forfeited = true;
        queue.push({ t: sim.t, type: 'end', win: false, reason: 'forfeit', stars: 0, result });
      }
      paused = false;
      return true;
    },
    setSpeed(s) { speed = [1, 2, 4, 8].includes(+s) ? +s : 1; overlay.setSpeed(speed); stateDirty = true; },
    setAuto(b) { sim?.setAuto(!!b); stateDirty = true; },
    fireOverdrive(slot) {
      if (!sim) return false;
      const id = typeof slot === 'number' ? 'p' + slot : slot;
      const ok = sim.fireOverdrive(id);
      stateDirty = true;
      return ok;
    },
    resize(w, h) {
      const want = pinnedProfile || (w / h >= 1 ? 'wide' : 'tall');
      if (want !== laneProfile) setLaneProfile(want, { animate: true }); // before the camera refit: fitWide frames the active profile
      rig.resize(w, h); overlay.resize(); placePlate();
    },
    setMargins(m) { rig.setMargins(m); overlay.setTop(m?.top ?? 64); overlay.setBottom(m?.bottom ?? 0); overlay.setFrame(m || {}); placePlate(); },
    // 'tall' (portrait lanes) | 'wide' (closer lanes on landscape). animate: idle actors glide home over 0.35 s; busy ones
    // (attack, Overdrive, lunge, deploy) wait for their anim to end, at most 1.5 s. Pins the profile only when opts.laneProfile did.
    setLaneProfile(name, o = {}) { setLaneProfile(name, o); },
    get laneProfile() { return laneProfile; },
    // D26: playIntro({strength 0..1}) -> Promise (resolves when the camera has landed); skipIntro() eases out in 0.25 s
    playIntro, get introActive() { return intro.on; },
    skipIntro() { if (intro.on) { const left = Math.max(0, intro.dur - intro.t); intro.speed = Math.max(1, left / 0.25); intro.deadline = performance.now() + 300; } return intro.done || Promise.resolve(); },
    preRender() { if (arena.reflection.enabled) arena.reflection.update(scene, camera); },
    pick(x, y) {
      const rc = new THREE.Raycaster(); rc.layers.enableAll();
      rc.setFromCamera(new THREE.Vector2(x, y), camera);
      let best = null, bd = 1e9;
      for (const [id, a] of U) {
        if (!a.alive) continue;
        const d = rc.ray.distanceSqToPoint(tmpA.set(a.x, a.h * 0.5, a.z));
        if (d < 1.4 && d < bd) { bd = d; best = { id, side: a.side, slot: a.slot }; }
      }
      return best;
    },
    update(dt, t) { tick(dt, t); },
    dispose() {
      disposed = true;
      for (const a of U.values()) { disposeStealth(a.unit); a.unit.dispose?.(); }
      for (const P of PRE.values()) discard(P.a);
      U.clear(); PRE.clear(); compileRT.dispose();
      audio.sfx('ambience', { theme: null });
      arena.dispose(); overlay.dispose(); engine.post.tint?.(1, 1, 1, 0); engine.post.dim?.(0);
      scene.traverse((o) => { if (o.isMesh && o.material?.isShaderMaterial) { o.geometry.dispose(); o.material.dispose(); } });
    },
  };

  api.ready = (async () => {
    [data, mod] = await Promise.all([opts.data ? Promise.resolve(opts.data) : loadData(), unitsModule()]);
    sim = createBattle({ data, player: playerSquad, enemyWaves, seed, auto: autoInit, inputs: opts.inputs, goals: opts.goals });
    // player units exist from the start; deploy them before the first wave arrives. BATTLE-L: wave 1 is built now too (same deploy
    // delays as the wave handler, which then finds them spawned). battle-10: one frame's budget at a time, not one long task
    const first = [];
    sim.state.player.units.forEach((v, i) => first.push([v, 0.1 + i * 0.11]));
    for (const e of sim.events) if (e.type === 'wave' && e.phase === 'start') (e.units || []).forEach((id, i) => { const v = sim.state.units[id]; if (v) first.push([v, 0.2 + i * 0.11]); });
    await runSliced((function* () { for (const [v, d] of first) { if (disposed) return; yield* spawnSteps(v, d); } })());
    if (disposed) return api;
    for (const e of sim.events) queue.push(e); // events emitted while the sim was created (wave 1 start)
    refitWide();
    stateDirty = true;
    // the units are hidden until their drop-in, so their shaders compiled on that frame (a ~400 ms hitch on M5). Compile them now
    // (compile() gathers the visible scene synchronously, so the roots are only shown for the duration of that call)
    await precompile([...U.values()].map((a) => a.unit.root));
    await arenaReady;
    if (!disposed) await warmRender();
    hold = false;
    prebuildWaves();
    return api;
  })();

  // hidden units compile their shaders on their first visible frame (a ~400 ms hitch on M5): compile them ahead. compileAsync gathers
  // the scene synchronously, so the roots are only shown for the duration of that call
  // battle-10: one offscreen render of the whole board with every unit shown, before the first visible frame: compiles the shadow-depth
  // and mirror variants (compile() only builds each material's main program) and uploads every geometry and texture
  async function warmRender() {
    const R = engine.renderer, roots = [...U.values()].map((a) => a.unit.root), vis = roots.map((r) => r.visible);
    const prevRT = R.getRenderTarget();
    try {
      roots.forEach((r) => { r.visible = true; });
      if (arena.reflection?.enabled) arena.reflection.update(scene, camera);
      R.setRenderTarget(compileRT);
      R.render(scene, camera);
    } catch (e) { console.warn('[battle] warm render failed', e); }
    finally { R.setRenderTarget(prevRT); roots.forEach((r, i) => { r.visible = vis[i]; }); }
    await nextFrame();
  }
  // battle-10: compile against a render target: the post chain draws the scene into one (linear output, no tone mapping), so a
  // canvas-target compile built the wrong variants and every real program still compiled synchronously on the first frames
  async function precompile(roots) {
    try {
      const R = engine.renderer, vis = roots.map((r) => r.visible), prevRT = R.getRenderTarget();
      roots.forEach((r) => { r.visible = true; });
      R.setRenderTarget(compileRT);
      let p;
      try { p = R.compileAsync ? R.compileAsync(scene, camera) : (R.compile(scene, camera), null); } finally { R.setRenderTarget(prevRT); }
      roots.forEach((r, i) => { r.visible = vis[i]; });
      if (p) await Promise.race([p, new Promise((r) => setTimeout(r, 1500))]);
    } catch (e) { console.warn('[battle] precompile failed', e); }
  }
  // ---------- actors ----------
  function modelFor(v) {
    const M = mod.MODELS || {};
    if (!Object.keys(M).length || M[v.model]) return v.model;
    if (M[v.def]) return v.def;
    const byRole = Object.keys(M).filter((k) => M[k].role === v.role && (M[k].faction === v.faction || true));
    const exact = byRole.find((k) => M[k].faction === v.faction);
    return exact || byRole[0] || Object.keys(M)[0];
  }
  // battle-10: later waves are built ahead (prebuildWaves, during wave 1) from the predicted sim view; the wave handler adopts them
  const PRE = new Map(); // predicted sim id -> { a, sig, prof }
  const preSig = (v) => [v.def, v.slotIndex, v.model, v.rarity, v.faction, v.rank ?? 0].join('|');
  // battle-10: spawnSteps is a generator so a unit's build can be spread over frames (runSliced); spawn() runs it in one go
  function spawn(v, delay = 0, pre = false) { return runAll(spawnSteps(v, delay, pre)); }
  function* spawnSteps(v, delay = 0, pre = false) {
    if (U.has(v.id)) return U.get(v.id);
    if (!pre && PRE.has(v.id)) {
      const P = PRE.get(v.id); PRE.delete(v.id);
      if (P.sig === preSig(v) && P.prof === laneProfile) return adopt(P.a, v, delay);
      discard(P.a);
    }
    const _t0 = performance.now();
    const isBoss = String(v.def || '').startsWith('boss_');
    const uo = { model: modelFor(v), rarity: v.rarity, faction: v.faction, role: v.role, rank: isBoss ? 5 : v.rank, boss: isBoss, unitId: v.def, seed: hash(v.id), quality: tier.name };   // robots kit round 4: boss + unitId
    let unit;
    try { unit = mod.createUnit(uo); } catch (err) {
      // a broken model must never stop the fight: fall back to the placeholder for this unit
      console.warn('[battle] createUnit failed for ' + uo.model + ', using placeholder', err);
      unit = placeholder.createUnit(uo);
    }
    const _t1 = performance.now();
    yield;
    const p = slotPos(v.side, v.slotIndex);
    const hRaw = unit.height || 2;
    const def = data.units?.[v.def] || data.enemies?.[v.def] || {};
    // D23: one uniform scale so roster size classes survive; bosses carry a scale hint, capped (battle-5: DREADNOUGHT's 1.9 crossed the line)
    let s = BOARD.unitScale * Math.min(BOSS_SCALE_MAX, def.scale || 1);
    // battle-7: a theme may enlarge its own realm's units (fantasy creatures are naturally small next to mechs); opts.themeUnitK overrides its factor (tests)
    const tk = themeK(def, laneProfile);
    s *= tk;
    unit.root.scale.setScalar(s);
    unit.root.position.set(p.x, arena.plateH, p.z);
    // 3/4 view: idle facing turns ~0.45 rad toward the camera (+z) from straight across the centre line
    // battle-7: long quadrupeds (wolves) turn further toward the camera (~0.85 rad, like the ref's wolves): reads better and keeps their
    // length off the side-button rail, which the wolves reached at the 0.45 turn
    const quad = def.body === 'quadruped';
    if (quad && p.col === 1) { p.x -= Math.sign(p.x) * 0.35; unit.root.position.x = p.x; } // hindquarters + tail hang outward toward the rail
    let yaw = (v.side === 'enemy' ? -1 : 1) * (Math.PI / 2 - (quad ? 0.85 : 0.45));
    unit.setFacing(yaw);
    if (p.col === 1 && !quad) {
      // back row with a long barrel (MERIDIAN): the 3/4 turn swings the barrel toward the camera, into the front unit of its lane.
      // Turn those less so the barrel runs across the board instead.
      const bb = unitBox(unit.root), reach = v.side === 'enemy' ? p.x - bb.min.x : bb.max.x - p.x;
      if (reach > 2.6 * s / BOARD.unitScale) { yaw = v.side === 'enemy' ? -Math.PI / 2 + 0.18 : Math.PI / 2 - 0.18; unit.setFacing(yaw); }
      yield;
    }
    if (unit.mirrorSide && unit.mirrorSide === v.side) unit.setMirror?.(true); // e.g. WARDEN: buckler arm toward the camera
    // big bosses always get a fitted footprint; any other unit only when its idle pose reaches over the centre line (CITADEL, JUGGERNAUT)
    if (p.col === 0 || def.boss) ({ s, x: p.x } = yield* fitBossFootprint(unit, p, v.side, s, !((def.scale || 1) > 1 || def.boss)));
    // battle-6: front-liners / bosses whose overdrive anim reaches over the centre line (REDLINE's whirlwind) step back for it
    const odFit = p.col === 0 || def.boss ? yield* overdriveReach(unit, p, v.side) : null;
    // battle-6: hovering models (MERIDIAN floats ~1 m up) left their plate looking empty: a contact shadow + faint lift beam ties them to it
    let hoverPad = null;
    { const hb = unitBox(unit.root); const lift = hb.isEmpty() ? 0 : hb.min.y - arena.plateH;
      if (lift > 0.45) { hoverPad = makeHoverPad(lift, Math.max(0.55, Math.min(1.1, (unit.radius || 0.6) * s * 0.75)), plateColor(v.faction, v.rarity)); hoverPad.position.set(p.x, arena.plateH + 0.012, p.z); hoverPad.visible = false; scene.add(hoverPad); } }
    yield;
    if (p.lane === 0) {
      // near lane: a wide model (tarantula legs, scaled bosses) must not hang over the near floor edge; nudge it back
      unit.root.updateMatrixWorld(true);
      const over = new THREE.Box3().setFromObject(unit.root).max.z - (BOARD.zNear - 0.3);
      if (over > 0) { p.z -= Math.min(1.5, over); unit.root.position.z = p.z; }
    }
    // battle-9 (QL5): idle footprint on the floor relative to the root, per unit of scale (wide-profile spacing, fitWide)
    let foot = null;
    { const fb = fastBox(unit.root, new THREE.Box3());
      if (!fb.isEmpty()) foot = { x0: (fb.min.x - p.x) / s, x1: (fb.max.x - p.x) / s, z0: (fb.min.z - p.z) / s, z1: (fb.max.z - p.z) / s, y1: (fb.max.y - arena.plateH) / s }; }
    // robots' single-draw skinned proxy renders the mirror + shadow passes (257 -> ~125 calls); else the full mesh does
    let proxy = null;
    if (typeof unit.useProxy === 'function' && !qsNoProxy) proxy = unit.useProxy(MIRROR_ONLY_LAYER);
    else unit.root.traverse((o) => { if (o.isMesh) { o.layers.enable(REFLECT_LAYER); o.castShadow = true; } });
    yield;
    primeSkinnedBounds(unit.root);
    yield;
    unit.root.visible = false;
    scene.add(unit.root);
    const barAnchor = new THREE.Object3D();
    barAnchor.position.set(0, hRaw * 1.08 + 0.15 / s, 0);
    unit.root.add(barAnchor);
    const color = plateColor(v.faction, v.rarity);
    const a = { id: v.id, v, unit, side: v.side, slot: v.slotIndex, x: p.x, z: p.z, h: hRaw * s, scale: s, yaw, yaw0: yaw,
      color: FCOL[v.rarity === 'legendary' ? 'legendary' : v.faction] || PAL.cyan, plate: color, alive: true, pending: [],
      proxy, deployT: -delay, deployed: false, lunge: null, sink: 0, removed: false, barAnchor, busy: 0,
      place: Math.abs(p.x) !== BOARD.colX[p.col] || s > BOARD.unitScale ? Math.max(1, Math.min(1.45, s / BOARD.unitScale)) : 0,
      ufx: unitFx([v.def, v.model]), noDrop: !!(unit.def?.noDrop || unit.noDrop), odFit, hoverPad,
      def, tk, wk: 1, foot, homeDz: p.z - slotPos(v.side, v.slotIndex).z };
    // robots' built-in bubble (setShield / M.aura) is replaced by the pooled fresnel bubble (js/fx/vfx.js), one draw for all
    const auraK = unit.def?.aura || 0;
    unit.setShield?.(0);
    if (auraK) a.aura = { k: Math.min(0.6, auraK * 0.7), color: new THREE.Color(unit.def.auraColor ?? unit.palette?.glow ?? 0xb05cff).multiplyScalar(2.2) };
    a.shieldK = 0;
    unit.onEvent((type, info) => onUnitEvent(a, type, info));
    spawnT.push({ id: v.id, model: uo.model, pre, create: +(_t1 - _t0).toFixed(1), total: +(performance.now() - _t0).toFixed(1) });
    if (pre) {
      // the wave arrived while this was still building (the handler built its own): drop it
      if (U.has(v.id) || disposed) { discard(a); return U.get(v.id) || null; }
      PRE.set(v.id, { a, sig: preSig(v), prof: laneProfile }); return a;
    }
    return adopt(a, v, delay);
  }
  function adopt(a, v, delay) {
    a.v = v; a.deployT = -delay;
    const color = a.plate;
    U.set(v.id, a);
    overlay.addBar(v.id, { role: v.role, color: '#' + new THREE.Color(color).getHexString(), side: v.side });
    overlay.barAnchor(v.id, a.barAnchor);
    overlay.setBar(v.id, v.hpPct ?? 1, 0);
    overlay.showBar(v.id, false);
    return a;
  }
  function discard(a) {
    scene.remove(a.unit.root); if (a.hoverPad) scene.remove(a.hoverPad);
    disposeStealth(a.unit); a.unit.dispose?.();
  }
  // predicted views of waves 2.. (the sim builds them only at the wave start): same slotting (autoSlots) and ids as js/sim/battle.js
  function predictWaves() {
    const out = [];
    enemyWaves.forEach((sq, w) => {
      if (w === 0) return;
      const units = Array.isArray(sq) ? sq : sq?.units || [];
      let list; try { list = autoSlots(data, units); } catch { return; }
      for (const inst of list) {
        const def = lookupUnit(data, inst.def); if (!def) continue;
        const si = inst.slot.col * 3 + inst.slot.lane;
        out.push({ id: `e${w + 1}_${si}`, side: 'enemy', wave: w + 1, def: def.id, name: def.name, role: def.role, faction: def.faction,
          rarity: def.rarity, model: def.model, level: inst.level || 1, rank: inst.rank ?? 0, slot: { ...inst.slot }, slotIndex: si, hpPct: 1 });
      }
    });
    return out;
  }
  // one unit per idle slot (requestIdleCallback when there is one), so the build never lands in a frame as a long task
  let preQ = null;
  function prebuildWaves() {
    if (preQ || opts.prebuild === false) return;
    try { preQ = predictWaves(); } catch (e) { console.warn('[battle] wave prebuild skipped', e); preQ = []; return; }
    runSliced((function* () {
      for (const v of preQ) {
        while (intro.on && !disposed) yield WAIT;
        if (disposed) return;
        if (!U.has(v.id) && !PRE.has(v.id) && sim && sim.state.wave < v.wave) {
          try { yield* spawnSteps(v, 0, true); } catch (e) { console.warn('[battle] prebuild failed for ' + v.id, e); }
        }
      }
    })(), { idle: true, budget: 8 }).then(() => { if (!disposed) return precompile([...PRE.values()].map((P) => P.a.unit.root)); });
  }
  // ---------- lane profiles (BATTLE-L) ----------
  // theme realm scale per profile: the wide board has horizontal room, so the fantasy theme may use a bigger factor there (wideUnitK)
  function themeK(def, prof) {
    const k = opts.themeUnitK ?? (prof === 'wide' ? arena.theme.wideUnitK : undefined);
    return arena.theme.unitScale?.(def, k) ?? 1;
  }
  function setLaneProfile(name, { animate = true } = {}) {
    if (!LANE_PROFILES[name] || name === laneProfile) return laneProfile;
    laneProfile = name;
    applyLaneProfile(name);
    arena.theme.setWide?.(name === 'wide');
    for (let i = 0; i < 6; i++) for (const side of ['player', 'enemy']) { const p = slotPos(side, i); arena.setHome(side, i, p.x, p.z); }
    const wk = wideFit(name);
    for (const a of U.values()) {
      const z1 = slotPos(a.side, a.slot).z + a.homeDz;
      const tk = themeK(a.def, name), w1 = wk.get(a) ?? 1, s1 = a.scale * (tk / a.tk) * (w1 / a.wk);
      a.tk = tk; a.wk = w1;
      if (a.removed || !a.deployed || !animate) {
        a.z = z1; a.scale = s1; a.h = (a.unit.height || 2) * s1;
        a.unit.root.scale.setScalar(s1); a.unit.root.position.z = z1; a.rehome = null;
        if (a.hoverPad) a.hoverPad.position.z = z1;
        if (a.armed && !a.removed) placeSlot(a);
        continue;
      }
      a.rehome = { z0: a.z, z1, s0: a.scale, s1, t: 0, wait: 0 };
      placeSlot(a);
    }
    rig.refit?.(); placePlate();
    return laneProfile;
  }
  // battle-9 (QL5): the wide profile packs lanes 2 lattice rows apart (portrait 3), so XL units and bosses (KINGPIN behind PALADIN,
  // JUGGERNAUT beside them, VECTOR PRIME over three slots) merged into one mass. Size class caps (WIDE_XL / WIDE_L / WIDE_BOSS), then
  // footprint-aware spacing: per side, while two units'
  // floor footprints (idle boxes at their wide homes) overlap by more than WIDE_OVERLAP of the smaller one, the bigger unit shrinks 5%
  // (down to WIDE_MIN of its size). Regular squads sit under the threshold and keep their size. Returns Map(actor -> factor).
  function wideFit(prof = laneProfile) {
    const out = new Map();
    if (prof !== 'wide') return out;
    for (const side of ['player', 'enemy']) {
      const L = [...U.values()].filter((a) => a.side === side && a.alive && !a.removed && a.foot);
      const R = L.map((a) => {
        const base = a.scale / a.wk * themeK(a.def, prof) / a.tk, z = slotPos(a.side, a.slot).z + a.homeDz, f = a.foot;
        const cls = a.def.visual?.size, boss = (a.def.scale || 1) > 1 || !!a.def.boss;
        return { a, base, k: 1, x: a.x, z, f, cls: boss ? 'boss' : cls, sc: a.def.scale || 1 };
      });
      // size class first: XL hulls and bosses always come down in wide; an L unit only when an XL or boss neighbour shares its corner
      for (const r of R) {
        const bigNb = R.some((o) => o !== r && (o.cls === 'XL' || o.cls === 'boss') && Math.abs(o.z - r.z) < 5.4);
        r.k = r.cls === 'boss' ? Math.min(1, (qsNum('wideBoss') ?? WIDE_BOSS) / Math.min(BOSS_SCALE_MAX, r.sc)) : r.cls === 'XL' ? WIDE_XL * (bigNb ? WIDE_L : 1) : r.cls === 'L' && bigNb ? WIDE_L : 1;
      }
      // battle-10: a unit standing right in front of a boss (nearer lane, same column) hid its lower half (m8_l15: LEVIATHAN in front
      // of VECTOR PRIME): it comes down a further step so the boss reads as the centrepiece
      for (const r of R) {
        if (r.cls === 'boss') continue;
        if (R.some((o) => o.cls === 'boss' && r.z > o.z && r.z - o.z < 5.4 && Math.abs(o.x - r.x) < 1.0)) r.k *= qsNum('wideFront') ?? WIDE_FRONT;
      }
      const rect = (r) => { const S = r.base * r.k; return [r.x + r.f.x0 * S, r.x + r.f.x1 * S, r.z + r.f.z0 * S, r.z + r.f.z1 * S]; };
      for (let it = 0; it < 40; it++) {
        let worst = null, wv = WIDE_OVERLAP;
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) {
          const A = rect(R[i]), B = rect(R[j]);
          const ox = Math.min(A[1], B[1]) - Math.max(A[0], B[0]), oz = Math.min(A[3], B[3]) - Math.max(A[2], B[2]);
          if (ox <= 0 || oz <= 0) continue;
          const aA = (A[1] - A[0]) * (A[3] - A[2]), aB = (B[1] - B[0]) * (B[3] - B[2]), v = ox * oz / Math.min(aA, aB);
          if (v > wv) { wv = v; worst = aA >= aB ? R[i] : R[j]; if (worst.k <= WIDE_MIN) worst = worst === R[i] ? R[j] : R[i]; }
        }
        if (!worst || worst.k <= WIDE_MIN) break;
        worst.k = Math.max(WIDE_MIN, worst.k * 0.95);
      }
      for (const r of R) out.set(r.a, r.k);
    }
    return out;
  }
  // after a batch of spawns (a new wave) or a death-free refit: apply wideFit's factors (undeployed units at once, others tween)
  function refitWide() {
    if (laneProfile !== 'wide') return;
    const wk = wideFit();
    for (const [a, w1] of wk) {
      if (Math.abs(w1 - a.wk) < 1e-3) continue;
      const s1 = a.scale * w1 / a.wk; a.wk = w1;
      if (!a.deployed || a.removed) { a.scale = s1; a.h = (a.unit.height || 2) * s1; a.unit.root.scale.setScalar(s1); if (a.armed) placeSlot(a); else a.place = placeK(a); continue; }
      a.rehome = { z0: a.z, z1: a.rehome?.z1 ?? a.z, s0: a.scale, s1, t: 0, wait: 0 };
      placeSlot(a);
    }
  }
  api._wideFit = () => [...wideFit()].map(([a, k]) => [a.id, a.v.def, +k.toFixed(3)]);
  function placeK(a) { return Math.abs(a.x) !== BOARD.colX[a.slot >= 3 ? 1 : 0] || a.scale > BOARD.unitScale + 1e-6 ? Math.max(1, Math.min(1.45, a.scale / BOARD.unitScale)) : 0; }
  function placeSlot(a) {
    const k = placeK(a) || a.place;
    if (k || a.rehome) arena.setPlace(a.side, a.slot, a.x, a.z, k || 1);
    a.place = k;
  }
  function tickRehome(a, dt) {
    const R = a.rehome;
    const busy = a.lunge || a.odShift || a.sink > 0 || a.busy > 0;
    if (busy && R.wait < 1.5 && a.alive) { R.wait += dt; return; }
    R.t += dt;
    const k0 = Math.min(1, R.t / 0.35), k = k0 * k0 * (3 - 2 * k0);
    a.z = R.z0 + (R.z1 - R.z0) * k; a.scale = R.s0 + (R.s1 - R.s0) * k;
    a.unit.root.scale.setScalar(a.scale); a.h = (a.unit.height || 2) * a.scale;
    if (!a.lunge) a.unit.root.position.z = a.z;
    if (!a.removed) placeSlot(a);
    if (k0 >= 1) a.rehome = null;
  }
  // shield bubble: k = sim shield fraction (0..1); a permanent aura (robots' M.aura) keeps a fainter one up
  function setBubble(a, k, flare = false) {
    a.shieldK = k;
    const auraOn = a.aura && !a.auraOff && a.alive && a.deployed !== false;
    const alpha = k > 0.01 ? 0.35 + 0.3 * k : auraOn ? a.aura.k * 0.7 : 0;
    if (alpha <= 0) { if (a.bub) { a.bub.kill(); a.bub = null; } return; }
    const col = k > 0.01 ? PAL.cyan : a.aura.color;
    if (!a.bub || a.bub.dead) {
      const r = Math.max(a.h * 0.36, (a.unit.radius || 0.6) * a.scale * 1.25);
      a.bub = fx.shieldBubble({ follow: a.unit.root, offsetY: a.h * 0.5, radius: r, color: col, life: Infinity, alpha });
      a.bub.sy = Math.max(1, Math.min(1.6, (a.h * 0.62) / r));
    }
    a.bub.c = col; a.bub.alpha = alpha;
    // battle-6: under focus fire every absorbed hit flared the whole shell (lattice ripple + fill) and the unit underneath read
    // pale / see-through (PALADIN's Oath of Steel shield arrives with its overclock). At most ~3 flares a second, softer after the first.
    if (flare) { const t = performance.now(); const gap = t - (a.bubFlareT || 0); if (gap > 330) { a.bub.flare(gap > 1500 ? 1 : 0.55); a.bubFlareT = t; } }
  }
  function world(a, socket = 'core', out = new THREE.Vector3()) {
    const s = a.unit.sockets?.[socket] || a.unit.sockets?.core;
    if (s && a.unit.root.visible) { if (a.mwFrame !== frameNo) { a.unit.root.updateMatrixWorld(true); a.mwFrame = frameNo; } s.getWorldPosition(out); }
    else out.set(a.x, arena.plateH + a.h * 0.55, a.z);
    return out;
  }
  function view(a) {
    if (!a) return null;
    return { id: a.id, side: a.side, slot: a.slot, role: a.v.role, faction: a.v.faction, rarity: a.v.rarity, name: a.v.name,
      unit: a.unit, root: a.unit.root, sockets: a.unit.sockets || {}, color: a.color, x: a.x, z: a.z, alive: a.alive, height: a.h,
      pos: (socket = 'core') => world(a, socket, new THREE.Vector3()) };
  }
  function makeCtx(kind, a, e, targets, extra = {}) {
    const ab = data.abilities?.[e?.ability];
    const tv = targets.filter(Boolean).map(view);
    return { kind, fx, THREE, event: e, ability: ab, src: view(a), target: tv[0] || null, targets: tv,
      timing: { now: simT / TPS, travel: e?.impactT != null ? Math.max(0.05, (e.impactT - simT) / TPS) : 0,
        windup: e?.fireT != null ? Math.max(0, (e.fireT - e.t) / TPS) : 0, speed },
      palette: { ...PAL, faction: a.color, plate: new THREE.Color(a.plate) }, ...extra };
  }
  // run a unit's signature hook; returns true when the generic effect should be skipped
  function hook(a, name, ctx) {
    const h = a?.ufx?.mod?.[name];
    if (!h) return false;
    try { return h(ctx) !== 'default'; } catch (err) { console.error('[battle] unit fx ' + a.id + '.' + name, err); return false; }
  }
  function face(a, b) {
    if (!b) return;
    const y = Math.atan2(b.x - a.x, b.z - a.z);
    a.yaw = y;
  }

  // ---------- sim event → presentation ----------
  function handle(e) {
    emit('event', e);
    const src = U.get(e.src), dst = U.get(e.dst);
    switch (e.type) {
      case 'wave': {
        if (e.phase === 'start') {
          if (e.of > 1) overlay.banner(`ROUND ${e.wave}/${e.of}`, e.wave === e.of ? 'FINAL ROUND' : 'ENGAGE', { color: '#3fb8ff' });
          else overlay.banner('ENGAGE', 'VECTOR PROTOCOL', { color: '#3fb8ff' });
          audio.sfx('wave_start');
          // sink the previous wave's wrecks, deploy the new one
          for (const a of U.values()) if (a.side === 'enemy' && !a.alive && !a.removed) a.sink = 0.001;
          (e.units || []).forEach((id, i) => { const v = sim.state.units[id]; if (v) spawn(v, 0.2 + i * 0.11); });
          refitWide();
        } else {
          audio.sfx('wave_clear');
          for (const a of U.values()) if (a.side === 'player' && a.alive) a.unit.play('victory', { speed: 1.2 });
        }
        break;
      }
      case 'overtime': {
        overlay.banner('OVERTIME', 'DAMAGE RISING · HEALS HALVED', { color: '#ff3a4a' });
        flashPulse(PAL.red, 0.12); rig.shake(0.2); arena.theme.crowd?.hype(1);
        audio.sfx('overtime');
        break;
      }
      case 'attack': {
        if (!src) break;
        face(src, dst);
        const alt = (hash(e.shot ?? 0) & 1) && src.v.role !== 'mage';
        src.unit.play(src.v.role === 'mage' ? 'cast' : alt ? 'attack_alt' : 'attack', { speed: 1 });
        src.busy = 0.9;
        src.pending.push({ e, launched: false });
        if (e.delivery === 'melee' && dst) src.lunge = { t: 0, dur: Math.max(0.35, (e.impactT - e.t) / TPS + 0.25), tx: dst.x, tz: dst.z };
        break;
      }
      case 'ability': {
        if (!src) break;
        if (e.kind === 'overdrive') overdriveStart(src, e);
        else if (e.trigger !== 'aura') {
          const ab = data.abilities?.[e.ability];
          const k = src.id + ':' + e.ability;
          if (!procSeen.has(k)) { procSeen.add(k); overlay.barNote(src.id, (ab?.name || e.ability).toUpperCase()); }
          fx.buffAura(tmpA.set(src.x, 0, src.z), src.color);
        }
        break;
      }
      case 'hit': {
        if (!dst) break;
        const at = world(dst, 'core', tmpA);
        if (e.dot) {
          overlay.number(at.clone().add(tmpB.set(0, 0.6, 0)), e.amount, 'dot', { key: dst.id });
        } else {
          const col = src ? src.color : PAL.white;
          if (e.absorbed > 0 && e.amount <= 0) {
            fx.shieldHit(at, PAL.cyan); overlay.number(at.clone().add(tmpB.set(0, 0.5, 0)), e.absorbed, 'shield', { key: dst.id, prefix: '◈' });
            audio.sfx('hit', { x: dst.x, absorbed: e.absorbed, amount: 0 });
          }
          else {
            if (!(src && hook(src, 'impact', makeCtx('impact', src, e, [dst], { hit: e })))) fx.impact(at, col, e.crit ? 1.5 : 1);
            if (e.absorbed > 0) fx.shieldHit(at, PAL.cyan);
            overlay.number(at.clone().add(tmpB.set(0, 0.6, 0)), e.amount, e.crit ? 'crit' : e.pierce ? 'pierce' : dst.side === 'player' ? 'edmg' : 'dmg', { adv: e.adv === 'adv', key: dst.id });
          }
          if (simT - (dst.flashT ?? -99) > 3) { dst.flashT = simT; dst.unit.hitFlash?.(e.crit ? 0x806030 : 0x4a5468); }
          if (!e.kill && dst.busy <= 0) dst.unit.play('hit');
          arena.nodePulse(dst.side, dst.slot, e.crit ? 0.8 : 0.4);
          if (e.crit) { rig.shake(0.25); arena.theme.crowd?.hype(0.25); }
          audio.sfx(e.crit ? 'hit_crit' : 'hit', { x: dst.x, melee: !!src && src.v.role !== 'mage' && (e.delivery || data.abilities?.[e.ability]?.delivery?.type) === 'melee', absorbed: e.absorbed || 0, amount: e.amount });
        }
        overlay.setBar(dst.id, e.hp / e.maxHp, (e.shield || 0) / e.maxHp);
        setBubble(dst, Math.min(1, (e.shield || 0) / (e.maxHp * 0.6)), e.absorbed > 0);
        break;
      }
      case 'heal': {
        if (!dst) break;
        // supports' signature heal landing (js/fx/units/<id>.js heal(ctx)); numbers + bars stay generic
        if (!(src && hook(src, 'heal', makeCtx('heal', src, e, [dst], { heal: e })))) {
          fx.heal(tmpA.set(dst.x, 0, dst.z));
          if (src && src !== dst && src.v.role === 'mage') fx.beam(world(src, 'muzzle', tmpA.clone()), world(dst, 'core', tmpB.clone()), PAL.green, 0.3, 0.14);
        }
        overlay.number(world(dst, 'core', tmpA).add(tmpB.set(0, 0.7, 0)), e.amount, 'heal', { key: dst.id, prefix: '+' });
        overlay.setBar(dst.id, e.hp / e.maxHp, (sim.state.units[dst.id]?.shield || 0) / e.maxHp);
        audio.sfx('heal', { x: dst.x, ability: e.ability });
        break;
      }
      case 'shield': {
        if (!dst) break;
        const mx = sim.state.units[dst.id]?.maxHp || 1;
        setBubble(dst, Math.min(1, e.shield / (mx * 0.6)), e.amount > 0);
        overlay.setBar(dst.id, sim.state.units[dst.id]?.hpPct ?? 1, e.shield / mx);
        if (e.broken) {
          if (!(src && hook(src, 'shieldBreak', makeCtx('shieldBreak', src, e, [dst], { shield: e })))) fx.sparks(world(dst, 'core', tmpA), PAL.cyan, 20, 6);
          audio.sfx('shield_break', { x: dst.x });
        } else if (e.amount > 0) {
          if (!(src && hook(src, 'shield', makeCtx('shield', src, e, [dst], { shield: e })))) fx.shieldHit(world(dst, 'core', tmpA), PAL.cyan);
          overlay.number(world(dst, 'core', tmpA).add(tmpB.set(0, 0.8, 0)), e.amount, 'shield', { key: dst.id, prefix: '◈+' });
        }
        break;
      }
      case 'buff': if (dst && !(src && hook(src, 'buff', makeCtx('buff', src, e, [dst], { buff: e })))) fx.buffAura(tmpA.set(dst.x, 0, dst.z), PAL.gold); break;
      case 'debuff': if (dst && !(src && hook(src, 'debuff', makeCtx('debuff', src, e, [dst], { debuff: e, status: e.status })))) fx.debuffAura(tmpA.set(dst.x, 0, dst.z), e.status === 'burn' ? PAL.orange : PAL.purple); break;
      case 'cancel': if (src) { fx.sparks(world(src, 'core', tmpA), PAL.white, 16, 4); overlay.number(tmpA.clone().add(tmpB.set(0, 0.8, 0)), 'INTERRUPTED', 'status', { key: src.id }); } break;
      case 'overdrive_ready': if (src) { arena.nodePulse(src.side, src.slot, 1.2); fx.buffAura(tmpA.set(src.x, 0, src.z), src.color); } break;
      case 'death': {
        if (!dst) break;
        dst.alive = false;
        dst.unit.play('die');
        dst.shieldK = 0; dst.aura && (dst.auraOff = true); setBubble(dst, 0);
        overlay.killBar(dst.id);
        arena.dimSlot(dst.side, dst.slot, 0.18);
        const p = world(dst, 'core', new THREE.Vector3());
        fx.after(0.35 / speed, () => fx.deathBurst(p, dst.color));
        arena.theme.crowd?.hype(0.6);
        audio.sfx('death', { x: dst.x });
        break;
      }
      case 'revive': {
        if (!dst) break;
        dst.alive = true; dst.sink = 0; dst.removed = false; dst.unit.root.visible = true; dst.auraOff = false; setBubble(dst, 0);
        dst.unit.root.position.y = arena.plateH;
        dst.unit.play('deploy'); fx.deploy(tmpA.set(dst.x, 0, dst.z), dst.color);
        overlay.removeBar(dst.id); overlay.addBar(dst.id, { role: dst.v.role, side: dst.side }); overlay.barAnchor(dst.id, dst.barAnchor);
        overlay.setBar(dst.id, e.hp / e.maxHp, 0);
        arena.dimSlot(dst.side, dst.slot, 1);
        break;
      }
      case 'end': {
        ended = true;
        const win = e.win;
        overlay.banner(win ? 'VICTORY' : e.reason === 'timeout' ? 'TIME OUT' : e.reason === 'forfeit' ? 'WITHDRAWN' : 'DEFEAT', win ? '★'.repeat(e.stars || 0) + '☆'.repeat(3 - (e.stars || 0)) : 'SQUAD OFFLINE',
          { color: win ? '#ffd24a' : '#ff4a5a', hold: true });
        for (const a of U.values()) if (a.alive && (a.side === 'player') === win) a.unit.play('victory', { loop: true });
        victoryMoment(win);
        audio.sfx(win ? 'victory' : 'defeat');
        fx.after(2.2, () => emit('end', e.result));
        break;
      }
    }
    stateDirty = true;
  }

  // animation fire frame → launch the shot so it lands on the sim's impactT
  // Every fire/cast/impact frame of the current attack or overdrive anim also calls the unit's shot(ctx) hook with the event index,
  // so multi-shot bursts (BARB 3, GUNNER 5-8, PRISM OD 4) can sync each shot to its own frame. index 0 = the frame that launched.
  function onUnitEvent(a, type, info = {}) {
    if (type !== 'fire' && type !== 'cast' && type !== 'impact') return;
    const anim = info.anim || '';
    const p = anim === 'overdrive' ? null : a.pending.find((x) => !x.launched);
    if (p) { launch(a, p); a.cur = { e: p.e, anim, phase: 'attack', n: -1 }; }
    const c = a.cur;
    if (!c || (c.anim && anim && c.anim !== anim)) return;
    c.n++;
    shotEvent(a, c, type, info);
  }
  function shotEvent(a, c, type, info) {
    const e = c.e;
    const sock = info.socket?.isObject3D && a.unit.root.visible ? info.socket.getWorldPosition(new THREE.Vector3()) : world(a, 'muzzle', new THREE.Vector3());
    const shot = { index: c.n, typeIndex: info.index ?? c.n, type, anim: c.anim, phase: c.phase, socket: sock };
    const targets = (e.targets || [e.dst]).map((id) => U.get(id));
    if (a.ufx?.mod?.shot) { hook(a, 'shot', makeCtx('shot', a, e, targets, { shot })); return; }
    // generic bursts: units without a signature file get a slug per extra fire frame (the sim's one hit still lands with the first)
    if (c.phase !== 'attack' || c.n === 0 || type !== 'fire' || a.ufx?.mod?.attack) return;
    if (e.delivery !== 'instant' && e.delivery !== 'projectile') return;
    const dst = U.get(e.dst);
    if (!dst) return;
    const tgt = world(dst, 'core', new THREE.Vector3()).add(tmpB.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5));
    fx.muzzle(sock, a.color, 0.7); fx.tracer(sock, tgt, a.color, 0.26);
    fx.after(0.06, () => fx.sparks(tgt, a.color, 3, 3));
    audio.sfx('fire_' + e.delivery, { ability: e.ability, x: a.x });
  }
  function launch(a, p) {
    p.launched = true;
    const e = p.e;
    const dst = U.get(e.dst);
    if (!dst) return;
    const ab = data.abilities?.[e.ability];
    const muzzle = world(a, 'muzzle', new THREE.Vector3());
    const tgt = world(dst, 'core', new THREE.Vector3());
    const travel = Math.max(0.05, (e.impactT - simT) / TPS);
    const col = a.color;
    audio.sfx('fire_' + e.delivery, { ability: e.ability, x: a.x });
    if (hook(a, 'attack', makeCtx('attack', a, e, (e.targets || [e.dst]).map((id) => U.get(id))))) return;
    // generic role flavour (units without signature files)
    if (a.v.role === 'mage') fx.rune(tmpA.set(a.x, 0, a.z), col);
    else if (a.v.role === 'tank' && e.delivery !== 'melee') { fx.casings(muzzle, col, 3); fx.muzzle(muzzle, col, 0.6); }
    switch (e.delivery) {
      case 'melee': {
        fx.sparks(world(a, 'hand', tmpA), col, 6, 3);
        const dir = new THREE.Vector3(dst.x - a.x, 0, dst.z - a.z).normalize();
        fx.after(Math.max(0, travel - 0.04), () => fx.slash(world(dst, 'core', new THREE.Vector3()), dir, col, Math.min(1.5, a.h / 3)));
        break;
      }
      case 'beam':
        fx.muzzle(muzzle, col, 1.2);
        if (/heal|halo|mend/.test(e.ability)) fx.beam(muzzle, tgt, PAL.green, travel + 0.25, 0.16);
        else fx.beam(muzzle, tgt, col, travel + 0.3, 0.22);
        break;
      case 'instant':
        fx.muzzle(muzzle, col, 1); fx.tracer(muzzle, tgt, col, 0.34);
        break;
      default: { // projectile
        const spd = ab?.delivery?.speed || 10;
        fx.muzzle(muzzle, col, 1);
        if (spd >= 12) {
          // fast kinetic/rail: hitscan-looking slug + rail streak
          fx.tracer(muzzle, tgt, col, 0.36);
          if (/rail|lance/.test(e.ability)) fx.rail(muzzle, tgt, col, 0.3);
        } else {
          const arc = /orb|pyre|mortar/.test(e.ability) ? 1.2 : 0.15;
          fx.bolt(muzzle, tgt, col, travel, { size: spd < 8 ? 0.42 : 0.3, arc });
        }
      }
    }
  }

  // ---------- Overdrive ----------
  function overdriveStart(a, e) {
    const ab = data.abilities?.[e.ability];
    const name = (ab?.name || e.ability).toUpperCase();
    overlay.odPlate(name, `${(a.v.name || '').toUpperCase()} — OVERDRIVE`, '#' + a.color.clone().multiplyScalar(0.33).getHexString(), a.side);
    arena.nodePulse(a.side, a.slot, 2.2); // DESIGN §13: 0.3 s plate flash in faction colour
    a.unit.play('overdrive');
    if (a.odFit) a.odShift = { t: 0, dur: a.odFit.dur };
    a.cur = { e, anim: 'overdrive', phase: 'overdrive', n: -1 };
    a.busy = 1.6;
    const c = world(a, 'core', new THREE.Vector3());
    fx.charge(c, a.color, Math.max(0.35, (e.fireT - e.t) / TPS));
    arena.theme.crowd?.wave();
    slow = 0.3; slowT = 0.9; odPush = 1; odK = 0.45; odTarget.set(a.x * 0.6, 1, a.z); odSrc = a;
    engine.post.flash(a.color, 0.0);
    audio.sfx('overdrive', { x: a.x, ability: e.ability });
    const at = Math.max(0.05, (e.fireT - e.t) / TPS);
    fx.after(at, () => overdriveFire(a, e, ab));
  }
  function overdriveFire(a, e, ab) {
    const targets = (e.targets || []).map((id) => U.get(id)).filter(Boolean);
    audio.sfx('overdrive_fire', { x: a.x, ability: e.ability });
    if (hook(a, 'overdrive', makeCtx('overdrive', a, e, targets))) return;
    const effects = ab?.effects || [];
    const kinds = new Set(effects.map((x) => x.type));
    const col = a.color;
    const muzzle = world(a, 'muzzle', new THREE.Vector3());
    flashPulse(col, 0.12);
    rig.shake(0.6);
    const id = e.ability || '';
    if (kinds.has('heal') && !kinds.has('damage')) {
      const c = centroid(targets.length ? targets : [a]);
      fx.healField(c, 4.2, PAL.green, 1.8);
      for (const t of targets) fx.heal(tmpA.set(t.x, 0, t.z));
    } else if (kinds.has('shield') && !kinds.has('damage')) {
      for (const t of targets) { fx.shieldHit(world(t, 'core', tmpA), PAL.cyan); fx.buffAura(tmpA.set(t.x, 0, t.z), PAL.cyan); }
      fx.emp(tmpA.set(a.x, 0, a.z), PAL.cyan, 4);
    } else if (/orbital/.test(id)) {
      targets.forEach((t, i) => fx.after(i * 0.12, () => fx.orbital(tmpA.set(t.x, 0.5, t.z).clone(), PAL.gold)));
    } else if (/emp|null|pulse/.test(id)) {
      const c = centroid(targets);
      fx.emp(c, PAL.cyan, 7);
      for (const t of targets) fx.sparks(world(t, 'core', tmpA), PAL.cyan, 14, 4);
    } else if (/singular|void|grav/.test(id)) {
      const c = centroid(targets); c.y = 1.2;
      fx.vfx.rings.spawn({ pos: c.clone().setY(0.06), color: PAL.purple, r0: 6, r1: 0.5, thick: 0.15, life: 0.6, kind: 0 });
      fx.after(0.5, () => { fx.explosion(c, PAL.purple, 1.3); for (const t of targets) fx.debuffAura(tmpA.set(t.x, 0, t.z), PAL.purple); });
    } else if (e.delivery === 'beam') {
      const far = targets.reduce((m, t) => (Math.abs(t.x) > Math.abs(m?.x ?? 0) ? t : m), targets[0]);
      if (far) {
        const end = world(far, 'core', new THREE.Vector3());
        end.sub(muzzle).normalize().multiplyScalar(30).add(muzzle);
        fx.rail(muzzle, end, col, 0.55);
        fx.vfx.beams.spawn({ a: muzzle, b: end, color: PAL.white, width: 0.9, width1: 0.05, core: 0.4, life: 0.5, taper: 0.02 });
        for (const t of targets) fx.impact(world(t, 'core', tmpA), col, 1.6);
      }
    } else if (e.delivery === 'projectile') {
      targets.forEach((t, i) => fx.after(i * 0.08, () => {
        const m = world(a, 'muzzle', new THREE.Vector3());
        fx.bolt(m, world(t, 'core', new THREE.Vector3()), col, 0.35, { size: 0.36, arc: 1.5 + Math.random() });
      }));
    } else {
      for (const t of targets) fx.after(Math.random() * 0.15, () => fx.explosion(world(t, 'core', new THREE.Vector3()), /inferno|pyre|fire/.test(id) ? PAL.orange : col, 1));
    }
  }
  // end of battle: winners get a staggered holo burst on their plates; a win adds confetti, a crowd wave and a gold flash
  function victoryMoment(win) {
    const side = win ? 'player' : 'enemy';
    const winners = [...U.values()].filter((a) => a.alive && a.side === side);
    winners.forEach((a, i) => fx.after(0.25 + i * 0.12, () => { fx.holoBurst(tmpA.set(a.x, 0, a.z), win ? PAL.gold : PAL.red); arena.nodePulse(a.side, a.slot, 2); }));
    if (win) {
      fx.after(0.15, () => flashPulse(PAL.gold, 0.1));
      fx.after(0.3, () => fx.confetti(new THREE.Vector3(-BOARD.W * 0.22, 0, BOARD.zMid + 3), { w: BOARD.W * 0.7, d: BOARD.L * 0.7, n: tier.name === 'low' ? 60 : 150 }));
      arena.theme.crowd?.wave(); arena.theme.crowd?.hype(1.2);
      const c = centroid(winners.length ? winners : [...U.values()]);
      odTarget.copy(c); odK = 0.25; odPush = 0.9;
    } else arena.theme.crowd?.hype(0.4);
  }
  function placePlate() {
    const H = engine.renderer.domElement.clientHeight;
    if (!H) return;
    const y = (z, yy) => (0.5 - tmpA.set(0, yy, z).project(camera).y * 0.5) * H;
    overlay.setPlateY((y(BOARD.zFar, 0) + y(BOARD.zFar - 2.2, 1.1)) / 2);
  }
  function flashPulse(col, a = 0.22) { engine.post.flash(col, a); flashK = a; }
  let flashK = 0, otK = 0, otOn = false;
  function centroid(list) {
    const c = new THREE.Vector3();
    if (!list.length) return c;
    for (const t of list) { c.x += t.x; c.z += t.z; }
    return c.multiplyScalar(1 / list.length).setY(0.5);
  }

  // ---------- frame ----------
  let frameNo = 0;
  function tick(dtReal, t) {
    frameNo++;
    // slow-mo ramps back in real time
    if (slowT > 0 && !paused) { slowT -= dtReal; if (slowT <= 0) slow = 1; }
    const ts = paused ? 0 : (ended ? 1 : speed) * (slowT > 0 ? slow : 1); // the victory moment plays at real time
    const dt = Math.min(dtReal, 0.05) * ts;
    tickIntro(dtReal);
    // intro: the sim clock and the event queue wait for the camera; drop-ins may start in the last INTRO_OVERLAP s
    const introHold = intro.on, introDeploy = !intro.on || (intro.dur - intro.t) / intro.speed <= INTRO_OVERLAP;
    if (introHold) { /* no ticks */ } else if (sim && started && !sim.done && !forfeited) {
      simT += dt * TPS;
      let guard = 0;
      while (sim.t < Math.floor(simT) && !sim.done && guard++ < 40) {
        const evts = sim.step(1);
        for (const e of evts) queue.push(e);
      }
    } else if (sim && sim.done) simT = Math.max(simT, sim.t);
    while (queue.length && !introHold) handle(queue.shift());
    // fallback launch if an anim never fired
    for (const a of U.values()) {
      for (let i = a.pending.length - 1; i >= 0; i--) {
        const p = a.pending[i];
        if (!p.launched && simT >= p.e.fireT + 1.5) launch(a, p);
        if (p.launched || simT > p.e.impactT + 5) a.pending.splice(i, 1);
      }
    }
    // actors
    for (const a of U.values()) {
      if (a.removed) continue;
      if (!a.deployed) {
        if (!introDeploy) { a.unit.update(0); continue; }
        a.deployT += dt;
        // squad drop-in: the hex plate lights ~0.28 s before the unit arrives in a beam, then a landing shockwave
        if (!a.armed && a.deployT >= -0.28) {
          a.armed = true;
          arena.setSlot(a.side, a.slot, a.plate, true); arena.nodePulse(a.side, a.slot, 1.6);
          if (a.place) arena.setPlace(a.side, a.slot, a.x, a.z, a.place);
          fx.plateArm(tmpA.set(a.x, 0, a.z), a.color, 0.28);
        }
        if (a.deployT >= 0) {
          if (!a.unit.root.visible) {
            a.unit.root.visible = true; a.unit.play('deploy');
            // def.noDrop (blink units, e.g. PHASE): no beam drop, the unit materialises on its plate; deploy(ctx) hook may replace either
            if (!hook(a, 'deploy', makeCtx('deploy', a, null, [], { noDrop: a.noDrop }))) {
              if (a.noDrop) fx.materialize(tmpA.set(a.x, 0, a.z), a.color, a.h);
              else fx.deploy(tmpA.set(a.x, 0, a.z), a.color);
            }
            arena.setSlot(a.side, a.slot, a.plate, true);
            if (a.place) arena.setPlace(a.side, a.slot, a.x, a.z, a.place);
            { const ri = RARITY_INDEX[a.v.rarity] ?? 0; arena.setRarity(a.side, a.slot, ri, a.unit.rarityColor ?? RARITY_COLORS[ri]); }
            const d = data.units?.[a.v.def] || data.enemies?.[a.v.def] || {};
            arena.board.setMark(a.side, a.slot, d.boss ? 0xff3355 : d.elite ? 0xffa53a : null);
            audio.sfx('deploy', { x: a.x });
          }
          const k = a.noDrop ? 1 : Math.min(1, a.deployT / 0.35);
          a.unit.root.position.y = arena.plateH + (1 - k * k) * 5;
          if (k >= 1) {
            a.deployed = true; overlay.showBar(a.id, true); setBubble(a, a.shieldK); arena.nodePulse(a.side, a.slot, 1);
            if (!a.noDrop) { rig.shake(0.1 + Math.min(0.15, a.h * 0.02)); fx.land(tmpA.set(a.x, arena.plateH, a.z), a.color, Math.min(1.4, a.h / 3.2)); }
          }
        }
      }
      if (a.rehome) tickRehome(a, dtReal);
      if (a.lunge) {
        const L = a.lunge; L.t += dt;
        const k = Math.min(1, L.t / L.dur), s = Math.sin(Math.PI * k);
        // no forward root travel: sculpted melee anims already lunge ~0.7 model m (x1.9 board scale). The root only slides
        // toward its own lane side (player near, enemy far), so two front-liners striking each other pass instead of merging.
        const fx0 = a.x, fz0 = a.z + (a.side === 'enemy' ? -0.8 : 0.8) * s;
        a.unit.root.position.x = fx0; a.unit.root.position.z = fz0;
        a.unit.root.position.y = arena.plateH * (1 - s);
        if (k >= 1) { a.lunge = null; a.unit.root.position.set(a.x, arena.plateH, a.z); }
      }
      if (a.hoverPad) {
        const hp = a.hoverPad; hp.visible = a.unit.root.visible && a.alive && !a.removed;
        hp.position.x = a.unit.root.position.x; hp.position.z = a.unit.root.position.z;
        hp.userData.mat.uniforms.uTime.value = simT / TPS;
      }
      if (a.odShift || a.lunge || a.reach > 0) {
        // battle-7 reach guard: the overdrive push holds through the anim and its blend back to idle, and a live bbox check (front-liners
        // and bosses, while an overdrive or melee lunge plays) steps the root outward by whatever the spawn samples missed, so nothing
        // crosses the centre line (REDLINE's late spin frames and its chainblade lunges reached 0.3-0.56 m over)
        const O = a.odShift, sx = a.side === 'enemy' ? 1 : -1;
        let base = 0;
        if (O) {
          O.t += dt;
          base = a.odFit.push * Math.min(1, O.t / 0.06) * Math.min(1, Math.max(0, (O.dur + 0.3 - O.t) / 0.35));
          if (O.t >= O.dur + 0.65) a.odShift = null;
        }
        a.reach = a.reach || 0;
        if ((O || a.lunge) && (a.slot < 3 || a.odFit)) { // front column (slot = col * 3 + lane) or any unit with an overdrive fit
          a.rgN = (a.rgN || 0) + 1;
          const bb = a.rgN % 2 ? null : fastBox(a.unit.root, _odBox);
          if (bb && !bb.isEmpty()) {
            const inner = sx > 0 ? bb.min.x : -bb.max.x; // + = still on its own side
            if (inner < 0.15) a.reach = Math.min(2.5, a.reach + (0.15 - inner));
          }
        } else a.reach = Math.max(0, a.reach - dt * 2.5);
        a.unit.root.position.x = a.x + sx * (base + a.reach);
      }
      if (a.sink > 0) {
        a.sink += dt;
        a.unit.root.position.y = arena.plateH - a.sink * 2.2;
        if (a.sink > 1) { a.removed = true; a.unit.root.visible = false; overlay.removeBar(a.id); arena.setSlot(a.side, a.slot, null); }
      }
      a.busy -= dt;
      if (a.busy <= 0 && a.alive && Math.abs(a.yaw - a.yaw0) > 0.01) a.yaw += (a.yaw0 - a.yaw) * Math.min(1, dt * 4);
      if (a.leaning) { a.unit.root.rotation.set(0, a.yaw, 0); a.leaning = !!a.lean2; } // the quaternion write leaks into rotation.x/z
      a.unit.setFacing(a.yaw);
      if (a.lean2) {
        const L = a.lean2; L.t += dt; a.leaning = true;
        const k = Math.min(1, L.t / 0.12) * (L.t > L.dur + 0.12 ? Math.max(0, 1 - (L.t - L.dur - 0.12) / 0.35) : 1);
        if (L.t > L.dur + 0.47) a.lean2 = null;
        else a.unit.root.quaternion.premultiply(leanQ.setFromEuler(leanE.set(L.x * k, 0, L.z * k)));
      }
      a.unit.update(dt);
    }
    // overdrive camera + post
    odPush = Math.max(0, odPush - dtReal * 0.9);
    rig.push(Math.min(1, odPush * 1.4) * odK, odTarget);
    {
      const k = Math.min(1, odPush * 1.6);
      if (k > 0.001 && odSrc) {
        world(odSrc, 'core', tmpA).project(camera);
        engine.post.focus(tmpA.x * 0.5 + 0.5, tmpA.y * 0.5 + 0.5, 0.1, k * 0.7);
      } else engine.post.focus(0.5, 0.5, 0.2, 0);
      engine.post.pulse(0);
    }
    if (dimFx) {
      // envelope in battle time (x2/x4 and slow-mo stay in sync with the effect that asked for it)
      const D = dimFx; D.t += dt;
      const v = D.k * Math.min(1, D.t / 0.15) * (D.t > D.dur + 0.15 ? Math.max(0, 1 - (D.t - D.dur - 0.15) / 0.4) : 1);
      engine.post.dim?.(v);
      if (D.t > D.dur + 0.55) { dimFx = null; engine.post.dim?.(0); }
    }
    if (flashK > 0) { flashK = Math.max(0, flashK - dtReal * 0.9); engine.post.flash(null, flashK); }
    // OVERTIME (sim rules.overtime): barrier lights pulse red, a red grade ramps in with the damage multiplier, HUD plate
    {
      const on = !!(sim && sim.state.overtime && !ended);
      const want = on ? Math.min(1, 0.6 + ((sim.state.overtimeMult || 1) - 1) / 0.6) : 0;
      otK += (want - otK) * Math.min(1, dtReal * 2);
      arena.theme.setOvertime?.(otK);
      const p = otK * (0.75 + 0.25 * Math.sin(t * 6));
      engine.post.tint?.(1.18, 0.78, 0.8, p * 0.55);
      if (on !== otOn || (on && (frameNo & 15) === 0)) { otOn = on; overlay.overtime(on, sim?.state.overtimeMult || 1); stateDirty = true; }
    }
    rig.update(dtReal, t);
    fx.update(dt);
    tickStealth(t);
    vfx.update(dt, t);
    arena.update(dt, t);
    overlay.update(paused ? 0 : dtReal * Math.min(2, Math.max(1, speed * 0.6)));
    // CC rings on plates (DESIGN §13): stun yellow, shock blue-white, taunt red
    if (sim && (frameNo & 7) === 0) for (const a of U.values()) {
      if (a.removed || !a.deployed) continue;
      const st = sim.state.units[a.id]?.statuses || [];
      let c = null;
      // stealth (Ghost Net & co): glassy shimmer while the status lasts; models with their own cloak (SPECTER) handle it themselves
      const hidden = a.alive && !a.unit.specterCloak && st.some((x) => x.id === 'stealth' || x.def?.stealth);
      if (setStealth(a.unit, hidden, { color: a.color, proxy: a.proxy })) {
        fx.sparks(world(a, 'core', tmpA), PAL.white, hidden ? 10 : 16, 2.5);
        if (!hidden) fx.muzzle(tmpA, a.color, 0.8);
        audio.sfx(hidden ? 'cloak' : 'decloak', { x: a.x });
      }
      if (a.alive) for (const x of st) { if (x.id === 'stun') { c = 0xffd400; break; } if (x.id === 'shock') c = 0xbfe8ff; else if (x.id === 'taunt' && c == null) c = 0xff2a3a; }
      arena.board.setCC(a.side, a.slot, c);
    }
    stateAcc += dtReal;
    if (sim && (stateDirty && stateAcc > 0.066)) { stateAcc = 0; stateDirty = false; emit('state', api.state); }
  }

  return api;
}

// Big bosses get their own footprint on their half: the idle bbox (weapons included) may reach the centre line (regular front
// units: stop 0.35 short of it) and BOSS_OUTER out to the side (the HUD side buttons sit over the outer edge). First the boss steps back from
// its front slot, then it shrinks until the box fits. Returns the final scale + root x.
const BOSS_SCALE_MAX = 1.6, BOSS_OUTER = 6.2;
const SLICE_MS = 10, HOLD_MAX = 6000; // battle-10: main-thread budget per frame for unit builds at load
const WAIT = Symbol('wait'); // runSliced: stop this slice now
const runAll = (g) => { let r; while (!(r = g.next()).done); return r.value; };
// step a generator on the main thread at most `budget` ms per frame (or per idle period with idle: true); resolves its return value
function runSliced(g, { budget = SLICE_MS, idle = false } = {}) {
  const ric = idle && typeof requestIdleCallback === 'function';
  return new Promise((resolve, reject) => {
    const step = (dl) => {
      const t0 = performance.now(), b = ric && dl ? Math.max(3, Math.min(budget, dl.timeRemaining() - 1)) : budget;
      try {
        for (;;) { const r = g.next(); if (r.done) { resolve(r.value); return; } if (r.value === WAIT || performance.now() - t0 >= b) break; }
      } catch (e) { reject(e); return; }
      if (ric) requestIdleCallback(step, { timeout: 300 }); else nextFrame().then(() => step());
    };
    if (ric) requestIdleCallback(step, { timeout: 300 }); else step();
  });
}
const nextFrame = () => new Promise((r) => { if (typeof requestAnimationFrame === 'function' && !document.hidden) requestAnimationFrame(() => r()); else setTimeout(r, 16); });
const WIDE_OVERLAP = 0.3, WIDE_MIN = 0.62, WIDE_XL = 0.85, WIDE_L = 0.92, WIDE_BOSS = 1.1, WIDE_FRONT = 0.82; // battle-9 wideFit (battle-10: boss cap 1.25 -> 1.1)
const _odBox = new THREE.Box3();
export const _fastBox = (root) => fastBox(root, new THREE.Box3()); // tests
function unitBox(root, bb = new THREE.Box3()) {
  bb.makeEmpty(); root.updateMatrixWorld(true);
  root.traverseVisible((o) => { if (o.isMesh && o.layers.isEnabled(0) && o.material?.blending !== THREE.AdditiveBlending) expandPrecise(bb, o); });
  return bb;
}
// test: the inlined box vs three's expandByObject(o, true)
export function _boxCheck(root) {
  const a = unitBox(root), b = new THREE.Box3(); root.updateMatrixWorld(true);
  root.traverseVisible((o) => { if (o.isMesh && o.layers.isEnabled(0) && o.material?.blending !== THREE.AdditiveBlending) b.expandByObject(o, true); });
  return Math.max(a.min.distanceTo(b.min), a.max.distanceTo(b.max));
}
// battle-7: cheap per-frame box for the reach guard (a precise box skins every vertex: ~1-10 ms a unit). Rigid parts use their cached
// geometry box; skinned meshes skin a strided sample of ~400 vertices (bones alone miss blades: REDLINE's chainblade has no tip bone).
const _fbV = new THREE.Vector3(), _fbB = new THREE.Box3();
function fastBox(root, bb) {
  bb.makeEmpty(); root.updateMatrixWorld(true);
  root.traverseVisible((o) => {
    if (!o.isMesh || !o.layers.isEnabled(0) || o.material?.blending === THREE.AdditiveBlending) return;
    if (o.isSkinnedMesh && o.skeleton) {
      const n = o.geometry.attributes.position.count, st = Math.max(1, Math.floor(n / 400));
      for (let i = (o.id % st); i < n; i += st) bb.expandByPoint(o.getVertexPosition(i, _fbV).applyMatrix4(o.matrixWorld));
    } else {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      bb.union(_fbB.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld));
    }
  });
  return bb;
}
// Sample the overdrive anim (precise skinned bbox at a few phases); if it reaches more than 0.1 m over the centre line, return how
// far to step the root outward while it plays (capped so it stays on the board). Runs at spawn, before onEvent is hooked.
function makeHoverPad(lift, r, color) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uC: { value: new THREE.Color(color).multiplyScalar(1.6) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; uniform vec3 uC; varying vec2 vUv;
      void main(){ float h = vUv.y; float a = pow(1.0 - h, 1.6) * 0.32 + smoothstep(0.06, 0.0, abs(fract(h * 2.0 - uTime * 0.9) - 0.5) - 0.44) * (1.0 - h) * 0.35;
        gl_FragColor = vec4(uC * a, 1.0); }`,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.8, lift, 20, 1, true), mat);
  beam.position.y = lift / 2; beam.renderOrder = 6;
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 24), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uR; varying vec2 vP; void main(){ float d = length(vP) / uR; gl_FragColor = vec4(0.0, 0.0, 0.0, 0.5 * (1.0 - d * d)); }`,
    uniforms: { uR: { value: r * 1.05 } },
  }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 2;
  g.add(shadow, beam);
  g.userData.mat = mat;
  return g;
}

function* overdriveReach(unit, p, side) {
  let dur = 0;
  try { dur = unit.play('overdrive', { loop: false, fade: 0 }) || 0; } catch { return null; }
  if (!(dur > 0.2)) { try { unit.play('idle', { fade: 0 }); } catch { /* ignore */ } return null; }
  const sx = side === 'enemy' ? 1 : -1, x = unit.root.position.x;
  const bb = new THREE.Box3(), tmp = new THREE.Box3();
  const N = 16;
  let fwd = -Infinity;
  for (let i = 0; i < N; i++) {
    try { unit.update(dur / N); } catch { /* pose only */ }
    unitBox(unit.root, tmp);
    if (i % 4 === 3) yield;
    if (tmp.isEmpty()) continue;
    fwd = Math.max(fwd, sx > 0 ? x - tmp.min.x : tmp.max.x - x);
  }
  try { unit.play('idle', { fade: 0 }); unit.update(0.01); } catch { /* ignore */ }
  const over = fwd - (Math.abs(x) - 0.3); // keep 0.3 m short of the line (sampling misses some peaks)
  // a big overshoot is a deliberate lunge strike (PALADIN's Judgement Arc reaches ~4 m): stepping back that far looks absurd, leave it
  if (!(over > 0.05) || over > 2.2) return null;
  return { push: Math.min(over, Math.max(0, 6.4 - Math.abs(x))), dur, over };
}

function* fitBossFootprint(unit, p, side, s, onlyIfCrossing = false) {
  const BOSS_INNER = onlyIfCrossing ? 0.35 : 0; // regular units keep a clear gap; a boss may touch the line
  const sx = side === 'enemy' ? 1 : -1;
  // union of a few idle poses, so a held weapon that sways (REDLINE's chainblade) counts at its widest
  const bb = new THREE.Box3(), tmp = new THREE.Box3();
  for (let i = 0; i < 5; i++) { try { unit.update(0.25); } catch { /* pose only */ } bb.union(unitBox(unit.root, tmp)); if (i === 2) yield; }
  yield;
  if (bb.isEmpty()) return { s, x: p.x };
  // distances along the side's outward axis, relative to the root
  const fwd = sx > 0 ? p.x - bb.min.x : bb.max.x - p.x; // reach toward the centre line
  const back = sx > 0 ? bb.max.x - p.x : p.x - bb.min.x;
  if (onlyIfCrossing && Math.abs(p.x) - fwd >= BOSS_INNER) return { s, x: p.x };
  const f = Math.min(1, (BOSS_OUTER - BOSS_INNER) / Math.max(1e-3, fwd + back));
  const x = sx * Math.max(BOARD.colX[0], Math.min(BOSS_OUTER - f * back, Math.max(Math.abs(p.x), BOSS_INNER + f * fwd)));
  s *= f;
  unit.root.scale.setScalar(s);
  unit.root.position.x = x;
  return { s, x };
}

function hash(x) {
  const s = String(x); let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 100000 + 1;
}
