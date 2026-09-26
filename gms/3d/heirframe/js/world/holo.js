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
  sign(text, w = 1024, h = 160) {
    const c = makeCanvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#041a33'; x.fillRect(0, 0, w, h);
    glowText(x, text, w / 2, h * 0.68, h * 0.45, 400, 12, '#eaf8ff', 'center');
    return c;
  },
};

export function createHoloMaterial(canvas, { bright = 2.4, alpha = 0.92, tint = [0.8, 0.95, 1.1], time } = {}) {
  const tex = canvasTexture(canvas);
  tex.anisotropy = 4;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      map: { value: null }, uBright: { value: bright }, uAlpha: { value: alpha }, uTint: { value: new THREE.Vector3(...tint) }, uTime: { value: 0 },
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
      uniform sampler2D map; uniform float uBright, uAlpha, uTime; uniform vec3 uTint;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vUv;
        float glitch = step(0.985, fract(sin(floor(uTime * 3.0) * 91.7) * 43758.5)) * step(abs(uv.y - fract(uTime * 0.37)), 0.03);
        uv.x += glitch * 0.01;
        vec3 c = texture2D( map, uv ).rgb;
        float scan = 0.86 + 0.14 * sin( vUv.y * 700.0 - uTime * 5.0 );
        float band = 1.0 + 0.35 * smoothstep( 0.06, 0.0, abs( fract( vUv.y * 0.6 - uTime * 0.07 ) - 0.5 ) );
        float edge = smoothstep( 0.0, 0.015, vUv.x ) * smoothstep( 1.0, 0.985, vUv.x ) * smoothstep( 0.0, 0.02, vUv.y ) * smoothstep( 1.0, 0.98, vUv.y );
        vec3 col = c * uTint * uBright * scan * band;
        float l = dot( c, vec3( 0.3, 0.5, 0.2 ) );
        gl_FragColor = vec4( col, uAlpha * edge * mix( 0.55, 1.0, smoothstep( 0.05, 0.4, l ) ) );
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  m.uniforms.map.value = tex;
  if (time) m.uniforms.uTime = time;
  return m;
}
