import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './textures.js';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function bg(x, w, h, top = '#0b2a52', bot = '#041224') {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,200,255,0.07)'; x.lineWidth = 1;
  for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  for (let i = 0; i < h; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
}
function glowText(x, text, px, py, size, weight = 300, spacing = 6, color = '#e8f6ff', align = 'left') {
  x.font = `${weight} ${size}px ${FONT}`;
  x.textAlign = align; x.textBaseline = 'alphabetic';
  try { x.letterSpacing = `${spacing}px`; } catch (e) { /* older canvas */ }
  x.shadowColor = 'rgba(120,210,255,0.9)'; x.shadowBlur = size * 0.35;
  x.fillStyle = color; x.fillText(text, px, py);
  x.shadowBlur = 0;
}
function emblem(x, cx, cy, r) {
  x.save(); x.strokeStyle = 'rgba(170,230,255,0.9)'; x.lineWidth = r * 0.05;
  x.shadowColor = '#7fd4ff'; x.shadowBlur = r * 0.3;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  x.lineWidth = r * 0.03; x.beginPath(); x.arc(cx, cy, r * 0.72, 0, 7); x.stroke();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3); x.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); x.stroke(); }
  x.beginPath(); x.arc(cx, cy, r * 0.22, 0, 7); x.fillStyle = 'rgba(200,240,255,0.9)'; x.fill();
  x.restore();
}
function face(x, cx, cy, s) {
  // stylised serene profile facing right, built from curves
  x.save();
  const g = x.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.3);
  g.addColorStop(0, 'rgba(230,248,255,0.95)'); g.addColorStop(0.6, 'rgba(140,205,250,0.7)'); g.addColorStop(1, 'rgba(40,110,190,0.0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(cx - s * 0.55, cy - s * 0.95);
  x.bezierCurveTo(cx + s * 0.1, cy - s * 1.25, cx + s * 0.55, cy - s * 0.9, cx + s * 0.55, cy - s * 0.35);
  x.lineTo(cx + s * 0.72, cy - s * 0.05); x.lineTo(cx + s * 0.56, cy + s * 0.05);
  x.quadraticCurveTo(cx + s * 0.62, cy + s * 0.22, cx + s * 0.5, cy + s * 0.28);
  x.quadraticCurveTo(cx + s * 0.55, cy + s * 0.42, cx + s * 0.4, cy + s * 0.55);
  x.quadraticCurveTo(cx + s * 0.2, cy + s * 0.72, cx, cy + s * 0.68);
  x.lineTo(cx - s * 0.05, cy + s * 1.2); x.lineTo(cx - s * 0.6, cy + s * 1.2);
  x.bezierCurveTo(cx - s * 0.75, cy + s * 0.4, cx - s * 0.95, cy - s * 0.6, cx - s * 0.55, cy - s * 0.95);
  x.fill();
  x.strokeStyle = 'rgba(210,240,255,0.5)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(cx - s * 0.2, cy - s * 0.2, s * (0.35 + i * 0.07), -1.2, 0.2); x.stroke(); }
  x.restore();
}
function ui(x, w, h, R) {
  x.fillStyle = 'rgba(150,220,255,0.55)';
  for (let i = 0; i < 26; i++) x.fillRect(R() * w, R() * h, 20 + R() * 90, 2);
  x.strokeStyle = 'rgba(150,220,255,0.35)'; x.lineWidth = 2;
  x.strokeRect(12, 12, w - 24, h - 24);
}
const rngLite = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;

