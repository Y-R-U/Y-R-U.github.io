import * as THREE from 'three';
import * as S from './shape.js?v=20261004c';
import { createBuilder } from './build.js?v=20261004c';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

// Unit stock items (≈ size 1 before scaling), themed per line.
export function stockUnit(materials, kind = 'box', palette = {}, color = null) {
  const b = createBuilder(materials, palette, { seed: 3 });
  const c = color ?? palette.stock ?? '#f4e04d';
  switch (kind) {
    case 'cup':
      b.cyl('white', 0, 0, 0, 0.36, 0.85, 0, { sides: 9, taper: 1.3 });
      b.cyl(c, 0, 0.83, 0, 0.47, 0.12, 0, { sides: 9, taper: 0.95 });
      b.cyl('red', 0.12, 0.9, 0, 0.04, 0.45, 0, { sides: 5, rz: -0.25 });
      break;
    case 'parcel':
      b.ball(c, 0, 0.28, 0, 0.5, { sx: 1.2, sy: 0.55, sz: 0.75, detail: 1, r: 0.25, m: 0.7 });
      break;
    case 'bag':
      b.slab(c, 0, 0, 0, 0.75, 0.85, 0.45, { round: 0.12, taper: 0.12 });
      b.slab('white', 0, 0.82, 0, 0.5, 0.1, 0.42, { round: 0.04 });
      break;
    case 'crate':
      b.slab('wood', 0, 0, 0, 1, 0.62, 0.72, { round: 0.06 });
      for (let i = 0; i < 4; i++) b.ball(c, -0.33 + i * 0.22, 0.62, (i % 2 - 0.5) * 0.2, 0.15, { detail: 0 });
      break;
    case 'bun':
      b.ball(c, 0, 0.25, 0, 0.5, { sy: 0.55, detail: 1, smooth: true });
      break;
    default:
      b.slab(c, 0, 0, 0, 1, 0.72, 0.8, { round: 0.1 });
      b.slab('white', 0, 0.3, 0, 1.02, 0.14, 0.82, { round: 0.03 });
  }
  return b.geometry({ ao: 0.15, aoH: 0.4 });
}

// layout: 'pyramid' (stacked rows), 'grid' (flat rows, e.g. a tray), 'heap' (loose), or an array of [x,y,z,ry].
export function createPile(materials, { color = null, max = 24, size = 0.35, cols = 4, kind = 'box', geo = null, palette = {}, layout = 'pyramid', spacing = 1.12 } = {}) {
  const g = geo || stockUnit(materials, kind, palette, color);
  const mesh = new THREE.InstancedMesh(g, materials.uber, max);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const slots = Array.isArray(layout) ? layout : [];
  if (!slots.length) {
    let r = 7;
    const rnd = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
    if (layout === 'grid') {
      for (let i = 0; i < max; i++) slots.push([((i % cols) - (cols - 1) / 2) * size * spacing, 0, (Math.floor(i / cols) - 1) * size * spacing, (rnd() - 0.5) * 0.3]);
    } else if (layout === 'heap') {
      for (let i = 0; i < max; i++) { const a = i * 2.4, rr = Math.sqrt(i) * size * 0.55; slots.push([Math.cos(a) * rr, Math.max(0, 1.6 - rr / size) * size * 0.35 * (i > 3 ? 1 : 0), Math.sin(a) * rr, rnd() * 6]); }
    } else {
      let n = 0, layer = 0;
      let w = cols;
      while (n < max && w > 0) {
        const rows = Math.max(1, w - 1);
        for (let zr = 0; zr < rows && n < max; zr++) for (let xc = 0; xc < w && n < max; xc++, n++) {
          slots.push([(xc - (w - 1) / 2) * size * spacing, layer * size * 0.98, (zr - (rows - 1) / 2) * size * spacing, (rnd() - 0.5) * 0.35]);
        }
        layer++; w--;
      }
      while (slots.length < max) slots.push([...slots[slots.length - 1]]);
    }
  }
  for (let i = 0; i < max; i++) {
    const [x, y, z, ry] = slots[i];
    _e.set(0, ry || 0, 0);
    _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), _s.setScalar(size));
    mesh.setMatrixAt(i, _m);
  }
  mesh.computeBoundingSphere();
  mesh.boundingSphere.radius += size;
  mesh.count = 0;
  let shown = -1;
  return {
    mesh,
    max,
    slots,
    set(ratio) {
      const n = Math.round(Math.max(0, Math.min(1, ratio)) * max);
      if (n !== shown) { shown = mesh.count = n; }
    },
  };
}
void _c; void S;
