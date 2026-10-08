// Shared human actor (Jon, Lyman, delivery man): procedural skinned body + keyed clips + face rig.
// See docs/TEAM_BRIEF.md (contracts) and docs/notes/{jon,cast}.md.
import * as THREE from '../../vendor/three/three.module.js';
import { buildHuman } from './human_body.js';
import { createFace } from './jon_face.js';
import { CH, CI, POS, N, UPPER, newPose, sampleClip, lerpPose, idlePose, walkPose, runPose, compileClip, S as SYM } from './jon_anim.js';
import { buildClips, CHAIR_FALL, SEAT } from './jon_clips.js';
import { addHumanClips } from './human_clips.js';
import { makeProp, disposeProp, GRIPS, makePoof, loadExternalProps } from './jon_props.js';

export { CHAIR_FALL, SEAT };
const D2R = Math.PI / 180;
const LOCO = new Set(['idle', 'walk', 'run']);
const TWO_HAND = new Set(['box', 'tv']);
const ALIAS = { chase: 'run', eat: 'sit_eat' };
// forearm y swings the bent forearm around the upper-arm axis (like an upper-arm twist)
const ORDER = CH.map(n => (n === 'farmL' || n === 'farmR' ? 'YXZ' : 'XYZ'));
const WALK_STRIDE = 1.45, RUN_STRIDE = 2.3;