export const HOLO_ART = {
  brighter() {
    const w = 1024, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(7);
    bg(x, w, h); ui(x, w, h, R);
    face(x, 300, 250, 210);
    glowText(x, 'A BRIGHTER', 560, 190, 72, 300, 10);
    glowText(x, 'FUTURE', 560, 280, 72, 300, 10);
    glowText(x, 'TOGETHER', 560, 370, 72, 300, 10);
    x.fillStyle = 'rgba(160,225,255,0.7)'; x.fillRect(562, 400, 300, 3);
    glowText(x, 'CONCORD CIVIC TRUST', 562, 440, 22, 400, 6, '#9fd8ff');
    return c;
  },
  harmony() {
    const w = 512, h = 1024, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(3);
    bg(x, w, h, '#0e3868', '#06203e');
    glowText(x, 'HARMONY', w / 2, 110, 64, 400, 8, '#eaf8ff', 'center');
    glowText(x, 'THROUGH UNITY', w / 2, 170, 34, 300, 8, '#bfe8ff', 'center');
    emblem(x, w / 2, 380, 130);
    // landscape vignette: mountains + lake
    const sky = x.createLinearGradient(0, 560, 0, 1000); sky.addColorStop(0, '#a9d8ff'); sky.addColorStop(1, '#2d7cc4');
    x.fillStyle = sky; x.fillRect(30, 560, w - 60, 430);
    x.fillStyle = '#e8f4ff';
    x.beginPath(); x.moveTo(30, 820);
    for (let i = 0; i <= 12; i++) x.lineTo(30 + i * (w - 60) / 12, 820 - (i % 2 ? 180 + R() * 60 : 60 + R() * 60));
    x.lineTo(w - 30, 820); x.fill();
    x.fillStyle = '#3f8f6a'; x.fillRect(30, 800, w - 60, 40);
    x.fillStyle = '#4aa6e6'; x.fillRect(30, 840, w - 60, 150);
    x.strokeStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 14; i++) { x.beginPath(); const y = 860 + i * 9; x.moveTo(60 + R() * 200, y); x.lineTo(200 + R() * 250, y); x.stroke(); }
    ui(x, w, h, R);
    return c;
  },
  ad(title, sub, seed = 1, hue = '#0b2a52') {
    const w = 512, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(seed);
    bg(x, w, h, hue, '#030d1c'); ui(x, w, h, R);
    emblem(x, w / 2, 190, 95);
    glowText(x, title, w / 2, 370, 54, 400, 10, '#eaf8ff', 'center');
    glowText(x, sub, w / 2, 425, 22, 300, 5, '#9fd8ff', 'center');
    return c;
  },
  // Harmony's face, eyes open and looking straight out: the billboard takeover (world.billboards.show('harmony_face')).
  watching(w = 1024, h = 512, line = 'HARMONY IS WATCHING') {
    const c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(19);
    bg(x, w, h, '#0c3a70', '#020a18'); ui(x, w, h, R);
    const s = Math.min(w, h) * 0.36, cx = w / 2, cy = h * 0.47;
    x.save();
    const g = x.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.4);
    g.addColorStop(0, 'rgba(235,250,255,0.95)'); g.addColorStop(0.55, 'rgba(140,205,250,0.75)'); g.addColorStop(1, 'rgba(30,90,170,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(cx, cy, s * 0.62, s * 0.86, 0, 0, 7); x.fill();
    x.fillRect(cx - s * 0.3, cy + s * 0.6, s * 0.6, s * 0.6);
    x.strokeStyle = 'rgba(210,240,255,0.45)'; x.lineWidth = 2;
    for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(cx, cy, s * (0.68 + i * 0.07), s * (0.92 + i * 0.07), 0, 3.6, 5.8); x.stroke(); }
    for (const ex of [-1, 1]) {
      const px = cx + ex * s * 0.24, py = cy - s * 0.08;
      x.fillStyle = 'rgba(4,20,44,0.9)'; x.beginPath(); x.ellipse(px, py, s * 0.13, s * 0.055, 0, 0, 7); x.fill();
      x.shadowColor = '#9fe4ff'; x.shadowBlur = s * 0.12;
      x.fillStyle = '#dff6ff'; x.beginPath(); x.arc(px, py, s * 0.035, 0, 7); x.fill();
      x.shadowBlur = 0;
    }
    x.strokeStyle = 'rgba(4,20,44,0.6)'; x.lineWidth = s * 0.02;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - s * 0.03, cy + s * 0.22); x.lineTo(cx + s * 0.04, cy + s * 0.24); x.stroke();
    x.beginPath(); x.moveTo(cx - s * 0.12, cy + s * 0.42); x.quadraticCurveTo(cx, cy + s * 0.46, cx + s * 0.12, cy + s * 0.42); x.stroke();
    x.restore();
    let big = h * 0.08;
    x.font = `400 ${big}px ${FONT}`;
    const tw = x.measureText(line).width + line.length * big * 0.25;
    if (tw > w * 0.9) big *= w * 0.9 / tw;
    glowText(x, line, cx, h * 0.93, big, 400, big * 0.25, '#eaf8ff', 'center');
    return c;
  },
  // Portrait ad posters packed side by side (one texture, one draw for every street totem).
  posters() {
    const pw = 512, ph = 1024, list = ['brighter', 'harmony', 'hireframe', 'concord'];
    const c = makeCanvas(pw * list.length, ph), x = c.getContext('2d');
    list.forEach((k, i) => {
      x.save(); x.translate(i * pw, 0); x.beginPath(); x.rect(0, 0, pw, ph); x.clip();
      const R = rngLite(31 + i);
      if (k === 'brighter') {
        bg(x, pw, ph, '#0d3a6e', '#041426'); ui(x, pw, ph, R);
        face(x, 200, 420, 250);
        glowText(x, 'A BRIGHTER', pw / 2, 760, 58, 300, 8, '#eaf8ff', 'center');
        glowText(x, 'FUTURE', pw / 2, 830, 58, 300, 8, '#eaf8ff', 'center');
        glowText(x, 'TOGETHER', pw / 2, 900, 58, 300, 8, '#eaf8ff', 'center');
      } else if (k === 'harmony') {
        x.drawImage(HOLO_ART.harmony(), 0, 0, pw, ph);
      } else if (k === 'hireframe') {
        bg(x, pw, ph, '#4a2a08', '#120802'); ui(x, pw, ph, R);
        x.fillStyle = 'rgba(255,170,60,0.9)'; x.shadowColor = '#ffae40'; x.shadowBlur = 30;
        const bx = pw / 2, by = 300;
        x.fillRect(bx - 60, by - 150, 120, 90); x.fillRect(bx - 90, by - 50, 180, 170); x.fillRect(bx - 130, by - 40, 34, 150); x.fillRect(bx + 96, by - 40, 34, 150);
        x.fillRect(bx - 70, by + 130, 50, 180); x.fillRect(bx + 20, by + 130, 50, 180);
        x.fillStyle = '#1a0c02'; x.fillRect(bx - 40, by - 120, 80, 22); x.shadowBlur = 0;
        glowText(x, 'HIREFRAME', pw / 2, 740, 64, 600, 6, '#ffe2b0', 'center');
        glowText(x, 'RENT A BODY TODAY', pw / 2, 800, 28, 400, 5, '#ffc070', 'center');
        glowText(x, 'FROM 4 ₵ / HOUR', pw / 2, 880, 40, 300, 5, '#ffe9c8', 'center');
      } else {
        bg(x, pw, ph, '#0b2a52', '#030d1c'); ui(x, pw, ph, R);
        emblem(x, pw / 2, 360, 150);
        glowText(x, 'CONCORD', pw / 2, 700, 70, 400, 10, '#eaf8ff', 'center');
        glowText(x, 'YOUR PLACE', pw / 2, 790, 36, 300, 8, '#bfe8ff', 'center');
        glowText(x, 'IS PREPARED', pw / 2, 840, 36, 300, 8, '#bfe8ff', 'center');
      }
      x.restore();
    });
    return { canvas: c, count: list.length, keys: list };
  },
  sign(text, w = 1024, h = 160) {
    const c = makeCanvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#041a33'; x.fillRect(0, 0, w, h);
    glowText(x, text, w / 2, h * 0.68, h * 0.45, 400, 12, '#eaf8ff', 'center');
    return c;
  },
};

