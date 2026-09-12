/* Plants and hardscape. Everything here is procedural geometry; the stone and
   wood take their surface from the photo textures. */

import * as THREE from 'three';
import { clamp, lerp, rr, rnd, TAU, vnoise } from '../util.js';
import { Buf, Z3, FIN, ball } from './fishgeo.js';
import { photo, derivedNormal, slateFallback, woodFallback } from './textures.js';
import { useWaterFog, FISH_U } from './fish.js';

/* ── planting ────────────────────────────────────────────────────────────── */
function blades(o) {
  const G = new Buf();
  const { n, segs, len, wide, lean, curl, c0, c1, taper, ripple, tip } = o;
  for (let b = 0; b < n; b++) {
    const yaw = (b / n) * TAU + rr(-0.35, 0.35);
    const out = lean * (0.4 + rnd() * 0.85);
    const L = len * (0.55 + rnd() * 0.62);
    const w = wide * (0.7 + rnd() * 0.6);
    const twist = rr(-1, 1) * curl;
    const A = [], B = [];
    for (let s = 0; s <= segs; s++) {
      const u = s / segs;
      const bend = Math.pow(u, 1.7) * out;
      const y = u * L * (1 - bend * 0.22), rad = bend * L;
      const x = Math.cos(yaw) * rad, z = Math.sin(yaw) * rad;
      const hw = w * Math.pow(1 - u, taper) * (1 + Math.sin(u * 5 + b) * ripple);
      const nx = -Math.sin(yaw + twist * u), nz = Math.cos(yaw + twist * u);
      const shade = 0.72 + 0.28 * u;
      let col = [lerp(c0[0], c1[0], u) * shade, lerp(c0[1], c1[1], u) * shade, lerp(c0[2], c1[2], u) * shade, 1, 0];
      if (tip && u > 0.66) { const k = (u - 0.66) / 0.34;
        col = [lerp(col[0], tip[0], k), lerp(col[1], tip[1], k), lerp(col[2], tip[2], k), 1, 0]; }
      A.push(G.vert(x + nx * hw, y, z + nz * hw, col, u, FIN.BODY, Z3));
      B.push(G.vert(x - nx * hw, y, z - nz * hw, col, u, FIN.BODY, Z3));
    }
    for (let s = 0; s < segs; s++) G.quad(A[s], B[s], B[s + 1], A[s + 1]);
  }
  return G;
}

/** A leaf with a visible midrib — what makes a broad-leaf plant read. */
function leafFan(G, o) {
  const { n, len, wide, lean, c0, c1 } = o;
  for (let b = 0; b < n; b++) {
    const yaw = (b / n) * TAU + rr(-0.3, 0.3), out = lean * (0.5 + rnd() * 0.7);
    const L = len * (0.7 + rnd() * 0.5);
    const rows = [];
    for (let s = 0; s <= 7; s++) {
      const u = s / 7, bend = Math.pow(u, 1.6) * out;
      const y = u * L * (1 - bend * 0.2), rad = bend * L;
      const cx = Math.cos(yaw) * rad, cz = Math.sin(yaw) * rad;
      const hw = wide * Math.sin(Math.PI * clamp(u * 0.92 + 0.08, 0, 1)) * (0.55 + 0.45 * (1 - u));
      const nx = -Math.sin(yaw), nz = Math.cos(yaw);
      const row = [];
      for (let k = -2; k <= 2; k++) {
        const v = k / 2;
        const rib = 1 - Math.abs(v) * 0.35;
        const col = [lerp(c0[0], c1[0], u) * rib, lerp(c0[1], c1[1], u) * rib, lerp(c0[2], c1[2], u) * rib, 1, 0];
        row.push(G.vert(cx + nx * hw * v, y + (1 - Math.abs(v)) * hw * 0.18, cz + nz * hw * v, col, u, FIN.BODY, Z3));
      }
      rows.push(row);
    }
    for (let s = 0; s < 7; s++) for (let k = 0; k < 4; k++) G.quad(rows[s][k], rows[s][k + 1], rows[s + 1][k + 1], rows[s + 1][k]);
  }
}

