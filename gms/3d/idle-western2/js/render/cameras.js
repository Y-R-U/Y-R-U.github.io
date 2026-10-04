import * as THREE from 'three';
import { HERO_VIEW, ROAD_Z, STREET_W } from '../data/plots.js?v=20261004g';
const FACADE_Z = ROAD_Z - STREET_W / 2 - 5;

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
// The hero shows sky and the mesa ring like the ref, so only its lower frame must land inside the world.
const LOW = [[-1, -1], [0, -1], [1, -1], [-1, -0.4], [1, -0.4]];
function outside(camera, b, stopAt = 1, probes = PROBES) {
  camera.updateMatrixWorld();
  let n = 0;
  for (const [nx, ny] of probes) {
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
const frameOk = (camera, b, probes) => outside(camera, b, 1, probes) === 0;

// Steepen (orbit up around look) then slide toward the world centre until the frame is clean.
export function keepInWorld(camera, pos, look, b = shared.bounds, probes = PROBES) {
  camera.position.copy(pos);
  camera.lookAt(look);
  if (!b || frameOk(camera, b, probes)) return pos;
  const off = _a.copy(pos).sub(look);
  const r = off.length();
  let el = Math.asin(Math.max(-1, Math.min(1, off.y / r)));
  const az = Math.atan2(off.x, off.z);
  for (let i = 0; i < 40 && el < 80 * D2R; i++) {
    el += 1.5 * D2R;
    pos.set(look.x + Math.sin(az) * Math.cos(el) * r, look.y + Math.sin(el) * r, look.z + Math.cos(az) * Math.cos(el) * r);
    camera.position.copy(pos);
    camera.lookAt(look);
    if (frameOk(camera, b, probes)) return pos;
  }
  const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
  for (let i = 0; i < 40; i++) {
    const sx = Math.sign(cx - look.x) * Math.min(1.5, Math.abs(cx - look.x)), sz = Math.sign(cz - look.z) * Math.min(1, Math.abs(cz - look.z));
    look.x += sx; look.z += sz; pos.x += sx; pos.z += sz;
    camera.position.copy(pos);
    camera.lookAt(look);
    if (frameOk(camera, b, probes)) break;
  }
  return pos;
}

const dirFrom = (az, el, out = new THREE.Vector3()) => out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));

