// A live turntable of the dummy on its own canvas, built the same way js/dev/chars/preview.js
// builds the robed rig: real geometry from js/world/, its own renderer, never the game's scene.
// Shared by the Skin tab and by js/dev/skin/bench.html, which is what tools/skin/render.mjs drives.

let THREE = null, D = null;

async function loadDeps() {
  if (THREE) return;
  THREE = await import('three');
  D = await import('../../world/dummy.js');
}

export const VIEWS = { front: 0, left: Math.PI / 2, back: Math.PI, right: -Math.PI / 2 };

export class SkinPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.spin = 0;
    this.auto = true;
    this.dead = false;
    this.last = performance.now();
    this.shape = 'm';
    this.meshes = {};
  }

  async start() {
    await loadDeps();
    const c = this.canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121820);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 40);

    this.scene.add(new THREE.HemisphereLight(0xbdd4ea, 0x4a4438, 1.1));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.0);
    key.position.set(2.4, 3.4, 2.8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 0.8);
    rim.position.set(-2.2, 1.4, -2.6);
    this.scene.add(rim);

    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.ground();
    this.setShape(this.shape);

    this.drag = null;
    c.addEventListener('pointerdown', e => { this.drag = e.clientX; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', e => {
      if (this.drag === null) return;
      this.spin += (e.clientX - this.drag) * 0.012;
      this.drag = e.clientX;
    });
    for (const ev of ['pointerup', 'pointercancel']) c.addEventListener(ev, () => { this.drag = null; });

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
    const m = new THREE.Mesh(new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = -0.002;
    this.scene.add(m);
    this.groundMesh = m;
  }

  // Both bodies share one material, so a skin swap is one assignment and the two shapes are never
  // out of step with each other.
  setShape(id) {
    this.shape = id;
    if (!this.meshes[id]) {
      const mesh = new THREE.Mesh(D.dummyGeometry(id), this.mat || (this.mat = D.dummyMaterial(this.tex || null)));
      this.meshes[id] = mesh;
    }
    for (const [k, m] of Object.entries(this.meshes)) {
      if (k === id) this.rig.add(m); else this.rig.remove(m);
    }
  }

  async setSkin(url) {
    if (!url) {
      this.tex = null;
    } else {
      const tex = await D.loadSkin(url, { label: url.split('/').pop() });
      D.disposeSkin(this.tex);
      this.tex = tex;
    }
    if (this.mat) {
      this.mat.map = this.tex;
      this.mat.color.setHex(this.tex ? 0xffffff : 0x9aa2ad);
      this.mat.needsUpdate = true;
    }
    return this.tex;
  }

  view(name) { this.auto = false; this.spin = VIEWS[name] ?? 0; }

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
    this.rig.rotation.y = this.spin;
    const tall = D.RIG_TOP * 1.06;
    const d = (tall / 2) / Math.tan(this.camera.fov * Math.PI / 360) * 1.12;
    this.camera.position.set(0, tall * 0.52, d);
    this.camera.lookAt(0, tall * 0.48, 0);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    for (const m of Object.values(this.meshes)) m.geometry.dispose();
    D?.disposeSkin(this.tex);
    this.mat?.dispose();
    this.groundMesh?.material.map?.dispose();
    this.groundMesh?.material.dispose();
    this.groundMesh?.geometry.dispose();
    try { this.renderer?.forceContextLoss(); } catch { /* already lost */ }
    this.renderer?.dispose();
  }
}
