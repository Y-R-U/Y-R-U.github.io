/* Pooled particle system. CPU simulation into a single interleaved instance buffer, one
 * instanced draw call per system. Flow is sampled from a pre-baked curl-noise grid rather than
 * evaluated per particle — that is the difference between 20k embers at 60fps and 4k at 30.
 */

import { makeRng, fbm2, sat, clamp } from './util.js';
import { makeProgram } from './gl.js';

export const MODE = { FREE: 0, ATTRACT: 1, ORBIT: 2 };

const STRIDE = 24;   // floats per particle in the sim array
const I_STRIDE = 8;  // floats per particle uploaded to the GPU

const F = {
  px: 0, py: 1, vx: 2, vy: 3, tx: 4, ty: 5, age: 6, ttl: 7,
  s0: 8, s1: 9, r0: 10, g0: 11, b0: 12, a0: 13, r1: 14, g1: 15, b1: 16, a1: 17,
  grav: 18, drag: 19, flow: 20, att: 21, mode: 22, seed: 23,
};

/* ── curl field ───────────────────────────────────────────────────────────── */

const GRID = 96;
const field = new Float32Array(GRID * GRID * 2);
{
  const e = 0.6;
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const u = x * 0.11, v = y * 0.11;
      const n1 = fbm2(u, v + e, 3), n2 = fbm2(u, v - e, 3);
      const n3 = fbm2(u + e, v, 3), n4 = fbm2(u - e, v, 3);
      const i = (y * GRID + x) * 2;
      field[i] = (n1 - n2) / (2 * e);
      field[i + 1] = -(n3 - n4) / (2 * e);
    }
  }
}

const FIELD_SCALE = 1 / 220;   // world px per field cell
function sampleFlow(x, y, out) {
  let fx = x * FIELD_SCALE, fy = y * FIELD_SCALE;
  fx -= Math.floor(fx / GRID) * GRID; fy -= Math.floor(fy / GRID) * GRID;
  const x0 = fx | 0, y0 = fy | 0;
  const x1 = (x0 + 1) % GRID, y1 = (y0 + 1) % GRID;
  const tx = fx - x0, ty = fy - y0;
  const i00 = (y0 * GRID + x0) * 2, i10 = (y0 * GRID + x1) * 2;
  const i01 = (y1 * GRID + x0) * 2, i11 = (y1 * GRID + x1) * 2;
  const a = field[i00] + (field[i10] - field[i00]) * tx;
  const b = field[i01] + (field[i11] - field[i01]) * tx;
  const c = field[i00 + 1] + (field[i10 + 1] - field[i00 + 1]) * tx;
  const d = field[i01 + 1] + (field[i11 + 1] - field[i01 + 1]) * tx;
  out[0] = a + (b - a) * ty;
  out[1] = c + (d - c) * ty;
}

