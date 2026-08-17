// §4.1-§4.5. The five day variants, the clock, the frame-by-frame blend, the sky dome, the two
// lights, the env bake, and §4.5's light shafts.
//
// Obligation T2: the fog COLOURS here are §4.1.1's. The fog DISTANCES are NOT ours — they live
// in config.FOG because §3.2.1 interlocks them with ringNear and budget.mjs re-derives C1 from
// that table with no rendering. Change a distance there, never here.
//
// §4.1.1's rule, and it is the number the whole look hangs on:
//   Fog colour must be measurably LIGHTER than the shell material — 2.5-4x its sRGB luminance at
//   night, 5-6x in daysmog — or depth banding does not exist and §3.0's mechanism is gone.
// It does not brighten the frame: fogFactor is ~0 across the near field, so this lifts only the
// distant bands. Do not "correct" these downward.

import * as THREE from 'three';
import { FOG, BLOOM, GRADE, VARIANTS } from './config.js';
import { U, shaftMaterial } from './materials.js';
import { clamp, lerp, smoothstep } from './utils.js';

// ── the table ──────────────────────────────────────────────────────────────
// 21 values per §4.1, plus four the plan's list omits but §4.3/§4.4 require: the sky dome
// gradient (zenith/horizon), the per-variant bloom strength, and the saturation multiplier.

export const VARIANT = {
  deepnight: {
    fogColor: 0x1c2029,                       // 2.66x the shell's luminance (§4.1.1)
    hemiSky: 0x0c1220, hemiGround: 0x05070a, hemiI: 0.06,
    // P3b: dirI 0.00 → 0.10. With no directional at all, a HemisphereLight gives a building's
    // north and east faces identical radiance and every mass reads as a flat card — the first
    // blind critic round said exactly that, twice, unprompted ("front and side faces of the same
    // building are nearly identical in value, so buildings read as flat cards, not volumes").
    // 0x2a3446 at 0.10 is 0.0034 of luminance on a lit face: it does not brighten the frame, it
    // just stops the two faces being the same number.
    dirColor: 0x2a3446, dirI: 0.10, dirAz: 40, dirEl: 30,
    zenith: 0x04060b, horizon: 0x0a1018,      // §4.1: "sky is 0x04060b flat"
    neon: 1.00, exposure: 1.00, bloom: 0.95,
    lift: 0.000, gain: 1.00, split: 0.18, sat: 1.00,
    rain: 0.15, shafts: 0.00,
  },
  predawn: {
    fogColor: 0x1f2028,
    hemiSky: 0x1a2434, hemiGround: 0x0a0d14, hemiI: 0.13,
    dirColor: 0x5f6f86, dirI: 0.18, dirAz: 92, dirEl: 6,   // a cold lift on ONE horizon
    zenith: 0x070b14, horizon: 0x243247,
    neon: 0.95, exposure: 1.00, bloom: 0.85,
    lift: 0.004, gain: 1.00, split: 0.16, sat: 1.00,
    rain: 0.10, shafts: 0.40,
  },
  daysmog: {
    // §4.3. Warm-grey to cool-grey, and there is no blue channel dominance anywhere in this
    // palette. The fog is the LIGHTEST of the five (6.3x the shell): in daylight the haze is
    // brighter, so it hides more, not less.
    fogColor: 0x4a4b50,
    hemiSky: 0x585048, hemiGround: 0x2e2c28, hemiI: 0.42,
    dirColor: 0xb8ab96, dirI: 0.55, dirAz: 138, dirEl: 22,
    zenith: 0x585048, horizon: 0x3b3a3e,
    neon: 0.62, exposure: 0.86, bloom: 0.55,
    // §4.3 item 5, and item 1's "no blue channel dominance ANYWHERE": the base grade in
    // config.GRADE is deliberately cool (lift B 2x lift R, gain B 1.06 vs R 1.02) and the split
    // tone pushes shadows to teal. Both are correct at night and both put blue in a daysmog
    // frame, so daysmog overrides them outright rather than scaling them.
    lift: 0.055, gain: 0.88, split: 0.00, sat: 0.72,
    liftRGB: [0.060, 0.058, 0.052], gainRGB: [0.90, 0.88, 0.86],
    rain: 0.00, shafts: 1.00,
  },
  duskburn: {
    fogColor: 0x2e2028,                       // warm near, cold far — this is 1488490_08
    hemiSky: 0x3a4a63, hemiGround: 0x2a1a14, hemiI: 0.20,
    dirColor: 0xd46a3c, dirI: 0.55, dirAz: 256, dirEl: 4,
    zenith: 0x121a2a, horizon: 0x4a2a1e,
    neon: 0.90, exposure: 1.06, bloom: 0.90,
    lift: 0.002, gain: 1.00, split: 0.22, sat: 1.02,
    rain: 0.05, shafts: 0.70,
  },
  stormnight: {
    fogColor: 0x2a2f38,
    hemiSky: 0x18202c, hemiGround: 0x090c12, hemiI: 0.10,
    dirColor: 0x39506e, dirI: 0.24, dirAz: 300, dirEl: 20,   // P3b — see deepnight's note
    zenith: 0x080b12, horizon: 0x1a2029,
    neon: 1.00, exposure: 1.00, bloom: 1.05,
    lift: 0.000, gain: 1.00, split: 0.20, sat: 1.00,
    rain: 1.00, shafts: 0.15,
  },
};

