// GRUDGE BUGS — the camera is a character. One director owns the lens:
// player orbit, over-shoulder aiming, a bullet-riding chase cam that slows
// time on final approach, an impact pull-back beat, a screaming-bug fall cam,
// five instant-replay angles, a winners' orbit — plus trauma shake and
// letterbox bars. World timeScale() is dictated from here, longshot-style.

import * as THREE from 'three';
import { CAM } from './config.js';
import { $, clamp, lerp, easeInOut, easeOut } from './utils.js';

const T = THREE;
const V = (x, y, z) => new T.Vector3(x, y, z);

export class CameraDirector {
  constructor(camera, dom) {
    this.cam = camera;
    this.dom = dom;
    this.mode = 'menu';
    this.opts = {};
    this.pos = camera.position.clone();
    this.look = V(0, 1, 0);
    this.smoothPos = this.pos.clone();
    this.smoothLook = this.look.clone();
    this.orbit = { yaw: 0.6, pitch: CAM.orbitPitch0, dist: CAM.orbitDist0 };
    this.trauma = 0;
    this.fov = CAM.fov;
    this.fovTarget = CAM.fov;
    this.t = 0;
    this._shakeSeed = Math.random() * 100;
  }

  // ---------------- public controls ----------------
  setMode(mode, opts = {}) {
    this.prevMode = this.mode;
    this.mode = mode;
    this.opts = opts;
    this.t = 0;
    if (mode === 'fly') {
      this.flyFrom = this.cam.position.clone();
      this.flyLookFrom = this.smoothLook.clone();
    }
    if (mode === 'follow') { this.fovTarget = CAM.fov + CAM.followFovKick; this.followOrbit = Math.random() < 0.5 ? 1 : -1; }
    else if (mode !== 'impact') this.fovTarget = CAM.fov;
    if (mode === 'replay') this.bars(true); else if (this.prevMode === 'replay') this.bars(false);
  }

  orbitDrag(dx, dy) {
    this.orbit.yaw -= dx * 0.006;
    this.orbit.pitch = clamp(this.orbit.pitch + dy * 0.005, CAM.orbitPitch[0], CAM.orbitPitch[1]);
  }
  orbitZoom(f) { this.orbit.dist = clamp(this.orbit.dist * f, CAM.orbitDist[0], CAM.orbitDist[1]); }
  addShake(a) { this.trauma = Math.min(1.4, this.trauma + a * (this.shakeOn === false ? 0 : 1)); }

  bars(on) {
    const c = $('cine');
    c.classList.remove('hidden');
    for (const b of c.querySelectorAll('.bar')) b.style.transform = on ? 'scaleY(1)' : 'scaleY(0)';
    if (!on && !this._banner) setTimeout(() => { if (!this._barsOn) c.classList.add('hidden'); }, 450);
    this._barsOn = on;
  }
  banner(text, dur = 1.6) {
    const el = $('cine-banner');
    $('cine').classList.remove('hidden');
    el.textContent = text;
    el.classList.remove('hidden');
    this._banner = true;
    clearTimeout(this._bannerTO);
    this._bannerTO = setTimeout(() => { el.classList.add('hidden'); this._banner = false; }, dur * 1000);
  }

  timeScale() {
    if (this.mode === 'follow') {
      const r = this.opts.remain?.() ?? 1;
      return r < 0.28 ? CAM.slowNear : 1;
    }
    if (this.mode === 'impact') return this.t < CAM.impactHold * 0.6 ? CAM.impactSlow : 0.45;
    if (this.mode === 'replay') return 0.55;
    if (this.mode === 'fall') return 0.8;
    return 1;
  }

