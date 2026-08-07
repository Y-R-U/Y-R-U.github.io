// The interior kit: the shell of a habitable box, the furniture that gives it scale, and the
// material set that makes a room inside the live star system read as a room.
//
// Everything here is built in ROOM space — origin at the floor centre, +Y up, the window in the
// −Z wall — and every bucket merges to one mesh placed at identity, so `position` in the vertex
// shader is room space. That is what lets the light through the window be solved analytically
// instead of shadow-mapped: the aperture is a rectangle at a known z, and a fragment is lit if
// the ray from it toward the source passes through that rectangle.

import * as THREE from 'three';
import { getMaterial, adopt } from '../materials.js';
import { track, untrack } from '../../engine/budget.js';
import { paint, mergeAll, cyl } from './geom.js';

const M4 = new THREE.Matrix4();
const EU = new THREE.Euler();
const V3 = new THREE.Vector3();
const Q = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

export const BUCKETS = ['wall', 'deck', 'metal', 'trim', 'soft', 'glow'];
const SURFACE = { wall: 'panel', deck: 'hullDark', metal: 'hull', trim: 'trim' };

// Room plate is a tenth the size of hull plate; at the kit's 4.4 m tile a bulkhead two metres
// across carries half a panel and reads as a smooth sheet.
const IUV = 0.85;

const TINT = {
  wall: [0.52, 0.53, 0.58],
  deck: [0.62, 0.62, 0.66],
  metal: [0.30, 0.31, 0.35],
  trim: [0.66, 0.56, 0.42],
};

const LAMPS = 5;

const U = {
  uSun: { value: new THREE.Vector3(0.35, 0.36, -0.86) },
  uEye: { value: new THREE.Vector3(0, 1.6, 4) },
  uWin: { value: new THREE.Vector4(0, 1.42, 1.0, 0.58) },
  uWinZ: { value: -2.2 },
  uInMin: { value: new THREE.Vector3(-1.5, 0, -2.2) },
  uInMax: { value: new THREE.Vector3(1.5, 2.35, 2.2) },
  uOutMin: { value: new THREE.Vector3(-1.7, -0.2, -2.4) },
  uOutMax: { value: new THREE.Vector3(1.7, 2.55, 2.4) },
  uShellDim: { value: 0.20 },
  uKeyCol: { value: new THREE.Color(0.62, 0.80, 1.0) },
  uSkyCol: { value: new THREE.Color(0.16, 0.26, 0.40) },
  uKeyGain: { value: 7.4 },
  uSkyGain: { value: 84 },
  uSpecGain: { value: 0.9 },
  uShaftSoft: { value: 0.035 },
  uInEnv: { value: 0.06 },
  uAo: { value: 0.70 },
  uAoR: { value: 0.80 },
  uGrime: { value: 0.34 },
  uBounce: { value: 0.55 },
  uLampPos: { value: Array.from({ length: LAMPS }, () => new THREE.Vector4(0, 0, 0, -1)) },
  uLampCol: { value: Array.from({ length: LAMPS }, () => new THREE.Color(0, 0, 0)) },
};

export const roomUniforms = () => U;

// [x, y, z, radius, colour, gain] in room space.
export function setRoomLamps(list = []) {
  for (let i = 0; i < LAMPS; i++) {
    const l = list[i];
    if (!l) { U.uLampPos.value[i].set(0, 0, 0, -1); continue; }
    const [x, y, z, r, col, gain = 1] = l;
    U.uLampPos.value[i].set(x, y, z, r);
    U.uLampCol.value[i].set(col).convertSRGBToLinear().multiplyScalar(gain);
  }
}

export function setRoomBounds(spec) {
  const { w, h, d } = spec.room;
  const e = 0.012;
  U.uInMin.value.set(-w / 2 - e, -e, -d / 2 - e);
  U.uInMax.value.set(w / 2 + e, h + e, d / 2 + e);
  const t = spec.room.wall + 0.06;
  // the owner's cabin carries a slab of its own hull outside the glass; it wants the same
  // exposure treatment as the shell or it comes back as a white shelf under the sill
  const fz = spec.dress.hull ? 5.4 : t;
  const fx = spec.dress.hull ? w * 1.5 : t;
  U.uOutMin.value.set(-w / 2 - fx, -t - (spec.dress.hull ? 2.4 : 0), -d / 2 - fz);
  U.uOutMax.value.set(w / 2 + fx, h + t, d / 2 + t);
  U.uWinZ.value = -d / 2;
  const win = spec.win;
  U.uWin.value.set(win.x || 0, win.sill + win.h / 2, win.w / 2, win.h / 2);
  const az = (spec.light.az || 0) * Math.PI / 180, el = (spec.light.el || 0) * Math.PI / 180;
  U.uSun.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  U.uKeyCol.value.set(spec.light.key).convertSRGBToLinear();
  U.uSkyCol.value.set(spec.light.sky).convertSRGBToLinear();
  U.uKeyGain.value = spec.light.gain;
  U.uSkyGain.value = spec.light.fill;
}