export function createHoloMaterial(canvas, { bright = 2.4, alpha = 0.92, tint = [0.8, 0.95, 1.1], time, cols = 1, side = THREE.DoubleSide } = {}) {
  const tex = canvasTexture(canvas);
  tex.anisotropy = 4;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      map: { value: null }, map2: { value: null }, uMix: { value: 0 }, uCols: { value: cols },
      uBright: { value: bright }, uAlpha: { value: alpha }, uTint: { value: new THREE.Vector3(...tint) }, uTime: { value: 0 },
    }]),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map, map2; uniform float uBright, uAlpha, uTime, uMix, uCols; uniform vec3 uTint;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vUv;
        float glitch = step(0.985, fract(sin(floor(uTime * 3.0) * 91.7) * 43758.5)) * step(abs(uv.y - fract(uTime * 0.37)), 0.03);
        uv.x += glitch * 0.01;
        vec3 c = texture2D( map, uv ).rgb;
        if ( uMix > 0.001 ) {
          // the takeover rolls in as a bright wipe from the top
          float w = smoothstep( uMix * 1.2 - 0.2, uMix * 1.2, 1.0 - vUv.y );
          c = mix( c, texture2D( map2, vec2( fract( vUv.x * uCols - 1e-4 ), vUv.y ) ).rgb, 1.0 - w ) + vec3( 0.5, 0.8, 1.0 ) * smoothstep( 0.04, 0.0, abs( 1.0 - vUv.y - uMix * 1.2 + 0.1 ) ) * step( uMix, 0.99 );
        }
        float scan = 0.86 + 0.14 * sin( vUv.y * 700.0 - uTime * 5.0 );
        float band = 1.0 + 0.35 * smoothstep( 0.06, 0.0, abs( fract( vUv.y * 0.6 - uTime * 0.07 ) - 0.5 ) );
        float ex = fract( vUv.x * uCols - 1e-4 );
        float edge = smoothstep( 0.0, 0.015, ex ) * smoothstep( 1.0, 0.985, ex ) * smoothstep( 0.0, 0.02, vUv.y ) * smoothstep( 1.0, 0.98, vUv.y );
        vec3 col = c * uTint * uBright * scan * band;
        float l = dot( c, vec3( 0.3, 0.5, 0.2 ) );
        gl_FragColor = vec4( col, uAlpha * edge * mix( 0.55, 1.0, smoothstep( 0.05, 0.4, l ) ) );
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side, fog: true,
  });
  m.uniforms.map.value = tex;
  m.uniforms.map2.value = tex;
  if (time) m.uniforms.uTime = time;
  return m;
}