// Hold-to-look offset on top of a rig's pose. Held: follows the finger; released: holds, then eases home.
const _op = new THREE.Vector3(), _ol = new THREE.Vector3();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function createOrbit({ yaw = 60, pitch = [15, 60], zoom = [0.75, 1.3], hold = 1.5, back = 0.9, minY = 2.2, probes = PROBES } = {}) {
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
        return pos.y >= minY && (!shared.bounds || frameOk(camera, shared.bounds, probes));
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
  let c = plot.camera;
  const camera = new THREE.PerspectiveCamera(c.fov, 2.3, 0.5, 400);
  camera.userData.iw2Line = plot.id;
  const lookL = new THREE.Vector3(), posL = new THREE.Vector3(), dir = new THREE.Vector3();
  let baseDist = 1, key = null, probes = PROBES, fov = c.fov;
  // P's facade cameras (camera.facade) may show sky above the roofs; only their lower frame must stay on the ground.
  // While the Mulligans build, the site (frame + crew + mule cart) is framed whole instead of the open shop's gag.
  const building = () => !!plot.construction?.root?.visible;
  const keyOf = () => (plot.cameraKey ?? '') + (building() ? '#b' : '');
  function load() {
    c = plot.camera;
    key = keyOf();
    const auth = building() && c.build ? c.build : c;
    fov = auth.fov || c.fov;
    lookL.set(...auth.look); posL.set(...auth.pos);
    dir.copy(posL).sub(lookL);
    baseDist = dir.length();
    dir.normalize();
    if (building() && !c.build) {
      const S = plot.construction.site, y = plot.construction.anchors?.yard;
      const x0 = Math.min(S.x - S.w / 2, y ? y[0] - 1.5 : 1e9), x1 = Math.max(S.x + S.w / 2, y ? y[0] + 3.5 : -1e9);
      lookL.set((x0 + x1) / 2, S.fh * 0.4, S.fz + 1.2);
      dir.y += 0.12;
      dir.normalize();
      const t = Math.tan((fov / 2) * D2R);
      baseDist = Math.max(baseDist * 1.1, ((x1 - x0) / 2 + 0.5) / (t * 0.78) / 1.15, (S.fh + 1.5) / (2 * t) / 1.15);
    }
    probes = c.facade ? LOW : PROBES;
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }
  load();
  const look = new THREE.Vector3(), pos = new THREE.Vector3(), p = new THREE.Vector3();
  const orbit = createOrbit({ yaw: 60, probes: c.facade ? LOW : PROBES });
  let lastAspect = 0, posed = false;
  return {
    camera,
    orbit,
    fit(aspect) {
      if (keyOf() !== key) { load(); lastAspect = 0; }
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
      const t = Math.tan((fov / 2) * D2R);
      const wantW = plot.bounds.w * 0.92;
      const d = Math.max(baseDist * (aspect < 1.4 ? 1.15 : 1), wantW / 2 / (t * aspect) + plot.bounds.d * 0.25);
      plot.group.updateMatrixWorld();
      look.copy(lookL).applyMatrix4(plot.group.matrixWorld);
      _a.copy(dir).transformDirection(plot.group.matrixWorld);
      pos.copy(_a).multiplyScalar(d).add(look);
      keepInWorld(camera, pos, look, shared.bounds, probes);
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
  const camera = new THREE.PerspectiveCamera(HERO_VIEW?.fov || 50, 1, 0.5, 900);
  const FOV = camera.fov;
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
  const orbit = createOrbit({ yaw: 75, pitch: [12, 60], probes: LOW });
  const _p = new THREE.Vector3();
  // Spectacle shots (duel, chase): a provider fills {pos, look, fov} each frame and the camera blends to it.
  let shotFn = null, shotW = 0;
  const shotPose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: FOV, snap: false };
  const _sl = new THREE.Vector3();

  let midX = 0;
  { let a = Infinity, b = -Infinity; for (const p of plots.values()) { a = Math.min(a, p.group.position.x); b = Math.max(b, p.group.position.x); } midX = (a + b) / 2 + 8; }
  // R4 establishing shot: low enough at the west end that the staged vignette reads like refs/a_clay_hero.jpg.
  const HV = { vanish: 0.3, subject: 0.5, camZ: 8.4, height: 8, pitch: 17, fov: 50, minBack: 13, townH: 10.5, townPitch: 19, townX: -10, townYaw: 0.16, ...(HERO_VIEW || {}) };
  // Plot shot like refs/a_clay_hero.jpg: standing in the street and looking DOWN it, the business near-left (near-right for
  // east plots, shot from the east), its neighbours' facades receding to a vanishing point right of centre, the south
  // frontages on the far side, sky + mesas on top. Solved per aspect: the street axis lands at NDC x = ±vanish and the
  // business front at ∓subject, so a narrow portrait frame never looks across the desert.
  function poseFor(id, out) {
    if (id === '@town') return townPose(out);
    const p = plots.get(id);
    if (!p) return false;
    const g = p.group.position;
    const pre = id === 'hub' && game && !game.state.bootstrap?.done;
    if (pre) return openingPose(p, out);
    const fc = p.heroFocus || p.focus || null;
    const s = g.x > midX ? -1 : 1;
    const tanH = Math.tan((camera.fov / 2) * D2R) * Math.max(0.4, aspect);
    const yaw = Math.atan(HV.vanish * tanH), th = yaw + Math.atan(HV.subject * tanH);
    const bx = g.x + (fc ? fc[0] * 0.3 : 0) + s * (p.bounds.heroW || 14) * 0.05, bz = FACADE_Z + 1.5;
    const lat = HV.camZ - bz, hw = (p.bounds.heroW || 14) / 2;
    // ...but the lot's near corner stays inside the frame.
    const back = Math.max(HV.minBack, lat / Math.tan(th), hw - s * (bx - g.x) + lat / Math.tan(yaw + Math.atan(0.9 * tanH)));
    const pitch = HV.pitch * D2R, L = HV.height / Math.sin(pitch);
    out.pos.set(bx - s * back, HV.height, HV.camZ);
    out.look.set(out.pos.x + s * Math.cos(yaw) * Math.cos(pitch) * L, 0, out.pos.z - Math.sin(yaw) * Math.cos(pitch) * L);
    keepInWorld(camera, out.pos, out.look, shared.bounds, LOW);
    return polar(out);
  }

  // Before the first business: down in the street, low, on the saloon doors and the Stranger face-down in the mud.
  function openingPose(p, out) {
    const sp = plots.get('saloon'), d = sp?.anchors?.doors;
    if (d) { sp.group.updateMatrixWorld(); _a.set(d[0], 0, d[2]).applyMatrix4(sp.group.matrixWorld); }
    else _a.set(p.group.position.x, 0, p.group.position.z - 6);
    out.pos.set(_a.x - 0.6, 7.2, _a.z + 11.9);
    out.look.set(_a.x + 2.0, 1.4, _a.z + 3.4);
    return polar(out);
  }

  // Establishing shot: high at the west end of the street, looking down its whole length with sky + mesas above.
  function townPose(out) {
    let x0 = Infinity;
    for (const p of plots.values()) x0 = Math.min(x0, p.group.position.x - (p.bounds.heroW || 14) / 2);
    const tanH = Math.tan((camera.fov / 2) * D2R) * Math.max(0.4, aspect);
    const yaw = Math.atan(HV.townYaw * tanH), pitch = HV.townPitch * D2R, H = HV.townH, L = H / Math.sin(pitch);
    out.pos.set(x0 + HV.townX, H, ROAD_Z + 1.5);
    out.look.set(out.pos.x + Math.cos(yaw) * Math.cos(pitch) * L, 0, out.pos.z - Math.sin(yaw) * Math.cos(pitch) * L);
    keepInWorld(camera, out.pos, out.look, shared.bounds, LOW);
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
    // A staged beat asks the tour to stay on this shot until it has played out.
    hold(sec) { if (!override && !town && !pinned) shotLen = Math.max(shotLen, t - shotStart + sec); },
    get gliding() { return t - glideStart < glideDur; },
    shot(fn) { if (fn && !shotFn) { shotPose.pos.copy(camera.position); shotPose.look.copy(cur.look); shotPose.fov = FOV; } shotFn = fn || null; },
    get shooting() { return !!shotFn || shotW > 0.01; },
    // The street point the tour shot is built around (its look sits straight above it).
    get focus() { return cur.look; },
    note(id) { if (plots.has(id)) recent[id] = t; },
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
      const drift = still() ? 0 : isTown ? Math.sin(t * 0.05) * 4 * D2R : pinned && !override ? Math.sin(t * 0.16) * 2.5 * D2R : (hold - 0.5) * 4 * D2R * side;
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
      if (shotFn && shotFn(shotPose, dt) === false) shotFn = null;
      const sw = shotFn ? 1 : 0;
      shotW = shotPose.snap && shotFn ? 1 : shotW + Math.sign(sw - shotW) * Math.min(Math.abs(sw - shotW), dt * (still() ? 99 : 1.8));
      shotPose.snap = false;
      if (shotW > 0.001) {
        if (orbit.active || orbit.busy) orbit.reset();
        const e = ease(shotW);
        camera.position.lerpVectors(cur.pos, shotPose.pos, e);
        _sl.lerpVectors(cur.look, shotPose.look, e);
        const fov = FOV + (shotPose.fov - FOV) * e;
        if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.lookAt(_sl);
      } else {
        if (camera.fov !== FOV) { camera.fov = FOV; camera.updateProjectionMatrix(); }
        camera.position.copy(orbit.apply(camera, _p.copy(cur.pos), cur.look) ? _p : cur.pos);
        camera.lookAt(cur.look);
      }
      camera.updateMatrixWorld();
    },
  };
  return dir;
}

