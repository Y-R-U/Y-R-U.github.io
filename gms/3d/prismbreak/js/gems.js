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
  for (const g of [g0, g1, g2, g3, g4, g5]) { g.scale(1.14, 1.14, 1.14); GEO.push(g.toNonIndexed()); }
  GEO.push(new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed());                      // [6] prism orb
  // glass shell: smooth round orb, NOT flat-shaded — faceted shells scramble the
  // refraction so badly they read as solid; a smooth bubble stays readable
  shellGeo = new THREE.SphereGeometry(0.5, 28, 18);
}

const shellMats = [], innerMats = [], metalMats = [];
let shellGeo, bandGeo, bandMat, rodGeo, coreGeo, orbGeo;

export function initGemAssets(lite = false) {
  buildGeometries();
  for (let i = 0; i < GEM_COLORS.length; i++) {
    const col = GEM_COLORS[i];
    // shell tint stays mostly clear so the inner gem is what carries the colour
    const pale = new THREE.Color(col.hex).lerp(new THREE.Color(0xffffff), 0.75);
    if (lite) {
      // cheap clear-shell fallback (no transmission pass)
      shellMats.push(new THREE.MeshPhysicalMaterial({
        color: pale, metalness: 0, roughness: 0.06,
        transparent: true, opacity: 0.25, depthWrite: false,
        clearcoat: 1, clearcoatRoughness: 0.1,
        envMapIntensity: 1.2,
      }));
    } else {
      // thin clear bubble: body colour stays white (any tint dims what you see
      // through it), colour only in a faint attenuation rim. LOW ior/thickness —
      // strong lensing distorts the inner gem into an unreadable smear — and low
      // env reflection: a full-surface white sheen reads as a rubber ball.
      // roughness 0 so the transmission buffer isn't blurred into "frost"
      shellMats.push(new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0, roughness: 0,
        transmission: 1, thickness: 0.35, ior: 1.12, dispersion: 0.05,
        attenuationColor: new THREE.Color(col.hex), attenuationDistance: 2.5,
        clearcoat: 1, clearcoatRoughness: 0,
        envMapIntensity: 0.25,
        specularIntensity: 0.7,
      }));
    }
    // the gem inside the glass — OPAQUE, or it vanishes from the transmission
    // buffer and can't be seen through the shell (same rule as the board tiles)
    innerMats.push(new THREE.MeshPhysicalMaterial({
      color: col.hex, metalness: 0.1, roughness: 0.22,
      emissive: col.hex, emissiveIntensity: 0.4,
      clearcoat: 0.5, clearcoatRoughness: 0.15,
      envMapIntensity: 1.1, flatShading: true,
    }));
    // polished chrome tinted by the gem colour — bright, mirror-shiny, clearly metal
    metalMats.push(new THREE.MeshStandardMaterial({
      color: col.metal, metalness: 1, roughness: 0.1,
      envMapIntensity: 2.2, flatShading: true,
      emissive: col.metal, emissiveIntensity: 0.25,
    }));
  }
  bandGeo = new THREE.TorusGeometry(0.5, 0.08, 8, 22);
  bandMat = new THREE.MeshStandardMaterial({ color: 0xcdd4e0, metalness: 1, roughness: 0.18, envMapIntensity: 2 });
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
    this.inner = null;
    if (g.special === 'prism') {
      this.hueMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff, metalness: 0.1, roughness: 0.1,
        emissive: 0xff00ff, emissiveIntensity: 0.45,
        transparent: true, opacity: 0.92, flatShading: true, envMapIntensity: 1,
      });
      this.core = new THREE.Mesh(GEO[6], this.hueMat);
      this.group.add(this.core);
      return;
    }
    const geo = GEO[g.color % GEO.length];
    if (g.finish === 'metal') {
      this.core = new THREE.Mesh(geo, metalMats[g.color]);
      this.group.add(this.core);
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.rotation.x = Math.PI / 2;
      this.group.add(band);
    } else {
      // glass = clear round orb with the faceted colour gem floating inside
      this.inner = new THREE.Mesh(geo, innerMats[g.color]);
      this.inner.scale.setScalar(0.6);
      this.core = new THREE.Mesh(shellGeo, shellMats[g.color]);
      this.group.add(this.inner, this.core);
    }
    this.dress();
  }

  // special-gem decorations
  dress() {
    for (const e of this.extras) this.group.remove(e);
    this.extras = [];
    const g = this.gem;
    // opaque — transparent meshes don't render into the transmission buffer,
    // so a see-through rod/core would be invisible inside the glass shell
    const glowMat = new THREE.MeshBasicMaterial({
      color: GEM_COLORS[Math.max(g.color, 0)].glow,
    });
    // burst/nova: the glowing core *becomes* the gem inside the shell
    if (this.inner) this.inner.visible = !(g.special === 'burst' || g.special === 'nova');
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
      this.hueMat.emissive.setHSL(hue, 1, 0.42);
      this.hueMat.color.setHSL(hue, 0.75, 0.6);
      const p = 1 + Math.sin(t * 5 + s) * 0.06;
      this.core.scale.setScalar(p);
      return;
    }
    // metal is heavy: slow turn, no bob. glass twinkles and floats.
    const heavy = g.finish === 'metal';
    this.core.rotation.y = t * (heavy ? 0.25 : 0.45) + s;
    this.core.position.y = heavy ? 0 : Math.sin(t * 1.7 + s) * 0.04;
    if (this.inner) {
      // counter-rotate the gem inside the shell — the parallax sells the glass
      this.inner.rotation.y = -t * 1.2 + s;
      this.inner.rotation.z = Math.sin(t * 0.9 + s) * 0.25;
      this.inner.position.y = this.core.position.y;
    }
    if (g.special === 'lineH' || g.special === 'lineV') {
      const rod = this.extras[0];
      if (rod) {
        rod.rotation.y = t * 4;
        const p = 1 + Math.sin(t * 8 + s) * 0.3; // opaque mat: pulse girth, not opacity
        rod.scale.set(p, 1, p);
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

// geometry + material of the solid gem inside a glass shell (for fall-out FX)
export function getInnerAsset(colorIdx) {
  return { geo: GEO[colorIdx % GEO.length], mat: innerMats[colorIdx] };
}
export function gemGlowColor(gem) {
  return gem.color >= 0 ? GEM_COLORS[gem.color].glow : 0xffffff;
}
export function gemHexColor(gem) {
  return gem.color >= 0 ? GEM_COLORS[gem.color].hex : 0xffffff;
}