// §4.1's clock bands. Each variant holds pure across its band and crossfades over XF hours
// either side of a boundary, so `?time=` sweeps the whole day with no hard switch anywhere.
const START = [0, 4, 7, 16, 19];              // deepnight, predawn, daysmog, duskburn, stormnight
const XF = 0.6;

export function blendAt(t) {
  t = ((t % 24) + 24) % 24;
  const n = START.length;
  for (let i = 0; i < n; i++) {
    let d = t - START[i];
    if (d > 12) d -= 24; else if (d < -12) d += 24;
    if (Math.abs(d) < XF) {
      return { a: VARIANTS[(i - 1 + n) % n], b: VARIANTS[i], u: smoothstep((d + XF) / (2 * XF)) };
    }
  }
  let i = 0;
  for (let k = 0; k < n; k++) if (t >= START[k]) i = k;
  return { a: VARIANTS[i], b: VARIANTS[i], u: 1 };
}

// ── the dome ───────────────────────────────────────────────────────────────
// Drawn first with depthTest off, so it costs one draw, never fights the far plane, and cannot
// leave a gap. Its horizon stop is the fog colour, which is what makes the far skyline dissolve
// into the sky instead of ending at a line.

const DOME_FRAG = /* glsl */`
uniform vec3 uZenith, uHorizon, uFog, uSunColor;
uniform float uSunI, uFlash;
uniform vec3 uSunDir;             // direction the light TRAVELS, so -uSunDir points at the sun
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float h = clamp( d.y, -1.0, 1.0 );
  float up = smoothstep( 0.0, 0.55, h );
  vec3 c = mix( uHorizon, uZenith, up );
  c = mix( uFog, c, smoothstep( -0.06, 0.16, h ) );          // dissolve into the haze at the deck
  float sun = clamp( dot( d, -uSunDir ), 0.0, 1.0 );
  c += uSunColor * ( uSunI * ( pow( sun, 14.0 ) * 0.9 + pow( sun, 3.0 ) * 0.22 ) );
  c += vec3( uFlash );
  gl_FragColor = vec4( c, 1.0 );
}`;

const DOME_VERT = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;

// ── the sky ────────────────────────────────────────────────────────────────

export class Sky {
  constructor(scene, camera, renderer, Q, atlas) {
    this.scene = scene; this.camera = camera; this.renderer = renderer; this.Q = Q; this.atlas = atlas;

    this.forced = null;                 // ?var= / a shot scenario pins one; else the clock drives
    this.clock = 22;
    this.p = blank();                   // the blended variant, rebuilt every frame

    // lights. No shadows in any variant (§4.3) — renderer.shadowMap.enabled stays false.
    this.hemi = new THREE.HemisphereLight(0x0c1220, 0x05070a, 0.06);
    this.dir = new THREE.DirectionalLight(0x2a3446, 0);
    this.dir.castShadow = false;
    scene.add(this.hemi, this.dir);

    // dome
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
        uFog: { value: new THREE.Color() }, uSunColor: { value: new THREE.Color() },
        uSunDir: { value: new THREE.Vector3(0, -1, 0) }, uSunI: { value: 0 }, uFlash: { value: 0 },
      },
      vertexShader: DOME_VERT, fragmentShader: DOME_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, toneMapped: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    scene.add(this.dome);

