// The ambient layer: blinking beacons and the small craft that shuttle between the big hulls.
//
// None of this is the sim. Pausing stops the company, not the system — a paused Reach still has
// lights strobing on the truss and tenders crossing between the yards, and speeding the clock up
// speeds the whole background with it. That is the whole reason the layer is separate: it takes a
// rate, never a tick.
//
// Cost is fixed no matter how much of it there is: one Points for every beacon in the system, one
// InstancedMesh plus one Points for every tender.

import * as THREE from 'three';
import { getMaterial } from './materials.js';

const V2 = new THREE.Vector2();

// aKind 0 strobes hard, 1 breathes. The blink is done here rather than on the CPU so a hundred
// lamps on their own phases cost one uniform write a frame.
const BEACON_VERT = `
attribute float aSize;
attribute vec3 aCol;
attribute vec3 aBlink;
varying vec3 vCol;
varying float vK;
uniform float uViewH, uMax, uTime, uPower;
void main(){
  float ph = fract(uTime * aBlink.x + aBlink.y);
  float duty = aBlink.z;
  float kind = step(0.5, aBlink.z);
  float strobe = smoothstep(0.0, 0.06, ph) * (1.0 - smoothstep(0.10, 0.22, ph));
  float breathe = 0.55 + 0.45 * sin(ph * 6.2831853);
  vK = mix(strobe, breathe, kind);
  vCol = aCol * uPower;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float s = aSize * projectionMatrix[1][1] * uViewH * 0.5 / max(0.001, -mv.z);
  gl_PointSize = clamp(s * (0.55 + 0.45 * vK), 1.0, uMax);
  gl_Position = projectionMatrix * mv;
}`;

const BEACON_FRAG = `
varying vec3 vCol;
varying float vK;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = pow(max(0.0, 1.0 - d), 2.4);
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol * a * vK, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const rnd = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

/**
 * beacons(list) — list entries are { pos, color, size, rate, steady }.
 * Everything in one buffer; `update(t)` is a single uniform write.
 */
export function beacons(list, { power = 1, seed = 11, max = 90 } = {}) {
  if (!list.length) return null;
  const R = rnd(0x9e37 + seed * 2654435761);
  const pos = new Float32Array(list.length * 3);
  const col = new Float32Array(list.length * 3);
  const blink = new Float32Array(list.length * 3);
  const size = new Float32Array(list.length);

  list.forEach((b, i) => {
    pos.set(b.pos, i * 3);
    const c = new THREE.Color(b.color || '#ff5a3c').convertSRGBToLinear().multiplyScalar(b.gain ?? 1);
    col.set([c.r, c.g, c.b], i * 3);
    blink.set([b.rate ?? (0.28 + R() * 0.42), b.phase ?? R(), b.steady ? 1 : 0], i * 3);
    size[i] = b.size ?? 2.6;
  });

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aBlink', new THREE.Float32BufferAttribute(blink, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));

  const m = new THREE.ShaderMaterial({
    uniforms: { uViewH: { value: 720 }, uMax: { value: max }, uTime: { value: 0 }, uPower: { value: power } },
    vertexShader: BEACON_VERT, fragmentShader: BEACON_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  });

  const p = new THREE.Points(g, m);
  p.name = 'beacons';
  p.renderOrder = 16;
  p.frustumCulled = false;
  p.onBeforeRender = r => { m.uniforms.uViewH.value = r.getDrawingBufferSize(V2).y; };
  p.update = t => { m.uniforms.uTime.value = t; };
  return p;
}

/**
 * tenders(loops) — the little craft that never stop. Each loop is { points, count, speed, size }.
 * One instanced hull for the lot and one Points for their exhausts.
 */
export function tenders(loops, { palette = 'ferrous', seed = 5, glow = '#ffbe6a' } = {}) {
  const runs = [];
  for (const l of loops) {
    const curve = new THREE.CatmullRomCurve3(l.points.map(p => new THREE.Vector3(...p)), true, 'catmullrom', 0.4);
    const n = l.count ?? 2;
    for (let i = 0; i < n; i++) {
      runs.push({ curve, u: i / n, speed: (l.speed ?? 0.02) * (0.82 + 0.36 * ((i * 7 + seed) % 5) / 5), size: l.size ?? 5 });
    }
  }
  if (!runs.length) return null;

  const grp = new THREE.Group();
  grp.name = 'tenders';

  // a blunt wedge — at these distances the silhouette is the whole read, so a hull kit would be
  // eight meshes apiece for detail nothing can resolve
  const body = new THREE.BoxGeometry(1, 0.62, 3.2);
  body.translate(0, 0, 0.2);
  const mesh = new THREE.InstancedMesh(body, getMaterial(palette, 'hullDark'), runs.length);
  mesh.frustumCulled = false;
  grp.add(mesh);

  const ep = new Float32Array(runs.length * 3);
  const ec = new Float32Array(runs.length * 3);
  const es = new Float32Array(runs.length);
  const hue = new THREE.Color(glow).convertSRGBToLinear();
  runs.forEach((r, i) => { ec.set([hue.r, hue.g, hue.b], i * 3); es[i] = r.size * 0.55; });

  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(ep, 3));
  eg.setAttribute('aCol', new THREE.Float32BufferAttribute(ec, 3));
  eg.setAttribute('aBlink', new THREE.Float32BufferAttribute(new Float32Array(runs.length * 3).fill(1), 3));
  eg.setAttribute('aSize', new THREE.Float32BufferAttribute(es, 1));
  const em = new THREE.ShaderMaterial({
    uniforms: { uViewH: { value: 720 }, uMax: { value: 60 }, uTime: { value: 0 }, uPower: { value: 1.6 } },
    vertexShader: BEACON_VERT, fragmentShader: BEACON_FRAG,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false,
  });
  const exhaust = new THREE.Points(eg, em);
  exhaust.frustumCulled = false;
  exhaust.renderOrder = 17;
  exhaust.onBeforeRender = r => { em.uniforms.uViewH.value = r.getDrawingBufferSize(V2).y; };
  grp.add(exhaust);

  const M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Vector3();
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const look = new THREE.Matrix4();

  grp.update = t => {
    em.uniforms.uTime.value = t;
    runs.forEach((r, i) => {
      const u = (r.u + t * r.speed) % 1;
      r.curve.getPoint(u, P);
      r.curve.getPoint((u + 0.004) % 1, Q);
      s.setScalar(r.size);
      look.lookAt(P, Q, up);
      q.setFromRotationMatrix(look);
      mesh.setMatrixAt(i, M.compose(P, q, s));
      // the exhaust sits behind it, which is +Z once lookAt has pointed −Z down the track
      Q.subVectors(P, Q).normalize().multiplyScalar(r.size * 1.9).add(P);
      ep[i * 3] = Q.x; ep[i * 3 + 1] = Q.y; ep[i * 3 + 2] = Q.z;
    });
    mesh.instanceMatrix.needsUpdate = true;
    eg.attributes.position.needsUpdate = true;
  };

  grp.update(0);
  return grp;
}

// Ring of lamps round a point, for a dock collar or a rock's survey markers.
export function beaconRing(center, r, n, opts = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ ...opts, pos: [center[0] + Math.cos(a) * r, center[1], center[2] + Math.sin(a) * r], phase: i / n });
  }
  return out;
}
