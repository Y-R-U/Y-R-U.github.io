import * as THREE from 'three';

const D2R = Math.PI / 180;
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const shared = { bounds: null, still: () => false };

export function boundsFromPlots(plots, margin = { x: 52, z: 55 }) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of plots.values()) {
    const g = p.group.position;
    x0 = Math.min(x0, g.x); x1 = Math.max(x1, g.x); z0 = Math.min(z0, g.z); z1 = Math.max(z1, g.z);
  }
  return { x0: x0 - margin.x, x1: x1 + margin.x, z0: z0 - margin.z, z1: z1 + margin.z };
}

// Every corner/edge ray of the frame must land on the ground inside the world, so no frame shows sky or the edge.
const PROBES = [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [1, -1]];
function outside(camera, b, stopAt = 1) {
  camera.updateMatrixWorld();
  let n = 0;
  for (const [nx, ny] of PROBES) {
    _v.set(nx, ny, 0.5).unproject(camera);
    _d.copy(_v).sub(camera.position).normalize();
    let bad = _d.y > -0.004;
    if (!bad) {
      const t = -camera.position.y / _d.y;
      const x = camera.position.x + _d.x * t, z = camera.position.z + _d.z * t;
      bad = t > camera.far * 0.9 || x < b.x0 + 1 || x > b.x1 - 1 || z < b.z0 + 1 || z > b.z1 - 1;
    }
    if (bad && ++n >= stopAt) return n;
  }
  return n;
}
const frameOk = (camera, b) => outside(camera, b) === 0;

// Steepen (orbit up around look) then slide toward the world centre until the frame is clean.
export function keepInWorld(camera, pos, look, b = shared.bounds) {
  camera.position.copy(pos);
  camera.lookAt(look);
  if (!b || frameOk(camera, b)) return pos;
  const off = _a.copy(pos).sub(look);
  const r = off.length();
  let el = Math.asin(Math.max(-1, Math.min(1, off.y / r)));
  const az = Math.atan2(off.x, off.z);
  for (let i = 0; i < 40 && el < 80 * D2R; i++) {
    el += 1.5 * D2R;
    pos.set(look.x + Math.sin(az) * Math.cos(el) * r, look.y + Math.sin(el) * r, look.z + Math.cos(az) * Math.cos(el) * r);
    camera.position.copy(pos);
    camera.lookAt(look);
    if (frameOk(camera, b)) return pos;
  }
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  for (let i = 0; i < 40; i++) {
    const sx = Math.sign(cx - look.x) * Math.min(1.5, Math.abs(cx - look.x)), sz = Math.sign(cz - look.z) * Math.min(1, Math.abs(cz - look.z));
    look.x += sx; look.z += sz; pos.x += sx; pos.z += sz;
    camera.position.copy(pos);
    camera.lookAt(look);
    if (frameOk(camera, b)) break;
  }
  return pos;
}

// Distance along dir (unit, from look toward camera) at which every point fits inside ±m NDC.
function fitPoints(camera, look, dir, points, m = 0.9, lo = 4, hi = 900) {
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    camera.position.copy(dir).multiplyScalar(mid).add(look);
    camera.lookAt(look);
    camera.updateMatrixWorld();
    let ok = true;
    for (const p of points) {
      _b.copy(p).project(camera);
      if (_b.z > 1 || Math.abs(_b.x) > m || Math.abs(_b.y) > m) { ok = false; break; }
    }
    if (ok) hi = mid; else lo = mid;
  }
  return hi;
}

function boxCorners(cx, cz, w, d, h, ry = 0) {
  const out = [];
  const c = Math.cos(ry), s = Math.sin(ry);
  for (const dx of [-w / 2, w / 2]) for (const dz of [-d / 2, d / 2]) for (const y of [0, h]) {
    out.push(new THREE.Vector3(cx + dx * c + dz * s, y, cz - dx * s + dz * c));
  }
  return out;
}

