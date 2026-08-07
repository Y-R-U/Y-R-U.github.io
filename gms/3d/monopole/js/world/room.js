// The player's quarters — a real box standing inside the live Tamber Reach with a hole in one
// wall. Nothing outside the window is faked: the room is parented into the running ReachScene,
// so the station, the hulls, the nebula and the star in the glass are the ones the company is
// actually trading in.
//
// Room space is metres, origin at the floor centre, window in the −Z wall. The tier decides how
// big the box is, how it is dressed, and where in the system it stands.

import * as THREE from 'three';
import { defineScenario, frameCamera } from '../scenarios.js';
import { showroom } from '../showroom/index.js';
import { camera } from './camera.js';
import { ReachScene, reachLighting } from './scene.js';
import { softPoints } from './fx.js';
import { rnd } from './kit/geom.js';
import quarters from '../../content/quarters.js';
import {
  buckets, meshesFrom, shell, desk, deskFrame, terminalRig, terminalFrame, bunk, crates,
  stool, chair, clutter, rug, plant, ibox, paneSheen, lightShaft, screenTexture, disposeScreenTexture,
  setRoomBounds, setRoomLamps, setRoomGlow, roomUniforms,
} from './kit/interior.js';

const TIERS = new Map(quarters.map(t => [t.id, t]));
export const allTiers = () => quarters.map(t => t.id);
export const tierSpec = id => TIERS.get(id) || quarters[0];

const U = roomUniforms();
let knobsDone = false;