const NOISE = `
float ih31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.41, 0.719, 0.213)); p *= 19.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float ivn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(ih31(i), ih31(i + vec3(1,0,0)), f.x), mix(ih31(i + vec3(0,1,0)), ih31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(ih31(i + vec3(0,0,1)), ih31(i + vec3(1,0,1)), f.x), mix(ih31(i + vec3(0,1,1)), ih31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

function patch(m) {
  m.onBeforeCompile = sh => {
    for (const k of Object.keys(U)) sh.uniforms[k] = U[k];
    sh.vertexShader = `varying vec3 vRP; varying vec3 vRN;\n` + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vRP = transformed;
       vRN = objectNormal;`);
    sh.fragmentShader = `varying vec3 vRP; varying vec3 vRN;
      uniform vec3 uSun, uEye, uKeyCol, uSkyCol, uInMin, uInMax, uOutMin, uOutMax;
      uniform vec4 uWin;
      uniform float uWinZ, uKeyGain, uSkyGain, uSpecGain, uShaftSoft, uInEnv, uAo, uAoR, uGrime, uBounce, uShellDim;
      uniform vec4 uLampPos[${LAMPS}];
      uniform vec3 uLampCol[${LAMPS}];
      ${NOISE}\n` + sh.fragmentShader;

    // Three's own directional lights are the star and its fill — they belong to the vacuum outside.
    // Inside the shell they are switched off entirely and replaced by one aperture source, so the
    // room can be dim and cool while the same frame's station is hot and orange.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        vec3 P = vRP;
        vec3 N = normalize(vRN);
        vec3 s0 = step(uInMin, P) * step(P, uInMax);
        float ins = s0.x * s0.y * s0.z;

        // The shell's own outside faces sit centimetres from the lens under a key aimed at a
        // station half a kilometre away, and at that exposure a window jamb reads as white stone.
        vec3 s1 = step(uOutMin, P) * step(P, uOutMax);
        float dimf = mix(1.0, uShellDim, s1.x * s1.y * s1.z * (1.0 - ins));
        reflectedLight.directDiffuse *= (1.0 - ins) * dimf;
        reflectedLight.directSpecular *= (1.0 - ins) * dimf;
        float envMul = mix(1.0, uInEnv, ins);
        reflectedLight.indirectDiffuse *= envMul;
        reflectedLight.indirectSpecular *= envMul;

        float shaft = 1.0;
        if (uSun.z < -1e-4) {
          float t = (uWinZ - P.z) / uSun.z;
          if (t > 0.0) {
            vec2 hp = abs(P.xy + uSun.xy * t - uWin.xy);
            vec2 mk = smoothstep(uWin.zw + uShaftSoft, uWin.zw - uShaftSoft, hp);
            shaft = mk.x * mk.y;
          }
        }

        vec3 alb = material.diffuseColor;
        vec3 lit = uKeyCol * (uKeyGain * shaft * max(0.0, dot(N, uSun)));

        // the aperture as an area source, so the wall beside the window is not as black as the
        // wall behind you. A rectangle's form factor, near enough at this size.
        vec3 dv = vec3(uWin.xy, uWinZ) - P;
        float dd = max(0.06, length(dv));
        float ar = 4.0 * uWin.z * uWin.w;
        lit += uSkyCol * (uSkyGain * max(0.0, dot(N, dv / dd)) * ar / (ar + dd * dd));
        // what the shaft throws back off the deck. A room lit only by what can see the aperture
        // has walls at pure black behind you, and pure black is not a value.
        lit += uKeyCol * (uBounce * (0.42 + 0.58 * N.y));

        for (int i = 0; i < ${LAMPS}; i++) {
          float r = uLampPos[i].w;
          if (r <= 0.0) continue;
          vec3 lv = uLampPos[i].xyz - P;
          float ld = max(0.03, length(lv));
          // windowed inverse square: without the cutoff a practical at any useful brightness is
          // still worth a fifth of its value across the room, and the whole box goes one colour
          float wx = ld / (r * 3.2);
          float wn = clamp(1.0 - wx * wx * wx * wx, 0.0, 1.0);
          lit += uLampCol[i] * (max(0.0, dot(N, lv / ld)) * wn * wn / (1.0 + (ld * ld) / (r * r)));
        }

        vec3 V = normalize(uEye - P);
        vec3 H = normalize(V + uSun);
        float sp = pow(max(0.0, dot(N, H)), 26.0) * shaft * uSpecGain
          * (1.0 - roughnessFactor) * (1.0 - roughnessFactor);

        vec3 dm = min(P - uInMin, uInMax - P);
        vec3 fo = vec3(1.0) - smoothstep(vec3(0.0), vec3(uAoR), dm);
        float occ = 1.0 - uAo * clamp(dot(fo, vec3(1.0) - abs(N)), 0.0, 1.0) * ins;

        reflectedLight.indirectDiffuse += alb * lit * (ins * occ);
        reflectedLight.indirectSpecular += uKeyCol * (sp * ins * occ);
      }`);

    // A 3 m bulkhead is one tile of plate map, so without this every wall in the room is the same
    // flat grey and the corners are the only thing separating them.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       {
         float b1 = ih31(floor(vRP / 0.42));
         float b2 = ivn(vRP * 1.7) * 0.6 + ivn(vRP * 6.3 + 2.0) * 0.4;
         diffuseColor.rgb *= 1.0 + uGrime * ((b1 - 0.5) * 0.16 + (b2 - 0.5) * 0.34);
         diffuseColor.rgb *= 1.0 - uGrime * 0.30 * smoothstep(0.45, 0.9, ivn(vRP * 0.55 + 9.0));
       }`);
  };
  m.customProgramCacheKey = () => 'roominterior1';
  return m;
}