  // ---------------- per-mode desired transform ----------------
  _desired(dt) {
    const o = this.opts;
    switch (this.mode) {
      case 'menu': {
        const c = o.center || V(0, 1.5, 0);
        const a = this.tGlobal * 0.07 + 2;
        return {
          pos: V(c.x + Math.cos(a) * 13, c.y + 4.2 + Math.sin(this.tGlobal * 0.11) * 0.8, c.z + Math.sin(a) * 13),
          look: c, snap: 0.8,
        };
      }
      case 'orbit': {
        const c = o.target();
        const { yaw, pitch, dist } = this.orbit;
        return {
          pos: V(
            c.x + Math.sin(yaw) * Math.cos(pitch) * dist,
            c.y + Math.sin(pitch) * dist + 0.6,
            c.z + Math.cos(yaw) * Math.cos(pitch) * dist),
          look: V(c.x, c.y + 0.5, c.z), snap: 6,
        };
      }
      case 'aim': {
        // over the shoulder, bug anchored low-centre, lens tilts with the aim
        const c = o.target();
        const yaw = o.aim().yaw, pitch = o.aim().pitch;
        const back = V(-Math.sin(yaw), 0, -Math.cos(yaw));
        const side = V(Math.cos(yaw), 0, -Math.sin(yaw));
        const pos = V(c.x, c.y, c.z)
          .addScaledVector(back, CAM.aimDist)
          .addScaledVector(side, CAM.aimSide)
          .add(V(0, CAM.aimHeight + pitch * 0.5, 0));
        const look = V(c.x + Math.sin(yaw) * 3.2, c.y + 0.55 + Math.sin(pitch) * 1.7, c.z + Math.cos(yaw) * 3.2);
        return { pos, look, snap: 7 };
      }
      case 'fly': {
        const k = easeInOut(clamp(this.t / CAM.flyTime, 0, 1));
        const to = o.to();
        const toLook = o.look();
        // arc up between the two points for a swoop
        const mid = this.flyFrom.clone().lerp(to, 0.5); mid.y += 3.5;
        const a = this.flyFrom.clone().lerp(mid, k);
        const b = mid.clone().lerp(to, k);
        if (this.t >= CAM.flyTime && o.done) { const d = o.done; o.done = null; d(); }
        return { pos: a.lerp(b, k), look: this.flyLookFrom.clone().lerp(toLook, easeOut(k)), snap: 0 };
      }
      case 'follow': {
        const p = o.pos();                      // projectile position
        const v = o.vel();                      // velocity
        const dir = v.lengthSq() > 1e-8 ? v.clone().normalize() : V(0, 0, 1);
        const side = V().crossVectors(dir, V(0, 1, 0)).normalize();
        const prog = clamp(o.progress?.() ?? 0, 0, 1);
        const ang = this.followOrbit * (0.7 + prog * 1.8);
        const pos = p.clone()
          .addScaledVector(dir, -CAM.followBack - Math.sin(prog * Math.PI) * 0.7)
          .addScaledVector(side, Math.cos(ang) * 0.9)
          .add(V(0, CAM.followUp + Math.sin(ang) * 0.3, 0));
        return { pos, look: p.clone().addScaledVector(dir, 4), snap: 14 };
      }
      case 'impact': {
        const p = o.pos;
        const back = o.dir ? o.dir.clone().negate() : V(0.5, 0.3, 0.5).normalize();
        back.y = Math.max(back.y, 0.25);
        const pos = p.clone().addScaledVector(back.normalize(), CAM.impactDist).add(V(0, 1.6, 0));
        return { pos, look: p, snap: this.t < 0.1 ? 0 : 3 };
      }
      case 'fall': {
        const p = o.target();
        // hover beside, slightly above, tracking down — never dip into the drink
        const floor = (o.floorY ?? -6) + 1.2;
        return {
          pos: V(p.x + o.side * 3.4, Math.max(p.y + 1.4, floor), p.z + 2.4),
          look: p, snap: 5,
        };
      }
      case 'win': {
        const c = o.center;
        const a = this.t * 0.5;
        return {
          pos: V(c.x + Math.cos(a) * 4.6, c.y + 1.8, c.z + Math.sin(a) * 4.6),
          look: V(c.x, c.y + 0.5, c.z), snap: 4,
        };
      }
      case 'cine': {
        // scripted: opts gives from/to/lookFrom/lookTo/dur, eased
        const k = o.ease ? o.ease(clamp(this.t / o.dur, 0, 1)) : easeInOut(clamp(this.t / o.dur, 0, 1));
        return {
          pos: o.from.clone().lerp(o.to, k),
          look: o.lookFrom.clone().lerp(o.lookTo, k), snap: 0,
        };
      }
      case 'replay': return this._replayCam();
    }
    return null;
  }

