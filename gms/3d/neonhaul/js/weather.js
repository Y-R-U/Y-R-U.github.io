// §2.2's weather.js — the GPU rain field and the wind that drives it.
//
// ONE draw call, 2,500 instances at HIGH / 900 at LOW, 5,000 triangles, and ZERO per-frame CPU
// work per drop: the whole simulation is one `fract()` in the vertex shader (materials.js §10).
// The instance buffer is written once at construction and never touched again — what moves is
// three uniforms, so a 60 s flight uploads nothing.
//
// The field is a box parked on the camera. A drop that falls out of the bottom reappears at the
// top of the same box, so there is no spawn logic, no pool, no sort and no lifetime. The box is
// deliberately SHORT (90 m) and narrow relative to draw distance: rain reads as rain because it is
// dense in the near field, and a 900 m rain volume spends its whole budget on drops that are one
// fogged pixel each.
//
// Lightning lives in sky.js (it is a light and a dome flash, not geometry). Windscreen droplets
// need a windscreen — P6 builds the cockpit, and the droplet canvas is already baked (atlas.js)
// and waiting for it. That is a deliberate deferral, not an omission.

import * as THREE from 'three';
import { rainMaterial } from './materials.js';
import { xorshift32 } from './utils.js';

// The box is deliberately small. 2,500 drops in a 150 m cube is one drop per 850 m³ and reads as
// a light drizzle of very fat streaks; the same 2,500 in a 100 x 70 x 100 m box is one per 280 m³
// and reads as rain, because rain reads by DENSITY IN THE NEAR FIELD and a drop 400 m away is one
// fogged pixel that cost the same as a drop in front of you.
const BOX = { w: 104, h: 72, d: 104 };

export class Weather {
  constructor(scene, Q, seed = 0x51ee) {
    this.Q = Q;
    this.amount = 0;
    this.wind = new THREE.Vector2(0, 0);
    this.windTarget = new THREE.Vector2(0, 0);
    this.t = 0;

    const n = Math.max(0, Q.rain | 0);
    this.n = n;

    // A 1x1 quad, instanced. `InstancedBufferGeometry` on a plain Mesh rather than an
    // InstancedMesh: the shader builds every drop's position from `iRnd` and never reads an
    // instance matrix, so allocating 2,500 x 16 floats of identity matrices would be 160 KB of
    // buffer that exists only to be ignored.
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;
    geo.attributes.normal = quad.attributes.normal;
    geo.instanceCount = n;
    const rnd = new Float32Array(n * 3);
    const rng = xorshift32(seed);
    for (let i = 0; i < n; i++) { rnd[i * 3] = rng(); rnd[i * 3 + 1] = rng(); rnd[i * 3 + 2] = rng(); }
    geo.setAttribute('iRnd', new THREE.InstancedBufferAttribute(rnd, 3));
    // The drops are placed by the shader, so the geometry's own bounds are meaningless.
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = geo;
    quad.dispose();

    this.mat = rainMaterial();
    this.u = this.mat.userData.u;
    this.u.uRainBox.value.set(BOX.w, BOX.h, BOX.d);

    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  applyQuality(Q) {
    this.Q = Q;
    this.geo.instanceCount = Math.min(this.n, Math.max(0, Q.rain | 0));
  }

  // `rain` is the blended variant's own 0-1 value (sky.js). Everything scales off it, including
  // whether the field is drawn at all: `daysmog` has rain 0.0 and must not pay a single fragment.
  update(dt, camPos, rain, fwd = null) {
    this.t += dt;
    this.amount = rain;
    // `forceOff` is the GATE's control, and it has to live here rather than on mesh.visible:
    // update() runs every frame and would put visible back before the next probe, so a test that
    // "turned the rain off" measured the rain twice and reported a difference of exactly zero.
    const on = rain > 0.02 && !this.forceOff;
    this.mesh.visible = on;
    if (!on) return;

    // A slow wander so the rain is not a metronome. Two coprime sines, no RNG, so it is
    // deterministic and a shot taken twice is the same picture.
    this.windTarget.set(Math.sin(this.t * 0.11) * 6.5 + Math.sin(this.t * 0.037) * 3.0,
      Math.cos(this.t * 0.083) * 5.0);
    this.wind.lerp(this.windTarget, Math.min(1, dt * 0.6));

    const u = this.u;
    // The box is parked AHEAD of the camera, not on it, and this is worth the four lines: a box
    // centred on the camera spends half its drops behind your head. Pushing it 34 % of its own
    // width along the view direction doubles the drops that are actually in frame at no cost —
    // measured as the fix for a blind round that read the rain as "a stuck particle patch in the
    // top-left corner" on a camera pitched down over a canyon, where a camera-centred box put
    // every drop above the sightline.
    if (fwd) {
      u.uRainOrigin.value.set(
        camPos.x + fwd.x * BOX.w * 0.34,
        camPos.y + BOX.h * 0.18 + fwd.y * BOX.h * 0.30,
        camPos.z + fwd.z * BOX.d * 0.34);
    } else {
      u.uRainOrigin.value.set(camPos.x, camPos.y + BOX.h * 0.22, camPos.z);
    }
    u.uWind.value.copy(this.wind).multiplyScalar(rain);
    u.uRainAmt.value = rain;
    u.uRainLen.value = 0.85 + 0.75 * rain;
    u.uShear.value = this.wind.x * 0.012;
    this.mat.opacity = 0.20 * (0.30 + 0.70 * rain);
  }

  state() {
    return {
      drops: this.mesh.visible ? this.geo.instanceCount : 0,
      amount: +this.amount.toFixed(3),
      wind: [+this.wind.x.toFixed(2), +this.wind.y.toFixed(2)],
      visible: this.mesh.visible,
    };
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}
