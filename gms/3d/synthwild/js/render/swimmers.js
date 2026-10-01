// Fish-drones: instanced little swimmers that school in the shallows near the camera.
const N = 28;

const VS = /* glsl */`
attribute float aPhase;
attribute vec3 aTint;
uniform float uTime;
varying vec3 vN;
varying vec3 vW;
varying vec3 vTint;
varying float vStripe;
void main() {
  vec3 p = position;
  float sw = sin(uTime * 9.0 + aPhase) * 0.25 * smoothstep(0.0, -0.25, p.z);
  p.x += sw * (-p.z);
  vStripe = step(abs(p.y), 0.012) * step(-0.18, p.z);
  vTint = aTint;
  vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FS = /* glsl */`
uniform vec3 uAmbient, uLightColor, uLightDir, uFogColor, uRimColor;
uniform float uNight, uFogNear, uFogFar;
varying vec3 vN;
varying vec3 vW;
varying vec3 vTint;
varying float vStripe;
void main() {
  vec3 n = normalize(vN);
  vec3 V = normalize(cameraPosition - vW);
  vec3 base = vec3(0.75, 0.8, 0.85);
  vec3 col = base * (uAmbient * 0.8 + uLightColor * max(dot(n, uLightDir), 0.0) * 0.7);
  col += pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 2.0) * uRimColor * 0.5;
  col += vTint * (0.9 + uNight * 1.4) * (vStripe + 0.15);
  float f = smoothstep(uFogNear, uFogFar, length(vW - cameraPosition));
  gl_FragColor = vec4(mix(col, uFogColor, f), 1.0);
  #include <colorspace_fragment>
}`;

function fishGeometry(THREE) {
  // stretched octahedron body + tail fin, nose at +z
  const body = new THREE.OctahedronGeometry(0.12, 0);
  body.scale(0.7, 0.55, 1.9);
  const tail = new THREE.ConeGeometry(0.09, 0.14, 3);
  tail.rotateX(Math.PI / 2); tail.scale(0.3, 1.2, 1); tail.translate(0, 0, -0.27);
  const g = mergeSimple(THREE, [body, tail]);
  g.computeVertexNormals();
  return g;
}
function mergeSimple(THREE, geos) {
  const pos = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gg = g.index ? g.toNonIndexed() : g;
    const p = gg.attributes.position.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < p.length / 3; i++) idx.push(off + i);
    off += p.length / 3;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

export function createSwimmers(ctx, isWater) {
  const { THREE, scene } = ctx;
  const geo = fishGeometry(THREE);
  const phase = new Float32Array(N), tint = new Float32Array(N * 3);
  const palette = [[0.1, 0.95, 1.0], [1.0, 0.3, 0.85], [0.6, 1.0, 0.3], [1.0, 0.75, 0.2]];
  for (let i = 0; i < N; i++) { phase[i] = Math.random() * 10; const c = palette[i % 4]; tint.set(c, i * 3); }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
  const u = ctx.sky.uniforms;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: u.uTime, uAmbient: u.uAmbient, uLightColor: u.uLightColor, uLightDir: u.uLightDir, uFogColor: u.uFogColor,
      uRimColor: u.uRimColor, uNight: u.uNight, uFogNear: u.uFogNear, uFogFar: u.uFogFar },
    vertexShader: VS, fragmentShader: FS,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const fish = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
  const fwd = new THREE.Vector3(0, 0, 1), dir = new THREE.Vector3(), p = new THREE.Vector3();
  let scanT = 0;
  const spots = [];

  function water(x, y, z) { return isWater(ctx.world, Math.floor(x), Math.floor(y), Math.floor(z)); }

  function scan(cam) {
    spots.length = 0;
    const w = ctx.world;
    if (!w) return;
    const cx = Math.floor(cam.position.x), cz = Math.floor(cam.position.z);
    for (let k = 0; k < 160; k++) {
      const x = cx + Math.floor((Math.random() - 0.5) * 40), z = cz + Math.floor((Math.random() - 0.5) * 40);
      let top = -1;
      for (let y = 40; y > 20; y--) { if (water(x, y, z)) { top = y; break; } }
      if (top < 0 || !water(x, top - 1, z)) continue;
      spots.push([x + 0.5, top - 0.6 - Math.random() * 0.8, z + 0.5]);
    }
  }

  return {
    mesh,
    update(dt) {
      const cam = ctx.camera;
      if (!cam || !ctx.world) return;
      scanT -= dt;
      if (scanT <= 0) {
        scanT = 2.5; scan(cam);
        // despawn far fish, spawn small schools at fresh spots
        for (let i = fish.length - 1; i >= 0; i--) if (fish[i].p.distanceTo(cam.position) > 34) fish.splice(i, 1);
        while (fish.length < N && spots.length) {
          const sp = spots.splice(Math.floor(Math.random() * spots.length), 1)[0];
          const school = Math.min(N - fish.length, 3 + Math.floor(Math.random() * 4));
          const h = Math.random() * Math.PI * 2;
          for (let k = 0; k < school; k++) {
            fish.push({ p: new THREE.Vector3(sp[0] + Math.random() - 0.5, sp[1], sp[2] + Math.random() - 0.5),
              h: h + (Math.random() - 0.5) * 0.4, sp: 0.9 + Math.random() * 0.6, turn: 0, y0: sp[1] });
          }
        }
      }
      let n = 0;
      for (const f of fish) {
        f.turn += (Math.random() - 0.5) * dt * 2;
        f.turn *= 0.98;
        f.h += f.turn * dt * 2;
        dir.set(Math.sin(f.h), 0, Math.cos(f.h));
        p.copy(f.p).addScaledVector(dir, 0.6);
        if (!water(p.x, p.y, p.z) || !water(p.x, p.y + 0.4, p.z)) { f.h += Math.PI * (0.6 + Math.random() * 0.4); continue; }
        f.p.addScaledVector(dir, f.sp * dt);
        f.p.y = f.y0 + Math.sin(f.h * 2 + f.sp * 3) * 0.15;
        q.setFromUnitVectors(fwd, dir);
        m4.compose(f.p, q, s);
        mesh.setMatrixAt(n++, m4);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