export function registerRoomKnobs(q) {
  if (knobsDone) return;
  knobsDone = true;
  const G = 'Quarters';
  q.register({ key: 'roomKey', label: 'Window key', type: 'range', min: 0, max: 24, step: 0.05, default: 7.4, group: G },
    v => { U.uKeyGain.value = v; });
  q.register({ key: 'roomFill', label: 'Window soft fill', type: 'range', min: 0, max: 300, step: 1, default: 84, group: G },
    v => { U.uSkyGain.value = v; });
  q.register({ key: 'roomSpec', label: 'Window specular', type: 'range', min: 0, max: 4, step: 0.05, default: 0.9, group: G },
    v => { U.uSpecGain.value = v; });
  q.register({ key: 'roomEnv', label: 'Interior env bleed', type: 'range', min: 0, max: 1, step: 0.01, default: 0.06, group: G },
    v => { U.uInEnv.value = v; });
  q.register({ key: 'roomBounce', label: 'Deck bounce', type: 'range', min: 0, max: 2.5, step: 0.01, default: 0.55, group: G },
    v => { U.uBounce.value = v; });
  q.register({ key: 'roomShell', label: 'Shell exterior dim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.20, group: G },
    v => { U.uShellDim.value = v; });
  q.register({ key: 'roomAo', label: 'Corner occlusion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.70, group: G },
    v => { U.uAo.value = v; });
  q.register({ key: 'roomGrime', label: 'Interior wear', type: 'range', min: 0, max: 1.5, step: 0.02, default: 0.34, group: G },
    v => { U.uGrime.value = v; });
  q.register({ key: 'roomGlow', label: 'Practical lights', type: 'range', min: 0, max: 6, step: 0.05, default: 1.1, group: G },
    v => { setRoomGlow(v); ROOMS.forEach(r => r.setLampPower(v)); });
  q.register({ key: 'roomShaft', label: 'Light shaft', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { ROOMS.forEach(r => r.setShaftPower(v)); });
  q.register({ key: 'roomDust', label: 'Shaft dust', type: 'range', min: 0, max: 3, step: 0.02, default: 1, group: G },
    v => { ROOMS.forEach(r => r.setDustPower(v)); });
}

const ROOMS = new Set();

export class RoomScene {
  constructor(app, world, { tier = 'dockbox', seed = 0 } = {}) {
    this.app = app;
    this.world = world;
    this.seed = seed;
    this.t = 0;
    this.group = new THREE.Group();
    this.group.name = 'quarters';
    this.group.userData.quarters = true;
    this._inv = new THREE.Matrix4();
    registerRoomKnobs(app.quality);
    ROOMS.add(this);
    this.setTier(tier);
  }

  setTier(id) {
    const spec = tierSpec(id);
    if (this.tier === spec.id) return;
    this.clear();
    this.tier = spec.id;
    this.spec = spec;
    build(this, spec);
    setRoomBounds(spec);
    setRoomLamps(this.lamps);
    const q = this.app.quality;
    this.setLampPower(q.get('roomGlow') ?? 1.1);
    this.setShaftPower(q.get('roomShaft') ?? 1);
    this.setDustPower(q.get('roomDust') ?? 1);
    U.uKeyGain.value = spec.light.gain;
    U.uSkyGain.value = spec.light.fill;
  }

  setLampPower(v) {
    this.lampPower = v;
    if (this.lamps) setRoomLamps(this.lamps.map(l => [...l.slice(0, 5), l[5] * v]));
    setRoomGlow(v);
  }

  setShaftPower(v) { this.shaftPower = v; if (this.shaft) this.shaft.material.uniforms.uPower.value = v * (this.spec.light.shaft ?? 1); }

  setDustPower(v) { this.dustPower = v; if (this.dust) this.dust.material.uniforms.uPower.value = v * 1.6; }

  // Ambient life: the shaft's dust turning over, the terminal's refresh, the strip warming up.
  update(dt) {
    this.t += dt;
    const t = this.t;

    if (this.screen) {
      const f = 1 + Math.sin(t * 5.1) * 0.018 + Math.sin(t * 23.7) * 0.010
        + (Math.sin(t * 1.3) > 0.985 ? -0.22 : 0);
      this.screen.material.color.setScalar(1.16 * f);
    }

    if (this.dust) {
      const p = this.dust.geometry.attributes.position;
      const b = this.dustBase;
      for (let i = 0; i < p.count; i++) {
        const ph = b[i * 4 + 3];
        p.setXYZ(i,
          b[i * 4] + Math.sin(t * 0.24 + ph) * 0.075,
          b[i * 4 + 1] + Math.sin(t * 0.17 + ph * 1.7) * 0.055 + Math.sin(t * 0.06 + ph) * 0.02,
          b[i * 4 + 2] + Math.cos(t * 0.21 + ph * 0.6) * 0.07);
      }
      p.needsUpdate = true;
    }

    // the shader works in room space, so the eye has to come back the other way
    this.group.updateMatrixWorld();
    this._inv.copy(this.group.matrixWorld).invert();
    U.uEye.value.copy(this.app.camera.position).applyMatrix4(this._inv);
  }

  place() {
    const s = this.spec.site;
    this.group.position.set(...s.at);
    this.group.rotation.copy(siteEuler(s));
    this.group.updateMatrixWorld();
  }

  clear() {
    for (const c of [...this.group.children]) {
      c.traverse?.(n => n.geometry?.dispose());
      this.group.remove(c);
    }
    this.screen = this.shaft = this.dust = this.terminal = null;
  }

  dispose() {
    ROOMS.delete(this);
    this.clear();
    this.group.parent?.remove(this.group);
    if (stage?.room === this) stage = null;
    if (!ROOMS.size) disposeScreenTexture();
  }
}

function build(room, spec) {
  const R = rnd(0x9e37 + spec.id.length * 7919 + room.seed * 2654435761);
  const g = buckets();
  const pal = 'ferrous';

  shell(g, spec, R);
  const dk = deskFrame(spec);
  if (spec.dress.desk) desk(g, spec);
  if (spec.dress.terminal) terminalRig(g, spec, dk);
  const bk = spec.dress.bunk ? bunk(g, spec) : null;
  if (spec.dress.crates) crates(g, spec, R, spec.dress.crates);
  if (spec.dress.seat === 'stool') stool(g, spec, dk);
  else if (spec.dress.seat === 'chair') chair(g, spec, dk);
  if (spec.dress.desk) clutter(g, spec, dk, R);
  if (spec.dress.rug) rug(g, spec);
  if (spec.dress.plant) plant(g, spec);
  if (spec.dress.hull) ownHull(g, spec);

  meshesFrom(g, pal, room.group);

  const tf = terminalFrame(spec, dk);
  if (spec.dress.terminal) {
    const s = new THREE.Mesh(
      new THREE.PlaneGeometry(tf.size[0], tf.size[1]),
      new THREE.MeshBasicMaterial({ map: screenTexture(), fog: false, toneMapped: true }));
    s.position.set(tf.pos[0], tf.pos[1], tf.pos[2]);
    s.rotation.set(tf.rot[0], tf.rot[1], 0);
    s.translateZ(0.019);
    s.name = 'quarters:terminal';
    s.userData.terminal = true;
    s.userData.quarters = spec.id;
    room.group.add(s);
    room.screen = s;
    room.terminal = s;
  }

  room.group.add(paneSheen(spec));

  const shaftLen = Math.min(spec.room.d * 1.9, 9);
  room.shaft = lightShaft(spec, shaftLen);
  room.group.add(room.shaft);

  room.dust = shaftDust(spec, shaftLen, room);
  room.group.add(room.dust);

  // The practicals, in room space: the strip under the desk shelf, the terminal's own spill, the
  // reading lamp on the bunk. They are the coloured fill and the only warm thing in the frame.
  const warm = spec.light.warm;
  const lamps = [
    [dk.x0 + 0.36, 1.34, dk.zc, 0.85, warm, 2.0],
    [tf.pos[0] + 0.16, tf.pos[1], tf.pos[2] + 0.12, 0.46, warm, 1.0],
  ];
  if (bk && spec.dress.bunklight) lamps.push([bk.x1 - 0.30, bk.top + 0.52, bk.zc - bk.len * 0.10, 0.95, warm, 2.2]);
  room.lamps = lamps;
  room.place();
}

// A slice of the hull the cabin is cut into, so the top tier's window has a foreground of its own
// ship instead of opening straight onto vacuum. Outside the interior box, so it takes the real
// star key like every other hull in the frame.
function ownHull(g, spec) {
  const { w, h, d } = spec.room;
  const zf = -d / 2;
  g.metal.push(ibox(w * 2.6, 0.9, 4.2, 0, -0.65, zf - 2.2, { ao: 0.55 }));
  g.metal.push(ibox(w * 2.3, 0.35, 3.6, 0, -0.15, zf - 2.4, { ao: 0.70 }));
  for (let i = -3; i <= 3; i++) {
    g.metal.push(ibox(0.22, 0.55, 3.8, i * w * 0.36, -0.35, zf - 2.3, { ao: 0.6 }));
  }
  g.metal.push(ibox(w * 2.7, h * 0.5, 0.5, 0, -1.2, zf - 4.2, { rx: 0.35, ao: 0.7 }));
  g.glow.push(ibox(w * 2.2, 0.05, 0.10, 0, 0.06, zf - 4.0, { col: [0.3, 0.8, 1.0] }));
}

// Motes seeded inside the shaft prism only. Dust outside it would be lit by nothing and read as
// fireflies in a dark room.
function shaftDust(spec, len, room) {
  const win = spec.win;
  const az = (spec.light.az || 0) * Math.PI / 180, el = (spec.light.el || 0) * Math.PI / 180;
  const dir = new THREE.Vector3(-Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el));
  const cx = win.x || 0, cy = win.sill + win.h / 2, cz = -spec.room.d / 2;
  const R = rnd(0x4711 + spec.id.length * 131);
  const n = Math.round(150 * Math.min(1.6, win.w * win.h * 0.6));
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  const base = new Float32Array(n * 4);
  const c = new THREE.Color(spec.light.key).convertSRGBToLinear();
  for (let i = 0; i < n; i++) {
    const t = R() ** 0.7;
    const s = 1 + 0.12 * t;
    const x = cx + (R() - 0.5) * win.w * 0.94 * s + dir.x * len * t;
    const y = cy + (R() - 0.5) * win.h * 0.94 * s + dir.y * len * t;
    const z = cz + dir.z * len * t;
    base[i * 4] = x; base[i * 4 + 1] = y; base[i * 4 + 2] = z; base[i * 4 + 3] = R() * 6.28;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    const f = (0.35 + 0.65 * R()) * (1 - t * 0.55);
    col[i * 3] = c.r * f; col[i * 3 + 1] = c.g * f; col[i * 3 + 2] = c.b * f;
    size[i] = 0.006 + 0.011 * R() ** 2;
  }
  room.dustBase = base;
  const p = softPoints(pos, col, size, { soft: 1.6, power: 1.6, max: 9 });
  p.name = 'quarters:dust';
  p.renderOrder = 5;
  return p;
}

// Yaw about world up first, then pitch about the room's own X — YXZ, or a pitched room would
// also roll. `pitch` is degrees of look-down through the window.
const siteEuler = s => new THREE.Euler(-(s.pitch || 0) * Math.PI / 180, -s.face * Math.PI / 180, 0, 'YXZ');

// ── framings ─────────────────────────────────────────────────────────────────
//
// World coordinates, because that is what the camera rig wants: the room's own placement is
// baked in here rather than left for the caller to compose.

export function roomShots(tier) {
  const spec = tierSpec(tier);
  const { w, h, d } = spec.room;
  const win = spec.win;
  const dk = deskFrame(spec);
  const tf = terminalFrame(spec, dk);
  const eye = Math.min(1.62, h - 0.62);
  const wy = win.sill + win.h * 0.46;

  const local = {
    enter: { pos: [w * 0.30, eye, d * 0.40], look: [-w * 0.20, win.sill + win.h * 0.28, -d / 2 - 0.3], fov: 60 },
    desk: { pos: [w * 0.30, 1.30, dk.zc + dk.len * 0.9], look: [dk.x0 + 0.24, 0.92, dk.zc - dk.len * 0.15], fov: 54 },
    terminal: { pos: [tf.pos[0] + 0.74, tf.pos[1] + 0.20, tf.pos[2] + 0.62], look: tf.pos, fov: 40 },
    window: { pos: [w * 0.16, win.sill + win.h * 0.60, -d / 2 + 1.85], look: [-w * 0.02, wy * 0.96, -d / 2 - 9], fov: 48 },
  };

  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...spec.site.at),
    new THREE.Quaternion().setFromEuler(siteEuler(spec.site)),
    new THREE.Vector3(1, 1, 1));
  const v = new THREE.Vector3();
  const toWorld = a => { v.set(...a).applyMatrix4(m); return [v.x, v.y, v.z]; };

  const out = {};
  for (const k of Object.keys(local)) {
    out[k] = { pos: toWorld(local[k].pos), look: toWorld(local[k].look), fov: local[k].fov };
  }
  return out;
}