export function buildPlantGeo(kind) {
  let G;
  switch (kind) {
    case 'ribbon':
      G = blades({ n: 30, segs: 12, len: 1.0, wide: 0.022, lean: 0.42, curl: 1.8,
        c0: [0.06, 0.24, 0.11], c1: [0.26, 0.58, 0.22], taper: 0.42, ripple: 0.14 }); break;
    case 'broad':
      G = new Buf(); leafFan(G, { n: 16, len: 0.60, wide: 0.085, lean: 0.66,
        c0: [0.05, 0.25, 0.10], c1: [0.30, 0.63, 0.23] }); break;
    case 'fern':
      G = blades({ n: 22, segs: 8, len: 0.5, wide: 0.034, lean: 0.78, curl: 1.0,
        c0: [0.04, 0.20, 0.09], c1: [0.19, 0.46, 0.18], taper: 0.55, ripple: 0.34 }); break;
    case 'carpet':
      G = blades({ n: 96, segs: 3, len: 0.2, wide: 0.008, lean: 0.30, curl: 0.4,
        c0: [0.09, 0.31, 0.12], c1: [0.32, 0.64, 0.25], taper: 0.35, ripple: 0 }); break;
    case 'stem': {
      G = blades({ n: 16, segs: 9, len: 0.72, wide: 0.011, lean: 0.20, curl: 0.3,
        c0: [0.10, 0.34, 0.14], c1: [0.30, 0.60, 0.22], taper: 0.2, ripple: 0 });
      /* leaf pairs up the stems, blushing copper at the tips */
      for (let b = 0; b < 16; b++) {
        const yaw = (b / 16) * TAU + 0.2, out = 0.20;
        for (let s = 1; s <= 9; s++) {
          const u = s / 10, bend = Math.pow(u, 1.7) * out;
          const y = u * 0.72 * (1 - bend * 0.2), rad = bend * 0.72;
          const cx = Math.cos(yaw) * rad, cz = Math.sin(yaw) * rad;
          const warm = clamp((u - 0.5) * 2.2, 0, 1);
          const col = [lerp(0.24, 0.86, warm), lerp(0.56, 0.36, warm), lerp(0.20, 0.28, warm), 1, 0];
          for (const side of [1, -1]) {
            const nx = -Math.sin(yaw) * side, nz = Math.cos(yaw) * side;
            const a = G.vert(cx, y, cz, col, u, FIN.BODY, Z3);
            const c = G.vert(cx + nx * 0.042, y + 0.020, cz + nz * 0.042, col, u, FIN.BODY, Z3);
            const d = G.vert(cx + nx * 0.030, y - 0.020, cz + nz * 0.030, col, u, FIN.BODY, Z3);
            G.tri(a, c, d);
          }
        }
      }
      break;
    }
    case 'grape': {
      G = blades({ n: 8, segs: 5, len: 0.5, wide: 0.018, lean: 0.55, curl: 0.7,
        c0: [0.10, 0.30, 0.14], c1: [0.30, 0.58, 0.22], taper: 0.3, ripple: 0 });
      for (let i = 0; i < 30; i++) {
        const a = rnd() * TAU, r = rr(0.05, 0.34), y = rr(0.12, 0.52);
        ball(G, Math.cos(a) * r, y, Math.sin(a) * r, rr(0.032, 0.058),
             [0.22, 0.56, 0.20, 1, 0], y / 0.6, FIN.BODY, 4, 6);
      }
      break;
    }
    default:
      G = blades({ n: 10, segs: 7, len: 0.7, wide: 0.068, lean: 0.5, curl: 0.8,
        c0: [0.07, 0.30, 0.13], c1: [0.32, 0.66, 0.24], taper: 0.65, ripple: 0.12 });
  }
  return G.build();
}

