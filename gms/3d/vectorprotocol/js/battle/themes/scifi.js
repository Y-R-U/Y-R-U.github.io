import * as THREE from 'three';
import { BOARD, LANE_PROFILES } from '../layout.js';
import { box, merge, onLayers, BACKDROP_LAYER } from '../geo.js';
import { floorTextures, crowdTex, windowTex, bannerTex, idleRun } from '../../fx/textures.js';
import { createPlanarReflection, addPlanarReflection, REFLECT_LAYER, MIRROR_ONLY_LAYER } from '../../fx/reflection.js';
import { buildBackdrop } from './scifi_backdrop.js';

// Sci-fi arena theme (D21): the "Vector Protocol" league arena at night. A theme builds everything except the shared
// board furniture (nodes, plates, centre line, camera) and returns
// { group, update(dt,t), reflection, lights, look (post overrides), fog, board: buildBoard options, dispose }.
export const id = 'scifi';

const floorArgs = (tier, seed) => ({ W: BOARD.W, L: BOARD.L, px: tier.name === 'low' ? 40 : 60, seed, hexR: BOARD.gridR,
  hexOrigin: [0, LANE_PROFILES.tall.laneZ[0] + LANE_PROFILES.tall.backShift], zFar: BOARD.zFar, traces: 0.45 });
// battle-10: build the cached procedural textures in idle time ahead of the battle (same args as createTheme / buildBackdrop)
export function prewarm(engine, { seed = 7 } = {}) {
  return idleRun([() => floorTextures(floorArgs(engine.quality, seed)), () => crowdTex(), () => windowTex(), () => bannerTex(), () => bannerTex(128, 256, '#4fd0ff')]);
}