// ── scenarios ────────────────────────────────────────────────────────────────

let stage = null;

function stand(app, world, tier) {
  if (!stage || stage.world !== world) {
    const reach = world.live || new ReachScene(app, world, { seed: 4 });
    const room = new RoomScene(app, world, { tier });
    reach.group.add(room.group);
    stage = { world, reach, room };
    app.add({ update: dt => { if (world.subject === reach.group) room.update(dt); } });
  }
  if (world.live !== stage.reach) world.setLive(stage.reach);
  else world.resumeLive();
  stage.room.setTier(tier);
  stage.room.place();
  return stage;
}

// A room is a dim interior inside a scene tuned for hulls at half a kilometre. Everything here
// pulls the outside back so the window is a bright hole and not a white one, and lifts the star's
// own key so the exterior in the glass still has a lit side.
function roomLighting(app, spec) {
  const q = app.quality;
  reachLighting(q);
  q.set('exposure', 1.02);
  q.set('fogDensity', 0.00022);
  q.set('keyPower', 22);
  q.set('fillPower', 1.0);
  q.set('ambient', 0.006);
  q.set('envPower', 0.20);
  q.set('envFloor', 0.08);
  q.set('windowGlow', 7.0);
  q.set('stripPower', 5.2);
  q.set('dockGlow', 4.0);
  q.set('stationPaint', 0.80);
  q.set('stationPlane', 0.30);
  q.set('spillPower', 0.22);
  q.set('nebGain', 1.55);
  q.set('nebDesat', 0.42);
  q.set('nebHalo', 0.03);
  q.set('stars', 1.2);
  q.set('starBright', 4.2);
  q.set('flareSize', 13);
  q.set('bloomPower', 0.20);
  q.set('bloomThreshold', 0.62);
  q.set('bloomStrength', 0.72);
  q.set('bloomRadius', 1.2);
  q.set('roomKey', spec.light.gain);
  q.set('roomFill', spec.light.fill);
  q.set('roomShaft', 1);
  q.set('roomGlow', 1.35);
  // an interior is centimetres from the lens; the system outside is kilometres away, and 1 m of
  // near plane cuts the wall beside your shoulder clean off
  app.camera.near = 0.28;
  app.camera.updateProjectionMatrix();
  // the orbit rig's floor is 14 m, which is four times the room. Left alone it hauls the camera
  // out through the back wall the moment anything re-enables the rig.
  if (camera.rig) camera.rig.opt.distMin = 0.30;
}

