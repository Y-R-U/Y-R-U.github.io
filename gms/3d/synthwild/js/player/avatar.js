// Procedural futuristic player model (third person) and first-person hand.
// Self-lit ShaderMaterial so it doesn't depend on scene lights.

let THREE;
// Shared light uniforms. initAvatarLib links lane 2's sky uniform objects so the suit is lit like the world;
// uLocal = (sky, block) light 0..1 sampled at the player each frame.
const U = {};
const LIGHT_GLSL = `uniform vec3 uLightDir, uLightColor, uAmbient, uGround, uBlockColor; uniform vec2 uLocal;
  vec3 worldLight(vec3 n) {
    float skyL = uLocal.x * uLocal.x;
    vec3 amb = mix(uGround, uAmbient, n.y * 0.5 + 0.5) * (0.22 + 0.78 * skyL) * 0.75;
    vec3 direct = uLightColor * max(dot(n, uLightDir), 0.0) * smoothstep(0.55, 0.95, uLocal.x) * 0.72;
    return amb + direct + uBlockColor * pow(uLocal.y, 1.6) * 1.5;
  }`;

// Suit plating, shared by both suit shaders: world light, fine engraved panel lines in box space, a soft top-lit
// gradient and a cyan rim. Needs vO, vNo, vW and LIGHT_GLSL's worldLight/uLocal.
const PLATING_GLSL = `
  vec3 plating(vec3 col, float em, vec3 n) {
    vec3 c = col * worldLight(n);
    vec3 an = abs(vNo);
    vec2 fc = an.x > an.y && an.x > an.z ? vO.zy : an.y > an.z ? vO.xz : vO.xy;
    vec2 sg = abs(fract(fc * 9.0) - 0.5);
    float seam = smoothstep(0.46, 0.5, max(sg.x, sg.y)) * (1.0 - em);
    c *= (1.0 - seam * 0.28) * (0.9 + 0.2 * clamp(vO.y * 3.0 + 0.5, 0.0, 1.0));
    vec3 V = normalize(cameraPosition - vW);
    float rim = pow(clamp(1.0 - dot(n, V), 0.0, 1.0), 3.0);
    return c + vec3(0.35,0.9,1.0) * rim * 0.12 * (0.3 + 0.7 * uLocal.x);
  }`;