// Billboards that can be taken over (story beats). Each registers its material + pixel aspect.
export function registerBillboard(ctx, material, w, h) {
  (ctx.billboards ||= []).push({ mat: material, w, h });
}

// world.billboards.show('harmony_face', { line, duration, fade }) → every registered billboard wipes to Harmony's face.
// show('default') (or show(null)) wipes back. `duration` (s) auto-restores. Returns the number of billboards switched.
export function createBillboards(ctx) {
  const cache = new Map();
  let target = 0, mix = 0, speed = 1, timer = 0, key = 'default';
  const art = (b, line) => {
    const k = `${b.w}x${b.h}|${line}`;
    if (!cache.has(k)) cache.set(k, canvasTexture(HOLO_ART.watching(b.w, b.h, line)));
    return cache.get(k);
  };
  ctx.updaters.push((dt) => {
    if (timer > 0 && (timer -= dt) <= 0) { target = 0; key = 'default'; }
    if (mix === target) return;
    mix = target > mix ? Math.min(target, mix + dt * speed) : Math.max(target, mix - dt * speed);
    for (const b of ctx.billboards) b.mat.uniforms.uMix.value = mix;
  });
  return {
    keys: ['default', 'harmony_face'],
    get current() { return key; },
    get list() { return ctx.billboards; },
    show(k = 'default', { line = 'HARMONY IS WATCHING', duration = 0, fade = 1.2 } = {}) {
      speed = 1 / Math.max(0.05, fade);
      timer = duration;
      if (!k || k === 'default') { target = 0; key = 'default'; return ctx.billboards.length; }
      for (const b of ctx.billboards) b.mat.uniforms.map2.value = art(b, line);
      target = 1; key = k;
      return ctx.billboards.length;
    },
  };
}

// A screen readable from both sides at any camera yaw: front-only material + a back copy turned 180°.
export function twoSided(mesh) {
  mesh.material.side = THREE.FrontSide;
  const back = mesh.clone();
  back.rotation.y += Math.PI;
  mesh.parent?.add(back);
  return back;
}

// Floating signs that turn (about Y) to face the camera, so the free camera never reads them mirrored.
export function faceCamera(ctx, mesh) { (ctx.faceCam ||= []).push(mesh); }
