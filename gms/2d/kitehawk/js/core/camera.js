/**
 * The camera and the zoom solver — ARCHITECTURE §4.3, DECISIONS D18.
 *
 * DELIBERATELY DOM-FREE. Nothing here touches document, window, performance,
 * Date or Math.random, so `tools/camtrace.mjs` imports this exact file into node
 * and drives the real controller for the stability trace. A browser-only camera
 * would mean the zoom gate measured a re-implementation of the solver rather
 * than the solver, which is the shape of test this project has been burned by.
 *
 * The reverse rule is the one that matters more: **nothing under js/sim/ may
 * import this module or read cam.zoom** (§4.3.5, §10 rule 17). Zoom changes the
 * view only. The moment a sim value is derived from the camera, zoom becomes an
 * invisible difficulty modifier that no gate written against one zoom can catch.
 *
 * +Y is DOWN. Climbing decreases y. A camera "above" the player has a SMALLER y.
 */

import { clamp, sign, approachK } from './math.js';
import { ZOOM_BIAS } from './viewprofile.js';

const HULL = 64;              // wu — player hull length, §3.4. Overridable per player.
const PLAYER_PAD = 1.4;       // hull lengths every side (§4.3.1)
const MEMBER_PAD = 1.0;       // 1.0 hull / canopy span / engaged section — one rule, three rows
const BOX_CAP = 8;            // §4.3.1: one messy furball may not drag the zoom to the floor
const TRACK_GRACE = 1;        // ticks a member survives without being re-asserted
const PUNCH_HALFLIFE = 0.35;  // s

