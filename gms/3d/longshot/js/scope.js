// LONGSHOT — the two views. Unscoped: wide look-around with a rifle viewmodel.
// Scoped: magnified FOV + canvas reticle overlay (mil-dots, wind hashes, smart
// dot). Owns aim yaw/pitch, sway, breath-hold, recoil; everything the shot
// direction depends on.

import * as THREE from 'three';
import { SWAY, BREATH, VIEW } from './config.js';
import { clamp } from './utils.js';
import { save } from './save.js';
import * as audio from './audio.js';

const T = THREE;

export class ScopeRig {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    scene.add(camera);
    this.cv = document.getElementById('scope-cv');
    this.ctx = this.cv.getContext('2d');
    this.scopeEl = document.getElementById('scope');

    this.yaw = 0; this.pitch = 0;
    this.scoped = false;
    this.zoomFrac = 0;
    this.fov = VIEW.fov;
    this.fovTarget = VIEW.fov;
    this.t = Math.random() * 100;
    this.breath = BREATH.max;
    this.holding = false;
    this.winded = 0;
    this._hbAcc = 0;
    this.recoilP = 0; this.recoilY = 0;
    this.swayP = 0; this.swayY = 0;
    this.smart = null;               // {xMrad, yMrad} predicted impact offset
    this.enabled = false;
    this.loadout = { rifle: null, scope: null, ammo: null, swayMul: 1, breathMul: 1 };