/* ── shaders ──────────────────────────────────────────────────────────────── */

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 iPos;
layout(location=1) in float iSize;
layout(location=2) in vec4 iCol;
layout(location=3) in float iRot;
uniform vec4 uCam;      // x, y, zoomX, zoomY  (world -> clip)
out vec2 vUv;
out vec4 vCol;
void main(){
  vec2 corner = vec2((gl_VertexID==0||gl_VertexID==3||gl_VertexID==5)?-1.0:1.0,
                     (gl_VertexID==0||gl_VertexID==1||gl_VertexID==3)?-1.0:1.0);
  vUv = corner*0.5+0.5;
  vCol = iCol;
  float c = cos(iRot), s = sin(iRot);
  vec2 off = vec2(corner.x*c - corner.y*s, corner.x*s + corner.y*c) * iSize;
  vec2 world = iPos + off;
  gl_Position = vec4((world - uCam.xy) * uCam.zw, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv; in vec4 vCol;
uniform sampler2D uTex;
out vec4 frag;
void main(){
  float m = texture(uTex, vUv).a;
  frag = vec4(vCol.rgb * vCol.a * m, vCol.a * m);
}`;

/* ── system ───────────────────────────────────────────────────────────────── */

export class ParticleSystem {
  constructor(gl, max, tex) {
    this.gl = gl; this.max = max; this.tex = tex;
    this.n = 0;
    this.d = new Float32Array(max * STRIDE);
    this.inst = new Float32Array(max * I_STRIDE);
    this.rng = makeRng(1337);
    this._tmp = [0, 0];
    this.time = 0;

    this.prog = makeProgram(gl, VS, FS, 'particles');
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    const S = I_STRIDE * 4;
    const attr = (loc, size, off) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, S, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    };
    attr(0, 2, 0); attr(1, 1, 2); attr(2, 4, 3); attr(3, 1, 7);
    gl.bindVertexArray(null);
  }

  clear() { this.n = 0; }

  get count() { return this.n; }

  /* opts: x,y (or shape), count, plus ranges as [min,max] or scalars */
  emit(count, o) {
    const d = this.d, rng = this.rng;
    const rv = (v, def) => {
      if (v == null) return def;
      return Array.isArray(v) ? v[0] + (v[1] - v[0]) * rng() : v;
    };
    for (let k = 0; k < count; k++) {
      if (this.n >= this.max) break;
      const i = this.n++ * STRIDE;
      let x = rv(o.x, 0), y = rv(o.y, 0);
      let vx = 0, vy = 0;
      const sp = rv(o.speed, 0);
      switch (o.shape) {
        case 'disc': {
          const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rv(o.radius, 100);
          x += Math.cos(a) * r; y += Math.sin(a) * r * (o.squash ?? 1);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
          break;
        }
        case 'ring': {
          const a = rng() * Math.PI * 2, r = rv(o.radius, 100) * (0.94 + rng() * 0.12);
          x += Math.cos(a) * r; y += Math.sin(a) * r * (o.squash ?? 1);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp * (o.squash ?? 1);
          break;
        }
        case 'line': {
          const t = rng();
          x = o.x0 + (o.x1 - o.x0) * t + (rng() - 0.5) * (o.jitter ?? 0);
          y = o.y0 + (o.y1 - o.y0) * t + (rng() - 0.5) * (o.jitter ?? 0);
          const a = rv(o.angle, 0) + (rng() - 0.5) * rv(o.spread, 0);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
          break;
        }
        case 'rect': {
          x += (rng() - 0.5) * rv(o.w, 0); y += (rng() - 0.5) * rv(o.h, 0);
          const a = rv(o.angle, 0) + (rng() - 0.5) * rv(o.spread, 0);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
          break;
        }
        default: {
          const a = rv(o.angle, rng() * Math.PI * 2) + (rng() - 0.5) * rv(o.spread, 0);
          vx = Math.cos(a) * sp; vy = Math.sin(a) * sp;
        }
      }
      vx += rv(o.vx, 0); vy += rv(o.vy, 0);
      const c0 = o.color || [1, 1, 1, 1];
      const c1 = o.color2 || [c0[0], c0[1], c0[2], 0];
      const jc = o.colorJitter ?? 0;
      const j = 1 + (rng() - 0.5) * jc;

      d[i + F.px] = x; d[i + F.py] = y;
      d[i + F.vx] = vx; d[i + F.vy] = vy;
      if (o.targets) {
        const ti = ((o.targetOffset ?? 0) + k) % (o.targets.length >> 1);
        d[i + F.tx] = o.targets[ti * 2]; d[i + F.ty] = o.targets[ti * 2 + 1];
      } else { d[i + F.tx] = rv(o.tx, x); d[i + F.ty] = rv(o.ty, y); }
      d[i + F.age] = 0;
      d[i + F.ttl] = rv(o.life, 2);
      d[i + F.s0] = rv(o.size, 6); d[i + F.s1] = rv(o.sizeEnd, d[i + F.s0] * 0.4);
      d[i + F.r0] = c0[0] * j; d[i + F.g0] = c0[1] * j; d[i + F.b0] = c0[2] * j; d[i + F.a0] = c0[3];
      d[i + F.r1] = c1[0] * j; d[i + F.g1] = c1[1] * j; d[i + F.b1] = c1[2] * j; d[i + F.a1] = c1[3];
      d[i + F.grav] = rv(o.gravity, 0);
      d[i + F.drag] = rv(o.drag, 0.6);
      d[i + F.flow] = rv(o.flow, 0);
      d[i + F.att] = rv(o.attract, 0);
      d[i + F.mode] = o.mode ?? MODE.FREE;
      d[i + F.seed] = rng() * 1000;
    }
  }

  // Retarget every live particle — used to snap the title into shape and to blow it apart.
  retarget(targets, mode, attract, filter) {
    const d = this.d;
    const m = targets ? targets.length >> 1 : 0;
    let t = 0;
    for (let p = 0; p < this.n; p++) {
      const i = p * STRIDE;
      if (filter && !filter(d[i + F.px], d[i + F.py], p)) continue;
      if (m) { d[i + F.tx] = targets[(t % m) * 2]; d[i + F.ty] = targets[(t % m) * 2 + 1]; t++; }
      d[i + F.mode] = mode;
      if (attract != null) d[i + F.att] = attract;
    }
  }

  forEach(fn) {
    const d = this.d;
    for (let p = 0; p < this.n; p++) {
      const i = p * STRIDE;
      fn(d, i, p);
    }
  }

  push(x, y, fx, fy, radius) {
    const d = this.d, r2 = radius * radius;
    for (let p = 0; p < this.n; p++) {
      const i = p * STRIDE;
      const dx = d[i + F.px] - x, dy = d[i + F.py] - y;
      const q = dx * dx + dy * dy;
      if (q > r2) continue;
      const k = 1 - Math.sqrt(q) / radius;
      const inv = 1 / (Math.sqrt(q) || 1);
      d[i + F.vx] += dx * inv * fx * k;
      d[i + F.vy] += dy * inv * fy * k;
    }
  }

  update(dt, drift = 0) {
    this.time += dt;
    const d = this.d, tmp = this._tmp;
    let n = this.n;
    const dx = drift * this.time;
    for (let p = 0; p < n; p++) {
      const i = p * STRIDE;
      const age = (d[i + F.age] += dt);
      if (age >= d[i + F.ttl]) {
        n--;
        if (p !== n) d.copyWithin(i, n * STRIDE, n * STRIDE + STRIDE);
        p--;
        continue;
      }
      const mode = d[i + F.mode];
      let vx = d[i + F.vx], vy = d[i + F.vy];

      if (d[i + F.flow] !== 0) {
        sampleFlow(d[i + F.px] + dx, d[i + F.py] + d[i + F.seed] * 0.02, tmp);
        vx += tmp[0] * d[i + F.flow] * dt;
        vy += tmp[1] * d[i + F.flow] * dt;
      }
      if (mode === MODE.ATTRACT) {
        const k = d[i + F.att];
        vx += (d[i + F.tx] - d[i + F.px]) * k * dt;
        vy += (d[i + F.ty] - d[i + F.py]) * k * dt;
      } else if (mode === MODE.ORBIT) {
        const ox = d[i + F.tx] - d[i + F.px], oy = d[i + F.ty] - d[i + F.py];
        const k = d[i + F.att];
        vx += (-oy * 1.4 + ox * 0.35) * k * dt;
        vy += (ox * 1.4 + oy * 0.35) * k * dt;
      }
      vy += d[i + F.grav] * dt;
      const damp = Math.exp(-d[i + F.drag] * dt);
      vx *= damp; vy *= damp;
      d[i + F.vx] = vx; d[i + F.vy] = vy;
      d[i + F.px] += vx * dt;
      d[i + F.py] += vy * dt;
    }
    this.n = n;
  }

  build() {
    const d = this.d, o = this.inst;
    const n = this.n;
    for (let p = 0; p < n; p++) {
      const i = p * STRIDE, j = p * I_STRIDE;
      const t = d[i + F.age] / d[i + F.ttl];
      // fade in fast, out slow — no popping
      const fade = Math.min(1, t * 12) * (1 - t * t);
      o[j] = d[i + F.px]; o[j + 1] = d[i + F.py];
      o[j + 2] = d[i + F.s0] + (d[i + F.s1] - d[i + F.s0]) * t;
      o[j + 3] = d[i + F.r0] + (d[i + F.r1] - d[i + F.r0]) * t;
      o[j + 4] = d[i + F.g0] + (d[i + F.g1] - d[i + F.g0]) * t;
      o[j + 5] = d[i + F.b0] + (d[i + F.b1] - d[i + F.b0]) * t;
      o[j + 6] = (d[i + F.a0] + (d[i + F.a1] - d[i + F.a0]) * t) * fade;
      o[j + 7] = d[i + F.seed] + d[i + F.age] * 2.0;
    }
    return n;
  }

  draw(camX, camY, zx, zy) {
    const n = this.build();
    if (!n) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * I_STRIDE);
    this.prog.use().v4('uCam', camX, camY, zx, zy).tex('uTex', this.tex, 0);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    gl.bindVertexArray(null);
  }

  free() {
    const gl = this.gl;
    gl.deleteBuffer(this.buf); gl.deleteVertexArray(this.vao); this.prog.free();
  }
}

export { F as FIELD };