  _replayCam() {
    const { rec, angle, getT } = this.opts;
    const rt = getT();                                    // seconds into replay
    const proj = sampleRecPath(rec.shotPath, rt);
    const p = proj ? V(proj.x, proj.y, proj.z) : V(rec.impact.pos.x, rec.impact.pos.y, rec.impact.pos.z);
    const imp = V(rec.impact.pos.x, rec.impact.pos.y, rec.impact.pos.z);
    const start = V(rec.shotPath[0].x, rec.shotPath[0].y, rec.shotPath[0].z);
    switch (angle) {
      case 'low': {
        const side = V().subVectors(imp, start).normalize().cross(V(0, 1, 0));
        const pos = imp.clone().addScaledVector(side, 2.4).add(V(0, -0.4, 0));
        pos.y = Math.max(pos.y, rec.impact.pos.y - 1.2);
        return { pos, look: p, snap: 8 };
      }
      case 'drone': {
        const a = rt * 0.9;
        return { pos: V(imp.x + Math.cos(a) * 4.5, imp.y + 4.2, imp.z + Math.sin(a) * 4.5), look: p, snap: 6 };
      }
      case 'victim': {
        const v = rec.victimPos ? V(rec.victimPos.x, rec.victimPos.y + 0.5, rec.victimPos.z)
          : imp.clone().add(V(0.6, 0.7, 0.6));
        return { pos: v, look: p, snap: 10 };
      }
      case 'dolly': {
        const dir = V().subVectors(imp, start);
        const len = dir.length() || 1; dir.normalize();
        const side = V().crossVectors(dir, V(0, 1, 0)).normalize();
        const along = start.clone().addScaledVector(dir, clamp(rt / Math.max(0.6, rec.dur) * len, 0, len));
        return { pos: along.addScaledVector(side, 3.6).add(V(0, 0.8, 0)), look: p, snap: 7 };
      }
      default: { // security cam: fixed high corner, slow push-in
        this.fovTarget = CAM.fov - rt * 3;
        const pos = start.clone().add(V(4, 5, -4));
        return { pos, look: imp.clone().lerp(p, 0.35), snap: 2 };
      }
    }
  }

  // ---------------- frame update ----------------
  update(dt, unscaledDt) {
    this.t += unscaledDt;
    this.tGlobal = (this.tGlobal || 0) + unscaledDt;
    const d = this._desired(dt);
    if (d) {
      if (d.snap <= 0) { this.smoothPos.copy(d.pos); this.smoothLook.copy(d.look); }
      else {
        const k = 1 - Math.exp(-d.snap * unscaledDt);
        this.smoothPos.lerp(d.pos, k);
        this.smoothLook.lerp(d.look, Math.min(1, k * 1.3));
      }
    }
    // trauma shake
    this.trauma = Math.max(0, this.trauma - unscaledDt * 1.6);
    const sh = this.trauma * this.trauma * (this.shakeOn === false ? 0 : 1);
    const t = this.tGlobal * 37 + this._shakeSeed;
    const off = V(
      (Math.sin(t * 1.3) + Math.sin(t * 3.7)) * 0.5 * sh * 0.35,
      (Math.sin(t * 1.7) + Math.sin(t * 4.3)) * 0.5 * sh * 0.3,
      Math.sin(t * 2.9) * sh * 0.2);
    this.cam.position.copy(this.smoothPos).add(off);
    this.cam.lookAt(this.smoothLook);
    this.cam.rotation.z += Math.sin(t * 2.1) * sh * 0.05;
    // fov ease
    this.fov = lerp(this.fov, this.fovTarget, Math.min(1, unscaledDt * 4));
    if (Math.abs(this.cam.fov - this.fov) > 0.05) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}

// sample a recorded {t,x,y,z} path at time t (shared with replay ghosts)
export function sampleRecPath(path, t) {
  if (!path || !path.length) return null;
  if (t <= path[0].t) return path[0];
  for (let i = 1; i < path.length; i++) {
    if (path[i].t >= t) {
      const a = path[i - 1], b = path[i];
      const f = (t - a.t) / Math.max(1e-9, b.t - a.t);
      return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), z: lerp(a.z, b.z, f) };
    }
  }
  return path[path.length - 1];
}
