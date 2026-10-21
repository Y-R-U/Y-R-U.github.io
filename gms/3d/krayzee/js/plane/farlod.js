import * as THREE from 'three';

// Bakes a far-LOD airframe group into ONE mesh and one material: livery-mapped parts keep their UVs (tm=1),
// everything else (trim, prop, lights, glass) becomes vertex colour (tm=0). Hinges stay at neutral, as they did.
const SKIP = new Set(['propDisc', 'prop']);
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n = new THREE.Matrix3(), _v = new THREE.Vector3(), _c = new THREE.Color();
const farMats = new WeakMap();

function farMaterial(paint) {
  let m = farMats.get(paint);
  if (m) return m;
  m = paint.clone();
  m.vertexColors = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float tm;\nvarying float vTm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTm = tm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vTm;')
      .replace('#include <map_fragment>', '#ifdef USE_MAP\ndiffuseColor *= mix(vec4(1.0), texture2D(map, vMapUv), vTm);\n#endif')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.55, roughnessFactor, vTm);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(0.4, metalnessFactor, vTm);');
  };
  m.customProgramCacheKey = () => 'krayzee-far';
  paint.addEventListener('dispose', () => m.dispose());
  farMats.set(paint, m);
  return m;
}

// frame: the far group (not yet parented is fine). paint: the livery material. glass: colour for glass meshes or null to drop them.
export function mergeFarLOD(frame, { paint, glass = null, skip = SKIP } = {}) {
  frame.updateMatrixWorld(true);
  _inv.copy(frame.matrixWorld).invert();
  const src = [];
  frame.traverse((o) => { if (o.isMesh && o.geometry?.attributes.position) src.push(o); });
  const pos = [], nrm = [], uv = [], col = [], tm = [], idx = [], ranges = {};
  for (const o of src) {
    const name = o.name, mat = o.material;
    if (skip.has(name) || (name === 'glass' && !glass)) continue;
    const g = o.geometry, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, C = g.attributes.color;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    _n.getNormalMatrix(_m);
    const base = pos.length / 3, mapped = !!mat.map && !!U;
    const vc = mat.vertexColors && C;
    const mc = name === 'glass' ? _c.set(glass) : _c.copy(mat.color || _c.setRGB(1, 1, 1));
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m); pos.push(_v.x, _v.y, _v.z);
      if (N) { _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize(); nrm.push(_v.x, _v.y, _v.z); } else nrm.push(0, 1, 0);
      uv.push(mapped ? U.getX(i) : 0, mapped ? U.getY(i) : 0);
      const r = vc && name !== 'glass' ? C.getX(i) : 1, gg = vc && name !== 'glass' ? C.getY(i) : 1, b = vc && name !== 'glass' ? C.getZ(i) : 1;
      col.push(Math.min(1, r * mc.r), Math.min(1, gg * mc.g), Math.min(1, b * mc.b));
      tm.push(mapped ? 255 : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
    ranges[name] = [base, P.count];
  }
  for (const o of src) { o.removeFromParent(); o.geometry.dispose(); }
  for (const c of [...frame.children]) if (!c.isMesh) c.removeFromParent();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('tm', new THREE.BufferAttribute(new Uint8Array(tm), 1, true));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, farMaterial(paint));
  mesh.name = 'plane-far-merged';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  frame.add(mesh);
  // recolour one source part (e.g. the spinner after a livery change); rgb is linear [r,g,b]
  function recolor(name, rgb) {
    const r = ranges[name];
    if (!r) return;
    const A = geo.attributes.color;
    for (let i = r[0]; i < r[0] + r[1]; i++) A.setXYZ(i, rgb[0], rgb[1], rgb[2]);
    A.needsUpdate = true;
  }
  return { mesh, ranges, recolor };
}