export function plantMaterial() {
  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.72, metalness: 0, side: THREE.DoubleSide,
  });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = FISH_U.uTime;
    sh.uniforms.uFlow = { value: 0.4 };
    m.userData.sh = sh;
    useWaterFog(sh);
    sh.vertexShader = `
      attribute float aSeg; attribute vec3 aPhase; uniform float uTime, uFlow;
    ` + sh.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      float h = aSeg * aSeg;
      float ph = aPhase.x;
      float sway = sin(uTime * (0.55 + aPhase.y * 0.4) + ph) * (0.09 + uFlow * 0.24);
      sway += sin(uTime * 0.31 + ph * 1.7) * 0.05;
      transformed.x += sway * h;
      transformed.z += cos(uTime * (0.42 + aPhase.z * 0.3) + ph * 1.3) * (0.06 + uFlow * 0.17) * h;
      transformed.y -= h * abs(sway) * 0.22;
    `);
    /* leaves are thin: light comes through them at grazing angles */
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', `
      #include <dithering_fragment>
      vec3 N = normalize(vNormal); vec3 V = normalize(vViewPosition);
      float f = pow(1.0 - abs(dot(N, V)), 2.0);
      gl_FragColor.rgb += vColor.rgb * f * 0.34;
    `);
  };
  return m;
}

/* ── hardscape ───────────────────────────────────────────────────────────── */
function stoneMat() {
  const map = photo('slate', { repeat: 2, fallback: slateFallback });
  const m = new THREE.MeshStandardMaterial({
    map, normalMap: derivedNormal(map, 1.5, 2), roughness: 0.92, metalness: 0.02,
    color: 0x9aa39c, flatShading: false,
  });
  m.onBeforeCompile = useWaterFog;
  return m;
}
function woodMat() {
  const map = photo('driftwood', { repeat: 2, fallback: woodFallback });
  const m = new THREE.MeshStandardMaterial({
    map, normalMap: derivedNormal(map, 1.8, 2), roughness: 0.95, metalness: 0, color: 0xb59a7a,
  });
  m.color.setHex(0xb59a7a);
  m.onBeforeCompile = useWaterFog;
  return m;
}
let _stone = null, _wood = null;
export const stoneMaterial = () => (_stone ||= stoneMat());
export const woodMaterial = () => (_wood ||= woodMat());

export function buildDecor(kind) {
  const g = new THREE.Group();
  switch (kind) {
    case 'cave': {
      const m = stoneMaterial();
      for (let i = 0; i < 9; i++) {
        const s = rr(0.22, 0.5);
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m);
        const a = (i / 9) * Math.PI + 0.15;
        b.position.set(Math.cos(a) * 0.54, 0.1 + Math.sin(a) * 0.44, rr(-0.14, 0.14));
        b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        b.scale.set(1, rr(0.6, 1.1), rr(0.7, 1.2));
        g.add(b);
      }
      break;
    }
    case 'rock': {
      const m = stoneMaterial();
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rr(0.20, 0.42), 0), m);
        b.position.set(rr(-0.3, 0.3), 0.08 + i * 0.13, rr(-0.2, 0.2));
        b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
        b.scale.set(rr(1.0, 1.7), rr(0.4, 0.8), rr(0.8, 1.4));
        g.add(b);
      }
      break;
    }
    case 'wood': {
      const m = woodMaterial();
      const branch = (x, y, z, len, rad, ax, az, depth) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.6, rad, len, 7, 1), m);
        b.position.set(x, y + len / 2, z);
        b.rotation.set(ax, rnd() * 3, az);
        g.add(b);
        if (depth > 0) for (let i = 0; i < 2; i++)
          branch(x + Math.sin(az) * len * 0.45 + rr(-0.1, 0.1), y + len * 0.72, z + rr(-0.1, 0.1),
                 len * 0.62, rad * 0.58, ax + rr(-0.5, 0.5), az + rr(-0.8, 0.8), depth - 1);
      };
      branch(0, 0, 0, 0.72, 0.10, 0, 0.22, 2);
      break;
    }
    case 'anemone': {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.30, 0.24, 12),
        new THREE.MeshStandardMaterial({ color: 0x8f4b60, roughness: 0.8 }));
      base.position.y = 0.12; g.add(base);
      const T = new Buf();
      for (let i = 0; i < 64; i++) {
        const a = rnd() * TAU, r = Math.sqrt(rnd()) * 0.27;
        const len = rr(0.18, 0.38), lean = rr(0.2, 0.75);
        const A = [], B = [];
        for (let s = 0; s <= 5; s++) {
          const u = s / 5, w = 0.028 * (1 - u * 0.35) * (1 + Math.sin(u * 6) * 0.3);
          const x = Math.cos(a) * (r + u * len * lean), z = Math.sin(a) * (r + u * len * lean);
          const y = 0.22 + u * len;
          const col = [lerp(0.92, 0.58, u), lerp(0.42, 0.30, u), lerp(0.52, 0.76, u), 1, u * 0.9];
          A.push(T.vert(x + w, y, z, col, u, FIN.TENT, Z3));
          B.push(T.vert(x - w, y, z + w * 0.6, col, u, FIN.TENT, Z3));
        }
        for (let s = 0; s < 5; s++) T.quad(A[s], B[s], B[s + 1], A[s + 1]);
      }
      g.add(new THREE.Mesh(T.build(), anemoneMaterial()));
      break;
    }
    case 'coral': {
      const m = new THREE.MeshStandardMaterial({ color: 0xdd8f5c, roughness: 0.72,
        emissive: 0x4a1c16, emissiveIntensity: 0.4, flatShading: true });
      m.onBeforeCompile = useWaterFog;
      const arm = (x, y, z, len, rad, tilt, depth) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.5, rad, len, 6), m);
        b.position.set(x, y + len / 2, z);
        b.rotation.set(tilt * rr(0.6, 1.2), rnd() * 3, tilt * rr(-1, 1));
        g.add(b);
        if (depth > 0) for (let i = 0; i < 3; i++)
          arm(x + rr(-0.13, 0.13), y + len * 0.72, z + rr(-0.13, 0.13), len * 0.6, rad * 0.6, tilt * 1.3, depth - 1);
      };
      arm(0, 0, 0, 0.44, 0.07, 0.16, 2);
      break;
    }
    case 'bubbler': {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1b2830, roughness: 0.55 }));
      bar.position.y = 0.04; g.add(bar);
      g.userData.bubbleBar = 1.1;
      break;
    }
    case 'wreck': {
      const m = woodMaterial();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.30, 1.9, 9, 1, false, 0, Math.PI), m);
      body.rotation.z = Math.PI / 2; body.rotation.x = 0.5; body.position.y = 0.32; g.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.42), m);
      cab.position.set(-0.22, 0.56, 0.05); cab.rotation.x = 0.5; g.add(cab);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 1.0, 6), m);
      mast.position.set(0.35, 0.7, 0); mast.rotation.z = -0.5; g.add(mast);
      break;
    }
  }
  return g;
}

export function anemoneMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0,
    side: THREE.DoubleSide, emissive: 0x2c0816, emissiveIntensity: 0.8 });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = FISH_U.uTime;
    useWaterFog(sh);
    sh.vertexShader = 'attribute float aSeg; attribute float aGlow; uniform float uTime; varying float vG;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vG = aGlow;
        float h = aSeg * aSeg;
        transformed.x += sin(uTime * 1.15 + transformed.z * 7.0 + transformed.y * 3.0) * 0.05 * h;
        transformed.z += cos(uTime * 0.95 + transformed.x * 7.0) * 0.05 * h;`);
    sh.fragmentShader = 'varying float vG;\n' + sh.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n gl_FragColor.rgb += vec3(0.58,0.14,0.34) * vG * 0.55;');
  };
  return m;
}
