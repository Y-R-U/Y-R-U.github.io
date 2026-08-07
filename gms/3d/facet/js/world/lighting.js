// Sun, fill, bounce, fog and the sky gradient. All four come out of the palette together.
//
// The sky is a CanvasTexture set as scene.background: three draws a plain (non-cube) background
// texture as a fullscreen quad, which is the only sky that works under an orthographic camera —
// a dome would sit outside the ortho frustum's side planes and never be drawn.

import * as THREE from 'three';
import { palette } from './palette.js';
import { track, untrack } from '../engine/budget.js';

const D2R = Math.PI / 180;

export class Lighting {
  constructor(paletteId = 'meadow') {
    this.object3D = new THREE.Group();
    this.p = palette(paletteId);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.018;
    this.sunTarget = new THREE.Object3D();
    this.object3D.add(this.sun, this.sunTarget);
    this.sun.target = this.sunTarget;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);

    // The rim. Low and behind, coloured the sun's complement, casting nothing. It is the cheapest
    // "expensive" move there is: a bright lip on every back-facing silhouette edge, which is what
    // separates an object from the background without a single extra draw call.
    this.bounce = new THREE.DirectionalLight(0xffffff, 0.2);
    this.bounce.userData.caster = false;
    this.bounce.target = this.sunTarget;
    this.object3D.add(this.hemi, this.bounce);

    this.skyTex = null;
  }

  registerKnobs(q, app) {
    this.app = app;
    q.register({ key: 'palette', label: 'Palette', type: 'select', options: ['meadow', 'autumn', 'dusk', 'frost'], default: 'meadow', group: 'World' },
      v => { this.p = palette(v); this.apply(app); app?.onPalette?.(this.p); });
    q.register({ key: 'sunAz', label: 'Sun azimuth', type: 'range', min: 0, max: 360, step: 1, default: -1, group: 'Light' },
      v => { this.azOverride = v < 0 ? null : v; this.apply(app); });
    q.register({ key: 'sunEl', label: 'Sun elevation', type: 'range', min: 2, max: 85, step: 0.5, default: -1, group: 'Light' },
      v => { this.elOverride = v < 0 ? null : v; this.apply(app); });
    q.register({ key: 'sunPower', label: 'Sun power', type: 'range', min: 0, max: 4, step: 0.05, default: 1, group: 'Light' },
      v => { this.sunScale = v; this.apply(app); });
    q.register({ key: 'fillPower', label: 'Fill power', type: 'range', min: 0, max: 2.5, step: 0.05, default: 1, group: 'Light' },
      v => { this.fillScale = v; this.apply(app); });
    q.register({ key: 'fogPower', label: 'Fog', type: 'range', min: 0, max: 3, step: 0.05, default: 1, group: 'Light' },
      v => { this.fogScale = v; this.apply(app); });
    q.register({ key: 'shadowMap', label: 'Shadow map', type: 'select', options: [512, 1024, 2048, 4096], group: 'Light' },
      v => this.setShadowMap(+v));
    q.register({ key: 'shadowDist', label: 'Shadow range', type: 'range', min: 20, max: 200, step: 5, group: 'Light' },
      () => this.apply(app));
    q.register({ key: 'skyGlow', label: 'Sky glow', type: 'range', min: 0, max: 1.5, step: 0.05, default: 0.7, group: 'Light' },
      v => { this.glow = v; this.buildSky(app); });
    this.apply(app);
  }

  setShadowMap(n) {
    this.sun.shadow.mapSize.set(n, n);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  apply(app) {
    const p = this.p;
    const az = (this.azOverride ?? p.sun.azimuth) * D2R;
    const el = (this.elOverride ?? p.sun.elevation) * D2R;
    const d = 140;
    this.sun.position.set(Math.cos(az) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(az) * Math.cos(el) * d);
    this.sun.color.set(p.sun.color);
    this.sun.intensity = p.sun.intensity * (this.sunScale ?? 1);

    const range = app?.quality.get('shadowDist') ?? 80;
    const c = this.sun.shadow.camera;
    c.left = -range / 2; c.right = range / 2; c.top = range / 2; c.bottom = -range / 2;
    c.near = d - range; c.far = d + range;
    c.updateProjectionMatrix();

    this.hemi.color.set(p.fill.sky);
    this.hemi.groundColor.set(p.fill.ground);
    this.hemi.intensity = p.fill.intensity * (this.fillScale ?? 1);

    this.bounce.color.set(p.bounce.color);
    this.bounce.intensity = p.bounce.intensity * (this.fillScale ?? 1);
    // 165° round from the sun rather than a flat 180°, and low — at 20°+ it stops being a rim and
    // becomes a second fill, which is exactly how it read before.
    const ra = az + Math.PI * 0.92, rd = 90, rel = 14 * D2R;
    this.bounce.position.set(
      Math.cos(ra) * Math.cos(rel) * rd, Math.sin(rel) * rd, Math.sin(ra) * Math.cos(rel) * rd);

    if (app) {
      // An orthographic camera sits `rig.dist` back from the pivot whatever the zoom, so fog
      // depth is ~260 units for every pixel of a 130-unit diorama. Exponential fog against that
      // erases the scene; linear fog anchored to the rig distance is the only version that means
      // anything here, and it is what the diorama wants anyway — precise near/far control.
      const d = app.rig.dist, R = 95;
      const s = Math.max(0.12, this.fogScale ?? 1);
      app.scene.fog = new THREE.Fog(p.fog.color, d - R * 0.55, d - R * 0.55 + (R * 2.9) / s);
      this.buildSky(app);
    }
  }

  // Camera-facing, so the horizon band has to sit where the horizon actually lands on screen.
  // At a 30° elevation that is a little above centre; the band is wide enough that a 20° swing
  // does not expose the seam.
  buildSky(app) {
    if (!app) return;
    const p = this.p;
    const cv = document.createElement('canvas');
    cv.width = 8; cv.height = 256;
    const g = cv.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256);
    grd.addColorStop(0, p.sky.top);
    grd.addColorStop(0.52, p.sky.haze);
    grd.addColorStop(0.78, p.sky.horizon);
    grd.addColorStop(1, p.fog.color);
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 256);

    if (this.glow ?? 0.7) {
      const gl = g.createLinearGradient(0, 130, 0, 256);
      gl.addColorStop(0, 'rgba(0,0,0,0)');
      gl.addColorStop(1, p.sun.color);
      g.globalAlpha = Math.min(1, (this.glow ?? 0.7) * 0.55);
      g.fillStyle = gl;
      g.fillRect(0, 130, 8, 126);
      g.globalAlpha = 1;
    }

    if (this.skyTex) { untrack(this.skyTex); this.skyTex.dispose(); }
    this.skyTex = new THREE.CanvasTexture(cv);
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    track(this.skyTex, { w: 8, h: 256, mips: false, label: 'sky gradient' });
    app.scene.background = this.skyTex;
  }

  // The shadow frustum is tiny compared to the world, so it has to follow whatever the camera
  // is looking at or half the diorama loses its shadows on a zoom-in.
  update(dt, app) {
    const t = app.rig.target;
    this.bounce.position.add(t).sub(this.lastT || t);
    this.lastT = t.clone();
    this.sunTarget.position.copy(t);
    const az = (this.azOverride ?? this.p.sun.azimuth) * D2R;
    const el = (this.elOverride ?? this.p.sun.elevation) * D2R;
    const d = 140;
    this.sun.position.set(t.x + Math.cos(az) * Math.cos(el) * d, t.y + Math.sin(el) * d, t.z + Math.sin(az) * Math.cos(el) * d);
  }
}