export function createCamera(view, opts = {}) {
  const q = opts;

  // Falsification switches. The forbidden implementation ships alongside the
  // correct one so a gate can be shown to go red (D47). Defaults are the
  // shipping behaviour; anything else is a control render.
  const MODE = {
    slew: q.slew || 'asymmetric',   // 'symmetric'  — no asymmetry, no hysteresis, no deadband
    margin: q.margin || 'latch',    // 'strict'     — §4.3.2 read literally, margin re-tested every tick
    track: q.track || 'reassert',   // 'sticky'     — members never expire
    enforce: q.enforce !== false,   // false        — allowOutsideClamp honoured under player control
  };

  let bias = ZOOM_BIAS[q.bias] !== undefined ? ZOOM_BIAS[q.bias] : ZOOM_BIAS.normal;
  let biasName = q.bias || 'normal';

  /* --- framing members. Pooled; the hot loop allocates nothing. ---------- */
  const members = new Map();       // id -> {x,y,w,h,weight,tick}
  const free = [];
  const order = [];                // scratch, re-used every solve
  const expired = [];              // scratch

  let tick = 0;
  let threatAbove = false;
  let playerControl = true;
  let punch = 0;
  let zoomBase = 1;
  let anchorYNow = view.profile.anchorY;
  let dirNow = 1;
  let dwell = 0;
  let granted = false;
  let lastStep = 0;
  let nearestHostile = Infinity;
  const warned = new Set();

  const box = { x: 0, y: 0, w: 0, h: 0 };
  const framings = new Map();      // tag -> {zoom, box, seconds, ease, priority, allowOutsideClamp, t, age}
  let framingBlend = 0;            // 0..1 toward the active override
  let activeTag = null;

  const cam = {
    x: 0, y: 0, zoom: 1,
    box,
    zoomTarget: 1,
    zoomReason: 'init',
    bounds: { minY: -10800, maxY: 420 },
    get tick() { return tick; },
    get zoomBase() { return zoomBase; },     // before the punch kick
    get bias() { return biasName; },
    get memberCount() { return order.length; },
    get playerControl() { return playerControl; },
    get dwell() { return dwell; },
    get granted() { return granted; },
    get nearestHostile() { return nearestHostile; },
    mode: MODE,
  };

  /* --- framing box ------------------------------------------------------ */

  /**
   * Re-assertion based ON PURPOSE (§6.6). A system that stops caring about an
   * entity simply stops calling this, and there is no way to leak a stale member
   * that pins the zoom to the floor forever. That is the failure mode to design
   * against — a whole zeppelin left in the box reads the game as a map.
   */
  cam.track = (id, x, y, w, h, weight) => {
    let m = members.get(id);
    if (!m) { m = free.pop() || { id: '', x: 0, y: 0, w: 0, h: 0, weight: 1, tick: 0, _d: 0 }; m.id = id; members.set(id, m); }
    m.x = x; m.y = y; m.w = w || 0; m.h = h || 0;
    m.weight = weight === undefined ? 1 : weight;
    m.tick = tick;
  };

  cam.untrack = (id) => {
    const m = members.get(id);
    if (m) { members.delete(id); free.push(m); }
  };

  cam.clearTracked = () => {
    for (const m of members.values()) free.push(m);
    members.clear();
  };

  cam.setThreatAbove = (on) => { threatAbove = !!on; };
  cam.setPlayerControl = (on) => { playerControl = !!on; };
  cam.setBias = (name) => {
    if (ZOOM_BIAS[name] === undefined) return false;
    bias = ZOOM_BIAS[name]; biasName = name; return true;
  };
  cam.punch = (strength) => { punch = Math.max(punch, Math.abs(strength || 0.03)); };

  /* --- framing overrides (§4.3.4) --------------------------------------- */

  cam.requestFraming = (tag, o = {}) => {
    const f = {
      zoom: o.zoom, box: o.box || null,
      seconds: o.seconds === undefined ? Infinity : o.seconds,
      ease: o.ease === undefined ? 0.35 : Math.max(0.001, o.ease),
      priority: o.priority === 'cinematic' ? 'cinematic' : 'beat',
      allowOutsideClamp: !!o.allowOutsideClamp,
      age: 0, seq: tick,
    };
    // ENFORCEMENT, not etiquette. A cinematic framing that escapes the clamp
    // while the player can still fly is how a camera decision turns into a
    // difficulty change, so it is refused in code rather than forbidden in prose.
    if (f.allowOutsideClamp && MODE.enforce && (playerControl || f.priority !== 'cinematic')) {
      if (!warned.has(tag)) {
        warned.add(tag);
        console.warn(`[cam] framing "${tag}" asked for allowOutsideClamp while the player has combat control — refused, clamping to [${view.profile.zoomWide}, ${view.profile.zoomIntimate}] (ARCHITECTURE §4.3.4)`);
      }
      f.allowOutsideClamp = false;
      f.refused = true;
    }
    framings.set(tag, f);
    return f;
  };

  cam.releaseFraming = (tag) => { framings.delete(tag); };
  cam.framingTags = () => [...framings.keys()];

  /* --- the solve (§4.3.1) ----------------------------------------------- */

  function buildBox(p) {
    const hull = (p && p.hull) || HULL;
    const px = p ? p.x : 0, py = p ? p.y : 0;
    const vx = p ? (p.vx || 0) : 0, vy = p ? (p.vy || 0) : 0;

    // the player, padded 1.4 hull lengths every side
    const pad = hull * PLAYER_PAD;
    let x0 = px - hull * 0.5 - pad, x1 = px + hull * 0.5 + pad;
    let y0 = py - hull * 0.5 - pad, y1 = py + hull * 0.5 + pad;

    // the player's lead point, pos + vel * 0.5 s — a point, no padding
    const lx = px + vx * 0.5, ly = py + vy * 0.5;
    if (lx < x0) x0 = lx; if (lx > x1) x1 = lx;
    if (ly < y0) y0 = ly; if (ly > y1) y1 = ly;

    // the rest, NEAREST FIRST, capped so a furball cannot floor the zoom
    order.length = 0;
    expired.length = 0;
    const minTick = tick - TRACK_GRACE;
    // values() rather than entries(): no per-member array allocation in the hot loop
    for (const m of members.values()) {
      if (MODE.track !== 'sticky' && m.tick < minTick) { expired.push(m); continue; }
      const dx = m.x - px, dy = m.y - py;
      m._d = dx * dx + dy * dy;
      order.push(m);
    }
    for (let i = 0; i < expired.length; i++) { members.delete(expired[i].id); free.push(expired[i]); }
    order.sort(cmpDist);

    // `weight` is the THREAT weight: pass 0 for a crate or a scripted point so
    // it does not arm the zoom lock. Default 1 is the conservative reading.
    // Measured over EVERY live member, before the box cap trims the list — a
    // hostile that lost its box slot is still a hostile.
    let nd = Infinity;
    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      if (m.weight > 0 && m._d < nd) { nd = m._d; break; }
    }
    nearestHostile = nd === Infinity ? Infinity : Math.sqrt(nd);

    const n = Math.min(order.length, BOX_CAP - 2);
    for (let i = 0; i < n; i++) {
      const m = order[i];
      const mp = Math.max(m.w, m.h) * MEMBER_PAD;
      const ax0 = m.x - m.w * 0.5 - mp, ax1 = m.x + m.w * 0.5 + mp;
      const ay0 = m.y - m.h * 0.5 - mp, ay1 = m.y + m.h * 0.5 + mp;
      if (ax0 < x0) x0 = ax0; if (ax1 > x1) x1 = ax1;
      if (ay0 < y0) y0 = ay0; if (ay1 > y1) y1 = ay1;
    }
    order.length = n;

    box.x = (x0 + x1) * 0.5; box.y = (y0 + y1) * 0.5;
    box.w = x1 - x0; box.h = y1 - y0;

  }

  function cmpDist(a, b) { return a._d - b._d; }

  function solveZoom() {
    const P = view.profile;
    const needW = box.w / P.zoomFill;
    const needH = box.h / P.zoomFill;
    const zw = needW > 0 ? view.worldW / needW : Infinity;
    const zh = needH > 0 ? view.worldH / needH : Infinity;
    const zoomNeeded = Math.min(zw, zh);
    cam.zoomReason = zw <= zh ? 'width' : 'height';
    return clamp(zoomNeeded + bias, P.zoomWide, P.zoomIntimate);
  }

  /* --- slew (§4.3.2) ---------------------------------------------------- */

  function slew(target, dt) {
    const P = view.profile;

    // 'symmetric' is the FORBIDDEN control: one rate, no margin, no dwell, no
    // deadband. It exists so the stability gate can be shown to go red.
    if (MODE.slew === 'symmetric') {
      const step = clamp((target - zoomBase) * Math.min(1, P.zoomOutK * dt), -P.zoomOutRate * dt, P.zoomOutRate * dt);
      zoomBase += step;
      lastStep = step;
      return;
    }

    let want = target;
    // a hostile inside zoomLockRange caps how far the frame may tighten
    if (want > zoomBase && nearestHostile <= P.zoomLockRange) {
      const cap = P.zoomCombat * 1.05;
      if (want > cap) { want = cap; cam.zoomReason = 'lock'; }
    }

    const d = want - zoomBase;

    if (d < -P.zoomDeadband) {
      // OUT: immediate. No dwell, no margin. Never let a threat leave frame.
      granted = false; dwell = 0;
      let step = d * Math.min(1, P.zoomOutK * dt);
      const cap = P.zoomOutRate * dt;
      if (step < -cap) step = -cap;
      zoomBase += step;
      lastStep = step;
      cam.zoomReason = 'out';
      return;
    }

    if (d > P.zoomDeadband) {
      // IN: earn it.
      const marginOk = want > zoomBase * P.zoomInMargin;
      if (MODE.margin === 'strict') {
        // §4.3.2 read literally. See docs/P2_NOTES — under this reading the
        // controller can never reach zoomIntimate, because 1.22 / 1.18 = 1.034.
        dwell = marginOk ? dwell + dt : 0;
        granted = dwell >= P.zoomInDwell;
      } else if (!granted) {
        dwell = marginOk ? dwell + dt : 0;
        if (dwell >= P.zoomInDwell) granted = true;
      }
      if (!granted) { lastStep = 0; cam.zoomReason = 'dwell'; return; }
      let step = d * Math.min(1, P.zoomInK * dt);
      const cap = P.zoomInRate * dt;
      if (step > cap) step = cap;
      zoomBase += step;
      lastStep = step;
      cam.zoomReason = 'in';
      return;
    }

    // inside the deadband — the thing that stops a threat sitting on the frame
    // edge from dithering the whole picture
    granted = false; dwell = 0; lastStep = 0;
    cam.zoomReason = 'deadband';
  }

  /* --- overrides blended over the solver -------------------------------- */

  function applyFraming(solved, dt) {
    const P = view.profile;
    let best = null, bestTag = null;
    if (framings.size) for (const [t, f] of framings) {
      f.age += dt;
      if (f.age >= f.seconds) { framings.delete(t); continue; }
      if (!best || (f.priority === 'cinematic' && best.priority !== 'cinematic') ||
          (f.priority === best.priority && f.seq >= best.seq)) { best = f; bestTag = t; }
    }
    activeTag = bestTag;

    const ease = best ? best.ease : (cam._lastEase || 0.35);
    if (best) cam._lastEase = best.ease;
    framingBlend = approachK(framingBlend, best ? 1 : 0, 1 / ease, dt);
    if (framingBlend < 0.0005 && !best) { framingBlend = 0; return solved; }

    let fz = solved;
    if (best) {
      if (best.box) {
        const needW = best.box.w / P.zoomFill, needH = best.box.h / P.zoomFill;
        fz = Math.min(needW > 0 ? view.worldW / needW : Infinity, needH > 0 ? view.worldH / needH : Infinity);
      } else if (best.zoom !== undefined) fz = best.zoom;
      // 'beat' is ALWAYS clamped. Only 'cinematic' with a granted
      // allowOutsideClamp may leave, and only with the player out of control.
      if (!(best.priority === 'cinematic' && best.allowOutsideClamp)) {
        fz = clamp(fz, P.zoomWide, P.zoomIntimate);
      } else {
        fz = clamp(fz, Math.min(P.zoomEstablish, P.zoomWide), P.zoomIntimate);
      }
      cam.zoomReason = 'framing:' + bestTag;
    }
    return solved + (fz - solved) * framingBlend;
  }

  /* --- per tick --------------------------------------------------------- */

  cam.update = (player, dt) => {
    const P = view.profile;
    tick++;

    buildBox(player);
    const target = solveZoom();
    cam.zoomTarget = target;
    slew(target, dt);
    zoomBase = clamp(zoomBase, P.zoomWide, P.zoomIntimate);

    const framed = applyFraming(zoomBase, dt);

    if (punch > 0) punch *= Math.pow(0.001, dt / PUNCH_HALFLIFE);
    if (punch < 1e-4) punch = 0;

    // The punch kicks OUT (smaller zoom) and settles — one direction, decaying,
    // so it can add a kill's worth of jolt without ever sustaining a pump.
    const lo = framingBlend > 0.5 && activeTag && framings.get(activeTag)?.allowOutsideClamp
      ? Math.min(P.zoomEstablish, P.zoomWide) : P.zoomWide;
    cam.zoom = clamp(framed - punch, lo, P.zoomIntimate);

    /* --- position ------------------------------------------------------- */
    const hull = (player && player.hull) || HULL;
    const px = player ? player.x : cam.x, py = player ? player.y : cam.y;
    const vx = player ? (player.vx || 0) : 0, vy = player ? (player.vy || 0) : 0;

    const visW = view.worldW / cam.zoom;
    const visH = view.worldH / cam.zoom;

    // anchorY: threat above wins, then climb / dive, then the resting anchor.
    // 30 wu/s is §4.1's threshold; NEGATIVE vy is a climb because +Y is down.
    const aTarget = threatAbove ? P.anchorYThreatAbove
      : vy < -30 ? P.anchorYClimb
        : vy > 30 ? P.anchorYDive
          : P.anchorY;
    anchorYNow = approachK(anchorYNow, aTarget, 3.0, dt);

    // Which way the aeroplane is pointing decides which side of the frame it
    // sits on; eased slowly so a reversal does not whip the whole picture.
    const dirTarget = vx === 0 ? dirNow : sign(vx);
    dirNow = approachK(dirNow, dirTarget, 1.2, dt);

    const leadX = clamp(vx * P.leadSeconds, -P.leadMax, P.leadMax);
    const leadY = clamp(vy * P.leadSeconds, -P.leadMax, P.leadMax);

    let tx = px + (0.5 - P.anchorX) * visW * dirNow + leadX;
    let ty = py - (anchorYNow - 0.5) * visH + leadY;

    if (framingBlend > 0.0005 && activeTag) {
      const f = framings.get(activeTag);
      if (f && f.box) {
        tx += (f.box.x - tx) * framingBlend;
        ty += (f.box.y - ty) * framingBlend;
      }
    }

    cam.x = approachK(cam.x, tx, 10, dt);
    cam.y = approachK(cam.y, ty, 10, dt);

    // never leave the world column
    const half = visH * 0.5;
    const loY = cam.bounds.minY + half, hiY = cam.bounds.maxY - half;
    cam.y = loY <= hiY ? clamp(cam.y, loY, hiY) : (cam.bounds.minY + cam.bounds.maxY) * 0.5;

    cam.lastStep = lastStep;
    return cam;
  };

  /** Place the camera without a slew — scene entry, not gameplay. */
  cam.reset = (x, y, z) => {
    const P = view.profile;
    cam.x = x || 0; cam.y = y || 0;
    zoomBase = clamp(z === undefined ? P.zoomCombat : z, P.zoomWide, P.zoomIntimate);
    cam.zoom = zoomBase;
    punch = 0; dwell = 0; granted = false; framingBlend = 0;
    anchorYNow = P.anchorY; dirNow = 1;
    framings.clear(); warned.clear();
    cam.clearTracked();
  };

  cam.reset(0, 0);
  return cam;
}