const MATS = new Map();
const GLOWS = [];
let glowPower = 1.0;

export function roomMaterial(paletteId, bucket) {
  const key = `${paletteId}:${bucket}`;
  const hit = MATS.get(key);
  if (hit) return hit;
  let m;
  if (bucket === 'glow') {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: true });
    m.color.setScalar(glowPower);
    GLOWS.push(m);
  } else if (bucket === 'soft') {
    m = patch(new THREE.MeshStandardMaterial({
      color: '#3b404b', vertexColors: true, metalness: 0.0, roughness: 0.94,
    }));
    m.userData = { envMul: 0.3 };
    adopt(m);
  } else {
    const src = getMaterial(paletteId, SURFACE[bucket]);
    m = src.clone();
    m.userData = { ...src.userData, envMul: 0.5 };
    m.vertexColors = true;
    m.color.multiply(new THREE.Color(...TINT[bucket]));
    if (m.normalMap) m.normalScale.set(0.75, 0.75);
    m.metalness = Math.min(m.metalness, bucket === 'metal' ? 0.72 : 0.20);
    m.roughness = Math.min(1, m.roughness + (bucket === 'metal' ? 0.10 : 0.34));
    patch(m);
    adopt(m);
  }
  m.name = `room:${key}`;
  MATS.set(key, m);
  return m;
}

export function setRoomGlow(v) { glowPower = v; for (const m of GLOWS) m.color.setScalar(v); }

// ── geometry ─────────────────────────────────────────────────────────────────

export const buckets = () => Object.fromEntries(BUCKETS.map(k => [k, []]));

export function ibox(w, h, d, x, y, z, o = {}) {
  const { rx = 0, ry = 0, rz = 0, ao = 1, uv = IUV, col = null } = o;
  const g = new THREE.BoxGeometry(w, h, d);
  const a = g.attributes.uv;
  const s = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      a.setXY(k, a.getX(k) * s[f][0] / uv, a.getY(k) * s[f][1] / uv);
    }
  }
  paint(g, col || ao);
  g.applyMatrix4(M4.compose(V3.set(x, y, z), Q.setFromEuler(EU.set(rx, ry, rz)), ONE));
  return g;
}

export function itube(r0, r1, h, seg, x, y, z, rx = 0, rz = 0, ao = 1) {
  return cyl(r0, r1, h, seg, x, y, z, rx, rz, ao);
}

export function meshesFrom(g, paletteId, grp) {
  for (const k of BUCKETS) {
    const m = mergeAll(g[k]);
    if (!m) continue;
    const mesh = new THREE.Mesh(m, roomMaterial(paletteId, k));
    mesh.name = `room:${k}`;
    grp.add(mesh);
  }
  return grp;
}

// ── the shell ────────────────────────────────────────────────────────────────