// Hero framing box in plot space: the back edge carries the facades (with roofs), the front edge stops at the kerb.
function heroPoints(px, pz, ry, w, hb) {
  const out = [], c = Math.cos(ry), s = Math.sin(ry), W = (hb.w ?? w) / 2, x0 = hb.x ?? 0;
  for (const dx of [x0 - W, x0 + W]) for (const [z, y] of [[hb.z0, 0], [hb.z0, hb.h], [hb.z1, 0], [hb.z1, hb.hf ?? 1.8]]) {
    out.push(new THREE.Vector3(px + dx * c + z * s, y, pz - dx * s + z * c));
  }
  return out;
}

const dirFrom = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

// Hold-to-look offset on top of a rig's pose. Held: follows the finger; released: holds, then eases home.
const _op = new THREE.Vector3(), _ol = new THREE.Vector3();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function createOrbit({ yaw = 60, pitch = [15, 60], zoom = [0.75, 1.3], hold = 1.5, back = 0.9, minY = 2.2 } = {}) {
  const Y = yaw * D2R, P0 = pitch[0] * D2R, P1 = pitch[1] * D2R;
  let az = 0, el = 0, zm = 1, w = 0, wFrom = 0, active = false, relAt = 0;
  const now = () => performance.now() / 1000;
  const o = {
    get active() { return active; },
    get busy() { return active || w > 0; },
    get offset() { return { yaw: az / D2R, pitch: el / D2R, zoom: zm, w }; },
    engage() { if (!active && w <= 0) { az = el = 0; zm = 1; } active = true; w = 1; },
    drag(dYaw, dPitch) { az = clamp(az + dYaw, -Y, Y); el += dPitch; },
    pinch(k) { zm = clamp(zm * k, zoom[0], zoom[1]); },
    release() { if (!active) return; active = false; relAt = now(); wFrom = w; },
    reset() { active = false; w = 0; az = el = 0; zm = 1; },
    // Mutates pos (camera position for the rig's base pose around look). Returns true when an offset was applied.
    apply(camera, pos, look) {
      if (!active && w > 0) {
        const s = now() - relAt - (shared.still() ? 0 : hold);
        if (shared.still()) w = s >= hold ? 0 : wFrom;
        else w = s <= 0 ? wFrom : s >= back ? 0 : wFrom * (1 - ease(s / back));
        if (w <= 0) { w = 0; az = el = 0; zm = 1; }
      }
      if (w <= 0) return false;
      _op.copy(pos).sub(look);
      const r = _op.length(), baseEl = Math.asin(clamp(_op.y / r, -1, 1)), baseAz = Math.atan2(_op.x, _op.z);
      if (active) el = clamp(baseEl + el, Math.min(P0, baseEl), Math.max(P1, baseEl)) - baseEl;
      const pose = (k) => {
        dirFrom(baseAz + az * k, baseEl + el * k, _ol);
        pos.copy(_ol).multiplyScalar(r / (1 + (zm - 1) * k)).add(look);
        camera.position.copy(pos);
        camera.lookAt(look);
        return pos.y >= minY && (!shared.bounds || frameOk(camera, shared.bounds));
      };
      if (!pose(w)) {
        let lo = 0, hi = w;
        for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (pose(m)) lo = m; else hi = m; }
        if (active && w > 0) { const f = lo / w; az *= f; el *= f; zm = 1 + (zm - 1) * f; }
        pose(lo);
      }
      return true;
    },
  };
  return o;
}

export function createCardRig(plot) {
  const c = plot.camera;
  const camera = new THREE.PerspectiveCamera(c.fov, 2.3, 0.5, 400);
  camera.userData.iw2Line = plot.id;
  const lookL = new THREE.Vector3(...c.look), posL = new THREE.Vector3(...c.pos);
  const dir = posL.clone().sub(lookL);
  const baseDist = dir.length();
  dir.normalize();
  const look = new THREE.Vector3(), pos = new THREE.Vector3(), p = new THREE.Vector3();
  const orbit = createOrbit({ yaw: 60 });
  let lastAspect = 0, posed = false;
  return {
    camera,
    orbit,
    fit(aspect) {
      if (Math.abs(aspect - lastAspect) < 1e-3) {
        if (!posed && !orbit.busy) return;
        posed = orbit.apply(camera, p.copy(pos), look);
        if (!posed) camera.position.copy(pos);
        camera.lookAt(look);
        camera.updateMatrixWorld();
        return;
      }
      lastAspect = aspect;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      const t = Math.tan((c.fov / 2) * D2R);
      const wantW = plot.bounds.w * 0.92;
      const d = Math.max(baseDist * (aspect < 1.4 ? 1.15 : 1), wantW / 2 / (t * aspect) + plot.bounds.d * 0.25);
      plot.group.updateMatrixWorld();
      look.copy(lookL).applyMatrix4(plot.group.matrixWorld);
      _a.copy(dir).transformDirection(plot.group.matrixWorld);
      pos.copy(_a).multiplyScalar(d).add(look);
      keepInWorld(camera, pos, look);
      posed = orbit.apply(camera, p.copy(pos), look);
      camera.position.copy(posed ? p : pos);
      camera.lookAt(look);
      camera.updateMatrixWorld();
    },
  };
}

