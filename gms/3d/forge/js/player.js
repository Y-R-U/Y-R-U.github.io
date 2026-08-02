// Third-person robed player: smooth trailing camera, terrain-following feet, staff swing.

import * as THREE from 'three';
import { ZONE_IDS } from './world/zones.js';
import { heightAt, CENTERS } from './world/terrain.js';

const UP = new THREE.Vector3(0, 1, 0);
const PITCH_MIN = -0.35, PITCH_MAX = 1.05;

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
    this.pos.y = heightAt(this.pos.x, this.pos.z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.26;
    this.camPos = new THREE.Vector3();
    this.camAim = new THREE.Vector3();
    this.swing = 0;
    this.speed = 5.0;
    this.dist = 6.2;
    this.height = 1.62;
    this.sens = 0.0042;
    this.started = false;
  }

  registerKnobs(q, app) {
    this.app = app;
    // Desktop keeps the orbit camera the editor is built around; a phone gets the player.
    q.register({ key: 'freeCam', label: 'Free (orbit) camera', type: 'toggle', default: !matchMedia('(pointer: coarse)').matches, group: 'Controls' },
      v => { this.free = !!v; if (this.controls) this.controls.enabled = !!v; });
    q.register({ key: 'flipTouch', label: 'Flip move / attack side', type: 'toggle', default: false, group: 'Controls' },
      v => { this.input.flip = !!v; document.body.classList.toggle('flip', !!v); });
    q.register({ key: 'playerZone', label: 'Robe', type: 'select', options: ZONE_IDS, default: 'neutral', group: 'Controls' },
      v => this.setZone(v));
    q.register({ key: 'moveSpeed', label: 'Move speed', type: 'range', min: 1, max: 10, step: 0.2, default: 5.0, group: 'Controls' },
      v => { this.speed = v; });
    q.register({ key: 'camDist', label: 'Camera distance', type: 'range', min: 2, max: 12, step: 0.2, default: 6.2, group: 'Controls' },
      v => { this.dist = v; });
    q.register({ key: 'camHeight', label: 'Camera height', type: 'range', min: 0.4, max: 4, step: 0.1, default: 1.62, group: 'Controls' },
      v => { this.height = v; });
    q.register({ key: 'lookSens', label: 'Look sensitivity', type: 'range', min: 0.001, max: 0.012, step: 0.0005, default: 0.0042, group: 'Controls' },
      v => { this.sens = v; });
  }

  setZone(id) {
    this.zoneId = ZONE_IDS.includes(id) ? id : 'neutral';
    this.mesh.geometry = this.people.geo[this.zoneId];
    this.mesh.material = this.people.mat[this.zoneId];
  }

  update(dt, app) {
    if (!this.enabled) { this.object3D.visible = false; return; }
    this.object3D.visible = !this.free;
    if (this.free) {
      if (this.controls && !this.wasFree) {
        this.controls.target.set(this.pos.x, this.pos.y + this.height, this.pos.z);
        this.wasFree = true;
      }
      this.controls?.update();
      return;
    }
    this.wasFree = false;

    const cmd = this.input.read();

    this.camYaw -= cmd.lx * this.sens;
    this.camPitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, this.camPitch + cmd.ly * this.sens));

    const fwd = new THREE.Vector3(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const want = new THREE.Vector3()
      .addScaledVector(fwd, cmd.my).addScaledVector(right, cmd.mx);
    const mag = Math.min(1, want.length());
    if (mag > 0.001) want.normalize().multiplyScalar(mag * this.speed * (cmd.sprint ? 1.7 : 1));

    this.vel.lerp(want, 1 - Math.exp(-9 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -145, 145);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -100, 108);
    this.pos.y = heightAt(this.pos.x, this.pos.z);

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.15) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * (1 - Math.exp(-11 * dt));
    }

    if (cmd.attack) this.swing = 1;
    this.swing = Math.max(0, this.swing - dt * 2.6);
    const arc = Math.sin(this.swing * Math.PI) * 0.85;

    this.object3D.position.copy(this.pos);
    this.object3D.rotation.set(sp * 0.03 + arc * 0.22, this.yaw + arc * 0.9, 0, 'YXZ');

    const u = this.people.uniforms.uSelf.value;
    u.set(0, Math.min(1.4, sp / 3), 0, arc * 0.7);

    const aim = this.camAim.set(this.pos.x, this.pos.y + this.height, this.pos.z);
    const cp = Math.cos(this.camPitch);
    const back = new THREE.Vector3(-fwd.x * cp, Math.sin(this.camPitch), -fwd.z * cp)
      .multiplyScalar(this.dist).add(aim);
    back.y = Math.max(back.y, heightAt(back.x, back.z) + 0.7);

    if (!this.started) { this.camPos.copy(back); this.started = true; }
    this.camPos.lerp(back, 1 - Math.exp(-11 * dt));
    app.camera.position.copy(this.camPos);
    app.camera.up.copy(UP);
    app.camera.lookAt(aim);
  }
}