export function shell(g, spec, R) {
  const { w, h, d, wall: t } = spec.room;
  const win = spec.win;
  const wx = win.x || 0, wy = win.sill + win.h / 2, hw = win.w / 2, hh = win.h / 2;
  const zf = -d / 2;

  g.deck.push(ibox(w + t * 2, t, d + t * 2, 0, -t / 2, 0, { ao: 0.9 }));
  g.wall.push(ibox(w + t * 2, t, d + t * 2, 0, h + t / 2, 0, { ao: 0.72 }));
  g.wall.push(ibox(w + t * 2, h, t, 0, h / 2, d / 2 + t / 2, { ao: 0.86 }));
  for (const s of [-1, 1]) g.wall.push(ibox(t, h, d, s * (w / 2 + t / 2), h / 2, 0, { ao: 0.9 }));

  // the front wall, in four pieces around the hole
  const lw = (wx - hw) - (-w / 2 - t);
  const rw = (w / 2 + t) - (wx + hw);
  if (lw > 0.01) g.wall.push(ibox(lw, h, t, (-w / 2 - t + (wx - hw)) / 2, h / 2, zf - t / 2, { ao: 0.8 }));
  if (rw > 0.01) g.wall.push(ibox(rw, h, t, ((wx + hw) + w / 2 + t) / 2, h / 2, zf - t / 2, { ao: 0.8 }));
  g.wall.push(ibox(hw * 2, win.sill, t, wx, win.sill / 2, zf - t / 2, { ao: 0.72 }));
  const top = h - (wy + hh);
  if (top > 0.01) g.wall.push(ibox(hw * 2, top, t, wx, wy + hh + top / 2, zf - t / 2, { ao: 0.66 }));

  // the reveal, the sill lip and the frame. A hole with no thickness is a decal.
  g.metal.push(ibox(hw * 2 + 0.10, 0.09, t + 0.06, wx, win.sill - 0.03, zf - t / 2, { ao: 0.75 }));
  g.metal.push(ibox(hw * 2 + 0.10, 0.08, t + 0.06, wx, wy + hh + 0.03, zf - t / 2, { ao: 0.55 }));
  for (const s of [-1, 1]) {
    g.metal.push(ibox(0.09, hh * 2 + 0.16, t + 0.06, wx + s * (hw + 0.04), wy, zf - t / 2, { ao: 0.7 }));
  }
  // the sill itself, the shelf everyone puts a mug on
  g.trim.push(ibox(hw * 2 - 0.04, 0.05, 0.22, wx, win.sill + 0.02, zf + 0.10, { ao: 1.0 }));

  const n = win.mullions | 0;
  for (let i = 1; i <= n; i++) {
    g.metal.push(ibox(0.055, hh * 2, 0.09, wx - hw + (hw * 2 * i) / (n + 1), wy, zf + 0.02, { ao: 0.6 }));
  }
  if (win.transom) g.metal.push(ibox(hw * 2, 0.05, 0.09, wx, wy + hh * 0.42, zf + 0.02, { ao: 0.6 }));

  // deck plate: raised strips with a gap, so the floor has a direction and the shaft lands on
  // something with a rhythm rather than on a sheet
  const runs = Math.max(3, Math.round(w / 0.62));
  for (let i = 0; i < runs; i++) {
    const x = -w / 2 + (w * (i + 0.5)) / runs;
    g.deck.push(ibox(w / runs - 0.035, 0.028, d - 0.03, x, 0.014, 0, { ao: 1.0 }));
  }
  for (let z = -d / 2 + 0.5; z < d / 2 - 0.2; z += 0.92) {
    g.metal.push(ibox(w, 0.034, 0.055, 0, 0.03, z, { ao: 0.62 }));
  }

  // ceiling ribs and the conduit run — the two things that tell you it is a hull and not a house
  const ribs = Math.max(3, Math.round(d / 0.86));
  for (let i = 0; i <= ribs; i++) {
    const z = -d / 2 + (d * i) / ribs;
    g.metal.push(ibox(w, 0.11, 0.075, 0, h - 0.055, z, { ao: 0.5 }));
  }
  const cn = spec.dress.pipes || 0;
  for (let i = 0; i < Math.round(4 * cn); i++) {
    const y = h - 0.14 - 0.075 * i;
    const x = -w / 2 + 0.16 + 0.085 * (i % 3);
    g.metal.push(itube(0.028 + 0.012 * (i % 2), 0.028 + 0.012 * (i % 2), d - 0.1, 8, x, y, 0, Math.PI / 2, 0, 0.55));
  }
  for (let i = 0; i < Math.round(3 * cn); i++) {
    g.metal.push(itube(0.05, 0.05, h * 0.9, 8, w / 2 - 0.10, h * 0.45, d / 2 - 0.22 - 0.18 * i, 0, 0, 0.5));
  }

  // a hatch on the back wall, because a room you cannot leave is a diorama
  g.metal.push(ibox(0.86, 1.92, 0.06, w * 0.22, 0.96, d / 2 - 0.02, { ao: 0.62 }));
  g.trim.push(ibox(0.90, 0.05, 0.08, w * 0.22, 1.94, d / 2 - 0.03, { ao: 1 }));
  g.metal.push(ibox(0.07, 0.07, 0.10, w * 0.22 + 0.34, 1.02, d / 2 - 0.06, { ao: 0.7 }));

  // wear: a scatter of small plates and boxes on the walls at eye height and below
  const kit = Math.round(8 * (spec.dress.greeble ?? 1));
  for (let i = 0; i < kit; i++) {
    const s = R() < 0.5 ? -1 : 1;
    const bw = 0.10 + 0.22 * R(), bh = 0.08 + 0.20 * R();
    g[R() < 0.4 ? 'metal' : 'wall'].push(ibox(0.05 + 0.05 * R(), bh, bw,
      s * (w / 2 - 0.03), 0.35 + R() * (h - 0.8), -d / 2 + 0.3 + R() * (d - 0.7), { ao: 0.65 }));
  }
}

