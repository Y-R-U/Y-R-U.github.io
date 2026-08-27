// Additive motes thrown off a dissolving chain. A garnish on top of the shader
// erosion, not the effect itself — if these were switched off the dissolve
// would still read.

const STRIDE = 8;   // x, y, size, life | r, g, b, intensity

export class Motes {
  constructor(gl, max = 900) {
    this.gl = gl;
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
    this.px = new Float32Array(max);      // board uv x
    this.py = new Float32Array(max);
    this.vx = new Float32Array(max);
    this.vy = new Float32Array(max);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alive = 0;
    this.spawnAcc = 0;

    this.vbo = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, STRIDE * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 16);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  /**
   * @param sb   packed StateBuffer (holds this frame's dissolving cell list)
   * @param rate motes per second per 100 dissolving cells
   */
  emit(sb, dt, cols, rows, colour, rate, rng) {
    if (!sb.clearN) return;
    this.spawnAcc += dt * rate * (sb.clearN / 100);
    let want = Math.min(this.spawnAcc | 0, this.max - this.alive, 64);
    if (want <= 0) return;
    this.spawnAcc -= want;
    while (want-- > 0) {
      const i = this.alive++;
      const ci = sb.clearCells[(rng() * sb.clearN) | 0];
      const cx = ci % cols, cy = (ci / cols) | 0;
      this.px[i] = (cx + rng()) / cols;
      this.py[i] = 1 - (cy + rng()) / rows;
      this.vx[i] = (rng() - 0.5) * 0.10;
      this.vy[i] = 0.10 + rng() * 0.30;
      const lf = 0.35 + rng() * 0.7;
      this.life[i] = lf; this.maxLife[i] = lf;
      this.size[i] = 1.4 + rng() * 3.6;
      const j = rng();
      this.col[i * 3] = colour[0] * (0.75 + j * 0.6);
      this.col[i * 3 + 1] = colour[1] * (0.70 + j * 0.55);
      this.col[i * 3 + 2] = colour[2] * (0.65 + j * 0.5);
    }
  }

  step(dt) {
    for (let i = 0; i < this.alive; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.alive;
        if (l !== i) {
          this.px[i] = this.px[l]; this.py[i] = this.py[l];
          this.vx[i] = this.vx[l]; this.vy[i] = this.vy[l];
          this.life[i] = this.life[l]; this.maxLife[i] = this.maxLife[l];
          this.size[i] = this.size[l];
          this.col[i * 3] = this.col[l * 3];
          this.col[i * 3 + 1] = this.col[l * 3 + 1];
          this.col[i * 3 + 2] = this.col[l * 3 + 2];
        }
        i--;
        continue;
      }
      this.vy[i] += (0.16 - this.vy[i] * 1.5) * dt;      // buoyant, then drag
      this.vx[i] *= 1 - 1.6 * dt;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
    }
  }

  /** @param rect board rect in screen uv, [x, y, w, h] */
  upload(rect, dprScale) {
    const d = this.data;
    for (let i = 0; i < this.alive; i++) {
      const o = i * STRIDE;
      const k = this.life[i] / this.maxLife[i];
      d[o] = rect[0] + this.px[i] * rect[2];
      d[o + 1] = rect[1] + this.py[i] * rect[3];
      d[o + 2] = this.size[i] * dprScale * (0.4 + k * 0.9);
      d[o + 3] = k;
      d[o + 4] = this.col[i * 3];
      d[o + 5] = this.col[i * 3 + 1];
      d[o + 6] = this.col[i * 3 + 2];
      // fade in fast, out slow — a spark that pops on at full brightness reads as a bug
      d[o + 7] = Math.min(1, (1 - k) * 8) * k * k * 1.6;
    }
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.alive * STRIDE);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  dispose() {
    this.gl.deleteBuffer(this.vbo);
    this.gl.deleteVertexArray(this.vao);
  }
}