const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

export function createHeroDirector(world, { interval = 10 } = {}) {
  const plots = world.plots;
  shared.bounds = world.bounds || boundsFromPlots(plots);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 900);
  const cur = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const dest = { pos: new THREE.Vector3(), look: new THREE.Vector3(), az: 0, el: 0, r: 30 };
  const lastShown = {}, recent = {};
  const listeners = new Set();
  let current = 'hub', pinned = null, aspect = 1, t = 0, snapped = false;
  let shotStart = 0, shotLen = interval, glideStart = -10, glideDur = 1.6, arc = 0, side = 1;
  let override = null; // { id, until, reason, town }
  let town = false, game = null, shipments = null;
  const evQueue = [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const still = () => reduce.matches || !!game?.state?.settings?.reducedMotion;
  shared.still = still;
  const orbit = createOrbit({ yaw: 75 });
  const _p = new THREE.Vector3();

  function poseFor(id, out) {
    if (id === '@town') return townPose(out);
    const p = plots.get(id);
    if (!p) return false;
    const g = p.group.position;
    const ry = p.group.rotation.y;
    const pre = id === 'hub' && game && !game.state.bootstrap?.done;
    const w = pre ? 15 : p.bounds.w * 1.02, d = pre ? 6 : p.bounds.d + 2, h = pre ? 2.5 : Math.min(p.bounds.h || 6, 8);
    const hf = !pre && p.heroFocus ? p.heroFocus : null;
    const fc = hf || (!pre && p.focus ? p.focus : null);
    const fx = fc ? fc[0] * Math.cos(ry) + fc[1] * Math.sin(ry) : 0, fz = fc ? -fc[0] * Math.sin(ry) + fc[1] * Math.cos(ry) : -2.0;
    const cx = g.x + (pre ? -1 : fx), cz = g.z + fz;
    const hb0 = !pre && p.heroBox;
    if (hb0) out.look.set(cx, hb0.h * 0.32, g.z + (hb0.z0 + hb0.z1) / 2 + 1.6);
    else out.look.set(cx, pre ? 0.9 : 1.4, cz);
    out.az = (-19 * side + (aspect < 1.1 ? 0 : 3)) * D2R + ry;
    out.el = (aspect < 1.1 ? 35 : 31) * D2R;
    dirFrom(out.az, out.el, _d);
    const hb = hb0;
    out.r = fitPoints(camera, out.look, _d, hb ? heroPoints(g.x, g.z, ry, w * Math.min(1, 0.45 + aspect * 0.4), hb) : boxCorners(cx, cz, w, d, h, ry), 0.94);
    out.pos.copy(_d).multiplyScalar(out.r).add(out.look);
    keepInWorld(camera, out.pos, out.look);
    return polar(out);
  }

  function townPose(out) {
    const pts = [];
    for (const p of plots.values()) pts.push(...boxCorners(p.group.position.x, p.group.position.z, p.bounds.w, p.bounds.d, 2, p.group.rotation.y));
    const c = new THREE.Vector3();
    for (const q of pts) c.add(q);
    c.divideScalar(pts.length).setY(0);
    let best = null;
    const b = shared.bounds;
    for (const az of [-90, -72, -55, -35, -18, 0]) for (const el of [38, 50, 62, 74]) {
      dirFrom(az * D2R, el * D2R, _d);
      const r = fitPoints(camera, c, _d, pts, 0.92);
      camera.position.copy(_d).multiplyScalar(r).add(c);
      camera.lookAt(c);
      const out = b ? outside(camera, b, 99) : 0;
      const score = out * 1000 + r;
      if (!best || score < best.score) best = { score, az: az * D2R, el: el * D2R, r };
    }
    out.look.copy(c);
    out.az = best.az; out.el = best.el; out.r = best.r;
    dirFrom(best.az, best.el, _d);
    out.pos.copy(_d).multiplyScalar(best.r).add(c);
    keepInWorld(camera, out.pos, out.look);
    return polar(out);
  }

  function polar(out) {
    _b.copy(out.pos).sub(out.look);
    out.r = _b.length();
    out.el = Math.asin(_b.y / out.r);
    out.az = Math.atan2(_b.x, _b.z);
    return true;
  }

  function go(id, { len = interval, glide = true } = {}) {
    if (!poseFor(id, dest)) return false;
    const changed = id !== current;
    current = id;
    lastShown[id] = t;
    shotStart = t;
    shotLen = len;
    side = -side;
    if (glide && snapped && !still()) {
      from.pos.copy(cur.pos);
      from.look.copy(cur.look);
      const travel = from.look.distanceTo(dest.look);
      glideStart = t;
      glideDur = Math.min(2.6, Math.max(1.1, travel / 45 + 0.9));
      arc = Math.min(22, travel * 0.12);
    } else glideStart = -10;
    if (changed) for (const fn of listeners) fn(current);
    return true;
  }

  function stats(id) { return game && id !== 'hub' ? game.stats(id) : null; }

  function score(id) {
    let s = 1 + Math.min(3, (t - (lastShown[id] ?? -1e9)) / 30);
    if (id === 'hub') return Math.min(s, 1.6) + (recent.hub && t - recent.hub < 20 ? 3 : 0);
    const st = stats(id);
    if (st) {
      if (st.full || st.stockRatio >= 0.8) s += 3;
      if (st.nextMilestone && st.level >= st.nextMilestone * 0.85) s += 2;
    }
    if (game) for (const e of game.state.events?.active || []) if (e.lineId === id) s += 6;
    if (shipments) {
      let n = 0;
      for (const sh of shipments.list) if (sh.lineId === id && sh.tExit <= (game?.simTime ?? 0)) n++;
      s += Math.min(2, n * 0.5);
    }
    if (recent[id] && t - recent[id] < 15) s += 3;
    if (id === current) s -= 5;
    return s;
  }

  function pickNext(tourIds) {
    const ids = game ? (tourIds.includes('hub') ? tourIds : [...tourIds, 'hub']) : tourIds;
    if (!game) {
      const i = (tourIds.indexOf(current) + 1) % tourIds.length;
      return tourIds[i];
    }
    let best = null, bs = -Infinity;
    for (const id of ids) {
      const s = score(id) + Math.random() * 0.6;
      if (s > bs) { bs = s; best = id; }
    }
    return best;
  }

  function startOverride(id, sec, reason) {
    if (!plots.has(id)) return;
    override = { id, until: t + sec, reason };
    go(id, { len: sec });
  }

  function endOverride() {
    override = null;
    if (town) go('@town', { len: 1e9 });
    else if (pinned) go(pinned, { len: 1e9 });
    else shotStart = -1e9;
  }

  function onGameEvent(kind, e) {
    evQueue.push({ kind, e });
  }

  function handleEvents() {
    while (evQueue.length) {
      const { kind, e } = evQueue.shift();
      if (kind === 'beat') {
        const id = e.lineId && plots.has(e.lineId) ? e.lineId : 'hub';
        recent.hub = t;
        startOverride(id, e.sec || 7, 'beat');
        continue;
      }
      const id = e.lineId || e.event?.lineId;
      if (!id || !plots.has(id)) continue;
      recent[id] = t;
      if (override || town || pinned) continue;
      if (t - shotStart < 2.5 && current !== 'hub') continue;
      if (kind === 'unlocked') go(id, { len: 9 });
      else if (kind === 'milestone') go(id, { len: 7 });
      else if (kind === 'event:spawn') go(id, { len: 8 });
    }
  }

  const dir = {
    camera,
    orbit,
    get current() { return current; },
    get pinned() { return pinned; },
    get isTown() { return town; },
    get mode() { return override ? 'cutin' : town ? 'town' : pinned ? 'pin' : 'tour'; },
    get bounds() { return shared.bounds; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    attach({ game: g, shipments: s, world: w } = {}) {
      game = g || game;
      shipments = s || shipments;
      if (w?.bounds) shared.bounds = w.bounds;
      if (!g) return;
      for (const k of ['unlocked', 'milestone', 'event:spawn', 'beat', 'bought']) g.on(k, (e) => (k === 'bought' ? (recent[e.lineId] = t) : onGameEvent(k, e || {})));
    },
    setAspect(a) {
      if (Math.abs(a - aspect) < 1e-3) return;
      aspect = a;
      camera.aspect = a;
      camera.updateProjectionMatrix();
      poseFor(current, dest);
      if (!snapped) return;
      from.pos.copy(cur.pos); from.look.copy(cur.look); glideStart = t; glideDur = 0.5; arc = 0;
    },
    pin(id) { if (!plots.has(id)) return; pinned = id; if (!override && !town) go(id, { len: 1e9 }); },
    unpin() { pinned = null; if (!override && !town) shotStart = t - shotLen + 3; },
    cut(id, sec = interval) { startOverride(id, sec, 'cut'); },
    cutIn(id, sec = 7, reason = 'beat') { startOverride(id, sec, reason); },
    flyTo(id) { town = false; startOverride(id, 12, 'fly'); },
    town(on = true) {
      if (on === town) return;
      town = on;
      if (on) { override = null; go('@town', { len: 1e9 }); }
      else endOverride();
    },
    establish(on = true) { dir.town(on); },
    nearestPlot(point, maxDist = 18) {
      let best = null, bd = maxDist;
      for (const [id, p] of plots) {
        const dd = Math.hypot(point[0] - p.group.position.x, point[2] - p.group.position.z);
        if (dd < bd) { bd = dd; best = id; }
      }
      return best;
    },
    update(dt, tourIds) {
      const looking = orbit.busy && snapped;
      if (!looking) t += dt;
      if (!snapped) {
        if (!tourIds.includes(current) && tourIds.length) current = tourIds[0];
        poseFor(current, dest);
        cur.pos.copy(dest.pos); cur.look.copy(dest.look);
        snapped = true;
        shotStart = t;
        lastShown[current] = t;
      }
      if (!looking) handleEvents();
      if (looking) {}
      else if (override) { if (t >= override.until) endOverride(); }
      else if (town) {}
      else if (pinned) { if (current !== pinned) go(pinned, { len: 1e9 }); }
      else if (tourIds.length && (t - shotStart >= shotLen || !tourIds.includes(current) && !(game && current === 'hub'))) {
        const next = pickNext(tourIds);
        if (next && (next !== current || t - shotStart >= shotLen)) go(next, { len: interval * (0.9 + Math.random() * 0.2) });
      }

      const hold = Math.min(1, (t - shotStart) / Math.max(1, Math.min(shotLen, 40)));
      const isTown = current === '@town';
      const drift = still() ? 0 : isTown ? Math.sin(t * 0.05) * 4 * D2R : pinned && !override ? Math.sin(t * 0.16) * 5 * D2R : (hold - 0.5) * 7 * D2R * side;
      const push = isTown || still() ? 1 : 1 - 0.05 * hold;
      dirFrom(dest.az + drift, dest.el, _d);
      _a.copy(_d).multiplyScalar(dest.r * push).add(dest.look);
      const g = (t - glideStart) / glideDur;
      if (g < 1) {
        const e = ease(Math.max(0, g));
        cur.pos.lerpVectors(from.pos, _a, e);
        cur.pos.y += Math.sin(Math.PI * e) * arc;
        cur.look.lerpVectors(from.look, dest.look, e);
      } else {
        const k = still() ? 1 : 1 - Math.exp(-dt * 3);
        cur.pos.lerp(_a, k);
        cur.look.lerp(dest.look, k);
      }
      camera.position.copy(orbit.apply(camera, _p.copy(cur.pos), cur.look) ? _p : cur.pos);
      camera.lookAt(cur.look);
      camera.updateMatrixWorld();
    },
  };
  return dir;
}
