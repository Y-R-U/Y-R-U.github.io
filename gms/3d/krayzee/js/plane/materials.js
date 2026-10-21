import * as THREE from 'three';

export function createMaterials({ quality, livery, holes }) {
  const high = quality !== 'low';
  const paintOpts = {
    map: livery.texture, roughnessMap: livery.roughTex, roughness: 0.95, metalness: 0.0,
    alphaTest: holes ? 0.5 : 0, envMapIntensity: 1.0,
  };
  const paint = high
    ? new THREE.MeshPhysicalMaterial({ ...paintOpts, clearcoat: 0.7, clearcoatRoughness: 0.14 })
    : new THREE.MeshStandardMaterial(paintOpts);
  if (holes) paint.alphaToCoverage = true;

  const trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.35 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x9fb4c4, roughness: 0.04, metalness: 0.0, transparent: true, opacity: high ? 0.24 : 0.3,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6, specularIntensity: 1,
  });
  const prop = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.55 });
  const disc = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0, toneMapped: true });
  const lights = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const beacon = new THREE.MeshBasicMaterial({ color: 0x400000, toneMapped: false });
  const interior = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.05 });
  const interiorMetal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 });
  return { paint, trim, glass, prop, disc, lights, beacon, interior, interiorMetal, all() { return [paint, trim, glass, prop, disc, lights, beacon, interior, interiorMetal]; } };
}

export function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function discTexture() {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  const img = g.createImageData(N, N), d = img.data;
  // polar shimmer: faint haze, two soft blade bands, slight radial banding, barely-there tip stripes
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1, r = Math.hypot(u, v), a = Math.atan2(v, u);
    if (r > 0.97 || r < 0.15) continue;
    const edge = Math.min(1, (0.97 - r) / 0.14) * Math.min(1, (r - 0.15) / 0.06);
    const band = Math.pow(0.5 + 0.5 * Math.cos(2 * (a + 0.9 * r * r)), 6);
    const ring = 0.5 + 0.5 * Math.sin(r * 58);
    let al = 0.035 + 0.05 * band * (0.4 + r) + 0.012 * ring;
    let col = [34, 35, 38];
    if (r > 0.855 && r < 0.95) {
      const w = r > 0.885 && r < 0.915;
      col = w ? [235, 235, 232] : [170, 40, 44];
      al = 0.018 + 0.028 * band;
    }
    al *= edge;
    const i = (y * N + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(al * 255);
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