    this._buildViewmodel();
    this._resize = () => {
      this.cv.width = innerWidth * devicePixelRatio;
      this.cv.height = innerHeight * devicePixelRatio;
    };
    addEventListener('resize', this._resize);
    this._resize();
  }

  _buildViewmodel() {
    const g = new T.Group();
    const dark = new T.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.5 });
    const wood = new T.MeshStandardMaterial({ color: 0x3d2f22, roughness: 0.8 });
    const mk = (geo, mat, x, y, z, rx = 0, rz = 0) => {
      const m = new T.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx; m.rotation.z = rz;
      g.add(m); return m;
    };
    mk(new T.CylinderGeometry(0.016, 0.02, 1.15, 8), dark, 0.26, -0.19, -1.25, Math.PI / 2);   // barrel
    mk(new T.BoxGeometry(0.07, 0.1, 0.65), wood, 0.26, -0.245, -0.72);                          // fore stock
    mk(new T.BoxGeometry(0.075, 0.16, 0.4), wood, 0.26, -0.28, -0.28);                          // butt
    mk(new T.CylinderGeometry(0.035, 0.035, 0.3, 10), dark, 0.26, -0.13, -0.65, Math.PI / 2);   // scope tube
    mk(new T.CylinderGeometry(0.045, 0.04, 0.06, 10), dark, 0.26, -0.13, -0.49, Math.PI / 2);   // ocular
    mk(new T.CylinderGeometry(0.02, 0.02, 0.09, 6), dark, 0.315, -0.16, -0.42, 0, Math.PI / 3); // bolt
    // Shouldered at the bottom-right, barrel receding toward the target: it
    // frames the shot instead of pressing its stock into your eye.
    g.scale.setScalar(0.95);
    g.position.set(0.12, -0.28, -0.52);
    g.rotation.y = -0.07;
    this.viewmodel = g;
    this.camera.add(g);
  }

  setLoadout(rifle, scope, ammo, gear) {
    this.loadout = {
      rifle, scope, ammo,
      swayMul: gear.includes('sling') ? 0.75 : 1,
      breathMul: gear.includes('lungs') ? 1.6 : 1,
    };
    this.zoomFrac = 0;
    this.breath = BREATH.max * this.loadout.breathMul;
  }

  setVantage(pos, yaw) {
    this.eye = pos.clone();
    this.yaw = yaw;
    this.pitch = -0.06;
    this.camera.position.copy(this.eye);
  }

  get zoom() {
    const s = this.loadout.scope || { zmin: 4, zmax: 8 };
    return s.zmin + (s.zmax - s.zmin) * this.zoomFrac;
  }

  // Yaw is free: a shooter on a roof can turn round. Only pitch is limited, and
  // even that goes to −80° so you can look at the pavement at the foot of your
  // own building — where marks on the ground actually are.
  look(dxPx, dyPx) {
    if (!this.enabled) return;
    const fovRad = this.fov * Math.PI / 180;
    const k = fovRad / innerHeight * 0.62 * (save.settings.sens || 1);
    this.yaw -= dxPx * k;
    this.pitch -= dyPx * k * (save.settings.invertY ? -1 : 1);
    if (this.yaw > Math.PI * 3) this.yaw -= Math.PI * 2;
    if (this.yaw < -Math.PI * 3) this.yaw += Math.PI * 2;
    this.pitch = clamp(this.pitch, VIEW.minPitch, VIEW.maxPitch);
  }

  setScoped(on) {
    if (on === this.scoped) return;
    this.scoped = on;
    audio.scopeToggle(on);
    this.scopeEl.classList.toggle('hidden', !on);
    this.viewmodel.visible = !on;
  }
  toggleScope() { this.setScoped(!this.scoped); }

  setZoomFrac(f) { this.zoomFrac = clamp(f, 0, 1); }
  nudgeZoom(d) { this.setZoomFrac(this.zoomFrac + d); }

  breathHold(on) {
    if (on && this.winded <= 0 && this.breath > 0.25) {
      if (!this.holding) audio.breathIn();
      this.holding = true;
    } else {
      if (this.holding) audio.breathOut();
      this.holding = false;
    }
  }

  fire() {
    const r = this.loadout.rifle || { sway: 1 };
    const k = SWAY.fireKick * (0.75 + r.sway * 0.5);
    this.recoilP += k * (0.8 + Math.random() * 0.4);
    this.recoilY += (Math.random() - 0.5) * k * 0.7;
  }

  swayAmp() {
    if (this.autoSteady) return 0;                 // ?auto soak-driver
    const r = this.loadout.rifle || { sway: 1 };
    let a = SWAY.base * r.sway * this.loadout.swayMul;
    if (this.holding && this.breath > 0) a *= SWAY.holdMul;
    if (this.winded > 0) a *= SWAY.emptyMul;
    return a;
  }

  update(dt) {
    this.t += dt;
    // breath
    const maxB = BREATH.max * this.loadout.breathMul;
    if (this.holding) {
      this.breath -= dt;
      if (this.breath <= 0) {
        this.breath = 0; this.holding = false;
        this.winded = BREATH.windedFor;
        audio.breathOut();
      }
    } else {
      this.breath = Math.min(maxB, this.breath + dt * BREATH.recover);
    }
    if (this.winded > 0) {
      this.winded -= dt;
      this._hbAcc += dt;
      if (this._hbAcc > 0.55) { this._hbAcc = 0; audio.heartbeat(true); }
    } else if (this.breath < maxB * 0.3 && this.scoped) {
      this._hbAcc += dt;
      if (this._hbAcc > 0.8) { this._hbAcc = 0; audio.heartbeat(false); }
    }

    // sway
    const amp = this.swayAmp();
    const t = this.t;
    this.swayY = amp * (Math.sin(t * SWAY.breathHz * 6.28) * 0.62 + Math.sin(t * SWAY.jitterHz * 6.28 * 1.31 + 1.7) * 0.38);
    this.swayP = amp * (Math.sin(t * SWAY.breathHz * 6.28 * 0.83 + 0.9) * 0.7 + Math.sin(t * SWAY.jitterHz * 6.28 + 0.4) * 0.3);

    // recoil recovery
    const rec = Math.exp(-dt * 7.5);
    this.recoilP *= rec; this.recoilY *= rec;

    // fov
    this.fovTarget = this.scoped ? VIEW.fov / this.zoom : VIEW.fov;
    this.fov += (this.fovTarget - this.fov) * Math.min(1, dt * 14);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }

    // compose camera. rotation.y needs +π: a three camera looks down −Z at
    // rotation 0, while our yaw convention is people-style (sin,cos)=+X/+Z.
    this.camera.position.copy(this.eye);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(
      this.pitch + this.swayP + this.recoilP,
      Math.PI + this.yaw + this.swayY + this.recoilY,
      Math.sin(t * 0.5) * 0.002
    );
    // viewmodel micro-lag
    if (this.viewmodel.visible) {
      this.viewmodel.rotation.y = -this.swayY * 6;
      this.viewmodel.rotation.x = -this.swayP * 6;
      this.viewmodel.position.y = Math.sin(t * SWAY.breathHz * 6.28) * 0.004;
    }

    if (this.scoped) this.drawOverlay();
  }

  aimRay() {
    const origin = this.camera.getWorldPosition(new T.Vector3());
    const dir = new T.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return { origin, dir };
  }

  // ── reticle ────────────────────────────────────────────────────────────────
  drawOverlay() {
    const g = this.ctx, W = this.cv.width, H = this.cv.height;
    const cx = W / 2, cy = H / 2;
    const R = Math.min(W, H) * 0.468;
    g.clearRect(0, 0, W, H);

    // black surround
    g.fillStyle = '#000';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(cx, cy, R, 0, Math.PI * 2, true);
    g.fill('evenodd');

    // edge shading + chromatic fringe
    const ed = g.createRadialGradient(cx, cy, R * 0.62, cx, cy, R);
    ed.addColorStop(0, 'rgba(0,0,0,0)');
    ed.addColorStop(0.85, 'rgba(0,0,0,0.18)');
    ed.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = ed;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(90,160,255,0.25)'; g.lineWidth = 3;
    g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(255,120,60,0.2)';
    g.beginPath(); g.arc(cx, cy, R - 6, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#0a0a0a'; g.lineWidth = 8;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();

    // mil geometry
    const fovRad = this.fov * Math.PI / 180;
    const pxPerMil = (H / fovRad) * 0.001;

    // faint illumination halo so the reticle reads against night glass
    g.strokeStyle = 'rgba(255,175,70,0.25)';
    g.lineWidth = Math.max(3.5, H / 380);
    g.beginPath();
    g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
    g.stroke();

    g.strokeStyle = 'rgba(10,12,10,0.92)';
    g.fillStyle = 'rgba(10,12,10,0.92)';
    g.lineWidth = Math.max(1.5, H / 900);

    // crosshair
    g.beginPath();
    g.moveTo(cx - R, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy - R); g.lineTo(cx, cy + R);
    g.stroke();

    // mil-dots: vertical (drop) and horizontal (wind)
    const dotR = Math.max(2, pxPerMil * 0.08);
    for (let m = 1; m <= 14; m++) {
      const d = m * pxPerMil;
      if (d > R * 0.92) break;
      g.beginPath(); g.arc(cx, cy + d, dotR, 0, 7); g.fill();
      if (m <= 8) {
        g.beginPath(); g.arc(cx - d, cy, dotR, 0, 7); g.fill();
        g.beginPath(); g.arc(cx + d, cy, dotR, 0, 7); g.fill();
      }
      if (m % 2 === 0 && pxPerMil > 26) {
        g.font = `${Math.max(10, H / 90)}px Arial`;
        g.textAlign = 'left';
        g.fillText(String(m), cx + dotR * 3, cy + d + 4);
      }
    }
    // thick posts
    g.lineWidth = Math.max(4, H / 260);
    const post = R * 0.62;
    g.beginPath();
    g.moveTo(cx - R, cy); g.lineTo(cx - post, cy);
    g.moveTo(cx + post, cy); g.lineTo(cx + R, cy);
    g.moveTo(cx, cy + post); g.lineTo(cx, cy + R);
    g.stroke();

    // smart dot — predicted impact point
    if (this.smart) {
      const sx = cx + this.smart.xMrad * pxPerMil;
      const sy = cy + this.smart.yMrad * pxPerMil;
      if (Math.hypot(sx - cx, sy - cy) < R * 0.9) {
        g.fillStyle = 'rgba(255,180,40,0.95)';
        g.beginPath(); g.arc(sx, sy, Math.max(3, dotR * 1.7), 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,180,40,0.6)'; g.lineWidth = 1.5;
        g.beginPath(); g.arc(sx, sy, Math.max(6, dotR * 3.4), 0, 7); g.stroke();
      }
    }
  }

  dispose() {
    removeEventListener('resize', this._resize);
    this.camera.remove(this.viewmodel);
  }
}
