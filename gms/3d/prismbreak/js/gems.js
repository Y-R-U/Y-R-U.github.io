// Gem meshes: one faceted geometry per color, glass vs metal finishes,
// special-gem dressing (line rods / burst cores / nova orbiters / prism).
import * as THREE from 'three';
import { GEM_COLORS } from './config.js';

const GEO = [];
function buildGeometries() {
  if (GEO.length) return;
  const g0 = new THREE.OctahedronGeometry(0.46, 0); g0.scale(1, 1.35, 1);            // ruby
  const g1 = new THREE.DodecahedronGeometry(0.44, 0);                                  // amber
  const g2 = new THREE.CylinderGeometry(0.3, 0.44, 0.62, 6);                           // emerald cut
  const g3 = new THREE.SphereGeometry(0.44, 8, 5);                                     // sapphire faceted ball
  const g4 = new THREE.IcosahedronGeometry(0.44, 0);                                   // amethyst
  const g5 = new THREE.CylinderGeometry(0.06, 0.5, 0.7, 8); g5.rotateX(Math.PI);       // ice brilliant cut
  for (const g of [g0, g1, g2, g3, g4, g5]) GEO.push(g.toNonIndexed());
  GEO.push(new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed());                      // [6] prism orb
}

const glassMats = [], metalMats = [];
let bandGeo, bandMat, rodGeo, coreGeo, orbGeo;

export function initGemAssets() {
  buildGeometries();
  for (let i = 0; i < GEM_COLORS.length; i++) {
    const col = GEM_COLORS[i];
    glassMats.push(new THREE.MeshPhysicalMaterial({
      color: col.hex, metalness: 0, roughness: 0.05,
      transparent: true, opacity: 0.82,
      clearcoat: 1, clearcoatRoughness: 0.08,
      envMapIntensity: 1.15, flatShading: true,
      emissive: col.hex, emissiveIntensity: 0.22,
    }));
    metalMats.push(new THREE.MeshStandardMaterial({
      color: col.metal, metalness: 1, roughness: 0.24,
      envMapIntensity: 1.8, flatShading: true,
    }));
  }
  bandGeo = new THREE.TorusGeometry(0.42, 0.05, 6, 18);
  bandMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, metalness: 1, roughness: 0.4 });
  rodGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6);
  coreGeo = new THREE.IcosahedronGeometry(0.2, 0);
  orbGeo = new THREE.SphereGeometry(0.07, 6, 4);
}

export class GemMesh {
  constructor(gem) {
    this.gem = gem;
    this.group = new THREE.Group();
    this.phase = Math.random() * Math.PI * 2;
    this.extras = [];
    this.hueMat = null;
    this.build();
  }

  build() {
    const g = this.gem;
    if (g.special === 'prism') {
      this.hueMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.1, roughness: 0.1,
        emissive: 0xff00ff, emissiveIntensity: 0.85,
        transparent: true, opacity: 0.92, flatShading: true, envMapIntensity: 1.4,
      });
      this.core = new THREE.Mesh(GEO[6], this.hueMat);
      this.group.add(this.core);
      return;
    }
    const geo = GEO[g.color % GEO.length];
    const mat = g.finish === 'metal' ? metalMats[g.color] : glassMats[g.color];
    this.core = new THREE.Mesh(geo, mat);
    this.group.add(this.core);
    if (g.finish === 'metal') {
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.rotation.x = Math.PI / 2;
      this.group.add(band);
    }
    this.dress();
  }

  // special-gem decorations
  dress() {
    for (const e of this.extras) this.group.remove(e);
    this.extras = [];
    const g = this.gem;
    const glowMat = new THREE.MeshBasicMaterial({
      color: GEM_COLORS[Math.max(g.color, 0)].glow, transparent: true, opacity: 0.95,
    });
    if (g.special === 'lineH' || g.special === 'lineV') {
      const rod = new THREE.Mesh(rodGeo, glowMat);
      if (g.special === 'lineH') rod.rotation.z = Math.PI / 2;
      this.extras.push(rod);
    } else if (g.special === 'burst') {
      const core = new THREE.Mesh(coreGeo, glowMat);
      this.extras.push(core);
    } else if (g.special === 'nova') {
      const core = new THREE.Mesh(coreGeo, glowMat);
      core.scale.setScalar(1.5);
      this.extras.push(core);
      for (let i = 0; i < 3; i++) {
        const orb = new THREE.Mesh(orbGeo, glowMat);
        orb.userData.orbit = i;
        this.extras.push(orb);
      }
      this.group.scale.setScalar(1.12);
    }
    for (const e of this.extras) this.group.add(e);
  }

  // called when a plain gem becomes special mid-combo (prism+line etc.)
  refresh() {
    this.group.clear();
    this.extras = [];
    this.build();
  }

  update(t, dt) {
    const g = this.gem;
    const s = this.phase;
    if (g.special === 'prism') {
      this.core.rotation.y += dt * 2.2;
      this.core.rotation.x += dt * 0.8;
      const hue = (t * 0.25 + s) % 1;
      this.hueMat.emissive.setHSL(hue, 1, 0.55);
      this.hueMat.color.setHSL(hue, 0.7, 0.75);
      const p = 1 + Math.sin(t * 5 + s) * 0.06;
      this.core.scale.setScalar(p);
      return;
    }
    this.core.rotation.y = t * 0.6 + s;
    this.core.position.y = Math.sin(t * 1.7 + s) * 0.035;
    if (g.special === 'lineH' || g.special === 'lineV') {
      const rod = this.extras[0];
      if (rod) {
        rod.rotation.y = t * 4;
        rod.material.opacity = 0.7 + Math.sin(t * 8 + s) * 0.3;
      }
    } else if (g.special === 'burst') {
      const c = this.extras[0];
      if (c) c.scale.setScalar(1 + Math.sin(t * 6 + s) * 0.45);
    } else if (g.special === 'nova') {
      for (const e of this.extras) {
        if (e.userData.orbit !== undefined) {
          const a = t * 3 + e.userData.orbit * (Math.PI * 2 / 3);
          e.position.set(Math.cos(a) * 0.62, Math.sin(a * 1.3) * 0.2, Math.sin(a) * 0.62);
        } else {
          e.scale.setScalar(1.5 + Math.sin(t * 6 + s) * 0.5);
        }
      }
    }
  }
}

export function gemGlowColor(gem) {
  return gem.color >= 0 ? GEM_COLORS[gem.color].glow : 0xffffff;
}
export function gemHexColor(gem) {
  return gem.color >= 0 ? GEM_COLORS[gem.color].hex : 0xffffff;
}