function mat(color, emissive = 0, pulse = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uColor: { value: new THREE.Color(color) }, uEmit: { value: emissive }, uPulse: { value: pulse } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vO; varying vec3 vNo;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
      vO = position; vNo = normal;
      gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uEmit; uniform float uPulse; uniform float uTime;
      ${LIGHT_GLSL}
      varying vec3 vN; varying vec3 vW; varying vec3 vO; varying vec3 vNo;
      ${PLATING_GLSL}
      void main(){
        vec3 n = normalize(vN);
        vec3 c = plating(uColor, uEmit, n);
        float p = uPulse > 0.0 ? 0.8 + 0.2 * sin(uTime * 3.0 + vW.y * 4.0) : 1.0;
        c = mix(c, uColor * 0.9 * p, uEmit);
        gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Palette material: one per avatar, shared by its few merged meshes. Each vertex carries a slot
// (0 suit, 1 dark, 2 seam, 3 visor, 4 accent); colour/emissive/pulse per slot live in uniforms, so bots can be re-tinted.
const SLOT = { suit: 0, dark: 1, seam: 2, visor: 3, accent: 4 };
function palMat(colors, emit, pulse) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uPal: { value: colors.map((c) => new THREE.Color(c)) }, uEm: { value: emit }, uPu: { value: pulse } },
    vertexShader: `attribute float aSlot; varying vec3 vN; varying vec3 vW; varying vec3 vO; varying vec3 vNo; flat varying int vSlot;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
      vO = position; vNo = normal; vSlot = int(aSlot + 0.5);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uPal[5]; uniform float uEm[5]; uniform float uPu[5]; uniform float uTime;
      ${LIGHT_GLSL}
      varying vec3 vN; varying vec3 vW; varying vec3 vO; varying vec3 vNo; flat varying int vSlot;
      ${PLATING_GLSL}
      void main(){
        vec3 col = uPal[vSlot]; float em = uEm[vSlot];
        vec3 n = normalize(vN);
        vec3 c = plating(col, em, n);
        float p = uPu[vSlot] > 0.0 ? 0.8 + 0.2 * sin(uTime * 3.0 + vW.y * 4.0) : 1.0;
        c = mix(c, col * 0.9 * p, em);
        gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// Collects boxes per pivot and emits one mesh per pivot.
function merger(material) {
  const groups = new Map();
  const tmp = new THREE.Vector3();
  return {
    box(parent, w, h, d, slot, x = 0, y = 0, z = 0) {
      if (!groups.has(parent)) groups.set(parent, { pos: [], nor: [], slot: [] });
      const G = groups.get(parent);
      const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        tmp.fromBufferAttribute(P, i);
        G.pos.push(tmp.x + x, tmp.y + y, tmp.z + z);
        G.nor.push(N.getX(i), N.getY(i), N.getZ(i));
        G.slot.push(slot);
      }
      g.dispose();
    },
    finish() {
      for (const [parent, G] of groups) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(G.nor, 3));
        geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(G.slot, 1));
        geo.computeBoundingSphere();
        parent.add(new THREE.Mesh(geo, material));
      }
    },
  };
}

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  return mesh;
}

function pivot(x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

export function initAvatarLib(three, skyUniforms = null) {
  THREE = three;
  const fb = {
    uLightDir: new THREE.Vector3(0.4, 0.8, 0.3).normalize(), uLightColor: new THREE.Color(1, 0.95, 0.85),
    uAmbient: new THREE.Color(0.55, 0.62, 0.72), uGround: new THREE.Color(0.3, 0.28, 0.25), uBlockColor: new THREE.Color(1, 0.85, 0.63),
  };
  for (const k in fb) U[k] = skyUniforms?.[k] || { value: fb[k] };
  U.uLocal = { value: new THREE.Vector2(1, 0) };
  U.uTime = { value: 0 };
}

// skyLight/blockLight 0..15 at the player (world.lightAt), eased so walking under a roof doesn't pop.
export function setAvatarLight(skyL, blockL, t, dt = 0.016) {
  const v = U.uLocal?.value;
  if (!v) return;
  const k = Math.min(1, dt * 6);
  v.x += (skyL / 15 - v.x) * k; v.y += (blockL / 15 - v.y) * k;
  U.uTime.value = t;
}

export function createAvatar() {
  // suit (pearl white), armour (graphite), seams (teal emissive), visor (magenta-gold emissive), accent
  const material = palMat([0xdfe8f0, 0x2b3240, 0x3ff7ff, 0xffb84d, 0xff4fd8], [0, 0, 0.7, 0.6, 0.7], [0, 0, 1, 0, 1]);
  const B = merger(material), S = SLOT;
  const root = new THREE.Group();
  root.name = 'player-avatar';
  const body = pivot(0, 0, 0); root.add(body);

  const hips = pivot(0, 0.86, 0); body.add(hips);
  const torso = pivot(0, 0, 0); hips.add(torso);
  B.box(torso, 0.5, 0.62, 0.28, S.suit, 0, 0.31, 0);
  B.box(torso, 0.52, 0.2, 0.3, S.dark, 0, 0.5, 0);          // shoulder yoke
  B.box(torso, 0.04, 0.5, 0.02, S.seam, 0, 0.3, 0.145);    // chest seam
  B.box(torso, 0.5, 0.03, 0.29, S.seam, 0, 0.06, 0);       // belt line
  B.box(torso, 0.3, 0.36, 0.14, S.dark, 0, 0.32, -0.2);    // power pack
  B.box(torso, 0.2, 0.04, 0.02, S.accent, 0, 0.42, -0.275);
  B.box(torso, 0.04, 0.22, 0.02, S.seam, -0.09, 0.3, -0.275);
  B.box(torso, 0.04, 0.22, 0.02, S.seam, 0.09, 0.3, -0.275);

  const neck = pivot(0, 0.62, 0); torso.add(neck);
  const head = pivot(0, 0.02, 0); neck.add(head);
  B.box(head, 0.42, 0.42, 0.42, S.suit, 0, 0.21, 0);
  B.box(head, 0.36, 0.13, 0.03, S.visor, 0, 0.25, 0.21);
  B.box(head, 0.44, 0.03, 0.44, S.seam, 0, 0.36, 0);
  B.box(head, 0.03, 0.12, 0.03, S.dark, 0.17, 0.48, -0.05);
  B.box(head, 0.05, 0.05, 0.05, S.accent, 0.17, 0.56, -0.05);

  const limb = (x, y, len, w, side) => {
    const p = pivot(x, y, 0);
    B.box(p, w, len, w, S.suit, 0, -len / 2, 0);
    B.box(p, w + 0.02, 0.12, w + 0.02, S.dark, 0, -len * 0.45, 0);
    B.box(p, w + 0.02, 0.1, w + 0.02, S.dark, 0, -len + 0.05, 0);
    B.box(p, 0.02, len * 0.7, 0.02, S.seam, side * (w / 2 + 0.005), -len * 0.5, 0);
    return p;
  };
  const armL = limb(-0.33, 0.56, 0.62, 0.16, -1), armR = limb(0.33, 0.56, 0.62, 0.16, 1);
  torso.add(armL, armR);
  const legL = limb(-0.13, 0, 0.86, 0.2, -1), legR = limb(0.13, 0, 0.86, 0.2, 1);
  hips.add(legL, legR);
  B.finish();

  let phase = 0, swing = 0;
  return {
    root, head, material,
    // re-tint (bots): { suit, seam } hex colours
    setPalette({ suit, seam } = {}) {
      if (suit != null) material.uniforms.uPal.value[SLOT.suit].set(suit);
      if (seam != null) material.uniforms.uPal.value[SLOT.seam].set(seam);
    },
    swingArm() { swing = 1; },
    update(dt, { speed = 0, crouch = false, flying = false, swimming = false, pitch = 0, onGround = true }) {
      const moving = Math.min(1, speed / 4.3);
      phase += dt * (3 + speed * 1.9) * (moving > 0.05 ? 1 : 0);
      let amp = 0.75 * moving;
      if (flying) amp *= 0.25;
      const s = Math.sin(phase);
      legL.rotation.x = s * amp; legR.rotation.x = -s * amp;
      armL.rotation.x = -s * amp * 0.8; armR.rotation.x = s * amp * 0.8;
      if (!onGround && !flying && !swimming) { legL.rotation.x = 0.4; legR.rotation.x = -0.2; }
      if (swimming) { armL.rotation.z = -0.6 - 0.5 * Math.sin(phase * 0.7); armR.rotation.z = -armL.rotation.z; }
      else { armL.rotation.z = armR.rotation.z = 0; }
      swing = Math.max(0, swing - dt * 4);
      if (swing > 0) armR.rotation.x = -Math.sin(swing * Math.PI) * 1.6 - 0.4;
      torso.rotation.x = crouch ? 0.45 : (flying ? 0.15 : 0) + moving * 0.06;
      hips.position.y = crouch ? 0.72 : 0.86 + Math.abs(Math.cos(phase)) * 0.03 * moving;
      hips.position.z = crouch ? -0.1 : 0;
      head.rotation.x = -pitch * 0.8 - torso.rotation.x;
    },
  };
}

// Held block textured from lane 2's atlas (DataArrayTexture, one layer per tile).
function atlasCubeMat(atlas) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, tAlb: { value: atlas.albedo }, tMat: { value: atlas.mat } },
    vertexShader: `attribute float aLayer; varying vec3 vN; varying vec2 vUv; varying float vLayer;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vLayer = aLayer;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `precision highp sampler2DArray; uniform sampler2DArray tAlb; uniform sampler2DArray tMat;
      ${LIGHT_GLSL}
      varying vec3 vN; varying vec2 vUv; varying float vLayer;
      void main(){
        vec3 tc = vec3(vUv, vLayer + 0.5);
        vec4 a = texture(tAlb, tc); vec4 m = texture(tMat, tc);
        if (a.a < 0.4) discard;
        vec3 n = normalize(vN);
        vec3 c = a.rgb * worldLight(n);
        c = mix(c, a.rgb * 0.9, m.r * 0.6);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

// First-person arm holding the selected item, parented to the camera.
export function createHand() {
  // Softer than the body: a grey-blue sleeve (not flat white) and dimmer seams so night bloom doesn't blow it out.
  // one merged arm mesh (palette slots: suit sleeve, dark plating, dim seam, plate, glowing cuff)
  const armMat = palMat([0xb4c3d4, 0x2b3240, 0x3ff7ff, 0x5b6b82, 0x3ff7ff], [0, 0, 0.35, 0, 0.55], [0, 0, 0, 0, 1]);
  const B = merger(armMat), S = SLOT;
  const root = new THREE.Group();
  root.name = 'player-hand';
  const arm = pivot(0.42, -0.42, -0.6);
  root.add(arm);
  B.box(arm, 0.13, 0.13, 0.5, S.suit, 0, 0, 0.12);
  B.box(arm, 0.14, 0.14, 0.09, S.dark, 0, 0, 0.3);
  B.box(arm, 0.02, 0.02, 0.4, S.seam, 0.068, 0.03, 0.1);
  B.box(arm, 0.1, 0.03, 0.26, S.visor, 0, 0.075, 0.08);   // forearm plate
  B.box(arm, 0.145, 0.03, 0.03, S.accent, 0, 0.0, -0.075); // glowing cuff
  B.box(arm, 0.12, 0.1, 0.1, S.dark, 0, 0.0, -0.15);   // glove
  B.box(arm, 0.1, 0.03, 0.04, S.visor, 0, 0.055, -0.19); // knuckle plate
  B.finish();

  const colorMat = mat(0xffffff, 0);
  const cubeGeo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
  cubeGeo.setAttribute('aLayer', new THREE.Float32BufferAttribute(new Float32Array(24), 1));
  const cube = new THREE.Mesh(cubeGeo, colorMat);
  cube.position.set(-0.06, 0.07, -0.14); cube.rotation.set(0.1, 0.6, 0);
  arm.add(cube);
  const planeGeo = new THREE.PlaneGeometry(1, 1);
  const iconMat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, toneMapped: false });
  const iconTint = () => { const v = U.uLocal.value, l = Math.max(0.25, Math.max(v.x * v.x * 0.9, Math.pow(v.y, 1.6))); iconMat.color.setScalar(Math.min(1, l)); };
  const icon = new THREE.Mesh(planeGeo, iconMat);
  arm.add(icon);
  let atlasMat = null;
  const texCache = new Map();
  cube.visible = icon.visible = false;

  arm.rotation.set(0.1, 0.2, 0);
  root.scale.setScalar(0.34);
  root.traverse(o => { o.frustumCulled = false; o.renderOrder = 10; });
  let swing = 0, bob = 0;
  return {
    root,
    swing() { swing = 1; },
    // view: { block, item, kind } from inv.held() (or a bare block id); atlas from ctx.render.atlas; iconURL(item) from lane 5.
    setHeld(view, { atlas, iconURL, blocks } = {}) {
      cube.visible = icon.visible = false;
      if (!view) return;
      const blockId = typeof view === 'number' ? view : view.block;
      const b = blockId ? blocks?.[blockId] : null;
      if (b && !b.plant) {
        cube.visible = true;
        if (atlas?.albedo && b.tile) {
          atlasMat ||= atlasCubeMat(atlas);
          cube.material = atlasMat;
          const L = cubeGeo.attributes.aLayer, t = b.tile;
          [t.side, t.side, t.top, t.bottom, t.side, t.side].forEach((layer, f) => { for (let k = 0; k < 4; k++) L.array[f * 4 + k] = layer; });
          L.needsUpdate = true;
        } else {
          cube.material = colorMat;
          const c = b.color || [1, 1, 1];
          colorMat.uniforms.uColor.value.setRGB(c[0], c[1], c[2]);
          colorMat.uniforms.uEmit.value = (b.emissive || 0) * 0.6;
        }
        return;
      }
      // Tools, food, plants, materials: the item's inventory icon as a flat cut-out.
      const item = typeof view === 'object' ? view.item : null;
      const key = item?.id ?? blockId;
      const url = iconURL?.(item || (b && { id: b.id, key: b.key, kind: 'block', block: b.id, color: b.color }));
      if (!url) return;
      let tex = texCache.get(key);
      if (!tex) {
        const img = new Image();
        tex = new THREE.Texture(img);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        img.onload = () => { tex.needsUpdate = true; };
        img.src = url;
        texCache.set(key, tex);
      }
      iconMat.map = tex; iconMat.needsUpdate = true;
      icon.visible = true;
      const tool = item?.kind === 'tool';
      const s = tool ? 0.5 : 0.26;
      icon.scale.set(s, s, s);
      icon.position.set(-0.08, tool ? 0.2 : 0.09, tool ? -0.22 : -0.17);
      icon.rotation.set(tool ? 0.35 : 0.3, tool ? 0.45 : 0.35, tool ? 0.15 : 0);
    },
    update(dt, speed, onGround) {
      if (icon.visible) iconTint();
      bob += dt * speed * 2.2 * (onGround ? 1 : 0);
      swing = Math.max(0, swing - dt * 5);
      const k = Math.sin(swing * Math.PI);
      arm.position.set(0.42 + Math.sin(bob) * 0.012, -0.42 - Math.abs(Math.cos(bob)) * 0.012 - k * 0.06, -0.6 - k * 0.05);
      arm.rotation.set(0.1 - k * 0.9, 0.2 + k * 0.3, -k * 0.3);
    },
  };
}
