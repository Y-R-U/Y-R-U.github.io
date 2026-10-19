import * as THREE from 'three';
import { BOARD, slotPos } from './layout.js';
import { onLayers } from './geo.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// Theme-independent board furniture: the 12 hex nodes (glowing floor ring + raised pedestal plate with a lit band),
// and the centre divider. A theme may pass `plate: { geometry, material, height, tint(color, out) }` (e.g. stone pedestals),
// `lineColor` / `ringBoost`, `ringShape: 'oct'` (octagon outlines), `ringK: { floor, top }` (per-kind intensity) and
// `pipFace: { y, z, s }` (rarity pips set as gems into the plate's front face at height y, apothem z, size s; no trim hex).
export function buildBoard(engine, { plate = null, lineColor = new THREE.Color(0.35, 0.75, 1.6), ringBoost = 1, ringShape = 'hex', ringK = {}, pipFace = null } = {}) {
  const kFloor = ringK.floor ?? 1, kTop = ringK.top ?? 1;
  const group = new THREE.Group();
  const updaters = [];

  // --- centre divider: hot core + soft glow, pulses running away from the camera ---
  const lineMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: lineColor } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
      void main(){
        float x = abs(vUv.x - 0.5) * 2.0;
        float core = smoothstep(0.1, 0.0, x);
        float glow = pow(1.0 - x, 3.0) * 0.3;
        float dash = step(0.35, fract(vUv.y * 18.0 - uTime * 0.6)) * 0.4 + 0.6;
        float pulse = pow(fract(vUv.y * 1.2 - uTime * 0.3), 12.0) * 2.5;
        float ends = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
        gl_FragColor = vec4(uColor * (core * (1.5 * dash + pulse) + glow * (0.6 + pulse * 0.5)) * ends, 1.0);
      }`,
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(0.9, BOARD.L - 0.4), lineMat);
  line.rotation.x = -Math.PI / 2; line.position.set(0, 0.012, BOARD.zMid);
  line.renderOrder = 2;
  group.add(line);
  updaters.push((dt, t) => { lineMat.uniforms.uTime.value = t; });

  // --- node rings: additive hex outline + glow, on the floor and inset on the plate top ---
  const N = 12;
  const plateH = plate?.height ?? 0.3;
  const ringMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    defines: { ...(ringShape === 'oct' ? { OCT: 1 } : {}), ...(pipFace ? { PIPFACE: 1 } : {}) },
    vertexShader: `attribute float aI; attribute float aKind; varying vec2 vP; varying vec3 vC; varying float vI; varying float vK;
      void main(){
        vP = position.xy; vC = vec3(1.0);
        #ifdef USE_INSTANCING_COLOR
          vC = instanceColor;
        #endif
        vI = aI; vK = aKind;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `uniform float uTime; varying vec2 vP; varying vec3 vC; varying float vI; varying float vK;
      float sdHex(vec2 p, float r){ const vec3 k = vec3(-0.866025404, 0.5, 0.577350269); p = abs(p);
        p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r); return length(p) * sign(p.y); }
      #ifdef OCT
      float sdOct(vec2 p, float r){ const vec3 k = vec3(-0.9238795325, 0.3826834323, 0.4142135623); p = abs(p);
        p -= 2.0 * min(dot(vec2(k.x, k.y), p), 0.0) * vec2(k.x, k.y); p -= 2.0 * min(dot(vec2(-k.x, k.y), p), 0.0) * vec2(-k.x, k.y);
        p -= vec2(clamp(p.x, -k.z * r, k.z * r), r); return length(p) * sign(p.y); }
      #define sdHex sdOct
      #endif
      void main(){
        vec2 p = vP.xy; // vertices on +-x: flat-topped as seen from the camera
        float d = sdHex(p, 0.8);
        float edge = abs(d);
        float line = smoothstep(0.05, 0.0, edge);
        float glow = exp(-max(d, 0.0) * 7.0) * 0.5 * step(0.0, d) + (d < 0.0 ? exp(d * 5.0) * 0.35 : 0.0);
        float a = atan(p.y, p.x);
        float sweep = pow(0.5 + 0.5 * sin(a - uTime * 2.0), 10.0) * 0.9;
        float v;
        if (vK > 3.5) { // rarity trim (rare+) + pips on the near edge (local -y = toward the camera): 1 steel .. 4 gold
          float ri = vK - 4.0;
          float d4 = sdHex(p, 0.97);
          #ifdef PIPFACE
          float trim = 0.0;
          #else
          float trim = ri > 0.5 ? smoothstep(0.045, 0.015, abs(d4)) * 1.0 + (d4 > 0.0 ? exp(-d4 * 12.0) * 0.25 : 0.0) : 0.0;
          #endif
          float n = ri + 1.0;
          float xs = p.x / 0.34 + n * 0.5;
          float fx = abs(fract(xs) - 0.5);
          float dash = step(0.0, xs) * step(xs, n) * smoothstep(0.36, 0.29, fx + abs(p.y + 1.05) * 2.0);
          v = trim * (1.0 - dash) + dash * 1.05;
        } else if (vK > 2.5) { // CC ring: pulsing bright double hex outside the node
          float d3 = sdHex(p, 0.9);
          v = (smoothstep(0.035, 0.0, abs(d3)) * 1.6 + smoothstep(0.03, 0.0, abs(d3 - 0.06)) * 0.8) * (0.65 + 0.35 * sin(uTime * 9.0));
        } else if (vK > 1.5) { // mark ring (elite / boss): steady double outline with ticks
          float d3 = sdHex(p, 0.93);
          float ticks = step(0.8, fract(atan(p.y, p.x) * 3.0 / 3.14159 + 0.5));
          v = smoothstep(0.03, 0.0, abs(d3)) * 1.2 + smoothstep(0.04, 0.0, abs(d3 - 0.05)) * ticks * 1.5;
        } else if (vK > 0.5) {
          float d2 = sdHex(p, 0.82);
          v = smoothstep(0.03, 0.0, abs(d2)) * (1.4 + sweep) + (d2 < 0.0 ? exp(d2 * 9.0) * 0.4 : 0.0);
        } else v = line * 1.6 + glow;
        gl_FragColor = vec4(vC * v * vI, 1.0);
      }`,
  });
  const ringGeo = new THREE.PlaneGeometry(2.4, 2.4);
  const RN = N * 5; // per slot: floor ring, plate-top ring, mark, CC, rarity
  const aI = new THREE.InstancedBufferAttribute(new Float32Array(RN), 1);
  const aKind = new THREE.InstancedBufferAttribute(new Float32Array(RN), 1);
  ringGeo.setAttribute('aI', aI); ringGeo.setAttribute('aKind', aKind);
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RN);
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RN * 3), 3);
  rings.frustumCulled = false; rings.renderOrder = 1;
  group.add(rings);

  // --- plates: raised bevelled hex pedestal; aRim = 1 on the lit band ---
  const plateGeo = plate?.geometry || defaultPlateGeometry(plateH);
  const plateMat = plate?.material || new THREE.MeshStandardMaterial({ color: 0x1b2438, metalness: 0.8, roughness: 0.5, envMapIntensity: 1.3 }) /* battle-3: rougher, muzzle lights made hot discs */;
  if (!plate?.material) {
    plateMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aRim; varying float vRim;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRim = aRim;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vRim;')
        .replace('#include <color_fragment>', '')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance += vColor.rgb * vRim * 2.4;\n#endif');
    };
  }
  const plates = new THREE.InstancedMesh(plateGeo, plateMat, N);
  plates.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
  plates.receiveShadow = true; plates.castShadow = true;
  onLayers(plates, REFLECT_LAYER);
  group.add(plates);

  const slots = [];
  ['player', 'enemy'].forEach((side, si) => {
    for (let s = 0; s < 6; s++) {
      const p = slotPos(side, s);
      slots.push({ side, slot: s, i: si * 6 + s, x: p.x, z: p.z, x0: p.x, z0: p.z, k: 1, color: new THREE.Color(0.22, 0.36, 0.65), on: false, pulse: 0, base: 0.28,
        mark: null, cc: null, rar: -1, rarC: new THREE.Color() });
    }
  });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), col = new THREE.Color();
  const flatQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  function writeSlot(sl) {
    const R = BOARD.hexR * sl.k;
    m4.compose(pv.set(sl.x, 0.02, sl.z), flatQ, sc.set(R, R, 1));
    rings.setMatrixAt(sl.i, m4);
    m4.compose(pv.set(sl.x, plateH + 0.006, sl.z), flatQ, sc.set(R * 0.78, R * 0.78, 1));
    rings.setMatrixAt(N + sl.i, m4);
    const k = (sl.base + sl.pulse) * ringBoost;
    col.copy(sl.color);
    rings.setColorAt(sl.i, col); rings.setColorAt(N + sl.i, col);
    aI.setX(sl.i, k * kFloor); aKind.setX(sl.i, 0);
    aI.setX(N + sl.i, sl.on ? k * kTop : 0); aKind.setX(N + sl.i, 1);
    m4.compose(pv.set(sl.x, 0.025, sl.z), flatQ, sc.set(R * 1.12, R * 1.12, 1));
    rings.setMatrixAt(2 * N + sl.i, m4); rings.setMatrixAt(3 * N + sl.i, m4);
    rings.setColorAt(2 * N + sl.i, sl.mark || col.setRGB(0, 0, 0)); aI.setX(2 * N + sl.i, sl.mark && sl.on ? 1 : 0); aKind.setX(2 * N + sl.i, 2);
    rings.setColorAt(3 * N + sl.i, sl.cc || col.setRGB(0, 0, 0)); aI.setX(3 * N + sl.i, sl.cc ? 1.2 : 0); aKind.setX(3 * N + sl.i, 3);
    if (pipFace) { // gems on the front face: local pip row sits at y = -1.05 * scale
      const ps = R / 1.3, gs = pipFace.s * ps;
      m4.compose(pv.set(sl.x, pipFace.y + 1.05 * gs, sl.z + pipFace.z * ps + 0.015), q.identity(), sc.set(gs, gs, 1));
    } else m4.compose(pv.set(sl.x, 0.022, sl.z), flatQ, sc.set(R, R, 1));
    rings.setMatrixAt(4 * N + sl.i, m4);
    rings.setColorAt(4 * N + sl.i, sl.rarC); aKind.setX(4 * N + sl.i, 4 + Math.max(0, sl.rar));
    aI.setX(4 * N + sl.i, sl.on && sl.rar >= 0 ? Math.min(1, 0.35 + 0.65 * sl.base) * (1 + sl.pulse * 0.4) : 0);
    col.copy(sl.color);
    // battle-6: y unscaled so the plate top is exactly plateH (units stand on it)
    m4.compose(pv.set(sl.x, 0, sl.z), q.identity(), sl.on ? sc.set(R / 1.3, 1, R / 1.3) : sc.setScalar(0.0001));
    plates.setMatrixAt(sl.i, m4);
    if (plate?.tint) plate.tint(sl.color, col); else col.copy(sl.color);
    plates.setColorAt(sl.i, col.multiplyScalar(sl.on ? 1 + sl.pulse : 0));
  }
  function flush() {
    rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true;
    aI.needsUpdate = true; aKind.needsUpdate = true;
    plates.instanceMatrix.needsUpdate = true; plates.instanceColor.needsUpdate = true;
  }
  slots.forEach(writeSlot); flush();
  let dirty = false;
  updaters.push((dt, t) => {
    ringMat.uniforms.uTime.value = t;
    for (const sl of slots) if (sl.pulse > 0) { sl.pulse = Math.max(0, sl.pulse - dt * 2.5); writeSlot(sl); dirty = true; }
    if (dirty) { flush(); dirty = false; }
  });

  const get = (side, slot) => slots[(side === 'enemy' ? 6 : 0) + slot];
  return {
    group, slots, plateH,
    setSlot(side, slot, color, on = true) {
      const sl = get(side, slot); if (!sl) return;
      if (color != null) sl.color.set(color); else sl.color.setRGB(0.22, 0.36, 0.65);
      sl.on = on && color != null; sl.base = sl.on ? 1 : 0.28;
      if (!sl.on) { sl.x = sl.x0; sl.z = sl.z0; sl.k = 1; sl.rar = -1; }
      writeSlot(sl); flush();
    },
    // rarity cue: ri 0 common (1 steel pip) .. 3 legendary (4 pips + trim); color = RARITY_COLORS[ri]; ri < 0 clears
    setRarity(side, slot, ri, color) { const sl = get(side, slot); if (!sl) return; sl.rar = ri ?? -1; if (color != null) sl.rarC.set(color).multiplyScalar(1.25); writeSlot(sl); flush(); },
    // big bosses stand on their own footprint: move + grow the node (reset when the slot is cleared)
    setPlace(side, slot, x, z, k = 1) { const sl = get(side, slot); if (!sl) return; sl.x = x; sl.z = z; sl.k = k; writeSlot(sl); flush(); },
    // dim = 0..1 (dead unit: plate stays, light dies down)
    dimSlot(side, slot, k) { const sl = get(side, slot); if (!sl) return; sl.base = k; writeSlot(sl); flush(); },
    // permanent marker ring (elite red-gold, boss) / crowd-control ring (stun yellow, shock blue-white, taunt red); null clears
    setMark(side, slot, color) { const sl = get(side, slot); if (!sl) return; sl.mark = color != null ? new THREE.Color(color).multiplyScalar(1.6) : null; writeSlot(sl); flush(); },
    setCC(side, slot, color) {
      const sl = get(side, slot); if (!sl) return;
      const key = color == null ? null : new THREE.Color(color).getHex();
      if ((sl.cc ? sl.ccKey : null) === key) return;
      sl.cc = color != null ? new THREE.Color(color).multiplyScalar(1.8) : null; sl.ccKey = key; writeSlot(sl); flush();
    },
    nodePulse(side, slot, k = 1) { const sl = get(side, slot); if (sl) { sl.pulse = Math.max(sl.pulse, k); writeSlot(sl); dirty = true; } },
    update(dt, t) { for (const u of updaters) u(dt, t); },
  };
}