export async function createHumanActor({ quality = 'high', look, name = 'jon', height = 1.82, headScale = 1.08, extraClips = null, variants = null } = {}) {
  await loadExternalProps();
  const body = buildHuman(quality, look);
  const { root, bones } = body;
  // outfit variants: extra cloth/shoe meshes bound to the same skeleton, toggled by setOutfit()
  const outfits = { normal: { cloth: body.meshes.cloth, shoe: body.meshes.shoe, mats: [body.mats.cloth, body.mats.shoe] } };
  for (const [vn, vlook] of Object.entries(variants || {})) {
    const vb = buildHuman(quality, vlook);
    const o = { mats: [vb.mats.cloth, vb.mats.shoe] };
    for (const k of ['cloth', 'shoe']) {
      const m = vb.meshes[k]; m.name = name + '_' + vn + '_' + k;
      root.add(m); m.bind(body.skeleton, new THREE.Matrix4()); m.visible = false; o[k] = m;
    }
    for (const [k, m] of Object.entries(vb.meshes)) if (k !== 'cloth' && k !== 'shoe') { m.geometry.dispose(); m.material.dispose(); }
    vb.skeleton.dispose();
    outfits[vn] = o;
  }
  let outfit = 'normal';
  const fur = { value: 0 };
  for (const o of Object.values(outfits)) addFurPatches(o.mats[0], fur);
  const face = createFace(bones, body.meshes.mouth);
  bones.head.scale.setScalar(headScale);
  const clips = buildClips();
  addHumanClips(clips);
  extraClips?.(clips);
  const anims = ['idle', 'walk', 'run', ...Object.keys(clips)];

  // sockets
  const sockets = { head: bones.head, hips: bones.hips };
  const mk = (parent, name, p, r = [0, 0, 0]) => {
    const o = new THREE.Object3D(); o.name = name; o.position.set(...p); o.rotation.set(...r); parent.add(o); return o;
  };
  // grip: palm centre of a loose fist; held items extend along +Z (forward) when the arm hangs
  sockets.handR = mk(bones.handR, name + '_handR', [0.012, -0.065, 0.01]);
  sockets.handL = mk(bones.handL, name + '_handL', [-0.012, -0.065, 0.01]);
  sockets.face = mk(bones.head, name + '_face', [0, 0.08, 0.17]);
  sockets.butt = mk(bones.hips, name + '_butt', [0, -0.09, -0.13]);
  // two-handed carry (box, tv): in front of the belly, follows the chest
  sockets.carry = mk(bones.chest, name + '_carry', [0, -0.16, 0.3]);

  const pose = newPose(), loco = newPose(), tmpA = newPose(), tmpB = newPose(), act = newPose(), snap = newPose();
  let t = 0, speedTgt = 0, speed = 0, phase = 0, forcedSpeed = null, lastPhase = 0;
  let action = null;            // {name, clip, t, speed, once, resolve, firedEv:Set}
  let xfade = 1, xdur = 0.15;   // blend from snap -> live pose
  let userExpr = 'neutral';
  let lookTarget = null;
  const lookCur = new THREE.Vector2();
  const listeners = {};
  const held = { R: null, L: null };
  const fx = [];

  const emit = (ev, data) => { (listeners[ev] || []).forEach(f => f(data)); };

  function startXfade(fade) { snap.set(pose); xfade = fade > 0 ? 0 : 1; xdur = Math.max(fade, 1e-3); }

  function endAction(reason) {
    if (!action) return;
    const a = action; action = null;
    clearClipProps(a);
    face.set(userExpr);
    if (!(userExpr === 'talk')) face.setTalking(false);
    a.resolve?.(reason);
  }

  function play(name, opts = {}) {
    if (ALIAS[name] && !clips[name]) name = ALIAS[name];
    const { speed: spd = 1, fade = 0.15 } = opts;
    if (LOCO.has(name)) {
      if (action) { startXfade(fade); endAction('replaced'); }
      forcedSpeed = name === 'idle' ? null : name === 'walk' ? 1.3 : 3.2;
      if (name === 'idle') speedTgt = 0;
      return Promise.resolve();
    }
    const clip = clips[name];
    if (!clip) { console.warn('[' + api.name + '] no clip', name); return Promise.resolve(); }
    startXfade(clip.fadeIn ?? fade);
    if (action) endAction('replaced');
    const loop = opts.loop ?? clip.loop;
    return new Promise((resolve) => {
      action = { name, clip, t: 0, speed: spd, loop, once: !!opts.once, resolve, fired: new Set(), spawned: [] };
      if (clip.face) applyFaceTrack(action, 0, true);
    });
  }

  function applyFaceTrack(a, tt, init) {
    let cur = null;
    for (const [ft, ex] of a.clip.face) if (tt >= ft) cur = ex;
    if (cur && cur !== a.faceNow) {
      a.faceNow = cur;
      if (cur === 'talk') face.setTalking(true);
      else { face.set(cur); if (a.clip.talk) face.setTalking(true); }
    }
    if (init && a.clip.talk) face.setTalking(true);
  }

  // ---- props ----
  // held = {name, obj (grip wrapper), inner (the prop), prevParent}; the prop sits in a grip group so
  // game-supplied props (origin at their bottom centre, +Y up) get a sensible hand pose.
  function attach(side, name, obj, fromClip) {
    detach(side);
    const inner = obj || makeProp(name);
    if (!inner) return null;
    const prevParent = obj ? obj.parent : null;
    const grip = new THREE.Group(); grip.name = 'jon_grip_' + name;
    const g = GRIPS[name];
    if (g) { grip.position.set(side === 'L' ? -g.pos[0] : g.pos[0], g.pos[1], g.pos[2]); grip.rotation.set(...g.rot); }
    if (obj) { obj.position.set(0, 0, 0); obj.quaternion.identity(); }
    grip.add(inner);
    (TWO_HAND.has(name) ? sockets.carry : sockets['hand' + side]).add(grip);
    held[side] = { name, obj: grip, inner, fromClip, fallback: !obj, prevParent };
    if (inner.userData.inner) grip.userData.inner = inner.userData.inner;
    return inner;
  }
  // keep=true hands the prop back detached; otherwise fallbacks are disposed and game props return to their old parent
  function detach(side, keep) {
    const h = held[side]; if (!h) return null;
    held[side] = null;
    if (!h.fallback && h.prevParent && !keep) { h.prevParent.attach(h.inner); h.obj.parent?.remove(h.obj); return h.inner; }
    h.obj.parent?.remove(h.obj);
    if (keep) { h.inner.removeFromParent(); return h.inner; }
    if (h.fallback) disposeProp(h.inner);
    return h.inner;
  }
  function holdProp(name, obj, side = 'R') {
    if (!name) { detach(side); return null; }
    return attach(side, name, obj, false);
  }
  function clearClipProps(a) {
    for (const s of ['R', 'L']) if (held[s]?.fromClip === a) detach(s);
  }
  function runPropTrack(a, t0, t1) {
    for (const ev of a.clip.props || []) {
      const [pt, name, o = {}] = ev;
      if (pt < t0 || pt >= t1 || a.fired.has(ev)) continue;
      a.fired.add(ev);
      const side = o.side || 'R';
      if (name === null) {
        if (held[side]?.fromClip === a) {
          if (o.throw) throwHeld(side); else detach(side);
        }
        continue;
      }
      if (held[side] && !held[side].fromClip) continue;   // keep game-supplied prop
      const obj = attach(side, name, null, a);
      if (o.conjure && obj) {
        obj.userData.pop = 0;
        const p = makePoof(); sockets['hand' + side].add(p); fx.push(p);
        emit('conjure', { object: obj });
      }
    }
  }
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();
  function throwHeld(side) {
    const h = held[side]; if (!h) return;
    const o = h.inner.userData.inner || h.inner;
    o.getWorldPosition(_p); o.getWorldQuaternion(_q);
    h.obj.parent?.remove(h.obj);
    _v.set(0, 0.15, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const hasL = (listeners.throw || []).length > 0;
    held[side] = null;
    o.parent?.remove(o);
    o.position.copy(_p); o.quaternion.copy(_q);
    const data = { object: o, pos: _p.clone(), quat: _q.clone(), dir: _v.clone(), speed: 7 };
    if (hasL) emit('throw', data);
    else if (h.fallback) disposeProp(h.inner);
  }

  // ---- update ----
  function computeLoco(dt) {
    const target = forcedSpeed ?? speedTgt;
    speed += (target - speed) * (1 - Math.exp(-dt * 6));
    const wRun = THREE.MathUtils.smoothstep(speed, 1.7, 2.7);
    const stride = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * wRun;
    lastPhase = phase;
    phase = (phase + speed * dt / stride) % 1;
    if (speed > 0.15) {
      const crossed = (a, b, x) => (a < x && b >= x) || (b < a && (x > a || x <= b));
      if (crossed(lastPhase, phase, 0.0) || crossed(lastPhase, phase, 0.5)) emit('step', { run: wRun > 0.5, speed });
    }
    idlePose(t, loco);
    const wMove = THREE.MathUtils.smoothstep(speed, 0.05, 0.5);
    if (wMove > 0) {
      walkPose(phase, Math.min(1, 0.45 + speed / 1.4 * 0.55), tmpA);
      if (wRun > 0) { runPose(phase, Math.min(1, 0.6 + (speed - 1.7) / 2), tmpB); lerpPose(tmpA, tmpB, wRun, tmpA); }
      lerpPose(loco, tmpA, wMove, loco);
    }
    if (wRun > 0.5 && !action) { if (face.name !== 'angry') face.set('angry'); }
    else if (!action && face.name === 'angry' && userExpr !== 'angry') face.set(userExpr);
  }

  const _e = new THREE.Euler(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();
  function applyPose() {
    for (let i = 0; i < CH.length; i++) {
      const b = bones[CH[i]], k = i * 3;
      _e.set(pose[k] * D2R, pose[k + 1] * D2R, pose[k + 2] * D2R, ORDER[i]);
      b.quaternion.setFromEuler(_e);
    }
    for (const sd of ['L', 'R']) {
      if (!held[sd]) continue;
      const g = sd === 'L' ? -1 : 1;
      bones['fing' + sd].quaternion.setFromEuler(_e.set(0, 0, g * 75 * D2R));
      bones['fing2' + sd].quaternion.setFromEuler(_e.set(0, 0, g * 85 * D2R));
      bones['thumb' + sd].quaternion.setFromEuler(_e.set(0, 0, g * 25 * D2R));
    }
    const hb = bones.hips.userData.bind;
    bones.hips.position.set(hb.x + pose[POS], hb.y + pose[POS + 1], hb.z + pose[POS + 2]);
  }

  function update(dt) {
    dt = Math.min(dt, 0.1);
    t += dt;
    computeLoco(dt);
    pose.set(loco);
    if (action) {
      const a = action, c = a.clip;
      const t0 = a.t;
      a.t += dt * a.speed;
      let ended = false;
      if (a.t >= c.dur) {
        if (a.loop && !a.once) {
          runPropTrack(a, t0, c.dur + 1e-6); fireEvents(a, t0, c.dur + 1e-6);
          const lf = c.loopFrom ?? 0;
          a.t = lf + (a.t - c.dur) % Math.max(0.01, c.dur - lf);
          a.fired = new Set([...a.fired].filter(e => (Array.isArray(e) ? e[0] : e.t) < lf));
          a.cycle = (a.cycle || 0) + 1;
          if (a.cycle === 1) { const r = a.resolve; a.resolve = null; r?.('cycle'); }
        } else { a.t = c.dur; ended = true; }
      }
      runPropTrack(a, Math.min(t0, a.t), a.t + (ended ? 1e-6 : 0));
      fireEvents(a, Math.min(t0, a.t), a.t + (ended ? 1e-6 : 0));
      if (c.face) applyFaceTrack(a, a.t);
      sampleClip(c, a.t, act);
      if (c.post) c.post(a.t, act, { speed, phase, loco });
      if (c.mask === 'upper') lerpPose(pose, act, 1, pose, UPPER);
      else pose.set(act);
      if (ended && !c.hold) { applyLookAdd(dt); applyPose(); startXfade(c.fadeOut ?? 0.25); endAction('done'); }
      else if (ended && c.hold && !a.doneHold) { a.doneHold = true; const r = a.resolve; a.resolve = null; r?.('done'); }
    }
    if (xfade < 1) {
      xfade = Math.min(1, xfade + dt / xdur);
      const w = xfade * xfade * (3 - 2 * xfade);
      lerpPose(snap, pose, w, pose);
    }
    applyLookAdd(dt);
    applyPose();
    root.updateMatrixWorld(true);
    face.update(dt, { look: lookTarget ? faceLook : null });
    if (face.stars.visible) {   // keep the dizzy stars above the head in world-up, whatever the pose
      if (face.stars.parent !== root) root.add(face.stars);
      bones.head.getWorldPosition(_a); _a.y += 0.36; root.worldToLocal(_a); face.stars.position.copy(_a);
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const p = fx[i];
      if (!p.userData.update(dt)) { p.parent?.remove(p); p.userData.dispose(); fx.splice(i, 1); }
    }
    for (const s of ['R', 'L']) {
      const h = held[s];
      if (h && h.inner.userData.pop !== undefined) {
        const u = (h.inner.userData.pop = Math.min(1, h.inner.userData.pop + dt * 5));
        const sc = u < 1 ? (1 - Math.pow(1 - u, 3)) * (1 + 0.35 * Math.sin(u * Math.PI)) : 1;
        h.obj.scale.setScalar(Math.max(0.01, sc));
        h.obj.rotation.y = (1 - u) * 6;
        if (u >= 1) delete h.inner.userData.pop;
      }
    }
  }

  function fireEvents(a, t0, t1) {
    if (!a.clip.ev) return;
    for (const [name, et] of Object.entries(a.clip.ev)) {
      const key = { t: et, name };
      if (et >= t0 && et < t1 && !a['ev_' + name]) {
        a['ev_' + name] = true;
        emit(name, { clip: a.name });
      }
      if (a.loop && et < t0 && t1 < t0) a['ev_' + name] = false;
    }
  }

  // ---- look-at (additive on neck/head + eyes) ----
  const faceLook = new THREE.Vector2();
  const _lt = new THREE.Vector3(), _hp = new THREE.Vector3();
  function applyLookAdd(dt) {
    let yaw = 0, pitch = 0;
    if (lookTarget) {
      bones.neck.getWorldPosition(_hp);
      _lt.copy(lookTarget);
      root.updateMatrixWorld();
      _inv.copy(root.matrixWorld).invert();
      _lt.applyMatrix4(_inv); _hp.applyMatrix4(_inv);
      _lt.sub(_hp); _lt.y -= 0.18;
      yaw = Math.atan2(_lt.x, _lt.z);
      pitch = -Math.atan2(_lt.y, Math.hypot(_lt.x, _lt.z));
      if (Math.abs(yaw) > 2.4) yaw = 0;
      yaw = THREE.MathUtils.clamp(yaw, -1.2, 1.2); pitch = THREE.MathUtils.clamp(pitch, -0.6, 0.7);
    }
    const k = 1 - Math.exp(-dt * 6);
    lookCur.x += (yaw - lookCur.x) * k; lookCur.y += (pitch - lookCur.y) * k;
    const yd = lookCur.x / D2R, pd = lookCur.y / D2R;
    pose[CI.neck + 1] += yd * 0.35; pose[CI.head + 1] += yd * 0.45; pose[CI.chest + 1] += yd * 0.15;
    pose[CI.neck] += pd * 0.4; pose[CI.head] += pd * 0.5;
    faceLook.set(THREE.MathUtils.clamp(yaw - lookCur.x, -0.45, 0.45), THREE.MathUtils.clamp(-(pitch - lookCur.y), -0.3, 0.3));
  }

  // ---- hit zones ----
  const P = {}; const _a = new THREE.Vector3(), _b = new THREE.Vector3();
  const segDist = (p, a, b) => {
    _v.copy(b).sub(a); const l2 = _v.lengthSq();
    const tt = l2 > 0 ? THREE.MathUtils.clamp(_p.copy(p).sub(a).dot(_v) / l2, 0, 1) : 0;
    return _p.copy(a).addScaledVector(_v, tt).distanceTo(p);
  };
  function zoneDistances(wp) {
    root.updateMatrixWorld(true);
    const wpos = (o, off, out) => out.copy(off ? off : _a.set(0, 0, 0)).applyMatrix4(o.matrixWorld);
    const face = wpos(sockets.face, null, P.face || (P.face = new THREE.Vector3()));
    const butt = wpos(sockets.butt, null, P.butt || (P.butt = new THREE.Vector3()));
    const head = wpos(bones.head, _b.set(0, 0.12, 0.03), P.head || (P.head = new THREE.Vector3()));
    const d = {};
    d.face = Math.min(face.distanceTo(wp), head.distanceTo(wp) + 0.04) - 0.12;
    d.butt = butt.distanceTo(wp) - 0.13;
    let leg = 9;
    for (const s of ['L', 'R']) {
      const th = new THREE.Vector3().setFromMatrixPosition(bones['thigh' + s].matrixWorld);
      const sh = new THREE.Vector3().setFromMatrixPosition(bones['shin' + s].matrixWorld);
      const ft = new THREE.Vector3().setFromMatrixPosition(bones['foot' + s].matrixWorld);
      const to = new THREE.Vector3().setFromMatrixPosition(bones['toe' + s].matrixWorld);
      leg = Math.min(leg, segDist(wp, th, sh) - 0.08, segDist(wp, sh, ft) - 0.065, segDist(wp, ft, to) - 0.07);
    }
    d.leg = leg;
    const hp = new THREE.Vector3().setFromMatrixPosition(bones.hips.matrixWorld);
    const ch = new THREE.Vector3().setFromMatrixPosition(bones.neck.matrixWorld);
    let bodyD = segDist(wp, hp, ch) - 0.15;
    for (const s of ['L', 'R']) {
      const u = new THREE.Vector3().setFromMatrixPosition(bones['uarm' + s].matrixWorld);
      const f = new THREE.Vector3().setFromMatrixPosition(bones['farm' + s].matrixWorld);
      const h = new THREE.Vector3().setFromMatrixPosition(bones['hand' + s].matrixWorld);
      bodyD = Math.min(bodyD, segDist(wp, u, f) - 0.06, segDist(wp, f, h) - 0.07);
    }
    d.body = bodyD;
    return d;
  }
  // Zone rules (see notes): face only when the point is near his face (seated/bending/lying), butt for points
  // behind and around the pelvis, leg for anything below the hips, otherwise body.
  const _hl = new THREE.Vector3(), _hm = new THREE.Matrix4();
  function hitZone(wp) {
    root.updateMatrixWorld(true);
    sockets.face.getWorldPosition(_a);
    if (_a.distanceTo(wp) < 0.36) return 'face';
    _hm.copy(bones.hips.matrixWorld).invert();
    _hl.copy(wp).applyMatrix4(_hm);          // hips space: +y up the spine, +z belly
    const seated = action && /sit|stand_up|stunned|fall_back/.test(action.name);
    if (!seated && _hl.z < -0.03 && _hl.y > -0.45 && _hl.y < 0.2) return 'butt';
    if (seated && _hl.z < -0.05 && _hl.y > -0.25 && _hl.y < 0.2) return 'butt';
    const d = zoneDistances(wp);
    return d.leg < d.body ? 'leg' : 'body';
  }
  function hitTest(wp, radius = 0.15) {
    const d = zoneDistances(wp);
    const m = Math.min(d.face, d.butt, d.leg, d.body);
    return m <= radius ? hitZone(wp) : null;
  }

  const api = {
    root, sockets, anims,
    name, height, radius: 0.28, seatHeight: 0.46,
    bones, clipInfo: Object.fromEntries(Object.entries(clips).map(([k, c]) => [k, { dur: c.dur, loop: !!c.loop, hold: !!c.hold, ev: c.ev || {} }])),
    tris: body.tris,
    update, play,
    // setMove(>0.05) cancels a full-body clip and resumes locomotion; setMove(0) leaves a playing clip alone.
    setMove(s) {
      speedTgt = Math.max(0, s); forcedSpeed = null;
      if (s > 0.05 && action && action.clip.mask !== 'upper' && !action.clip.moveOk) { startXfade(0.2); endAction('moved'); }
    },
    // sits down onto seat (an Object3D at the seat surface centre, +Z to the table), then loops `then`
    sitAt(seat, then = 'sit') {
      if (root.parent === seat && action && /sit|stunned|fall_back/.test(action.name)) return play(then, { fade: 0.25 });
      seat.add(root); root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
      pose[POS + 1] -= SEAT.h; pose[POS + 2] += SEAT.front;
      const p = play('sit_down', { fade: 0.2 });
      p.then(r => { if (r === 'done' && action?.name === 'sit_down' && then !== 'sit_down') play(then, { fade: 0.25 }); });
      return p;
    },
    seatFloorPoint() {
      root.updateMatrixWorld(true);
      const p = new THREE.Vector3(0, -SEAT.h, SEAT.front).applyMatrix4(root.matrixWorld);
      const q = root.getWorldQuaternion(new THREE.Quaternion());
      const f = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      return { pos: p, rotY: Math.atan2(f.x, f.z) };
    },
    leaveSeat(parent) {
      const { pos, rotY } = api.seatFloorPoint();
      const par = parent || root.parent?.parent || root.parent;
      par.add(root); par.updateMatrixWorld(true);
      root.position.copy(par.worldToLocal(pos)); root.rotation.set(0, rotY, 0);
      pose[POS + 1] += SEAT.h; pose[POS + 2] -= SEAT.front;
      startXfade(0.25); endAction('left');
      root.updateMatrixWorld(true);
    },
    get speed() { return speed; },
    get current() { return action ? action.name : (speed > 2 ? 'run' : speed > 0.1 ? 'walk' : 'idle'); },
    lookAt(v) { lookTarget = v ? (v.isVector3 ? v.clone() : new THREE.Vector3(v.x, v.y, v.z)) : null; },
    hitZone, hitTest, zoneDistances,
    addClip(name, def) { clips[name] = compileClip({ name, ...def }); if (!anims.includes(name)) anims.push(name); return clips[name]; },
    sym: SYM,
    get outfit() { return outfit; },
    outfits: Object.keys(outfits),
    setOutfit(n) {
      if (!outfits[n]) n = 'normal';
      outfit = n;
      for (const [k, o] of Object.entries(outfits)) { o.cloth.visible = k === n; o.shoe.visible = k === n; }
    },
    // 0..1 orange cat-hair patches over the clothes (L3 shedding)
    setFur(v) { fur.value = Math.max(0, Math.min(1, v || 0)); },
    setExpression(e) { userExpr = e || 'neutral'; face.set(userExpr); face.setTalking(userExpr === 'talk'); },
    talk(on = true) { face.setTalking(on); },
    holdProp,
    dropProp(side = 'R') { return detach(side, true); },
    get held() { return { R: held.R?.name ?? null, L: held.L?.name ?? null }; },
    on(ev, fn) { (listeners[ev] ||= []).push(fn); return () => api.off(ev, fn); },
    off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
    stop(fade = 0.2) { if (action) { startXfade(fade); endAction('stopped'); } },
    dispose() {
      detach('R'); detach('L');
      root.parent?.remove(root);
      Object.values(body.meshes).forEach(m => m.geometry.dispose());
      Object.values(body.mats).forEach(m => m.dispose());
      for (const [k, o] of Object.entries(outfits)) if (k !== 'normal') { o.cloth.geometry.dispose(); o.shoe.geometry.dispose(); o.mats.forEach(m => m.dispose()); }
      body.skeleton.dispose(); face.dispose();
    },
  };
  update(0);
  return api;
}

// shed-fur patches: orange tufty noise blotches whose coverage grows with fur.value
function addFurPatches(mat, fur) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFur = fur;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFurP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vFurP; uniform float uFur;
float fh(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float fn3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fh(i),fh(i+vec3(1,0,0)),f.x),mix(fh(i+vec3(0,1,0)),fh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(fh(i+vec3(0,0,1)),fh(i+vec3(1,0,1)),f.x),mix(fh(i+vec3(0,1,1)),fh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uFur > 0.001) {
  float n = fn3(vFurP * 14.0) * 0.65 + fn3(vFurP * 45.0) * 0.35;
  float hair = fn3(vFurP * vec3(400.0, 90.0, 400.0));
  float m = smoothstep(1.0 - uFur * 1.05, 1.0 - uFur * 1.05 + 0.08, n) * (0.75 + 0.25 * hair);
  diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.78, 0.19, 0.015), vec3(0.92, 0.38, 0.07), hair), m);
}`);
  };
  mat.customProgramCacheKey = () => 'human-cloth-fur-v1';
}

// createHuman({kind:'delivery'}): extra humans on the same rig
export async function createHuman({ kind = 'delivery', quality = 'high' } = {}) {
  if (kind === 'delivery') {
    const { DELIVERY_LOOK } = await import('./human_delivery.js');
    return createHumanActor({ quality, look: DELIVERY_LOOK, name: 'delivery', height: 1.78 });
  }
  throw new Error('createHuman: unknown kind ' + kind);
}
