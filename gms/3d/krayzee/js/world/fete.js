// C3: the village's royal-silly character: a cricket square and pavilion on the green, a striped maypole with ribbons,
// and bunting strung down the high street in the kingdom's colours. Merged into the town's meshes (no draw calls).
import * as THREE from 'three';
import { col, mat } from './util.js';

const BUNT = ['#c4122f', '#f4f2ea', '#4b1f7a', '#e2ac2c', '#1f3f78'].map((c) => col(c));
// one double-sided flag: two triangles sharing three vertices (normal up-ish so both faces light alike)
const tri = (M, a, b, c, color) => { const i = M.v(...a, 0, 1, 0, color); M.v(...b, 0, 1, 0, color); M.v(...c, 0, 1, 0, color); M.tri(i, i + 1, i + 2); M.tri(i, i + 2, i + 1); };

// pts: [[x, z], ...] pole positions along a street; flags hang from a sagging line between neighbours
function bunting(M, pts, heightAt, h = 5.5) {
  for (const [x, z] of pts) M.geo(new THREE.CylinderGeometry(0.08, 0.1, h + 0.6, 5), mat(x, heightAt(x, z) + (h + 0.6) / 2, z), col('#e8e2d0'));
  let k = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 1.5);
    const ux = (bx - ax) / L, uz = (bz - az) / L;
    for (let j = 1; j < n; j++) {
      const t = j / n, sag = Math.sin(t * Math.PI) * 1.4, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = heightAt(x, z) + h - sag;
      tri(M, [x - ux * 0.38, y, z - uz * 0.38], [x + ux * 0.38, y, z + uz * 0.38], [x, y - 0.75, z], BUNT[k++ % BUNT.length]);
    }
  }
}

export function buildFete(M, green, heightAt) {
  const gx = (green.x0 + green.x1) / 2, gz = (green.z0 + green.z1) / 2, y0 = heightAt(gx, gz);
  // cricket square: a pale strip with white creases; white sightscreens at each end; a little pavilion with a clock
  const px = gx + 22;
  M.rect(px, gz, 0, 1, 24, 3.2, y0 + 0.06, col('#cdbf8c'));
  for (const e of [-1, 1]) {
    M.rect(px, gz + e * 10, 1, 0, 3.6, 0.12, y0 + 0.08, col('#f8f8f2'));
    M.box(px, y0 + 2, gz + e * 38, 7, 4, 0.3, col('#f4f4ee'));
    for (const s of [-0.12, 0, 0.12]) M.box(px + s, y0 + 0.36, gz + e * 10.1, 0.04, 0.72, 0.04, col('#e8dcc0'));
  }
  M.box(gx + 58, y0 + 2, gz, 6, 4, 12, col('#f2efe6'));
  M.geo(new THREE.ConeGeometry(7.4, 2.4, 4).rotateY(Math.PI / 4).scale(0.9, 1, 1.75), mat(gx + 58, y0 + 5.2, gz), col('#3d5a3a'));
  M.box(gx + 54.9, y0 + 1.2, gz, 0.2, 2.4, 9, col('#5b3a22'));
  // maypole: barber-striped pole, a gold crown, ribbons fanned to the grass
  const mx = gx - 36, mz = gz - 6;
  for (let k = 0; k < 10; k++) M.geo(new THREE.CylinderGeometry(0.22, 0.24, 1.2, 8), mat(mx, y0 + 0.6 + k * 1.2, mz), k % 2 ? col('#c4122f') : col('#f4f2ea'));
  M.geo(new THREE.SphereGeometry(0.6, 10, 6), mat(mx, y0 + 12.4, mz), col('#e2ac2c'));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2, ex = mx + Math.cos(a) * 9, ez = mz + Math.sin(a) * 9;
    M.beam([mx, y0 + 11.8, mz], [ex, y0 + 0.9, ez], 0.12, BUNT[k % BUNT.length]);
  }
  // bunting: round the green and down the high street
  bunting(M, [[green.x0, green.z0], [green.x1, green.z0], [green.x1, green.z1], [green.x0, green.z1], [green.x0, green.z0]], heightAt, 4.5);
  const street = []; for (let x = -540; x <= 340; x += 30) street.push([x, -1543]);
  bunting(M, street, heightAt);
  const north = []; for (let z = -1880; z <= -1250; z += 30) north.push([-71, z]);
  bunting(M, north, heightAt);
}