    // env — an equirect canvas of the same sky, PMREM'd. One target, rebaked in place, so the
    // material's envMap reference never changes and nothing needs a recompile.
    const ew = Math.max(64, Q.envSize * 4);
    this.envCanvas = document.createElement('canvas');
    this.envCanvas.width = ew; this.envCanvas.height = ew / 2;
    this.envTex = new THREE.CanvasTexture(this.envCanvas);
    this.envTex.mapping = THREE.EquirectangularReflectionMapping;
    this.envTex.colorSpace = THREE.SRGBColorSpace;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTarget = null;
    this.envKey = -1;
    this.msEnv = 0;

    // §4.5's shafts, against FIXED DEBUG ANCHORS. Real anchoring is P3b's job: the cards hang in
    // the widest gaps between near-ring towers and there are no chunks yet.
    this.shaftMat = shaftMaterial(atlas);
    this.shafts = [];
    // Fanned along daysmog's own sun bearing (az 138 deg) at 240-560 m, which is where a shaft
    // actually falls: between the towers the light is coming through. P3b replaces these with the
    // widest gaps in the near ring, which is why they are hard-coded and not derived.
    // Fanned along daysmog's own sun bearing (az 138 deg) at 130-330 m, which is where a shaft
    // actually falls: between the towers the light is coming through. They have to be NEAR — a
    // shaft takes §4.2.1's additive fog, and daysmog's V is 520 m in clear air and 269 m in the
    // murk, so a card at 500 m is already gone. P3b replaces these with the widest gaps in the
    // near ring, which is why they are hard-coded and not derived.
    const ANCHORS = [[35, 200, -143], [168, 200, -104], [145, 200, -206], [273, 200, -198]];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, this.shaftMat);
      m.position.fromArray(ANCHORS[i]);
      m.scale.set(78 + i * 12, 320, 1);
      m.renderOrder = 6;
      m.frustumCulled = false;
      m.visible = false;
      m.userData.debugAnchor = ANCHORS[i];
      scene.add(m);
      this.shafts.push(m);
    }

    this.sunDir = new THREE.Vector3(0, -1, 0);
    this.flash = 0;
    this.nextBolt = 20 + Math.random() * 40;
    this._tmp = new THREE.Vector3();
    this._fwd = new THREE.Vector3();
    this._basis = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

    this.apply(0);
    this.bakeEnv(true);
  }

  get env() { return this.envTarget ? this.envTarget.texture : null; }

  setVariant(id) { this.forced = id && VARIANT[id] ? id : null; }
  setClock(h) { this.clock = ((h % 24) + 24) % 24; }

  // ── the blend ────────────────────────────────────────────────────────────
  blend(out = this.p) {
    if (this.forced) return copyVariant(out, VARIANT[this.forced], VARIANT[this.forced], 1);
    const { a, b, u } = blendAt(this.clock);
    return copyVariant(out, VARIANT[a], VARIANT[b], u);
  }

  // Fog DISTANCES come from config.FOG (§3.2.1), never from the variant table. LOW overrides
  // every variant with 420 m because its R0 is only 256 m.
  fogDistances(id) {
    if (this.Q.name === 'low') return [FOG.lowNear, FOG.lowFar];
    const v = FOG.variants[id];
    return v ? [v.near, v.far] : [FOG.variants.deepnight.near, FOG.variants.deepnight.far];
  }

  apply(dt) {
    const p = this.blend();

    // fog distances: same piecewise blend, read out of config.FOG
    let n0, f0, n1, f1, u;
    if (this.forced) { [n0, f0] = this.fogDistances(this.forced); n1 = n0; f1 = f0; u = 1; }
    else {
      const bl = blendAt(this.clock);
      [n0, f0] = this.fogDistances(bl.a); [n1, f1] = this.fogDistances(bl.b); u = bl.u;
    }
    const fog = this.scene.fog;
    fog.near = lerp(n0, n1, u);
    fog.far = lerp(f0, f1, u);
    fog.color.copy(p.fogColor);
    this.scene.background?.copy?.(p.fogColor);

    U.uNeon.value = p.neon;
    U.uSmogTop.value = p.smogTop;
    U.uClearY.value = p.clearY;
    U.uSmogMul.value = FOG.smogMul;
    U.uClearMul.value = FOG.clearMul;

    this.hemi.color.copy(p.hemiSky);
    this.hemi.groundColor.copy(p.hemiGround);
    this.hemi.intensity = p.hemiI + this.flash * 0.9;
    this.dir.color.copy(p.dirColor);
    this.dir.intensity = p.dirI;

    // dirAz/dirEl → the sun. `sunDir` is the direction light TRAVELS, so a DirectionalLight sits
    // at -sunDir and §4.5's view-dot uses -sunDir as "toward the light".
    const az = p.dirAz * Math.PI / 180, el = p.dirEl * Math.PI / 180;
    const sx = Math.cos(el) * Math.sin(az), sy = Math.sin(el), sz = Math.cos(el) * Math.cos(az);
    this.sunDir.set(-sx, -sy, -sz).normalize();
    this.dir.position.set(sx, sy, sz).multiplyScalar(600).add(this.camera.position);
    this.dir.target.position.copy(this.camera.position);
    this.dir.target.updateMatrixWorld();

    const du = this.domeMat.uniforms;
    du.uZenith.value.copy(p.zenith);
    du.uHorizon.value.copy(p.horizon);
    du.uFog.value.copy(p.fogColor);
    du.uSunColor.value.copy(p.dirColor);
    du.uSunI.value = p.dirI * 1.6 + (p.name === 'daysmog' ? 0.1 : 0);
    du.uFlash.value = this.flash * 0.35;
    this.dome.position.copy(this.camera.position);

    return p;
  }

  // ── lightning (§4.1, stormnight) ─────────────────────────────────────────
  lightning(dt) {
    this.flash = Math.max(0, this.flash - dt * 9);
    const storm = this.p.rain;
    if (storm < 0.7) { this.nextBolt = 25 + Math.random() * 45; return; }
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) { this.flash = 0.9; this.nextBolt = 25 + Math.random() * 45; }
  }

  // ── §4.5's REAL anchoring (P3b) ──────────────────────────────────────────
  //
  // "Anchored to gaps between near-ring towers, chosen at chunk load from the widest gaps."
  // A gap is defined the only way that is cheap and honest: sample a ring of candidates around the
  // camera and score each by its distance to the nearest LOD0 building AABB, which the collision
  // store already indexes. The four best, forced 130 m apart so they do not stack into one bar.
  //
  // Run ONLY when the camera changes chunk AND the variant actually has shafts (`deepnight` is
  // 0.00 and `stormnight` 0.15), so `fog_city` and `canyon_dive` pay for this once per chunk
  // crossing and `daysmog` — the variant it exists for — pays it where it shows.
  anchorShafts(cityR, camPos) {
    if (!cityR || this.p.shafts <= 0.02) return 0;
    const cand = [];
    const boxes = [];
    // Along the light's own bearing first: a shaft comes DOWN between towers from where the sun
    // is, so candidates are fanned about the sun azimuth rather than sprinkled all round.
    const az = this.p.dirAz * Math.PI / 180;
    for (let ri = 0; ri < 5; ri++) {
      const r = 90 + ri * 78;
      for (let ai = -4; ai <= 4; ai++) {
        const a = az + ai * 0.30;
        const x = camPos.x + Math.sin(a) * r, z = camPos.z + Math.cos(a) * r;
        cityR.aabbsNear(x, z, 96, boxes);
        let near = 96;
        for (const b of boxes) {
          const dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
          const d = Math.hypot(dx, dz);
          if (d < near) near = d;
        }
        // a gap with nothing in 96 m is open sky, not a canyon gap: those get no shaft, because a
        // shaft with no walls either side of it is a bar of light standing in a field.
        if (near >= 95) continue;
        cand.push({ x, z, gap: near, r });
      }
    }
    cand.sort((a, b) => b.gap - a.gap);
    const picked = [];
    for (const c of cand) {
      if (picked.length >= this.shafts.length) break;
      if (picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < 130)) continue;
      picked.push(c);
    }
    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i], c = picked[i];
      s.userData.anchored = !!c;
      if (!c) continue;
      s.position.set(c.x, 190, c.z);
      // the card is as wide as the gap it fell through, and no wider
      s.scale.set(Math.max(26, Math.min(96, c.gap * 1.7)), 330, 1);
    }
    this.anchoredAt = [Math.round(camPos.x), Math.round(camPos.z)];
    this.anchoredN = picked.length;
    return picked.length;
  }

  // ── §4.5's shafts ────────────────────────────────────────────────────────
  // Opacity by pow(saturate(dot(viewDir, -sunDir)), 2.5) so they bloom when you look toward the
  // light and vanish when you look away. Below 0.05 the card is switched OFF, not faded: a
  // nearly-transparent additive card still rasterises and shades every pixel it covers, so
  // opacity is not a cost lever and visibility is.
  updateShafts() {
    const cam = this.camera;
    cam.getWorldDirection(this._fwd);
    const toward = -this._fwd.dot(this.sunDir);            // == dot(viewDir, -sunDir)
    const vd = Math.pow(clamp(toward, 0, 1), 2.5);
    const amt = this.p.shafts * vd;
    const n = Math.min(this.shafts.length, this.Q.shafts | 0);
    this.shaftMat.opacity = clamp(amt * 0.55, 0, 1);
    this.shaftMat.color.copy(this.p.dirColor).lerp(WHITE, 0.35);
    this.viewDot = +vd.toFixed(4);
    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i];
      // An unanchored card is one the near ring had no gap for — it is not faded, it is off.
      if (i >= n || amt < 0.05 || s.userData.anchored === false) { s.visible = false; continue; }
      s.visible = true;
      // cylindrical billboard about the light axis
      const axis = this._basis[1].copy(this.sunDir).multiplyScalar(-1);
      const to = this._tmp.copy(cam.position).sub(s.position);
      const right = this._basis[0].crossVectors(axis, to);
      if (right.lengthSq() < 1e-6) { s.visible = false; continue; }
      right.normalize();
      const nrm = this._basis[2].crossVectors(right, axis).normalize();
      s.matrixAutoUpdate = false;
      s.matrix.makeBasis(right, axis, nrm);
      s.matrix.scale(s.scale);
      s.matrix.setPosition(s.position);
      s.matrixWorldNeedsUpdate = true;
    }
  }

  // ── the env bake ─────────────────────────────────────────────────────────
  // A 4:2 equirect painted from the blended sky, then PMREM'd. Rebaked only when the sky has
  // actually moved: a per-frame PMREM is a 2-4 ms hitch for a reflection nobody can see change.
  envSignature(p) {
    return Math.round(p.zenith.r * 60) * 1e6 + Math.round(p.horizon.g * 60) * 1e4
      + Math.round(p.fogColor.b * 60) * 1e2 + Math.round(p.dirI * 40)
      + (this.glowKey || 0) * 1e8;
  }

  // §3.7(a)'s missing half. The section asks for "a saturated horizon band of CITY GLOW whose hue
  // is the average of the nearby districts' palettes, warm sodium at the bottom" — P1a baked the
  // sky gradient and the sun and stopped there, so every envMap in the game reflected an empty
  // sky and the ground, the glass and (at P3b) the water film all came back near-black. This is
  // the cheapest light in the project: one canvas repaint, ~12 times per in-game day, and it puts
  // the city's own colour into every reflective surface for zero per-frame cost.
  //
  // main.js calls this when the camera's district changes; nothing here knows about the city.
  setGlow(hexTop, hexBottom, strength = 1) {
    const a = new THREE.Color(hexTop), b = new THREE.Color(hexBottom);
    if (this.glowTop && this.glowTop.equals(a) && this.glowBot.equals(b) && this.glowStr === strength) return false;
    this.glowTop = a; this.glowBot = b; this.glowStr = strength;
    this.glowKey = (Math.round(a.r * 15) * 16 + Math.round(b.g * 15)) % 97;
    return true;
  }

  bakeEnv(force = false) {
    const p = this.p;
    const key = this.envSignature(p);
    if (!force && key === this.envKey) return false;
    this.envKey = key;
    const t0 = performance.now();

    const c = this.envCanvas, g = c.getContext('2d'), w = c.width, h = c.height;
    const zen = p.zenith, hor = p.horizon, fg = p.fogColor;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, css(zen, 1.0));
    grad.addColorStop(0.40, css(hor, 1.0));
    grad.addColorStop(0.50, css(fg, 1.0));
    grad.addColorStop(0.62, css(fg, 0.72));
    grad.addColorStop(1.00, css(fg, 0.34));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // the sun / horizon glow, at the variant's own azimuth so reflections agree with the light
    if (p.dirI > 0.02) {
      const az = ((p.dirAz % 360) + 360) % 360;
      const x = (az / 360) * w, y = h * (0.5 - clamp(p.dirEl / 90, -0.5, 0.5));
      const r = w * 0.22;
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, css(p.dirColor, Math.min(1, p.dirI * 1.5)));
      rg.addColorStop(1, css(p.dirColor, 0));
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      if (x - r < 0) { g.save(); g.translate(w, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
      if (x + r > w) { g.save(); g.translate(-w, 0); g.fillRect(x - r, y - r, r * 2, r * 2); g.restore(); }
    }

    // §3.7(a)'s city glow. The band sits ON the horizon line (y = 0.5 of an equirect is the
    // horizon) so a facade at a grazing angle picks it up and a roof does not, and the sodium wash
    // below it is what a wet road actually reflects: the lit air under the city, not the sky.
    // Scaled by the variant's own neon multiplier, so `daysmog` does not glow pink at noon.
    if (this.glowTop) {
      const s = (this.glowStr ?? 1) * (0.35 + 0.65 * this.p.neon);
      const band = g.createLinearGradient(0, h * 0.40, 0, h);
      band.addColorStop(0.00, css(this.glowTop, 0));
      band.addColorStop(0.16, css(this.glowTop, 0.42 * s));
      band.addColorStop(0.26, css(this.glowTop, 0.20 * s));
      band.addColorStop(0.55, css(this.glowBot, 0.26 * s));
      band.addColorStop(1.00, css(this.glowBot, 0.40 * s));
      g.fillStyle = band;
      g.fillRect(0, h * 0.40, w, h * 0.60);
    }

    this.envTex.needsUpdate = true;
    this.envTarget = this.pmrem.fromEquirectangular(this.envTex, this.envTarget);
    this.msEnv = +(performance.now() - t0).toFixed(2);
    return true;
  }

  // ── the frame ────────────────────────────────────────────────────────────
  update(dt, clock) {
    if (clock !== undefined) this.setClock(clock);
    this.lightning(dt);
    const p = this.apply(dt);
    this.updateShafts();
    this.envAcc = (this.envAcc || 0) + dt;
    if (this.envAcc > 0.25) { this.envAcc = 0; this.bakeEnv(false); }
    return p;
  }

  // Everything a test or a HUD wants to know, without reaching into three.
  probe() {
    const p = this.p;
    return {
      variant: p.name, forced: this.forced, clock: +this.clock.toFixed(3),
      fog: { color: hexOf(p.fogColor), near: +this.scene.fog.near.toFixed(1), far: +this.scene.fog.far.toFixed(1) },
      smogTop: U.uSmogTop.value, clearY: U.uClearY.value,
      smogMul: U.uSmogMul.value, clearMul: U.uClearMul.value,
      neon: +p.neon.toFixed(4), exposure: +p.exposure.toFixed(4), bloom: +p.bloom.toFixed(4),
      lift: +p.lift.toFixed(4), gain: +p.gain.toFixed(4), split: +p.split.toFixed(4), sat: +p.sat.toFixed(4),
      hemiI: +p.hemiI.toFixed(4), dirI: +p.dirI.toFixed(4), rain: +p.rain.toFixed(4), shafts: +p.shafts.toFixed(4),
      hemiSky: hexOf(p.hemiSky), zenith: hexOf(p.zenith), horizon: hexOf(p.horizon),
      sunDir: this.sunDir.toArray().map(v => +v.toFixed(4)),
      viewDot: this.viewDot ?? 0,
      shaftsVisible: this.shafts.filter(s => s.visible).length,
      shaftsAnchored: this.anchoredN ?? 0,
      shaftAnchors: this.shafts.map(s => (s.userData.anchored === false ? null
        : s.position.toArray().map(v => +v.toFixed(1)))),
      anchoredAt: this.anchoredAt || null,
      msEnv: this.msEnv,
    };
  }

  // Sample the blend without disturbing the live state — the ?time= sweep gate reads this and
  // asserts C0 continuity numerically, which a screenshot cannot do.
  sampleAt(clock) {
    const save = { c: this.clock, f: this.forced };
    this.clock = ((clock % 24) + 24) % 24; this.forced = null;
    const p = copyVariant(blank(), VARIANT.deepnight, VARIANT.deepnight, 1);
    const bl = blendAt(this.clock);
    copyVariant(p, VARIANT[bl.a], VARIANT[bl.b], bl.u);
    const [n0, f0] = this.fogDistances(bl.a), [n1, f1] = this.fogDistances(bl.b);
    this.clock = save.c; this.forced = save.f;
    return {
      clock: +clock.toFixed(3), a: bl.a, b: bl.b, u: +bl.u.toFixed(4),
      fog: [p.fogColor.r, p.fogColor.g, p.fogColor.b].map(v => +v.toFixed(5)),
      near: +lerp(n0, n1, bl.u).toFixed(3), far: +lerp(f0, f1, bl.u).toFixed(3),
      neon: +p.neon.toFixed(5), exposure: +p.exposure.toFixed(5), bloom: +p.bloom.toFixed(5),
      hemiI: +p.hemiI.toFixed(5), dirI: +p.dirI.toFixed(5), sat: +p.sat.toFixed(5),
      lift: +p.lift.toFixed(5), gain: +p.gain.toFixed(5), split: +p.split.toFixed(5),
      shafts: +p.shafts.toFixed(5), rain: +p.rain.toFixed(5),
      zenith: [p.zenith.r, p.zenith.g, p.zenith.b].map(v => +v.toFixed(5)),
    };
  }

  bloomStrength() { return BLOOM.strength * this.p.bloom; }

  dispose() {
    this.pmrem?.dispose();
    this.envTarget?.dispose();
    this.envTex.dispose();
    this.domeMat.dispose();
    this.dome.geometry.dispose();
    this.shaftMat.dispose();
    this.shafts[0]?.geometry.dispose();
  }
}

