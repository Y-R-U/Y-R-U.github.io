// A live turntable of one character on its own canvas. It builds the SAME geometry js/world/
// people.js builds — same Build/robe/hood/tube calls, same per-zone material — so what you see
// here is the rig, not an impression of it. It never touches the game's camera or scene.
//
// three and people.js are imported dynamically: js/dev/selftest.html has no importmap, and the
// tab has to survive that.

let THREE = null, P = null, F = null;

export async function loadDeps() {
  if (THREE) return true;
  const three = await import('three');
  const people = await import('../../world/people.js');
  const figure = await import('../../world/figure.js');
  THREE = three;
  P = people;
  F = figure;
  return true;
}

// people.js's own figureGeometry(), which is not exported. Kept in step with it by hand; if the
// staff or the variant scale changes there, it changes here.
function buildGeometry(zoneId, variant) {
  const B = new P.Build();
  const z = zonesOf(zoneId);
  const seed = variant ? 2.15 : 0.35;
  P.robe(B, seed);
  P.hood(B, seed, P.cavityTone(zoneId), P.eyeTones(zoneId));
  if (!variant) {
    P.tube(B, [[-0.120, 1.020, 0.030], [-0.282, 0.938, 0.079]], [0.070, 0.078], 5,
      t => 0.74 - 0.20 * t, 0);
    if (z.staff === 'pitchfork') {
      const hy = 1.74, hx = -0.246;
      P.tube(B, [[-0.318, 0.03, 0.115], [hx, hy, 0.045]], [0.030, 0.024], 4, 0.30, 0);
      P.tube(B, [[hx - 0.095, hy, 0.045], [hx + 0.095, hy, 0.045]], [0.018, 0.018], 3, 0.26, 0);
      for (const d of [-0.088, 0, 0.088]) {
        P.tube(B, [[hx + d, hy, 0.045], [hx + d, hy + 0.21, 0.045]], [0.015, 0.004], 3, 0.26, 0);
      }
    } else {
      P.tube(B, [[-0.318, 0.03, 0.115], [-0.242, 1.86, 0.045]], [0.030, 0.023], 4, 0.30, 0);
      const t = z.staffTip;
      if (t.shape === 'bulb') {
        P.tube(B, [[-0.242, 1.86, 0.045], [-0.240, 1.86 + t.len * 0.42, 0.043]], [0.020, t.wide], 5, t.shade, 0);
        P.tube(B, [[-0.240, 1.86 + t.len * 0.42, 0.043], [-0.238, 1.86 + t.len, 0.042]], [t.wide, 0.014], 5, t.shade, 0);
      } else {
        P.tube(B, [[-0.242, 1.86, 0.045], [-0.238, 1.86 + t.len, 0.042]], [t.wide, 0.004], 4, t.shade, 0);
      }
    }
  }
  const g = B.geometry();
  if (variant) g.applyMatrix4(new THREE.Matrix4().makeScale(1.055, 0.935, 1.055));
  return g;
}

let ZONES = null;
function zonesOf(id) { return ZONES[id] || ZONES.neutral; }

// The apex of the hood in rig units, so the readout can say how tall this character is.
export const RIG_TOP = 1.688;
export const variantScaleY = variant => (variant ? 0.935 : 1);
export const metresOf = (height, variant) => RIG_TOP * height * variantScaleY(variant);

