// Sun / sky / fog / time of day. One procedural equirect sky serves as both the visible
// background and, through PMREM, the ambient environment — so shadowed faces pick up cool sky
// while lit faces get warm sun, which is most of what makes the reference plates read.

import * as THREE from 'three';
import { Field, clamp, lerp, smoothstep, hexRgb } from './textures/noise.js';
import { configure as configureTextures } from './textures/bake.js';
import { windows, setEnvIntensity, setVariation, setGroundField, setSkirt } from './materials.js';
import { track, untrack } from '../engine/budget.js';
import { groundField } from './textures/groundfield.js';

const SKY_W = 1024, SKY_H = 512;

const _fwd = new THREE.Vector3(), _c = new THREE.Vector3();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3();
const _upY = new THREE.Vector3(0, 1, 0), _upZ = new THREE.Vector3(0, 0, 1);
const _cA = new THREE.Color(), _cB = new THREE.Color(), _cC = new THREE.Color(), _cD = new THREE.Color();

const LUT = [
  { el: -0.50, zen: '#152a68', hor: '#3465c4', gnd: '#16224a', glow: '#3f63ad' },
  { el: -0.16, zen: '#243a86', hor: '#5a6ac0', gnd: '#1e2a52', glow: '#8a6aa4' },
  { el: -0.02, zen: '#584a8c', hor: '#e28fa4', gnd: '#3c3244', glow: '#ff8a52' },
  { el: 0.16, zen: '#8b7fc0', hor: '#f0a6b4', gnd: '#61504a', glow: '#ffab63' },
  { el: 0.42, zen: '#6f9cd2', hor: '#dbe7ea', gnd: '#6d6456', glow: '#ffeed0' },
  { el: 0.85, zen: '#5d92cd', hor: '#d2e2e8', gnd: '#71695c', glow: '#fff7e4' },
];
const LUT_RGB = LUT.map(e => ({
  el: e.el, zen: hexRgb(e.zen), hor: hexRgb(e.hor), gnd: hexRgb(e.gnd), glow: hexRgb(e.glow),
}));

// Key colour by elevation. Midday sits around 5500 K rather than white, so it can disagree
// with the cool sky fill — a shadow that is only a darker version of the lit surface is the
// single loudest tell that a render is not lit, just shaded. A deep-orange low sun turns the
// whole dusk frame brown; the reference plate's low light is a pale warm cream, so the ramp
// desaturates rather than saturates on the way down.
const SUN_LUT = [
  { el: -0.05, c: 0xffcaa0 }, { el: 0.10, c: 0xffe0bc }, { el: 0.30, c: 0xffe2b8 },
  { el: 0.55, c: 0xffe4bc }, { el: 0.80, c: 0xffe8ca },
];

const MOON = 0x7fa8ff;

function lutAt(el) {
  let i = 0;
  while (i < LUT_RGB.length - 2 && el > LUT_RGB[i + 1].el) i++;
  const a = LUT_RGB[i], b = LUT_RGB[i + 1];
  const t = smoothstep(a.el, b.el, el);
  const mix = k => [lerp(a[k][0], b[k][0], t), lerp(a[k][1], b[k][1], t), lerp(a[k][2], b[k][2], t)];
  return { zen: mix('zen'), hor: mix('hor'), gnd: mix('gnd'), glow: mix('glow') };
}

function sunColorAt(el) {
  let i = 0;
  while (i < SUN_LUT.length - 2 && el > SUN_LUT[i + 1].el) i++;
  const t = smoothstep(SUN_LUT[i].el, SUN_LUT[i + 1].el, el);
  return new THREE.Color(SUN_LUT[i].c).lerp(new THREE.Color(SUN_LUT[i + 1].c), t);
}

