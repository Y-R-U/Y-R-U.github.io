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
  if (holes && high) paint.alphaToCoverage = true;

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
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.translate(128, 128);
  const R = 128;
  const ring = (r0, r1, col, a) => { g.beginPath(); g.arc(0, 0, r1 * R, 0, 7); g.arc(0, 0, r0 * R, 0, 7, true); g.fillStyle = col; g.globalAlpha = a; g.fill(); };
  ring(0.17, 0.83, '#202124', 0.13);
  for (let i = 0; i < 2; i++) {
    g.rotate(Math.PI);
    const gr = g.createLinearGradient(0, 0, R, 0);
    gr.addColorStop(0, 'rgba(30,30,32,0)'); gr.addColorStop(0.5, 'rgba(30,30,32,0.06)'); gr.addColorStop(0.95, 'rgba(30,30,32,0.03)');
    g.globalAlpha = 1; g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.86, -0.5, 0.15); g.closePath(); g.fill();
  }
  ring(0.83, 0.87, '#c8202a', 0.1);
  ring(0.87, 0.91, '#f2f2f2', 0.13);
  ring(0.91, 0.95, '#c8202a', 0.1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