// Hero near-plane tidy (R3), run in scene.onBeforeRender for the hero camera after the crowd pool gather. The bottom of
// the hero frame is a people-free foreground band (dirt, boardwalk, props): pooled townsfolk and couriers whose feet
// land below FOOT_Y, or that stand within NEAR m of the lens, are dropped, so no blurry giant half-bodies at the near
// plane; idle ones in the mid-ground turn to face the lens. Meshes tagged `userData.heroNear` (plot street-front
// props) hide inside NEAR_PROP m. The hub's placeholder street props (well, wagon, trough, sign) sit on the street axis
// of every shot near the saloon, so they only show for the opening.
// R5: they face the lens 3/4 (turned FACE_Q toward the frame centre), not square-on.
const NEAR = 10, NEAR_PROP = 13, FOOT_Y = -0.55, FOOT_VIG = -0.3, FACE_R = 34, FACE_Q = 0.5;
const FACE_CLIPS = new Set([0, 4, 6, 12, 17]);
const _vp = new THREE.Matrix4(), _sph = new THREE.Sphere();
const hidden = [];
let tagged = null, scanIn = 0;
// R4: the staged vignette's open dirt (spectacle.clear = [[x, z, r], ...]) — no townsfolk or shipments inside it.
let zones = [];
const inZone = (x, z) => { for (const q of zones) { const dx = x - q[0], dz = z - q[1]; if (dx * dx + dz * dz < q[2] * q[2]) return true; } return false; };
export function heroNearCut(camera, x, y, z) {
  if (Math.hypot(camera.position.x - x, camera.position.z - z) < NEAR) return true;
  if (zones.length && inZone(x, z)) return true;
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  return _v.set(x, y, z).applyMatrix4(_vp).y < (zones.length ? FOOT_VIG : FOOT_Y);
}
function hide(o) { if (o.visible) { o.visible = false; hidden.push(o); } }
export function heroTidy(world, camera, game) {
  if (camera !== world.heroRig?.camera) { zones = []; return; }
  zones = world.spectacle?.clear || [];
  const hub = world.plots.get('hub');
  if (hub && game?.state?.bootstrap?.done && !world.spectacle?.scenes?.includes('opening')) hide(hub.group);
  if (!tagged || --scanIn <= 0) { tagged = []; scanIn = 240; world.scene.traverse((o) => { if (o.userData?.heroNear) tagged.push(o); }); }
  for (const o of tagged) {
    if (!o.geometry) continue;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    _sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
    if (Math.hypot(camera.position.x - _sph.center.x, camera.position.z - _sph.center.z) - _sph.radius < NEAR_PROP) hide(o);
  }
  const pool = world.pool;
  const n = pool?.mesh.visible ? pool.mesh.count : 0;
  if (!n) return;
  _vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const im = pool.mesh.instanceMatrix.array, bm = pool.blob.instanceMatrix.array, anim = pool.mesh.geometry.attributes.aAnim.array;
  const cx = camera.position.x, cz = camera.position.z, footY = zones.length ? FOOT_VIG : FOOT_Y;
  let cut = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 16, tx = im[o + 12], ty = im[o + 13], tz = im[o + 14];
    const sx = Math.hypot(im[o], im[o + 1], im[o + 2]), sy = Math.hypot(im[o + 4], im[o + 5], im[o + 6]), sz = Math.hypot(im[o + 8], im[o + 9], im[o + 10]);
    if (sy < 1e-6) continue;
    const dx = cx - tx, dz = cz - tz, hd = Math.hypot(dx, dz);
    if (hd < NEAR || (zones.length && inZone(tx, tz)) || _v.set(tx, ty, tz).applyMatrix4(_vp).y < footY) {
      for (let k = 0; k < 16; k++) im[o + k] = bm[o + k] = 0;
      cut++;
      continue;
    }
    if (hd < FACE_R && FACE_CLIPS.has(Math.round(anim[i * 3])) && im[o + 5] > sy * 0.98) {
      const h = Math.atan2(dx, dz) + (_v.x > 0 ? -FACE_Q : FACE_Q), c = Math.cos(h), s = Math.sin(h);
      im[o] = c * sx; im[o + 1] = 0; im[o + 2] = -s * sx;
      im[o + 8] = s * sz; im[o + 9] = 0; im[o + 10] = c * sz;
    }
  }
  pool.stats.nearCut = cut;
}
export function heroTidyDone() {
  while (hidden.length) hidden.pop().visible = true;
}
