// §3.9 — distant fabric silhouettes. The ONE exception §1.1 permits, and the module with an
// explicit kill criterion attached: if a critic round calls them flat, cardboard or "sprites",
// DELETE THIS FILE. They are worth one draw call and nothing more.
//
// Hard rules, verbatim from §3.9, and every one of them is enforced below:
//   - never within 140 m of the camera (culled in the vertex shader, not on the CPU)
//   - unlit near-black with fog on — silhouettes and nothing more
//   - motion is a +/-0.15 m sine drift on a per-instance phase. No walking, no turning, no rig
//   - <= 120 instances, off entirely on LOW (`Q.silhouettes`)
//
// The cross-billboard is two quads at 90 degrees (4 triangles), which is what stops the shape
// vanishing when you fly past its plane — a true billboard would rotate to face the camera and a
// figure that pivots to watch you is exactly the "sprite" tell that gets this module deleted.

import * as THREE from 'three';
import { silhouetteMaterial } from './materials.js';
import { xorshift32, hash2i } from './utils.js';

const MAX = 120;
const NEAR = 140;          // §3.9's hard radius

// Two quads at 90 degrees, 1 x 1, origin at the FOOT so a placement is "stand here".
function crossQuad() {
  const g = new THREE.BufferGeometry();
  const p = [], uv = [], idx = [];
  const push = (ax, az) => {
    const b = p.length / 3;
    p.push(-0.5 * ax, 0, -0.5 * az, 0.5 * ax, 0, 0.5 * az, 0.5 * ax, 1, 0.5 * az, -0.5 * ax, 1, -0.5 * az);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  push(1, 0);
  push(0, 1);
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const VERT_DECL = /* glsl */`
attribute float iPhase;
uniform float uTime;
uniform float uNear;
`;

// The 140 m cull and the drift, both per instance, both free. `instanceMatrix[3].xyz` is the
// placement; `cameraPosition` is declared by three's `common` chunk in the vertex shader.
const VERT_BODY = /* glsl */`
#include <begin_vertex>
  {
    vec3 wp = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    float d = distance( cameraPosition, wp );
    float keep = step( uNear, d );
    transformed.x += 0.15 * sin( uTime * 0.5 + iPhase ) * position.y;
    transformed.z += 0.15 * cos( uTime * 0.37 + iPhase ) * position.y;
    transformed *= keep;                 // §3.9: parked at zero scale inside the radius
    transformed.y -= ( 1.0 - keep ) * 9999.0;
  }
`;

export class Silhouettes {
  constructor(scene, Q, atlas, seed = 0x77ee) {
    this.Q = Q;
    this.on = !!Q.silhouettes;
    this.seed = seed;
    this.n = 0;
    this.uTime = { value: 0 };
    this.uNear = { value: NEAR };

    this.mat = silhouetteMaterial(atlas.figure);
    const prev = this.mat.onBeforeCompile;
    this.mat.onBeforeCompile = (sh, r) => {
      prev?.call(this.mat, sh, r);
      sh.uniforms.uTime = this.uTime;
      sh.uniforms.uNear = this.uNear;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>' + VERT_DECL);
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', VERT_BODY);
    };
    this.mat.userData.patches = (this.mat.userData.patches || []).concat('silh');
    const key = this.mat.type + '|' + this.mat.userData.patches.join(',');
    this.mat.customProgramCacheKey = () => key;

    this.geo = crossQuad();
    this.geo.setAttribute('iPhase', new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1));
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.renderOrder = 1;
    this.mesh.count = 0;
    this.mesh.visible = this.on;
    scene.add(this.mesh);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.atCx = NaN; this.atCz = NaN;
  }

  // Rebuilt only when the camera changes chunk. Ledges, bridges and podium roofs — never a tower
  // top, because a figure on a 400 m roof is a scale cue that lies.
  rebuild(live) {
    if (!this.on) return 0;
    const rng = xorshift32(this.seed);
    const ph = this.geo.attributes.iPhase.array;
    let n = 0;
    for (const rec of live) {
      if (!rec.desc || n >= MAX) continue;
      for (const b of rec.desc.buildings) {
        if (n >= MAX) break;
        if (b.h < 14 || b.h > 74) continue;                 // podium / low-rise roofs only
        if ((hash2i(Math.round(b.x), Math.round(b.z), 0x51) & 15) > 3) continue;   // ~25 % of them
        const edge = rng() < 0.5 ? 1 : -1;
        const along = (rng() - 0.5) * 0.72;
        const onX = rng() < 0.5;
        const x = b.x + (onX ? along * b.w : edge * b.w * 0.44);
        const z = b.z + (onX ? edge * b.d * 0.44 : along * b.d);
        const h = 1.7 + rng() * 0.25;
        this._p.set(x, b.h + 0.02, z);
        this._q.setFromAxisAngle(UP, rng() * 6.2832);
        this._s.set(h * 0.55, h, h * 0.55);
        this._m.compose(this._p, this._q, this._s);
        this._m.toArray(this.mesh.instanceMatrix.array, n * 16);
        ph[n] = rng() * 6.2832;
        n++;
      }
    }
    this.n = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.geo.attributes.iPhase.needsUpdate = true;
    return n;
  }

  update(dt, t, cityR, camPos) {
    if (!this.on || !cityR) return;
    this.uTime.value = t;
    const cx = cityR.ccx, cz = cityR.ccz;
    if (cx !== this.atCx || cz !== this.atCz) {
      this.atCx = cx; this.atCz = cz;
      this.rebuild(cityR.live.values());
    }
  }

  setVisible(on) { this.mesh.visible = !!on && this.on; return this.mesh.visible; }

  state() { return { on: this.on, instances: this.n, near: NEAR, tris: this.n * 4 }; }

  dispose() {
    this.geo.dispose(); this.mat.dispose();
    this.mesh.parent?.remove(this.mesh);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
