// Third-person robed player: smooth trailing camera, terrain-following feet, staff swing.

import * as THREE from 'three';
import { ZONE_IDS } from './world/zones.js';
import { heightAt as fieldY, CENTERS, PLAY } from './world/terrain.js';
import { walkStep, groundAt, setStepUp } from './world/colliders.js';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_MIN = -0.35, PITCH_MAX = 1.05;
const LOOK_HOLD = 0.8;

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));
const lerp = THREE.MathUtils.lerp;
const _off = new THREE.Vector3(), _back = new THREE.Vector3();

export class Player {
  constructor(people, input, controls) {
    this.people = people;
    this.input = input;
    this.controls = controls;
    this.enabled = false;
    this.free = false;

    this.object3D = new THREE.Group();
    this.object3D.name = 'player';
    this.mesh = new THREE.Mesh(people.geo.neutral, people.mat.neutral);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = people.depth;
    this.object3D.add(this.mesh);
    this.object3D.visible = false;

    this.pos = new THREE.Vector3(CENTERS[1] + 1, 0, 22);
    this.pos.y = this.groundY(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.moveYaw = Math.PI;
    this.camPitch = 0.26;
    this.camPos = new THREE.Vector3();
    this.camAim = new THREE.Vector3();
    this.swing = 0;
    this.castEdge = false;
    this.speed = 5.0;
    this.dist = 7.2;
    this.height = 2.10;
    this.sens = 0.0042;
    this.follow = 2.6;
    this.lookHold = 0;
    this.started = false;

    // Set by the door system while it owns the player. `indoor` blends the camera arm from the
    // outdoor trail to just behind the head; `driven` means the door script is writing pos/yaw;
    // `floorY` is null outdoors and a (x, z, y) → height query inside, so a room can have storeys.
    this.colliders = null;
    this.driven = false;
    this.snap = false;
    this.indoor = 0;
    this.floorY = null;
    this.confine = null;
    this.distIn = 2.10;
    this.heightIn = 2.05;
    this.pitchMaxIn = 0.50;
    this.camRadius = 0.26;
    // Not scaled with the world: it is bounded by interior.js's 0.42 m walkable inset less the
    // 0.26 m camera radius, and both of those are deliberately unscaled. Above ~0.43 the camera
    // pushes out through the wall face it was clamped against. See docs/NOTES_WORLD_A2-A5.md.
    this.armMin = 0.40;
    this.collide = true;
    this.walkRadius = 0.34;
    this.stepEase = 16;
  }

  registerKnobs(q, app) {
    this.app = app;
    q.register({ key: 'freeCam', label: 'Free (orbit) camera', type: 'toggle', default: false, group: 'Controls' },
      v => { this.free = !!v; if (this.controls) this.controls.enabled = !!v; });
    q.register({ key: 'flipTouch', label: 'Flip move / attack side', type: 'toggle', default: false, group: 'Controls' },
      v => { this.input.flip = !!v; document.body.classList.toggle('flip', !!v); });
    q.register({ key: 'playerZone', label: 'Robe', type: 'select', options: ZONE_IDS, default: 'neutral', group: 'Controls' },
      v => this.setZone(v));
    q.register({ key: 'moveSpeed', label: 'Move speed', type: 'range', min: 1, max: 10, step: 0.2, default: 5.0, group: 'Controls' },
      v => { this.speed = v; });
    q.register({ key: 'camDist', label: 'Camera distance', type: 'range', min: 2, max: 12, step: 0.2, default: 7.2, group: 'Controls' },
      v => { this.dist = v; });
    q.register({ key: 'camHeight', label: 'Camera height', type: 'range', min: 0.4, max: 4, step: 0.1, default: 2.10, group: 'Controls' },
      v => { this.height = v; });
    q.register({ key: 'lookSens', label: 'Look sensitivity', type: 'range', min: 0.001, max: 0.012, step: 0.0005, default: 0.0042, group: 'Controls' },
      v => { this.sens = v; });
    q.register({ key: 'camFollow', label: 'Camera follow (0 = manual)', type: 'range', min: 0, max: 6, step: 0.2, default: 2.6, group: 'Controls' },
      v => { this.follow = v; });
    q.register({ key: 'camDistIn', label: 'Camera distance indoors', type: 'range', min: 0.6, max: 3.5, step: 0.05, default: 2.10, group: 'Controls' },
      v => { this.distIn = v; });
    q.register({ key: 'camHeightIn', label: 'Camera height indoors', type: 'range', min: 1, max: 3.5, step: 0.05, default: 2.05, group: 'Controls' },
      v => { this.heightIn = v; });
    // Eye rises dist·sin(pitch) above the aim, so this and camDistIn together set how close the
    // camera gets to the ceiling: at 0.50 / 2.10 the eye + its radius reaches 3.32 m above the
    // floor, against the 3.40 m minimum room height.
    q.register({ key: 'camPitchIn', label: 'Camera max pitch indoors', type: 'range', min: 0.2, max: 0.9, step: 0.02, default: 0.50, group: 'Controls' },
      v => { this.pitchMaxIn = v; });
    q.register({ key: 'camRadius', label: 'Camera collision radius', type: 'range', min: 0, max: 0.8, step: 0.02, default: 0.26, group: 'Controls' },
      v => { this.camRadius = v; });
    q.register({ key: 'camArmMin', label: 'Camera arm minimum', type: 'range', min: 0.2, max: 1.2, step: 0.05, default: 0.40, group: 'Controls' },
      v => { this.armMin = v; });
    q.register({ key: 'walkCollide', label: 'World collision', type: 'toggle', default: true, group: 'Controls' },
      v => { this.collide = !!v; });
    q.register({ key: 'walkRadius', label: 'Walker radius', type: 'range', min: 0, max: 1, step: 0.02, default: 0.34, group: 'Controls' },
      v => { this.walkRadius = v; });
    // Reaches exactly one thing today, the bridge deck — see colliders.js.
    q.register({ key: 'stepUp', label: 'Step-up height', type: 'range', min: 0.1, max: 1.2, step: 0.02, default: 0.93, group: 'Controls' },
      v => setStepUp(v));
    q.register({ key: 'stepEase', label: 'Step-up ease rate', type: 'range', min: 4, max: 40, step: 1, default: 16, group: 'Controls' },
      v => { this.stepEase = v; });
  }

  // The ground renders from the terrain mesh, not the analytic field, and the two disagree by
  // enough to sink the feet or float them.
  groundY(x, z) {
    const T = this.people.terrain;
    return T ? T.surfaceY(x, z) : fieldY(x, z);
  }

  setZone(id) {
    this.zoneId = ZONE_IDS.includes(id) ? id : 'neutral';
    this.mesh.geometry = this.people.geo[this.zoneId];
    this.mesh.material = this.people.mat[this.zoneId];
  }

  update(dt, app) {
    // Editor mode switches the player off and expects the orbit camera back, so idle means orbit
    // rather than a frozen view. Scenario shots detach `controls` instead — see main.js.
    // read() self-drains, and a drag the orbit camera owned must not be waiting to be applied
    // the frame the player comes back — it arrives as one 400° whip.
    if (!this.enabled) {
      this.input.read();
      this.object3D.visible = false;
      if (this.controls) { this.controls.enabled = true; this.controls.update(); }
      return;
    }
    if (this.controls && this.controls.enabled !== this.free) this.controls.enabled = this.free;
    this.object3D.visible = !this.free;
    if (this.free) {
      this.input.read();
      if (this.controls && !this.wasFree) {
        this.controls.target.set(this.pos.x, this.pos.y + this.height, this.pos.z);
        this.wasFree = true;
      }
      this.controls?.update();
      return;
    }
    this.wasFree = false;

    const raw = this.input.read();
    const cmd = this.driven ? null : raw;
    let sp = 0;

    if (cmd) {
      this.camYaw -= cmd.lx * this.sens;
      this.camPitch += cmd.ly * this.sens;
      // The stick is read against the camera angle as it was when the stick was pressed, not the
      // live one. Holding a direction then walks a straight line while the camera swings in behind;
      // reading it live would feed the swing back into the move vector and curve the walk into a
      // circle, because the heading is defined by the camera in the first place.
      const stick = Math.hypot(cmd.mx, cmd.my);
      if (cmd.lx || cmd.ly) this.lookHold = LOOK_HOLD;
      else this.lookHold = Math.max(0, this.lookHold - dt);
      if (stick < 0.02 || this.lookHold) this.moveYaw = this.camYaw;

      if (this.follow > 0 && stick > 0.02 && !this.lookHold && Math.hypot(this.vel.x, this.vel.z) > 0.6) {
        this.camYaw += wrapPi(this.yaw - this.camYaw) * (1 - Math.exp(-this.follow * dt));
      }

      const fwd = new THREE.Vector3(Math.sin(this.moveYaw), 0, Math.cos(this.moveYaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const want = new THREE.Vector3()
        .addScaledVector(fwd, cmd.my).addScaledVector(right, cmd.mx);
      const mag = Math.min(1, want.length());
      if (mag > 0.001) want.normalize().multiplyScalar(mag * this.speed * (cmd.sprint ? 1.7 : 1));

      this.vel.lerp(want, 1 - Math.exp(-9 * dt));
      const px = this.pos.x, pz = this.pos.z;
      this.pos.addScaledVector(this.vel, dt);
      this.pos.x = THREE.MathUtils.clamp(this.pos.x, PLAY.x0, PLAY.x1);
      this.pos.z = THREE.MathUtils.clamp(this.pos.z, PLAY.z0, PLAY.z1);
      this.confine?.(this.pos);
      // Indoors the room's own walls do the confining, and the house is a solid blocker the
      // player is legitimately standing inside.
      if (this.collide && this.floorY === null && this.colliders) {
        const r = walkStep(px, pz, this.pos.x, this.pos.z, this.pos.y, this.walkRadius);
        this.pos.x = r.x;
        this.pos.z = r.z;
        if (dt > 1e-4) this.vel.set((r.x - px) / dt, 0, (r.z - pz) / dt);
      }
      // Eased rather than snapped, so a step or a bridge deck is floated up onto instead of
      // walked into. Fast enough that a slope still reads as the feet being on the ground.
      const gy = this.floorY ? this.floorY(this.pos.x, this.pos.z, this.pos.y)
        : (this.colliders ? groundAt(this.pos.x, this.pos.z, this.pos.y) : this.groundY(this.pos.x, this.pos.z));
      this.pos.y += (gy - this.pos.y) * (1 - Math.exp(-this.stepEase * dt));

      sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > 0.15) {
        const d = wrapPi(Math.atan2(this.vel.x, this.vel.z) - this.yaw);
        this.yaw += d * (1 - Math.exp(-11 * dt));
      }
      if (cmd.attack) { this.swing = 1; this.castEdge = true; }
    } else {
      sp = this.walkSpeed || 0;
    }

    this.camPitch = Math.min(lerp(PITCH_MAX, this.pitchMaxIn, this.indoor), Math.max(PITCH_MIN, this.camPitch));
    this.swing = Math.max(0, this.swing - dt * 2.6);
    const arc = Math.sin(this.swing * Math.PI) * 0.85;

    this.object3D.position.copy(this.pos);
    this.object3D.rotation.set(sp * 0.03 + arc * 0.22, this.yaw + arc * 0.9, 0, 'YXZ');

    const u = this.people.uniforms.uSelf.value;
    u.set(0, Math.min(1.4, sp / 3), 0, arc * 0.7);

    const dist = lerp(this.dist, this.distIn, this.indoor);
    const aim = this.camAim.set(this.pos.x, this.pos.y + lerp(this.height, this.heightIn, this.indoor), this.pos.z);
    const cp = Math.cos(this.camPitch);
    const back = _back.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw))
      .multiplyScalar(-cp).setY(Math.sin(this.camPitch))
      .multiplyScalar(dist).add(aim);
    // Asked with the player's height, not the camera's: on a stair the camera sits well above the
    // tread, and letting it pick its own level snaps it up onto the floor above.
    const camFloor = this.floorY ? this.floorY(back.x, back.z, this.pos.y) + 0.3
      : (this.colliders ? groundAt(back.x, back.z, back.y) : this.groundY(back.x, back.z)) + 0.7;
    // Lifting y alone stretches the arm: at the foot of a 9 m terrace the ground behind the
    // player is 9 m up and a 7.2 m arm became a 9.7 m one, which then rays over the retaining
    // wall instead of into it. Swing up the sphere of radius `dist` instead — the camera rises
    // toward overhead and keeps its length.
    if (camFloor > back.y) {
      const dy = Math.min(camFloor - aim.y, dist);
      const k = Math.sqrt(Math.max(0, dist * dist - dy * dy)) / Math.max(1e-4, cp * dist);
      back.set(aim.x + (back.x - aim.x) * k, aim.y + dy, aim.z + (back.z - aim.z) * k);
    }

    if (!this.started) { this.camPos.copy(back); this.started = true; }
    this.camPos.lerp(back, this.snap ? 1 : 1 - Math.exp(-11 * dt));

    // Clamping the target alone is not enough: the smoothing lags behind it, and the lag is
    // exactly what trails through a wall. Whatever the lerp did, the camera has to finish on the
    // clear part of the line from the head.
    if (this.colliders) {
      const off = _off.subVectors(this.camPos, aim);
      const len = off.length();
      if (len > 1e-3) {
        off.multiplyScalar(1 / len);
        const clear = this.colliders.hit(aim.x, aim.y, aim.z, off.x, off.y, off.z, len, this.camRadius);
        // Only pay the clearance margin on an actual hit: taking it unconditionally ratchets the
        // arm a few centimetres shorter every frame and settles well short of the set distance.
        if (clear < len) this.camPos.copy(aim).addScaledVector(off, Math.max(this.armMin, clear - 0.06));
      }
    }

    app.camera.position.copy(this.camPos);
    app.camera.up.copy(UP);
    app.camera.lookAt(aim);
  }
}