// ── furniture ────────────────────────────────────────────────────────────────
//
// Everything here is a known size. That is the whole job: the window is only huge because the
// mug in front of it is 80 mm across.

export function deskFrame(spec) {
  const { d } = spec.room;
  const len = Math.min(1.75, d * 0.42);
  return { x0: -spec.room.w / 2, len, dep: 0.62, top: 0.745, zc: -d / 2 + 0.35 + len / 2 };
}

export function terminalFrame(spec, dk = deskFrame(spec)) {
  const sz = spec.dress.screen || [0.46, 0.30];
  return {
    pos: [dk.x0 + dk.dep * 0.46 + 0.055, dk.top + 0.205 + sz[1] / 2, dk.zc - dk.len * 0.22 + 0.03],
    rot: [-0.10, 0.42, 0],
    size: sz,
  };
}

export function desk(g, spec) {
  const { x0, len, dep, top, zc } = deskFrame(spec);
  g.metal.push(ibox(dep, 0.045, len, x0 + dep / 2, top, zc, { ao: 1.0 }));
  g.trim.push(ibox(dep + 0.02, 0.018, 0.03, x0 + dep / 2, top + 0.03, zc + len / 2, { ao: 1 }));
  g.metal.push(ibox(dep * 0.9, 0.5, 0.05, x0 + dep / 2, top - 0.28, zc + len / 2 - 0.04, { ao: 0.5 }));
  g.metal.push(ibox(dep * 0.9, 0.5, 0.05, x0 + dep / 2, top - 0.28, zc - len / 2 + 0.04, { ao: 0.5 }));
  // drawer stack under the far end
  for (let i = 0; i < 3; i++) {
    g.wall.push(ibox(dep * 0.8, 0.19, 0.44, x0 + dep * 0.42, 0.16 + 0.2 * i, zc - len / 2 + 0.28, { ao: 0.72 }));
    g.metal.push(ibox(0.02, 0.03, 0.16, x0 + dep * 0.82, 0.20 + 0.2 * i, zc - len / 2 + 0.28, { ao: 0.9 }));
  }
  // shelf over the desk with a strip light under it: the warm practical
  const sy = 1.42;
  g.wall.push(ibox(0.30, 0.035, len * 0.92, x0 + 0.15, sy, zc, { ao: 0.8 }));
  for (const s of [-1, 1]) g.metal.push(ibox(0.28, 0.16, 0.03, x0 + 0.15, sy - 0.08, zc + s * len * 0.45, { ao: 0.6 }));
  g.glow.push(ibox(0.05, 0.012, len * 0.80, x0 + 0.24, sy - 0.024, zc, { col: [1.0, 0.50, 0.18] }));
  // things on the shelf
  for (let i = 0; i < 4; i++) {
    g.wall.push(ibox(0.16, 0.19 + 0.05 * (i % 2), 0.05 + 0.02 * (i % 3),
      x0 + 0.17, sy + 0.11, zc - len * 0.3 + i * 0.09, { ao: 0.7 }));
  }
  return { top, x0, dep, len, zc };
}