export function createTheme(engine, { seed = 7 } = {}) {
  const tier = engine.quality;
  const group = new THREE.Group();
  const updaters = [];
  const hw = BOARD.W / 2;
  const bz0 = BOARD.zNear, bz1 = BOARD.zFar;
  const hdr = (hex, k) => new THREE.Color(hex).multiplyScalar(k);

  const reflection = createPlanarReflection(engine.renderer, { scale: tier.reflect || 0, planeY: 0 });

  // --- board floor: hex lattice + circuits, glossy, mirrored ---
  const ft = floorTextures(floorArgs(tier, seed));
  const floorMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(1.28, 1.12, 0.9), // battle-5: warm the blue-grey albedo under the cool lights -> ref_02's slate (measured avg 63,78,119)
    map: ft.map, emissiveMap: ft.emissive, emissive: new THREE.Color(1.0, 1.2, 1.75),
    roughnessMap: ft.rough, roughness: 0.5, metalness: 0.2, envMapIntensity: 0.9,
    normalMap: ft.normal, normalScale: new THREE.Vector2(0.8, 0.8),
  });
  if (reflection.enabled) addPlanarReflection(floorMat, reflection, { strength: 0.7, base: 0.3, blur: 2.4, distort: 0.02, streak: 0.018 }); // battle-3: lower camera = more Fresnel, so less strength
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.W, BOARD.L), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, BOARD.zMid);
  floor.receiveShadow = true;
  group.add(floor);

  // --- frame: raised metal bezel round the floor rect with lit inner/outer strips ---
  const fw = 0.75, fh = 0.22;
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x18213a, metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1 });
  const frameG = [
    box(fw, fh, BOARD.L + fw * 2, -hw - fw / 2, fh / 2, BOARD.zMid), box(fw, fh, BOARD.L + fw * 2, hw + fw / 2, fh / 2, BOARD.zMid),
    box(BOARD.W, fh, fw, 0, fh / 2, bz1 - fw / 2), box(BOARD.W, fh, fw, 0, fh / 2, bz0 + fw / 2),
    // near-edge plaque + corner blocks
    box(3.2, fh + 0.12, fw + 0.2, 0, (fh + 0.12) / 2, bz0 + fw / 2),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(1.4, fh + 0.18, 1.4, sx * (hw + 0.2), (fh + 0.18) / 2, sz > 0 ? bz0 + 0.2 : bz1 - 0.2))),
  ];
  const frame = onLayers(new THREE.Mesh(merge(frameG), frameMat), REFLECT_LAYER);
  frame.receiveShadow = true;
  group.add(frame);
  const stripC = hdr(0x48b8ff, 3.0);
  const strips = [];
  const segX = (z, x0, x1, gap) => { for (let x = x0; x < x1; x += gap) strips.push(box(gap * 0.82, 0.04, 0.06, x + gap / 2, fh + 0.01, z)); };
  // battle-3: side rails are continuous lit bars (ref_02), inner + outer edge of the bezel
  for (const sx of [-1, 1]) strips.push(box(0.1, 0.05, BOARD.L + fw, sx * (hw + 0.1), fh + 0.01, BOARD.zMid), box(0.07, 0.05, BOARD.L + fw * 2, sx * (hw + fw - 0.08), fh + 0.01, BOARD.zMid));
  segX(bz1 - 0.08, -hw, hw, 2.6); segX(bz0 + 0.08, -hw, -1.6, (hw - 1.6) / 2); segX(bz0 + 0.08, 1.6, hw, (hw - 1.6) / 2);
  strips.push(box(2.2, 0.04, 0.08, 0, fh + 0.13, bz0 + fw / 2));
  // inner edge glow line where the floor meets the frame
  strips.push(box(0.08, 0.02, BOARD.L, -hw + 0.04, 0.01, BOARD.zMid), box(0.08, 0.02, BOARD.L, hw - 0.04, 0.01, BOARD.zMid),
    box(BOARD.W, 0.02, 0.06, 0, 0.01, bz1 + 0.03), box(BOARD.W, 0.02, 0.08, 0, 0.01, bz0 - 0.04));
  const frameStrips = onLayers(new THREE.Mesh(merge(strips), new THREE.MeshBasicMaterial({ color: stripC })), REFLECT_LAYER);
  group.add(frameStrips);

  // --- front rim: a lit console barrier along the near edge (fills the band above the portrait strip, like the ref) ---
  {
    const z0 = bz0 + fw, fr = [], fl = [], ft2 = [];
    // battle-5: the console read as a black band; ref_02's is lit blue-steel with glowing inset panels
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x33476e, metalness: 0.55, roughness: 0.4, envMapIntensity: 1.2, emissive: new THREE.Color(0.025, 0.06, 0.14) });
    const tileMat = new THREE.MeshStandardMaterial({ color: 0x0c1730, metalness: 0.6, roughness: 0.45, envMapIntensity: 0.6, emissive: new THREE.Color(0.08, 0.24, 0.7) });
    fr.push(box(BOARD.W + fw * 2 + 2, 0.55, 1.6, 0, 0.275, z0 + 0.8));       // console body
    fr.push(box(BOARD.W + fw * 2 + 2, 0.12, 0.5, 0, 0.6, z0 + 0.35));        // top lip
    for (let x = -hw; x < hw - 0.5; x += 1.8) ft2.push(box(1.5, 0.08, 0.9, x + 0.9, 0.58, z0 + 1.1)); // panel tiles (glowing insets)
    fr.push(box(3.6, 0.7, 0.8, 0, 0.35, z0 + 0.6));                           // centre plaque block
    fl.push(box(BOARD.W + fw * 2 + 2, 0.07, 0.08, 0, 0.67, z0 + 0.1));       // lit top edge
    for (let x = -hw; x < hw - 0.5; x += 1.8) fl.push(box(1.0, 0.03, 0.05, x + 0.9, 0.63, z0 + 0.7));
    fl.push(box(2.6, 0.05, 0.06, 0, 0.71, z0 + 0.25), box(0.06, 0.05, 0.5, -1.3, 0.71, z0 + 0.5), box(0.06, 0.05, 0.5, 1.3, 0.71, z0 + 0.5));
    // battle-3: the low camera sees the console's front face, so it gets the ref's lit strips + a lower step in front of it
    const cw = BOARD.W + fw * 2 + 2;
    fr.push(box(cw + 1, 0.28, 1.6, 0, 0.14, z0 + 2.4));                      // lower step
    for (let x = -cw / 2 + 0.3; x < cw / 2 - 1; x += 2.6) {
      if (Math.abs(x + 1.1) < 1.9) continue;                                   // leave the centre plaque clear
      fl.push(box(2.0, 0.07, 0.04, x + 1.1, 0.4, z0 + 1.62));                  // front-face light bars
      fl.push(box(1.6, 0.04, 0.04, x + 1.1, 0.2, z0 + 3.22));                  // step front strip
    }
    fl.push(box(cw + 1, 0.03, 0.05, 0, 0.29, z0 + 1.64), box(2.4, 0.06, 0.04, 0, 0.5, z0 + 1.02));
    // front-face inset panels between the light bars
    for (let x = -cw / 2 + 0.3; x < cw / 2 - 1; x += 2.6) if (Math.abs(x + 1.1) >= 1.9) ft2.push(box(2.2, 0.16, 0.03, x + 1.1, 0.18, z0 + 1.62));
    group.add(onLayers(new THREE.Mesh(merge(fr), consoleMat), REFLECT_LAYER));
    group.add(new THREE.Mesh(merge(ft2), tileMat));
    group.add(onLayers(new THREE.Mesh(merge(fl), new THREE.MeshBasicMaterial({ color: hdr(0x48c0ff, 3.2) })), REFLECT_LAYER));
  }

  // --- outer deck (between frame and walls) ---
  const iW = BOARD.W + 7.5, fz0 = bz0 + 6, fz1 = bz1 - 2.2;
  const deckMat = new THREE.MeshStandardMaterial({ color: 0x0c1222, metalness: 0.7, roughness: 0.42, envMapIntensity: 0.8 });
  const deck = new THREE.Mesh(merge([
    box((iW - BOARD.W) / 2 - fw, 0.1, fz0 - fz1, -(hw + fw + ((iW - BOARD.W) / 2 - fw) / 2), 0.05, (fz0 + fz1) / 2),
    box((iW - BOARD.W) / 2 - fw, 0.1, fz0 - fz1, (hw + fw + ((iW - BOARD.W) / 2 - fw) / 2), 0.05, (fz0 + fz1) / 2),
    box(BOARD.W + fw * 2, 0.1, fz0 - bz0 - fw, 0, 0.05, (fz0 + bz0 + fw) / 2),
    box(BOARD.W + fw * 2, 0.1, bz1 - fw - fz1, 0, 0.05, (bz1 - fw + fz1) / 2),
  ]), deckMat);
  deck.receiveShadow = true;
  group.add(deck);
  const deckLights = [];
  for (const s of [-1, 1]) for (let z = fz0 - 1.5; z > fz1 + 0.5; z -= 3.0) deckLights.push(box(0.55, 0.03, 0.12, s * (hw + 2.2), 0.11, z));
  group.add(new THREE.Mesh(merge(deckLights), new THREE.MeshBasicMaterial({ color: hdr(0x3a8cff, 2.2) })));

  // --- side + back barriers: kerb, lit top, holo field, light posts ---
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x141b2e, metalness: 0.8, roughness: 0.35 });
  const wx = iW / 2;
  const walls = onLayers(new THREE.Mesh(merge([
    box(0.6, 1.1, fz0 - fz1, -wx - 0.3, 0.55, (fz0 + fz1) / 2), box(0.6, 1.1, fz0 - fz1, wx + 0.3, 0.55, (fz0 + fz1) / 2),
    box(iW + 1.2, 1.1, 0.6, 0, 0.55, fz1 - 0.3),
    // consoles on the side decks
    ...[-1, 1].flatMap((s) => [bz0 - 2.5, BOARD.zMid, bz1 + 2.5].map((z) => box(0.9, 0.9, 1.6, s * (wx - 0.8), 0.45, z))),
  ]), wallMat), REFLECT_LAYER);
  walls.receiveShadow = true;
  group.add(walls);
  const wallStrips = onLayers(new THREE.Mesh(merge([
    box(0.08, 0.06, fz0 - fz1, -wx + 0.02, 1.1, (fz0 + fz1) / 2), box(0.08, 0.06, fz0 - fz1, wx - 0.02, 1.1, (fz0 + fz1) / 2),
    box(iW, 0.06, 0.08, 0, 1.1, fz1 + 0.02),
    box(0.05, 0.04, fz0 - fz1, -wx + 0.02, 0.45, (fz0 + fz1) / 2), box(0.05, 0.04, fz0 - fz1, wx - 0.02, 0.45, (fz0 + fz1) / 2),
    box(iW, 0.04, 0.05, 0, 0.45, fz1 + 0.02),
    ...[-1, 1].flatMap((s) => [bz0 - 2.5, BOARD.zMid, bz1 + 2.5].map((z) => box(0.04, 0.5, 1.2, s * (wx - 1.26), 0.5, z))),
  ]), new THREE.MeshBasicMaterial({ color: hdr(0x55b8ff, 3.0) })), REFLECT_LAYER);
  group.add(wallStrips);

  const holoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.25, 0.7, 1.4) } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vW;
      void main(){
        float h = vUv.y;
        float base = smoothstep(1.0, 0.0, h) * 0.2 + smoothstep(0.05, 0.0, abs(h - 0.97)) * 0.55;
        vec2 g = vec2(vW.z + vW.x, vW.y) * vec2(1.6, 2.0);
        vec2 f = abs(fract(g) - 0.5);
        float grid = smoothstep(0.46, 0.5, max(f.x, f.y)) * 0.16 * (1.0 - h * 0.5);
        float scan = smoothstep(0.03, 0.0, abs(fract(h * 1.2 - uTime * 0.22) - 0.5)) * 0.22;
        gl_FragColor = vec4(uColor * (base + grid + scan), 1.0);
      }`,
  });
  const holoH = 2.2;
  const hp = (len, ry, x, z) => { const g = new THREE.PlaneGeometry(len, holoH); g.rotateY(ry); g.translate(x, 1.1 + holoH / 2, z); return g; };
  const holo = new THREE.Mesh(merge([hp(fz0 - fz1, Math.PI / 2, -wx, (fz0 + fz1) / 2), hp(fz0 - fz1, -Math.PI / 2, wx, (fz0 + fz1) / 2), hp(iW, 0, 0, fz1)]), holoMat);
  holo.renderOrder = 3;
  onLayers(holo, REFLECT_LAYER);
  group.add(holo);
  updaters.push((dt, t) => { holoMat.uniforms.uTime.value = t; });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const postZ = []; for (let z = fz0 - 1; z > fz1; z -= 3.6) postZ.push(z);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff }), postZ.length * 2 + 8);
  let pi = 0;
  const pc = [hdr(0x4cb6ff, 3.2), hdr(0xb05cff, 3.0)];
  for (const z of postZ) for (const s of [-1, 1]) {
    m4.compose(pv.set(s * (wx + 0.05), 1.7, z), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(pi, m4);
    posts.setColorAt(pi++, pc[(Math.abs(Math.round(z / 3.6)) % 3 === 0) ? 1 : 0]);
  }
  for (let k = 0; k < 8; k++) {
    const x = -wx + 0.5 + k * (iW - 1) / 7;
    m4.compose(pv.set(x, 1.7, fz1 + 0.05), q.identity(), sc.set(1, 1, 1)); posts.setMatrixAt(pi, m4);
    posts.setColorAt(pi++, pc[k % 2]);
  }
  posts.count = pi;
  onLayers(posts, REFLECT_LAYER);
  group.add(posts);

  // --- mirror-only light rig: the steep board camera's floor reflections look UP, so a lighting truss above the
  // arena (never seen directly) is what fills the glossy floor with light streaks like the refs ---
  if (reflection.enabled) {
    const rigG = [], rigC = [];
    for (const [x, w] of [[-hw * 1.1, 0.5], [-hw * 0.5, 0.2], [hw * 0.5, 0.2], [hw * 1.1, 0.5]]) rigG.push(box(w, 0.2, BOARD.L + 6, x, 15, BOARD.zMid));
    for (const z of [bz0 - 2, BOARD.zMid - 1, bz1 + 1]) rigG.push(box(BOARD.W + 4, 0.18, 0.22, 0, 15.2, z));
    for (const [x, z] of [[-hw * 0.85, -3], [hw * 0.85, -8], [-hw * 0.8, -11], [hw * 0.8, 1]]) rigC.push(box(1.2, 0.1, 0.6, x, 14.6, z));
    const rig1 = new THREE.Mesh(merge(rigG), new THREE.MeshBasicMaterial({ color: hdr(0x6cc8ff, 0.7) }));
    const rig2 = new THREE.Mesh(merge(rigC), new THREE.MeshBasicMaterial({ color: hdr(0xb07cff, 0.6) }));
    for (const m of [rig1, rig2]) { m.layers.set(MIRROR_ONLY_LAYER); group.add(m); }
  }

  // --- OVERTIME: barrier lights pulse red, ramping with k (0..1) ---
  const otMats = [frameStrips.material, wallStrips.material, posts.material].map((m) => ({ m, c0: m.color.clone() }));
  const holoC0 = holoMat.uniforms.uColor.value.clone();
  const otRed = new THREE.Color(3.2, 0.25, 0.3), otTmp = new THREE.Color();
  let otK = 0, otShown = -1;
  updaters.push((dt, t) => {
    if (otK <= 0 && otShown === 0) return;
    const p = otK > 0 ? otK * (0.55 + 0.45 * Math.max(0, Math.sin(t * 6.0))) : 0;
    for (const o of otMats) o.m.color.copy(o.c0).lerp(otTmp.copy(otRed).multiplyScalar(o.c0.r > 2 || o.c0.b > 2 ? 1 : 0.4), p);
    holoMat.uniforms.uColor.value.copy(holoC0).lerp(otTmp.setRGB(1.6, 0.12, 0.18), p * 0.9);
    otShown = p;
  });

  // --- backdrop ---
  const backdrop = buildBackdrop(engine, { iW, fz0, fz1, seed });
  group.add(backdrop.group);
  updaters.push(backdrop.update);

  // --- lighting ---
  // Units keep their true colours (gold reads gold, red reads red) under a warm-white key + warm bounce;
  // the blue mood comes from the arena's emissives, coloured rims and a cool, low hemisphere.
  const hemi = new THREE.HemisphereLight(0x9fb0de, 0x14121c, 0.55);
  const key = new THREE.DirectionalLight(0xfff1e0, 3.1);
  key.position.set(-7, 19, 12); key.target.position.set(0, 0, BOARD.zMid);
  if (tier.shadowMap) {
    key.castShadow = true;
    key.shadow.mapSize.set(tier.shadowMap, tier.shadowMap);
    const c = key.shadow.camera; c.left = -12; c.right = 12; c.top = 17; c.bottom = -17; c.near = 2; c.far = 70;
    key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03;
    key.shadow.camera.layers.enable(MIRROR_ONLY_LAYER); // unit shadow proxies live on the mirror-only layer
  }
  const rimL = new THREE.DirectionalLight(0x3fb8ff, 2.0); rimL.position.set(-12, 7, -16);
  const rimR = new THREE.DirectionalLight(0xff6a3a, 1.4); rimR.position.set(12, 7, -16);
  const fill = new THREE.DirectionalLight(0xffd8b0, 0.7); fill.position.set(3, 3, 22); // warm bounce from the front, low
  group.add(hemi, key, key.target, rimL, rimR, fill);
  // lights on every layer: a pass that sees a different light set forces program switches on every material
  for (const l of [hemi, key, rimL, rimR, fill]) l.layers.enableAll();

  return {
    id, group, reflection, lights: { hemi, key, rimL, rimR, fill },
    fog: new THREE.Fog(0x0b1638, 60, 320),
    background: new THREE.Color(0x050914),
    // battle-4: the milky wash over the mid floor was the two widest bloom mips summing every lit strip, plate and grid line;
    // tight per-mip weights keep the glow on the emitters and the floor crisp (ref_02)
    look: { strength: 0.55, radius: 0.1, threshold: 1.6, factors: [1, 0.55, 0.22, 0.06, 0.0], vignette: 0.34, sat: 1.14, contrast: 1.08 },
    board: { lineColor: new THREE.Color(0.35, 0.8, 1.7) },
    // near-level backdrop camera (two-perspective cheat): eye height, distance behind the near edge, sky angle at the top
    // edge, and the world point whose screen height the backdrop horizon is pinned to (top of the back barrier)
    // the camera fit keeps this point (console top-lip front, relative to the near floor edge) just above the bottom HUD strip
    nearRim: { dz: 1.35, y: 0.66 },
    backdrop: { height: 3.0, back: 10, topAngle: 21, seam: new THREE.Vector3(0, 3.3, fz1) },
    update(dt, t) { for (const u of updaters) u(dt, t); },
    setOvertime(k) { otK = Math.max(0, Math.min(1, k)); },
    crowd: { hype: (k) => backdrop.hype?.(k), wave: () => backdrop.wave?.() },
    dispose() {
      group.traverse((o) => { o.geometry?.dispose(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { for (const k in x) if (x[k]?.isTexture) x[k].dispose(); x.dispose(); }); });
      reflection.rt.dispose();
    },
  };
}