// The look the room needs, for whoever wires the quarters screen: call it on the way in, and
// reachLighting() on the way out.
export function quartersLighting(app, tier = 'dockbox') { roomLighting(app, tierSpec(tier)); }

const FRAMINGS = ['enter', 'desk', 'terminal', 'window'];
const LABEL = { enter: 'the doorway', desk: 'the desk', terminal: 'the terminal', window: 'the glass' };

export function registerRoomScenarios(app, world) {
  registerRoomKnobs(app.quality);

  for (const view of FRAMINGS) {
    defineScenario({
      id: `room_${view}`,
      label: `Quarters — ${LABEL[view]}`,
      ref: '1840080_06',
      setup(a) {
        const spec = tierSpec('dockbox');
        roomLighting(a, spec);
        stand(a, world, 'dockbox');
        frameCamera(a, roomShots('dockbox')[view]);
      },
    });
  }

  for (const t of quarters) {
    showroom.register({
      id: `quarters_${t.id}`, group: 'misc', label: `Quarters — ${t.name}`,
      note: `${t.room.w}×${t.room.d} m · ${t.cost ? t.cost.toLocaleString() : 'free'}`,
      run: ctx => {
        roomLighting(ctx.app, t);
        stand(ctx.app, world, t.id);
        frameCamera(ctx.app, roomShots(t.id).enter);
      },
    });
  }

  // the tier ladder seen through the one framing that shows what you actually bought
  for (const t of quarters) {
    showroom.register({
      id: `quarters_${t.id}_view`, group: 'misc', label: `Quarters — ${t.name}, the view`,
      note: t.blurb,
      run: ctx => {
        roomLighting(ctx.app, t);
        stand(ctx.app, world, t.id);
        frameCamera(ctx.app, roomShots(t.id).window);
      },
    });
  }
}
