// Perf HUD. Answers one question: is the GPU coasting or drowning?

const BUDGET = 1000 / 60;

// The mid-phone gate from CLAUDE.md. Drives the amber/red warnings in the readout.
export const BUDGETS = { gpu: 11, cpu: 6, calls: 150, tris: 350e3, texMB: 60 };

const grade = f => (f > 1 ? 'bad' : f > 0.8 ? 'warn' : '');

class Ring {
  constructor(n = 90) { this.buf = new Float32Array(n); this.i = 0; this.n = 0; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.buf.length; this.n = Math.min(this.n + 1, this.buf.length); }
  get avg() { let s = 0; for (let i = 0; i < this.n; i++) s += this.buf[i]; return this.n ? s / this.n : 0; }
  sorted() { return Array.from(this.buf.slice(0, this.n)).sort((x, y) => x - y); }
  q(f) {
    if (!this.n) return 0;
    const a = this.sorted();
    return a[Math.min(a.length - 1, Math.floor(a.length * f))];
  }
  // 95th percentile — the number that actually decides whether it feels smooth
  get p95() { return this.q(0.95); }
  get med() { return this.q(0.5); }
  get max() { let m = 0; for (let i = 0; i < this.n; i++) m = Math.max(m, this.buf[i]); return m; }
}

export class Stats {
  constructor(renderer, el) {
    this.renderer = renderer;
    this.el = el;
    this.gl = renderer.getContext();
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.cpu = new Ring();
    this.gpu = new Ring();
    this.frame = new Ring();
    this.last = performance.now();
    this.cpuStart = 0;
    this.acc = 0;
    this.snapshot = null;
  }

  // Shader compile and texture bake land in the first frame or two; without this the boot
  // cost sits in the worst-frame readout forever.
  reset() {
    this.cpu = new Ring(); this.gpu = new Ring(); this.frame = new Ring();
    this.last = performance.now();
  }

  beginFrame() {
    const now = performance.now();
    this.frame.push(now - this.last);
    this.last = now;
    this.cpuStart = now;

    if (this.ext && this.pending.length < 4) {
      const q = this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
      this.activeQuery = q;
    }
  }

  endFrame(dt) {
    this.cpu.push(performance.now() - this.cpuStart);

    if (this.activeQuery) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.activeQuery);
      this.activeQuery = null;
    }
    this.drainQueries();

    this.acc += dt;
    if (this.acc > 0.25) { this.acc = 0; this.render(); }
  }

  drainQueries() {
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        this.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      }
      gl.deleteQuery(q);
    }
  }

  // Comfortable / tight / struggling, judged on whichever side is the bottleneck.
  verdict() {
    const worst = Math.max(this.gpu.p95, this.cpu.p95);
    if (!worst && !this.frame.n) return { label: 'measuring', cls: 'ok', load: 0 };

    // The bar shows GPU/CPU headroom. Observed frame time can only downgrade the word:
    // vsync pins a healthy frame at ~16.6 ms, so it is a bad headroom signal but a good
    // smoothness one — driver stalls show up here and in neither timer query.
    const load = worst / BUDGET;
    const miss = this.frame.p95 / BUDGET;
    let label = load < 0.55 ? 'coasting' : load < 0.8 ? 'comfortable' : load < 1 ? 'tight' : 'struggling';
    if (miss > 1.5) label = 'struggling';
    else if (miss > 1.06 && label !== 'struggling') label = 'tight';

    const cls = label === 'struggling' ? 'bad' : label === 'tight' ? 'warn' : 'ok';
    return { label, cls, load };
  }

  read() {
    const info = this.renderer.info;
    // median, not mean — a couple of 300 ms hitches make the mean report half the real rate
    const fps = this.frame.med ? 1000 / this.frame.med : 0;
    const v = this.verdict();
    return {
      fps,
      frameMs: this.frame.avg,
      frameP95: this.frame.p95,
      hitchMs: this.frame.max,
      cpuMs: this.cpu.avg,
      cpuP95: this.cpu.p95,
      gpuMs: this.gpu.avg,
      gpuP95: this.gpu.p95,
      gpuSupported: !!this.ext,
      calls: info.render.calls,
      tris: info.render.triangles,
      programs: info.programs ? info.programs.length : 0,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      texMB: this.texMB,
      dpr: this.renderer.getPixelRatio(),
      verdict: v.label,
      load: v.load,
    };
  }

  render() {
    const s = this.snapshot = this.read();
    const v = this.verdict();
    const bar = Math.min(100, s.load * 100);
    const gpuLine = s.gpuSupported
      ? `<b>${s.gpuP95.toFixed(1)}</b><s>ms gpu p95</s>`
      : `<b>—</b><s>gpu (no timer ext)</s>`;

    const cell = (val, label, used, budget) =>
      `<div class="${budget ? grade(used / budget) : ''}"><b>${val}</b><s>${label}</s></div>`;

    this.el.innerHTML = `
      <div class="perf-top ${v.cls}">
        <span class="perf-fps">${s.fps.toFixed(0)}<s>fps</s></span>
        <span class="perf-verdict">${v.label}</span>
      </div>
      <div class="perf-bar"><i class="${v.cls}" style="width:${bar}%"></i><u></u></div>
      <div class="perf-grid">
        <div class="${s.gpuSupported ? grade(s.gpuP95 / BUDGETS.gpu) : ''}">${gpuLine}</div>
        ${cell(s.cpuP95.toFixed(1), 'ms cpu p95', s.cpuP95, BUDGETS.cpu)}
        ${cell(s.calls, 'draw calls', s.calls, BUDGETS.calls)}
        ${cell(fmt(s.tris), 'triangles', s.tris, BUDGETS.tris)}
        ${cell(s.textures, 'textures')}
        ${cell(s.texMB ? s.texMB.toFixed(0) + 'MB' : '—', 'tex mem', s.texMB, BUDGETS.texMB)}
        ${cell(s.programs, 'shaders')}
        ${cell(s.hitchMs.toFixed(0), 'ms worst frame', s.hitchMs, BUDGET * 3)}
      </div>`;
  }
}

function fmt(n) {
  if (n > 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n > 1e3) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
}
