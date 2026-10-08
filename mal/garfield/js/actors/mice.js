// Tiny cartoon mice: one InstancedMesh (merged body/head/ears/eyes/tail, vertex coloured) for the whole pack.
// createMice({count}) → {root, mice, update(dt), setPaths(paths), scurry(from, to, {speed}) → Promise, wander(area), show(bool), dispose()}
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

function part(geo, color, m) {
  geo.applyMatrix4(m);
  const c = new THREE.Color(color), n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo.index ? geo.toNonIndexed() : geo;
}
const M = (x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const SIZE = 1.75;
function mouseGeometry() {
  const grey = 0xd8d2ca, pink = 0xff9cab, dark = 0x151010, shade = 0x2a1a10;
  const parts = [
    part(new THREE.CircleGeometry(1, 14), shade, M(0, 0.002, -0.01, 0.04, 0.055, 1, -Math.PI / 2)),     // soft contact shadow
    part(new THREE.SphereGeometry(1, 12, 8), grey, M(0, 0.022, -0.005, 0.024, 0.02, 0.036)),            // body
    part(new THREE.SphereGeometry(1, 10, 8), grey, M(0, 0.028, 0.035, 0.016, 0.015, 0.02, -0.2)),        // head
    part(new THREE.ConeGeometry(0.01, 0.022, 8), grey, M(0, 0.026, 0.058, 1, 1, 1, Math.PI / 2)),        // snout
    part(new THREE.SphereGeometry(0.0035, 6, 4), pink, M(0, 0.026, 0.069)),                              // nose
    part(new THREE.SphereGeometry(1, 10, 6), pink, M(0.012, 0.045, 0.03, 0.011, 0.012, 0.003, 0, 0.3)),  // ears
    part(new THREE.SphereGeometry(1, 10, 6), pink, M(-0.012, 0.045, 0.03, 0.011, 0.012, 0.003, 0, -0.3)),
    part(new THREE.SphereGeometry(0.0032, 6, 4), dark, M(0.008, 0.034, 0.05)),                           // eyes
    part(new THREE.SphereGeometry(0.0032, 6, 4), dark, M(-0.008, 0.034, 0.05)),
  ];
  // curly tail
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(0.012 * Math.sin(t * 5), 0.015 + 0.012 * Math.sin(t * 3), -0.04 - t * 0.06)); }
  parts.push(part(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0025, 5), pink, new THREE.Matrix4()));
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  return g;
}

export function createMice({ count = 6, color = null } = {}) {
  const geo = mouseGeometry();
  // comic-sized and pale with a little self-light so they read on warm wooden floors at gameplay distance
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x2a2622 });
  if (color) mat.color.set(color);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true; mesh.frustumCulled = false; mesh.name = 'mice';
  const root = new THREE.Group(); root.name = 'mice'; root.add(mesh);
  const mice = [];
  for (let i = 0; i < count; i++) mice.push({ i, pos: new THREE.Vector3(0, -10, 0), yaw: 0, path: null, seg: 0, dir: 1, speed: 1.5, t: Math.random() * 10, active: false, done: null, mode: null });
  let area = null;
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

  function startPath(m, path, mode, speed) {
    m.path = path.map((p) => p.clone()); m.seg = 0; m.dir = 1; m.mode = mode; m.active = true; m.speed = speed ?? 1.4 + Math.random() * 0.5;
    m.pos.copy(m.path[0]);
  }
  function randomTarget() {
    return new THREE.Vector3(THREE.MathUtils.lerp(area.min.x, area.max.x, Math.random()), area.min.y ?? 0, THREE.MathUtils.lerp(area.min.z, area.max.z, Math.random()));
  }

  const api = {
    root, mesh, mice,
    // paths: arrays of Vector3 (floor points). Mouse i runs paths[i % n] back and forth forever.
    setPaths(paths) { mice.forEach((m, i) => { const p = paths[i % paths.length]; if (p && p.length > 1) startPath(m, p, 'pingpong'); }); },
    // one free mouse dashes from → to, then hides; resolves on arrival
    scurry(from, to, { speed } = {}) {
      const m = mice.find((x) => !x.active) || mice[0];
      startPath(m, [from, to], 'once', speed ?? 1.8);
      return new Promise((r) => { m.done = r; });
    },
    // all mice dart about randomly inside {min, max} (Vector3s; y = floor height)
    wander(a) { area = a; mice.forEach((m) => { const p = m.active && m.pos.y > -1 ? m.pos.clone() : randomTarget(); startPath(m, [p, randomTarget()], 'wander'); }); },
    show(v) { root.visible = !!v; },
    stop() { mice.forEach((m) => { m.active = false; m.pos.y = -10; }); },
    update(dt) {
      for (const m of mice) {
        m.t += dt;
        if (m.active && m.path) {
          const a = m.path[m.seg], b = m.path[m.seg + m.dir] ?? null;
          if (!b) { m.active = false; } else {
            _v.subVectors(b, m.pos); _v.y = 0;
            const d = _v.length(), step = m.speed * dt * (0.75 + 0.5 * Math.max(0, Math.sin(m.t * 9 + m.i)));   // stop-start dash
            if (d <= step) {
              m.pos.copy(b); m.seg += m.dir;
              if (m.seg + m.dir < 0 || m.seg + m.dir >= m.path.length) {
                if (m.mode === 'pingpong') m.dir = -m.dir;
                else if (m.mode === 'wander') { m.path = [m.pos.clone(), randomTarget()]; m.seg = 0; m.dir = 1; }
                else { m.active = false; m.pos.y = -10; m.done?.(); m.done = null; }
              }
            } else {
              m.pos.addScaledVector(_v.normalize(), step);
              const yaw = Math.atan2(_v.x, _v.z);
              let dy = yaw - m.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
              m.yaw += dy * Math.min(1, dt * 18);
            }
            void a;
          }
        }
        const run = m.active ? 1 : 0;
        _q.setFromAxisAngle(_up, m.yaw + 0.15 * run * Math.sin(m.t * 30));
        _s.set(SIZE, SIZE * (1 + 0.12 * run * Math.sin(m.t * 40)), SIZE);
        _v.copy(m.pos); _v.y += 0.008 * run * Math.abs(Math.sin(m.t * 40));
        _m.compose(_v, _q, _s);
        mesh.setMatrixAt(m.i, _m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() { root.removeFromParent(); geo.dispose(); mat.dispose(); mesh.dispose(); },
  };
  api.update(0);
  return api;
}
