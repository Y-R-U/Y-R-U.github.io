// LONGSHOT — the two views. Unscoped: wide look-around with a rifle viewmodel.
// Scoped: magnified FOV + canvas reticle overlay (mil-dots, wind hashes, smart
// dot). Owns aim yaw/pitch, sway, breath-hold, recoil; everything the shot
// direction depends on.

import * as THREE from 'three';
import { SWAY, BREATH, VIEW } from './config.js';
import { clamp } from './utils.js';
import { save } from './save.js';
import * as audio from './audio.js';
import { buildRifleViewmodel, disposeViewmodel } from './viewmodel.js';

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

  // Shouldered at the bottom-right, barrel receding toward the target: it
  // frames the shot instead of pressing its stock into your eye. The model
  // itself is per-rifle (js/viewmodel.js), so buying up the armory visibly
  // changes the gun in your hands.
  _buildViewmodel(rifle, scope) {
    if (this.viewmodel) {
      this.camera.remove(this.viewmodel);
      disposeViewmodel(this.viewmodel);
    }
    const g = buildRifleViewmodel(rifle || null, scope || null);
    g.scale.setScalar(0.88);
    // NOTE: keep the rest pose here — update() only ADDS to it. Writing
    // position.y absolutely (as the breath bob used to) throws the rifle back
    // up to eye level and it stops reading as shouldered.
    this.vmBase = new T.Vector3(0.158, -0.238, -0.50);
    g.position.copy(this.vmBase);
    g.rotation.set(0.02, 0.05, 0.03);
    this.vmRestRot = g.rotation.clone();
    this.viewmodel = g;
    this.vmKick = 0;
    this.camera.add(g);
    if (this.scoped) g.visible = false;
  }

  setLoadout(rifle, scope, ammo, gear) {
    this.loadout = {
      rifle, scope, ammo,
      swayMul: gear.includes('sling') ? 0.75 : 1,
      breathMul: gear.includes('lungs') ? 1.6 : 1,
    };
    this.zoomFrac = 0;
    this.breath = BREATH.max * this.loadout.breathMul;
    const id = rifle && rifle.id, sid = scope && scope.id;
    if (id !== this._vmRifleId || sid !== this._vmScopeId) {
      this._vmRifleId = id; this._vmScopeId = sid;
      this._buildViewmodel(rifle, scope);
    }
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
    // the rifle itself jumps, not just the view — heavier guns jump harder
    this.vmKick = 0.075 * (0.7 + (r.sway || 1) * 0.45);
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
    // viewmodel: micro-lag behind the sway, breath bob, and a recoil kick that
    // shoves the rifle back and up then settles. All RELATIVE to the rest pose.
    if (this.viewmodel && this.viewmodel.visible) {
      this.vmKick += (0 - this.vmKick) * Math.min(1, dt * 9);
      const vm = this.viewmodel;
      vm.rotation.set(
        this.vmRestRot.x - this.swayP * 6 + this.vmKick * 1.15,
        this.vmRestRot.y - this.swayY * 6,
        this.vmRestRot.z + this.vmKick * 0.5
      );
      vm.position.set(
        this.vmBase.x + this.swayY * 1.6,
        this.vmBase.y + Math.sin(t * SWAY.breathHz * 6.28) * 0.005 - this.vmKick * 0.18,
        this.vmBase.z + this.vmKick * 0.42
      );
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