export class Lighting {
  constructor() {
    this.object3D = new THREE.Group();
    this.time = 10.5;
    this.night = 0;

    this.key = new THREE.DirectionalLight(0xffffff, 3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 0.5;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.022;
    this.key.shadow.radius = 2.4;
    this.object3D.add(this.key, this.key.target);

    // Hemisphere, not ambient: a flat ambient tints lit and shadowed faces identically, so the
    // shadow can never be a different hue from the light. Sky half is cool, ground half is the
    // warm bounce coming back off the terrain.
    this.fill = new THREE.HemisphereLight(0x9dc4f0, 0x8a7758, 0.1);
    this.object3D.add(this.fill);

    this.clouds = new Field({ size: 128, period: 4, octaves: 4, gain: 0.55, seed: 71 });
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = SKY_W; this.skyCanvas.height = SKY_H;
    this.skyImg = this.skyCanvas.getContext('2d').createImageData(SKY_W, SKY_H);
    this.skyTex = new THREE.CanvasTexture(this.skyCanvas);
    this.skyTex.mapping = THREE.EquirectangularReflectionMapping;
    this.skyTex.colorSpace = THREE.SRGBColorSpace;
    this.skyTex.generateMipmaps = false;
    this.skyTex.minFilter = THREE.LinearFilter;
    track(this.skyTex, { w: SKY_W, h: SKY_H, fmt: 'rgba', mips: false, label: 'sky:equirect' });

    windows.attach(this.object3D);
    this.rows = { el: new Float32Array(SKY_H), cos: new Float32Array(SKY_H), sin: new Float32Array(SKY_H) };
    for (let y = 0; y < SKY_H; y++) {
      const el = (0.5 - (y + 0.5) / SKY_H) * Math.PI;
      this.rows.el[y] = el; this.rows.cos[y] = Math.cos(el); this.rows.sin[y] = Math.sin(el);
    }
    this.cols = { cos: new Float32Array(SKY_W), sin: new Float32Array(SKY_W) };
    for (let x = 0; x < SKY_W; x++) {
      const az = ((x + 0.5) / SKY_W - 0.5) * Math.PI * 2;
      this.cols.cos[x] = Math.cos(az); this.cols.sin[x] = Math.sin(az);
    }
  }

  registerKnobs(q, app) {
    this.app = app;
    this.q = q;
    app.scene.fog = new THREE.FogExp2(0xcfd8dd, 0.005);

    const gf = groundField();
    setGroundField(gf.tex, gf.grid);

    this.pmrem = new THREE.PMREMGenerator(app.renderer);
    this.pmrem.compileEquirectangularShader();
    track({ isTexture: false }, { w: 256, h: 256 * 6, fmt: 'rgb', mips: true, label: 'sky:pmrem' });

    q.register({ key: 'texCap', label: 'Texture cap', type: 'select', options: [256, 512, 1024, 2048], group: 'Renderer' },
      () => configureTextures(q));
    q.register({ key: 'aniso', label: 'Anisotropy', type: 'select', options: [1, 2, 4, 8, 16], group: 'Renderer' },
      () => configureTextures(q));

    q.register({ key: 'time', label: 'Time of day', type: 'range', min: 0, max: 24, step: 0.1, default: 10.5, group: 'World' },
      v => { this.time = v; this.dirty = true; this.apply(); });
    q.register({ key: 'viewDist', label: 'View distance', type: 'range', min: 60, max: 500, step: 10, group: 'World' },
      v => { app.camera.far = v * 3; app.camera.updateProjectionMatrix(); this.apply(); });
    q.register({ key: 'fogAmount', label: 'Fog', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      () => this.apply());
    q.register({ key: 'cloudCover', label: 'Cloud cover', type: 'range', min: 0, max: 1, step: 0.05, default: 0.38, group: 'World' },
      () => { this.dirty = true; this.apply(); });

    q.register({ key: 'sunPower', label: 'Sun power', type: 'range', min: 0, max: 8, step: 0.1, default: 5.6, group: 'Light' },
      () => this.apply());
    q.register({ key: 'envPower', label: 'Sky bounce', type: 'range', min: 0, max: 4, step: 0.01, default: 0.28, group: 'Light' },
      () => this.apply());
    q.register({ key: 'skyFill', label: 'Sky fill', type: 'range', min: 0, max: 1, step: 0.01, default: 0.11, group: 'Light' },
      () => this.apply());
    q.register({ key: 'moonPower', label: 'Moon', type: 'range', min: 0, max: 3, step: 0.02, default: 1.5, group: 'Light' },
      () => this.apply());
    q.register({ key: 'nightLift', label: 'Night lift', type: 'range', min: 0, max: 5, step: 0.02, default: 3.2, group: 'Light' },
      () => this.apply());
    q.register({ key: 'stoneVary', label: 'Stone variation', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      v => setVariation(v));
    q.register({ key: 'wallSkirt', label: 'Wall contact shade', type: 'range', min: 0, max: 2, step: 0.05, default: 1, group: 'World' },
      v => setSkirt(v));
    q.register({ key: 'windowLights', label: 'Window lights', type: 'range', min: 0, max: 48, step: 1, default: 18, group: 'Light' },
      v => windows.setCap(Math.min(v, q.get('lightCap') ?? 24)));
    q.register({ key: 'windowPower', label: 'Window power', type: 'range', min: 0, max: 90, step: 0.5, default: 38, group: 'Light' },
      v => { windows.power = v; });
    q.register({ key: 'windowReach', label: 'Window reach', type: 'range', min: 3, max: 24, step: 0.5, default: 13, group: 'Light' },
      v => { windows.reach = v; });
    q.register({ key: 'windowGlow', label: 'Window glow', type: 'range', min: 0, max: 5, step: 0.05, default: 3.2, group: 'Light' },
      v => { windows.glow = v; windows.setNight(this.night); });

    q.register({ key: 'shadowMap', label: 'Shadow map', type: 'select', options: [512, 1024, 2048, 4096], group: 'Renderer' },
      v => {
        this.key.shadow.mapSize.set(+v, +v);
        if (this.key.shadow.map) { this.key.shadow.map.dispose(); this.key.shadow.map = null; }
        this.apply();
      });
    q.register({ key: 'shadowDist', label: 'Shadow distance', type: 'range', min: 20, max: 200, step: 5, group: 'Renderer' },
      () => this.apply());
    q.register({ key: 'shadowSoft', label: 'Shadow softness', type: 'range', min: 0, max: 8, step: 0.2, default: 2.2, group: 'Renderer' },
      v => { this.key.shadow.radius = v; });

    this.ready = true;
    this.dirty = true;
    this.apply();
  }

  sunAngles(t) {
    const h = (t / 24) * Math.PI * 2 - Math.PI;
    const decl = 0.15, lat = 0.78;
    const sl = Math.sin(lat), cl = Math.cos(lat);
    const el = Math.asin(clamp(sl * Math.sin(decl) + cl * Math.cos(decl) * Math.cos(h), -1, 1));
    const az = Math.atan2(Math.sin(h), Math.cos(h) * sl - Math.tan(decl) * cl) + Math.PI;
    return { el, az };
  }

  apply() {
    if (!this.ready) return;
    const q = this.q;
    const { el, az } = this.sunAngles(this.time);
    this.elev = el;
    const isNight = el < -0.02;
    this.night = smoothstep(0.03, -0.13, el);

    const dirEl = isNight ? 0.62 : el;
    const dirAz = isNight ? az + Math.PI : az;
    this.keyDir = new THREE.Vector3(
      Math.sin(dirAz) * Math.cos(dirEl), Math.sin(dirEl), -Math.cos(dirAz) * Math.cos(dirEl));

    // Stands in for the eye adapting to a fifth of the irradiance. It rides on key and fill
    // together, so it lifts the level without touching the lit-to-shadow ratio.
    const lowSun = 1 - smoothstep(0.05, 0.42, el);
    const expo = lerp(1, 2.7, lowSun);

    const sunI = q.get('sunPower') * expo * smoothstep(-0.03, 0.05, el) * (0.82 + 0.18 * smoothstep(0.05, 0.5, el));
    const moonI = q.get('moonPower') * smoothstep(-0.02, -0.18, el);
    this.key.color.copy(isNight ? _cA.setHex(MOON) : sunColorAt(el));
    this.key.intensity = isNight ? moonI : sunI;

    const sky = lutAt(el);
    const hor = new THREE.Color().setRGB(sky.hor[0] / 255, sky.hor[1] / 255, sky.hor[2] / 255, THREE.SRGBColorSpace);
    const zen = new THREE.Color().setRGB(sky.zen[0] / 255, sky.zen[1] / 255, sky.zen[2] / 255, THREE.SRGBColorSpace);

    // The sky only takes over once the sun is actually going; boosting it while the sun is
    // merely low washes the key straight out of the image.
    const twilight = 1 - smoothstep(-0.06, 0.10, el);
    setEnvIntensity(q.get('envPower') * lerp(1, 1.9, twilight) * lerp(1, 1.7, this.night));

    // The fill must never agree with the key — but "cool" means cool relative to the key, not
    // blue. At a low sun the sky genuinely is the pink one, and pulling the fill toward a
    // midday blue there paints the whole frame the wrong colour.
    const high = smoothstep(0.10, 0.42, el);
    const skyTarget = _cA.setHex(0xbf9bd6).lerp(_cB.setHex(0x7fa8d8), high).lerp(_cD.setHex(0x3d78f2), this.night);
    const gndTarget = _cC.setHex(0xb08a72).lerp(_cD.setHex(0x9d8464), high).lerp(_cB.setHex(0x1d47ad), this.night);
    const desat = lerp(lerp(0.26, 0.66, smoothstep(0.02, 0.45, el)), 0.92, this.night);
    this.fill.color.copy(zen).lerp(skyTarget, desat);
    this.fill.groundColor.copy(hor).lerp(gndTarget, desat * 1.1);
    // The old low-sun boost was 2.6× on the fill alone, which put enough untinted ambient in
    // that the shadow map's own output stopped reading as a shadow at all — the "no shadows
    // below 15°" report was this line, not the shadow camera.
    const dayFill = q.get('sunPower') * q.get('skyFill') * expo * lerp(1, 1.3, lowSun);
    this.fill.intensity = lerp(dayFill, q.get('nightLift'), this.night);

    // Aerial perspective. A grazing sun means a far longer path through the atmosphere, so dusk
    // scatters twice as hard as midday — that haze is most of why the reference dusk plate has
    // no black anywhere in it.
    const fogCol = hor.clone().lerp(zen, 0.18 + this.night * 0.34);
    const vd = q.get('viewDist');
    const amt = Math.max(0, q.get('fogAmount'));
    this.app.scene.fog.color.copy(fogCol);
    this.app.scene.fog.density = 1.6 * amt * lerp(1, 2.2, lowSun) * lerp(1, 0.45, this.night) / Math.max(40, vd);

    windows.setNight(this.night);
    if (this.dirty) { this.drawSky(el, az); this.dirty = false; }
  }

  drawSky(el, az) {
    const p = this.skyImg.data;
    const sky = lutAt(el);
    const cover = this.q.get('cloudCover');
    const dayF = smoothstep(-0.14, 0.06, el);
    // three's equirect lookup measures azimuth from +X toward +Z; the sun runs from -Z (north).
    const azT = az - Math.PI / 2;
    const A = Math.cos(el) * Math.cos(azT), B = Math.cos(el) * Math.sin(azT), C = Math.sin(el);
    const glowStrength = lerp(0.12, 1, smoothstep(-0.22, 0.04, el));
    // Narrow at midday — a wide skirt covers most of the dome, so the PMREM irradiance comes out
    // warm everywhere and shadowed faces can never read cool. Wide at dusk, where it is the only
    // cue that there is a sun in a frame whose camera is not pointing at one.
    const broad = lerp(0.05, 0.26, 1 - smoothstep(0.10, 0.40, el));

    const rowRGB = new Float32Array(SKY_H * 3);
    for (let y = 0; y < SKY_H; y++) {
      const e = this.rows.el[y];
      const t = Math.pow(smoothstep(-0.05, 0.62, e), 0.8);
      const g = smoothstep(0, -0.16, e);
      for (let k = 0; k < 3; k++) {
        rowRGB[y * 3 + k] = lerp(lerp(sky.hor[k], sky.zen[k], t), sky.gnd[k], g);
      }
    }

    for (let y = 0; y < SKY_H; y++) {
      const ce = this.rows.cos[y], se = this.rows.sin[y];
      const e = this.rows.el[y];
      const cloudBand = smoothstep(0.015, 0.22, e) * (1 - smoothstep(0.5, 1.1, e)) * dayF;
      const r0 = rowRGB[y * 3], g0 = rowRGB[y * 3 + 1], b0 = rowRGB[y * 3 + 2];
      for (let x = 0; x < SKY_W; x++) {
        const dot = ce * (this.cols.cos[x] * A + this.cols.sin[x] * B) + se * C;
        const s = dot > 0 ? dot : 0;
        // the wide skirt this used to have covered most of the dome, so the PMREM irradiance
        // came out warm everywhere and shadowed faces could never read cool
        const glow = (Math.pow(s, 220) * 0.9 + Math.pow(s, 44) * 0.26 + Math.pow(s, 7) * broad) * glowStrength;

        let r = r0, g = g0, b = b0;
        if (cloudBand > 0.001 && cover > 0.01) {
          const cv = this.clouds.at(x / SKY_W * 2.4, 0.5 - e * 0.75);
          const m = smoothstep(1 - cover, 1 - cover + 0.30, cv) * cloudBand;
          if (m > 0.001) {
            const lit = 0.92 + 0.35 * glow;
            r = lerp(r, lerp(sky.hor[0], 252, 0.55) * lit, m);
            g = lerp(g, lerp(sky.hor[1], 246, 0.55) * lit, m);
            b = lerp(b, lerp(sky.hor[2], 240, 0.55) * lit, m);
          }
        }
        r += sky.glow[0] * glow; g += sky.glow[1] * glow; b += sky.glow[2] * glow;

        if (this.night > 0.25 && e > 0.02) {
          const h = ((x * 1103515245 + y * 12345) ^ (y << 7)) >>> 0;
          if ((h % 9973) > 9960) {
            const s2 = 90 + (h % 120);
            const f = (this.night - 0.25) * 1.34 * smoothstep(0.02, 0.35, e);
            r += s2 * f; g += s2 * f; b += (s2 + 30) * f;
          }
        }

        const i = (y * SKY_W + x) * 4;
        p[i] = r; p[i + 1] = g; p[i + 2] = b; p[i + 3] = 255;
      }
    }
    this.skyCanvas.getContext('2d').putImageData(this.skyImg, 0, 0);
    this.skyTex.needsUpdate = true;
    this.envDirty = true;
  }

  refreshEnv() {
    this.envTarget = this.pmrem.fromEquirectangular(this.skyTex, this.envTarget);
    this.app.scene.environment = this.envTarget.texture;
    this.app.scene.background = this.skyTex;
    this.envDirty = false;
  }

  // Fit the shadow camera to the bounding sphere of the view frustum out to `shadowDist`.
  // A sphere rather than a box because it does not change size as the camera turns, which is
  // what lets the texel snap below actually hold still.
  fitShadow(app) {
    const q = this.q, cam = app.camera;
    // past ~90 m one 2048 map has no texels left to spare and contact shadows turn to mush;
    // fog has taken over by then anyway
    const far = Math.min(q.get('shadowDist') || 80, 85, cam.far);
    const near = cam.near;
    const tanY = Math.tan(cam.fov * Math.PI / 360);
    const s = tanY * tanY * (1 + cam.aspect * cam.aspect);

    let z = (far + near) * (1 + s) * 0.5;
    if (z > far) z = far;
    const radius = Math.sqrt((far - z) * (far - z) + s * far * far);

    const fwd = cam.getWorldDirection(_fwd);
    const centre = _c.copy(cam.position).addScaledVector(fwd, z);

    const up = Math.abs(this.keyDir.y) > 0.99 ? _upZ : _upY;
    this.key.up.copy(up);
    const zx = _bz.copy(this.keyDir).normalize();
    const xx = _bx.crossVectors(up, zx).normalize();
    const yy = _by.crossVectors(zx, xx);

    // snap the centre to whole shadow-map texels or a slow pan crawls with aliasing
    const texel = (2 * radius) / (+q.get('shadowMap') || 1024);
    const px = Math.round(centre.dot(xx) / texel) * texel;
    const py = Math.round(centre.dot(yy) / texel) * texel;
    const pz = centre.dot(zx);
    centre.copy(xx).multiplyScalar(px).addScaledVector(yy, py).addScaledVector(zx, pz);

    this.key.target.position.copy(centre);
    this.key.position.copy(centre).addScaledVector(zx, radius + 25);
    this.key.target.updateMatrixWorld();

    const c = this.key.shadow.camera;
    c.left = -radius; c.right = radius; c.top = radius; c.bottom = -radius;
    c.near = 0.5; c.far = 2 * radius + 55;
    c.updateProjectionMatrix();
    // bias has to track texel size or a tight fit acnes and a loose fit peter-pans
    this.key.shadow.normalBias = Math.max(0.012, Math.min(0.03, texel * 0.3));
  }

  update(dt, app) {
    if (this.envDirty) this.refreshEnv();
    this.fitShadow(app);
    windows.update(dt, app);
  }

  dispose() {
    untrack(this.skyTex); this.skyTex.dispose();
    this.envTarget?.dispose();
    this.pmrem?.dispose();
  }
}
