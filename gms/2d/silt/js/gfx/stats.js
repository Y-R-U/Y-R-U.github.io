// Perf HUD. Modelled on gms/3d/forge_test/js/engine/stats.js — same Ring, same
// p95-not-mean rule, same honesty rule: with no timer extension the GPU number
// reads "—", never a plausible-looking lie.

const FRAME_BUDGET = 1000 / 60;

// The mid-range-phone gate. Everything here is measured at dpr<=2 on a 1:2 board.
export const BUDGETS = { gpu: 11, cpu: 4, upload: 1.2, frame: FRAME_BUDGET, passes: 14 };

const grade = (f) => (f > 1 ? 'bad' : f > 0.8 ? 'warn' : '');

class Ring {
  constructor(n = 90) { this.buf = new Float32Array(n); this.i = 0; this.n = 0; }
  push(v) { this.buf[this.i] = v; this.i = (this.i + 1) % this.buf.length; this.n = Math.min(this.n + 1, this.buf.length); }
  get avg() { let s = 0; for (let i = 0; i < this.n; i++) s += this.buf[i]; return this.n ? s / this.n : 0; }
  q(f) {
    if (!this.n) return 0;
    const a = Array.from(this.buf.slice(0, this.n)).sort((x, y) => x - y);
    return a[Math.min(a.length - 1, Math.floor(a.length * f))];
  }
  get p95() { return this.q(0.95); }
  get med() { return this.q(0.5); }
  get max() { let m = 0; for (let i = 0; i < this.n; i++) m = Math.max(m, this.buf[i]); return m; }
}

export class Stats {
  constructor(gl) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.pending = [];
    this.activeQuery = null;
    this.cpu = new Ring();
    this.gpu = new Ring();
    this.frame = new Ring();
    this.upload = new Ring();
    this.last = performance.now();
    this.cpuStart = 0;
    this.passes = 0;
    this.motes = 0;
    this.tier = 'high';
  }

  // Shader compile and the first texture upload land in frame 0-2. Without this
  // the boot cost sits in the worst-frame readout forever.
  reset() { this.cpu = new Ring(); this.gpu = new Ring(); this.frame = new Ring(); this.upload = new Ring(); this.last = performance.now(); }

  beginFrame() {
    const now = performance.now();
    this.frame.push(now - this.last);
    this.last = now;
    this.cpuStart = now;
    if (this.ext && this.pending.length < 4 && !this.activeQuery) {
      const q = this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
      this.activeQuery = q;
    }
  }

  markUpload(ms) { this.upload.push(ms); }

  endFrame() {
    this.cpu.push(performance.now() - this.cpuStart);
    if (this.activeQuery) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.activeQuery);
      this.activeQuery = null;
    }
    this.drain();
  }

  drain() {
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

  verdict() {
    const worst = Math.max(this.gpu.p95, this.cpu.p95);
    if (!worst && !this.frame.n) return { label: 'measuring', cls: 'ok', load: 0 };
    const load = worst / FRAME_BUDGET;
    const miss = this.frame.p95 / FRAME_BUDGET;
    let label = load < 0.55 ? 'coasting' : load < 0.8 ? 'comfortable' : load < 1 ? 'tight' : 'struggling';
    if (miss > 1.5) label = 'struggling';
    else if (miss > 1.06 && label !== 'struggling') label = 'tight';
    return { label, cls: label === 'struggling' ? 'bad' : label === 'tight' ? 'warn' : 'ok', load };
  }

  read() {
    const v = this.verdict();
    return {
      fps: this.frame.med ? 1000 / this.frame.med : 0,
      frameMs: this.frame.avg,
      frameP95: this.frame.p95,
      hitchMs: this.frame.max,
      cpuMs: this.cpu.avg,
      cpuP95: this.cpu.p95,
      gpuMs: this.gpu.avg,
      gpuP95: this.gpu.p95,
      gpuSupported: !!this.ext,
      uploadMs: this.upload.avg,
      passes: this.passes,
      motes: this.motes,
      tier: this.tier,
      verdict: v.label,
      load: v.load,
    };
  }

  /** Optional in-page readout. The game shell may ignore this entirely. */
  html() {
    const s = this.read();
    const v = this.verdict();
    const bar = Math.min(100, s.load * 100);
    const cell = (val, label, used, budget) =>
      `<div class="${budget ? grade(used / budget) : ''}"><b>${val}</b><s>${label}</s></div>`;
    return `
      <div class="perf-top ${v.cls}">
        <span class="perf-fps">${s.fps.toFixed(0)}<s>fps</s></span>
        <span class="perf-verdict">${v.label} · ${s.tier}</span>
      </div>
      <div class="perf-bar"><i class="${v.cls}" style="width:${bar}%"></i></div>
      <div class="perf-grid">
        <div class="${s.gpuSupported ? grade(s.gpuP95 / BUDGETS.gpu) : ''}">
          <b>${s.gpuSupported ? s.gpuP95.toFixed(1) : '—'}</b><s>${s.gpuSupported ? 'ms gpu p95' : 'gpu (no timer ext)'}</s></div>
        ${cell(s.cpuP95.toFixed(1), 'ms cpu p95', s.cpuP95, BUDGETS.cpu)}
        ${cell(s.uploadMs.toFixed(2), 'ms grid upload', s.uploadMs, BUDGETS.upload)}
        ${cell(s.frameP95.toFixed(1), 'ms frame p95', s.frameP95, BUDGETS.frame)}
        ${cell(s.passes, 'passes', s.passes, BUDGETS.passes)}
        ${cell(s.motes, 'motes')}
      </div>`;
  }
}