export function terminalRig(g, spec, dk) {
  const x = dk.x0 + dk.dep * 0.46;
  const z = dk.zc - dk.len * 0.22;
  const y = dk.top + 0.045;
  g.metal.push(ibox(0.16, 0.028, 0.20, x, y, z, { ao: 0.8 }));
  g.metal.push(ibox(0.05, 0.20, 0.05, x, y + 0.10, z, { ao: 0.7 }));
  const t = terminalFrame(spec, dk);
  const [sw, sh] = t.size;
  const [rx, ry] = t.rot;
  const [cx, cy, cz] = t.pos;
  g.metal.push(ibox(sw + 0.045, sh + 0.045, 0.035, cx, cy, cz, { rx, ry, ao: 0.55 }));
  g.trim.push(ibox(sw * 0.5, 0.014, 0.012, cx, cy - sh / 2 - 0.03, cz + 0.02, { rx, ry, ao: 1 }));
  // keys: a slab of tiny blocks is the cheapest thing that reads as a working desk
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      g.metal.push(ibox(0.026, 0.006, 0.022, x + 0.16 + j * 0.030, y + 0.004, z - 0.06 + i * 0.030, { ao: 0.85 }));
    }
  }
  return t;
}

export function bunk(g, spec) {
  const { w, d, h } = spec.room;
  const x1 = w / 2, len = Math.min(2.05, d * 0.55), dep = 0.78, top = 0.52;
  const zc = -d / 2 + 0.5 + len / 2;
  g.metal.push(ibox(dep, 0.06, len, x1 - dep / 2, top, zc, { ao: 0.9 }));
  g.soft.push(ibox(dep - 0.06, 0.14, len - 0.06, x1 - dep / 2, top + 0.10, zc, { ao: 1.0 }));
  g.soft.push(ibox(dep - 0.10, 0.10, len * 0.42, x1 - dep / 2 - 0.02, top + 0.20, zc + len * 0.22, { ao: 0.9 }));
  g.soft.push(ibox(dep - 0.16, 0.11, 0.34, x1 - dep / 2 - 0.03, top + 0.22, zc - len * 0.36, { ao: 1.0 }));
  for (const s of [-1, 1]) {
    g.metal.push(ibox(dep, 0.34, 0.05, x1 - dep / 2, top - 0.19, zc + s * (len / 2 - 0.05), { ao: 0.5 }));
  }
  g.metal.push(ibox(0.05, 0.30, len, x1 - dep + 0.03, top + 0.17, zc, { ao: 0.6 }));
  // stowage under it, and a pair of boots
  g.wall.push(ibox(dep - 0.10, 0.34, len * 0.5, x1 - dep / 2, 0.18, zc - len * 0.2, { ao: 0.55 }));
  for (const s of [-1, 1]) {
    g.soft.push(ibox(0.11, 0.15, 0.27, x1 - dep - 0.16 + s * 0.07, 0.075, zc + len * 0.30, { ry: 0.2 * s, ao: 0.8 }));
  }
  if (spec.dress.bunklight) {
    g.metal.push(ibox(0.10, 0.06, 0.16, x1 - 0.07, top + 0.62, zc - len * 0.32, { ao: 0.6 }));
    g.glow.push(ibox(0.012, 0.035, 0.11, x1 - 0.125, top + 0.60, zc - len * 0.32, { col: [1.0, 0.56, 0.22] }));
  }
  if (h > 2.6 && spec.dress.locker) {
    g.wall.push(ibox(0.42, 1.35, 0.72, x1 - 0.22, h - 0.72, zc - len / 2 - 0.5, { ao: 0.6 }));
  }
  return { top, zc, len, x1, dep };
}

export function crates(g, spec, R, n) {
  const { w, d } = spec.room;
  for (let i = 0; i < n; i++) {
    const s = 0.34 + 0.16 * R();
    const x = (R() - 0.5) * (w - s - 0.5);
    const z = d / 2 - 0.5 - R() * (d * 0.34);
    const st = R() < 0.4 ? 2 : 1;
    for (let k = 0; k < st; k++) {
      const sk = s * (1 - 0.12 * k);
      g.wall.push(ibox(sk, sk * 0.72, sk, x + (R() - 0.5) * 0.06, sk * 0.36 + s * 0.72 * k, z,
        { ry: (R() - 0.5) * 0.5, ao: 0.85 }));
      g.metal.push(ibox(sk * 1.02, 0.035, sk * 0.14, x, sk * 0.72 + s * 0.72 * k - 0.02, z, { ao: 0.6 }));
    }
  }
}

export function stool(g, spec, dk) {
  const x = dk.x0 + dk.dep + 0.34, z = dk.zc - 0.06;
  g.metal.push(itube(0.16, 0.15, 0.05, 10, x, 0.44, z, 0, 0, 0.9));
  g.soft.push(itube(0.165, 0.16, 0.055, 12, x, 0.485, z, 0, 0, 1.0));
  g.metal.push(itube(0.035, 0.035, 0.42, 8, x, 0.22, z, 0, 0, 0.6));
  g.metal.push(itube(0.19, 0.19, 0.03, 12, x, 0.02, z, 0, 0, 0.5));
}

