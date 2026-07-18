// world.js — a UUID walks in, a city walks out.
// Everything here is driven by spec (from genome.js) + labelled Rand streams.

import * as THREE from 'three';
import {
  billboardCanvas, quoteBillboardCanvas, signCanvas, posterCanvas,
  shopCanvas, toTexture, softSprite, makeCanvas, drawDataBoard,
  verticalSignCanvas, inspoPosterCanvas,
} from './canvastex.js';
import { INSPO } from './tables.js';

const CITY_R = 150;        // city plateau radius
const WORLD_R = 420;       // hard travel bound
const GRID = 36;           // road spacing
const ROAD_W = 9;

// seeded 2D value noise
function makeNoise(seed) {
  const h = (x, z) => {
    const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vn = (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z);
    const fx = x - ix, fz = z - iz;
    const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
    return (h(ix, iz) * (1 - ux) + h(ix + 1, iz) * ux) * (1 - uz)
         + (h(ix, iz + 1) * (1 - ux) + h(ix + 1, iz + 1) * ux) * uz;
  };
  return (x, z, oct = 4) => {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += a * vn(x * f, z * f); a *= 0.5; f *= 2.03; }
    return v;
  };
}

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// unit box, origin at base, vertical shade baked into vertex colours
function shadedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const b = 0.6 + 0.4 * pos.getY(i);
    col.push(b, b, b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function shadedCyl(rSeg = 12) {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, rSeg);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const b = 0.6 + 0.4 * pos.getY(i);
    col.push(b, b, b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
function shadedCone(rSeg = 4) {
  const g = new THREE.ConeGeometry(0.5, 1, rSeg);
  g.translate(0, 0.5, 0);
  const col = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const b = 0.65 + 0.35 * pos.getY(i);
    col.push(b, b, b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

// growable instanced bucket
class Bucket {
  constructor(scene, geo, mat, cap) {
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.n = 0; this.cap = cap;
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    scene.add(this.mesh);
  }
  add(x, y, z, sx, sy, sz, color, rotY = 0, rotX = 0, rotZ = 0) {
    if (this.n >= this.cap) return -1;
    this.e.set(rotX, rotY, rotZ);
    this.q.setFromEuler(this.e);
    this.m4.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(sx, sy, sz));
    this.mesh.setMatrixAt(this.n, this.m4);
    if (color !== undefined) this.mesh.setColorAt(this.n, new THREE.Color(color));
    this.mesh.count = ++this.n;
    return this.n - 1;
  }
  done() {
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = `
uniform vec3 uTop, uMid, uHor, uSunCol;
uniform vec3 uSunDir;
uniform float uStars, uDayness, uTime;
varying vec3 vDir;
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
vec2 h22(vec2 p){vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));q+=dot(q,q.yzx+33.33);return fract((q.xx+q.yz)*q.zy);}
float stars(vec2 st, float sc, float th){
  vec2 p = st * sc;
  vec2 i = floor(p), f = fract(p);
  vec2 o = h22(i);
  float d = length(f - .3 - .4 * o);
  float m = h12(i + 7.7);
  float b = smoothstep(th, 1., m);
  float tw = .72 + .28 * sin(uTime * (1. + 2.5 * m) + m * 44.);
  return b * tw * smoothstep(.09, .0, d);
}
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.25, y));
  col = mix(col, uTop, smoothstep(0.25, 0.85, y));
  col = mix(uHor, col, smoothstep(-0.1, 0.02, y));
  float s = dot(d, normalize(uSunDir));
  col += uSunCol * pow(max(s, 0.0), 900.0) * 3.0;      // disc
  col += uSunCol * pow(max(s, 0.0), 18.0) * 0.35;      // halo
  if (uStars > 0.01 && y > 0.02) {
    vec2 st = d.xz / (0.4 + y);
    float sf = uStars * (1.0 - uDayness) * smoothstep(0.02, 0.2, y);
    col += vec3(0.9, 0.92, 1.0) * stars(st, 22.0, 0.965) * sf;
    col += vec3(1.0) * stars(st, 40.0, 0.978) * sf * 0.7;
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const WATER_VERT = `
varying vec3 vWorld;
varying float vFogDepth;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const WATER_FRAG = `
uniform vec3 uShallow, uDeep, uFoam, uSunDir, uFogColor;
uniform float uTime, uFogDensity, uDayness;
varying vec3 vWorld;
varying float vFogDepth;
float h12(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){
  vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(h12(i),h12(i+vec2(1,0)),u.x),mix(h12(i+vec2(0,1)),h12(i+vec2(1,1)),u.x),u.y);
}
void main(){
  vec2 p = vWorld.xz * 0.08;
  float w1 = vn(p * 1.5 + vec2(uTime * 0.06, uTime * 0.04));
  float w2 = vn(p * 3.1 - vec2(uTime * 0.05, uTime * 0.07));
  float wave = w1 * 0.6 + w2 * 0.4;
  vec3 n = normalize(vec3((w1 - 0.5) * 0.4, 1.0, (w2 - 0.5) * 0.4));
  vec3 view = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(view, n), 0.0), 2.2);
  vec3 col = mix(uDeep, uShallow, 0.25 + wave * 0.5);
  col = mix(col, uShallow * 1.15, fres * 0.6);
  // sun glint
  vec3 r = reflect(-normalize(uSunDir), n);
  float glint = pow(max(dot(r, view), 0.0), 120.0);
  col += vec3(1.0, 0.95, 0.8) * glint * (0.5 + uDayness);
  // sparkle
  vec2 sp = vWorld.xz * 1.4;
  float tw = h12(floor(sp));
  float sparkle = step(0.985, tw) * (0.5 + 0.5 * sin(uTime * (2.0 + tw * 5.0) + tw * 40.0));
  col += uFoam * sparkle * 0.35 * (0.4 + uDayness * 0.6);
  float fogF = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  col = mix(col, uFogColor, clamp(fogF, 0.0, 1.0));
  gl_FragColor = vec4(col, 0.93);
}`;

// ── animated math display shader (uMode picks the pattern) ───────────────────
export const DISPLAY_MODES = ['plasma field', 'interference', 'lissajous', 'polar rose', 'the tunnel', 'digital rain'];
const DISPLAY_VERT = `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISPLAY_FRAG = `
uniform float uTime, uMode, uSeed;
uniform vec3 uColA, uColB;
varying vec2 vUv;
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float t = uTime;
  float v = 0.0;
  int m = int(uMode + 0.5);
  if (m == 0) {            // plasma
    v = sin(p.x*3.0+t) + sin(p.y*4.0-t*1.3) + sin((p.x+p.y)*3.5+t*0.7) + sin(length(p)*5.0-t*1.7);
    v = 0.5 + 0.5*sin(v*1.57);
  } else if (m == 1) {     // two-source interference (a moving moire)
    vec2 a = vec2(sin(t*0.3)*0.5, cos(t*0.23)*0.4);
    v = 0.5 + 0.5*sin(length(p-a)*26.0 - t*2.0) * sin(length(p+a)*26.0 + t*1.6);
    v = v*v;
  } else if (m == 2) {     // lissajous with a comet trail
    for (int i = 0; i < 22; i++) {
      float ft = t*0.9 - float(i)*0.055;
      vec2 q = vec2(sin(ft*(2.0+floor(uSeed*3.0))+1.0), sin(ft*3.0)) * 0.78;
      v += (0.028 * (1.0 - float(i)/22.0)) / max(0.012, length(p - q));
    }
    v = min(v, 1.4);
  } else if (m == 3) {     // polar rose, slowly turning
    float ang = atan(p.y, p.x);
    float rr = length(p);
    float k = 3.0 + floor(uSeed*3.0);
    float target = 0.75 * abs(cos(k*ang + t*0.5));
    v = smoothstep(0.10, 0.0, abs(rr - target)) + smoothstep(0.03, 0.0, abs(rr - target));
  } else if (m == 4) {     // log-polar tunnel
    float ang = atan(p.y, p.x);
    float rr = max(length(p), 1e-3);
    v = 0.5 + 0.5*sin(10.0*ang) * sin(14.0*log(rr) - t*3.0);
    v *= smoothstep(1.4, 0.4, rr);
  } else {                 // digital rain
    float col = floor(vUv.x*13.0);
    float speed = 1.5 + h21(vec2(col, 3.7))*3.0;
    float ph = fract(vUv.y + t*speed*0.13 + h21(vec2(col, 9.1)));
    float cell = h21(vec2(col, floor(vUv.y*22.0) + floor(t*speed*3.0)));
    v = step(0.35, cell) * pow(1.0 - ph, 2.4) * 1.5;
  }
  vec3 col3 = mix(uColA, uColB, clamp(v, 0.0, 1.0)) * clamp(v*1.3+0.05, 0.0, 1.6);
  col3 *= 0.88 + 0.12*sin(vUv.y*220.0);                       // scanlines
  col3 *= smoothstep(1.12, 0.75, abs(p.x)) * smoothstep(1.12, 0.75, abs(p.y)); // vignette
  gl_FragColor = vec4(col3, 1.0);
}`;

export class World {
  constructor(spec) {
    this.spec = spec;
    this.scene = new THREE.Scene();
    this.textures = [];
    this.pois = [];
    this.colliders = [];
    this.vehicles = [];
    this.animFns = [];
    this.buildings = [];

    this.noise = makeNoise(spec.rand('terrain-seed').float() * 100);

    this._layout();
    this._lights();
    this._sky();
    this._terrain();
    this._water();
    this._roadsAndCity();
    this._vehicles();
    this._nature();
    this._landmark();
    this._precip();
    this._pickPois();
  }

  tex(canvas) { const t = toTexture(canvas); this.textures.push(t); return t; }

  // ── layout: where the water is ─────────────────────────────────────────────
  _layout() {
    const { layout } = this.spec;
    const r = this.spec.rand('layout');
    const fam = layout.fam;
    this.plateauY = 6;
    this.waterY = 0;
    const dirA = r.float() * Math.PI * 2;
    const dir = new THREE.Vector2(Math.cos(dirA), Math.sin(dirA));
    const lakeA = r.float() * Math.PI * 2;
    const lakes = [
      new THREE.Vector2(Math.cos(lakeA) * 105, Math.sin(lakeA) * 105),
      new THREE.Vector2(Math.cos(lakeA + 2.4) * 130, Math.sin(lakeA + 2.4) * 130),
    ];
    const riverPh = r.float() * 9;
    const amp = { inland: 10, archi: 22, ridge: 14 }[fam] ?? 8;
    this.hasWater = fam !== 'inland';
    if (fam === 'archi') this.waterY = 3.4;
    if (fam === 'basin') this.waterY = 2.5;

    const coastDirs = { coastN: [0, -1], coastE: [1, 0], coastS: [0, 1], coastW: [-1, 0] };

    this.layoutH = (x, z) => {
      let h = this.noise(x * 0.004 + 7, z * 0.004 + 3) * amp;
      const rr = Math.hypot(x, z);
      if (coastDirs[fam] || fam === 'bay') {
        const d = coastDirs[fam] ? new THREE.Vector2(...coastDirs[fam]) : dir;
        const along = x * d.x + z * d.y;
        h -= Math.max(0, along - 70) * 0.22;
        if (fam === 'bay') {
          const perp = Math.abs(-x * d.y + z * d.x);
          h -= 16 * Math.exp(-((along - 40) ** 2) / 4000 - (perp ** 2) / 2600);
        }
      } else if (fam === 'island') {
        h -= Math.max(0, rr - 190) * 0.24;
      } else if (fam === 'lake' || fam === 'twin') {
        const n = fam === 'twin' ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const L = lakes[i];
          h -= 17 * Math.exp(-((x - L.x) ** 2 + (z - L.y) ** 2) / 3800);
        }
      } else if (fam === 'river') {
        const cx = Math.sin(z * 0.012 + riverPh) * 55 + dir.x * 30;
        h -= 15 * Math.exp(-((x - cx) ** 2) / 700);
      } else if (fam === 'archi') {
        h += this.noise(x * 0.006 + 31, z * 0.006 + 17) * 10 - 4;
      } else if (fam === 'basin') {
        h += Math.max(0, rr - 170) * 0.09 - 4 * Math.exp(-(rr ** 2) / 26000);
      } else if (fam === 'ridge') {
        const along = x * dir.x + z * dir.y;
        h += 65 * Math.exp(-((along - 210) ** 2) / 5200);
      }
      return h;
    };

    this.terrainH = (x, z) => {
      const base = this.layoutH(x, z) + 2;
      const rr = Math.hypot(x, z);
      const t = smoothstep(CITY_R + 40, CITY_R - 20, rr);
      return base * (1 - t) + this.plateauY * t;
    };
  }

  // ── lights & fog ───────────────────────────────────────────────────────────
  _lights() {
    const { sky, time, weather } = this.spec;
    const day = time.dayness;
    // sun elevation capped below vertical so walls always catch raking light
    const elY = Math.min(0.68, Math.max(0.1, Math.sin(Math.max(0.05, time.el) * Math.PI / 2)));
    const elXZ = Math.sqrt(1 - elY * elY);
    const sunDir = new THREE.Vector3(
      Math.cos(time.az) * elXZ, elY, Math.sin(time.az) * elXZ,
    ).normalize();
    this.sunDir = sunDir;

    const hemiC = new THREE.Color(sky.mid).lerp(new THREE.Color(0xffffff), 0.45);
    const hemi = new THREE.HemisphereLight(hemiC, 0x201a14, 0.35 + day * 0.55);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(sky.sun, 0.25 + day * 1.15);
    sun.position.copy(sunDir).multiplyScalar(300);
    this.scene.add(sun);
    const amb = new THREE.AmbientLight(0x8090b0, 0.12 + (1 - day) * 0.22);
    this.scene.add(amb);

    const horC = new THREE.Color(sky.hor);
    const grey = new THREE.Color(0x8d939c);
    const fogC = horC.clone().lerp(grey, weather.fog * 0.55).multiplyScalar(0.35 + day * 0.65);
    const hsl = {};
    fogC.getHSL(hsl);
    fogC.setHSL(hsl.h, hsl.s * 0.65, hsl.l); // fog shouldn't drench the scene in one hue
    this.fogColor = fogC;
    this.fogDensity = 0.0007 + weather.fog * weather.fog * 0.0075;
    this.scene.fog = new THREE.FogExp2(fogC, this.fogDensity);
    this.scene.background = fogC.clone();
  }

  // ── sky dome ───────────────────────────────────────────────────────────────
  _sky() {
    const { sky, time } = this.spec;
    const day = time.dayness;
    const dark = (c) => new THREE.Color(c).multiplyScalar(0.25 + day * 0.75);
    this.skyUniforms = {
      uTop: { value: dark(sky.top) }, uMid: { value: dark(sky.mid) },
      uHor: { value: dark(sky.hor) }, uSunCol: { value: new THREE.Color(sky.sun) },
      uSunDir: { value: this.sunDir }, uStars: { value: sky.stars },
      uDayness: { value: day }, uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(850, 24, 16), mat);
    this.scene.add(dome);
  }

  // ── terrain ────────────────────────────────────────────────────────────────
  _terrain() {
    const { nature } = this.spec;
    const SIZE = 1300, SEG = 100;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const grass = new THREE.Color(nature.grass);
    const sand = new THREE.Color(0xcdb98a);
    const rock = new THREE.Color(0x8a8580);
    const cTmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.terrainH(x, z);
      pos.setY(i, h);
      const n = this.noise(x * 0.02, z * 0.02, 3);
      cTmp.copy(grass).multiplyScalar(0.82 + n * 0.36);
      if (this.hasWater && h < this.waterY + 1.4) cTmp.lerp(sand, 0.85);
      else if (h > 26) cTmp.lerp(rock, smoothstep(26, 50, h));
      const rr = Math.hypot(x, z);
      if (rr < CITY_R + 6) cTmp.lerp(new THREE.Color(0x5c5e60), 0.55 * smoothstep(CITY_R + 6, CITY_R - 30, rr)); // paved core
      col[i * 3] = cTmp.r; col[i * 3 + 1] = cTmp.g; col[i * 3 + 2] = cTmp.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.scene.add(m);
  }

  // ── water ──────────────────────────────────────────────────────────────────
  _water() {
    if (!this.hasWater) return;
    const { water, time } = this.spec;
    this.waterUniforms = {
      uShallow: { value: new THREE.Color(water.shallow) },
      uDeep: { value: new THREE.Color(water.deep) },
      uFoam: { value: new THREE.Color(water.foam) },
      uSunDir: { value: this.sunDir },
      uTime: { value: 0 },
      uFogColor: { value: this.fogColor },
      uFogDensity: { value: this.fogDensity },
      uDayness: { value: time.dayness },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.waterUniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG,
      transparent: true,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = this.waterY;
    this.scene.add(m);
  }

  // ── roads, buildings, billboards, signs, shops ─────────────────────────────
  _roadsAndCity() {
    const { spec } = this;
    const r = spec.rand('city');
    const pal = spec.bldPal;

    // roads as one merged geometry
    const roadGeos = [];
    const half = GRID * 4; // grid spans -144..144
    for (let i = -4; i <= 4; i++) {
      const c = i * GRID;
      if (Math.abs(c) > CITY_R) continue;
      const len = 2 * Math.sqrt(Math.max(0, (CITY_R + 10) ** 2 - c * c));
      const gx = new THREE.PlaneGeometry(ROAD_W, len);
      gx.rotateX(-Math.PI / 2); gx.translate(c, this.plateauY + 0.04, 0);
      roadGeos.push(gx);
      const gz = new THREE.PlaneGeometry(len, ROAD_W);
      gz.rotateX(-Math.PI / 2); gz.translate(0, this.plateauY + 0.04, c);
      roadGeos.push(gz);
    }
    // lane dashes
    for (let i = -4; i <= 4; i++) {
      const c = i * GRID;
      if (Math.abs(c) > CITY_R) continue;
      for (let d = -CITY_R; d < CITY_R; d += 8) {
        if (Math.abs(d % GRID) < ROAD_W * 0.7) continue;
        const g1 = new THREE.PlaneGeometry(0.35, 3);
        g1.rotateX(-Math.PI / 2); g1.translate(c, this.plateauY + 0.06, d);
        roadGeos.push(g1);
        const g2 = new THREE.PlaneGeometry(3, 0.35);
        g2.rotateX(-Math.PI / 2); g2.translate(d, this.plateauY + 0.06, c);
        roadGeos.push(g2);
      }
    }
    const merged = mergeGeoms(roadGeos, [0x24262b, 0xd8d5c8]);
    this.scene.add(new THREE.Mesh(merged, new THREE.MeshLambertMaterial({ vertexColors: true })));

    // building buckets
    const lam = new THREE.MeshLambertMaterial({ vertexColors: true });
    const boxB = new Bucket(this.scene, shadedBox(), lam, 320);
    const cylB = new Bucket(this.scene, shadedCyl(), lam, 80);
    const coneB = new Bucket(this.scene, shadedCone(), lam.clone(), 120);

    // candidate cells (centres between roads)
    const cells = [];
    for (let ix = -4; ix < 4; ix++) for (let iz = -4; iz < 4; iz++) {
      const x = ix * GRID + GRID / 2, z = iz * GRID + GRID / 2;
      const rr = Math.hypot(x, z);
      if (rr > CITY_R - 8) continue;
      if (this.hasWater && this.terrainH(x, z) < this.waterY + 1) continue;
      cells.push({ x, z, rr });
    }
    const shuffled = r.shuffle(cells).sort((a, b) => (a.rr * (0.6 + r.float() * 0.8)) - (b.rr * (0.6 + r.float() * 0.8)));
    const used = shuffled.slice(0, Math.min(spec.bldCount, shuffled.length));
    const tallestCell = used.reduce((best, c) => (c.rr < best.rr ? c : best), used[0] ?? { x: 20, z: 20, rr: 28 });

    const FLOOR_H = 3;
    let tallest = null;
    const windows = [];
    for (const cell of used) {
      const isTallest = cell === tallestCell;
      const centerBias = 1 + (1 - cell.rr / (CITY_R + 1)) * 0.8;
      let floors = Math.max(2, Math.round(2 + Math.pow(r.float(), 1.7) * (spec.maxFloors - 2) * centerBias));
      floors = Math.min(floors, spec.maxFloors);
      if (isTallest) floors = spec.maxFloors + 2;
      const h = floors * FLOOR_H;
      const w = r.range(10, 22), d = r.range(10, 22);
      const x = cell.x + r.range(-3, 3), z = cell.z + r.range(-3, 3);
      const base = pal.bases[r.int(0, pal.bases.length - 1)];
      const fam = spec.arch.fam === 'mixed' ? r.pick(['blocks', 'setback', 'slab', 'cylinder', 'pyramid', 'spired']) : spec.arch.fam;
      const y = this.plateauY;

      if (fam === 'cylinder' && r.chance(0.55)) {
        const rad = Math.min(w, d) * 0.5;
        cylB.add(x, y, z, rad * 2, h, rad * 2, base);
        this.colliders.push({ x, z, r: rad + 1 });
        this.buildings.push({ x, z, w: rad * 2, d: rad * 2, h, round: true });
        windows.push({ x, z, rad, h, floors, round: true });
      } else if (fam === 'pyramid') {
        const steps = r.int(2, 4);
        for (let s = 0; s < steps; s++) {
          const f = 1 - s / steps;
          boxB.add(x, y + (h / steps) * s, z, w * f, h / steps, d * f, base);
          // windows hug each tier's real footprint (they floated off the steps before)
          windows.push({ x, z, w: w * f, d: d * f, h: h / steps, floors: Math.max(1, Math.floor(h / steps / 3)), y0: (h / steps) * s });
        }
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.6 });
        this.buildings.push({ x, z, w, d, h });
      } else if (fam === 'setback' && floors > 6) {
        const tiers = r.int(2, 3);
        let ty = y, th = h;
        for (let s = 0; s < tiers; s++) {
          const f = 1 - s * 0.28;
          const hh = th / (tiers - s * 0.4);
          boxB.add(x, ty, z, w * f, hh, d * f, base);
          windows.push({ x, z, w: w * f, d: d * f, h: hh, floors: Math.max(1, Math.floor(hh / 3)), y0: ty - y });
          ty += hh; th -= hh;
        }
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.62 });
        this.buildings.push({ x, z, w, d, h });
      } else if (fam === 'slab') {
        boxB.add(x, y, z, w * 1.25, FLOOR_H * 2, d * 1.25, pal.bases[0]); // podium
        boxB.add(x, y + FLOOR_H * 2, z, w * 0.6, h, d, base);
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.7 });
        this.buildings.push({ x, z, w, d, h: h + FLOOR_H * 2 });
        windows.push({ x, z, w: w * 0.6, d, h, floors, y0: FLOOR_H * 2 });
      } else if (fam === 'brutal') {
        boxB.add(x, y, z, w * 1.3, FLOOR_H * 1.6, d * 1.3, pal.bases[3]);
        boxB.add(x, y + FLOOR_H * 1.6, z, w * 0.85, h, d * 0.85, base);
        if (r.chance(0.5)) boxB.add(x, y + FLOOR_H * 1.6 + h, z, w * 1.05, FLOOR_H * 1.4, d * 1.05, pal.bases[1]);
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.72 });
        this.buildings.push({ x, z, w, d, h: h + FLOOR_H * 3 });
        windows.push({ x, z, w: w * 0.85, d: d * 0.85, h, floors, y0: FLOOR_H * 1.6 });
      } else {
        // blocks / glass / spired / fallback
        boxB.add(x, y, z, w, h, d, base);
        this.colliders.push({ x, z, r: Math.max(w, d) * 0.6 });
        this.buildings.push({ x, z, w, d, h });
        windows.push({ x, z, w, d, h, floors });
        if (fam === 'spired' || (isTallest && r.chance(0.7))) {
          coneB.add(x, y + h, z, 2.2, h * 0.3 + 6, 2.2, pal.accent);
        }
        if (fam === 'glass' && r.chance(0.6)) {
          boxB.add(x, y + h, z, w * 0.4, FLOOR_H, d * 0.4, pal.bases[1]); // roof box
        }
      }
      // roof clutter
      if (r.chance(0.4)) boxB.add(x + r.range(-w / 4, w / 4), y + (fam === 'pyramid' ? h : h + (fam === 'slab' || fam === 'brutal' ? FLOOR_H * 2 : 0)), z + r.range(-d / 4, d / 4), 2, 1.6, 2, 0x6a6a6a);
      if (isTallest) tallest = { x, z, h: h + (fam === 'slab' ? FLOOR_H * 2 : 0), w, d };
    }
    boxB.done(); cylB.done(); coneB.done();
    this.tallest = tallest ?? { x: 20, z: 20, h: 30, w: 12, d: 12 };

    // lit windows — one instanced mesh of glowing quads
    this._windows(windows);
    // arrival building: mid-height, near centre
    this._arrival(r);
    this._billboards(r);
    this._signs(r);
    this._shops(r);
    this._wallSigns();
    this._displays();
    this._lamps(r);
  }

  // road-facing facade of a building: returns outward unit direction
  _facade(b) {
    const gx = Math.round(b.x / GRID) * GRID, gz = Math.round(b.z / GRID) * GRID;
    const faceX = Math.abs(b.x - gx) > Math.abs(b.z - gz);
    const sx = faceX ? Math.sign(gx - b.x) || 1 : 0;
    const sz = faceX ? 0 : Math.sign(gz - b.z) || 1;
    return { sx, sz, faceX };
  }

  _windows(list) {
    const { spec } = this;
    const r = spec.rand('windows');
    const day = spec.time.dayness;
    const density = spec.lights.density * (spec.arch.fam === 'glass' ? 1.3 : 1) * (1 - day * 0.6);
    const glow = new THREE.Color(spec.bldPal.glow);
    const cool = new THREE.Color(0xbfd4e8);
    const quads = [];
    for (const b of list) {
      const y0 = this.plateauY + (b.y0 ?? 0);
      if (b.round) {
        // ring the cylinder: quads on the actual curved wall, facing outward
        const rr2 = b.rad + 0.08;
        const n = Math.max(4, Math.floor((Math.PI * 2 * b.rad) / 2.8));
        for (let f = 0; f < b.floors; f++) {
          const wy = y0 + f * 3 + 1.7;
          if (wy > y0 + b.h - 1) break;
          for (let k = 0; k < n; k++) {
            if (!r.chance(density)) continue;
            const a = ((k + 0.5) / n) * Math.PI * 2;
            quads.push([b.x + Math.cos(a) * rr2, wy, b.z + Math.sin(a) * rr2, Math.PI / 2 - a]);
          }
        }
        continue;
      }
      const cols = Math.max(1, Math.floor(b.w / 2.6));
      const colsD = Math.max(1, Math.floor(b.d / 2.6));
      for (let f = 0; f < b.floors; f++) {
        const wy = y0 + f * 3 + 1.7;
        if (wy > y0 + b.h - 1) break;
        for (let c = 0; c < cols; c++) {
          if (r.chance(density)) quads.push([b.x - b.w / 2 + (c + 0.5) * (b.w / cols), wy, b.z + b.d / 2 + 0.06, 0]);
          if (r.chance(density)) quads.push([b.x - b.w / 2 + (c + 0.5) * (b.w / cols), wy, b.z - b.d / 2 - 0.06, Math.PI]);
        }
        for (let c = 0; c < colsD; c++) {
          if (r.chance(density)) quads.push([b.x + b.w / 2 + 0.06, wy, b.z - b.d / 2 + (c + 0.5) * (b.d / colsD), Math.PI / 2]);
          if (r.chance(density)) quads.push([b.x - b.w / 2 - 0.06, wy, b.z - b.d / 2 + (c + 0.5) * (b.d / colsD), -Math.PI / 2]);
        }
      }
    }
    const capped = quads.length > 2400 ? r.shuffle(quads).slice(0, 2400) : quads;
    if (!capped.length) return;
    const bucket = new Bucket(this.scene, new THREE.PlaneGeometry(1.3, 1.5),
      new THREE.MeshBasicMaterial({}), capped.length);
    const cTmp = new THREE.Color();
    for (const [x, y, z, ry] of capped) {
      cTmp.copy(r.chance(spec.lights.warmth) ? glow : cool).multiplyScalar(0.55 + r.float() * 0.45 + day * 0.1);
      bucket.add(x, y - 0.75, z, 1, 1, 1, cTmp.getHex(), ry);
    }
    bucket.done();
    this.windowBucket = bucket;
  }

  _arrival(r) {
    // the building the flythrough descends into — pick mid-height near centre
    const cands = this.buildings.filter(b => b.h > 12 && b.h < 60 && Math.hypot(b.x, b.z) < 90);
    const b = cands.length ? cands[r.int(0, cands.length - 1)] : this.buildings[0] ?? { x: 18, z: 18, w: 12, d: 12, h: 20 };
    // door faces the nearest road axis
    const gx = Math.round(b.x / GRID) * GRID, gz = Math.round(b.z / GRID) * GRID;
    const faceX = Math.abs(b.x - gx) > Math.abs(b.z - gz);
    const sx = faceX ? Math.sign(gx - b.x) || 1 : 0;
    const sz = faceX ? 0 : Math.sign(gz - b.z) || 1;
    const door = new THREE.Vector3(b.x + sx * (b.w / 2 + 0.2), this.plateauY, b.z + sz * (b.d / 2 + 0.2));
    this.arrival = {
      building: b,
      roof: new THREE.Vector3(b.x, this.plateauY + b.h + 16, b.z),
      door,
      out: new THREE.Vector3(sx, 0, sz),
    };
    // glowing doorway — "you'll know it"
    const doorMat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.4), doorMat);
    frame.position.copy(door).add(new THREE.Vector3(sx * 0.15, 1.7, sz * 0.15));
    frame.rotation.y = Math.atan2(sx, sz);
    this.scene.add(frame);
    this.doorGlow = doorMat;
    this.doorMesh = frame;   // tappable: leads back to the room
    const glowTex = this.tex(softSprite(64, 'rgba(159,232,255,0.8)', 'rgba(159,232,255,0)'));
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false }));
    spr.scale.set(8, 8, 1);
    spr.position.copy(frame.position);
    this.scene.add(spr);
  }

  _billboards(r2) {
    const { spec } = this;
    const r = spec.rand('billboards');
    const set = spec.billboards;
    const count = r.int(4, 7);
    const msgs = r.shuffle(set.fam.msgs);
    const quoteIdx = r.int(0, count - 1); // one billboard carries the wall quote
    this.billboardPois = [];
    for (let i = 0; i < count; i++) {
      const onRoof = r.chance(0.5) && this.buildings.length > 3;
      let x, z, y, ry;
      if (onRoof) {
        const b = this.buildings[r.int(0, this.buildings.length - 1)];
        x = b.x; z = b.z; y = this.plateauY + b.h;
        ry = r.float() * Math.PI * 2;
      } else {
        const a = r.float() * Math.PI * 2;
        const rr = CITY_R + r.range(6, 30);
        x = Math.cos(a) * rr; z = Math.sin(a) * rr;
        y = this.terrainH(x, z);
        if (this.hasWater && y < this.waterY + 0.5) { y = this.waterY + 0.5; }
        ry = Math.atan2(-x, -z) + Math.PI; // face the city
      }
      const canvas = i === quoteIdx
        ? quoteBillboardCanvas(spec.quote, set.hue)
        : billboardCanvas(msgs[i % msgs.length], set.fam.name, (set.hue + i * 23) % 360, r);
      const tex = this.tex(canvas);
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 6.5),
        new THREE.MeshBasicMaterial({ map: tex }),
      );
      panel.userData.bb = i === quoteIdx
        ? { quote: true }
        : { famId: set.fam.id, famName: set.fam.name, msg: msgs[i % msgs.length] };
      (this.billboardMeshes ??= []).push(panel);
      const g = new THREE.Group();
      panel.position.y = 5.4;
      const legMat = new THREE.MeshLambertMaterial({ color: 0x3a3d42 });
      for (const lx of [-5, 5]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 5.6, 0.4), legMat);
        leg.position.set(lx, 2.4, -0.2);
        g.add(leg);
      }
      const back = new THREE.Mesh(new THREE.PlaneGeometry(13, 6.5), new THREE.MeshLambertMaterial({ color: 0x2a2c30 }));
      back.rotation.y = Math.PI; back.position.set(0, 5.4, -0.05);
      g.add(panel, back);
      g.position.set(x, y, z);
      g.rotation.y = ry;
      this.scene.add(g);
      const front = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
      this.billboardPois.push({
        // close enough to read — the tour lingers at pois
        pos: new THREE.Vector3(x, y + 6, z).add(front.clone().multiplyScalar(19)),
        look: new THREE.Vector3(x, y + 5, z),
        name: i === quoteIdx ? 'the quote' : 'a billboard', kind: 'billboard',
      });
    }
  }

  _signs(r2) {
    const { spec } = this;
    const r = spec.rand('signs');
    const theme = spec.signs;
    const msgs = r.shuffle(theme.fam.msgs);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x55585e });
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 3.2, 6);
    let k = 0;
    for (let i = -3; i <= 3 && k < 10; i++) {
      for (let j = -3; j <= 3 && k < 10; j++) {
        if (!r.chance(0.24)) continue;
        const x = i * GRID + ROAD_W / 2 + 1.2, z = j * GRID + ROAD_W / 2 + 1.2;
        if (Math.hypot(x, z) > CITY_R - 10) continue;
        const g = new THREE.Group();
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.y = 1.6;
        const tex = this.tex(signCanvas(msgs[k % msgs.length], theme));
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
        panel.position.y = 3.1;
        g.add(pole, panel);
        g.position.set(x, this.plateauY, z);
        g.rotation.y = r.float() * Math.PI * 2;
        this.scene.add(g);
        if (k === 0) this.signPoi = { pos: new THREE.Vector3(x + 6, this.plateauY + 3, z + 6), look: new THREE.Vector3(x, this.plateauY + 2.6, z), name: 'street level', kind: 'sign' };
        k++;
      }
    }
  }

  _shops(r2) {
    const { spec } = this;
    const r = spec.rand('shops');
    const theme = spec.shops;
    const names = r.shuffle(theme.names);
    let placed = 0;
    for (const b of this.buildings) {
      if (placed >= Math.min(8, names.length)) break;
      if (Math.hypot(b.x, b.z) > 100 || b.round) continue;
      if (!r.chance(0.5)) continue;
      const gx = Math.round(b.x / GRID) * GRID, gz = Math.round(b.z / GRID) * GRID;
      const faceX = Math.abs(b.x - gx) > Math.abs(b.z - gz);
      const sx = faceX ? Math.sign(gx - b.x) || 1 : 0;
      const sz = faceX ? 0 : Math.sign(gz - b.z) || 1;
      const tex = this.tex(shopCanvas(names[placed], { ...theme, hue: (theme.hue + placed * 37) % 360 }));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: tex }));
      sign.position.set(b.x + sx * (b.w / 2 + 0.12), this.plateauY + 3.4, b.z + sz * (b.d / 2 + 0.12));
      sign.rotation.y = Math.atan2(sx, sz);
      this.scene.add(sign);
      placed++;
    }
    // a couple of wall posters near the plaza
    const pr = spec.rand('wall-posters');
    let posters = 0;
    for (const b of this.buildings) {
      if (posters >= 2) break;
      if (Math.hypot(b.x, b.z) > 80 || b.round) continue;
      const tex = this.tex(posterCanvas(spec.posterSet, pr, spec.uuid));
      const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.3), new THREE.MeshLambertMaterial({ map: tex }));
      const side = pr.chance(0.5) ? 1 : -1;
      p.position.set(b.x + side * (b.w / 2 + 0.1), this.plateauY + 2.6, b.z + pr.range(-b.d / 3, b.d / 3));
      p.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.scene.add(p);
      posters++;
    }
  }

  // ── signs mounted ON buildings + vertical banners + the live data board ────
  _wallSigns() {
    const { spec } = this;
    const r = spec.rand('wall-signs');
    const theme = spec.signs;
    const msgs = r.shuffle(theme.fam.msgs.slice());
    // horizontal wall signs, a few shared textures
    const texPool = [];
    for (let i = 0; i < 4; i++) texPool.push(this.tex(signCanvas(msgs[i % msgs.length], theme)));
    let mounted = 0;
    for (const b of this.buildings) {
      if (mounted >= 7) break;
      if (b.round || b.h < 10 || Math.hypot(b.x, b.z) > 120) continue;
      if (!r.chance(0.4)) continue;
      const { sx, sz } = this._facade(b);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
        new THREE.MeshBasicMaterial({ map: texPool[mounted % texPool.length] }));
      m.position.set(
        b.x + sx * (b.w / 2 + 0.14),
        this.plateauY + r.range(6, Math.max(7, Math.min(b.h - 3, 20))),
        b.z + sz * (b.d / 2 + 0.14),
      );
      m.rotation.y = Math.atan2(sx, sz);
      this.scene.add(m);
      mounted++;
    }
    // vertical neon banners down tall facades
    let banners = 0;
    for (const b of this.buildings) {
      if (banners >= 3) break;
      if (b.round || b.h < 22 || Math.hypot(b.x, b.z) > 100) continue;
      if (!r.chance(0.45)) continue;
      const { sx, sz } = this._facade(b);
      const name = spec.shops.names[(banners + 3) % spec.shops.names.length];
      const tex = this.tex(verticalSignCanvas(name, (spec.shops.hue + banners * 60) % 360, spec.shops.neon));
      const bh = Math.min(b.h * 0.6, 16);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bh * 0.21, bh), new THREE.MeshBasicMaterial({ map: tex }));
      // hang it off a corner of the road-facing facade
      const lateral = r.pick([-1, 1]) * ((sx ? b.d : b.w) / 2 - 1.2);
      m.position.set(
        b.x + sx * (b.w / 2 + 0.15) + (sx ? 0 : lateral),
        this.plateauY + bh / 2 + 3,
        b.z + sz * (b.d / 2 + 0.15) + (sz ? 0 : lateral),
      );
      m.rotation.y = Math.atan2(sx, sz);
      this.scene.add(m);
      banners++;
    }
    // one inspirational poster out in the city (its siblings hang in the room)
    const ib = this.buildings.find((b) => !b.round && Math.hypot(b.x, b.z) < 90);
    if (ib) {
      const entry = INSPO[r.int(0, INSPO.length - 1)];
      const tex = this.tex(inspoPosterCanvas(entry, spec.posterSet.hue, r));
      const { sx, sz } = this._facade(ib);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.25), new THREE.MeshLambertMaterial({ map: tex }));
      m.position.set(ib.x + sx * (ib.w / 2 + 0.1), this.plateauY + 3, ib.z + sz * (ib.d / 2 + 0.1));
      m.rotation.y = Math.atan2(sx, sz);
      this.scene.add(m);
    }
    // the data board: live time + this world's temperature
    const cand = this.buildings.find((b) => !b.round && b.h > 18 && Math.hypot(b.x, b.z) < 90);
    if (cand) {
      const { sx, sz } = this._facade(cand);
      const canvas = makeCanvas(512, 160);
      const temp = this._temperature();
      drawDataBoard(canvas, spec, temp);
      const tex = this.tex(canvas);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.1), new THREE.MeshBasicMaterial({ map: tex }));
      m.position.set(cand.x + sx * (cand.w / 2 + 0.16), this.plateauY + Math.min(cand.h - 3, 14), cand.z + sz * (cand.d / 2 + 0.16));
      m.rotation.y = Math.atan2(sx, sz);
      this.scene.add(m);
      this.dataBoard = { canvas, tex, temp, acc: 0 };
    }
  }

  // temperature is part of the genome too: weather + time of day
  _temperature() {
    const { weather, time } = this.spec;
    const precip = weather.precip === 2 ? -26 : weather.precip === 1 ? -7 : 0;
    return Math.round(24 - weather.fog * 8 + precip + (time.dayness - 0.5) * 8);
  }

  // ── animated math displays: shader screens on facades, tap to change mode ──
  _displays() {
    const { spec } = this;
    const r = spec.rand('displays');
    this.displays = [];
    const cands = this.buildings.filter((b) => !b.round && b.h > 15 && Math.hypot(b.x, b.z) < 110);
    const picked = r.shuffle(cands.slice()).slice(0, Math.min(cands.length, 2 + r.int(0, 1)));
    for (const b of picked) {
      const { sx, sz, faceX } = this._facade(b);
      const W = Math.max(6, Math.min((faceX ? b.d : b.w) * 0.85, 15));
      const H = W * 0.62;
      const hue = (spec.billboards.hue + this.displays.length * 90) % 360;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMode: { value: r.int(0, DISPLAY_MODES.length - 1) },
          uSeed: { value: r.float() },
          uColA: { value: new THREE.Color().setHSL(hue / 360, 0.8, 0.06) },
          uColB: { value: new THREE.Color().setHSL(((hue + 40) % 360) / 360, 0.9, 0.62) },
        },
        vertexShader: DISPLAY_VERT, fragmentShader: DISPLAY_FRAG, fog: false,
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
      m.position.set(
        b.x + sx * (b.w / 2 + 0.18),
        this.plateauY + Math.max(H / 2 + 2, Math.min(b.h - H / 2 - 1, 9 + H / 2)),
        b.z + sz * (b.d / 2 + 0.18),
      );
      m.rotation.y = Math.atan2(sx, sz);
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(W + 1, H + 1), new THREE.MeshLambertMaterial({ color: 0x14161a }));
      frame.position.copy(m.position).addScaledVector(new THREE.Vector3(sx, 0, sz), -0.06);
      frame.rotation.y = m.rotation.y;
      this.scene.add(frame, m);
      m.userData.display = { mat, idx: this.displays.length };
      this.displays.push({ mesh: m, mat, out: new THREE.Vector3(sx, 0, sz) });
    }
    if (this.displays.length) {
      const d = this.displays[0];
      this.displayPoi = {
        pos: d.mesh.position.clone().addScaledVector(d.out, 17).add(new THREE.Vector3(0, 1.5, 0)),
        look: d.mesh.position.clone(),
        name: 'the big screen', kind: 'display',
      };
    }
  }

  // cycle a tapped display to its next pattern; returns the new pattern name
  cycleDisplay(mesh) {
    const d = mesh.userData.display;
    if (!d) return null;
    d.mat.uniforms.uMode.value = (d.mat.uniforms.uMode.value + 1) % DISPLAY_MODES.length;
    return DISPLAY_MODES[d.mat.uniforms.uMode.value];
  }

  _lamps(r2) {
    const r = this.spec.rand('lamps');
    const day = this.spec.time.dayness;
    const poleB = new Bucket(this.scene, shadedCyl(6), new THREE.MeshLambertMaterial({ vertexColors: true }), 80);
    const glowGeo = new THREE.SphereGeometry(0.28, 8, 6);
    const glowB = new Bucket(this.scene, glowGeo, new THREE.MeshBasicMaterial({}), 80);
    const lampC = new THREE.Color(0xffd9a0).multiplyScalar(0.4 + (1 - day) * 0.6);
    for (let d = -CITY_R + 12; d < CITY_R; d += 26) {
      for (const [x, z] of [[d, ROAD_W / 2 + 0.8], [d, -ROAD_W / 2 - 0.8], [ROAD_W / 2 + 0.8, d], [-ROAD_W / 2 - 0.8, d]]) {
        if (Math.hypot(x, z) > CITY_R - 6 || !r.chance(0.7)) continue;
        poleB.add(x, this.plateauY, z, 0.16, 4.4, 0.16, 0x4a4d52);
        glowB.add(x, this.plateauY + 4.5, z, 1, 1, 1, lampC.getHex());
      }
    }
    poleB.done(); glowB.done();
  }

  // ── vehicles ───────────────────────────────────────────────────────────────
  _vehicles() {
    const { spec } = this;
    if (spec.vehCount === 0) return;
    const r = spec.rand('vehicles');
    const pal = spec.vehPal;
    // one merged car geometry; body verts white (tinted per instance), trims dark
    const parts = [];
    const paint = (g, bright) => {
      const col = [];
      for (let i = 0; i < g.attributes.position.count; i++) col.push(bright, bright, bright);
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const body = paint(new THREE.BoxGeometry(1.9, 0.85, 4.2), 1); body.translate(0, 0.85, 0);
    const cabin = paint(new THREE.BoxGeometry(1.7, 0.72, 2.1), 0.28); cabin.translate(0, 1.55, -0.2);
    parts.push(body, cabin);
    for (const [wx, wz] of [[-0.95, 1.35], [0.95, 1.35], [-0.95, -1.35], [0.95, -1.35]]) {
      const w = paint(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), 0.12);
      w.rotateZ(Math.PI / 2); w.translate(wx, 0.42, wz);
      parts.push(w);
    }
    const lightL = paint(new THREE.BoxGeometry(0.34, 0.2, 0.06), 2.2); lightL.translate(-0.6, 0.95, 2.12);
    const lightR = paint(new THREE.BoxGeometry(0.34, 0.2, 0.06), 2.2); lightR.translate(0.6, 0.95, 2.12);
    parts.push(lightL, lightR);
    const carGeo = mergeGeomsRaw(parts);
    const carMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.carBucket = new Bucket(this.scene, carGeo, carMat, spec.vehCount);

    // the driving loop: rectangle on the ring road at ±GRID*2, lane offset
    const L = GRID * 2 + 3.2;
    const loop = [
      new THREE.Vector3(-L, 0, -L), new THREE.Vector3(L, 0, -L),
      new THREE.Vector3(L, 0, L), new THREE.Vector3(-L, 0, L),
    ];
    const perim = 8 * L;
    for (let i = 0; i < spec.vehCount; i++) {
      const color = pal.colors[i % pal.colors.length];
      const parked = r.chance(0.4);
      let v;
      if (parked) {
        const along = r.range(-CITY_R + 20, CITY_R - 20);
        const lane = r.pick([-1, 1]) * (ROAD_W / 2 - 1.4);
        const axis = r.chance(0.5);
        const road = r.pick([-2, -1, 0, 1, 2]) * GRID;
        const x = axis ? along : road + lane, z = axis ? road + lane : along;
        v = { x, z, yaw: axis ? Math.PI / 2 : 0, speed: 0, parked: true, color, s: 0 };
      } else {
        v = { s: r.float() * perim, speed: r.range(7, 13), parked: false, color, x: 0, z: 0, yaw: 0 };
      }
      v.idx = this.carBucket.add(0, this.plateauY, 0, 1, 1, 1, color);
      this.vehicles.push(v);
      this._placeVehicle(v, 0, perim, L);
    }
    this.carBucket.done();
    this.carLoop = { perim, L };
  }

  _placeVehicle(v, dt, perim, L) {
    if (!v.parked && !v.driven) {
      v.s = (v.s + v.speed * dt) % perim;
      const s = v.s;
      const side = Math.floor(s / (2 * L));
      const t = s % (2 * L) - L;
      if (side === 0) { v.x = t; v.z = -L; v.yaw = Math.PI / 2; }
      else if (side === 1) { v.x = L; v.z = t; v.yaw = 0; }
      else if (side === 2) { v.x = -t; v.z = L; v.yaw = -Math.PI / 2; }
      else { v.x = -L; v.z = -t; v.yaw = Math.PI; }
    }
    const m4 = new THREE.Matrix4();
    m4.compose(
      new THREE.Vector3(v.x, this.plateauY + (v.bounce ?? 0), v.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, v.yaw, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    this.carBucket.mesh.setMatrixAt(v.idx, m4);
  }

  // pick a vehicle near a world-space ray (for tap-to-drive)
  vehicleAt(ray) {
    let best = null, bd = 6;
    const p = new THREE.Vector3();
    for (const v of this.vehicles) {
      p.set(v.x, this.plateauY + 1, v.z);
      const d = ray.distanceToPoint(p);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  // ── trees & parks ──────────────────────────────────────────────────────────
  _nature() {
    const { spec } = this;
    const r = spec.rand('nature');
    const th = spec.nature;
    const trunkB = new Bucket(this.scene, shadedCyl(6), new THREE.MeshLambertMaterial({ vertexColors: true }), 180);
    let folGeo;
    if (th.shape === 'cone') folGeo = new THREE.ConeGeometry(1, 2.4, 7);
    else if (th.shape === 'round') folGeo = new THREE.IcosahedronGeometry(1.15, 0);
    else if (th.shape === 'palm') { folGeo = new THREE.ConeGeometry(1.5, 0.7, 6); }
    else if (th.shape === 'crystal') folGeo = new THREE.OctahedronGeometry(1.1, 0);
    else folGeo = new THREE.ConeGeometry(0.25, 1.8, 5); // dead: bare spikes
    folGeo.translate(0, th.shape === 'palm' ? 0.3 : 1, 0);
    const folMat = th.shape === 'crystal'
      ? new THREE.MeshLambertMaterial({ emissive: new THREE.Color(th.foliage[0]).multiplyScalar(0.4) })
      : new THREE.MeshLambertMaterial({});
    const folB = new Bucket(this.scene, folGeo, folMat, 180);
    let placed = 0;
    for (let tries = 0; tries < 700 && placed < 150; tries++) {
      const a = r.float() * Math.PI * 2;
      const rr = r.range(CITY_R + 8, 360);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const h = this.terrainH(x, z);
      if (this.hasWater && h < this.waterY + 1.2) continue;
      if (h > 34) continue;
      const s = r.range(0.8, 1.9);
      trunkB.add(x, h - 0.3, z, 0.3 * s, (th.shape === 'palm' ? 3.4 : 1.6) * s, 0.3 * s, th.trunk);
      folB.add(x, h - 0.3 + (th.shape === 'palm' ? 3.2 : 1.3) * s, z, s * 1.6, s * 1.6, s * 1.6, th.foliage[r.int(0, 2)], r.float() * Math.PI);
      placed++;
    }
    trunkB.done(); folB.done();
  }

  // ── landmark ───────────────────────────────────────────────────────────────
  _landmark() {
    const { spec } = this;
    const lm = spec.landmark;
    if (lm.fam === 'none') return;
    const r = spec.rand('landmark');
    const a = r.float() * Math.PI * 2;
    let rr = CITY_R + r.range(40, 90);
    let x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    let y = this.terrainH(x, z);
    if (this.hasWater && y < this.waterY + 0.5) {
      if (lm.fam === 'lighthouse' || lm.fam === 'crane') y = this.waterY; // those love water
      else { x *= 0.6; z *= 0.6; y = this.terrainH(x, z); }
    }
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const mat = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e ? new THREE.Color(e) : 0x000000 });
    const scale = 1 + lm.v * 0.25;

    if (lm.fam === 'obelisk') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4, 46 * scale, 4), mat(0x9a938a));
      m.position.y = 23 * scale; g.add(m);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 4), mat(0xd8c88a, 0x554410));
      tip.position.y = 46 * scale + 3; g.add(tip);
    } else if (lm.fam === 'mast') {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 70 * scale, 8), mat(0xb8442e));
      m.position.y = 35 * scale; g.add(m);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
      beacon.position.y = 70 * scale + 1; g.add(beacon);
      this.animFns.push((t) => { beacon.material.color.setScalar(0); beacon.material.color.setHex(Math.sin(t * 3) > 0 ? 0xff3020 : 0x551511); });
    } else if (lm.fam === 'ferris') {
      const R = 22 * scale;
      const wheel = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.7, 8, 40), mat(0xd8d0c0));
      wheel.add(ring);
      for (let i = 0; i < 8; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.5, R * 2, 0.5), mat(0xb0a890));
        spoke.rotation.z = (i / 8) * Math.PI;
        wheel.add(spoke);
      }
      const cabins = [];
      for (let i = 0; i < 10; i++) {
        const c = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 2.4), mat(spec.vehPal.colors[i % spec.vehPal.colors.length]));
        wheel.add(c); cabins.push(c);
      }
      wheel.position.y = R + 6;
      for (const lx of [-3, 3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, R + 8, 1.2), mat(0x8a8478));
        leg.position.set(lx, (R + 6) / 2, 0);
        leg.rotation.z = lx > 0 ? -0.18 : 0.18;
        g.add(leg);
      }
      g.add(wheel);
      this.animFns.push((t) => {
        wheel.rotation.z = t * 0.12;
        for (let i = 0; i < cabins.length; i++) {
          const ang = t * 0.12 + (i / cabins.length) * Math.PI * 2;
          cabins[i].position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0);
          cabins[i].rotation.z = -t * 0.12; // cabins stay upright
        }
      });
    } else if (lm.fam === 'turbines') {
      for (let i = 0; i < 3 + lm.v; i++) {
        const tx = r.range(-40, 40), tz = r.range(-40, 40);
        const ty = this.terrainH(x + tx, z + tz) - y;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.1, 26, 8), mat(0xe8e4da));
        tower.position.set(tx, ty + 13, tz);
        const rotor = new THREE.Group();
        for (let b = 0; b < 3; b++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.7, 11, 0.25), mat(0xf2efe6));
          blade.position.y = 5.5;
          const holder = new THREE.Group();
          holder.rotation.z = (b / 3) * Math.PI * 2;
          holder.add(blade); rotor.add(holder);
        }
        rotor.position.set(tx, ty + 26, tz + 1);
        g.add(tower, rotor);
        const ph = r.float() * 9, sp = r.range(0.8, 1.6);
        this.animFns.push((t) => { rotor.rotation.z = t * sp + ph; });
      }
    } else if (lm.fam === 'watertower') {
      for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 18, 6), mat(0x7a7268));
        leg.position.set(lx, 9, lz); g.add(leg);
      }
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(7 * scale, 7 * scale, 9, 14), mat(0xc8b088));
      tank.position.y = 22; g.add(tank);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(7.4 * scale, 4, 14), mat(0xa08860));
      cap.position.y = 28.5; g.add(cap);
    } else if (lm.fam === 'colossus') {
      const c = mat(0x8a949e);
      const mk = (w, h, d, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), c); m.position.set(px, py, pz); g.add(m); return m; };
      const S = 2.2 * scale;
      mk(3 * S, 12 * S, 3 * S, -2 * S, 6 * S, 0); mk(3 * S, 12 * S, 3 * S, 2 * S, 6 * S, 0); // legs
      mk(8 * S, 9 * S, 4 * S, 0, 16 * S, 0);  // torso
      mk(3.4 * S, 3.4 * S, 3.4 * S, 0, 22.4 * S, 0); // head
      mk(2 * S, 9 * S, 2 * S, -5.6 * S, 15 * S, 0); // arm down
      const arm = mk(2 * S, 9 * S, 2 * S, 5.6 * S, 21 * S, 0); // arm raised
      const orb = new THREE.Mesh(new THREE.SphereGeometry(1.8 * S, 10, 8), new THREE.MeshBasicMaterial({ color: 0xaef0ff }));
      orb.position.set(5.6 * S, 26.5 * S, 0); g.add(orb);
      this.animFns.push((t) => { orb.material.color.setHSL(0.52, 0.9, 0.6 + Math.sin(t * 1.4) * 0.2); });
      g.rotation.y = Math.atan2(-x, -z); // faces the city
    } else if (lm.fam === 'arch') {
      const R = 24 * scale;
      for (let i = 0; i <= 10; i++) {
        const th = (i / 10) * Math.PI;
        const m = new THREE.Mesh(new THREE.BoxGeometry(4, 4.4, 4), mat(0xc0b8a8));
        m.position.set(Math.cos(th) * R, Math.sin(th) * R + 1, 0);
        m.rotation.z = th;
        g.add(m);
      }
      g.rotation.y = r.float() * Math.PI;
    } else if (lm.fam === 'dome') {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(16 * scale, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xd8c8a8));
      g.add(dome);
      const slit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 16 * scale, 1.2), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
      slit.position.y = 8 * scale; g.add(slit);
    } else if (lm.fam === 'crane') {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 40, 2.2), mat(0xd8a020));
      tower.position.y = 20; g.add(tower);
      const jib = new THREE.Group();
      const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 1.6), mat(0xd8a020));
      arm.position.x = 12; jib.add(arm);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 2.6), mat(0x8a6a18));
      counter.position.x = -6; jib.add(counter);
      const cable = new THREE.Mesh(new THREE.BoxGeometry(0.12, 14, 0.12), mat(0x333333));
      cable.position.set(24, -7, 0); jib.add(cable);
      const hook = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), mat(0x777777));
      hook.position.set(24, -15, 0); jib.add(hook);
      jib.position.y = 40;
      g.add(jib);
      this.animFns.push((t) => { jib.rotation.y = Math.sin(t * 0.11) * 1.2; });
    } else if (lm.fam === 'dish') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.4, 8, 10), mat(0x9a948a));
      base.position.y = 4; g.add(base);
      const dishG = new THREE.Group();
      const dish = new THREE.Mesh(new THREE.SphereGeometry(13 * scale, 18, 8, 0, Math.PI * 2, 0, Math.PI / 3.2), mat(0xe0dcd0));
      dish.rotation.x = Math.PI; // bowl up
      dishG.add(dish);
      dishG.position.y = 10;
      dishG.rotation.x = -0.7;
      g.add(dishG);
      this.animFns.push((t) => { dishG.rotation.y = t * 0.05; });
    } else if (lm.fam === 'lighthouse') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 24 * scale, 12), mat(0xe8e2d4));
      base.position.y = 12 * scale; g.add(base);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.9, 5, 12), mat(0xc03828));
      band.position.y = 12 * scale; g.add(band);
      const lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 3.4, 10), mat(0x333840));
      lampRoom.position.y = 24 * scale + 1.7; g.add(lampRoom);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff4c0 }));
      lamp.position.y = 24 * scale + 1.7; g.add(lamp);
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
      const beams = new THREE.Group();
      for (const s of [1, -1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 4.5, 90, 8, 1, true), beamMat);
        beam.rotation.z = s * Math.PI / 2;
        beam.position.x = s * 45;
        beams.add(beam);
      }
      beams.position.y = 24 * scale + 1.7;
      g.add(beams);
      this.animFns.push((t) => { beams.rotation.y = t * 0.55; });
    } else if (lm.fam === 'pyramid') {
      const geo = new THREE.ConeGeometry(20 * scale, 26 * scale, 4);
      const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x50e8d8, transparent: true, opacity: 0.8 }));
      wire.position.y = 13 * scale;
      g.add(wire);
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(3), new THREE.MeshBasicMaterial({ color: 0x80fff0 }));
      g.add(orb);
      this.animFns.push((t) => {
        orb.position.y = 13 * scale + Math.sin(t * 0.8) * 5;
        orb.rotation.y = t * 0.7;
        wire.material.opacity = 0.5 + Math.sin(t * 1.7) * 0.3;
      });
    }
    this.scene.add(g);
    this.landmarkPoi = {
      pos: new THREE.Vector3(x, y, z).add(new THREE.Vector3(Math.cos(a + 2.2), 0, Math.sin(a + 2.2)).multiplyScalar(55)).setY(y + 26 * scale),
      look: new THREE.Vector3(x, y + 16 * scale, z),
      name: lm.name, kind: 'landmark',
    };
  }

  // ── precipitation ──────────────────────────────────────────────────────────
  _precip() {
    const { weather } = this.spec;
    if (!weather.precip) return;
    const snow = weather.precip === 2;
    const N = 800;
    const pos = new Float32Array(N * 3);
    const r = this.spec.rand('precip');
    for (let i = 0; i < N; i++) {
      pos[i * 3] = r.range(-200, 200);
      pos[i * 3 + 1] = r.range(0, 120);
      pos[i * 3 + 2] = r.range(-200, 200);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: snow ? 0xffffff : 0x9fb8d8, size: snow ? 0.8 : 0.5,
      transparent: true, opacity: snow ? 0.9 : 0.55, depthWrite: false,
    });
    this.precipPts = new THREE.Points(g, m);
    this.precipPts.frustumCulled = false;
    this.precipSnow = snow;
    this.scene.add(this.precipPts);
  }

  // ── points of interest for the flythrough ─────────────────────────────────
  _pickPois() {
    const r = this.spec.rand('poi-pick');
    const all = [];
    const T = this.tallest;
    all.push({
      pos: new THREE.Vector3(T.x + 30, this.plateauY + T.h + 14, T.z + 30),
      look: new THREE.Vector3(T.x, this.plateauY + T.h * 0.85, T.z),
      name: 'the tallest tower', kind: 'tower',
    });
    if (this.landmarkPoi) all.push(this.landmarkPoi);
    for (const b of r.shuffle(this.billboardPois ?? []).slice(0, 2)) all.push(b);
    if (this.hasWater) {
      // find a shore point: march outward until below water
      const a = r.float() * Math.PI * 2;
      for (let rr = 60; rr < 380; rr += 10) {
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (this.terrainH(x, z) < this.waterY) {
          all.push({
            pos: new THREE.Vector3(x, this.waterY + 10, z),
            look: new THREE.Vector3(x * 0.4, this.waterY + 1, z * 0.4),
            name: 'the water', kind: 'water',
          });
          break;
        }
      }
    }
    if (this.signPoi) all.push(this.signPoi);
    if (this.displayPoi) all.push(this.displayPoi);
    if (this.vehicles.length) {
      const L = this.carLoop?.L ?? 75;
      all.push({
        pos: new THREE.Vector3(L + 14, this.plateauY + 7, -L - 14),
        look: new THREE.Vector3(L, this.plateauY + 1, 0),
        name: 'traffic', kind: 'traffic',
      });
    }
    const n = Math.min(all.length, 3 + r.int(0, 3));
    const chosen = r.shuffle(all).slice(0, Math.max(3, n));
    // order by angle around the city for a smooth loop
    chosen.sort((p, q) => Math.atan2(p.pos.z, p.pos.x) - Math.atan2(q.pos.z, q.pos.x));
    this.pois = chosen;
  }

  // ── per-frame ──────────────────────────────────────────────────────────────
  update(t, dt) {
    this.skyUniforms.uTime.value = t;
    if (this.waterUniforms) this.waterUniforms.uTime.value = t;
    if (this.doorGlow) this.doorGlow.opacity = 0.6 + Math.sin(t * 2.2) * 0.3;
    for (const d of this.displays ?? []) d.mat.uniforms.uTime.value = t;
    if (this.dataBoard) {
      this.dataBoard.acc += dt;
      if (this.dataBoard.acc > 1) {   // blink the colon, keep the clock honest
        this.dataBoard.acc = 0;
        drawDataBoard(this.dataBoard.canvas, this.spec, this.dataBoard.temp);
        this.dataBoard.tex.needsUpdate = true;
      }
    }
    for (const fn of this.animFns) fn(t);
    if (this.vehicles.length && this.carLoop) {
      for (const v of this.vehicles) this._placeVehicle(v, dt, this.carLoop.perim, this.carLoop.L);
      this.carBucket.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.precipPts) {
      const pos = this.precipPts.geometry.attributes.position;
      const speed = this.precipSnow ? 8 : 55;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - speed * dt * (0.7 + (i % 7) * 0.08);
        if (y < 0) y += 120;
        pos.setY(i, y);
        if (this.precipSnow) pos.setX(i, pos.getX(i) + Math.sin(t + i) * dt * 2);
      }
      pos.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
    for (const t of this.textures) t.dispose();
  }
}

// merge helper: list of geometries + optional alternating colours
function mergeGeomsRaw(geos) {
  let total = 0, itotal = 0;
  for (const g of geos) { total += g.attributes.position.count; itotal += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(total * 3), norm = new Float32Array(total * 3), col = new Float32Array(total * 3);
  const idx = new Uint32Array(itotal);
  let vo = 0, io = 0;
  for (const g of geos) {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    pos.set(p.array, vo * 3);
    if (n) norm.set(n.array, vo * 3);
    if (c) col.set(c.array, vo * 3);
    else for (let i = 0; i < p.count * 3; i++) col[vo * 3 + i] = 1;
    const gi = g.index ? g.index.array : [...Array(p.count).keys()];
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
function mergeGeoms(geos, [colA, colB]) {
  const a = new THREE.Color(colA), b = new THREE.Color(colB);
  for (let k = 0; k < geos.length; k++) {
    const g = geos[k];
    const c = k < 18 ? a : b; // first entries are the road planes, rest dashes
    const arr = [];
    for (let i = 0; i < g.attributes.position.count; i++) arr.push(c.r, c.g, c.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  }
  return mergeGeomsRaw(geos);
}

export { CITY_R, WORLD_R };