// Raised hex pedestal: bevelled top, lit band round the upper edge, dark skirt. Vertices on +-x (flat-topped).
function defaultPlateGeometry(h) {
  const R = 1.08;
  const prof = [[R * 0.98, 0], [R, h * 0.12], [R, h * 0.55], [R * 0.99, h * 0.62], [R * 0.99, h * 0.84], [R * 0.9, h], [0, h]];
  const rimIdx = new Set([3]); // segment 3 -> 4 is the lit band
  const pos = [], nrm = [], rim = [];
  const ang = (k) => (k / 6) * Math.PI * 2;
  for (let k = 0; k < 6; k++) {
    const a0 = ang(k), a1 = ang(k + 1);
    const c0 = [Math.cos(a0), Math.sin(a0)], c1 = [Math.cos(a1), Math.sin(a1)];
    const am = (a0 + a1) / 2;
    for (let s = 0; s < prof.length - 1; s++) {
      const [r0, y0] = prof[s], [r1, y1] = prof[s + 1];
      const p00 = [c0[0] * r0, y0, c0[1] * r0], p10 = [c1[0] * r0, y0, c1[1] * r0];
      const p01 = [c0[0] * r1, y1, c0[1] * r1], p11 = [c1[0] * r1, y1, c1[1] * r1];
      // face normal from the profile slope
      const dr = r1 - r0, dy = y1 - y0, L = Math.hypot(dr, dy) || 1;
      const nx = Math.cos(am) * (dy / L), nz = Math.sin(am) * (dy / L), ny = -dr / L;
      const isRim = rimIdx.has(s) ? 1 : 0;
      for (const p of [p00, p01, p10, p10, p01, p11]) { pos.push(...p); nrm.push(nx, ny, nz); rim.push(isRim); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1));
  return g;
}