export function chair(g, spec, dk) {
  const x = dk.x0 + dk.dep + 0.40, z = dk.zc - 0.02;
  g.soft.push(ibox(0.46, 0.09, 0.44, x, 0.45, z, { ry: 0.5, ao: 1.0 }));
  g.soft.push(ibox(0.44, 0.52, 0.09, x - 0.19, 0.74, z - 0.06, { ry: 0.5, rz: 0.1, ao: 0.95 }));
  g.metal.push(itube(0.04, 0.04, 0.42, 8, x, 0.22, z, 0, 0, 0.6));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.metal.push(ibox(0.24, 0.03, 0.05, x + Math.cos(a) * 0.12, 0.035, z + Math.sin(a) * 0.12, { ry: -a, ao: 0.5 }));
  }
}

export function mug(g, x, y, z) {
  g.wall.push(itube(0.041, 0.037, 0.095, 12, x, y + 0.047, z, 0, 0, 1.0));
  g.wall.push(ibox(0.012, 0.05, 0.012, x + 0.048, y + 0.052, z, { ao: 0.9 }));
  g.wall.push(ibox(0.012, 0.012, 0.014, x + 0.043, y + 0.077, z, { ao: 0.9 }));
  g.wall.push(ibox(0.012, 0.012, 0.014, x + 0.043, y + 0.027, z, { ao: 0.9 }));
}

export function clutter(g, spec, dk, R) {
  const y = dk.top + 0.022;
  mug(g, dk.x0 + dk.dep - 0.16, y, dk.zc + dk.len * 0.30);
  g.wall.push(ibox(0.21, 0.012, 0.29, dk.x0 + dk.dep - 0.24, y, dk.zc + dk.len * 0.10, { ry: 0.24, ao: 1.0 }));
  g.wall.push(ibox(0.19, 0.010, 0.27, dk.x0 + dk.dep - 0.22, y + 0.012, dk.zc + dk.len * 0.08, { ry: 0.10, ao: 1.0 }));
  g.metal.push(ibox(0.12, 0.05, 0.07, dk.x0 + dk.dep - 0.12, y + 0.025, dk.zc - dk.len * 0.36, { ry: -0.3, ao: 0.8 }));
  for (let i = 0; i < 3; i++) {
    g.metal.push(ibox(0.03, 0.02, 0.11, dk.x0 + 0.30 + i * 0.04, y + 0.01, dk.zc + dk.len * 0.40,
      { ry: (R() - 0.5) * 0.6, ao: 0.9 }));
  }
}

export function rug(g, spec) {
  const { w, d } = spec.room;
  g.soft.push(ibox(w * 0.38, 0.016, d * 0.21, 0.02, 0.060, d * 0.04, { ao: 0.20 }));
}

export function plant(g, spec) {
  const { w, d } = spec.room;
  const x = w / 2 - 0.30, z = -d / 2 + 0.42;
  g.wall.push(itube(0.11, 0.09, 0.20, 10, x, 0.10, z, 0, 0, 0.9));
  g.metal.push(itube(0.115, 0.115, 0.02, 10, x, 0.20, z, 0, 0, 0.7));
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    g.soft.push(ibox(0.05, 0.30 + 0.14 * (i % 3), 0.012,
      x + Math.cos(a) * 0.06, 0.34 + 0.06 * (i % 3), z + Math.sin(a) * 0.06,
      { ry: -a, rz: 0.3 - 0.1 * (i % 3), ao: 1.0 }));
  }
}

// The bright frame of the aperture seen from inside: a lip of light where the sill catches the
// sky. Reads as the window being a hole in a thick wall rather than a picture hung on it.
export function paneSheen(spec) {
  const { d } = spec.room;
  const win = spec.win;
  const g = new THREE.PlaneGeometry(win.w, win.h, 14, 14);
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / win.w + 0.5;
    const v = p.getY(i) / win.h + 0.5;
    // every term is smooth to zero at the frame: anything with a clamp in it draws its own
    // rectangle over the view, which is worse than having no glass at all
    const e = u * (1 - u) * 4 * v * (1 - v) * 4;
    const k = 0.16 * e * e * Math.exp(-(((u * 0.8 + 0.2 - v) / 0.3) ** 2));
    c[i * 3] = k * 0.7; c[i * 3 + 1] = k * 0.85; c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const m = new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(win.x || 0, win.sill + win.h / 2, -d / 2 + 0.04);
  mesh.renderOrder = 3;
  return mesh;
}