// ── blending helpers ───────────────────────────────────────────────────────

const NUMS = ['hemiI', 'dirI', 'dirAz', 'dirEl', 'neon', 'exposure', 'bloom', 'lift', 'gain',
  'split', 'sat', 'rain', 'shafts'];
const COLS = ['fogColor', 'hemiSky', 'hemiGround', 'dirColor', 'zenith', 'horizon'];

function blank() {
  const o = { name: 'deepnight', smogTop: 90, clearY: 260, liftRGB: [0, 0, 0], gainRGB: [1, 1, 1] };
  for (const k of NUMS) o[k] = 0;
  for (const k of COLS) o[k] = new THREE.Color();
  return o;
}

// The grade's lift and gain are always resolved to a vec3 here, whether the variant offset the
// base or replaced it. Otherwise a crossfade between a variant that overrides and one that does
// not has nothing coherent to interpolate, and the override would stick across the boundary.
const effLift = v => v.liftRGB || [GRADE.lift[0] + v.lift, GRADE.lift[1] + v.lift, GRADE.lift[2] + v.lift];
const effGain = v => v.gainRGB || [GRADE.gain[0] * v.gain, GRADE.gain[1] * v.gain, GRADE.gain[2] * v.gain];

// Colours are lerped in the linear working space, which is where they live once THREE.Color has
// converted them off the sRGB hex. Azimuth takes the short way round or duskburn→stormnight
// swings the sun the long way through the sky.
function copyVariant(out, A, B, u) {
  out.name = u < 0.5 ? nameOf(A) : nameOf(B);
  for (const k of NUMS) {
    if (k === 'dirAz') { out[k] = lerpAngle(A[k], B[k], u); continue; }
    out[k] = lerp(A[k], B[k], u);
  }
  for (const k of COLS) out[k].setHex(A[k]).lerp(SCRATCH.setHex(B[k]), u);
  const la = effLift(A), lb = effLift(B), ga = effGain(A), gb = effGain(B);
  for (let i = 0; i < 3; i++) { out.liftRGB[i] = lerp(la[i], lb[i], u); out.gainRGB[i] = lerp(ga[i], gb[i], u); }
  out.smogTop = 90;
  out.clearY = 260;
  return out;
}

function lerpAngle(a, b, u) {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * u;
}

const SCRATCH = new THREE.Color();
const WHITE = new THREE.Color(0xffffff);

const NAMES = new Map(Object.entries(VARIANT).map(([k, v]) => [v, k]));
const nameOf = v => NAMES.get(v) || 'deepnight';

const css = (c, a) => `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`;
const hexOf = c => '#' + c.getHexString();

// §4.1.1's rule, as a number a test can assert on. Luminance uses the 0.299/0.587/0.114 weights
// LuminosityHighPassShader uses, so it is directly comparable to the bloom discussion in §4.4.
export const SHELL_ALBEDO = 0x0a0c11;
export function srgbLuma(hex) {
  return (0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255)) / 255;
}
export function fogContrast() {
  const shell = srgbLuma(SHELL_ALBEDO);
  return Object.fromEntries(Object.entries(VARIANT).map(([k, v]) =>
    [k, +(srgbLuma(v.fogColor) / shell).toFixed(3)]));
}