export class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.spin = 0;
    this.auto = true;
    this.raf = null;
    this.dead = false;
    this.last = performance.now();
    this.spec = { robe: 'neutral', height: 1, variant: 0 };
  }

  async start() {
    await loadDeps();
    ZONES = (await import('../../world/zones.js')).ZONES;
    const c = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121820);
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.05, 40);

    this.scene.add(new THREE.HemisphereLight(0xbdd4ea, 0x4a4438, 1.15));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(2.4, 3.4, 2.8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.85);
    rim.position.set(-2.2, 1.4, -2.6);
    this.scene.add(rim);

    this.uniforms = {
      uTime: { value: 0 },
      uWind: { value: new THREE.Vector4(0.82, 0.57, 0.34, 0.55) },
      uCloth: { value: 1 },
      uSelf: { value: new THREE.Vector4(0, 0.15, 1.3, 0) },
      uRim: { value: new THREE.Vector2(0.5, 2.4) },
      uRimCol: { value: new THREE.Color(0xcfd8dd) },
      uWrap: { value: new THREE.Vector2(0.4, 0.45) },
      uShade: { value: new THREE.Color(0x2f4a68).multiplyScalar(0.22) },
      uEye: { value: 0 },
    };

    this.geo = {};
    this.mat = {};
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.ground();
    this.ruler();

    this.drag = null;
    c.addEventListener('pointerdown', e => { this.drag = e.clientX; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (this.drag === null) return;
      this.spin += (e.clientX - this.drag) * 0.012;
      this.drag = e.clientX;
    });
    for (const ev of ['pointerup', 'pointercancel']) c.addEventListener(ev, () => { this.drag = null; });

    this.apply(this.spec);
    this.loop();
    return this;
  }

  ground() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const rad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rad.addColorStop(0, '#39424f');
    rad.addColorStop(0.55, '#222a35');
    rad.addColorStop(1, '#121820');
    g.fillStyle = rad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.002;
    this.scene.add(m);
    this.groundMesh = m;
  }

  // A metre stick beside the figure: height is the one appearance field with a number on it, and
  // 1.02 versus 1.09 means nothing without something to read it against.
  ruler() {
    const g = new THREE.Group();
    const line = (y, w, col) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0.78, y, 0), new THREE.Vector3(0.78 + w, y, 0)]);
      return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: col, toneMapped: false }));
    };
    const post = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0.78, 0, 0), new THREE.Vector3(0.78, 2, 0)]);
    g.add(new THREE.Line(post, new THREE.LineBasicMaterial({ color: 0x33404f, toneMapped: false })));
    for (let m = 0; m <= 20; m++) {
      const y = m / 10;
      g.add(line(y, m % 5 === 0 ? 0.14 : 0.06, m % 10 === 0 ? 0x6cc0ff : 0x33404f));
    }
    this.rulerGroup = g;
    this.scene.add(g);
  }

  meshFor(zoneId, variant) {
    const k = `${zoneId}:${variant}`;
    if (!this.geo[k]) {
      this.geo[k] = buildGeometry(zoneId, variant);
      this.mat[zoneId] = this.mat[zoneId] || P.robeMaterial(zoneId, this.uniforms);
    }
    return new THREE.Mesh(this.geo[k], this.mat[zoneId]);
  }

  // Everything the rig actually reads. Called on every keystroke of the inspector, so it must be
  // cheap: geometry is cached per zone+variant and only the transform changes for a height edit.
  apply(spec) {
    this.spec = { ...this.spec, ...spec };
    const { robe, variant } = this.spec;
    const k = `${robe}:${variant}`;
    if (this.mesh && this.meshKey !== k) { this.rig.remove(this.mesh); this.mesh = null; }
    if (!this.mesh) {
      this.mesh = this.meshFor(robe, variant);
      this.meshKey = k;
      this.rig.add(this.mesh);
    }
    this.mesh.scale.setScalar(this.spec.height);
    this.uniforms.uEye.value = this.spec.eyes ?? 0;
    this.uniforms.uCloth.value = this.spec.cloth ?? 1;
    if (this.rulerGroup) this.rulerGroup.visible = this.spec.ruler !== false;
  }

  resize() {
    const c = this.canvas;
    const w = Math.max(1, c.clientWidth), h = Math.max(1, c.clientHeight);
    if (this.w === w && this.hgt === h) return;
    this.w = w; this.hgt = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  loop() {
    if (this.dead) return;
    this.raf = requestAnimationFrame(() => this.loop());
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.resize();
    if (this.auto && this.drag === null) this.spin += dt * 0.5;
    this.uniforms.uTime.value = (this.uniforms.uTime.value + dt) % 600;
    this.rig.rotation.y = this.spin;
    // Frame the whole figure INCLUDING the staff, which stands ~45 cm above the hood, and the
    // metre stick beside it. Derived from the fov so a 1.20 figure is not cropped.
    const tall = Math.max(1.9, metresOf(this.spec.height, this.spec.variant) + 0.52);
    const d = (tall / 2) / Math.tan(this.camera.fov * Math.PI / 360) * 1.16;
    this.camera.position.set(Math.sin(0.35) * d, tall * 0.55, Math.cos(0.35) * d);
    this.camera.lookAt(0, tall * 0.45, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const g of Object.values(this.geo)) g.dispose();
    for (const m of Object.values(this.mat)) m.dispose();
    this.groundMesh?.material.map?.dispose();
    this.groundMesh?.material.dispose();
    this.groundMesh?.geometry.dispose();
    this.renderer?.dispose();
  }
}