// The shaft itself: the aperture rectangle swept along the light. Sides only, additive and
// double-sided, so the middle of the volume is where two faces overlap.
export function lightShaft(spec, len = 6) {
  const win = spec.win;
  const d = spec.room.d;
  const az = (spec.light.az || 0) * Math.PI / 180, el = (spec.light.el || 0) * Math.PI / 180;
  const dir = new THREE.Vector3(-Math.sin(az) * Math.cos(el), -Math.sin(el), Math.cos(az) * Math.cos(el));
  const cx = win.x || 0, cy = win.sill + win.h / 2, cz = -d / 2;
  const hw = win.w / 2, hh = win.h / 2;
  // Sliced along its length, because the brightness has to peak a metre or so in: a prism at full
  // value where it meets the glass just paints a solid rectangle over the view.
  const SEG = 7;
  const corner = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const ringAt = t => corner.map(([x, y]) => {
    const s = 1 + 0.16 * t;
    return new THREE.Vector3(cx + x * s + dir.x * len * t, cy + y * s + dir.y * len * t, cz + dir.z * len * t);
  });
  const val = t => {
    const a = Math.min(1, t / 0.22);
    return 0.10 * a * a * Math.pow(1 - t, 1.7);
  };
  const rings = [], vals = [];
  for (let i = 0; i <= SEG; i++) { const t = i / SEG; rings.push(ringAt(t)); vals.push(val(t)); }

  const tint = new THREE.Color(spec.light.key).convertSRGBToLinear();
  const pos = [], col = [];
  const push = (p, v) => { pos.push(p.x, p.y, p.z); col.push(v * tint.r, v * tint.g, v * tint.b); };
  for (let s = 0; s < SEG; s++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      push(rings[s][i], vals[s]); push(rings[s][j], vals[s]); push(rings[s + 1][j], vals[s + 1]);
      push(rings[s][i], vals[s]); push(rings[s + 1][j], vals[s + 1]); push(rings[s + 1][i], vals[s + 1]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // The camera stands *inside* this volume whenever it goes near the glass, and a prism drawn at
  // full value a metre from the lens is a translucent rectangle pasted over the whole view. Fading
  // it out by view distance is what real volumetrics do and it costs one varying.
  const m = new THREE.ShaderMaterial({
    uniforms: { uPower: { value: 1 }, uNear: { value: 2.2 } },
    vertexShader: `varying vec3 vC; varying float vD;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vD; uniform float uPower, uNear;
      void main(){ gl_FragColor = vec4(vC * uPower * smoothstep(0.0, uNear, vD), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    vertexColors: true, transparent: true, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.renderOrder = 4;
  mesh.name = 'room:shaft';
  return mesh;
}

// ── the terminal screen ──────────────────────────────────────────────────────

let screenTex = null;

export function screenTexture() {
  if (screenTex) return screenTex;
  const N = 256;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = '#04141c';
  x.fillRect(0, 0, N, N);
  let s = 991;
  const rr = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

  x.fillStyle = '#0b3a4a';
  x.fillRect(0, 0, N, 26);
  x.fillStyle = '#8fe6ff';
  x.font = '600 15px Helvetica, Arial, sans-serif';
  x.fillText('LEDGER · ACCOUNTS', 8, 18);

  for (let i = 0; i < 13; i++) {
    const y = 36 + i * 13;
    x.fillStyle = i % 4 === 1 ? '#ffb45e' : '#3fbcdd';
    x.globalAlpha = 0.45 + 0.5 * rr();
    x.fillRect(8, y, 8, 7);
    x.fillRect(22, y, 40 + rr() * 60, 7);
    x.globalAlpha = 0.25 + 0.3 * rr();
    x.fillRect(150, y, 20 + rr() * 40, 7);
  }
  x.globalAlpha = 1;

  x.strokeStyle = '#ffb45e';
  x.lineWidth = 2;
  x.beginPath();
  for (let i = 0; i <= 30; i++) {
    const px = 10 + i * 7.8, py = 236 - (20 + 34 * Math.abs(Math.sin(i * 0.5)) + rr() * 10);
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.stroke();
  x.strokeStyle = '#1d5566';
  x.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    x.beginPath(); x.moveTo(10, 210 - i * 18); x.lineTo(244, 210 - i * 18); x.stroke();
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  track(t, { w: N, h: N, mips: false, label: 'quarters terminal' });
  screenTex = t;
  return t;
}

export function disposeScreenTexture() {
  if (!screenTex) return;
  untrack(screenTex);
  screenTex.dispose();
  screenTex = null;
}
